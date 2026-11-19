import { createServer } from 'node:http'
import { createHash, timingSafeEqual } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const protocol = 'luma-office/1'
const digest = text => createHash('sha256').update(text).digest()
const uuid = /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i
function checkedText(value, max) {
  if (typeof value !== 'string' || !value.trim() || value.length > max || value.includes('\0')) throw Error('invalid')
  return value.trim()
}
function csvCell(value) {
  const safe = /^[\s]*[=+@\-]/.test(value) ? "'" + value : value
  return '"' + safe.replaceAll('"', '""') + '"'
}
async function boundedJson(response) {
  const reader = response.body?.getReader()
  if (!reader) throw Error('empty result')
  const chunks = []
  let size = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.length
    if (size > 512000) { await reader.cancel(); throw Error('result too large') }
    chunks.push(value)
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

// The optional writing model receives plain text and has no tools or file access.
export function createOfficeWorker({ token, dataDir, modelUrl, model, modelToken }) {
  if (typeof token !== 'string' || token.length < 24 || /\s/.test(token)) throw Error('请设置至少 24 位的 LUMA_WORKER_TOKEN。')
  if (modelUrl || model) {
    const u = new URL(modelUrl)
    if (!model || !['https:', 'http:'].includes(u.protocol) || (u.protocol === 'http:' && !['localhost','127.0.0.1','[::1]'].includes(u.hostname)) || u.username || u.password || u.search || u.hash)
      throw Error('写作模型需要有效的模型名称及 HTTPS 或本机 HTTP 服务地址。')
  }
  mkdirSync(dataDir, { recursive: true, mode: 0o700 })
  const db = new DatabaseSync(resolve(dataDir, 'office-jobs.sqlite3'))
  db.exec("PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY, signature TEXT NOT NULL, state TEXT NOT NULL, result TEXT NOT NULL); UPDATE jobs SET state='failed' WHERE state='running';")
  const select = db.prepare('SELECT * FROM jobs WHERE id=?')
  const finish = db.prepare("UPDATE jobs SET state=?, result=? WHERE id=? AND state='running'")
  const kinds = ['document', 'checklist', ...(model ? ['draft'] : [])]
  const tasks = new Set()
  const controllers = new Map()
  let closing = false
  async function perform(id, job, controller) {
    try {
      let content
      if (job.kind === 'draft') {
        const response = await fetch(modelUrl.replace(/\/+$/, '') + '/chat/completions', {
          method: 'POST', redirect: 'error', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(90_000)]),
          headers: { 'Content-Type':'application/json', ...(modelToken ? {Authorization:'Bearer ' + modelToken} : {}) },
          body: JSON.stringify({ model, messages: [
            {role:'system', content:'你是办公文档编辑。根据用户材料写作，不编造事实。直接给出 Markdown 正文。'},
            {role:'user', content:job.name + '的任务：' + job.text}
          ], max_tokens:2400, stream:false })
        })
        if (!response.ok) throw Error('model failed')
        content = checkedText((await boundedJson(response))?.choices?.[0]?.message?.content, 60000)
      } else if (job.kind === 'checklist') {
        const lines = job.text.split(/\r?\n/).map(line => line.trim()).filter(Boolean)
        content = '\ufeff任务,负责人,状态\r\n' + lines.map(line => {
          const done = /^\s*(?:[-*]\s*)?\[x\]/i.test(line)
          const label = line.replace(/^(?:[-*]\s+|\d+[.)、]\s*)?(?:\[[xX ]\]\s*)?/, '')
          return [label, job.name, done ? '完成' : '待办'].map(csvCell).join(',')
        }).join('\r\n') + '\r\n'
      } else {
        content = '# ' + job.title + '\n\n负责人：' + job.name + '\n\n' + job.text + '\n'
      }
      if (content.length > 80000) throw Error('result too large')
      finish.run('done', content, id)
    } catch { finish.run('failed', '', id) }
  }
  const server = createServer(async (req, res) => {
    const send = (status, body) => {
      res.writeHead(status, {'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff'})
      res.end(JSON.stringify(body))
    }
    if (!timingSafeEqual(digest(req.headers.authorization ?? ''), digest('Bearer ' + token))) return send(401, {})
    if (req.method === 'GET' && req.url === '/v1/status') return send(200, {protocol, kinds})
    const id = req.url?.match(/^\/v1\/jobs\/([a-f\d-]+)$/i)?.[1]
    if (!id || !uuid.test(id)) return send(404, {})
    try {
      let row = select.get(id)
      if (req.method === 'DELETE') {
        // A timed-out PUT can arrive after the cancellation. Reserve the ID
        // even when no submission has reached the worker yet.
        db.prepare("INSERT OR IGNORE INTO jobs VALUES(?,'','cancelled','')").run(id)
        finish.run('cancelled','',id)
        controllers.get(id)?.abort()
        row = select.get(id)
      } else if (req.method === 'PUT') {
        if (closing) return send(503, {})
        const chunks = []
        let size = 0
        for await (const chunk of req) {
          size += chunk.length
          if (size > 160000) return send(413, {})
          chunks.push(chunk)
        }
        const input = JSON.parse(Buffer.concat(chunks).toString('utf8'))
        if (!kinds.includes(input.kind)) return send(422, {})
        const job = {kind:input.kind, name:checkedText(input.name,80), title:checkedText(input.title,100), text:checkedText(input.text,24000)}
        const signature = digest(JSON.stringify(job)).toString('hex')
        row = select.get(id)
        if (row && row.state !== 'cancelled' && row.signature !== signature) return send(409, {})
        if (!row) {
          if (tasks.size >= 8) return send(429, {})
          db.prepare("INSERT INTO jobs VALUES(?,?,'running','')").run(id, signature)
          const controller = new AbortController()
          controllers.set(id,controller)
          const task = perform(id, job, controller)
          tasks.add(task)
          void task.finally(() => {tasks.delete(task);controllers.delete(id)})
        }
        row = select.get(id)
      } else if (req.method !== 'GET') return send(405, {})
      if (!row) return send(404, {})
      send(200, {protocol, id, status:row.state, output:row.result})
    } catch { send(400, {}) }
  })
  server.headersTimeout = 15_000
  server.requestTimeout = 30_000
  return {server, async close() {
    closing = true
    if (server.listening) await new Promise(resolveClose => server.close(resolveClose))
    await Promise.allSettled([...tasks])
    db.close()
  }}
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const worker = createOfficeWorker({token:process.env.LUMA_WORKER_TOKEN, dataDir:resolve(process.env.LUMA_WORKER_DATA || 'luma-office-data'),
    modelUrl:process.env.LUMA_WORKER_MODEL_URL, model:process.env.LUMA_WORKER_MODEL, modelToken:process.env.LUMA_WORKER_MODEL_KEY})
  const port = Number(process.env.LUMA_WORKER_PORT || 8795)
  worker.server.listen(port, '127.0.0.1', () => console.log('Luma 云办公工作器已启动，监听 127.0.0.1:' + port))
  const stop = () => { void worker.close().then(() => process.exit(0)) }
  process.once('SIGTERM', stop)
  process.once('SIGINT', stop)
}

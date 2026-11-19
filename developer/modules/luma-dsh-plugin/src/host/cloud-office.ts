import type { DatabaseSync } from 'node:sqlite'

type Row = { id:string; role:string; server:string; title:string; kind:string; status:string; created:number; output:string; request:string }
type Connection = {url:string; secret:string}
const protocol = 'luma-office/1'
const kinds = ['document', 'checklist', 'draft']
const text = (input:unknown, max:number) => {
  if (typeof input !== 'string' || !input.trim() || input.includes('\0') || input.length > max) throw Error('云任务输入无效或过长。')
  return input.trim()
}
function address(input:unknown) {
  const url = new URL(text(input, 1024))
  if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost','127.0.0.1','[::1]'].includes(url.hostname))) || url.username || url.password || url.hash || url.search)
    throw Error('请填写 HTTPS 服务器地址，或本机 HTTP 地址。')
  return url.href.replace(/\/+$/, '')
}
type WorkerResult = {protocol?:string; kinds?:unknown; id?:unknown; status?:unknown; output?:unknown}

export function createCloudOffice(db:DatabaseSync, credential:(value:string, opening:boolean)=>string, role:(value:unknown)=>string) {
  db.exec("CREATE TABLE IF NOT EXISTS cloud_jobs(id TEXT PRIMARY KEY, role TEXT NOT NULL, server TEXT NOT NULL, title TEXT NOT NULL, kind TEXT NOT NULL, status TEXT NOT NULL, created INTEGER NOT NULL, output TEXT NOT NULL, request TEXT NOT NULL); CREATE INDEX IF NOT EXISTS cloud_role ON cloud_jobs(role,created DESC)")
  const config = ():Connection => {
    const row = db.prepare("SELECT value FROM integration WHERE id='cloudOffice'").get()
    return row ? JSON.parse(String(row.value)) : {url:'',secret:''}
  }
  const one = (id:string) => db.prepare('SELECT * FROM cloud_jobs WHERE id=?').get(id) as unknown as Row | undefined
  const checks = new Map<string,{next:number; confirmed:number; pending:boolean}>()
  let decrypted:{sealed:string;value:string}|undefined
  let disposed = false
  function view(row:Row) {
    return {id:row.id, role:row.role, title:row.title, kind:row.kind, status:row.status, created:row.created, server:row.server}
  }
  async function request(connection:Connection, path:string, payload?:string, cancel=false):Promise<WorkerResult> {
    if (!connection.url || !connection.secret) throw Error('请在插件设置中连接云办公服务器。')
    if (!decrypted || decrypted.sealed !== connection.secret) decrypted = {sealed:connection.secret, value:credential(connection.secret,true)}
    const response = await fetch(connection.url + '/v1/' + path, {
      method:cancel ? 'DELETE' : payload ? 'PUT' : 'GET', redirect:'error', signal:AbortSignal.timeout(12000),
      headers:{Authorization:'Bearer ' + decrypted.value, 'Content-Type':'application/json'}, ...(payload ? {body:payload} : {})
    }).catch(()=>{ throw Error('无法连接云办公服务器，请检查地址、网络或 HTTPS 证书。') })
    if (!response.ok) {
      await response.body?.cancel()
      if (response.status === 401 || response.status === 403) throw Error('云办公服务器拒绝了连接令牌。')
      if (response.status === 404) throw Error('服务器未找到工作器接口或这项任务。')
      if (response.status === 422) throw Error('这台服务器尚未配置所选的工作能力。')
      throw Error('云办公服务器返回 HTTP ' + response.status + '。')
    }
    const reader = response.body?.getReader()
    if (!reader) throw Error('服务器未返回结果。')
    const chunks:Buffer[] = []
    let size = 0
    for (;;) {
      const {done,value} = await reader.read()
      if (done) break
      size += value.length
      if (size > 512000) { await reader.cancel(); throw Error('服务器返回的文档过大。') }
      chunks.push(Buffer.from(value))
    }
    let result:WorkerResult
    try { result = JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch { throw Error('该地址没有返回 Luma 云办公协议。') }
    if (result?.protocol !== protocol) throw Error('该地址没有返回 Luma 云办公协议。')
    return result
  }
  async function call(action:string, body:Record<string,unknown>) {
    const c = config()
    if (action === 'cloudstate') return {url:c.url, hasToken:Boolean(c.secret),
      jobs:body.roleId ? (db.prepare('SELECT id, role, title, kind, status, created, server FROM cloud_jobs WHERE role=? ORDER BY created DESC, rowid DESC LIMIT 60').all(role(body.roleId)) as unknown as Row[]).map(view) : []}
    if (action === 'cloudconfigure') {
      const url = body.url === '' ? '' : address(body.url)
      const input = body.token === undefined || body.token === '' ? '' : text(body.token, 512)
      if (input && (input.length < 24 || /\s/.test(input))) throw Error('请填写服务器设置的完整令牌（至少 24 位）。')
      const secret = url ? (input ? credential(input, false) : url === c.url ? c.secret : '') : ''
      if (url && !secret) throw Error('首次连接或更换地址时需要提供服务器令牌。')
      db.prepare("INSERT OR REPLACE INTO integration VALUES('cloudOffice',?)").run(JSON.stringify({url,secret}))
      decrypted = undefined
      return {url,hasToken:Boolean(secret)}
    }
    if (action === 'cloudprobe') {
      const result = await request(c, 'status')
      return {kinds:Array.isArray(result.kinds) ? result.kinds.filter(k=>kinds.includes(k)) : []}
    }
    const owner = role(body.roleId)
    const id = text(body.id,36)
    if (!/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(id)) throw Error('云任务编号无效。')
    let row = one(id)
    if (row && row.role !== owner) throw Error('该任务属于其他员工。')
    if (action === 'cloudresult') {
      if (row?.status !== 'done') throw Error('交付物尚未完成。')
      return {output:row.output,kind:row.kind,title:row.title}
    }
    if (action === 'cloudsubmit') {
      if (body.server !== c.url) throw Error('云电脑连接已经变更，请核对新的服务器后重新提交。')
      const kind = text(body.kind,20)
      if (!kinds.includes(kind)) throw Error('未知的云任务类型。')
      const job = {kind,name:text(body.name,80),title:text(body.title,100),text:text(body.text,24000)}
      const payload = JSON.stringify(job)
      if (row && (row.request !== payload || row.server !== c.url)) throw Error('相同任务编号的内容或服务器已变更。')
      if (!row) {
        const check = await request(c, 'status')
        const latest = config()
        if (disposed || c.url !== latest.url || c.secret !== latest.secret) throw Error('探测期间云电脑连接已变更，本次材料未发送。')
        if (!Array.isArray(check.kinds) || !check.kinds.includes(kind)) throw Error('云电脑未启用此能力。AI 起草需要在工作器上配置模型。')
        db.prepare("INSERT OR IGNORE INTO cloud_jobs VALUES(?,?,?,?,?,'pending',?,'',?)").run(id,owner,c.url,job.title,kind,Date.now(),payload)
        row = one(id)
        if (!row || row.role !== owner || row.request !== payload || row.server !== c.url) throw Error('云任务编号冲突。')
      }
    }
    if (!row || !['cloudsubmit','cloudrefresh','cloudretry','cloudcancel'].includes(action)) throw Error('未找到云任务。')
    if (['done','failed','cancelled'].includes(row.status)) return view(row)
    if (row.server !== c.url) throw Error('请先切换到这项任务原来的服务器。')
    const payload = action === 'cloudsubmit' || action === 'cloudretry' ? row.request : undefined
    const result = await request(c,'jobs/' + id,payload,action === 'cloudcancel')
    if (disposed) throw Error('插件已停用。')
    if (result.id !== id || !['running','done','failed','cancelled'].includes(String(result.status)) ||
      typeof result.output !== 'string' || result.output.length > 80000 || (result.status === 'done' && !result.output.trim())) throw Error('服务器返回的任务结果无效。')
    db.prepare("UPDATE cloud_jobs SET status=?,output=? WHERE id=? AND status IN ('pending','running')").run(String(result.status), result.output, id)
    const fresh = one(id)!
    if (fresh.status === 'running') checks.set(id,{next:Date.now()+8000,confirmed:Date.now(),pending:false})
    else checks.delete(id)
    return view(fresh)
  }
  // The office can track a cloud employee even after their task dialog was closed.
  // A disconnected worker must not keep an employee busy indefinitely.
  function workingRoles() {
    const {url} = config()
    if (!url) return []
    const rows = db.prepare("SELECT id,role FROM cloud_jobs WHERE server=? AND status='running'").all(url)
    const now = Date.now()
    const roles = new Set<string>()
    for (const row of rows) {
      const id=String(row.id), roleId=String(row.role)
      const check = checks.get(id) ?? {next:0,confirmed:0,pending:false}
      if (now - check.confirmed < 60_000) roles.add(roleId)
      if (check.pending || now < check.next) continue
      check.pending=true; checks.set(id,check)
      void call('cloudrefresh',{id,roleId}).catch(()=>{check.next=Date.now()+20_000;check.pending=false})
    }
    return [...roles]
  }
  return Object.assign(call,{workingRoles,dispose(){disposed=true;decrypted=undefined;checks.clear()}})
}

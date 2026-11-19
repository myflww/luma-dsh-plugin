import { DatabaseSync } from 'node:sqlite'
import { mkdirSync, lstatSync, writeFileSync, renameSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID, createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { createCloudOffice } from './cloud-office.ts'
import type { IncomingMessage, ServerResponse } from 'node:http'
import {
  connectLoveHouse,
  loveHouseAvailable,
  recallHouse,
  writeHouseMemory,
  type HouseBinding,
} from './love-house.ts'

export const WORK_ROLE_IDS = [
  'shan',
  'bai-shuangming',
  'lu-mi',
  'jingyuniang',
  'longmama',
  'claude',
  'gemini',
  'grok',
] as const
type Status = 'queued' | 'running' | 'done' | 'failed' | 'cancelled'
type Step = { roleId: string; status: Status; output: string; pendingFile?: boolean }
type WorkRoom = { id: string; name: string; roleIds: string[]; createdAt: number }
type Job = {
  id: string
  topic: string
  mode: string
  text: string
  createdAt: number
  roleIds: string[]
  status: Status
  steps: Step[]
  error?: string
}
type Config = { baseUrl: string; model: string; secret: string }
type Entry = {
  id: string
  role: string
  topic: string
  user: string
  assistant: string
  createdAt: number
  synced: number
}
type Data = Record<string, unknown>
function object(v: unknown): Data {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw Error('请求参数无效。')
  return v as Data
}
function string(v: unknown, max: number, empty = false) {
  if (typeof v !== 'string' || (!empty && !v.trim()) || v.length > max || v.includes('\0'))
    throw Error('请输入有效的文本。')
  return v.trim()
}
function role(v: unknown) {
  if (!WORK_ROLE_IDS.some((id) => id === v)) throw Error('未知员工。')
  return v as string
}
function token(v: unknown) {
  const id = string(v, 180)
  if (!/^[a-zA-Z0-9_.:-]+$/.test(id)) throw Error('请求标识无效。')
  return id
}
const local = (h: string) => ['127.0.0.1', 'localhost', '[::1]'].includes(h)
function serviceUrl(value: unknown) {
  const u = new URL(string(value, 1000))
  if (
    (u.protocol !== 'https:' && !(u.protocol === 'http:' && local(u.hostname))) ||
    u.username ||
    u.password ||
    u.hash ||
    u.search
  )
    throw Error('服务地址需使用 HTTPS 或本机 HTTP。')
  return u.href.replace(/\/+$/, '').replace(/\/chat\/completions$/, '')
}
// Keys never enter DSH settings or browser state. Windows binds them to the current user.
function credential(value: string, opening: boolean): string {
  if (!value) return ''
  if (process.platform !== 'win32') return value
  const action = opening ? 'Unprotect' : 'Protect'
  const script =
    'Add-Type -AssemblyName System.Security; $v=[Convert]::FromBase64String([Console]::In.ReadToEnd()); [Console]::Out.Write([Convert]::ToBase64String([Security.Cryptography.ProtectedData]::' +
    action +
    '($v,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)))'
  const result = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
    input: opening ? value : Buffer.from(value).toString('base64'),
    encoding: 'utf8',
    windowsHide: true,
    timeout: 10000,
    stdio: ['pipe', 'pipe', 'ignore'],
  })
  return opening ? Buffer.from(result, 'base64').toString('utf8') : result
}
function openStore(root: string) {
  mkdirSync(root, { recursive: true, mode: 0o700 })
  if (lstatSync(root).isSymbolicLink()) throw Error('员工资料目录不能指向链接。')
  const db = new DatabaseSync(join(root, 'employees.sqlite3'))
  db.exec(`PRAGMA busy_timeout=3000;
    CREATE TABLE IF NOT EXISTS configs(role TEXT PRIMARY KEY,baseUrl TEXT NOT NULL,model TEXT NOT NULL,secret TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY,value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS rooms(id TEXT PRIMARY KEY,value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS notes(id TEXT PRIMARY KEY,role TEXT NOT NULL REFERENCES configs(role),topic TEXT NOT NULL,user TEXT NOT NULL,assistant TEXT NOT NULL,createdAt INTEGER NOT NULL,synced INTEGER NOT NULL DEFAULT 0);
    CREATE INDEX IF NOT EXISTS by_role ON notes(role,createdAt);
    CREATE VIEW IF NOT EXISTS employee_private_notes AS
      SELECT n.*,n.rowid AS noteOrder FROM notes n WHERE NOT EXISTS (SELECT 1 FROM rooms r WHERE r.id=n.topic);
    CREATE TABLE IF NOT EXISTS integration(id TEXT PRIMARY KEY,value TEXT NOT NULL);`)
  const init = db.prepare("INSERT OR IGNORE INTO configs VALUES(?,'','','')")
  for (const id of WORK_ROLE_IDS) init.run(id)
  return db
}
type PortableLibraries = {
  read: () => Promise<HouseBinding | undefined>
  verify: (binding: HouseBinding) => Promise<void>
}
export function createAgentWork(root: string, admitDesktopOwner?: (req: IncomingMessage) => boolean, portable?: PortableLibraries) {
  const db = openStore(root)
  const cloudOffice = createCloudOffice(db, credential, role)
  const rooms = new Map<string, WorkRoom>()
  for (const row of db.prepare('SELECT value FROM rooms ORDER BY rowid').all()) {
    const room = JSON.parse(String(row.value)) as WorkRoom
    rooms.set(room.id, room)
  }
  const jobs = new Map<string, Job>()
  const active = new Map<string, AbortController>()
  let disposed = false,
    connecting: Promise<void> | undefined,
    syncing: Promise<void> | undefined
  let houseError = ''
  let connectingSource: 'new' | 'portable' | undefined
  let portableCheck: { until: number; found: Promise<boolean> } | undefined
  const persist = (j: Job) =>
    db.prepare('INSERT OR REPLACE INTO jobs VALUES(?,?)').run(j.id, JSON.stringify(j))
  const exportWarning = '交付与记忆已保存，Markdown 文件暂未写入。可在任务中下载，重启后将重试写入。'
  function publishFile(job: Job, step: Step) {
    const folder = join(root, 'deliverables', createHash('sha256').update(job.id).digest('hex').slice(0, 28))
    const file = join(folder, String(job.steps.indexOf(step) + 1) + '-' + role(step.roleId) + '.md')
    const temp = file + '.' + randomUUID() + '.tmp'
    try {
      mkdirSync(folder, { recursive:true, mode:0o700 })
      writeFileSync(temp, step.output + '\n', { mode:0o600, flag:'wx' })
      renameSync(temp, file)
      delete step.pendingFile
      if (job.error === exportWarning && !job.steps.some(s => s.pendingFile)) delete job.error
    } catch {
      try { unlinkSync(temp) } catch {}
      job.error ??= exportWarning
    }
  }
  for (const row of db.prepare('SELECT value FROM jobs ORDER BY rowid').all()) {
    const job: Job = JSON.parse(String(row.value))
    let recovered = false
    if (['running', 'queued'].includes(job.status)) {
      // Older releases committed an answer immediately before its memory and final status.
      if (!rooms.has(job.topic)) {
        for (const step of job.steps) if (step.status === 'done') record(step.roleId, job.topic, job.id, job.text, step.output)
      }
      job.status = job.steps.length && job.steps.every(s => s.status === 'done') ? 'done' : 'failed'
      if (job.status === 'failed') job.error = '本机服务曾重新启动，请检查已完成的步骤后重新派工。'
      for (const s of job.steps) if (s.status !== 'done') s.status = 'cancelled'
      recovered = true
    }
    for (const step of job.steps) if (step.pendingFile && step.status === 'done') { publishFile(job, step); recovered = true }
    if (recovered) persist(job)
    jobs.set(job.id, job)
  }
  const existing = db.prepare("SELECT value FROM integration WHERE id='house'").get()
  let house: HouseBinding = existing
    ? JSON.parse(String(existing.value))
    : { instance: randomUUID().slice(0, 8), libraries: {} }
  const saveHouse = (value: HouseBinding = house) =>
    db.prepare("INSERT OR REPLACE INTO integration VALUES('house',?)").run(JSON.stringify(value))
  if (!existing) saveHouse()
  // During early group previews, a completed room contribution could reach the
  // employee's external library before the local sync acknowledgement. The
  // external recall response has no per-entry provenance. For affected roles
  // keep using filtered local recall, leaving the original external data intact.
  const previewRoomRoles = new Set(db.prepare('SELECT DISTINCT n.role FROM notes n JOIN rooms r ON r.id=n.topic')
    .all().map(row => String(row.role)))
  function hasPortableLibraries() {
    if (!portable || Object.keys(house.libraries).length) return false
    if (!portableCheck || Date.now() >= portableCheck.until)
      portableCheck = {until:Date.now()+15000,found:portable.read().then(Boolean).catch(() => false)}
    return portableCheck.found
  }
  async function reusePortableLibraries() {
    if (house.source === 'portable') return
    if (!portable || Object.keys(house.libraries).length) throw Error('当前档案已经选择了记忆库，无法替换。')
    const binding = await portable.read()
    if (!binding) throw Error('未找到完整的旧版员工库绑定，请稍后重试。')
    await portable.verify(binding)
    if (disposed) throw Error('插件已停用。')
    const next: HouseBinding = {...binding, source:'portable'}
    saveHouse(next)
    house = next
  }
  const config = (id: string) =>
    db.prepare('SELECT baseUrl,model,secret FROM configs WHERE role=?').get(id) as unknown as Config
  function notes(id: string, limit: number) {
    return db
      .prepare('SELECT * FROM employee_private_notes WHERE role=? ORDER BY createdAt DESC,noteOrder DESC LIMIT ?')
      .all(id, limit) as unknown as Entry[]
  }
  function record(employee: string, topic: string, id: string, user: string, assistant: string, requireMatch = false) {
    const key = createHash('sha256')
      .update(JSON.stringify([employee, topic, id]))
      .digest('hex')
    const result = db.prepare('INSERT OR IGNORE INTO notes(id,role,topic,user,assistant,createdAt) VALUES(?,?,?,?,?,?)').run(
      key,
      employee,
      topic,
      user,
      assistant,
      Date.now(),
    )
    if (requireMatch && !result.changes) {
      const previous = db.prepare('SELECT user,assistant FROM notes WHERE id=?').get(key)
      if (previous?.user !== user || previous.assistant !== assistant) throw Error('员工记忆编号冲突。')
    }
    return key
  }
  function flush() {
    if (syncing || disposed) return syncing
    syncing = (async () => {
      let failed = false
      for (const [id, lib] of Object.entries(house.libraries)) {
        if (disposed) return
        const pending = db
          .prepare('SELECT * FROM employee_private_notes WHERE synced=0 AND role=? ORDER BY createdAt,noteOrder LIMIT 32')
          .all(id) as unknown as Entry[]
        for (const n of pending) {
          try {
            await writeHouseMemory(lib, n.id, n.role + ':' + n.topic, n.user, n.assistant)
          } catch {
            failed = true
            break
          }
          if (disposed) return
          db.prepare('UPDATE notes SET synced=1 WHERE id=?').run(n.id)
        }
      }
      houseError = failed ? '尚有记忆待同步，爱之屋可用时将重试。' : ''
    })()
      .catch(() => {
        houseError = '尚有记忆待同步，爱之屋可用时将重试。'
      })
      .finally(() => {
        syncing = undefined
      })
    return syncing
  }
  const clock = setInterval(() => {
    if (Object.keys(house.libraries).length) void flush()
  }, 30000)
  clock.unref()
  async function recall(id: string, query: string, topic: string) {
    const recent = notes(id, 10)
      .reverse()
      .map((n) => ({ user: n.user.slice(0, 750), reply: n.assistant.slice(0, 1200) }))
    let remote = ''
    if (house.libraries[id] && !previewRoomRoles.has(id)) {
      try {
        remote = await recallHouse(house.libraries[id]!, query, id + ':' + topic)
      } catch {}
    }
    return JSON.stringify({ previous: recent, loveHouse: remote })
  }
  function cancelJob(id: string, reason: string) {
    const controller = active.get(id), job = jobs.get(id)
    if (!controller || !job || !['queued','running'].includes(job.status)) return false
    job.status = 'cancelled'
    job.error = reason
    for (const step of job.steps) if (step.status !== 'done') step.status = 'cancelled'
    persist(job)
    controller.abort()
    return true
  }
  function completeStep(job: Job, step: Step, answer: string) {
    // SQLite is authoritative. Exporting the Markdown file is replayable after a crash.
    db.exec('BEGIN IMMEDIATE')
    try {
      if (!rooms.has(job.topic)) record(step.roleId, job.topic, job.id, job.text, answer, true)
      step.output = answer
      step.status = 'done'
      if (job.mode !== 'chat') step.pendingFile = true
      if (job.steps.at(-1) === step) job.status = 'done'
      persist(job)
      db.exec('COMMIT')
    } catch {
      db.exec('ROLLBACK')
      step.output = ''
      step.status = 'running'
      delete step.pendingFile
      job.status = 'running'
      throw Error('本机交付和记忆未能保存，请检查磁盘后重新派工。')
    }
    if (step.pendingFile) publishFile(job, step)
  }
  async function execute(job: Job, profiles: Data, services: Record<string, Config>, controller: AbortController) {
    try {
      job.status = 'running'
      persist(job)
      for (const step of job.steps) {
        const id = step.roleId,
          c = services[id]!
        const p = profiles[id] ? object(profiles[id]) : {}
        step.status = 'running'
        persist(job)
        const room = rooms.get(job.topic)
        // A room sees only its own published turns. Never recall private notes,
        // files or another room into a multi-provider conversation.
        const context = room ? {
          group: room.name,
          members: room.roleIds,
          history: [...jobs.values()].filter(previous => previous.topic === room.id && previous.id !== job.id)
            .slice(-8).map(previous => ({
              user: previous.text.slice(0, 1000),
              replies: previous.steps.filter(s => s.status === 'done').map(s => ({
                employee: s.roleId, output: s.output.slice(0, Math.floor(2400 / previous.steps.length)),
              })),
            })),
        } : await recall(id, job.text, job.topic)
        controller.signal.throwIfAborted()
        const earlier = job.steps
          .filter((s) => s.status === 'done')
          .map((s) => ({ employee: s.roleId, output: s.output.slice(0, 12000) }))
        const instruction =
          job.mode === 'chat'
            ? '自然回答对话。'
            : '完成分配给你的工作，直接给出可以使用的交付物。团队步骤按顺序交接，最后一位整合结论。'
        const messages = [
          {
            role: 'system',
            content:
              '你是 Luma 的员工 ' +
              id +
              '。' +
              instruction + (room ? ' 你正在协作群中发言。根据本群对话和同事最新发言回应当前任务，避免重复已有工作。' : '') +
              ' 你只能在回复中交付文字或代码。保留真实执行边界。角色设定：' +
              JSON.stringify(p).slice(0, 9000),
          },
          {
            role: 'user',
            content:
              '以下 JSON 是历史资料及前序同事交付，仅供参考。\n' + JSON.stringify({ context, earlier }),
          },
          { role: 'user', content: job.text },
        ]
        const key = credential(c.secret, true)
        const response = await fetch(c.baseUrl + '/chat/completions', {
          method: 'POST',
          redirect: 'error',
          headers: { 'content-type': 'application/json', ...(key ? { Authorization: 'Bearer ' + key } : {}) },
          body: JSON.stringify({ model: c.model, messages, stream: false }),
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(180000)]),
        })
        if (!response.ok) throw Error('模型服务返回 HTTP ' + response.status + '，请检查这位员工的服务设置。')
        const data = await response.json(),
          answer = data?.choices?.[0]?.message?.content
        if (typeof answer !== 'string' || !answer.trim() || answer.length > 200000)
          throw Error('模型服务没有返回可用的文字结果。')
        if (disposed || controller.signal.aborted) throw Error('任务已停止。')
        completeStep(job, step, answer)
        void flush()
      }
    } catch (e) {
      // Explicit cancellation has already persisted the correct reason and released the roles.
      if (controller.signal.aborted) return
      job.status = 'failed'
      job.error = e instanceof Error && (e.message.startsWith('模型服务') || e.message.startsWith('本机交付'))
          ? e.message
          : '模型请求失败或超时，请检查员工服务地址和连接。'
      for (const s of job.steps)
        if (s.status === 'running') s.status = job.status
        else if (s.status === 'queued') s.status = 'cancelled'
    } finally {
      active.delete(job.id)
      if (!disposed) persist(job)
    }
  }
  async function call(action: string, b: Data) {
    if (disposed) throw Error('插件已停用。')
    if (action.startsWith('cloud')) return cloudOffice(action, b)
    if (action === 'activity')
      return {
        roleIds: [
          ...new Set(
            [...jobs.values()]
              .filter((j) => j.mode !== 'chat' && j.status === 'running')
              .flatMap((j) => j.steps.filter((s) => s.status === 'running').map((s) => s.roleId))
              .concat(cloudOffice.workingRoles()),
          ),
        ],
      }
    if (action === 'state') {
      const roles = Object.fromEntries(
        WORK_ROLE_IDS.map((id) => {
          const c = config(id)
          return [id, { baseUrl: c.baseUrl, model: c.model, hasKey: Boolean(c.secret) }]
        }),
      )
      const memories = Object.fromEntries(
        WORK_ROLE_IDS.map((id) => [
          id,
          Number(db.prepare('SELECT count(*) AS n FROM employee_private_notes WHERE role=?').get(id)!.n),
        ]),
      )
      return {
        roles,
        memories,
        rooms: [...rooms.values()],
        jobs: [...jobs.values()].sort((a, b) => a.createdAt - b.createdAt),
        loveHouse: {
          available: await loveHouseAvailable(),
          connected: Object.keys(house.libraries).length === 8,
          ...(portable ? {portableAvailable:await hasPortableLibraries(), reusedPortable:house.source === 'portable'} : {}),
          pending: Number(db.prepare('SELECT count(*) AS n FROM employee_private_notes WHERE synced=0').get()!.n),
          message: [houseError, Object.keys(house.libraries).some(id => previewRoomRoles.has(id))
            ? '有员工曾用旧预览版把群发言记入个人库。这些员工暂时从本机个人记录回忆，群历史仍可在原群查看。' : ''].filter(Boolean).join(' '),
        },
      }
    }
    if (action === 'connect') {
      if (b.source !== undefined && b.source !== 'new' && b.source !== 'portable') throw Error('未知的记忆库来源。')
      const source = b.source === 'portable' ? 'portable' : 'new'
      if (connecting && connectingSource !== source) throw Error('另一项记忆库连接正在进行，请稍后重试。')
      connectingSource = source
      connecting ??= (source === 'portable' ? reusePortableLibraries() : connectLoveHouse(house, () => saveHouse())).finally(() => {
        connecting = undefined
        connectingSource = undefined
      })
      await connecting
      void flush()
      return { connected: true }
    }
    if (action === 'configure') {
      const id = role(b.roleId),
        url = b.baseUrl === '' ? '' : serviceUrl(b.baseUrl),
        model = string(b.model, 180, true)
      if (Boolean(url) !== Boolean(model)) throw Error('请同时填写服务地址和模型。')
      const current = config(id)
      const secret = url
        ? b.apiKey !== undefined
          ? credential(string(b.apiKey, 12000, true), false)
          : current.baseUrl === url
            ? current.secret
            : ''
        : ''
      db.prepare('UPDATE configs SET baseUrl=?,model=?,secret=? WHERE role=?').run(url, model, secret, id)
      return { saved: true }
    }
    if (action === 'memory')
      return {
        entries: notes(role(b.roleId), 150).map((n) => ({
          id: n.id,
          text: [n.user, n.assistant].filter(Boolean).join('\n'),
          createdAt: n.createdAt,
          synced: Boolean(n.synced),
        })),
      }
    if (action === 'remember' || action === 'record') {
      const id = role(b.roleId)
      if (action === 'remember') record(id, 'notes', randomUUID(), string(b.text, 8000), '')
      else {
        const topic = token(b.topic)
        if (rooms.has(topic)) throw Error('群发言保存在协作群记录中。')
        record(id, topic, token(b.id), string(b.user, 64000), string(b.assistant, 200000))
      }
      void flush()
      return { saved: true }
    }
    if (action === 'recall') {
      const topic = token(b.topic)
      if (rooms.has(topic)) throw Error('群聊上下文只读取本群的发言。')
      return { context: await recall(role(b.roleId), string(b.query, 32000), topic) }
    }
    if (action === 'cancel') {
      const id = token(b.id)
      return { cancelled: cancelJob(id, '任务已停止。') }
    }
    if (action === 'createroom') {
      const id = 'room-' + token(b.requestId), name = string(b.name, 60)
      const roleIds = Array.isArray(b.roleIds) ? b.roleIds.map(role) : []
      if (roleIds.length < 2 || roleIds.length > WORK_ROLE_IDS.length || new Set(roleIds).size !== roleIds.length)
        throw Error('请选择至少两位不同的群成员。')
      const prior = rooms.get(id)
      if (prior) {
        if (prior.name !== name || prior.roleIds.join() !== roleIds.join()) throw Error('群聊创建编号已被使用。')
        return prior
      }
      if (id.length > 180 || [...jobs.values()].some(job => job.topic === id)) throw Error('该群聊编号无效或已被使用。')
      const room = { id, name, roleIds, createdAt: Date.now() }
      db.prepare('INSERT INTO rooms VALUES(?,?)').run(id, JSON.stringify(room))
      rooms.set(id, room)
      return room
    }
    if (action !== 'run') throw Error('未知操作。')
    const id = token(b.requestId),
      prior = jobs.get(id)
    const text = string(b.text, 32000),
      mode = string(b.mode, 10),
      topic = b.topic === undefined ? 'main' : token(b.topic)
    const ids = Array.isArray(b.roleIds) ? b.roleIds.map(role) : []
    if (
      !['chat', 'task', 'team'].includes(mode) ||
      ids.length < 1 ||
      ids.length > 8 ||
      new Set(ids).size !== ids.length ||
      (mode === 'team' ? ids.length < 2 : ids.length !== 1)
    )
      throw Error('请选择有效的员工组合。')
    if (prior) {
      if (
        prior.text !== text ||
        prior.mode !== mode ||
        prior.topic !== topic ||
        prior.roleIds.join(',') !== ids.join(',')
      )
        throw Error('该请求编号已用于另一项工作。')
      return prior
    }
    const room = rooms.get(topic)
    if (!room && topic.startsWith('room-') && ![...jobs.values()].some(job => job.topic === topic))
      throw Error('该协作群不存在。')
    if (room) {
      if (ids.some(id => !room.roleIds.includes(id))) throw Error('只能点名群里的员工。')
      if ([...jobs.values()].some(job => job.topic === topic && ['running','queued'].includes(job.status)))
        throw Error('本群还有员工在处理上一条消息。')
    }
    // Snapshot encrypted credentials and their matching origin for the entire assignment.
    // The snapshot is never written into transcripts or returned through the job API.
    const services = Object.fromEntries(ids.map(id => [id, config(id)]))
    if (ids.some((id) => !services[id]!.model)) throw Error('请先为参与的每位员工配置 API 服务和模型。')
    if (
      [...jobs.values()].some(
        (j) => ['queued', 'running'].includes(j.status) && j.roleIds.some((r) => ids.includes(r)),
      )
    )
      throw Error('选中的员工已有任务，请待完成后再派工。')
    const profiles = b.profiles ? object(b.profiles) : {}
    for (const id of ids) {
      if (profiles[id] !== undefined) {
        const p = object(profiles[id])
        for (const k of ['name', 'personality', 'scenario']) if (p[k] !== undefined) string(p[k], 10000, true)
      }
    }
    const job: Job = {
      id,
      topic,
      mode,
      text,
      createdAt: Date.now(),
      roleIds: ids,
      status: 'queued',
      steps: ids.map((roleId) => ({ roleId, status: 'queued', output: '' })),
    }
    persist(job)
    jobs.set(id, job)
    const controller = new AbortController()
    active.set(id, controller)
    void execute(job, profiles, services, controller)
    return job
  }
  async function handler(req: IncomingMessage, res: ServerResponse) {
    const send = (code: number, data: unknown) => {
      res.writeHead(code, {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff',
      })
      res.end(JSON.stringify(data))
    }
    const addr = req.socket.remoteAddress?.replace(/^::ffff:/, '')
    const host = req.headers.host ?? ''
    if (
      req.method !== 'POST' ||
      !['127.0.0.1', '::1'].includes(addr ?? '') ||
      !/^((localhost|127\.0\.0\.1)|\[::1\])(:\d+)?$/i.test(host) ||
      (admitDesktopOwner ? !admitDesktopOwner(req) : req.headers.origin !== 'http://' + host) ||
      !/^application\/json(?:;|$)/i.test(req.headers['content-type'] ?? '') ||
      req.headers['sec-fetch-site'] === 'cross-site'
    )
      return send(403, { ok: false, error: '员工工作台仅支持本机同源连接。' })
    try {
      const chunks: Buffer[] = []
      let size = 0
      for await (const chunk of req) {
        size += chunk.length
        if (size > 1024 * 1024) throw Error('请求过大。')
        chunks.push(Buffer.from(chunk))
      }
      const action = /^\/luma-agents\/([a-z]+)$/.exec(req.url ?? '')?.[1] ?? ''
      const value = await call(action, object(JSON.parse(Buffer.concat(chunks).toString('utf8'))))
      send(200, { ok: true, value })
    } catch (e) {
      const msg =
        e instanceof Error && !/ENOENT|EPERM|sqlite|SELECT |Command failed|JSON|fetch failed/i.test(e.message)
          ? e.message
          : '员工服务暂时不可用，请检查连接。'
      send(400, { ok: false, error: msg.slice(0, 220) })
    }
  }
  return {
    handler,
    call,
    dispose() {
      if (disposed) return
      disposed = true
      clearInterval(clock)
      cloudOffice.dispose()
      try {
        for (const id of active.keys()) cancelJob(id, '插件已停用，未完成的步骤已取消。')
      } finally { db.close() }
    },
  }
}

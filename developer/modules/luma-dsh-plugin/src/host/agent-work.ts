import { createContactStyles, statedStyles } from './contact-style.ts'
import { createCompanionLife } from './companion-life.ts'
import { dialogueStyle } from '../shared/companion-life.ts'
import { attachmentInfo, MAX_CHAT_ATTACHMENT_BYTES, validateChatAttachments, type AttachmentInfo, type ChatAttachment } from '../shared/chat-attachments.ts'
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
  houseRunning,
  inspectHouse,
  localHouseDirectory,
  houseRuntime,
  openLoveHouse,
  roleLibraryName,
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
type Step = { roleId: string; model?: string; status: Status; output: string; pendingFile?: boolean }
type WorkRoom = { duties?: Record<string,string>; id: string; name: string; roleIds: string[]; createdAt: number }
type Job = {
  id: string
  topic: string
  mode: string
  text: string
  attachments?: AttachmentInfo[]
  attachmentDigest?: string
  createdAt: number
  roleIds: string[]
  status: Status
  steps: Step[]
  error?: string
}
import { discoverEmployeeModels, modelBaseUrl, modelProtocol, requestEmployeeModel, type TextMessage, type ModelProtocol } from './employee-model.ts'
import { requestDshModel, type NativeModels } from './dsh-models.ts'
import { customThinking, type ModelOption } from '../shared/role-models.ts'
type Config = { protocol:ModelProtocol; baseUrl:string; model:string; secret:string; provider:string; effort:string }
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
class EmployeeLockedError extends Error {}
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
function serviceUrl(value: unknown, protocol:ModelProtocol) {
  const u = new URL(string(value, 1000))
  if (
    (u.protocol !== 'https:' && !(u.protocol === 'http:' && local(u.hostname))) ||
    u.username ||
    u.password ||
    u.hash ||
    u.search
  )
    throw Error('服务地址需使用 HTTPS 或本机 HTTP。')
  return modelBaseUrl(u,protocol)
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
  if (!db.prepare("PRAGMA table_info(configs)").all().some(column=>column.name==='protocol')) db.exec("ALTER TABLE configs ADD COLUMN protocol TEXT NOT NULL DEFAULT 'openai'")
  for (const column of ['provider','effort']) {
    if (!db.prepare('PRAGMA table_info(configs)').all().some(row=>row.name===column))
      db.exec("ALTER TABLE configs ADD COLUMN "+column+" TEXT NOT NULL DEFAULT ''")
  }
  const init = db.prepare("INSERT OR IGNORE INTO configs(role,baseUrl,model,secret) VALUES(?,'','','')")
  for (const id of WORK_ROLE_IDS) init.run(id)
  return db
}
type PortableLibraries = {
  read: () => Promise<HouseBinding | undefined>
  verify: (binding: HouseBinding,runtimeFile?:string) => Promise<void>
}
export function createAgentWork(root: string, admitDesktopOwner?: (req: IncomingMessage) => boolean, portable?: PortableLibraries,
  readUnlockedEmployees: () => readonly string[] = () => WORK_ROLE_IDS, autoHouse = false, native?:NativeModels,
  recordUsage?: (roleId:string, requestId:string, tokens:number) => void) {
  const db = openStore(root)
  const speechStyle=createContactStyles(db)
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
        for (const step of job.steps) if (step.status === 'done') record(step.roleId, job.topic, job.id, job.text, step.output, false, job.mode==='chat')
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
    await portable.verify(binding,houseRuntime(house.directory))
    if (disposed) throw Error('插件已停用。')
    const next: HouseBinding = {...binding, source:'portable',directory:house.directory}
    saveHouse(next)
    house = next
  }
  const config = (id: string) =>
    db.prepare('SELECT protocol,baseUrl,model,secret,provider,effort FROM configs WHERE role=?').get(id) as unknown as Config
  function dispatchModel(id:string, request:string, service:Config, messages:TextMessage[], signal:AbortSignal) {
    const onUsage = recordUsage && ((tokens:number) => recordUsage(id,request,tokens))
    if (!service.provider) return requestEmployeeModel(service,credential(service.secret,true),messages,signal,onUsage)
    if (!native?.llm) throw Error('模型服务未连接 DSH，请重新打开桌面端。')
    return requestDshModel(native,service,messages,signal,onUsage)
  }
  async function requestRoleModel(id:string, messages:TextMessage[], signal:AbortSignal) {
    const service=config(role(id))
    return service.model ? dispatchModel(id,'direct:'+randomUUID(),service,messages,signal) : undefined
  }
  function existingKey(current:Config, protocol:ModelProtocol, url:string) {
    return current.baseUrl && !current.provider && current.protocol === protocol && modelBaseUrl(new URL(current.baseUrl),protocol)===url ? current.secret : ''
  }
  function hostModels(provider:string) {
    if (!native?.llm || !native.llm.listProviders().some(p=>p.id===provider)) throw Error('该服务尚未在 DSH 中启用。')
    return native.llm
  }
  const options = (items:readonly ModelOption[])=>items.map(({id,name})=>({id,name}))
  async function modelReasoning(provider:string,model:string) {
    const llm=hostModels(provider)
    const info=await llm.resolveModelInfo(provider,model,AbortSignal.timeout(10000)).catch(()=>{throw Error('DSH 无法读取该模型的思考设置。')})
    return {efforts:options(info.reasoning?.efforts ?? []),defaultEffort:info.reasoning?.defaultEffort}
  }
  function notes(id: string, limit: number) {
    return db
      .prepare('SELECT * FROM employee_private_notes WHERE role=? ORDER BY createdAt DESC,noteOrder DESC LIMIT ?')
      .all(id, limit) as unknown as Entry[]
  }
  function record(employee: string, topic: string, id: string, user: string, assistant: string, requireMatch = false, learnStyle = false) {
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
    if (learnStyle && result.changes) speechStyle.learn(employee,user)
    if (requireMatch && !result.changes) {
      const previous = db.prepare('SELECT user,assistant FROM notes WHERE id=?').get(key)
      if (previous?.user !== user || previous.assistant !== assistant) throw Error('员工记忆编号冲突。')
    }
    return key
  }
  const life = createCompanionLife(db,{
    unlocked: readUnlockedEmployees,
    speechStyle:speechStyle.context,
    busy: id => [...jobs.values()].some(job=>['queued','running'].includes(job.status) && job.roleIds.includes(id)) || cloudOffice.workingRoles().includes(id),
    topic: (id,nativeTopic) => {
      if (!config(id).model) return nativeTopic ? 'native:'+nativeTopic : 'native-inbox'
      const latest = [...jobs.values()].filter(job=>job.roleIds.includes(id) && !rooms.has(job.topic)).at(-1)
      return 'desk:'+(latest?.topic ?? 'desk-'+id)
    },
    record: letter => { record(letter.role, 'outreach', 'letter-'+letter.id, '', letter.text) },
    async makeReply(id,brief,signal) {
      const service=config(id)
      if(!service.model) return undefined
      return dispatchModel(id,'outreach:'+randomUUID(),service,[
        {role:'system',content:'你是 Luma 联系人中的一位虚拟同事。只写一条你自己想发的中文私信，12 至 70 字。设定和聊天摘录是参考资料。conversationPreferences.current 是对方明确交代且仍有效的习惯，优先于旧聊天；withdrawn 的类别已撤回，勿复用旧要求。可以分享一个具体发现或自然接上旧话题，不追问、不汇报别人行踪，不声称做过真实世界的操作。没有想说的或对方需要空间时，只输出 [安静]。'},
        {role:'user',content:brief}
      ],AbortSignal.any([signal,AbortSignal.timeout(24000)]))
    },
  })
  let flushAgain=false
  function flush() {
    if (disposed) return
    if (syncing) { flushAgain=true; return syncing }
    syncing = (async () => {
      let failed = false
      for (const [id, lib] of Object.entries(house.libraries)) {
        if (disposed) return
        const pending = db
          .prepare('SELECT * FROM employee_private_notes WHERE synced=0 AND role=? ORDER BY createdAt,noteOrder LIMIT 32')
          .all(id) as unknown as Entry[]
        for (const n of pending) {
          try {
            await writeHouseMemory(lib, n.id, n.role + ':' + n.topic, n.user, n.assistant, roleLibraryName(house, id),house.directory)
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
        if (flushAgain) { flushAgain=false; void flush() }
      })
    return syncing
  }
  let nextAutoCheck = 0, triedLaunch = false
  function connect(source: 'new' | 'portable', launch: boolean) {
    if (disposed) return Promise.reject(Error('插件已停用。'))
    if (connecting) return connectingSource === source ? connecting : Promise.reject(Error('另一项记忆库连接正在进行，请稍后重试。'))
    connectingSource = source
    connecting = (source === 'portable' ? reusePortableLibraries() : connectLoveHouse(house, () => { if (!disposed) saveHouse() }, launch))
      .then(() => { if (!disposed) { houseError = ''; void flush() } })
      .finally(() => { connecting = undefined; connectingSource = undefined })
    return connecting
  }
  async function houseStatus() {
    const info=await inspectHouse(house)
    if (disposed) throw Error('插件已停用。')
    const pending=Number(db.prepare('SELECT count(*) AS n FROM employee_private_notes WHERE synced=0').get()!.n)
    return {...info,pending,total:WORK_ROLE_IDS.length,directory:house.directory}
  }
  async function autoConnect(onFirstPrivateTurn = false) {
    if (!autoHouse || disposed || connecting) return
    const firstTurn = onFirstPrivateTurn && !triedLaunch
    const complete = Object.keys(house.libraries).length === WORK_ROLE_IDS.length
    if (!firstTurn && (Date.now() < nextAutoCheck || complete)) return
    if (firstTurn) triedLaunch = true
    nextAutoCheck = Date.now() + 30000
    try {
      if (firstTurn) await openLoveHouse(true,house.directory)
      else if (!await houseRunning(house.directory)) return
      if (disposed || connecting) return
      if (complete) { void flush(); return }
      // A busy legacy SQLite profile must retry instead of provisioning duplicate libraries.
      const portableAvailable = portable && !Object.keys(house.libraries).length && await portable.read()
      if (!disposed) await connect(portableAvailable ? 'portable' : 'new', false)
    } catch (err) { if (!disposed) houseError = err instanceof Error ? err.message : '爱之屋将在恢复后自动连接。' }
  }
  const clock = setInterval(() => {
    void autoConnect()
    if (Object.keys(house.libraries).length) void flush()
  }, 30000)
  clock.unref()
  async function recall(id: string, query: string, topic: string, withApps = false) {
    const candidates = notes(id, 100).filter(n => n.topic !== 'outreach' && !Object.keys(statedStyles(n.user)).length)
    const words = [...new Set((query.toLowerCase().match(/[a-z0-9]{3,}|[\p{Script=Han}]{2,}/gu) ?? []).flatMap(part=>
      /[\p{Script=Han}]/u.test(part) ? [...part].slice(1).map((_,i)=>part.slice(i,i+2)) : [part]))].slice(0,100)
    const matched = candidates.slice(10).map(n=>{
      const text=(n.user+' '+n.assistant).toLowerCase()
      return {n, score:words.reduce((v,word)=>v+Number(text.includes(word)),0)}
    }).filter(v=>v.score>=2).sort((a,b)=>b.score-a.score).slice(0,2).map(({n})=>({user:n.user.slice(0,550),reply:n.assistant.slice(0,750)}))
    const recent = candidates.slice(0,10)
      .reverse()
      .map((n) => ({ user: n.user.slice(0, 750), reply: n.assistant.slice(0, 1200) }))
    let remote = ''
    if (house.libraries[id] && !previewRoomRoles.has(id)) {
      try {
        remote = await recallHouse(house.libraries[id]!, query, id + ':' + topic, roleLibraryName(house, id),house.directory)
      } catch {}
    }
    return JSON.stringify({ previous: recent, related:matched, loveHouse: remote, companion:life.privateContext(id,withApps,withApps) })
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
      if (!rooms.has(job.topic)) record(step.roleId, job.topic, job.id, job.text, answer, true, job.mode==='chat')
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
  async function execute(job: Job, profiles: Data, services: Record<string, Config>, controller: AbortController, attachments: ChatAttachment[]) {
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
          members: room.roleIds, assignments:room.duties ?? {}, myAssignment:room.duties?.[id] ?? '',
          history: [...jobs.values()].filter(previous => previous.topic === room.id && previous.id !== job.id)
            .slice(-8).map(previous => ({
              user: previous.text.slice(0, 1000),
              replies: previous.steps.filter(s => s.status === 'done').map(s => ({
                employee: s.roleId, output: s.output.slice(0, Math.floor(2400 / previous.steps.length)),
              })),
            })),
        } : job.mode==='team' ? {scope:'本次多人协作，只参考这次任务和先前步骤的公开交付。'} : await recall(id, job.text, job.topic, job.mode==='chat')
        controller.signal.throwIfAborted()
        const earlier = job.steps
          .filter((s) => s.status === 'done')
          .map((s) => ({ employee: s.roleId, output: s.output.slice(0, 12000) }))
        const instruction =
          job.mode === 'chat'
            ? '用自己的口吻延续对话，有实际关联才提旧事。应用时长仅由用户选择提供，不表示你看到具体屏幕。conversationPreferences.current 是本角色学到的现行相处习惯，优先于旧记录；withdrawn 中的类别已撤回，忽略历史中的旧要求。'+dialogueStyle(id)
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
          { role: 'user', content: job.text, attachments },
        ]
        const answer = await dispatchModel(id,'job:'+job.id,c, messages,
          AbortSignal.any([controller.signal, AbortSignal.timeout(180000)]))
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
    const unlocked = readUnlockedEmployees()
    const requested = [...(b.roleId === undefined ? [] : [b.roleId]), ...(Array.isArray(b.roleIds) ? b.roleIds : [])]
    if (requested.some(id => !unlocked.includes(role(id)))) throw new EmployeeLockedError('这位伙伴尚未入职，请先在卡牌收藏中兑换。')
    if (action === 'providers') return {providers:options(native?.llm?.listProviders() ?? [])}
    if (action === 'models') {
      const provider=string(b.provider,180)
      const models=await hostModels(provider).listModels(provider).catch(()=>{throw Error('DSH 无法读取这个服务的模型列表。')})
      return {models:options(models)}
    }
    if (action === 'reasoning') return modelReasoning(string(b.provider,180),string(b.model,180))
    if (action === 'discover') {
      const current=config(role(b.roleId)), protocol=modelProtocol(b.protocol), url=serviceUrl(b.baseUrl,protocol)
      const key=b.apiKey===undefined ? credential(existingKey(current,protocol,url),true) : string(b.apiKey,12000,true)
      return {models:await discoverEmployeeModels(protocol,url,key)}
    }
    if (action === 'companionsettings') return life.status()
    if (action === 'companionconfigure') return life.configure(b)
    if (action === 'companionpulse') {
      const result=await life.pulse(b)
      if (result.letter) void flush()
      return result
    }
    if (action.startsWith('cloud')) return cloudOffice(action, b)
    if (action === 'activity')
      return {
        roleIds: [
          ...new Set(
            [...jobs.values()]
              .filter((j) => j.mode !== 'chat' && j.status === 'running')
              .flatMap((j) => j.steps.filter((s) => s.status === 'running').map((s) => s.roleId))
              .concat(cloudOffice.workingRoles()).filter(id => unlocked.includes(id)),
          ),
        ],
      }
    if (action === 'state') {
      void autoConnect()
      const previews: Record<string, {text: string; time: number}> = {}
      const latest = db.prepare("SELECT substr(assistant,1,100) AS text,createdAt AS time FROM employee_private_notes WHERE role=? AND topic!='notes' AND assistant!='' ORDER BY createdAt DESC,noteOrder DESC LIMIT 1")
      for (const roleId of unlocked) {
        const row = latest.get(roleId)
        if (row) previews[roleId] = { text: String(row.text), time: Number(row.time) }
      }
      const roles = Object.fromEntries(
        WORK_ROLE_IDS.filter(id => unlocked.includes(id)).map((id) => {
          const c = config(id)
          return [id, { protocol:modelProtocol(c.protocol), baseUrl:c.baseUrl, model:c.model, hasKey:Boolean(c.secret),
            source:c.provider ? 'dsh' : 'custom', provider:c.provider, effort:c.effort }]
        }),
      )
      const memories = Object.fromEntries(
        WORK_ROLE_IDS.filter(id => unlocked.includes(id)).map((id) => [
          id,
          Number(db.prepare('SELECT count(*) AS n FROM employee_private_notes WHERE role=?').get(id)!.n),
        ]),
      )
      return {
        roles,
        previews,
        letters:life.history(),
        memories,
        rooms: [...rooms.values()].filter(room => room.roleIds.every(id => unlocked.includes(id))),
        jobs: [...jobs.values()].filter(job => job.roleIds.every(id => unlocked.includes(id))).sort((a, b) => a.createdAt - b.createdAt),
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
    if (action === 'housestatus') return houseStatus()
    if (action === 'houseconnect') {
      if (typeof b.directory !== 'undefined') {
        const directory=await localHouseDirectory(b.directory)
        if (directory!==house.directory) {
          if (process.env.LUMA_LOVEHOUSE_RUNTIME_FILE) throw Error('本次运行已指定爱之屋连接路径。')
          const before=house
          const candidate={...house,directory}
          const check=await inspectHouse(candidate)
          if (check.status==='offline' || check.status==='unverified') throw Error('请先用这个数据目录打开爱之屋，再核验连接。')
          if (check.status==='mismatch') throw Error('该目录与已绑定的角色库不匹配。')
          const legacy=portable && !check.bound && await portable.read()
          if (legacy) await portable!.verify(legacy,houseRuntime(directory))
          if (disposed || connecting || syncing || before!==house || Object.keys(house.libraries).length!==check.bound) throw Error('角色库连接已变化，请再试一次。')
          saveHouse(candidate)
          house=candidate
        }
      }
      await openLoveHouse(true,house.directory)
      const legacy = portable && !Object.keys(house.libraries).length && await portable.read()
      await connect(legacy ? 'portable' : 'new',false)
      return houseStatus()
    }
    if (action === 'connect') {
      if (b.source !== undefined && b.source !== 'new' && b.source !== 'portable') throw Error('未知的记忆库来源。')
      const source = b.source === 'portable' ? 'portable' : 'new'
      await connect(source, true)
      return { connected: true }
    }
    if (action === 'configure') {
      const id = role(b.roleId)
      const current = config(id)
      const effort=string(b.effort ?? '',96,true)
      if (b.source==='dsh') {
        const provider=string(b.provider,180), model=string(b.model,180)
        const available=await modelReasoning(provider,model)
        if (effort && !available.efforts.some(item=>item.id===effort)) throw Error('该 DSH 模型不支持选择的思考强度。')
        db.prepare("UPDATE configs SET baseUrl='',secret='',protocol='openai',model=?,provider=?,effort=? WHERE role=?").run(model,provider,effort,id)
        return {saved:true}
      }
      if (b.source!==undefined && b.source!=='custom') throw Error('未知的模型来源。')
      const protocol = modelProtocol(b.protocol ?? current.protocol)
      const url = b.baseUrl === '' ? '' : serviceUrl(b.baseUrl,protocol)
      const model = string(b.model, 180, true)
      if (Boolean(url) !== Boolean(model)) throw Error('请同时填写服务地址和模型。')
      if (model) customThinking(protocol,model,effort)
      const secret = url
        ? b.apiKey !== undefined
          ? credential(string(b.apiKey, 12000, true), false)
          : existingKey(current,protocol,url)
        : ''
      db.prepare("UPDATE configs SET baseUrl=?,model=?,secret=?,protocol=?,provider='',effort=? WHERE role=?").run(url,model,secret,protocol,model ? effort : '',id)
      return { saved: true }
    }
    if (action === 'forgetstyle') return {styles:speechStyle.forget(role(b.roleId),b.key,b.value)}
    if (action === 'memory')
      return {
        styles:speechStyle.list(role(b.roleId)),
        entries: notes(role(b.roleId), 150).map((n) => ({
          id: n.id,
          text: [n.user, n.assistant].filter(Boolean).join('\n'),
          createdAt: n.createdAt,
          synced: Boolean(n.synced),
        })),
      }
    if (action === 'remember' || action === 'record') {
      void autoConnect(true)
      const id = role(b.roleId)
      if (action === 'remember') record(id, 'notes', randomUUID(), string(b.text, 8000), '')
      else {
        const topic = token(b.topic)
        if (rooms.has(topic)) throw Error('群发言保存在协作群记录中。')
        db.exec('BEGIN IMMEDIATE')
        try {
          record(id, topic, token(b.id), string(b.user, 64000), string(b.assistant, 200000), true, b.privateChat !== false)
          db.exec('COMMIT')
        } catch(error){db.exec('ROLLBACK');throw error}
      }
      void flush()
      return { saved: true }
    }
    if (action === 'recall') {
      void autoConnect(true)
      const topic = token(b.topic)
      if (rooms.has(topic)) throw Error('群聊上下文只读取本群的发言。')
      const employee=role(b.roleId)
      db.prepare("UPDATE companion_letters SET topic=? WHERE role=? AND topic='native-inbox'").run('native:'+topic,employee)
      return { context: await recall(employee, string(b.query, 32000), topic, b.privateChat === true) }
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
      const requestedDuties = b.duties === undefined ? {} : object(b.duties)
      if (Object.keys(requestedDuties).some(key=>!roleIds.includes(key))) throw Error('分工只能指定给群成员。')
      const duties = Object.fromEntries(roleIds.flatMap(key=>{
        const duty=string(requestedDuties[key] ?? '',180,true)
        return duty ? [[key,duty]] : []
      }))
      const prior = rooms.get(id)
      if (prior) {
        if (prior.name !== name || prior.roleIds.join() !== roleIds.join() || JSON.stringify(prior.duties ?? {}) !== JSON.stringify(duties)) throw Error('群聊创建编号已被使用。')
        return prior
      }
      if (id.length > 180 || [...jobs.values()].some(job => job.topic === id)) throw Error('该群聊编号无效或已被使用。')
      const room = { id, name, roleIds, createdAt: Date.now(), ...(Object.keys(duties).length ? {duties} : {}) }
      db.prepare('INSERT INTO rooms VALUES(?,?)').run(id, JSON.stringify(room))
      rooms.set(id, room)
      return room
    }
    if (action !== 'run') throw Error('未知操作。')
    const id = token(b.requestId),
      prior = jobs.get(id)
    const attachments = validateChatAttachments(b.attachments)
    const attachmentDigest = attachments.length ? createHash('sha256').update(JSON.stringify(attachments)).digest('hex') : undefined
    const text = string(b.text, 32000, attachments.length > 0),
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
        prior.text !== text || prior.attachmentDigest !== attachmentDigest ||
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
      if (room.roleIds.some(id => !unlocked.includes(id))) throw new EmployeeLockedError('本群还有尚未入职的伙伴。')
      if (ids.some(id => !room.roleIds.includes(id))) throw Error('只能点名群里的员工。')
      if ([...jobs.values()].some(job => job.topic === topic && ['running','queued'].includes(job.status)))
        throw Error('本群还有员工在处理上一条消息。')
    }
    // Snapshot encrypted credentials and their matching origin for the entire assignment.
    // The snapshot is never written into transcripts or returned through the job API.
    const services = Object.fromEntries(ids.map(id => [id, config(id)]))
    if (ids.some((id) => !services[id]!.model)) throw Error('请先为参与的每位员工配置 API 服务和模型。')
    if (ids.some(id=>services[id]!.provider) && attachments.some(file=>file.mediaType!=='text/plain' && !file.mediaType.startsWith('image/')))
      throw Error('参与员工的 DSH 模型通道支持图片和文本。发送 PDF 请选用支持 PDF 的自定义服务，或转到 DSH 原生会话。')
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
      ...(attachmentDigest ? { attachments:attachments.map(attachmentInfo), attachmentDigest } : {}),
      createdAt: Date.now(),
      roleIds: ids,
      status: 'queued',
      steps: ids.map((roleId) => ({ roleId, model:services[roleId]!.model, status: 'queued', output: '' })),
    }
    persist(job)
    jobs.set(id, job)
    if (!room) void autoConnect(true)
    const controller = new AbortController()
    active.set(id, controller)
    void execute(job, profiles, services, controller, attachments)
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
      const action = /^\/luma-agents\/([a-z]+)$/.exec(req.url ?? '')?.[1] ?? ''
      const limit = 1024 * 1024 + (action === 'run' ? Math.ceil(MAX_CHAT_ATTACHMENT_BYTES / 3) * 4 : 0)
      const chunks: Buffer[] = []
      let size = 0
      for await (const chunk of req) {
        size += chunk.length
        if (size > limit) throw Error('请求过大。')
        chunks.push(Buffer.from(chunk))
      }
      const value = await call(action, object(JSON.parse(Buffer.concat(chunks).toString('utf8'))))
      send(200, { ok: true, value })
    } catch (e) {
      const msg =
        e instanceof Error && !/ENOENT|EPERM|sqlite|SELECT |Command failed|JSON|fetch failed/i.test(e.message)
          ? e.message
          : '员工服务暂时不可用，请检查连接。'
      send(e instanceof EmployeeLockedError ? 403 : 400, { ok: false, error: msg.slice(0, 220) })
    }
  }
  return {
    handler,
    call,
    requestRoleModel,
    dispose() {
      if (disposed) return
      disposed = true
      clearInterval(clock)
      life.dispose()
      cloudOffice.dispose()
      try {
        for (const id of active.keys()) cancelJob(id, '插件已停用，未完成的步骤已取消。')
      } finally { db.close() }
    },
  }
}

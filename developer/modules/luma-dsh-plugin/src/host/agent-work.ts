import { createDesktopSpeech } from './desktop-speech.ts'
import { createContactStyles, statedStyles } from './contact-style.ts'
import { createRolePortraits, isTemporaryMemory } from './role-portrait.ts'
import { memoryMatch } from './memory-match.ts'
import { PRIVATE_MEMORY_GUIDANCE } from '../shared/role-portrait.ts'
import { OFFICE_CHARACTER_CARDS } from '../../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/office-harness/OfficeCharacterCards.ts'
import type { RoleProfile } from '../messages-settings.ts'
import { createCompanionLife } from './companion-life.ts'
import { dialogueStyle, type LifeLetter } from '../shared/companion-life.ts'
import { relayNeedsRevision, relayRevisionInstruction, relaySpeakerInstruction } from './relay-speaker.ts'
import { attachmentInfo, attachmentText, validateChatAttachments, type AttachmentInfo, type ChatAttachment } from '../shared/chat-attachments.ts'
import { DatabaseSync } from 'node:sqlite'
import { mkdirSync, lstatSync, writeFileSync, renameSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID, createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { createCloudOffice } from './cloud-office.ts'
import { historicalStudioOutput, studioSteps, parsePeerRequest, STUDIO_PHASE_INSTRUCTIONS, type PeerRequest, type StudioPhase, type TeamWorkflow } from '../shared/studio-workflow.ts'
import { DesktopReceiptError, type DesktopReceipt, type createStudioDesktop } from './studio-desktop.ts'
import { studioReviewers, type StudioReceipt, type StudioReview } from '../shared/studio-verification.ts'
import { verifyInstructions,verifyFormatRetry,finalReviewInstructions,parseStudioReview,inconclusiveReview,studioReviewText } from './studio-verification.ts'
import { createJobDeletion, deliverableFolder } from './job-deletion.ts'
import { createRecordHistory } from './record-history.ts'
import { createLocalHarness, type HarnessEvent } from './local-harness.ts'
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
type Step = { roleId: string; model?: string; status: Status; output: string; pendingFile?: boolean; phase?: StudioPhase; activity?: string; handoff?: PeerRequest; desktopReceipt?:StudioReceipt;desktopReview?:StudioReview[];reviewedReceiptIds?:string[]; harnessTrace?:(HarnessEvent & {at:number})[] }
type WorkRoom = { duties?: Record<string,string>; workflow?: TeamWorkflow; id: string; name: string; roleIds: string[]; createdAt: number }
type Job = {
  id: string
  topic: string
  mode: string
  text: string
  attachments?: AttachmentInfo[]
  attachmentDigest?: string
  createdAt: number
  roleIds: string[]
  workflow?: TeamWorkflow
  reviewerId?:string
  desktopTargets?: Record<string, string>
  status: Status
  steps: Step[]
  error?: string
}
import { discoverEmployeeModels, modelBaseUrl, modelProtocol, requestEmployeeModel, type TextMessage, type ModelProtocol } from './employee-model.ts'
import { requestDshModel, type NativeModels } from './dsh-models.ts'
import { customThinking, type ModelOption } from '../shared/role-models.ts'
type Config = { protocol:ModelProtocol; baseUrl:string; model:string; secret:string; provider:string; effort:string; localHarness:string }
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
type WorkPersona = Pick<RoleProfile, 'name' | 'personality' | 'scenario'>
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
  return v as typeof WORK_ROLE_IDS[number]
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
  db.exec('PRAGMA secure_delete=ON')
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
  for (const column of ['provider','effort','localHarness']) {
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
// Keep the original JSON digest for retried jobs without building another copy of the base64 payload.
function hashAttachments(items: ChatAttachment[]) {
  const hash = createHash('sha256').update('[')
  for (const [index, item] of items.entries()) {
    if (index) hash.update(',')
    hash.update(JSON.stringify(attachmentInfo(item)).slice(0, -1))
    hash.update(',"data":"').update(item.data, 'ascii').update('"}')
  }
  return hash.update(']').digest('hex')
}
// Providers can stop producing events without settling their promise. Keep the
// record actionable and discard late replies even when a provider ignores abort.
function untilStepStops<T>(result:Promise<T>, signal:AbortSignal):Promise<T> {
  return new Promise<T>((resolve,reject)=>{
    const stop=()=>reject(Error('模型服务等待超时或已停止，可检查记录后重试。'))
    signal.addEventListener('abort',stop,{once:true})
    if(signal.aborted)stop()
    result.then(resolve,reject).finally(()=>signal.removeEventListener('abort',stop))
  })
}
export function createAgentWork(root: string, admitDesktopOwner?: (req: IncomingMessage) => boolean, portable?: PortableLibraries,
  readUnlockedEmployees: () => readonly string[] = () => WORK_ROLE_IDS, autoHouse = false, native?:NativeModels,
  recordUsage?: (roleId:string, requestId:string, tokens:number) => void, studioDesktop?: ReturnType<typeof createStudioDesktop>,
  readSavedProfiles: () => Record<string,WorkPersona> = () => ({}), localHarness = createLocalHarness()) {
  const db = openStore(root)
  const deletedJobs = createJobDeletion(db,root)
  const desktopSpeech=createDesktopSpeech()
  const speechStyle=createContactStyles(db)
  const portraits=createRolePortraits(db,requestRoleModel)
  const cloudOffice = createCloudOffice(db, credential, role)
  const rooms = new Map<string, WorkRoom>()
  for (const row of db.prepare('SELECT value FROM rooms ORDER BY rowid').all()) {
    const room = JSON.parse(String(row.value)) as WorkRoom
    rooms.set(room.id, room)
  }
  const jobs = new Map<string, Job>()
  const history = createRecordHistory<Job,LifeLetter>(db,jobs,rooms,deletedJobs,()=>life.history(),portraits.omitUploadedSource)
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
    const folder = deliverableFolder(root, job.id)
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
    // Some earlier studio builds included the routing footer in the visible reply.
    if (job.workflow === 'studio') {
      for (const step of job.steps) if (step.phase && step.output) step.output = historicalStudioOutput(step.output)
    }
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
    db.prepare('SELECT protocol,baseUrl,model,secret,provider,effort,localHarness FROM configs WHERE role=?').get(id) as unknown as Config
  function dispatchModel(id:string, request:string, service:Config, messages:TextMessage[], signal:AbortSignal,trace?:(event:HarnessEvent)=>void) {
    const onUsage = recordUsage && ((tokens:number) => recordUsage(id,request,tokens))
    if (service.localHarness) return localHarness.request(service.localHarness,service.model,service.effort,messages,signal,onUsage,trace)
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
  async function harnessReasoning(provider:string,model:string) {
    const match=(await localHarness.models(provider)).find(row=>row.id===model)
    if(!match) throw Error('模型服务当前登录账号的目录中没有这个模型。')
    return {efforts:match.efforts,defaultEffort:match.defaultEffort}
  }
  function notes(id: string, limit: number) {
    return db
      .prepare('SELECT * FROM employee_private_notes WHERE role=? ORDER BY createdAt DESC,noteOrder DESC LIMIT ?')
      .all(id, limit) as unknown as Entry[]
  }
  function noteKey(employee:string,topic:string,id:string) {
    return createHash('sha256').update(JSON.stringify([employee,topic,id])).digest('hex')
  }
  function record(employee: string, topic: string, id: string, user: string, assistant: string, requireMatch = false, learnStyle = false) {
    const key = noteKey(employee,topic,id)
    const result = db.prepare('INSERT OR IGNORE INTO notes(id,role,topic,user,assistant,createdAt) VALUES(?,?,?,?,?,?)').run(
      key,
      employee,
      topic,
      user,
      assistant,
      Date.now(),
    )
    if (learnStyle && result.changes) speechStyle.learn(employee,user)
    if (result.changes && user && topic!=='outreach') {
      portraits.observe(employee,'private',key,user,topic==='notes'?'manual':learnStyle?'chat':'work')
    }
    if (requireMatch && !result.changes) {
      const previous = db.prepare('SELECT user,assistant FROM notes WHERE id=?').get(key)
      if (previous?.user !== user || previous.assistant !== assistant) throw Error('员工记忆编号冲突。')
    }
    return key
  }
  const life = createCompanionLife(db,{
    unlocked: readUnlockedEmployees,
    speechStyle:speechStyle.context,
    portrait: id => portraits.context(id,'private'),
    allowNote: (id,note) => portraits.allowSource(id,'private',note),
    allowLetter: (id,letter) => portraits.allowSource(id,'private',createHash('sha256').update(JSON.stringify([id,'outreach','letter-'+letter])).digest('hex')),
    busy: id => [...jobs.values()].some(job=>['queued','running'].includes(job.status) && job.roleIds.includes(id)) || cloudOffice.workingRoles().includes(id),
    topic: (id,nativeTopic) => {
      if (!config(id).model) return nativeTopic ? 'native:'+nativeTopic : 'native-inbox'
      const visible=history.visibility()
      const latest = [...jobs.values()].filter(job=>job.roleIds.includes(id) && !rooms.has(job.topic) && visible.job(job)).at(-1)
      let fallback='desk-'+id
      while(history.topicClosed(id,fallback)) fallback+='-new'
      return 'desk:'+(latest?.topic ?? fallback)
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
          .prepare('SELECT * FROM portrait_recallable_notes WHERE synced=0 AND role=? ORDER BY createdAt,noteOrder LIMIT 32')
          .all(id) as unknown as Entry[]
        for (const n of pending) {
          if (disposed) return
          try {
            const sent=await writeHouseMemory(lib, n.id, n.role + ':' + n.topic, n.user, n.assistant, roleLibraryName(house, id),house.directory,
              ()=>!disposed && portraits.beginHouseUpload(id,n.id))
            if (!sent) continue
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
    const pending=Number(db.prepare('SELECT count(*) AS n FROM portrait_recallable_notes WHERE synced=0').get()!.n)
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
    deletedJobs.retryPending()
    void autoConnect()
    if (Object.keys(house.libraries).length) void flush()
  }, 30000)
  clock.unref()
  async function recall(id: string, query: string, topic: string, withApps = false, journalId?:string) {
    let remote=''
    if (portraits.canRecallRemote(id) && house.libraries[id] && !previewRoomRoles.has(id)) {
      try {
        remote=await recallHouse(house.libraries[id]!,query,id+':'+topic,roleLibraryName(house,id),house.directory)
      } catch {}
      if (disposed) throw Error('插件已停用。')
      if (!portraits.canRecallRemote(id)) remote=''
    }
    const match=memoryMatch(query)
    const select="SELECT * FROM portrait_recallable_notes WHERE role=? AND topic!='outreach'"
    const order=" ORDER BY createdAt DESC,noteOrder DESC"
    const candidates=(db.prepare(select+order+' LIMIT 100').all(id) as unknown as Entry[])
      .filter(n=>!Object.keys(statedStyles(n.user)).length)
    const recent=match.browse ? candidates.filter(n=>n.topic===topic || !isTemporaryMemory(n.user)).slice(0,10)
      : (db.prepare(select+' AND topic=?'+order+' LIMIT 10').all(id,topic) as unknown as Entry[]).filter(n=>!Object.keys(statedStyles(n.user)).length)
    const recentIds=new Set(recent.map(n=>n.id))
    const related=candidates.filter(n=>!recentIds.has(n.id) && (n.topic===topic || !isTemporaryMemory(n.user)))
      .map(n=>({n,score:match.score(n.user+' '+n.assistant)})).filter(entry=>entry.score>0)
      .sort((a,b)=>b.score-a.score).slice(0,2).map(({n})=>({user:n.user.slice(0,550),reply:n.assistant.slice(0,750)}))
    const userPortrait=portraits.context(id,'private',match,withApps)
    if (journalId && userPortrait.some(item=>item.participation==='own-project-work'))
      portraits.keepProjectReplyInTranscript(id,noteKey(id,topic,journalId))
    return {
      userPortrait,
      previous:recent.reverse().map(n=>({user:n.user.slice(0,750),reply:n.assistant.slice(0,1200)})),
      related, loveHouse:remote, companion:life.privateContext(id,withApps,withApps),
    }
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
      else portraits.observe(step.roleId, job.topic, job.id, job.text, 'work')
      step.output = answer
      step.status = 'done'
      if (job.mode !== 'chat') step.pendingFile = true
      if (job.reviewerId && step.phase==='review') {
        const review=job.steps.find(s=>s.phase==='verify')?.desktopReview
        const ok=!!review?.length && review.every(r=>r.verdict==='pass') && job.steps.every(s=>s.status==='done')
        job.status=ok?'done':'failed'
        if(!ok)job.error='窗口任务未全部通过独立复核，请查看本轮回执和结论。'
      } else if (job.steps.every(item => item.status === 'done')) job.status = 'done'
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
  async function execute(job: Job, profiles: Record<string,WorkPersona>, services: Record<string, Config>, controller: AbortController, attachments: ChatAttachment[]) {
    const room = rooms.get(job.topic)
    const displayNames=Object.fromEntries(job.roleIds.map(id=>[id,profiles[id]!.name || id]))
    function collectReceipts() {
      return Object.entries(job.desktopTargets!).map(([roleId,targetId])=>{
        const receipt=job.steps.find(s=>s.phase==='work' && s.roleId===roleId)?.desktopReceipt
        if(!receipt || receipt.roleId!==roleId || receipt.targetId!==targetId)throw Error('窗口工作缺少可核验的本轮回执。')
        return receipt
      })
    }
    async function runStep(step: Step) {
        controller.signal.throwIfAborted()
        const id = step.roleId,
          c = services[id]!
        const p = profiles[id]!
        const verifying=step.phase==='verify', finalizing=!!job.reviewerId && step.phase==='review'
        const desktopEvidence=verifying || finalizing ? collectReceipts() : undefined
        const reviewStep=finalizing ? job.steps.find(s=>s.phase==='verify' && s.roleId===job.reviewerId && s.status==='done') : undefined
        if(finalizing && (!reviewStep?.desktopReview || !desktopEvidence!.every(r=>reviewStep.desktopReview!.some(v=>v.roleId===r.roleId && v.receiptId===r.id))))
          throw Error('窗口回执尚未经过本轮指定成员复核。')
        step.status = 'running'
        const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(180000)])
        const trace=c.localHarness ? (event:HarnessEvent)=>{
          if(disposed || signal.aborted || step.status!=='running')return
          const events=step.harnessTrace??=[]
          if(events.at(-1)?.stage===event.stage)return
          events.push({...event,at:Date.now()})
          if(events.length>18)events.shift()
          persist(job)
        } : undefined
        if(trace)trace({stage:'context'})
        else persist(job)
        // A room sees only its own published turns. Never recall private notes,
        // files or another room into a multi-provider conversation.
        const context = room ? {
          group: room.name,
          members: room.roleIds, assignments:room.duties ?? {}, myAssignment:room.duties?.[id] ?? '',
          memberNames: Object.fromEntries(room.roleIds.map(role => [role, profiles[role]?.name ?? role])),
          userPortrait: portraits.context(id, room.id),
          history: (desktopEvidence ? [] : [...jobs.values()]).filter(previous => previous.topic === room.id && previous.id !== job.id && portraits.allowSource(id,room.id,previous.id))
            .slice(-8).map(previous => ({
              user: previous.text.slice(0, 1000),
              replies: previous.steps.filter(s => s.status === 'done').map(s => ({
                employee: s.roleId, output: s.output.slice(0, Math.floor(2400 / previous.steps.length)),
              })),
            })),
        } : job.mode==='team' ? {scope:'本次多人协作，只参考这次任务和先前步骤的公开交付。'} : await untilStepStops(recall(id, job.text, job.topic, job.mode==='chat',job.id),signal)
        signal.throwIfAborted()
        const isRelay=job.mode==='team' && !step.phase
        const earlier = job.steps
          .filter(s => s.status === 'done' && (step.phase !== 'work' || s.phase === 'plan') && (!desktopEvidence || s.phase==='plan' || s.phase==='assist' || (s.phase==='work' && !s.desktopReceipt)))
          .map(s => ({ employee: s.roleId, ...(isRelay ? {author:profiles[s.roleId]!.name || s.roleId} : {}),
            output: s.output.slice(0,desktopEvidence?1500:12000), ...(s.handoff ? {handoff:s.handoff} : {}) }))
        const relay=isRelay ? {
          actor:id, names:Object.fromEntries(job.roleIds.map(member=>[member,profiles[member]!.name || member])),
          officialNames:Object.fromEntries(job.roleIds.map(member=>[member,OFFICE_CHARACTER_CARDS[member].companionCard.data.name])),
          sourceTexts:attachments.filter(file=>file.mediaType==='text/plain').map(attachmentText),
          history:room && 'history' in context && Array.isArray(context.history) ? context.history.flatMap(turn=>turn.replies) : [],
          previousRequest:room && 'history' in context && Array.isArray(context.history) ? context.history.at(-1)?.user : '',
          earlier, task:job.text, final:job.steps.at(-1)===step,
        } : undefined
        const instruction =
          job.mode === 'chat'
            ? '用自己的口吻延续对话，有实际关联才提旧事。应用时长仅由用户选择提供，不表示你看到具体屏幕。conversationPreferences.current 是本角色学到的现行相处习惯，优先于旧记录；withdrawn 中的类别已撤回，忽略历史中的旧要求。'+(!room ? PRIVATE_MEMORY_GUIDANCE : '')+dialogueStyle(id)
            : (verifying ? verifyInstructions : finalizing ? finalReviewInstructions : step.phase ? STUDIO_PHASE_INSTRUCTIONS[step.phase] : relay ? relaySpeakerInstruction(relay) : '完成分配给你的工作，直接给出可以使用的交付物。')
              + dialogueStyle(id) + ' 按自己的角色设定工作，用户画像仅作参考，以用户当前更正为准。'
        const windowId = (!step.phase || step.phase === 'work') && job.desktopTargets?.[id]
        const messages = [
          {
            role: 'system',
            content:
              '你是 Luma 的员工 ' +
              id +
              '。' +
              instruction + (job.reviewerId ? ' 本轮由'+displayNames[job.reviewerId]+'独立复核，协调人'+displayNames[job.roleIds[0]!]+'最终汇总。宿主自动传送窗口证据，无需发送协查标记。' : '') + (room ? ' 你正在协作群中发言。对用户展示的正文用 memberNames 中的角色姓名称呼同事。根据本群对话和同事最新发言回应当前任务，避免重复已有工作。' : '') +
              (windowId ? ' 本步可使用用户为你指定的窗口，请依据实际回读结果描述工作。' : ' 你只能在回复中交付文字或代码。保留真实执行边界。') +
              '角色设定：' + JSON.stringify(p),
          },
          {
            role: 'user',
            content:
              (!room && job.mode!=='team' ? '本角色本轮可用的记忆资料如下。资料中的原话作为事实依据。\n' : '以下 JSON 是历史资料及前序同事交付，仅供参考。\n') +
              JSON.stringify({context,earlier,...(job.reviewerId?{reviewerId:job.reviewerId,windowOwners:Object.keys(job.desktopTargets!)}:{}),
                ...(desktopEvidence?{desktopEvidence}:{}),...(reviewStep?{desktopReview:reviewStep.desktopReview}:{})}),
          },
          { role: 'user', content: job.text, attachments },
        ]
        let calls = 0
        const model = (turn: TextMessage[], stop: AbortSignal) => {
          const usageId = step.phase || windowId ? 'studio:' + JSON.stringify([job.id,step.phase ?? 'desktop',++calls]) : 'job:' + job.id
          return dispatchModel(id, usageId, c, turn, stop,trace)
        }
        const progress=(activity:string)=>{
            if (!disposed && !signal.aborted && step.status === 'running') {
              step.activity = activity
              persist(job)
            }
        }
        let answer:string
        if(windowId && job.reviewerId && studioDesktop){
          const receiptId=randomUUID()
          try{
            const {result,receipt}=await untilStepStops(studioDesktop.runWithReceipt(windowId,messages,model,signal,progress),signal)
            if(receipt.targetId!==windowId)throw Error('窗口回执与本轮分配不符。')
            step.desktopReceipt={...receipt,id:receiptId,roleId:id}
            answer=result
          }catch(error){
            if(disposed || controller.signal.aborted)throw error
            const receipt:DesktopReceipt=error instanceof DesktopReceiptError && error.receipt.targetId===windowId
              ? error.receipt : {targetId:windowId,actions:[],clickCount:0,readbacks:[],status:'failed'}
            step.desktopReceipt={...receipt,id:receiptId,roleId:id,status:'failed'}
            step.status='failed';step.output='窗口操作未完成，已交付可核实的操作记录。';delete step.activity
            persist(job)
            return
          }
        }else answer=await untilStepStops(windowId && studioDesktop ? studioDesktop.run(windowId,messages,model,signal,progress) : model(messages,signal),signal)
        if (disposed || signal.aborted) throw Error('任务已停止。')
        if(verifying && desktopEvidence){
          let verdict=parseStudioReview(answer,desktopEvidence)
          if(!verdict){
            const retry=await untilStepStops(model([...messages,{role:'assistant',content:answer.slice(0,2400)},{role:'user',content:verifyFormatRetry}],signal),signal)
            verdict=parseStudioReview(retry,desktopEvidence)
          }
          step.desktopReview=verdict??inconclusiveReview(desktopEvidence)
          answer=studioReviewText(step.desktopReview,desktopEvidence,displayNames)
        }
        if(finalizing && reviewStep?.desktopReview && desktopEvidence){
          step.reviewedReceiptIds=reviewStep.desktopReview.map(row=>row.receiptId)
          // If any check failed, publish the independent verdicts verbatim; free synthesis must never reverse them.
          if(reviewStep.desktopReview.some(row=>row.verdict!=='pass'))
            answer='根据'+displayNames[job.reviewerId!]+'的独立复核：\n'+studioReviewText(reviewStep.desktopReview,desktopEvidence,displayNames)
        }
        if (relay && relayNeedsRevision(answer,relay)) {
          // Only revise the text. Once a window has been used, running its actions again would duplicate side effects.
          answer=await untilStepStops(dispatchModel(id,'relay-revision:'+job.id,c,[
            ...messages,
            {role:'assistant',content:answer},
            {role:'user',content:relayRevisionInstruction},
          ],signal,trace),signal)
          if (disposed || signal.aborted) throw Error('任务已停止。')
          if (relayNeedsRevision(answer,relay)) throw Error('模型服务未能给出当前成员自己的接力发言，本步未发布。')
        }
        const result = step.phase ? parsePeerRequest(answer,id,job.roleIds,step.phase==='work') : {output:answer}
        if (result.request) step.handoff = result.request
        completeStep(job, step, result.output)
        void flush()
    }
    async function runParallel(steps:Step[]) {
        const results = await Promise.allSettled(steps.map(async step => {
          try { await runStep(step) }
          catch (error) {
            if (!controller.signal.aborted && !disposed) { step.status = 'failed'; persist(job) }
            throw error
          }
        }))
        const failed = results.find(result => result.status === 'rejected')
        if (failed?.status === 'rejected') throw failed.reason
    }
    try {
      job.status = 'running'
      persist(job)
      if (job.workflow === 'studio') {
        await runStep(job.steps[0]!)
        await runParallel(job.steps.filter(step => step.phase === 'work'))
        controller.signal.throwIfAborted()
        const requested = new Set(job.steps.flatMap(step => step.handoff && step.handoff.to!==job.reviewerId ? [step.handoff.to] : []))
        if (requested.size) {
          const assists:Step[] = [...requested].map(roleId => ({
            roleId, model:services[roleId]!.model, phase:'assist', status:'queued', output:'',
          }))
          job.steps.splice(job.steps.findIndex(s=>s.phase===(job.reviewerId?'verify':'review')),0,...assists)
          persist(job)
          await runParallel(assists)
        }
        const verifier=job.steps.find(s=>s.phase==='verify')
        if(verifier)await runStep(verifier)
        await runStep(job.steps.at(-1)!)
      } else {
        for (const step of job.steps) await runStep(step)
      }
    } catch (e) {
      // Explicit cancellation has already persisted the correct reason and released the roles.
      if (controller.signal.aborted) return
      job.status = 'failed'
      job.error = e instanceof Error && (e.message.startsWith('模型服务') || e.message.startsWith('本机交付') || e.message.startsWith('桌面') || e.message.startsWith('窗口'))
          ? e.message
          : '模型请求失败或超时，请检查员工服务地址和连接。'
      for (const s of job.steps)
        if (s.status === 'running') s.status = job.status
        else if (s.status === 'queued') s.status = 'cancelled'
    } finally {
      active.delete(job.id)
      if (!disposed && jobs.get(job.id) === job) persist(job)
    }
  }
  async function call(action: string, b: Data) {
    if (disposed) throw Error('插件已停用。')
    const unlocked = readUnlockedEmployees()
    const requested = [...(b.roleId === undefined ? [] : [b.roleId]), ...(Array.isArray(b.roleIds) ? b.roleIds : [])]
    if (requested.some(id => !unlocked.includes(role(id)))) throw new EmployeeLockedError('这位伙伴尚未入职，请先在卡牌收藏中兑换。')
    if (action==='speechstatus') return desktopSpeech.status()
    if (action==='readspeech' || action==='stopspeech') {
      const key=string(b.key,710)
      if (!/^reply\/[\w.%:~/-]{1,700}$/.test(key)) throw Error('回复标识无效。')
      if (action==='readspeech') return desktopSpeech.start(key,string(b.text,200000))
      desktopSpeech.stop(key)
      return {stopped:true}
    }
    if (action === 'desktopstatus') return studioDesktop ? studioDesktop.status() : {available:false,message:'当前宿主未安装桌面组件。'}
    if (action === 'desktoppreview') {
      if (!studioDesktop || typeof b.targetId !== 'string' || !/^[0-9a-f]{64}$/.test(b.targetId) || (b.view !== 'screen' && b.view !== 'browser'))
        throw Error('请选择有效的预览窗口和视图。')
      return studioDesktop.preview(b.targetId,b.view)
    }
    if (action === 'desktoptargets') {
      if (!studioDesktop) throw Error('当前宿主未安装桌面组件。')
      return {targets: await studioDesktop.targets()}
    }
    if (action === 'providers') return {providers:options(native?.llm?.listProviders() ?? [])}
    if (action === 'localproviders') return {providers:await localHarness.providers()}
    if (action === 'models') {
      const provider=string(b.provider,180)
      if(b.source==='local') return {models:options(await localHarness.models(provider))}
      const models=await hostModels(provider).listModels(provider).catch(()=>{throw Error('DSH 无法读取这个服务的模型列表。')})
      return {models:options(models)}
    }
    if (action === 'reasoning') return (b.source==='local'?harnessReasoning:modelReasoning)(string(b.provider,180),string(b.model,180))
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
      const visible=history.visibility()
      const previews: Record<string, {text: string; time: number}> = {}
      const latest = db.prepare("SELECT id,substr(assistant,1,100) AS text,createdAt AS time FROM employee_private_notes WHERE role=? AND topic!='notes' AND assistant!='' ORDER BY createdAt DESC,noteOrder DESC")
      for (const roleId of unlocked) {
        for(const row of latest.iterate(roleId)) {
          if(!visible.note(String(row.id))) continue
          previews[roleId] = { text: String(row.text), time: Number(row.time) }
          break
        }
      }
      const roles = Object.fromEntries(
        WORK_ROLE_IDS.filter(id => unlocked.includes(id)).map((id) => {
          const c = config(id)
          return [id, { protocol:modelProtocol(c.protocol), baseUrl:c.baseUrl, model:c.model, hasKey:Boolean(c.secret),
            source:c.localHarness ? 'local' : c.provider ? 'dsh' : 'custom', provider:c.localHarness || c.provider, effort:c.effort }]
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
        letters:life.history().filter(visible.letter),
        memories,
        rooms: [...rooms.values()].filter(room => room.roleIds.every(id => unlocked.includes(id))),
        jobs: [...jobs.values()].filter(job => visible.job(job) &&
          (rooms.get(job.topic)?.roleIds ?? job.roleIds).every(id => unlocked.includes(id))).sort((a, b) => a.createdAt - b.createdAt),
        loveHouse: {
          available: await loveHouseAvailable(),
          connected: Object.keys(house.libraries).length === 8,
          ...(portable ? {portableAvailable:await hasPortableLibraries(), reusedPortable:house.source === 'portable'} : {}),
          localRecallRoles:unlocked.filter(id=>!portraits.canRecallRemote(id) || previewRoomRoles.has(id)),
          pending: Number(db.prepare('SELECT count(*) AS n FROM portrait_recallable_notes WHERE synced=0').get()!.n),
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
      if (b.source==='local') {
        const provider=string(b.provider,180), model=string(b.model,180), available=await harnessReasoning(provider,model)
        if (effort && !available.efforts.some(item=>item.id===effort)) throw Error('本机模型不支持选择的思考强度。')
        db.prepare("UPDATE configs SET baseUrl='',secret='',protocol='openai',model=?,provider='',localHarness=?,effort=? WHERE role=?").run(model,provider,effort,id)
        return {saved:true}
      }
      if (b.source==='dsh') {
        const provider=string(b.provider,180), model=string(b.model,180)
        const available=await modelReasoning(provider,model)
        if (effort && !available.efforts.some(item=>item.id===effort)) throw Error('该 DSH 模型不支持选择的思考强度。')
        db.prepare("UPDATE configs SET baseUrl='',secret='',protocol='openai',model=?,provider=?,localHarness='',effort=? WHERE role=?").run(model,provider,effort,id)
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
      db.prepare("UPDATE configs SET baseUrl=?,model=?,secret=?,protocol=?,provider='',localHarness='',effort=? WHERE role=?").run(url,model,secret,protocol,model ? effort : '',id)
      return { saved: true }
    }
    if (['portrait','portraitedit','portraitforget','portraitconfigure'].includes(action)) {
      const employee=role(b.roleId)
      if (action==='portraitedit' || action==='portraitforget') {
        if (!Number.isSafeInteger(b.revision)) throw Error('画像版本无效。')
        portraits.review(employee,token(b.id),Number(b.revision),action==='portraitedit'?string(b.text,260):'')
      }
      if (action==='portraitconfigure') {
        if (typeof b.automatic!=='boolean' || typeof b.modelReview!=='boolean') throw Error('画像设置无效。')
        if (b.modelReview && !config(employee).model) throw Error('请先为角色绑定模型，再开启模型整理。')
        portraits.configure(employee,b.automatic,b.modelReview)
      }
      const pref=portraits.prefs(employee)
      return {items:portraits.list(employee),automatic:Boolean(pref.automatic),modelReview:Boolean(pref.modelReview),notice:portraits.notice(employee),
        remoteRecall:!portraits.canRecallRemote(employee)?'filtered':previewRoomRoles.has(employee)?'legacy':house.libraries[employee]?'bound':'unbound',
        modelAvailable:Boolean(config(employee).model),scopeNames:Object.fromEntries([...rooms].filter(([,r])=>r.roleIds.includes(employee)).map(([id,r])=>[id,r.name]))}
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
        if (deletedJobs.has(token(b.id))) throw Error('这条本地记录已经删除。')
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
      return { context: JSON.stringify(await recall(employee, string(b.query, 32000), topic, b.privateChat === true,
        b.journalId===undefined ? undefined : token(b.journalId))) }
    }
    if (action === 'cancel') {
      const id = token(b.id)
      return { cancelled: cancelJob(id, '任务已停止。') }
    }
    if (action === 'deletejob') return history.deleteLegacy(token(b.id),unlocked)
    if (['archivedrecords','archiverecord','restorerecord','deleterecord','readrecord'].includes(action)) {
      const scope={...(b.roomId!==undefined ? {roomId:token(b.roomId)} : {}),...(b.roleId!==undefined ? {roleId:role(b.roleId)} : {})}
      if(action==='archivedrecords') return history.list({kind:'topic',...scope},unlocked)
      if(b.kind==='job') return history.mutate(action,{kind:'job',id:token(b.id),...scope},unlocked)
      if(b.kind==='topic') return history.mutate(action,{kind:'topic',topic:token(b.topic),...scope},unlocked)
      throw Error('请选择一条工作记录或独立话题。')
    }
    if (action === 'createroom') {
      const id = 'room-' + token(b.requestId), name = string(b.name, 60)
      const roleIds = Array.isArray(b.roleIds) ? b.roleIds.map(role) : []
      if (roleIds.length < 2 || roleIds.length > WORK_ROLE_IDS.length || new Set(roleIds).size !== roleIds.length)
        throw Error('请选择至少两位不同的群成员。')
      const requestedDuties = b.duties === undefined ? {} : object(b.duties)
      if (b.workflow !== undefined && b.workflow !== 'studio' && b.workflow !== 'relay') throw Error('请选择有效的协作方式。')
      if (Object.keys(requestedDuties).some(key=>!roleIds.includes(key))) throw Error('分工只能指定给群成员。')
      const duties = Object.fromEntries(roleIds.flatMap(key=>{
        const duty=string(requestedDuties[key] ?? '',180,true)
        return duty ? [[key,duty]] : []
      }))
      const prior = rooms.get(id)
      if (prior) {
        if (prior.name !== name || prior.roleIds.join() !== roleIds.join() || (prior.workflow ?? 'relay') !== (b.workflow ?? 'relay') || JSON.stringify(prior.duties ?? {}) !== JSON.stringify(duties)) throw Error('群聊创建编号已被使用。')
        return prior
      }
      if (id.length > 180 || [...jobs.values()].some(job => job.topic === id)) throw Error('该群聊编号无效或已被使用。')
      const room:WorkRoom = { id, name, roleIds, createdAt: Date.now(), ...(b.workflow === 'studio' ? {workflow:'studio'} : {}), ...(Object.keys(duties).length ? {duties} : {}) }
      db.prepare('INSERT INTO rooms VALUES(?,?)').run(id, JSON.stringify(room))
      rooms.set(id, room)
      return room
    }
    if (action !== 'run') throw Error('未知操作。')
    const id = token(b.requestId),
      prior = jobs.get(id)
    const attachments = validateChatAttachments(b.attachments)
    if (deletedJobs.has(id)) throw Error('这项工作已删除，请以新任务提交。')
    const attachmentDigest = attachments.length ? hashAttachments(attachments) : undefined
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
    const room = rooms.get(topic)
    history.assertCanRun(id,ids,topic)
    const workflow = b.workflow ?? (mode === 'team' ? room?.workflow : undefined) ?? 'relay'
    if (workflow !== 'relay' && workflow !== 'studio') throw Error('请选择有效的协作方式。')
    if (workflow === 'studio' && (!room || mode !== 'team' || ids.join() !== room.roleIds.join()))
      throw Error('请在工作室中选择全体成员，再由协调人分派本轮任务。')
    const targets = object(b.desktopTargets ?? {})
    if (Object.keys(targets).some(key => !ids.includes(key))) throw Error('窗口只能分配给本轮参与的成员。')
    const desktopTargets: Record<string,string> = {}
    for (const key of ids) {
      if (targets[key] === undefined) continue
      if ((!room && mode !== 'task') || mode === 'chat' || !studioDesktop || typeof targets[key] !== 'string' || !/^[0-9a-f]{64}$/.test(targets[key])) throw Error('桌面窗口选择无效，请重新选择。')
      desktopTargets[key] = targets[key]
    }
    const reviewers=workflow==='studio' ? studioReviewers(ids,desktopTargets,room?.duties) : {available:[],suggested:undefined}
    const reviewerId=b.reviewerId===undefined ? (prior?prior.reviewerId:reviewers.suggested) : role(b.reviewerId)
    if(reviewerId && !reviewers.available.includes(reviewerId))throw Error('独立复核人必须是本轮未分配窗口且不担任协调人的工作室成员。')
    if (prior) {
      if (
        prior.text !== text || prior.attachmentDigest !== attachmentDigest ||
        prior.mode !== mode || (prior.workflow ?? 'relay') !== workflow || prior.reviewerId!==reviewerId ||
        JSON.stringify(prior.desktopTargets ?? {}) !== JSON.stringify(desktopTargets) ||
        prior.topic !== topic ||
        prior.roleIds.join(',') !== ids.join(',')
      )
        throw Error('该请求编号已用于另一项工作。')
      return prior
    }
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
    if (ids.some(id=>services[id]!.localHarness) && attachments.some(file=>file.mediaType!=='text/plain' && !file.mediaType.startsWith('image/')))
      throw Error('本机订阅模型目前支持图片和 UTF-8 文本附件。')
    if (ids.some(id=>services[id]!.provider) && attachments.some(file=>file.mediaType!=='text/plain' && !file.mediaType.startsWith('image/')))
      throw Error('参与员工的 DSH 模型通道支持图片和文本。发送 PDF 请选用支持 PDF 的自定义服务，或转到 DSH 原生会话。')
    if (
      [...jobs.values()].some(
        j => ['queued', 'running'].includes(j.status) && j.roleIds.some(r => ids.includes(r)) &&
          (j.topic === topic || (j.mode !== 'chat' && mode !== 'chat')),
      )
    )
      throw Error('选中的员工已有任务，请待完成后再派工。工作期间可在独立话题中继续私聊。')
    const submitted = b.profiles ? object(b.profiles) : {}
    const saved = readSavedProfiles()
    const profiles:Record<string,WorkPersona> = {}
    for (const id of ids) {
      const defaults = saved[id] ?? OFFICE_CHARACTER_CARDS[id].companionCard.data
      const override = submitted[id] === undefined ? {} : object(submitted[id])
      if (Object.keys(override).some(key => !['name','personality','scenario'].includes(key))) throw Error('角色设定字段无效。')
      profiles[id] = {
        name: override.name === undefined ? defaults.name : string(override.name,80,true),
        personality: override.personality === undefined ? defaults.personality : string(override.personality,12000,true),
        scenario: override.scenario === undefined ? defaults.scenario : string(override.scenario,8000,true),
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
      ...(workflow === 'studio' ? {workflow} : {}),
      ...(reviewerId ? {reviewerId} : {}),
      ...(Object.keys(desktopTargets).length ? {desktopTargets} : {}),
      status: 'queued',
      steps: (workflow === 'studio' ? studioSteps(ids,reviewerId,desktopTargets) : ids.map(roleId => ({roleId})))
        .map(step => ({ ...step, model:services[step.roleId]!.model, status: 'queued', output: '' })),
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
      let body = '', size = 0
      for await (const chunk of req.setEncoding('utf8')) {
        if (action !== 'run') {
          size += Buffer.byteLength(chunk)
          if (size > 1024 * 1024) throw Error('请求过大。')
        }
        body += chunk
      }
      const value = await call(action, object(JSON.parse(body)))
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
      desktopSpeech.dispose()
      portraits.dispose()
      life.dispose()
      cloudOffice.dispose()
      try {
        for (const id of active.keys()) cancelJob(id, '插件已停用，未完成的步骤已取消。')
      } finally { db.close() }
    },
  }
}

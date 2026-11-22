import { open, readFile, readdir, realpath, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join, basename, dirname, isAbsolute } from 'node:path'
import { spawn, execFileSync } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'

const names: Record<string, string> = {
  shan: '端木嫣',
  'bai-shuangming': '白霜命',
  'lu-mi': '陆弥',
  jingyuniang: '鲸鱼娘',
  longmama: '龙妈妈',
  claude: '克劳德',
  gemini: '吉米',
  grok: '绯洛',
}
interface WindowsUserFolders { profile:string; desktop:string; local:string; roaming:string }
let folders: WindowsUserFolders | undefined
function userFolders(): WindowsUserFolders {
  if(folders) return folders
  if(process.platform==='win32') {
    // The portable DSH runner has its own USERPROFILE. Resolve the actual
    // Windows profile first, then expand redirected Known Folders in that context.
    const script = [
      "$env:USERPROFILE=[Environment]::GetFolderPath('UserProfile')",
      "$k=[Microsoft.Win32.Registry]::CurrentUser.OpenSubKey('Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\User Shell Folders')",
      "function folder($name,$fallback){$raw=$k.GetValue($name,$fallback,[Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames); [Environment]::ExpandEnvironmentVariables($raw)}",
      "$v=@{profile=$env:USERPROFILE; desktop=(folder 'Desktop' '%USERPROFILE%\\Desktop'); local=(folder 'Local AppData' '%USERPROFILE%\\AppData\\Local'); roaming=(folder 'AppData' '%USERPROFILE%\\AppData\\Roaming')}",
      "[Console]::Out.Write([Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes(($v | ConvertTo-Json -Compress))))",
    ].join('; ')
    const windows=process.env.SystemRoot??'C:\\Windows'
    const command=join(windows,'System32','WindowsPowerShell','v1.0','powershell.exe')
    const encoded=execFileSync(command,['-NoProfile','-NonInteractive','-Command',script],{encoding:'utf8',timeout:8000,windowsHide:true})
    const value=JSON.parse(Buffer.from(encoded,'base64').toString('utf8')) as WindowsUserFolders
    if([value.profile,value.desktop,value.local,value.roaming].every(p=>typeof p==='string'&&isAbsolute(p))){
      folders=value
      return value
    }
  }
  return {profile:homedir(),desktop:join(homedir(),'Desktop'),local:process.env.LOCALAPPDATA??'',roaming:process.env.APPDATA??''}
}
interface HouseInstallation { path:string; version?:string }
const versionOrder = new Intl.Collator('en',{ numeric:true })
let installed: { until:number; result:Promise<HouseInstallation | undefined> } | undefined

async function findInstallation(): Promise<HouseInstallation | undefined> {
  if (process.env.LUMA_LOVEHOUSE_RUNTIME_FILE) return undefined
  const user = userFolders()
  const companionPaths = await Promise.all([user.desktop,user.local].map(async parent=>{
    const directory=join(parent,'Luma-DSH','companions')
    const bundles=await readdir(directory,{withFileTypes:true}).catch(()=>[])
    return bundles.filter(entry=>entry.isDirectory() && /^LoveHouse-\d[\w.-]*$/i.test(entry.name))
      .map(entry=>join(directory,entry.name,'LoveHouse','LoveHouse.exe'))
  }))
  const paths = [
    join(user.desktop,'爱之屋.exe'),join(user.desktop,'LoveHouse.exe'),join(user.profile,'OneDrive','Desktop','爱之屋.exe'),
    join(user.local,'Programs','LoveHouse','LoveHouse.exe'),
    ...companionPaths.flat(),
    ...(process.env.ProgramFiles ? [join(process.env.ProgramFiles,'LoveHouse','LoveHouse.exe')] : []),
  ]
  const candidates: HouseInstallation[] = []
  for (const target of paths) {
    try {
      const path = await realpath(target)
      if (basename(path).toLowerCase() !== 'lovehouse.exe' || candidates.some(item=>item.path===path)) continue
      const readme = await readFile(join(dirname(path),'WINDOWS-README.txt'),'utf8').catch(()=>'')
      const version = /^\uFEFF?Love House\s*\/\s*爱之屋\s+(\d+\.\d+\.\d+(?:rc\d+)?)(?=\s|$)/i.exec(readme)?.[1]
      candidates.push({path,version})
    } catch {}
  }
  return candidates.sort((a,b) => {
    const [av,ar] = (a.version ?? '').split('rc'), [bv,br] = (b.version ?? '').split('rc')
    return versionOrder.compare(bv!,av!) || Number(br ?? Infinity)-Number(ar ?? Infinity)
  })[0]
}
function installation() {
  if (process.env.LUMA_LOVEHOUSE_RUNTIME_FILE) return Promise.resolve(undefined)
  if (!installed || Date.now() >= installed.until) installed={until:Date.now()+15000,result:findInstallation()}
  return installed.result
}
export interface HouseBinding {
  instance: string
  libraries: Record<string, string>
  source?: 'portable'
  directory?: string
}
export const houseRuntime = (directory?:string) => process.env.LUMA_LOVEHOUSE_RUNTIME_FILE ?? (directory ? join(directory,'.runtime','app.json') : undefined)
/** Accept an existing local directory. No executable paths or remote URLs are configurable. */
export async function localHouseDirectory(value:unknown) {
  if (value === '') return undefined
  if (typeof value !== 'string' || !isAbsolute(value) || value.length>512 || /^[/\\]{2}/.test(value) || /[\x00-\x1f]/.test(value))
    throw Error('请选择本机的爱之屋数据文件夹。')
  const path = await realpath(value).catch(()=>undefined)
  if (!path || /^[/\\]{2}/.test(path) || !(await stat(path)).isDirectory()) throw Error('找不到此本机数据目录。')
  return path
}
export function portableDesktopDirectory() { return userFolders().desktop }

/** The portable profile stores this short instance tag and eight public library IDs. */
export function parsePortableBinding(value: unknown): HouseBinding | undefined {
  if (!value || typeof value !== 'object') return
  const {instance, libraries} = value as Partial<HouseBinding>
  if (typeof instance !== 'string' || !/^[0-9a-f]{8}$/i.test(instance) ||
      !libraries || typeof libraries !== 'object' || Array.isArray(libraries)) return
  const ids = Object.keys(names)
  if (Object.keys(libraries).length !== ids.length ||
      ids.some(id => !Object.hasOwn(libraries,id) || typeof libraries[id] !== 'string' || !/^[\w-]{1,180}$/u.test(libraries[id]!)) ||
      new Set(ids.map(id=>libraries[id])).size !== ids.length) return
  return {instance,libraries:Object.fromEntries(ids.map(id=>[id,libraries[id]!]))}
}
export async function loveHouseAvailable() {
  return Boolean(await installation())
}

async function discoverService(runtimeFile = process.env.LUMA_LOVEHOUSE_RUNTIME_FILE, requireInstance = false) {
  if (!runtimeFile) {
    const user=userFolders()
    if (!user.local) throw Error('请先打开本机爱之屋。')
    runtimeFile = join(user.local, 'LoveHouse', '.runtime', 'app.json')
  }
  const info = JSON.parse(
    await readFile(runtimeFile, 'utf8'),
  )
  if (!Number.isInteger(info.controller_port) || info.controller_port < 1 || info.controller_port > 65535)
    throw Error('爱之屋尚未就绪。')
  const origin = 'http://127.0.0.1:' + info.controller_port
  const health = await (
    await fetch(origin + '/api/health', { redirect: 'error', signal: AbortSignal.timeout(3000) })
  ).json()
  if (
    health.ok !== true ||
    health.mode !== 'storage' ||
    (requireInstance && (typeof info.controller_instance_id !== 'string' || !info.controller_instance_id || !info.service_version)) ||
    (info.controller_instance_id && health.controller_instance_id !== info.controller_instance_id) ||
    (health.protocol_version ?? health.version) !== info.service_version
  )
    throw Error('当前爱之屋版本不支持独立记忆库。')
  return {origin, version: typeof health.version === 'string' ? health.version : undefined, protocol: info.service_version as string}
}
async function discover(runtimeFile?:string, requireInstance=true) { return (await discoverService(runtimeFile,requireInstance)).origin }

/** This check never creates libraries or starts an application. */
export async function inspectHouse(binding:HouseBinding) {
  const launchVersion=(await installation())?.version
  const bound = Object.keys(binding.libraries).length
  let service
  try { service = await discoverService(houseRuntime(binding.directory),true) }
  catch { return {status:'offline' as const,bound,verified:0,launchVersion} }
  const base = {bound,launchVersion,version:service.version,protocol:service.protocol}
  try {
    const index = await request(service.origin,'/api/libraries')
    if (!Array.isArray(index.libraries)) throw Error()
    const verified = Object.entries(binding.libraries).filter(([role,id]) => {
      const expected = roleLibraryName(binding,role)
      const rows = index.libraries.filter((row:{ id?:string;name?:string;is_demo?:boolean })=>row && (row.id === id || row.name === expected))
      return rows.length===1 && rows[0].id===id && rows[0].name===expected && !rows[0].is_demo
    }).length
    return {...base,verified,status:verified!==bound?'mismatch' as const:bound===Object.keys(names).length?'connected' as const:'unbound' as const}
  } catch { return {...base,verified:0,status:'unverified' as const} }
}
/** Verification is GET-only. Reusing a binding never creates or selects a library. */
export async function verifyPortableLibraries(binding: HouseBinding, runtimeFile?: string) {
  let index
  try {
    const origin = await discover(runtimeFile, true)
    index = await request(origin, '/api/libraries')
  } catch {
    throw Error('无法核验当前爱之屋实例。请打开桌面爱之屋后再复用，离线期间可继续使用本机记忆。')
  }
  if (!Array.isArray(index.libraries)) throw Error('爱之屋未返回可核验的员工库。')
  for (const [role, roleName] of Object.entries(names)) {
    const id = binding.libraries[role], name = 'Luma · ' + roleName + ' · ' + binding.instance
    const rows = index.libraries.filter((row: {id?:string;name?:string}) => row && (row.id === id || row.name === name))
    if (rows.length !== 1 || rows[0].id !== id || rows[0].name !== name || rows[0].is_demo) {
      throw Error(roleName + '的旧记忆库与当前爱之屋不匹配。请检查服务及库名称后重试。')
    }
  }
}
async function request(origin: string, route: string, library?: string, body?: object) {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (library) headers['X-NKB-Library'] = library
  const res = await fetch(origin + route, {
    method: body ? 'POST' : 'GET',
    headers,
    ...(body ? { body: JSON.stringify(body) } : {}),
    redirect: 'error',
    signal: AbortSignal.timeout(18000),
  })
  if (!res.ok) throw Error('爱之屋接口未完成操作（HTTP ' + res.status + '）。')
  return res.json()
}
export async function houseRunning(directory?:string) {
  try { await discover(houseRuntime(directory)); return true } catch { return false }
}
const launching = new Map<string, Promise<string>>()
// Windows LoveHouse locks byte zero throughout startup, operation and shutdown.
// A read-only probe also distinguishes a stale app.json from a live writer.
async function writerBusy(directory:string) {
  if (process.platform!=='win32') return false
  let lock
  try {
    lock=await open(join(directory,'.desktop-writer.lock'),'r')
    await lock.read(Buffer.alloc(1),0,1,0)
    return false
  } catch (err) {
    const code=(err as NodeJS.ErrnoException).code
    if (code==='ENOENT') return false
    if (code==='EBUSY' || code==='EPERM' || code==='EACCES') return true
    throw err
  } finally { await lock?.close() }
}
export async function openLoveHouse(launch:boolean,directory?:string) {
  if (!launch) return ensureLoveHouse(false,directory)
  const key = houseRuntime(directory) ?? 'default'
  const pending = launching.get(key)
  if (pending) return pending
  const ready = ensureLoveHouse(true,directory).finally(()=>{ launching.delete(key) })
  launching.set(key,ready)
  return ready
}
async function ensureLoveHouse(launch: boolean,directory?:string) {
  const runtime = houseRuntime(directory)
  let origin: string
  try {
    origin = await discover(runtime)
  } catch {
    if (!launch || process.env.LUMA_LOVEHOUSE_RUNTIME_FILE) throw Error('爱之屋离线，记忆已保存在本机。')
    const dataDir=directory ?? join(userFolders().local,'LoveHouse')
    if (await writerBusy(dataDir)) {
      for(let i=0;i<6;i++){
        await sleep(500)
        try { return await discover(runtime) } catch {}
      }
      throw Error('该数据目录中的爱之屋正在运行，记忆服务尚未就绪。请稍后重试，或先正常退出爱之屋再连接。')
    }
    const app = (await installation())?.path
    if (!app) throw Error('未找到桌面爱之屋。请先打开爱之屋，再连接。')
    await new Promise<void>((ok, fail) => {
      const user=userFolders()
      const env={...process.env,USERPROFILE:user.profile,HOME:user.profile,APPDATA:user.roaming,LOCALAPPDATA:user.local,
        TEMP:join(user.local,'Temp'),TMP:join(user.local,'Temp')}
      const child = spawn(app, ['--data-dir',dataDir], { env,detached: true, stdio: 'ignore', windowsHide: true })
      child.once('error', fail)
      child.once('spawn', () => {
        child.unref()
        ok()
      })
    })
    let ready: string | undefined
    for (let i = 0; i < 40 && !ready; i++) {
      await sleep(500)
      try {
        ready = await discover(runtime)
      } catch {}
    }
    if (!ready) throw Error('爱之屋正在启动。就绪后请再次连接。')
    origin = ready
  }
  return origin
}
export async function connectLoveHouse(binding: HouseBinding, save: () => void, launch = true) {
  const origin = await openLoveHouse(launch,binding.directory)
  const index = await request(origin, '/api/libraries')
  let lastCreated: string | undefined
  try {
    for (const [id, name] of Object.entries(names)) {
      const libraryName = 'Luma · ' + name + ' · ' + binding.instance
      const previous = binding.libraries[id]
      if (previous) {
        const matches = index.libraries.filter((r: { id: string; name: string }) => r.id === previous || r.name === libraryName)
        if (matches.length !== 1 || matches[0].id !== previous || matches[0].name !== libraryName || matches[0].is_demo)
          throw Error(name + '的已绑定记忆库不可用，请在爱之屋恢复。')
        continue
      }
      const matches = index.libraries.filter(
        (r: { name: string; is_demo?: boolean }) => r.name === libraryName && !r.is_demo,
      )
      if (matches.length > 1) throw Error('发现同名的角色记忆库。')
      let lib = matches[0]
      if (!lib) {
        lib = (await request(origin, '/api/libraries', undefined, { name: libraryName })).library
        lastCreated = lib?.id
      }
      if (
        !lib ||
        typeof lib.id !== 'string' ||
        !/^[A-Za-z0-9_-]+$/u.test(lib.id) ||
        Object.values(binding.libraries).includes(lib.id)
      )
        throw Error('记忆库身份校验失败。')
      binding.libraries[id] = lib.id
      save()
    }
  } finally {
    if (
      lastCreated &&
      index.selected_id &&
      (await request(origin, '/api/libraries')).selected_id === lastCreated
    )
      await request(origin, '/api/library/select', undefined, { library_id: index.selected_id })
  }
}
async function verifiedOrigin(library: string, expectedName: string,directory?:string) {
  const origin = await discover(houseRuntime(directory))
  const index = await request(origin, '/api/libraries')
  const matches = Array.isArray(index.libraries) && index.libraries.filter((v: { id: string; name: string }) => v.id === library || v.name === expectedName)
  if (!matches || matches.length !== 1 || matches[0].id !== library || matches[0].name !== expectedName || matches[0].is_demo)
    throw Error('角色记忆库与本机绑定不匹配。')
  return origin
}
export function roleLibraryName(binding: HouseBinding, role: string) { return 'Luma · ' + names[role] + ' · ' + binding.instance }
export async function writeHouseMemory(
  library: string,
  id: string,
  session: string,
  user: string,
  assistant: string,
  expectedName: string,
  directory?:string,
) {
  const origin = await verifiedOrigin(library, expectedName,directory)
  const confirmed = (v: { saved?: boolean; id?: string }) => {
    if (v.saved !== true || !v.id) throw Error('爱之屋尚未确认写入。')
  }
  if (!user && assistant) {
    confirmed(await request(origin,'/api/ai/event',library,{
      text:'伙伴主动写来：'+assistant, source_url:'http://localhost/luma-agents/companionpulse',
      outcome:'observed', session_id:session, request_id:id, origin:'luma-dsh',
    }))
    return
  }
  if (!assistant) {
    confirmed(
      await request(origin, '/api/ai/event', library, {
        text: '员工记忆库收到手动笔记：\n' + user,
        source_url: 'http://localhost/luma-agents/remember',
        outcome: 'observed',
        session_id: session,
        request_id: id,
        origin: 'luma-dsh',
      }),
    )
    return
  }
  const split = (s: string) => s.match(/[\s\S]{1,39000}/gu) ?? []
  const users = split(user),
    replies = split(assistant),
    count = Math.max(users.length, replies.length)
  for (let i = 0; i < count; i++) {
    confirmed(
      await request(origin, '/api/ai/record', library, {
        user: users[i] || '〔原用户发言见第 1 段〕',
        assistant: replies[i] || '〔原回复见第 1 段〕',
        session_id: session,
        request_id: count === 1 ? id : id + '-' + (i + 1),
        origin: 'luma-dsh',
      }),
    )
  }
}
export async function recallHouse(library: string, query: string, session: string, expectedName: string,directory?:string) {
  const v = await request(await verifiedOrigin(library, expectedName,directory), '/api/ai/context', library, {
    query: query.slice(0, 4000),
    max_chars: 2500,
    session_id: session,
    origin: 'luma-dsh',
  })
  return JSON.stringify(v.memory_context ?? v).slice(0, 4500)
}

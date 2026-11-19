import { readFile, realpath } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join, basename, isAbsolute } from 'node:path'
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
async function executable() {
  const user=userFolders()
  for (const folder of [user.desktop, join(user.profile, 'OneDrive', 'Desktop')]) {
    try {
      const path = await realpath(join(folder, '爱之屋.exe'))
      if (basename(path).toLowerCase() === 'lovehouse.exe') return path
    } catch {}
  }
  return undefined
}
export interface HouseBinding {
  instance: string
  libraries: Record<string, string>
  source?: 'portable'
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
  return Boolean(await executable())
}

async function discover(runtimeFile?: string, requireInstance = false) {
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
  return origin
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
export async function connectLoveHouse(binding: HouseBinding, save: () => void) {
  let origin: string
  try {
    origin = await discover()
  } catch {
    const app = await executable()
    if (!app) throw Error('未找到桌面爱之屋。请先打开爱之屋，再连接。')
    await new Promise<void>((ok, fail) => {
      const user=userFolders()
      const env={...process.env,USERPROFILE:user.profile,HOME:user.profile,APPDATA:user.roaming,LOCALAPPDATA:user.local,
        TEMP:join(user.local,'Temp'),TMP:join(user.local,'Temp')}
      const child = spawn(app, ['--data-dir',join(user.local,'LoveHouse')], { env,detached: true, stdio: 'ignore', windowsHide: true })
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
        ready = await discover()
      } catch {}
    }
    if (!ready) throw Error('爱之屋正在启动。就绪后请再次连接。')
    origin = ready
  }
  const index = await request(origin, '/api/libraries')
  let lastCreated: string | undefined
  try {
    for (const [id, name] of Object.entries(names)) {
      const libraryName = 'Luma · ' + name + ' · ' + binding.instance
      const previous = binding.libraries[id]
      if (previous) {
        if (!index.libraries.some((r: { id: string; is_demo?: boolean }) => r.id === previous && !r.is_demo))
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
export async function writeHouseMemory(
  library: string,
  id: string,
  session: string,
  user: string,
  assistant: string,
) {
  const origin = await discover()
  const confirmed = (v: { saved?: boolean; id?: string }) => {
    if (v.saved !== true || !v.id) throw Error('爱之屋尚未确认写入。')
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
export async function recallHouse(library: string, query: string, session: string) {
  const v = await request(await discover(), '/api/ai/context', library, {
    query: query.slice(0, 4000),
    max_chars: 2500,
    session_id: session,
    origin: 'luma-dsh',
  })
  return JSON.stringify(v.memory_context ?? v).slice(0, 4500)
}

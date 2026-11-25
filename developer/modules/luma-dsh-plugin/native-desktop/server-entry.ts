import { releaseChecker } from './release-check.ts'
import { desktopPets, type DesktopPetCalendar } from './desktop-pet.ts'
import { createStudioDesktop } from '../src/host/studio-desktop.ts'
import { DatabaseSync } from 'node:sqlite'
import { join } from 'node:path'
import { resolveLumaProfileRoot } from './profile-data.mjs'
import { fileURLToPath } from 'node:url'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { ASSET_PREFIXES, createAssetHandler } from '../src/host/assets.ts'
import { createAgentWork } from '../src/host/agent-work.ts'
import { createEmployeeUsage, type EmployeeUsage, type LiveUsageSession, type UsageQuery } from '../src/host/employee-usage.ts'
import { createCollectionWallet } from './collection-wallet.ts'
import type { NativeModels } from '../src/host/dsh-models.ts'
import { readPortableBinding } from './portable-binding.ts'
import { employeeWorkspaceHandler, type EmployeeWorkspaceHost } from './employee-workspace.ts'
import { createEmployeePresetRoster, type DesktopPresetRegistry } from './employee-presets.ts'
import { verifyPortableLibraries } from '../src/host/love-house.ts'
import { prepareRoleHomes } from '../src/host/role-homes.ts'
import { MESSAGES_NAMESPACE, decodeMessageSettings, validateMessageSettings } from '../src/messages-settings.ts'
import { LOCAL_COLLECTION_SETTINGS_NAMESPACE, validateLocalCollectionSettings } from '../src/local-collection-settings.ts'
import { projectLocalCollectionSettings } from '../src/shared/local-collection-domain.ts'
import { isShopBedroomId } from '../src/shared/shop-bedrooms.ts'
import { OFFICE_PRESENTATION_NAMESPACE, decodeOfficePresentationSettings, validateOfficePresentationSettingsWire } from '../src/office-presentation-settings.ts'
import { PLUGIN_PREFERENCES_NAMESPACE, validatePluginPreferencesSettingsWire } from '../src/plugin-preferences-settings.ts'
import { CARD_LIBRARY_SETTINGS_NAMESPACE, validateCardLibrarySettingsWire } from '../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/card-library-settings.ts'
import { COLLECTION_SETTINGS_NAMESPACE, validateCollectionSettingsWire } from '../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/collection-settings.ts'
import { OFFICE_RELATIONSHIP_SETTINGS_NAMESPACE, validateOfficeRelationshipSettingsWire, type OfficeRelationshipSettingsWire } from '../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/office-relationship-settings.ts'

export const name = 'luma-dsh-plugin'
export const inject = ['webServer', 'connection', 'profileContext', 'workspaceRegistry', 'sessionQuery', 'agentPresets', 'llm', 'attachments']
type Section = Record<string, unknown>
type Handler = (req: IncomingMessage, res: ServerResponse) => Promise<void> | void
type Context = EmployeeWorkspaceHost & NativeModels & {
  sessionQuery: UsageQuery
  on?(name:'session/created'|'session/event', fn:(session:LiveUsageSession, event?:{type:string;data?:unknown}) => void, options:{global:boolean}): () => void
  agentPresets:DesktopPresetRegistry
  profileContext: { home: string; dir?: string; name?: string }
  connection: { browserPeer: object; admit: (req: IncomingMessage) => { peer?: object; rejection?: number } }
  webServer: { register: (route: {kind: string; path: string; handler: Handler}) => () => void }
  effect: (setup: () => () => void, label: string) => unknown
}
const sections = new Map<string, (value: unknown) => void>([
  [MESSAGES_NAMESPACE, validateMessageSettings],
  [LOCAL_COLLECTION_SETTINGS_NAMESPACE, validateLocalCollectionSettings],
  [OFFICE_PRESENTATION_NAMESPACE, validateOfficePresentationSettingsWire],
  [PLUGIN_PREFERENCES_NAMESPACE, validatePluginPreferencesSettingsWire],
  [CARD_LIBRARY_SETTINGS_NAMESPACE, validateCardLibrarySettingsWire],
  [COLLECTION_SETTINGS_NAMESPACE, validateCollectionSettingsWire],
  [OFFICE_RELATIONSHIP_SETTINGS_NAMESPACE, validateOfficeRelationshipSettingsWire],
])
const isObject = (value: unknown): value is Section => value !== null && typeof value === 'object' && !Array.isArray(value)
function send(res: ServerResponse, status: number, data: unknown) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' })
  res.end(JSON.stringify(data))
}

// Electron admits dsh-app://app, removes Origin and installs its signed cookie.
// Ask the running Host to authenticate that cookie and distinguish the local browser
// from the separate credentials it issues to API peers.
function ownerAdmission(ctx: Context, req: IncomingMessage) {
  const address = req.socket.remoteAddress?.replace(/^::ffff:/, '')
  if (!['127.0.0.1', '::1'].includes(address ?? '') || req.headers['sec-fetch-site'] === 'cross-site') return 403
  const admission = ctx.connection.admit(req)
  if (admission.rejection) return admission.rejection
  return ctx.connection.browserPeer && admission.peer === ctx.connection.browserPeer ? 0 : 403
}

function settingsHandler(db: DatabaseSync, homes: Record<string,string>, syncPresets:()=>Promise<void>, usage:EmployeeUsage) {
  db.exec('PRAGMA busy_timeout=3000; CREATE TABLE IF NOT EXISTS sections(ns TEXT PRIMARY KEY, revision INTEGER NOT NULL, value TEXT NOT NULL)')
  const read = db.prepare('SELECT revision,value FROM sections WHERE ns=?')
  const insert = db.prepare('INSERT OR IGNORE INTO sections VALUES(?,0,?)')
  const write = db.prepare('UPDATE sections SET value=?, revision=revision+1 WHERE ns=? AND revision=?')
  for (const ns of sections.keys()) insert.run(ns, '{}')
  const wallet = createCollectionWallet(db, usage)
  async function refreshWallet() {
    const progress = await usage.progress()
    const {revision} = wallet.reconcile()
    return {...progress, collectionRevision:revision}
  }
  function view(ns: string) {
    const row = read.get(ns)!
    const base = ns === MESSAGES_NAMESPACE ? { homes } : {}
    const user = JSON.parse(String(row.value))
    const effective = { ...base, ...user }
    return { ns, revision: Number(row.revision), user, effective, value: effective, base, secrets: [] }
  }
  const handle: Handler = async (req, res) => {
    if (req.method !== 'POST') return send(res, 405, {ok:false,error:'设置只接受 POST 请求。'})
    if (!/^application\/json(?:;|$)/i.test(req.headers['content-type'] ?? '')) return send(res, 415, {ok:false,error:'请选择 JSON 格式。'})
    try {
      const chunks: Buffer[] = []
      let bytes = 0
      for await (const part of req) {
        bytes += part.length
        if (bytes > 8 * 1024 * 1024) return send(res, 413, {ok:false,error:'设置超过容量限制。'})
        chunks.push(Buffer.from(part))
      }
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
      if (!isObject(body)) throw Error()
      if (body.action === 'describe') {
        await refreshWallet()
        return send(res, 200, {ok:true,value:{writable:true,namespaces:Array.from(sections.keys(), view)}})
      }
      if (body.action !== 'update' || typeof body.ns !== 'string' || !sections.has(body.ns) || !isObject(body.section)
          || !Number.isSafeInteger(body.expectedRevision) || Number(body.expectedRevision) < 0) throw Error()
      const ns = body.ns, section = { ...body.section }
      // The host chooses employee workspaces. A settings export cannot redirect them.
      if (ns === MESSAGES_NAMESPACE && Object.hasOwn(section, 'homes')) {
        if (!isObject(section.homes) || Object.entries(section.homes).some(([id, path]) => homes[id] !== path)) throw Error()
        delete section.homes
      }
      const expectedRevision = Number(body.expectedRevision)
      let conflict: boolean
      if (ns === LOCAL_COLLECTION_SETTINGS_NAMESPACE) {
        conflict = wallet.reconcile({section, expectedRevision, restore:body.restore === true}).conflict
      } else {
        sections.get(ns)!(section)
        if(ns===OFFICE_PRESENTATION_NAMESPACE && body.restore!==true){
          const selections=decodeOfficePresentationSettings(section)?.selection?.bedroomThemes??{}
          const previous=decodeOfficePresentationSettings(view(ns).user)?.selection?.bedroomThemes??{}
          const added=Object.entries(selections).flatMap(([id,theme])=>isShopBedroomId(theme) && previous[id as keyof typeof previous]!==theme?[theme]:[])
          if(added.length){
            const owned=projectLocalCollectionSettings(view(LOCAL_COLLECTION_SETTINGS_NAMESPACE).user).unlockedThemeIds
            if(added.some(id=>!owned.includes(id))) throw Error('卧室皮肤尚未购买。')
          }
        }
        conflict = !write.run(JSON.stringify(section), ns, expectedRevision).changes
      }
      if (conflict) return send(res, 409, {ok:false,code:'settings-conflict',error:'设置已在其他窗口更新，请重新读取。'})
      if (ns === LOCAL_COLLECTION_SETTINGS_NAMESPACE) {
        try { await syncPresets() } catch { return send(res,503,{ok:false,error:'收藏已保存，DSH 员工预设加载失败。请重新打开插件后重试。'}) }
      }
      return send(res, 200, {ok:true,value:view(ns)})
    } catch {
      return send(res, 400, {ok:false,error:'设置内容无效或无法保存。'})
    }
  }
  function readSavedProfiles() {
    const section = read.get(MESSAGES_NAMESPACE)
    return section ? decodeMessageSettings(JSON.parse(String(section.value)))?.preferences?.profiles ?? {} : {}
  }
  return {handle,refreshWallet,readSavedProfiles}
}

export async function apply(ctx: Context) {
  const root = await resolveLumaProfileRoot(ctx.profileContext)
  const homes = await prepareRoleHomes(join(root, 'characters'))
  const asset = createAssetHandler(fileURLToPath(new URL('../public/', import.meta.url)))
  const protect = (handler: Handler): Handler => (req, res) => {
    const status = ownerAdmission(ctx, req)
    if (status) return send(res, status, {ok:false,error:'请在本机 DSH 中使用 Luma。'})
    return handler(req, res)
  }
  let startup = Promise.resolve()
  ctx.effect(() => {
    const clean: (() => void | Promise<void>)[] = []
    const close = () => Promise.all(clean.splice(0).reverse().map(release=>release())).then(()=>{})
    try {
      const db = new DatabaseSync(join(root, 'desktop-settings.sqlite3'))
      clean.push(() => db.close())
      const releases = releaseChecker(db)
      clean.push(() => releases.close())
      clean.push(ctx.webServer.register({kind:'exact', path:'/luma-native/release', handler:protect(async (req,res)=>{
        if(req.method !== 'POST') return send(res,405,{error:'请使用 POST 请求。'})
        const query=new URL(req.url ?? '/', 'http://localhost').searchParams
        try { send(res,200,await releases.check(query.get('action') ?? 'auto',query.get('tag') ?? undefined)) }
        catch { send(res,400,{error:'无法完成版本检查。'}) }
      })}))
      const usage = createEmployeeUsage(db,ctx.sessionQuery,homes)
      clean.push(() => usage.dispose())
      const settings = settingsHandler(db, homes, () => presets.sync(), usage)
      if (ctx.on) {
        clean.push(ctx.on('session/created',session=>usage.created(session.header,session.firstLifecycleSeq ?? session.seq,session.inheritedEventCount),{global:true}))
        clean.push(ctx.on('session/event',(session,event)=>{
          if (event && (event.type === 'assistant/message' || event.type === 'assistant/attempt' || event.type === 'agent-preset/selected')) usage.changed(session,event)
        },{global:true}))
      }
      clean.push(ctx.webServer.register({kind:'exact', path:'/luma-native/token-usage', handler:protect(async (req,res) => {
        if (req.method !== 'POST') return send(res,405,{ok:false,error:'请使用 POST 请求。'})
        try { return send(res,200,{ok:true,value:await settings.refreshWallet()}) }
        catch { return send(res,503,{ok:false,error:'无法读取本机员工用量与钱包，请重试。'}) }
      })}))
      const readCollection = db.prepare('SELECT revision,value FROM sections WHERE ns=?')
      let cachedRevision = -1, unlocked: readonly string[] = []
      const readUnlockedEmployees = () => {
        const row = readCollection.get(LOCAL_COLLECTION_SETTINGS_NAMESPACE)!
        if (row.revision !== cachedRevision) {
          unlocked = projectLocalCollectionSettings(JSON.parse(String(row.value))).unlockedEmployeeIds
          cachedRevision = Number(row.revision)
        }
        return unlocked
      }
      const presets = createEmployeePresetRoster(ctx.agentPresets,readUnlockedEmployees)
      let calendarRevision=-1
      let petCalendar:DesktopPetCalendar={}
      const pets = desktopPets(fileURLToPath(new URL('.',import.meta.url)), readUnlockedEmployees, role => {
        const row = readCollection.get(OFFICE_PRESENTATION_NAMESPACE)
        return row && JSON.parse(String(row.value)).selection?.employeeSkins?.[role]
      },()=>{
        const row=readCollection.get(OFFICE_RELATIONSHIP_SETTINGS_NAMESPACE)
        if(!row)return {}
        if(Number(row.revision)!==calendarRevision) {
          try {
            const section:OfficeRelationshipSettingsWire=JSON.parse(String(row.value))
            validateOfficeRelationshipSettingsWire(section)
            petCalendar={...(section.calendar?{calendar:section.calendar}:{}),
              ...(section.holidayCalendar?{officialCalendarCache:section.holidayCalendar}:{})}
          } catch {petCalendar={}}
          calendarRevision=Number(row.revision)
        }
        return petCalendar
      })
      clean.push(() => pets.dispose())
      clean.push(ctx.webServer.register({kind:'exact',path:'/luma-native/desktop-pet',handler:protect(pets.handler)}))
      clean.push(()=>presets.dispose())
      startup = Promise.all([presets.sync(false), settings.refreshWallet()]).then(() => {})
      const studioDesktop = createStudioDesktop(fileURLToPath(new URL('./agent-desktop/agent-desktop.exe', import.meta.url)))
      const desk = createAgentWork(join(root, 'agent-workbench'), req => ownerAdmission(ctx, req) === 0,
        { read:() => readPortableBinding(undefined, true), verify:verifyPortableLibraries }, readUnlockedEmployees, true, ctx, usage.recordModelUsage, studioDesktop, settings.readSavedProfiles)
      clean.push(() => desk.dispose())
      clean.push(ctx.webServer.register({ kind:'exact', path:'/luma-native/settings', handler:protect(settings.handle) }))
      clean.push(ctx.webServer.register({ kind:'exact', path:'/luma-native/employee-workspace', handler:protect(employeeWorkspaceHandler(ctx,homes,readUnlockedEmployees)) }))
      clean.push(ctx.webServer.register({ kind:'prefix', path:'/luma-agents', handler:desk.handler }))
      for (const path of ASSET_PREFIXES) clean.push(ctx.webServer.register({ kind:'prefix', path, handler:protect(asset) }))
      return close
    } catch (error) { close(); throw error }
  }, 'Luma desktop services')
  await startup
}

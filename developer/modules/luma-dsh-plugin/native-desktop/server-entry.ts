import { DatabaseSync } from 'node:sqlite'
import { lstat, mkdir } from 'node:fs/promises'
import { isAbsolute, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { ASSET_PREFIXES, createAssetHandler } from '../src/host/assets.ts'
import { createAgentWork } from '../src/host/agent-work.ts'
import { readPortableBinding } from './portable-binding.ts'
import { employeeWorkspaceHandler, type EmployeeWorkspaceHost } from './employee-workspace.ts'
import { verifyPortableLibraries } from '../src/host/love-house.ts'
import { prepareRoleHomes } from '../src/host/role-homes.ts'
import { MESSAGES_NAMESPACE, validateMessageSettings } from '../src/messages-settings.ts'
import { LOCAL_COLLECTION_SETTINGS_NAMESPACE, validateLocalCollectionSettings } from '../src/local-collection-settings.ts'
import { OFFICE_PRESENTATION_NAMESPACE, validateOfficePresentationSettingsWire } from '../src/office-presentation-settings.ts'
import { PLUGIN_PREFERENCES_NAMESPACE, validatePluginPreferencesSettingsWire } from '../src/plugin-preferences-settings.ts'
import { CARD_LIBRARY_SETTINGS_NAMESPACE, validateCardLibrarySettingsWire } from '../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/card-library-settings.ts'
import { COLLECTION_SETTINGS_NAMESPACE, validateCollectionSettingsWire } from '../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/collection-settings.ts'
import { OFFICE_RELATIONSHIP_SETTINGS_NAMESPACE, validateOfficeRelationshipSettingsWire } from '../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/office-relationship-settings.ts'

export const name = 'luma-dsh-plugin'
export const inject = ['webServer', 'connection', 'profileContext', 'workspaceRegistry', 'sessionQuery']
type Section = Record<string, unknown>
type Handler = (req: IncomingMessage, res: ServerResponse) => Promise<void> | void
type Context = EmployeeWorkspaceHost & {
  profileContext: { home: string }
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

function settingsHandler(db: DatabaseSync, homes: Record<string,string>): Handler {
  db.exec('PRAGMA busy_timeout=3000; CREATE TABLE IF NOT EXISTS sections(ns TEXT PRIMARY KEY, revision INTEGER NOT NULL, value TEXT NOT NULL)')
  const read = db.prepare('SELECT revision,value FROM sections WHERE ns=?')
  const insert = db.prepare('INSERT OR IGNORE INTO sections VALUES(?,0,?)')
  const write = db.prepare('UPDATE sections SET value=?, revision=revision+1 WHERE ns=? AND revision=?')
  for (const ns of sections.keys()) insert.run(ns, '{}')
  function view(ns: string) {
    const row = read.get(ns)!
    const base = ns === MESSAGES_NAMESPACE ? { homes } : {}
    const user = JSON.parse(String(row.value))
    const effective = { ...base, ...user }
    return { ns, revision: Number(row.revision), user, effective, value: effective, base, secrets: [] }
  }
  return async (req, res) => {
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
      if (body.action === 'describe') return send(res, 200, {ok:true,value:{writable:true,namespaces:Array.from(sections.keys(), view)}})
      if (body.action !== 'update' || typeof body.ns !== 'string' || !sections.has(body.ns) || !isObject(body.section)
          || !Number.isSafeInteger(body.expectedRevision) || Number(body.expectedRevision) < 0) throw Error()
      const ns = body.ns, section = { ...body.section }
      // The host chooses employee workspaces. A settings export cannot redirect them.
      if (ns === MESSAGES_NAMESPACE && Object.hasOwn(section, 'homes')) {
        if (!isObject(section.homes) || Object.entries(section.homes).some(([id, path]) => homes[id] !== path)) throw Error()
        delete section.homes
      }
      sections.get(ns)!(section)
      const result = write.run(JSON.stringify(section), ns, Number(body.expectedRevision))
      if (!result.changes) return send(res, 409, {ok:false,code:'settings-conflict',error:'设置已在其他窗口更新，请重新读取。'})
      return send(res, 200, {ok:true,value:view(ns)})
    } catch {
      return send(res, 400, {ok:false,error:'设置内容无效或无法保存。'})
    }
  }
}

export async function apply(ctx: Context) {
  const home = ctx.profileContext.home
  if (!isAbsolute(home)) throw Error('DSH 未提供本机档案目录。')
  const root = join(home, 'luma-plugin')
  await mkdir(root, { recursive:true, mode:0o700 })
  if ((await lstat(root)).isSymbolicLink()) throw Error('Luma 数据目录不能指向链接。')
  const homes = await prepareRoleHomes(join(root, 'characters'))
  const asset = createAssetHandler(fileURLToPath(new URL('../public/', import.meta.url)))
  const protect = (handler: Handler): Handler => (req, res) => {
    const status = ownerAdmission(ctx, req)
    if (status) return send(res, status, {ok:false,error:'请在本机 DSH 中使用 Luma。'})
    return handler(req, res)
  }
  ctx.effect(() => {
    const clean: (() => void)[] = []
    const close = () => { for (const release of clean.splice(0).reverse()) release() }
    try {
      const db = new DatabaseSync(join(root, 'desktop-settings.sqlite3'))
      clean.push(() => db.close())
      const settings = settingsHandler(db, homes)
      const desk = createAgentWork(join(root, 'agent-workbench'), req => ownerAdmission(ctx, req) === 0,
        { read:readPortableBinding, verify:verifyPortableLibraries })
      clean.push(() => desk.dispose())
      clean.push(ctx.webServer.register({ kind:'exact', path:'/luma-native/settings', handler:protect(settings) }))
      clean.push(ctx.webServer.register({ kind:'exact', path:'/luma-native/employee-workspace', handler:protect(employeeWorkspaceHandler(ctx,homes)) }))
      clean.push(ctx.webServer.register({ kind:'prefix', path:'/luma-agents', handler:desk.handler }))
      for (const path of ASSET_PREFIXES) clean.push(ctx.webServer.register({ kind:'prefix', path, handler:protect(asset) }))
      return close
    } catch (error) { close(); throw error }
  }, 'Luma desktop services')
}

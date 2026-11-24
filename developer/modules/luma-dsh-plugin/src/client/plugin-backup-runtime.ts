import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type { ConnectionHandle } from '@deepseek-ai/dsh-api-remotes/client'
import manifest from '../../package.json'
import { OFFICE_RELATIONSHIP_SETTINGS_NAMESPACE, validateOfficeRelationshipSettingsWire } from '../../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/office-relationship-settings.ts'
import { COLLECTION_SETTINGS_NAMESPACE, validateCollectionSettingsWire } from '../../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/collection-settings.ts'
import { CARD_LIBRARY_SETTINGS_NAMESPACE, validateCardLibrarySettingsWire } from '../../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/card-library-settings.ts'
import { OFFICE_PRESENTATION_NAMESPACE, decodeOfficePresentationSettings, validateOfficePresentationSettingsWire } from '../office-presentation-settings.ts'
import { LOCAL_COLLECTION_SETTINGS_NAMESPACE, validateLocalCollectionSettings } from '../local-collection-settings.ts'
import { EMPTY_LOCAL_COLLECTION_STATE, projectLocalCollection, type LocalCollectionSettings } from '../shared/local-collection-domain.ts'
import { DEFAULT_MESSAGE_PREFERENCES, MESSAGES_NAMESPACE, validateMessageSettings, type MessagePreferences } from '../messages-settings.ts'
import { DEFAULT_PLUGIN_PREFERENCES, PLUGIN_PREFERENCES_NAMESPACE, decodePluginPreferencesSettings,
  validatePluginPreferencesSettingsWire, type PluginMotionPreference, type PluginPreferencesSettings } from '../plugin-preferences-settings.ts'
import { OFFICE_THEME_CHOICES } from './office-theme-catalog.ts'

export const PLUGIN_VERSION = manifest.version
export const PLUGIN_COMPATIBILITY_LINE = PLUGIN_VERSION.split('.').slice(0, 2).join('.')
export const SUPPORTED_BACKUP_LINES = [...new Set(['0.2', '0.3', '0.4', '0.5', PLUGIN_COMPATIBILITY_LINE])]
export const MAX_PLUGIN_BACKUP_BYTES = 8 * 1024 * 1024
type Section = Record<string, unknown>
interface NamespaceSpec { readonly name: string; readonly label: string; readonly validate: (value: unknown) => void; readonly fields?: readonly string[] }
export const PLUGIN_BACKUP_NAMESPACES: readonly NamespaceSpec[] = Object.freeze([
  { name: OFFICE_RELATIONSHIP_SETTINGS_NAMESPACE, label: '工位、角色会话关联与日历', validate: validateOfficeRelationshipSettingsWire, fields: ['relationships', 'calendar', 'holidayCalendar'] },
  { name: COLLECTION_SETTINGS_NAMESPACE, label: '旧收藏凭据与展示', validate: validateCollectionSettingsWire },
  { name: CARD_LIBRARY_SETTINGS_NAMESPACE, label: '喜欢、星级、备注与收藏夹', validate: validateCardLibrarySettingsWire },
  { name: OFFICE_PRESENTATION_NAMESPACE, label: '办公室主题与角色衣装', validate: validateOfficePresentationSettingsWire },
  { name: LOCAL_COLLECTION_SETTINGS_NAMESPACE, label: '本地星币、卡包、持有记录、伙伴与空间权益、卡册装帧', validate: validateLocalCollectionSettings },
  { name: MESSAGES_NAMESPACE, label: '角色卡、消息显示与话题关联（保留本机草稿）', validate: validateMessageSettings, fields: ['preferences'] },
  { name: PLUGIN_PREFERENCES_NAMESPACE, label: '插件动态偏好', validate: validatePluginPreferencesSettingsWire },
])
export interface PluginBackupDocument {
  readonly format: 'LumaDshPluginBackup'; readonly version: 1; readonly pluginVersion: string; readonly createdAt: string
  readonly namespaces: Readonly<Record<string, Section>>
}
interface NamespaceView { ns: string; user?: unknown; revision: number; secrets: readonly unknown[] }
type Response<T> = { result: { ok: true; value: T } | { ok: false; error: { code: string; message: string } } }
export interface PluginBackupApi {
  describe(request: {}): Promise<Response<{ writable: boolean; namespaces: readonly NamespaceView[] }>>
  replace(request: { ns: string; section: object; expectedRevision: number }): Promise<Response<NamespaceView>>
}
export interface PluginBackupPreview {
  readonly token: string; readonly createdAt: string; readonly pluginVersion: string; readonly writable: boolean
  readonly namespaces: readonly Readonly<{ name: string; label: string; beforeSummary: string; afterSummary: string;
    added: readonly string[]; changed: readonly string[]; removed: readonly string[] }>[]
}
export interface PluginRestoreResult {
  readonly status: 'complete' | 'stopped'; readonly applied: readonly string[]; readonly unchanged: readonly string[]
  readonly stoppedAt?: string; readonly uncertain?: string; readonly message: string
}
const record = (v: unknown): v is Section => !!v && typeof v === 'object' && !Array.isArray(v)
  && (Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null)
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T
function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']'
  if (record(value)) return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}'
  return JSON.stringify(value)
}
function sectionOf(view: NamespaceView): Section {
  const value = view.user ?? {}
  if (!record(value) || view.secrets.length) throw new Error(`${view.ns} 不是可备份的公开插件设置。`)
  return clone(value)
}
function matchesRestoredSection(name: string, expected: Section, view: NamespaceView) {
  if (view.ns !== name) return false
  const actual = sectionOf(view)
  if (canonical(expected) === canonical(actual)) return true
  if (name !== LOCAL_COLLECTION_SETTINGS_NAMESPACE) return false
  // Restoring a legacy wallet may atomically append earned rewards and historical refunds.
  validateLocalCollectionSettings(actual)
  const before = (expected as LocalCollectionSettings).state?.events ?? []
  const after = actual.state?.events ?? []
  return after.length > before.length
    && before.every((event, index) => canonical(event) === canonical(after[index]))
    && after.slice(before.length).every(event => event.type === 'token-reward' || event.type === 'album-skin-refund')
}
function projectSection(spec: NamespaceSpec, source: Section): Section {
  spec.validate(source)
  const next = spec.fields ? Object.fromEntries(Object.entries(source).filter(([key]) => spec.fields!.includes(key))) : clone(source)
  if (spec.name === MESSAGES_NAMESPACE && next.preferences) {
    next.preferences = { ...(next.preferences as MessagePreferences), drafts: {} }
  }
  return next
}
function validateBackupSection(spec: NamespaceSpec, section: unknown): asserts section is Section {
  if (!record(section) || spec.fields && Object.keys(section).some(field => !spec.fields!.includes(field))) throw new Error(`${spec.label} 含有不能恢复的字段。`)
  spec.validate(section)
  if (spec.name === MESSAGES_NAMESPACE && section.preferences
    && Object.keys((section.preferences as MessagePreferences).drafts).length) throw new Error('备份不接收待发消息草稿；本机草稿将保留。')
}
function targetSection(spec: NamespaceSpec, before: Section, incoming: Section): Section {
  const target = spec.fields ? { ...before } : {}
  for (const field of spec.fields ?? Object.keys(before)) delete target[field]
  Object.assign(target, incoming)
  if (spec.name === MESSAGES_NAMESPACE) {
    const previous = before.preferences as MessagePreferences | undefined
    if (incoming.preferences || previous) target.preferences = { ...(incoming.preferences as MessagePreferences | undefined ?? DEFAULT_MESSAGE_PREFERENCES), drafts: previous?.drafts ?? {} }
  }
  spec.validate(target)
  return target
}
function summary(spec: NamespaceSpec, section: Section): string {
  if (spec.name === LOCAL_COLLECTION_SETTINGS_NAMESPACE) {
    const collection = projectLocalCollection((section as LocalCollectionSettings).state ?? EMPTY_LOCAL_COLLECTION_STATE)
    return `星币 ${collection.balance} · 卡片 ${collection.cards.length} 张 · 未开卡包 ${collection.packs.filter(pack => pack.openedAt === undefined).length} 包 · 装帧 ${collection.albumSkinIds.length} 款 · 伙伴 ${collection.unlockedEmployeeIds.length} 位 · 空间 ${collection.unlockedThemeIds.length} 款`
  }
  if (spec.name === CARD_LIBRARY_SETTINGS_NAMESPACE) {
    const entries = Object.values(section).filter(record)
    return `喜欢 ${entries.filter(entry => entry.favorite === true).length} · 星级 ${entries.filter(entry => typeof entry.rating === 'number').length} · 备注 ${entries.filter(entry => typeof entry.note === 'string' && entry.note.length).length} · 收藏夹 ${entries.filter(entry => Array.isArray(entry.versionKeys) && entry.deleted !== true).length}`
  }
  if (spec.name === OFFICE_PRESENTATION_NAMESPACE) {
    const selected = decodeOfficePresentationSettings(section)?.selection
    return `${OFFICE_THEME_CHOICES.find(theme => theme.id === (selected?.officeTheme ?? null))?.name ?? '经典办公室'} · 衣装选择 ${Object.keys(selected?.employeeSkins ?? {}).length} 项 · 卧室装扮 ${Object.keys(selected?.bedroomThemes ?? {}).length} 间 · 跟随作息`
  }
  if (spec.name === MESSAGES_NAMESPACE) {
    const preferences = (section.preferences as MessagePreferences | undefined) ?? DEFAULT_MESSAGE_PREFERENCES
    return `角色卡 ${Object.keys(preferences.profiles).length} · 话题关联 ${Object.keys(preferences.activeTopics).length} · ${preferences.display === 'novel' ? '小说' : '气泡'}显示（保留本机草稿）`
  }
  if (spec.name === PLUGIN_PREFERENCES_NAMESPACE) return (section.preferences as { reducedMotion?: unknown } | undefined)?.reducedMotion === 'reduce' ? '减少办公室动态' : '动态跟随系统'
  if (spec.name === COLLECTION_SETTINGS_NAMESPACE) return `领取凭据 ${Object.keys(section).filter(field => field.startsWith('receipt_')).length} · 展示偏好 ${section.display ? '自定义' : '默认'}`
  const employees = record(section.relationships) && record(section.relationships.employees) ? Object.values(section.relationships.employees).filter(record) : []
  return `已绑定工位 ${employees.filter(employee => employee.workstationId).length} · 会话关联 ${employees.filter(employee => employee.activeSessionId).length} · 日历 ${section.calendar ? '自定义' : '默认'}`
}
function parseBackup(text: string): PluginBackupDocument {
  if (new TextEncoder().encode(text).byteLength > MAX_PLUGIN_BACKUP_BYTES) throw new Error('备份文件超过 8 MB。')
  let value: unknown
  try { value = JSON.parse(text) } catch { throw new Error('请选择有效的插件 JSON 备份文件。') }
  if (!record(value) || Object.keys(value).sort().join(',') !== 'createdAt,format,namespaces,pluginVersion,version'
    || value.format !== 'LumaDshPluginBackup' || value.version !== 1 || typeof value.pluginVersion !== 'string'
    || !/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/u.test(value.pluginVersion)
    || !SUPPORTED_BACKUP_LINES.includes(value.pluginVersion.split('.').slice(0, 2).join('.')) || typeof value.createdAt !== 'string'
    || !Number.isFinite(Date.parse(value.createdAt)) || !record(value.namespaces) || !Object.keys(value.namespaces).length) throw new Error('备份版本或格式不受当前插件支持。')
  for (const [name, section] of Object.entries(value.namespaces)) {
    const spec = PLUGIN_BACKUP_NAMESPACES.find(candidate => candidate.name === name)
    if (!spec) throw new Error('备份含有插件范围之外的设置，未导入。')
    validateBackupSection(spec, section)
  }
  return clone(value) as unknown as PluginBackupDocument
}

/** Uses DSH's public, per-namespace replace transaction and revision fences. */
export function createPluginBackupRuntime(api: PluginBackupApi) {
  const plans = new Map<string, readonly { spec: NamespaceSpec; before: Section; after: Section; revision: number }[]>()
  let disposed = false, restoring = false
  const describe = async () => {
    if (disposed) throw new Error('插件设置已关闭。')
    const response = await api.describe({})
    if (!response.result.ok) throw new Error('无法读取本机 DSH 插件设置，请检查连接。')
    return response.result.value
  }
  return {
    async exportBackup(): Promise<PluginBackupDocument> {
      const view = await describe(), namespaces: Record<string, Section> = {}
      for (const spec of PLUGIN_BACKUP_NAMESPACES) {
        const current = view.namespaces.find(candidate => candidate.ns === spec.name)
        if (current) namespaces[spec.name] = projectSection(spec, sectionOf(current))
      }
      if (!Object.keys(namespaces).length) throw new Error('当前 DSH 未注册可备份的插件设置。')
      const document = { format: 'LumaDshPluginBackup', version: 1, pluginVersion: PLUGIN_VERSION, createdAt: new Date().toISOString(), namespaces } as const
      if (new TextEncoder().encode(JSON.stringify(document)).byteLength > MAX_PLUGIN_BACKUP_BYTES) throw new Error('插件数据超过 8 MB，未生成当前版本无法恢复的备份。')
      return document
    },
    async previewBackup(text: string): Promise<PluginBackupPreview> {
      const backup = parseBackup(text), current = await describe(), plan = []
      for (const [name, incoming] of Object.entries(backup.namespaces)) {
        const spec = PLUGIN_BACKUP_NAMESPACES.find(candidate => candidate.name === name)!
        const view = current.namespaces.find(candidate => candidate.ns === name)
        if (!view) throw new Error(`${spec.label} 尚未在此 DSH 注册，未导入。`)
        const before = sectionOf(view); spec.validate(before)
        plan.push({ spec, before, after: targetSection(spec, before, incoming), revision: view.revision })
      }
      const token = crypto.randomUUID()
      plans.clear(); plans.set(token, plan)
      return Object.freeze({ token, createdAt: backup.createdAt, pluginVersion: backup.pluginVersion, writable: current.writable,
        namespaces: plan.map(({ spec, before, after }) => ({ name: spec.name, label: spec.label,
          beforeSummary: summary(spec, before), afterSummary: summary(spec, after),
          added: Object.keys(after).filter(key => !Object.hasOwn(before, key)),
          removed: Object.keys(before).filter(key => !Object.hasOwn(after, key)),
          changed: Object.keys(after).filter(key => Object.hasOwn(before, key) && canonical(before[key]) !== canonical(after[key])),
        })) })
    },
    async restoreBackup(token: string): Promise<PluginRestoreResult> {
      const applied: string[] = [], unchanged: string[] = []
      const stopped = (message: string, stoppedAt?: string, uncertain?: string): PluginRestoreResult => ({ status: 'stopped', applied, unchanged, message,
        ...(stoppedAt ? { stoppedAt } : {}), ...(uncertain ? { uncertain } : {}) })
      const plan = plans.get(token)
      if (!plan || disposed || restoring) return stopped('预览已过期，请重新选择备份文件并核对范围。')
      restoring = true; plans.delete(token)
      try {
        const current = await describe()
        if (!current.writable) return stopped('当前 DSH 设置为只读，未恢复任何数据。')
        for (const item of plan) {
          const view = current.namespaces.find(candidate => candidate.ns === item.spec.name)
          if (!view || view.secrets.length || view.revision !== item.revision || canonical(sectionOf(view)) !== canonical(item.before)) return stopped('设置已在其他窗口改变，请重新预览后恢复。', item.spec.name)
        }
        for (const item of plan) {
          if (disposed) return stopped('插件已关闭，恢复已停止。', item.spec.name)
          if (canonical(item.before) === canonical(item.after)) { unchanged.push(item.spec.name); continue }
          let response: Awaited<ReturnType<PluginBackupApi['replace']>>
          try { response = await api.replace({ ns: item.spec.name, section: item.after, expectedRevision: item.revision }) }
          catch { return stopped('恢复请求中断，当前项结果待核对；后续项目尚未应用。', item.spec.name, item.spec.name) }
          if (!response.result.ok) return stopped(response.result.error.code === 'settings-conflict'
            ? '此项遇到其他窗口修改，恢复已停止；先前项目已应用。' : 'DSH 拒绝了此项设置，恢复已停止；先前项目已应用。', item.spec.name)
          try {
            if (!matchesRestoredSection(item.spec.name, item.after, response.result.value)) return stopped('此项已提交但读回不同，请核对；后续项目尚未应用。', item.spec.name, item.spec.name)
          } catch { return stopped('此项已提交但无法核对读回，后续项目尚未应用。', item.spec.name, item.spec.name) }
          applied.push(item.spec.name)
        }
        return { status: 'complete', applied, unchanged, message: `已恢复 ${applied.length} 项设置，${unchanged.length} 项原本一致。` }
      } finally { restoring = false }
    },
    dispose() { disposed = true; plans.clear() },
  }
}

export function createPluginPreferencesRuntime(ctx: ClientContext) {
  const scope = ctx.settingsScope.bind<PluginPreferencesSettings>({ namespace: PLUGIN_PREFERENCES_NAMESPACE, decode: decodePluginPreferencesSettings })
  const backup = createPluginBackupRuntime((ctx.get('connection') as ConnectionHandle).api.settings)
  const listeners = new Set<() => void>()
  let disposed = false, pending = false, problem = ''
  const derive = () => {
    const source = scope.getSnapshot(), valid = decodePluginPreferencesSettings(source.user ?? {}) !== undefined
    return { preferences: source.value?.preferences ?? DEFAULT_PLUGIN_PREFERENCES,
      writable: source.status === 'ready' && source.writable && source.mode === 'host' && valid, pending,
      problem: !valid ? '偏好数据版本不受支持，原数据已保留。' : problem }
  }
  let snapshot = derive()
  const refresh = () => { if (disposed) return; snapshot = derive(); for (const listener of listeners) listener() }
  const stop = scope.subscribe(refresh)
  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener) } },
    async setReducedMotion(reducedMotion: PluginMotionPreference): Promise<boolean> {
      if (disposed || pending || !snapshot.writable || reducedMotion !== 'system' && reducedMotion !== 'reduce') return false
      pending = true; problem = ''; refresh()
      try {
        await scope.set('preferences', { schemaVersion: 1, reducedMotion })
        if (scope.getSnapshot().value?.preferences?.reducedMotion !== reducedMotion) { problem = '动态偏好未保存，请重试。'; return false }
        return true
      } catch { problem = '动态偏好未保存，请重试。'; return false }
      finally { pending = false; refresh() }
    },
    exportBackup: backup.exportBackup, previewBackup: backup.previewBackup, restoreBackup: backup.restoreBackup,
    dispose() { if (disposed) return; disposed = true; stop(); backup.dispose(); listeners.clear() },
  }
}
export type PluginPreferencesRuntime = ReturnType<typeof createPluginPreferencesRuntime>

import { DEFAULT_OFFICE_PRESENTATION, DEFAULT_OFFICE_PRESENCE, OFFICE_PRESENTATION_FIELD, decodeOfficePresentationSettings,
  isOfficePresentationEmployee, isOfficePresentationTheme,
  type OfficePresentationSelection, type OfficePresentationSettings } from '../office-presentation-settings.ts'
import { OFFICE_OUTFIT_CHOICES } from './office-theme-catalog.ts'

export interface OfficePresentationScope {
  getSnapshot(): Readonly<{ status: 'loading' | 'ready' | 'unavailable'; value: OfficePresentationSettings | undefined;
    user?: unknown; revision: number | undefined; writable: boolean; mode: 'host' | 'memory' }>
  subscribe(listener: () => void): () => void
  set(field: string, value: unknown): Promise<void>
}
export interface OfficePresentationSnapshot {
  readonly selection: OfficePresentationSelection
  readonly status: 'loading' | 'ready' | 'unavailable' | 'unsupported'
  readonly canEdit: boolean
  readonly saving: boolean
  readonly message: string
}
export type OfficePresentationResult = Readonly<{ status: 'saved' | 'unchanged' }> | Readonly<{ status: 'rejected'; message: string }>
const equal = (a: OfficePresentationSelection, b: OfficePresentationSelection): boolean => a.officeTheme === b.officeTheme
  && (a.presence ?? DEFAULT_OFFICE_PRESENCE) === (b.presence ?? DEFAULT_OFFICE_PRESENCE)
  && Object.keys(a.employeeSkins).length === Object.keys(b.employeeSkins).length
  && Object.entries(a.employeeSkins).every(([employee, skin]) => b.employeeSkins[employee as keyof typeof b.employeeSkins] === skin)

/** One confirmed Host field. Reads never award equipment or write defaults. */
export class OfficePresentationStore {
  private readonly listeners = new Set<() => void>()
  private readonly stop: () => void
  private lastValid = DEFAULT_OFFICE_PRESENTATION
  private snapshot: OfficePresentationSnapshot
  private pending = 0
  private message = ''
  private tail: Promise<void> = Promise.resolve()
  private disposed = false
  constructor(private readonly scope: OfficePresentationScope) {
    this.snapshot = this.derive()
    this.stop = scope.subscribe(() => this.refresh())
  }
  getSnapshot = (): OfficePresentationSnapshot => this.snapshot
  subscribe = (listener: () => void): (() => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }

  setTheme(theme: string | null): Promise<OfficePresentationResult> {
    if (theme !== null && !isOfficePresentationTheme(theme)) return Promise.resolve(this.reject('所选办公室不在当前目录中。'))
    return this.change(selection => ({ ...selection, officeTheme: theme }))
  }
  setPresence(presence: string): Promise<OfficePresentationResult> {
    if (presence !== 'all' && presence !== 'schedule') return Promise.resolve(this.reject('请选择有效的场景成员显示方式。'))
    return this.change(selection => ({ ...selection, presence }))
  }
  setOutfit(employeeId: string, skinId: string | null): Promise<OfficePresentationResult> {
    if (!isOfficePresentationEmployee(employeeId) || skinId !== null && skinId !== `skin.${employeeId}.v1`) return Promise.resolve(this.reject('所选衣装不属于该角色。'))
    if (skinId !== null && !OFFICE_OUTFIT_CHOICES.some(choice => choice.employeeId === employeeId && choice.skinId === skinId && choice.available)) return Promise.resolve(this.reject('这套衣装的办公室动作尚未完成，请先使用原始衣装。'))
    return this.change(selection => {
      const employeeSkins = { ...selection.employeeSkins }
      if (skinId === null) delete employeeSkins[employeeId]
      else employeeSkins[employeeId] = skinId as `skin.${typeof employeeId}.v1`
      return { ...selection, employeeSkins }
    })
  }
  dispose(): void { if (this.disposed) return; this.disposed = true; this.stop(); this.listeners.clear() }

  private change(update: (selection: OfficePresentationSelection) => OfficePresentationSelection): Promise<OfficePresentationResult> {
    if (this.disposed) return Promise.resolve(this.reject('办公室设置已关闭。'))
    this.pending++; this.refresh()
    const result = this.tail.then(async (): Promise<OfficePresentationResult> => {
      this.refresh()
      if (this.disposed || !this.snapshot.canEdit) return this.reject('办公室设置暂时无法保存，请检查 DSH 连接后重试。')
      const next = update(this.snapshot.selection)
      if (equal(next, this.snapshot.selection)) { this.message = ''; this.refresh(); return { status: 'unchanged' } }
      try { await this.scope.set(OFFICE_PRESENTATION_FIELD, next) } catch { /* Confirm by Host readback. */ }
      this.refresh()
      if (this.disposed || !this.snapshot.canEdit || !equal(this.snapshot.selection, next)) return this.reject('办公室设置未保存，已保留最新记录，请重试。')
      this.message = ''; this.refresh()
      return { status: 'saved' }
    }).finally(() => { this.pending--; this.refresh() })
    this.tail = result.then(() => {}, () => {})
    return result
  }
  private reject(message: string): OfficePresentationResult { this.message = message; this.refresh(); return { status: 'rejected', message } }
  private derive(): OfficePresentationSnapshot {
    const source = this.scope.getSnapshot()
    const decoded = decodeOfficePresentationSettings(source.value)
    const rawValid = source.user === undefined || decodeOfficePresentationSettings(source.user) !== undefined
    const status = source.status === 'ready' && (!decoded || !rawValid) ? 'unsupported' : source.status
    if (status === 'ready' && decoded) this.lastValid = decoded.selection ?? DEFAULT_OFFICE_PRESENTATION
    const canEdit = status === 'ready' && source.writable && source.mode === 'host'
    return Object.freeze({ selection: this.lastValid, status, canEdit, saving: this.pending > 0,
      message: status === 'loading' ? '正在读取办公室主题…' : status === 'unsupported' ? '办公室设置版本不受支持，原记录已保留。'
        : !canEdit ? '当前 DSH 连接暂时无法保存办公室主题。' : this.message })
  }
  private refresh(): void { if (this.disposed) return; this.snapshot = this.derive(); for (const listener of this.listeners) listener() }
}

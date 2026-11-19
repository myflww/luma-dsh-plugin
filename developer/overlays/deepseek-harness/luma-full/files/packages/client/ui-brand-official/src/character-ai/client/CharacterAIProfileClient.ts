import { CharacterAIProfileError, characterAIProfileRpcValue, decodeCharacterAIProfileReceipt, decodeCharacterAISelection, type CharacterAIProfileReceipt, type CharacterAISelection } from '../../companion/character-ai-profile.ts'
import { isCompanionId, type CompanionId } from '../../companion/companion-protocol.ts'

export interface CharacterAIProfileTransport { call(endpoint: 'read' | 'set', payload: unknown): Promise<unknown> }
export interface CharacterAIProfileChange { expectedRevision: number; before: CharacterAISelection | null; selection: CharacterAISelection | null }
export interface CharacterAIProfileSnapshot { state: CharacterAIProfileReceipt | null; pending: boolean; refreshing: boolean; notice: string; readError: string; change: CharacterAIProfileChange | null }
const initial = (): CharacterAIProfileSnapshot => ({ state: null, pending: false, refreshing: false, notice: '', readError: '', change: null })
export const sameCharacterAISelection = (left: CharacterAISelection | null, right: CharacterAISelection | null): boolean => left === null || right === null
  ? left === right : left.provider === right.provider && left.model === right.model && left.reasoningEffort === right.reasoningEffort
const conflictNotice = '此角色的设置已在另一处更新，已重新读取；请核对后再选择。'
const errors: Record<string, string> = {
  conflict: conflictNotice,
  unconfigured: '所选供应商或模型已不可用，请重新选择。',
  'unsupported-reasoning': '此模型不支持所选思考强度，请重新选择。',
  'invalid-store': '角色设置暂不可读取，请保留现有记录并重新读取。',
}
export class CharacterAIProfileClient {
  private readonly listeners = new Set<() => void>()
  private readonly values = new Map<CompanionId, CharacterAIProfileSnapshot>()
  private readonly reads = new Map<CompanionId, Promise<void>>()
  private readonly versions = new Map<CompanionId, number>()
  private generation = 0
  private version = 0
  private disposed = false
  constructor(private readonly options: { transport: CharacterAIProfileTransport }) {}
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => this.listeners.delete(listener) }
  getVersion = () => this.version
  getSnapshot = (id: CompanionId): CharacterAIProfileSnapshot => { if (!isCompanionId(id)) throw Error('Unknown character'); if (!this.values.has(id)) this.values.set(id, initial()); return this.values.get(id)! }
  private patch(id: CompanionId, patch: Partial<CharacterAIProfileSnapshot>) { if (this.disposed) return; this.values.set(id, { ...this.getSnapshot(id), ...patch }); this.version++; this.listeners.forEach(listener => listener()) }
  private current(generation: number) { return !this.disposed && generation === this.generation }
  refresh = (id: CompanionId): Promise<void> => {
    if (this.disposed) return Promise.resolve()
    const previous = this.reads.get(id); if (previous) return previous
    const generation = this.generation, version = (this.versions.get(id) ?? 0) + 1; this.versions.set(id, version)
    this.patch(id, { refreshing: true })
    const read = (async () => {
      try {
        const state = decodeCharacterAIProfileReceipt(characterAIProfileRpcValue(await this.options.transport.call('read', { employeeId: id })), id)
        if (!state) throw Error('invalid-receipt')
        if (!this.current(generation) || this.versions.get(id) !== version) return
        const old = this.getSnapshot(id).state
        if (old && state.profile.revision < old.profile.revision) return
        const change = this.getSnapshot(id).change
        const changed = change !== null && change.expectedRevision !== state.profile.revision
        this.patch(id, { state, readError: '', ...(changed ? { change: null, notice: conflictNotice } : {}) })
      } catch { if (this.current(generation) && this.versions.get(id) === version) this.patch(id, { readError: '无法读取此角色的供应商设置，已有绑定已保留，请重新读取。' }) }
    })().finally(() => { if (this.reads.get(id) === read) this.reads.delete(id); if (this.current(generation) && this.versions.get(id) === version) this.patch(id, { refreshing: false }) })
    this.reads.set(id, read); return read
  }
  /** Shared by Settings and every role-model shortcut; choosing alone never writes. */
  requestSelection = (id: CompanionId, selection: CharacterAISelection | null): void => {
    if (this.disposed) return
    const value = this.getSnapshot(id), state = value.state
    if (value.pending || value.refreshing || value.readError || !state) return
    if (selection !== null) {
      const decoded = decodeCharacterAISelection(selection)
      const model = decoded && state.models.find(row => row.provider === decoded.provider && row.model === decoded.model)
      if (!decoded || !model || decoded.reasoningEffort !== undefined && !model.reasoning?.efforts.some(row => row.id === decoded.reasoningEffort)) {
        this.patch(id, { notice: '所选模型或思考强度已不可用，请重新读取后选择。' }); return
      }
    }
    if (sameCharacterAISelection(state.profile.selection, selection)) { this.patch(id, { change: null }); return }
    this.patch(id, { change: { expectedRevision: state.profile.revision, before: structuredClone(state.profile.selection), selection: structuredClone(selection) }, notice: '' })
  }
  cancelSelection = (id: CompanionId): void => { if (!this.disposed && !this.getSnapshot(id).pending) this.patch(id, { change: null }) }
  confirmSelection = async (id: CompanionId): Promise<void> => {
    if (this.disposed) return
    const value = this.getSnapshot(id), change = value.change
    if (!change || value.pending) return
    if (value.refreshing || value.readError || !value.state || value.state.profile.revision !== change.expectedRevision
      || !sameCharacterAISelection(value.state.profile.selection, change.before)) {
      this.patch(id, { change: null, notice: conflictNotice }); await this.refresh(id); return
    }
    await this.setSelection(id, change.selection, { expectedRevision: change.expectedRevision })
  }
  setSelection = async (id: CompanionId, selection: CharacterAISelection | null, confirmation?: { expectedRevision: number }): Promise<void> => {
    if (this.disposed || this.getSnapshot(id).pending) return
    const generation = this.generation
    if (!this.getSnapshot(id).state) await this.refresh(id)
    if (!this.current(generation)) return
    const current = this.getSnapshot(id).state
    if (!current || selection !== null && !decodeCharacterAISelection(selection)) { this.patch(id, { notice: '无法保存角色设置，请重新读取后选择。' }); return }
    if (confirmation && current.profile.revision !== confirmation.expectedRevision) {
      this.patch(id, { change: null, notice: conflictNotice }); await this.refresh(id); return
    }
    if (sameCharacterAISelection(current.profile.selection, selection)) { this.patch(id, { change: null }); return }
    this.versions.set(id, (this.versions.get(id) ?? 0) + 1); this.reads.delete(id)
    this.patch(id, { pending: true, refreshing: false, notice: '', change: null })
    try {
      const state = decodeCharacterAIProfileReceipt(characterAIProfileRpcValue(await this.options.transport.call('set', { employeeId: id, expectedRevision: current.profile.revision, selection })), id)
      if (!state) throw Error('invalid-receipt')
      if (!this.current(generation)) return
      if ((this.getSnapshot(id).state?.profile.revision ?? -1) > state.profile.revision) {
        this.patch(id, { notice: '此角色的设置已在另一处继续更新，已保留最新绑定。' }); return
      }
      this.patch(id, { state, notice: selection ? '已保存此角色的独立模型。' : '已解除此角色的模型绑定。', readError: '' })
    } catch (error) {
      if (!this.current(generation)) return
      if (error instanceof CharacterAIProfileError && error.code === 'conflict') await this.refresh(id)
      if (this.current(generation)) this.patch(id, { notice: error instanceof CharacterAIProfileError && errors[error.code] || '保存结果待核实，请重新读取；不会自动覆盖已有设置。' })
    } finally { if (this.current(generation)) this.patch(id, { pending: false }) }
  }
  notifyChanged = (id: CompanionId, revision: number): void => {
    if (this.disposed || !isCompanionId(id) || !Number.isSafeInteger(revision) || revision < 0) return
    const state=this.getSnapshot(id).state
    if (state && state.profile.revision >= revision) return
    this.patch(id,{readError:'角色模型已变化，正在重新核实。', change: null, ...(this.getSnapshot(id).change ? { notice: conflictNotice } : {})})
    this.versions.set(id,(this.versions.get(id)??0)+1);this.reads.delete(id)
    void this.refresh(id)
  }
  save = this.setSelection
  invalidate = () => { this.generation++; this.version++; this.values.clear(); this.reads.clear(); this.versions.clear(); this.listeners.forEach(listener => listener()) }
  dispose = () => { this.disposed = true; this.generation++; this.values.clear(); this.reads.clear(); this.listeners.clear() }
}

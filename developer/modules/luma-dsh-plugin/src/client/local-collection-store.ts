import type { ConnectionHandle } from '@deepseek-ai/dsh-api-remotes/client'
import type { ClientContext, SettingsScope } from '@deepseek-ai/dsh-client-runtime/client'
import { drawPack, PACK_POOL_VERSION } from '../../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/economy/domain/cardPacks.ts'
import {
  EMPTY_LOCAL_COLLECTION_STATE, localCollectionUserEventCount, LOCAL_COLLECTION_LIMIT, LOCAL_PACKS,
  decodeLocalCollectionSettings, localCollectionDay, localPackAvailability, projectLocalCollection, projectLocalCollectionSettings,
  type CharacterId, canRedeemCard, characterIdForCard, type LocalCollectionEvent, type LocalCollectionProjection, type LocalCollectionSettings, type LocalCollectionState,
} from '../shared/local-collection-domain.ts'
import { LOCAL_COLLECTION_SETTINGS_NAMESPACE } from '../local-collection-settings.ts'

export type LocalCollectionResult = { readonly status: 'saved'; readonly event: LocalCollectionEvent }
  | { readonly status: 'unchanged' }
  | { readonly status: 'rejected'; readonly reason: string; readonly message: string }
export interface LocalCollectionSnapshot extends LocalCollectionProjection {
  readonly status: 'loading' | 'ready' | 'unavailable'
  readonly writable: boolean; readonly persistence: 'host' | 'memory'; readonly pending: boolean
  readonly problem: string | undefined
}
type Scope = Pick<SettingsScope<LocalCollectionSettings>, 'getSnapshot' | 'subscribe' | 'set'>
type Source = ReturnType<Scope['getSnapshot']>
interface Options { now?(): number; id?(): string; draw?: typeof drawPack }
const rejected = (reason: string, message: string): LocalCollectionResult => ({ status: 'rejected', reason, message })

/** One namespace CAS contains the entire transaction, including its acquisition receipt. */
export class LocalCollectionStore {
  private readonly listeners = new Set<() => void>()
  private readonly unsubscribe: () => void
  private disposed = false
  private pending = false
  private problem: string | undefined
  private state: LocalCollectionState = EMPTY_LOCAL_COLLECTION_STATE
  private projection = projectLocalCollection(this.state)
  private cachedSettings?: { source: Source; projection: LocalCollectionProjection | undefined; rawValid: boolean }
  private snapshot: LocalCollectionSnapshot
  constructor(private readonly scope: Scope, private readonly options: Options = {}) {
    this.snapshot = this.derive()
    this.unsubscribe = scope.subscribe(() => this.refresh())
  }
  getSnapshot = () => this.snapshot
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  dispose() { if (this.disposed) return; this.disposed = true; this.unsubscribe(); this.listeners.clear() }

  claimWelcome = () => this.transact(base => {
    if (this.snapshot.welcomeClaimed) throw new Error('新册礼已经领取。')
    return { ...base, type: 'welcome' }
  })
  claimDaily = () => this.transact(base => {
    const day = localCollectionDay(base.at)
    if (this.snapshot.lastDailyClaim && day <= this.snapshot.lastDailyClaim) throw new Error('今天的星币已经领取；每天按北京时间领取一次。')
    return { ...base, type: 'daily', day }
  })
  buyPack = (packId: string) => this.transact(base => {
    const pack = LOCAL_PACKS.find(row => row.id === packId)
    if (!pack) throw new Error('没有这款卡包。')
    if (!localPackAvailability(this.snapshot, pack.id)) throw new Error('卡池剩余额度已分配给未开卡包，未扣除星币。')
    if (this.snapshot.balance < pack.price) throw new Error('星币不足，可以领取每日星币后再购买。')
    return { ...base, type: 'buy-pack', packId, price: pack.price, poolVersion: PACK_POOL_VERSION }
  })
  openPack = (packInstanceId: string) => this.transact(base => {
    const pack = this.snapshot.packs.find(row => row.id === packInstanceId)
    if (!pack || pack.openedAt !== undefined) throw new Error('这包卡已经开启，或不在当前本地档案中。')
    const draw = (this.options.draw ?? drawPack)(pack.packId, this.snapshot.drawCounts)
    const result = draw.cards[0]
    if (draw.cards.length !== 1 || !result) throw new Error('这包卡的结果不完整，卡包保持未开启。')
    return { ...base, type: 'open-pack', packInstanceId, versionKey: result.card.key,
      rarity: result.card.rarity, poolVersion: draw.poolVersion, odds: draw.oddsSnapshot }
  })
  redeemEmployee = (employeeId: CharacterId, cardInstanceId: string) => this.transact(base => {
    if (this.snapshot.unlockedEmployeeIds.includes(employeeId)) throw new Error('这位伙伴已经入职。')
    const card = this.snapshot.cards.find(instance => instance.id === cardInstanceId)
    if (!card || !canRedeemCard(card.versionKey) || characterIdForCard(card.versionKey) !== employeeId) throw new Error('请选择一张当前持有的对应兑换卡。')
    return { ...base, type: 'redeem-employee', employeeId, cardInstanceId }
  })
  private async transact(create: (base: { id: string; at: number }) => LocalCollectionEvent): Promise<LocalCollectionResult> {
    if (this.disposed) return rejected('disposed', '收藏已关闭，请重新打开后重试。')
    if (this.pending) return rejected('busy', '上一笔操作正在保存，请稍等。')
    this.refresh()
    if (!this.snapshot.writable) return rejected('unavailable', this.snapshot.problem ?? '当前连接不能保存本地收藏。')
    if (localCollectionUserEventCount(this.state.events) >= LOCAL_COLLECTION_LIMIT) return rejected('limit', '本地收藏记录已满，请先备份当前 DSH 设置。')
    let event: LocalCollectionEvent
    try {
      const id = this.options.id?.() ?? `local-${crypto.randomUUID()}`
      event = create({ id, at: this.options.now?.() ?? Date.now() })
      projectLocalCollection({ schemaVersion: 1, events: [...this.state.events, event] })
    } catch (error) {
      return rejected('invalid-operation', error instanceof Error ? error.message : '未能完成此操作。')
    }
    const next: LocalCollectionState = { schemaVersion: 1, events: [...this.state.events, event] }
    this.pending = true; this.problem = undefined; this.refresh()
    try { await this.scope.set('state', next) } catch { /* The Host readback below decides whether the transaction committed. */ }
    if (this.disposed) { this.pending = false; return rejected('disposed', '收藏已关闭，保存结果请重新打开后查看。') }
    const source = this.scope.getSnapshot()
    const confirmed = this.readSettings(source).projection && source.value?.state?.events.find(row => row.id === event.id)
    this.pending = false
    if (!confirmed || JSON.stringify(confirmed) !== JSON.stringify(event)) {
      this.problem = '这笔操作没有得到保存确认；其他窗口可能已更新收藏。已读取最新记录，请重试。'
      this.refresh(); return rejected('conflict', this.problem)
    }
    this.problem = undefined; this.refresh()
    return { status: 'saved', event: confirmed }
  }
  private readSettings(source: Source) {
    const cached = this.cachedSettings
    // Both settings adapters keep a namespace's values stable across unrelated notifications.
    // Track the raw layer separately: a decoder may retain the last supported effective value.
    if (cached && cached.source.revision === source.revision && cached.source.value === source.value && cached.source.user === source.user) return cached
    let projection: LocalCollectionProjection | undefined
    try { projection = projectLocalCollectionSettings(source.value) } catch { /* Keep the last readable collection on screen. */ }
    const rawValid = source.user === undefined || (source.user === source.value
      ? projection !== undefined : decodeLocalCollectionSettings(source.user) !== undefined)
    this.cachedSettings = { source, projection, rawValid }
    return this.cachedSettings
  }
  private derive(): LocalCollectionSnapshot {
    const source = this.scope.getSnapshot()
    const { projection, rawValid } = this.readSettings(source)
    const ready = source.mode === 'host' && source.status === 'ready' && projection !== undefined && rawValid
    if (ready) {
      this.state = source.value?.state ?? EMPTY_LOCAL_COLLECTION_STATE
      this.projection = projection
    }
    const status = source.status === 'loading' ? 'loading' : ready ? 'ready' : 'unavailable'
    const writable = ready && source.writable
    const problem = !rawValid || source.status === 'ready' && projection === undefined ? '本地收藏使用了无法识别的数据版本；原始记录已保留，当前仅可查看。'
      : source.mode === 'memory' ? '当前远程连接仅可浏览；本地购买和领取需要连接本机 DSH。' : this.problem
    const previous = this.snapshot
    if (previous && previous.ledger === this.projection.ledger && previous.status === status && previous.writable === writable
      && previous.persistence === source.mode && previous.pending === this.pending && previous.problem === problem) return previous
    return Object.freeze({ ...this.projection, status, writable, persistence: source.mode, pending: this.pending, problem })
  }
  private refresh() {
    if (this.disposed) return
    const next = this.derive()
    if (next === this.snapshot) return
    this.snapshot = next
    for (const listener of [...this.listeners]) listener()
  }
}

export interface EmployeeUsageReport {
  threshold: number
  nativeHistoryComplete: boolean
  collectionRevision: number
  roles: Record<string,{totalTokens:number; earnedCoins:number; remainderTokens:number}>
}
export interface LocalCollectionRuntime {
  readonly store: LocalCollectionStore
  readEmployeeUsage?(signal:AbortSignal): Promise<EmployeeUsageReport>
  dispose(): void
}
export function createLocalCollectionRuntime(ctx: ClientContext): LocalCollectionRuntime {
  const store = new LocalCollectionStore(ctx.settingsScope.bind<LocalCollectionSettings>({
    namespace: LOCAL_COLLECTION_SETTINGS_NAMESPACE, decode: decodeLocalCollectionSettings,
  }))
  return {
    store, dispose: () => store.dispose(),
    async readEmployeeUsage(signal) {
      const response = await fetch('/luma-native/token-usage', { method:'POST', credentials:'same-origin', cache:'no-store', redirect:'error', signal })
      if (!response.ok) throw Error('暂时无法读取员工用量，请重试。')
      const report = await response.json()
      if (!report.ok || !report.value?.roles || !(report.value.threshold > 0)) throw Error('宿主尚未返回员工用量。')
      if (!signal.aborted) await (ctx.get('connection') as ConnectionHandle).api.settings.describe({})
      return report.value
    },
  }
}

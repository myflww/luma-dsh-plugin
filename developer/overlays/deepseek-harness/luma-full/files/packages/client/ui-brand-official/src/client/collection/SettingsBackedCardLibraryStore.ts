import {
  cardLibraryField, decodeCardLibrarySettings, hasFutureCardLibrarySettings, isCardVersionKey,
  type CardLibrarySettings, type CardLibrarySettingV1,
} from '../../card-library-settings.ts'
import type {
  CardEditionDefinition, CardLibraryActions, CardLibraryAlbum, CardLibraryRejectionReason,
  CardLibraryResult, CardLibrarySnapshot, CardPersonalSettings,
} from './cardLibraryTypes.ts'

/** Public Harness namespace face. The store never accesses files, browser storage or receipt scopes. */
export interface CardLibrarySettingsScope {
  getSnapshot(): Readonly<{
    status: 'loading' | 'ready' | 'unavailable'
    value: CardLibrarySettings | undefined
    user?: unknown
    revision: number | undefined
    writable: boolean
    mode: 'host' | 'memory'
  }>
  subscribe(listener: () => void): () => void
  set(field: string, value: unknown): Promise<void>
}

const DEFAULT_PREFERENCES: CardPersonalSettings = Object.freeze({ favorite: false, rating: null, note: '' })
const MESSAGES: Record<CardLibraryRejectionReason, string> = {
  disposed: '收藏页面已关闭，请重新打开后重试。',
  'persistence-unavailable': '个人设置暂时无法保存，卡牌仍可浏览；连接恢复后请重试。',
  'persistence-conflict': '其他窗口已修改此设置。已保留最新记录，请检查后重新保存。',
  'future-data': '个人收藏使用了更新的数据版本，当前仅可浏览，请更新 Luma。',
  'invalid-data': '个人收藏数据格式不受支持，已保留原数据，当前仅可浏览。',
  'unknown-card': '此卡牌版本不在当前目录中，未修改收藏记录。',
  'invalid-input': '请检查内容：评分为 1–5，备注最多 2000 字，收藏夹名称为 1–80 字。',
}
const same = (left: unknown, right: unknown): boolean => JSON.stringify(left) === JSON.stringify(right)

/** Host-confirmed personal preferences. Construction, reads and subscription never write defaults. */
export class SettingsBackedCardLibraryStore implements CardLibraryActions {
  private readonly listeners = new Set<() => void>()
  private readonly unsubscribeScope: () => void
  private readonly keys: ReadonlySet<string>
  private settings: CardLibrarySettings = Object.freeze({})
  private snapshot: CardLibrarySnapshot
  private writeTail: Promise<void> = Promise.resolve()
  private pendingCount = 0
  private operationIssue: CardLibrarySnapshot['issue']
  private disposed = false

  constructor(private readonly scope: CardLibrarySettingsScope, catalog: readonly CardEditionDefinition[]) {
    const keys = new Set<string>()
    for (const card of catalog) {
      if (!isCardVersionKey(card.key) || card.key !== `${card.workId}@${card.revision}` || keys.has(card.key)) {
        throw new Error('卡牌目录必须使用唯一的 workId@revision')
      }
      keys.add(card.key)
    }
    this.keys = keys
    this.snapshot = this.deriveSnapshot()
    this.unsubscribeScope = scope.subscribe(() => { this.refresh() })
  }

  getSnapshot = (): CardLibrarySnapshot => this.snapshot
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }
  load = (): void => { this.operationIssue = undefined; this.refresh() }
  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.unsubscribeScope()
    this.listeners.clear()
  }

  setFavorite = (key: string, favorite: boolean): Promise<CardLibraryResult> => this.enqueue(() => {
    if (!this.keys.has(key)) return this.reject('unknown-card')
    if (typeof favorite !== 'boolean') return this.reject('invalid-input')
    this.refresh()
    if ((this.snapshot.preferences[key] ?? DEFAULT_PREFERENCES).favorite === favorite) return this.unchanged()
    return this.persist(cardLibraryField('favorite', key), { schemaVersion: 1, versionKey: key, favorite })
  })

  setRating = (key: string, rating: number | null): Promise<CardLibraryResult> => this.enqueue(() => {
    if (!this.keys.has(key)) return this.reject('unknown-card')
    if (rating !== null && (!Number.isInteger(rating) || rating < 1 || rating > 5)) return this.reject('invalid-input')
    this.refresh()
    if ((this.snapshot.preferences[key] ?? DEFAULT_PREFERENCES).rating === rating) return this.unchanged()
    return this.persist(cardLibraryField('rating', key), { schemaVersion: 1, versionKey: key, rating })
  })

  setNote = (key: string, note: string): Promise<CardLibraryResult> => this.enqueue(() => {
    if (!this.keys.has(key)) return this.reject('unknown-card')
    if (typeof note !== 'string' || note.length > 2000 || note.includes('\u0000')) return this.reject('invalid-input')
    this.refresh()
    if ((this.snapshot.preferences[key] ?? DEFAULT_PREFERENCES).note === note) return this.unchanged()
    return this.persist(cardLibraryField('note', key), { schemaVersion: 1, versionKey: key, note })
  })

  saveAlbum = (album: CardLibraryAlbum): Promise<CardLibraryResult> => {
    // Freeze the caller's intended change before awaiting earlier writes or Host round trips.
    const copy = album && Array.isArray(album.versionKeys) ? { ...album, versionKeys: [...album.versionKeys] } : undefined
    return this.enqueue(() => {
      if (copy === undefined) return this.reject('invalid-input')
      let field: string
      try { field = cardLibraryField('album', copy.id) } catch { return this.reject('invalid-input') }
      const entry = { schemaVersion: 1 as const, ...copy, deleted: false }
      if (decodeCardLibrarySettings({ [field]: entry }) === undefined) return this.reject('invalid-input')
      this.refresh()
      const previous = this.settings[field]
      const retainedKeys = previous !== undefined && 'versionKeys' in previous ? previous.versionKeys : []
      if (copy.versionKeys.some(key => !this.keys.has(key) && !retainedKeys.includes(key))) return this.reject('unknown-card')
      return this.persist(field, entry)
    })
  }

  removeAlbum = (id: string): Promise<CardLibraryResult> => this.enqueue(() => {
    let field: string
    try { field = cardLibraryField('album', id) } catch { return this.reject('invalid-input') }
    this.refresh()
    const previous = this.settings[field]
    if (previous === undefined || !('deleted' in previous) || previous.deleted) return this.unchanged()
    // A tombstone is an independent CAS field and preserves memberships for a recoverable history.
    return this.persist(field, { ...previous, deleted: true })
  })

  private async persist(field: string, entry: CardLibrarySettingV1): Promise<CardLibraryResult> {
    this.refresh()
    const original = this.settings[field]
    for (let attempt = 0; attempt < 2; attempt++) {
      if (this.disposed) return this.reject('disposed')
      if (!this.snapshot.writable) return this.reject(this.snapshot.issue?.reason === 'future-data' ? 'future-data'
        : this.snapshot.issue?.reason === 'invalid-data' ? 'invalid-data' : 'persistence-unavailable')
      if (same(this.settings[field], entry)) return this.unchanged()
      if (!same(this.settings[field], original)) return this.reject('persistence-conflict')
      const revision = this.scope.getSnapshot().revision
      try { await this.scope.set(field, entry) } catch { /* Host readback, never an optimistic save. */ }
      this.refresh()
      if (this.disposed) return this.reject('disposed')
      if (!this.snapshot.durable) return this.reject(this.snapshot.issue?.reason === 'future-data' ? 'future-data'
        : this.snapshot.issue?.reason === 'invalid-data' ? 'invalid-data' : 'persistence-unavailable')
      if (same(this.settings[field], entry)) {
        this.operationIssue = undefined
        this.refresh()
        return { status: 'saved' }
      }
      // Only retry an unrelated namespace CAS collision. Never overwrite another window's same-field edit.
      if (!same(this.settings[field], original) || this.scope.getSnapshot().revision === revision) break
    }
    return this.reject('persistence-conflict')
  }

  private unchanged(): CardLibraryResult {
    if (this.disposed) return this.reject('disposed')
    if (!this.snapshot.durable) return this.reject(this.snapshot.issue?.reason === 'future-data' ? 'future-data'
      : this.snapshot.issue?.reason === 'invalid-data' ? 'invalid-data' : 'persistence-unavailable')
    this.operationIssue = undefined
    this.refresh()
    return { status: 'unchanged' }
  }

  private enqueue(operation: () => CardLibraryResult | Promise<CardLibraryResult>): Promise<CardLibraryResult> {
    if (this.disposed) return Promise.resolve(this.reject('disposed'))
    this.pendingCount++
    this.refresh()
    const pending = this.writeTail.then(operation, operation).finally(() => { this.pendingCount--; this.refresh() })
    this.writeTail = pending.then(() => {}, () => {})
    return pending
  }

  private reject(reason: CardLibraryRejectionReason): CardLibraryResult {
    this.operationIssue = { reason, message: MESSAGES[reason] }
    this.refresh()
    return { status: 'rejected', ...this.operationIssue }
  }

  private deriveSnapshot(): CardLibrarySnapshot {
    const source = this.scope.getSnapshot()
    const decoded = decodeCardLibrarySettings(source.value)
    const rawValid = source.user === undefined || decodeCardLibrarySettings(source.user) !== undefined
    const future = hasFutureCardLibrarySettings(source.user) || hasFutureCardLibrarySettings(source.value)
    const invalid = source.status === 'ready' && (!rawValid || decoded === undefined)
    const ready = source.mode === 'host' && source.status === 'ready' && decoded !== undefined && rawValid
    if (ready) this.settings = decoded
    const preferences: Record<string, CardPersonalSettings> = Object.fromEntries([...this.keys].map(key => [key, DEFAULT_PREFERENCES]))
    const albums: CardLibraryAlbum[] = []
    for (const entry of Object.values(this.settings)) {
      if ('versionKey' in entry) {
        const previous = preferences[entry.versionKey] ?? DEFAULT_PREFERENCES
        preferences[entry.versionKey] = Object.freeze({ ...previous,
          ...('favorite' in entry ? { favorite: entry.favorite } : {}),
          ...('rating' in entry ? { rating: entry.rating } : {}),
          ...('note' in entry ? { note: entry.note } : {}),
        })
      } else if (!entry.deleted) albums.push(Object.freeze({ id: entry.id, name: entry.name, versionKeys: entry.versionKeys }))
    }
    const dataIssue = future ? 'future-data' : invalid ? 'invalid-data' : undefined
    const issue: CardLibrarySnapshot['issue'] = dataIssue === undefined ? this.operationIssue : { reason: dataIssue, message: MESSAGES[dataIssue] }
    return Object.freeze({
      status: source.status === 'loading' ? 'loading' : ready ? 'ready' : 'unavailable',
      persistence: source.mode, durable: ready, writable: ready && source.writable,
      preferences: Object.freeze(preferences), albums: Object.freeze(albums), pendingCount: this.pendingCount,
      ...(source.revision === undefined ? {} : { sourceRevision: source.revision }),
      ...(issue === undefined ? {} : { issue }),
    })
  }

  private refresh(): void {
    if (this.disposed) return
    const next = this.deriveSnapshot()
    if (same(next, this.snapshot)) return
    this.snapshot = next
    for (const listener of this.listeners) listener()
  }
}

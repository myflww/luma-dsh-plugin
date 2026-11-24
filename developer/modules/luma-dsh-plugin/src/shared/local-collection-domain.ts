import {
  PACK_CATALOG, PACK_POOL_VERSION, CARD_DRAW_LIMIT_RULE, getPackPool, getPackOdds, remainingPackDraws,
  getPackCard, getCardCollectionKey, drawCountForCard, MAX_CARD_DRAWS, type PackPoolCard,
} from '../../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/economy/domain/cardPacks.ts'
import type { CharacterId, PackSlotOdds } from '../../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/economy/domain/types.ts'
import { canRedeemCard, characterIdForCard, CHARACTER_NAMES, CHARACTER_PACKS, THEME_COLLECTION_CHARACTERS } from '../../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/economy/domain/cardEntitlements.ts'
import { OPENABLE_PACK_SKINS } from './pack-skin-catalog.ts'
import { PREVIEW_CARD_CATALOG } from './preview-card-catalog.ts'

export const LOCAL_COLLECTION_SETTINGS_NAMESPACE = 'luma-dsh-local-collection'
const grantCards = new Map(PREVIEW_CARD_CATALOG.map(card => [card.key, card]))
export const LOCAL_GRANT_CARD_KEYS = Object.freeze([...grantCards.keys()])
export const LOCAL_WELCOME_COINS = 300
export const LOCAL_DAILY_COINS = 60
export const LOCAL_COLLECTION_LIMIT = 5000
export { CARD_DRAW_LIMIT_RULE }
export { canRedeemCard, characterIdForCard, CHARACTER_NAMES }
export type { CharacterId }
export const STARTER_EMPLOYEE_ID: CharacterId = 'jingyuniang'
export const COMPANION_REWARDS = Object.freeze(THEME_COLLECTION_CHARACTERS.map(id => {
  const slug = id === 'shan' ? 'duanmu-yan' : id
  const packId = CHARACTER_PACKS[id]
  const pool = getPackPool(packId).filter(card => card.character === CHARACTER_NAMES[id] && (!card.characterId || card.characterId === id))
  return { id, name: CHARACTER_NAMES[id], packId, office: `office.${slug}.v1`, bedroom: `bedroom.${slug}.v1`,
    targets: pool.filter(card => card.edition === 'standard'), invitations: pool.filter(card => canRedeemCard(card.key)) }
}))

/** Existing publication pools and quotas are retained; this shop uses local gift coins. */
export const LOCAL_PACKS = Object.freeze(PACK_CATALOG.map(pack => {
  const coverUrl = getPackPool(pack.id).find(card => card.backUrl)?.backUrl ?? getPackPool(pack.id)[0]?.frontUrl ?? ''
  const pouch = OPENABLE_PACK_SKINS.find(skin => skin.packId === pack.id) ?? OPENABLE_PACK_SKINS[0]!
  return Object.freeze({
    id: pack.id, name: pack.name, price: pack.priceCrystals, cardCount: pack.cardCount,
    description: pack.character ? `${pack.character}的跨系列收藏，每包一张。` : '鲸鱼娘、龙妈妈、克劳德、吉米与绯洛的旅途收藏，每包一张。',
    coverUrl, artworkUrl: pouch.openingArtworkUrl ?? pouch.artworkUrl,
  })
}))

const guidePools = new Map(PACK_CATALOG.map(pack => [pack.id, getPackPool(pack.id)]))
const issuedVersions = new Map([...guidePools.values()].flat().map(card => [card.key, card]))

/** Reveal exact acquired editions; a public pack starts with its active regular versions. */
export function getVisibleGuideCards(collection: Pick<LocalCollectionProjection, 'discoveredKeys'>, packId?: string): readonly PackPoolCard[] {
  const visible = (card: PackPoolCard) => card.edition === 'standard' || collection.discoveredKeys.has(card.key)
  if (packId !== undefined) return (guidePools.get(packId) ?? []).filter(visible)
  const cards = [...issuedVersions.values()].filter(visible)
  // Acquired role-page, reserved, and historical editions belong in the album, outside sale packs.
  for (const key of collection.discoveredKeys) {
    if (issuedVersions.has(key)) continue
    const art = grantCards.get(key)
    if (art) cards.push({ ...art, rarity: art.rarity ?? 'N' })
  }
  return cards
}

function backFor(character: string) {
  return getPackPool('first-meeting-journey').find(card => card.character === character && card.backUrl)?.backUrl
    ?? LOCAL_PACKS.find(pack => pack.id === character)?.coverUrl ?? LOCAL_PACKS[0]!.coverUrl
}
export const LOCAL_ALBUM_SKINS = Object.freeze([
  { id: 'classic', name: '素笺', price: 0, description: '留白与细线，安静地收录每一次相遇。',
    coverUrl: LOCAL_PACKS[0]!.coverUrl, paper: '#f2f7fb', panel: '#ffffff', ink: '#20384f', muted: '#576d83', accent: '#346490', line: '#d5e1ed' },
  { id: 'dawn', name: '晨光绢页', price: 80, description: '奶油绢纸、淡金压线与晨光序章的原始卡背。',
    coverUrl: LOCAL_PACKS.find(pack => pack.id === 'dawn-prelude')!.coverUrl, paper: '#fcf6e9', panel: '#fffdf5', ink: '#4c3d2e', muted: '#8c795e', accent: '#9a7137', line: '#e2d3b4' },
  { id: 'blue-rose', name: '蓝蔷薇藏笺', price: 80, description: '雾蓝纸页、钴蓝书脊与蓝蔷薇回响的原始卡背。',
    coverUrl: LOCAL_PACKS.find(pack => pack.id === 'blue-rose-echo')!.coverUrl, paper: '#edf3f8', panel: '#f9fcff', ink: '#253d58', muted: '#667f99', accent: '#426b99', line: '#c9d7e5' },
  { id: 'moon', name: '月相银箔', price: 80, description: '冷银紫纸与月相典藏的原始卡背，沿用作品本身的纹样。',
    coverUrl: LOCAL_PACKS.find(pack => pack.id === 'moon-collection')!.coverUrl, paper: '#f0edf7', panel: '#fcfaff', ink: '#423755', muted: '#81718e', accent: '#76618f', line: '#d5cbe1' },
  { id: 'prism', name: '远行琥珀', price: 100, description: '温暖琥珀色边线与初见与远行的原始卡背。',
    coverUrl: backFor('克劳德'), paper: '#f8eee5', panel: '#fff9f1', ink: '#563d31', muted: '#917569', accent: '#a56a43', line: '#e0cabc' },
] as const)
export type LocalAlbumSkin = typeof LOCAL_ALBUM_SKINS[number]
export type LocalAlbumSkinId = LocalAlbumSkin['id']
export type LocalRarity = 'N' | 'R' | 'SR' | 'SSR'
interface EventBase { readonly id: string; readonly at: number }
export type LocalProfileGrant = EventBase & {
  readonly type: 'local-profile-grant'; readonly versionKeys: readonly string[]; readonly employeeIds: readonly CharacterId[]
}
export type LocalCollectionEvent = EventBase & (
  | { readonly type: 'welcome' }
  | { readonly type: 'daily'; readonly day: string }
  | { readonly type: 'buy-pack'; readonly packId: string; readonly price: number; readonly poolVersion: string }
  | { readonly type: 'open-pack'; readonly packInstanceId: string; readonly versionKey: string; readonly rarity: LocalRarity; readonly poolVersion: string; readonly odds: readonly PackSlotOdds[] }
  | { readonly type: 'redeem-employee'; readonly employeeId: CharacterId; readonly cardInstanceId: string }
  | { readonly type: 'buy-album-skin'; readonly skinId: LocalAlbumSkinId; readonly price: number }
  | { readonly type: 'equip-album-skin'; readonly skinId: LocalAlbumSkinId }
  | { readonly type: 'token-reward'; readonly employeeId: CharacterId; readonly throughCoins: number }
  | { readonly type: 'album-skin-refund'; readonly purchaseId: string }
  | LocalProfileGrant
)
export function localCollectionUserEventCount(events: readonly LocalCollectionEvent[]) {
  return events.reduce((count, event) => count + Number(event?.type !== 'token-reward' && event?.type !== 'album-skin-refund' && event?.type !== 'local-profile-grant'), 0)
}
export interface LocalCollectionState { readonly schemaVersion: 1; readonly events: readonly LocalCollectionEvent[] }
export interface LocalCollectionSettings { readonly state?: LocalCollectionState }
export interface LocalOwnedPack { readonly id: string; readonly packId: string; readonly purchasedAt: number; readonly price: number; readonly openedAt?: number }
export interface LocalOwnedCard {
  readonly id: string; readonly versionKey: string; readonly rarity: LocalRarity; readonly acquiredAt: number
  readonly packId?: string; readonly packInstanceId?: string; readonly openingId?: string; readonly grantId?: string
}
export interface LocalPurchase { readonly id: string; readonly at: number; readonly kind: 'pack' | 'album-skin'; readonly productId: string; readonly price: number }
export interface LocalLedgerEntry { readonly id: string; readonly at: number; readonly label: string; readonly delta: number; readonly balance: number }
export interface LocalCollectionProjection {
  readonly balance: number; readonly welcomeClaimed: boolean; readonly lastDailyClaim: string | undefined
  readonly packs: readonly LocalOwnedPack[]; readonly cards: readonly LocalOwnedCard[]
  readonly openedCards: readonly LocalOwnedCard[]
  readonly discoveredKeys: ReadonlySet<string>
  readonly unlockedEmployeeIds: readonly CharacterId[]; readonly unlockedThemeIds: readonly string[]
  readonly ownedCounts: Readonly<Record<string, number>>; readonly purchases: readonly LocalPurchase[]
  readonly albumSkinIds: readonly LocalAlbumSkinId[]; readonly albumSkin: LocalAlbumSkin
  readonly tokenRewardCoins: Readonly<Partial<Record<CharacterId, number>>>
  readonly refundedAlbumPurchaseIds: readonly string[]
  readonly ledger: readonly LocalLedgerEntry[]; readonly drawCounts: Readonly<Record<string, number>>
}
export const EMPTY_LOCAL_COLLECTION_STATE: LocalCollectionState = Object.freeze({ schemaVersion: 1, events: Object.freeze([]) })
const shanghaiDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' })
export function localCollectionDay(at: number): string {
  return shanghaiDay.format(at)
}
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const integer = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0
const only = (v: object, keys: readonly string[]) => Object.keys(v).every(key => keys.includes(key))
function invalid(): never { throw new Error('本地收藏记录格式不受支持；原始设置已保留。') }

/** Replaying a valid log proves coin conservation and every holding's acquisition chain. */
export function projectLocalCollection(state: LocalCollectionState): LocalCollectionProjection {
  if (!object(state) || state.schemaVersion !== 1 || !only(state, ['schemaVersion', 'events']) || !Array.isArray(state.events)
    || state.events.length > LOCAL_COLLECTION_LIMIT && localCollectionUserEventCount(state.events) > LOCAL_COLLECTION_LIMIT) invalid()
  let balance = 0, welcomeClaimed = false, lastDailyClaim: string | undefined
  let albumSkin: LocalAlbumSkin = LOCAL_ALBUM_SKINS[0]!
  const packs: LocalOwnedPack[] = [], cards: LocalOwnedCard[] = [], purchases: LocalPurchase[] = [], ledger: LocalLedgerEntry[] = []
  const openedCards: LocalOwnedCard[] = []
  const discoveredKeys = new Set<string>()
  const unlockedEmployeeIds: CharacterId[] = [STARTER_EMPLOYEE_ID]
  const unlockedThemeIds = new Set<string>()
  const heldEditions = new Map<string, number>()
  const tokenRewardCoins: Partial<Record<CharacterId, number>> = {}
  const refundedAlbumPurchaseIds = new Set<string>()
  const ids = new Set<string>(), albumSkinIds: LocalAlbumSkinId[] = ['classic'], ownedCounts: Record<string, number> = {}, drawCounts: Record<string, number> = {}
  for (const event of state.events) {
    if (!object(event) || typeof event.id !== 'string' || !/^[A-Za-z0-9_-]{10,100}$/u.test(event.id)
      || ids.has(event.id) || !integer(event.at) || event.at > 253402300799999) invalid()
    ids.add(event.id)
    let delta = 0, label = ''
    switch (event.type) {
      case 'welcome':
        if (!only(event, ['id', 'at', 'type']) || welcomeClaimed) invalid()
        welcomeClaimed = true; delta = LOCAL_WELCOME_COINS; label = '新册礼'; break
      case 'daily':
        if (!only(event, ['id', 'at', 'type', 'day']) || event.day !== localCollectionDay(event.at) || (lastDailyClaim && event.day <= lastDailyClaim)) invalid()
        lastDailyClaim = event.day; delta = LOCAL_DAILY_COINS; label = '每日星币'; break
      case 'buy-pack': {
        const pack = LOCAL_PACKS.find(row => row.id === event.packId)
        if (!only(event, ['id', 'at', 'type', 'packId', 'price', 'poolVersion']) || !pack || event.price !== pack.price
          || event.poolVersion !== PACK_POOL_VERSION || balance < pack.price
          || remainingPackDraws(pack.id, drawCounts) <= packs.filter(row => row.packId === pack.id && row.openedAt === undefined).length) invalid()
        delta = -pack.price; label = `购买 · ${pack.name}`
        packs.push({ id: event.id, packId: pack.id, purchasedAt: event.at, price: pack.price })
        purchases.push({ id: event.id, at: event.at, kind: 'pack', productId: pack.id, price: pack.price }); break
      }
      case 'open-pack': {
        if (typeof event.versionKey !== 'string' || typeof event.packInstanceId !== 'string') invalid()
        const packIndex = packs.findIndex(row => row.id === event.packInstanceId), pack = packs[packIndex]
        const card = getPackCard(event.versionKey)
        const expectedOdds = pack ? getPackOdds(pack.packId, drawCounts) : []
        if (!only(event, ['id', 'at', 'type', 'packInstanceId', 'versionKey', 'rarity', 'poolVersion', 'odds'])
          || !pack || pack.openedAt !== undefined || !card || !getPackPool(pack.packId).some(row => row.key === card.key)
          || event.rarity !== card.rarity || event.poolVersion !== PACK_POOL_VERSION
          || drawCountForCard(card.key, drawCounts, pack.packId) >= MAX_CARD_DRAWS
          || !expectedOdds.length || expectedOdds.some(row => !row.available) || JSON.stringify(event.odds) !== JSON.stringify(expectedOdds)) invalid()
        packs[packIndex] = { ...pack, openedAt: event.at }
        const instance = Object.freeze({ id: event.id, versionKey: card.key, rarity: card.rarity, packId: pack.packId,
          packInstanceId: pack.id, openingId: event.id, acquiredAt: event.at })
        cards.push(instance); openedCards.push(instance)
        discoveredKeys.add(card.key)
        ownedCounts[card.key] = (ownedCounts[card.key] ?? 0) + 1
        drawCounts[card.key] = (drawCounts[card.key] ?? 0) + 1
        const edition = getCardCollectionKey(card.key)
        heldEditions.set(edition, (heldEditions.get(edition) ?? 0) + 1)
        const reward = COMPANION_REWARDS.find(entry => entry.name === card.character)
        if (reward && !unlockedThemeIds.has(reward.office) && reward.targets.length && reward.targets.every(target => heldEditions.has(target.key))) {
          unlockedThemeIds.add(reward.office); unlockedThemeIds.add(reward.bedroom)
        }
        label = `开包 · ${card.name}`; break
      }
      case 'local-profile-grant': {
        if (!only(event, ['id', 'at', 'type', 'versionKeys', 'employeeIds'])
          || !Array.isArray(event.versionKeys) || !Array.isArray(event.employeeIds)
          || event.versionKeys.length > grantCards.size || event.employeeIds.length > Object.keys(CHARACTER_NAMES).length
          || !event.versionKeys.length && !event.employeeIds.length) invalid()
        for (const key of event.versionKeys) {
          const art = grantCards.get(key)
          if (!art || ownedCounts[key]) invalid()
          cards.push(Object.freeze({id: `grant:${event.id}:${key}`, versionKey:key, rarity:art.rarity ?? 'N', acquiredAt:event.at, grantId:event.id}))
          ownedCounts[key] = 1
          discoveredKeys.add(key)
          const edition = getCardCollectionKey(key)
          heldEditions.set(edition, (heldEditions.get(edition) ?? 0) + 1)
        }
        for (const employeeId of event.employeeIds) {
          if (typeof employeeId !== 'string' || !Object.hasOwn(CHARACTER_NAMES,employeeId) || unlockedEmployeeIds.includes(employeeId)) invalid()
          unlockedEmployeeIds.push(employeeId)
        }
        for (const reward of COMPANION_REWARDS) {
          if (reward.targets.length && reward.targets.every(target => heldEditions.has(target.key))) {
            unlockedThemeIds.add(reward.office); unlockedThemeIds.add(reward.bedroom)
          }
        }
        label = '本机测试授予'; break
      }
      case 'redeem-employee': {
        const index = cards.findIndex(card => card.id === event.cardInstanceId), instance = cards[index]
        if (!only(event, ['id', 'at', 'type', 'employeeId', 'cardInstanceId']) || !instance ||
          !canRedeemCard(instance.versionKey) || characterIdForCard(instance.versionKey) !== event.employeeId || unlockedEmployeeIds.includes(event.employeeId)) invalid()
        cards.splice(index, 1)
        const copies = (ownedCounts[instance.versionKey] ?? 0) - 1
        if (copies > 0) ownedCounts[instance.versionKey] = copies
        else delete ownedCounts[instance.versionKey]
        const edition = getCardCollectionKey(instance.versionKey), remaining = heldEditions.get(edition)! - 1
        if (remaining) heldEditions.set(edition, remaining)
        else heldEditions.delete(edition)
        unlockedEmployeeIds.push(event.employeeId)
        label = `伙伴入职 · ${CHARACTER_NAMES[event.employeeId]}`; break
      }
      case 'buy-album-skin': {
        const skin = LOCAL_ALBUM_SKINS.find(row => row.id === event.skinId)
        if (!only(event, ['id', 'at', 'type', 'skinId', 'price']) || !skin || !skin.price || event.price !== skin.price || balance < skin.price || albumSkinIds.includes(skin.id)) invalid()
        albumSkinIds.push(skin.id); delta = -event.price; label = `卡册装帧 · ${skin.name}`
        purchases.push({ id: event.id, at: event.at, kind: 'album-skin', productId: skin.id, price: event.price }); break
      }
      case 'equip-album-skin': {
        const skin = LOCAL_ALBUM_SKINS.find(row => row.id === event.skinId)
        if (!only(event, ['id', 'at', 'type', 'skinId']) || !skin || !albumSkinIds.includes(skin.id)) invalid()
        albumSkin = skin; label = `使用装帧 · ${skin.name}`; break
      }
      case 'token-reward': {
        if (!only(event, ['id', 'at', 'type', 'employeeId', 'throughCoins']) || typeof event.employeeId !== 'string'
          || !Object.hasOwn(CHARACTER_NAMES, event.employeeId) || !integer(event.throughCoins)) invalid()
        delta = event.throughCoins - (tokenRewardCoins[event.employeeId] ?? 0)
        if (delta <= 0) invalid()
        tokenRewardCoins[event.employeeId] = event.throughCoins
        label = `员工用量奖励 · ${CHARACTER_NAMES[event.employeeId]}`; break
      }
      case 'album-skin-refund': {
        if (!only(event, ['id', 'at', 'type', 'purchaseId']) || typeof event.purchaseId !== 'string' || refundedAlbumPurchaseIds.has(event.purchaseId)) invalid()
        const purchase = purchases.find(row => row.kind === 'album-skin' && row.id === event.purchaseId)
        if (!purchase) invalid()
        refundedAlbumPurchaseIds.add(purchase.id)
        delta = purchase.price
        label = `装帧退款 · ${LOCAL_ALBUM_SKINS.find(skin => skin.id === purchase.productId)!.name}`; break
      }
      default: invalid()
    }
    balance += delta
    if (!integer(balance)) invalid()
    ledger.push(Object.freeze({ id: event.id, at: event.at, label, delta, balance }))
  }
  return Object.freeze({ balance, welcomeClaimed, lastDailyClaim, packs: Object.freeze(packs.map(row => Object.freeze(row))),
    cards: Object.freeze(cards), openedCards: Object.freeze(openedCards), discoveredKeys, unlockedEmployeeIds: Object.freeze(unlockedEmployeeIds), unlockedThemeIds: Object.freeze([...unlockedThemeIds]),
    ownedCounts: Object.freeze(ownedCounts), purchases: Object.freeze(purchases.map(row => Object.freeze(row))),
    albumSkinIds: Object.freeze(albumSkinIds), albumSkin, tokenRewardCoins: Object.freeze(tokenRewardCoins),
    refundedAlbumPurchaseIds: Object.freeze([...refundedAlbumPurchaseIds]), ledger: Object.freeze(ledger), drawCounts: Object.freeze(drawCounts) })
}

/** A successful projection also validates the complete persisted section. */
export function projectLocalCollectionSettings(value: unknown): LocalCollectionProjection {
  if (!object(value) || !only(value, ['state'])) invalid()
  return projectLocalCollection(value.state === undefined ? EMPTY_LOCAL_COLLECTION_STATE : value.state as LocalCollectionState)
}
export function validateLocalCollectionSettings(value: unknown): asserts value is LocalCollectionSettings {
  projectLocalCollectionSettings(value)
}
export function decodeLocalCollectionSettings(value: unknown): LocalCollectionSettings | undefined {
  try { validateLocalCollectionSettings(value); return value } catch { return undefined }
}
export function localPackAvailability(projection: LocalCollectionProjection, packId: string) {
  return Math.max(0, remainingPackDraws(packId, projection.drawCounts) - projection.packs.filter(pack => pack.packId === packId && pack.openedAt === undefined).length)
}

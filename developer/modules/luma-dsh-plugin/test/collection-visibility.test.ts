import { expect, it, vi } from 'vitest'
import { drawPack, getPackPool, PACK_POOL_VERSION } from '../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/economy/domain/cardPacks.ts'
import { PREVIEW_CARD_CATALOG } from '../src/shared/preview-card-catalog.ts'
import { getVisibleGuideCards, LOCAL_PACKS, projectLocalCollectionSettings, type LocalCollectionEvent } from '../src/shared/local-collection-domain.ts'

const replay = (events: LocalCollectionEvent[]) => projectLocalCollectionSettings({ state: { schemaVersion: 1, events } })
const keys = (cards: readonly { key: string }[]) => cards.map(card => card.key)

it('starts every pack and the combined guide with only its publicly issued regular editions', () => {
  const fresh = projectLocalCollectionSettings({})
  const publicKeys = new Set<string>()
  for (const pack of LOCAL_PACKS) {
    const regular = getPackPool(pack.id).filter(card => card.edition === 'standard')
    expect(keys(getVisibleGuideCards(fresh, pack.id))).toEqual(keys(regular))
    for (const { key } of regular) publicKeys.add(key)
  }
  expect(new Set(keys(getVisibleGuideCards(fresh)))).toEqual(publicKeys)
  expect(getVisibleGuideCards(fresh, 'egg-channel')).toEqual([])
  expect(getVisibleGuideCards(fresh, 'role-page')).toEqual([])
})

it('draws a concealed errata normally and reveals only the acquired revision after replay', () => {
  const pack = LOCAL_PACKS.find(row => row.id === 'dawn-prelude')!
  // Select the independent 1% errata channel and then its first available tier and edition.
  const tickets = [99, 0, 0]
  const random = vi.spyOn(crypto, 'getRandomValues').mockImplementation(array => {
    if (!(array instanceof Uint32Array) || !tickets.length) throw Error('Unexpected random request')
    array[0] = tickets.shift()!
    return array
  })
  let draw: ReturnType<typeof drawPack>
  try { draw = drawPack(pack.id) } finally { random.mockRestore() }
  const { card } = draw.cards[0]!
  expect(card.edition).toBe('errata')
  const events: LocalCollectionEvent[] = [
    { type: 'welcome', id: 'welcome-gift', at: 1 },
    { type: 'buy-pack', id: 'bought-dawn', at: 2, packId: pack.id, price: pack.price, poolVersion: PACK_POOL_VERSION },
    { type: 'open-pack', id: 'opened-dawn', at: 3, packInstanceId: 'bought-dawn', versionKey: card.key,
      rarity: card.rarity, poolVersion: draw.poolVersion, odds: draw.oddsSnapshot },
  ]
  const purchased = replay(events.slice(0, 2))
  expect(keys(getVisibleGuideCards(purchased, pack.id))).not.toContain(card.key)
  const acquired = replay(JSON.parse(JSON.stringify(events)))
  expect(acquired.discoveredKeys).toEqual(new Set([card.key]))
  for (const packId of [undefined, pack.id]) {
    expect(keys(getVisibleGuideCards(acquired, packId).filter(row => row.edition === 'errata'))).toEqual([card.key])
  }
  expect(acquired.drawCounts[card.key]).toBe(1)
})

it('keeps discoveries from verified grants after redemption without adding protected cards to a sale pool', () => {
  const role = PREVIEW_CARD_CATALOG.find(card => card.workId === 'JYN-C01')!
  const egg = PREVIEW_CARD_CATALOG.find(card => card.workId === 'LR-01')!
  const legacyInvitation = 'DMY-S03@image-v01-r01'
  const versionKeys = [role.key, egg.key, legacyInvitation]
  const grant: LocalCollectionEvent = { type: 'local-profile-grant', id: 'profile-grant', at: 1, versionKeys, employeeIds: [] }
  const restored = replay([grant, { type: 'redeem-employee', id: 'redeem-shan', at: 2, employeeId: 'shan',
    cardInstanceId: 'grant:profile-grant:' + legacyInvitation }])
  expect(restored.ownedCounts[legacyInvitation]).toBeUndefined()
  expect(restored.discoveredKeys).toEqual(new Set(versionKeys))
  const freshKeys = new Set(keys(getVisibleGuideCards(replay([]))))
  expect(new Set(keys(getVisibleGuideCards(restored)).filter(key => !freshKeys.has(key)))).toEqual(new Set(versionKeys))
  for (const pack of LOCAL_PACKS) {
    const visibleKeys = keys(getVisibleGuideCards(restored, pack.id))
    expect(visibleKeys).not.toContain(role.key)
    expect(visibleKeys).not.toContain(egg.key)
  }
  expect(restored.drawCounts).toEqual({})
})

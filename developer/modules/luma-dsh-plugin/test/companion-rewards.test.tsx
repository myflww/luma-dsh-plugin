import { afterEach, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { getPackOdds, PACK_POOL_VERSION } from '../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/economy/domain/cardPacks.ts'
import { COMPANION_REWARDS, EMPTY_LOCAL_COLLECTION_STATE, LOCAL_PACKS, localCollectionDay, projectLocalCollection, type LocalCollectionEvent, type LocalCollectionSettings } from '../src/shared/local-collection-domain.ts'
import { LocalCollectionStore } from '../src/client/local-collection-store.ts'
import { CompanionRewards } from '../src/client/CompanionRewards.tsx'

afterEach(cleanup)
const employee = COMPANION_REWARDS.find(row => row.id === 'shan')!
const exchangeable = employee.invitations.find(card => card.edition === 'standard')!
function openings(keys: readonly string[], owner = employee) {
  let at = Date.UTC(2026, 0, 1)
  const events: LocalCollectionEvent[] = [{id:'welcome-0001', at, type:'welcome'}]
  const counts: Record<string, number> = {}
  const pack = LOCAL_PACKS.find(row => row.id === owner.packId)!
  keys.forEach((key, index) => {
    at += 86_400_000
    const packInstanceId = 'purchased-' + index
    const card = owner.targets.find(row => row.key === key)!
    events.push({id:'daily-gift-' + index, at, type:'daily', day:localCollectionDay(at)},
      {id:packInstanceId, at, type:'buy-pack', packId:pack.id, price:pack.price, poolVersion:PACK_POOL_VERSION},
      {id:'opening-id-' + index, at, type:'open-pack', packInstanceId, versionKey:key, rarity:card.rarity, poolVersion:PACK_POOL_VERSION, odds:getPackOdds(pack.id, counts)})
    counts[key] = (counts[key] ?? 0) + 1
  })
  return events
}
it('replays original v1 holdings, awards both spaces when the last standard arrives, and retains them after redemption', () => {
  const start = projectLocalCollection(EMPTY_LOCAL_COLLECTION_STATE)
  expect(start.unlockedEmployeeIds).toEqual(['jingyuniang'])
  expect(start.unlockedThemeIds).toEqual([])
  const events = openings(employee.targets.map(card => card.key))
  const project = (rows: LocalCollectionEvent[]) => projectLocalCollection({schemaVersion:1, events:rows})
  expect(project(events.slice(0,-1)).unlockedThemeIds).not.toContain(employee.bedroom)
  const original = project(events)
  expect(original.unlockedThemeIds).toEqual(expect.arrayContaining([employee.office, employee.bedroom]))
  expect(original.unlockedEmployeeIds).toEqual(['jingyuniang'])
  const instance = original.cards.find(card => card.versionKey === exchangeable.key)!
  const redeem: LocalCollectionEvent = {id:'redeem-shan-0001', at:events.at(-1)!.at + 1, type:'redeem-employee', employeeId:'shan',cardInstanceId:instance.id}
  const restored = project(JSON.parse(JSON.stringify([...events,redeem])))
  expect(restored.cards).toHaveLength(original.cards.length-1)
  expect(restored.ownedCounts[exchangeable.key]).toBeUndefined()
  expect(restored.openedCards).toEqual(original.openedCards)
  expect(restored.drawCounts).toEqual(original.drawCounts)
  expect(restored.unlockedThemeIds).toEqual(original.unlockedThemeIds)
  expect(restored.unlockedEmployeeIds).toEqual(['jingyuniang','shan'])
  expect(() => project([...events,{...redeem,employeeId:'grok'}])).toThrow()
  expect(() => project([...events,redeem,{...redeem,id:'another-invitation'}])).toThrow()
})
it('requires the whale collection too and restores earned whale rooms by replaying legacy card events', () => {
  const whale = COMPANION_REWARDS.find(row => row.id === 'jingyuniang')!
  const events = openings(whale.targets.map(card => card.key), whale)
  expect(projectLocalCollection({schemaVersion:1, events:events.slice(0,-1)}).unlockedThemeIds).toEqual([])
  expect(projectLocalCollection({schemaVersion:1, events:JSON.parse(JSON.stringify(events))}).unlockedThemeIds).toEqual([whale.office,whale.bedroom])
})
it('requires a confirmed, currently held instance and changes contacts only after persistence', async () => {
  let value: LocalCollectionSettings = {state:{schemaVersion:1, events:openings([exchangeable.key])}}, revision=0
  const listeners = new Set<() => void>()
  const store = new LocalCollectionStore({
    getSnapshot: () => ({status:'ready',mode:'host',writable:true,revision,value}),
    subscribe: listener => { listeners.add(listener); return () => { listeners.delete(listener) } },
    set: async (_,state) => { await Promise.resolve(); value={state}; revision++; listeners.forEach(fn=>fn()) },
  })
  try {
    render(<CompanionRewards runtime={{store,dispose:()=>store.dispose()}} onFindPack={()=>{}} />)
    const tile = within(screen.getByRole('article',{name:employee.name}))
    expect(tile.getByRole('progressbar',{name:employee.name+'空间收集进度'})).toBeTruthy()
    expect(tile.getByText('查看卡片条件')).toBeTruthy()
    fireEvent.click(tile.getByRole('button',{name:'选择兑换卡'}))
    expect(revision).toBe(0)
    fireEvent.click(tile.getByRole('button',{name:'取消'}))
    expect(store.getSnapshot().cards).toHaveLength(1)
    fireEvent.click(tile.getByRole('button',{name:'选择兑换卡'}))
    fireEvent.click(tile.getByRole('button',{name:'确认兑换入职'}))
    await tile.findByText('已入职')
    expect(revision).toBe(1)
    expect(store.getSnapshot().cards).toHaveLength(0)
    expect(store.getSnapshot().unlockedEmployeeIds).toEqual(['jingyuniang','shan'])
  } finally { store.dispose() }
})

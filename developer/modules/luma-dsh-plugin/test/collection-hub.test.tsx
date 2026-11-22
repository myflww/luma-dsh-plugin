import { afterEach, describe, expect, it } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { CollectionHub } from '../src/client/CollectionHub.tsx'
import { CardsPage, createCardsPageRuntime } from '../src/client/CardsPage.tsx'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import { LocalCollectionStore } from '../src/client/local-collection-store.ts'
import { LOCAL_PACKS, validateLocalCollectionSettings, type LocalCollectionSettings } from '../src/shared/local-collection-domain.ts'
import { OPENABLE_PACK_SKINS } from '../src/shared/pack-skin-catalog.ts'

afterEach(cleanup)
function fixture(initialValue: LocalCollectionSettings = {}, writable = true) {
  let value = initialValue, revision = 0
  let beforeWrite: (() => Promise<void>) | undefined
  const listeners = new Set<() => void>()
  const store = new LocalCollectionStore({
    getSnapshot: () => ({ status: 'ready', mode: 'host', writable, revision, value }),
    subscribe: listener => { listeners.add(listener); return () => { listeners.delete(listener) } },
    set: async (_, state) => {
      await Promise.resolve()
      const gate = beforeWrite; beforeWrite = undefined
      await gate?.()
      const next = { state }; validateLocalCollectionSettings(next)
      value = next; revision++; for (const listener of [...listeners]) listener()
    },
  })
  return { store, dispose: () => store.dispose(), settings: () => value, writes: () => revision,
    beforeNextWrite: (gate: () => Promise<void>) => { beforeWrite = gate } }
}

describe('local collection product flow', () => {
  it('starts on an empty personal album, reveals no unearned fronts, and reopens only saved acquisitions', async () => {
    const collection = fixture()
    const annotations = createCardsPageRuntime({settingsScope:{bind: () => ({
      getSnapshot: () => ({status:'ready', mode:'host', writable:true, revision:0, value:{}}),
      subscribe: () => () => {}, set:async () => {},
    })}} as unknown as ClientContext)
    const page = (state:typeof collection) => <CardsPage runtime={annotations} collection={state} onOpenShop={() => {}}/>
    const view = render(page(collection))
    expect(screen.getByRole('heading',{name:'我的卡册'})).toBeTruthy()
    expect(screen.getByRole('heading',{name:'翻开你的第一张卡'})).toBeTruthy()
    fireEvent.click(screen.getByRole('button',{name:'卡池图鉴'}))
    expect(view.container.querySelectorAll('[data-discovered=true]')).toHaveLength(0)
    expect(view.container.querySelector('.lumaGuideSlots img')).toBeNull()
    expect(collection.writes()).toBe(0)
    view.unmount()
    await collection.store.claimWelcome()
    await collection.store.buyPack('first-meeting-journey')
    await collection.store.openPack(collection.store.getSnapshot().packs[0]!.id)
    const restored = fixture(structuredClone(collection.settings()))
    const fresh = fixture()
    const reopened = render(page(restored))
    expect(reopened.container.querySelectorAll('[data-edition-key]')).toHaveLength(1)
    expect(fresh.store.getSnapshot().cards).toHaveLength(0)
    expect(fresh.store.getSnapshot().unlockedEmployeeIds).toEqual(['jingyuniang'])
    reopened.unmount(); fresh.dispose(); restored.dispose(); collection.dispose(); annotations.dispose()
  })
  it('replays a specific saved opening after reload, including with a read-only connection', async () => {
    const original = fixture()
    await original.store.claimWelcome()
    for (const packId of ['dawn-prelude', 'blue-rose-echo']) {
      await original.store.buyPack(packId)
      const pack = original.store.getSnapshot().packs.at(-1)!
      expect((await original.store.openPack(pack.id)).status).toBe('saved')
    }
    const settings = structuredClone(original.settings())
    original.dispose()
    const reopened = fixture(settings, false)
    render(<CollectionHub runtime={reopened} />)
    fireEvent.click(screen.getByRole('button', { name: '收支记录' }))
    const buttons = screen.getAllByRole('button', { name: /^重看开包/ })
    expect(buttons).toHaveLength(2)
    // History is newest first. Replay the older acquisition to catch "latest opening" shortcuts.
    const button = buttons[1]!
    const cardName = button.getAttribute('aria-label')!.slice('重看开包 · '.length)
    button.focus()
    fireEvent.click(button)
    const replay = screen.getByRole('dialog', { name: '开包回放' })
    expect(within(replay).getByAltText('晨光序章卡包完整外观')).toBeTruthy()
    fireEvent.click(within(replay).getByRole('button', { name: '跳过动画' }))
    expect(within(replay).getByRole('heading', { name: cardName })).toBeTruthy()
    fireEvent.click(within(replay).getByRole('button', { name: '返回收支记录' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(button)
    expect(reopened.writes()).toBe(0)
    expect(reopened.settings()).toEqual(settings)
    reopened.dispose()
  })

  it('claims coins, buys and reveals a saved card, and shows pack receipts with no card backs for sale', async () => {
    const runtime = fixture()
    render(<CollectionHub runtime={runtime} />)
    expect(screen.getByLabelText('余额 0 星币')).toBeTruthy()
    expect(screen.getAllByRole('button', { name: '购买一包' }).every(button => (button as HTMLButtonElement).disabled)).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: '领取 300 新册礼' }))
    await screen.findByLabelText('余额 300 星币')
    const dawn = screen.getByRole('heading', { name: '晨光序章' }).closest('article')!
    fireEvent.click(within(dawn).getByRole('button', { name: '购买一包' }))
    await screen.findByLabelText('余额 240 星币')
    expect(runtime.store.getSnapshot().purchases).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: '未开封 · 1' }))
    const sealed = screen.getByRole('region',{name:'未开封卡包'})
    expect(within(sealed).getByRole('heading',{name:'晨光序章'})).toBeTruthy()
    expect(sealed.querySelector('img')?.getAttribute('src')).toBe('/luma-economy/packs/dawn-cutout-r1.png')
    fireEvent.click(within(sealed).getByRole('button', { name: '开启卡包' }))
    const dialog = await screen.findByRole('dialog', { name: '开包结果' })
    expect(runtime.store.getSnapshot().cards).toHaveLength(1)
    expect(within(dialog).getByAltText('晨光序章卡包完整外观').getAttribute('src')).toBe('/luma-economy/packs/dawn-cutout-r1.png')
    fireEvent.click(within(dialog).getByRole('button', { name: '跳过动画' }))
    const finish = within(dialog).getByRole('button', { name: '收好这次相遇' })
    expect(document.activeElement).toBe(finish)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.queryByRole('button', { name:'卡册装帧' })).toBeNull()
    expect(screen.queryByRole('button', { name:'购买装帧' })).toBeNull()
    expect(runtime.store.getSnapshot().balance).toBe(240)
    fireEvent.click(screen.getByRole('button', { name: '收支记录' }))
    expect(screen.getByText('购买 · 晨光序章')).toBeTruthy()
    runtime.dispose()
  })

  it('shows precise confirmed token totals per employee and preserves remainders across refresh', async () => {
    const runtime = fixture()
    let totalTokens = 10198
    const readEmployeeUsage = async () => ({threshold:1000000,nativeHistoryComplete:true,collectionRevision:1,
      roles:{jingyuniang:{totalTokens, earnedCoins:Math.floor(totalTokens/1000000), remainderTokens:totalTokens%1000000}}})
    render(<CollectionHub runtime={{...runtime, readEmployeeUsage}}/>)
    fireEvent.click(screen.getByRole('button',{name:'员工用量'}))
    await screen.findByText('累计 10,198 token')
    expect(screen.getByText('距下一枚还需 989,802 token')).toBeTruthy()
    totalTokens += 1000000
    fireEvent.click(screen.getByRole('button',{name:'刷新用量'}))
    await screen.findByText('累计 1,010,198 token')
    expect(screen.getByText('距下一枚还需 989,802 token')).toBeTruthy()
    expect(screen.queryByText('端木嫣')).toBeNull()
    runtime.dispose()
  })

  it('discloses current probabilities and keeps diagrams separate from real holdings', () => {
    const runtime = fixture()
    render(<CollectionHub runtime={runtime} />)
    expect(screen.getAllByText('查看当前概率与卡池')).toHaveLength(4)
    for (const pack of LOCAL_PACKS) {
      const skin = OPENABLE_PACK_SKINS.find(row => row.packId === pack.id)!
      expect(screen.getByAltText(`${pack.name}卡包`).getAttribute('src')).toBe(skin.openingArtworkUrl ?? skin.artworkUrl)
    }
    const previews = screen.getByText('试拆与美术预览').closest('details')!
    expect(previews.open).toBe(false)
    fireEvent.click(within(previews).getByText('试拆与美术预览'))
    expect(within(previews).getByText(/样卡不会计入卡册/)).toBeTruthy()
    expect(runtime.store.getSnapshot().cards).toEqual([])
    runtime.dispose()
  })

  it('waits for Host confirmation before opening the scene and keeps one acquisition when animation is skipped', async () => {
    const runtime = fixture()
    await runtime.store.claimWelcome()
    await runtime.store.buyPack('dawn-prelude')
    render(<CollectionHub runtime={runtime} />)
    fireEvent.click(screen.getByRole('button', { name: '未开封 · 1' }))
    let confirm!: () => void
    runtime.beforeNextWrite(() => new Promise<void>(resolve => { confirm = resolve }))
    fireEvent.click(screen.getByRole('button', { name: '开启卡包' }))
    await waitFor(() => expect(confirm).toBeTypeOf('function'))
    expect(runtime.store.getSnapshot().pending).toBe(true)
    expect(runtime.store.getSnapshot().cards).toEqual([])
    expect(screen.queryByRole('dialog', { name: '开包结果' })).toBeNull()
    expect((screen.getByRole('button', { name: '开启卡包' }) as HTMLButtonElement).disabled).toBe(true)
    await act(async () => { confirm(); await Promise.resolve() })
    const dialog = await screen.findByRole('dialog', { name: '开包结果' })
    const acquisition = runtime.store.getSnapshot().cards[0]
    expect(acquisition).toBeTruthy()
    fireEvent.click(within(dialog).getByRole('button', { name: '跳过动画' }))
    fireEvent.click(within(dialog).getByRole('button', { name: '收好这次相遇' }))
    expect(runtime.store.getSnapshot().cards).toEqual([acquisition])
    expect(runtime.store.getSnapshot().packs.filter(pack => pack.openedAt === undefined)).toEqual([])
    expect(runtime.store.getSnapshot().balance).toBe(240)
    runtime.dispose()
  })

  it('does not reveal a card or consume its pack when saving the opening fails', async () => {
    const runtime = fixture()
    await runtime.store.claimWelcome()
    await runtime.store.buyPack('dawn-prelude')
    render(<CollectionHub runtime={runtime} />)
    fireEvent.click(screen.getByRole('button', { name: '未开封 · 1' }))
    runtime.beforeNextWrite(async () => { throw Error('Host refused write') })
    fireEvent.click(screen.getByRole('button', { name: '开启卡包' }))
    await waitFor(() => expect(runtime.store.getSnapshot().pending).toBe(false))
    await screen.findAllByRole('alert')
    expect(screen.queryByRole('dialog', { name: '开包结果' })).toBeNull()
    expect(runtime.store.getSnapshot().cards).toEqual([])
    expect(runtime.store.getSnapshot().packs.filter(pack => pack.openedAt === undefined)).toHaveLength(1)
    expect(runtime.store.getSnapshot().balance).toBe(240)
    expect((screen.getByRole('button', { name: '开启卡包' }) as HTMLButtonElement).disabled).toBe(false)
    runtime.dispose()
  })

  it('lets the player choose a stocked physical package and opens the selected edition',async () => {
    const runtime=fixture()
    await runtime.store.claimWelcome()
    for (const id of ['first-meeting-journey','dawn-prelude','first-meeting-journey']) await runtime.store.buyPack(id)
    render(<CollectionHub runtime={runtime} initialPackId="sealed"/>)
    const shelf=within(screen.getByRole('region',{name:'未开封卡包'}))
    expect(shelf.getByRole('heading',{name:'初见与远行'})).toBeTruthy()
    fireEvent.click(shelf.getByRole('button',{name:'晨光序章，库存 1 包'}))
    expect(shelf.getByAltText('晨光序章实物包装').getAttribute('src')).toBe('/luma-economy/packs/dawn-cutout-r1.png')
    fireEvent.click(shelf.getByRole('button',{name:'开启卡包'}))
    await screen.findByRole('dialog',{name:'开包结果'})
    expect(runtime.store.getSnapshot().cards.map(card=>card.packId)).toEqual(['dawn-prelude'])
    expect(runtime.store.getSnapshot().packs.filter(pack=>!pack.openedAt)).toHaveLength(2)
    runtime.dispose()
  })

  it('opens at most five purchased packs in a batch and leaves the sixth sealed', async () => {
    const runtime = fixture()
    await runtime.store.claimWelcome()
    for (let index = 0; index < 6; index++) await runtime.store.buyPack('first-meeting-journey')
    render(<CollectionHub runtime={runtime} />)
    fireEvent.click(screen.getByRole('button', { name: '未开封 · 6' }))
    fireEvent.click(screen.getByRole('button', { name: '一起拆开 · 5 包' }))
    const dialog = await screen.findByRole('dialog', { name: '开包结果' })
    const snapshot = runtime.store.getSnapshot()
    expect(snapshot.cards).toHaveLength(5)
    expect(new Set(snapshot.cards.map(card => card.packInstanceId)).size).toBe(5)
    expect(snapshot.packs.filter(pack => pack.openedAt === undefined)).toHaveLength(1)
    expect(snapshot.balance).toBe(240)
    fireEvent.click(within(dialog).getByRole('button', { name: '跳过动画' }))
    expect(within(dialog).getAllByRole('button', { name: /^查看卡片 / })).toHaveLength(5)
    fireEvent.click(within(dialog).getByRole('button', { name: '收好这次相遇' }))
    expect(screen.getAllByRole('button', { name: '开启卡包' })).toHaveLength(1)
    runtime.dispose()
  })

  it('reveals only committed acquisitions after a partial batch failure and leaves remaining packs sealed', async () => {
    const runtime = fixture()
    await runtime.store.claimWelcome()
    for (let index = 0; index < 3; index++) await runtime.store.buyPack('dawn-prelude')
    render(<CollectionHub runtime={runtime} />)
    fireEvent.click(screen.getByRole('button', { name: '未开封 · 3' }))
    runtime.beforeNextWrite(async () => {
      runtime.beforeNextWrite(async () => { throw Error('Host refused second opening') })
    })
    fireEvent.click(screen.getByRole('button', { name: '一起拆开 · 3 包' }))
    const dialog = await screen.findByRole('dialog', { name: '开包结果' })
    expect(runtime.store.getSnapshot().cards).toHaveLength(1)
    expect(runtime.store.getSnapshot().packs.filter(pack => pack.openedAt === undefined)).toHaveLength(2)
    expect(runtime.store.getSnapshot().balance).toBe(120)
    fireEvent.click(within(dialog).getByRole('button', { name: '跳过动画' }))
    expect(within(dialog).getAllByRole('button', { name: /^查看卡片 / })).toHaveLength(1)
    fireEvent.click(within(dialog).getByRole('button', { name: '收好这次相遇' }))
    expect(screen.getByText(/已保存 1 张卡片。/)).toBeTruthy()
    expect(screen.getByRole('button', { name: '开启卡包' })).toBeTruthy()
    expect(screen.getByText('未开封库存 · 2 包')).toBeTruthy()
    runtime.dispose()
  })
})

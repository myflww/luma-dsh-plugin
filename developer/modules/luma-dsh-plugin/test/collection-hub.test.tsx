import { afterEach, describe, expect, it } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { CollectionHub, localAlbumStyle } from '../src/client/CollectionHub.tsx'
import { LocalCollectionStore } from '../src/client/local-collection-store.ts'
import { LOCAL_ALBUM_SKINS, LOCAL_PACKS, validateLocalCollectionSettings, type LocalCollectionSettings } from '../src/shared/local-collection-domain.ts'
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

  it('claims coins, buys and reveals a saved card, then buys/equips a real album style and shows receipts', async () => {
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
    const sealed = screen.getByText('晨光序章', { selector: 'li strong' }).closest('li')!
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
    fireEvent.click(screen.getByRole('button', { name: '卡册装帧' }))
    const skin = screen.getByRole('heading', { name: '蓝蔷薇藏笺' }).closest('article')!
    fireEvent.click(within(skin).getByRole('button', { name: '购买装帧' }))
    const equip = await within(skin).findByRole('button', { name: '使用装帧' })
    fireEvent.click(equip)
    await within(skin).findByRole('button', { name: '使用中' })
    expect(runtime.store.getSnapshot().albumSkin.id).toBe('blue-rose')
    expect(runtime.store.getSnapshot().balance).toBe(160)
    expect(localAlbumStyle(runtime.store.getSnapshot().albumSkin)).toEqual(localAlbumStyle(LOCAL_ALBUM_SKINS.find(row => row.id === 'blue-rose')!))
    fireEvent.click(screen.getByRole('button', { name: '收支记录' }))
    expect(screen.getByText('购买 · 晨光序章')).toBeTruthy()
    expect(screen.getByText('卡册装帧 · 蓝蔷薇藏笺')).toBeTruthy()
    expect(screen.getByText('使用装帧 · 蓝蔷薇藏笺')).toBeTruthy()
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
    expect(screen.getByText(/仅用于此档案/)).toBeTruthy()
    expect(screen.getByText(/此处只计入本地开包实际获得的卡片/)).toBeTruthy()
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
    expect(screen.getAllByRole('button', { name: '开启卡包' })).toHaveLength(2)
    runtime.dispose()
  })
})

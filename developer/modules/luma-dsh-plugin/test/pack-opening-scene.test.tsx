import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { PackOpeningScene } from '../src/client/PackOpeningScene.tsx'
import { getPouchSealBounds } from '../src/client/PackOpeningPouch.tsx'
import type { LocalOwnedCard } from '../src/shared/local-collection-domain.ts'
import { getPackPool } from '../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/economy/domain/cardPacks.ts'
import { PRODUCTION_CARD_CATALOG } from '../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/collection/productionCardCatalog.ts'
import { OPENABLE_PACK_SKINS, PACK_REFERENCE_SKINS } from '../src/shared/pack-skin-catalog.ts'
import { PREVIEW_CARD_CATALOG } from '../src/shared/preview-card-catalog.ts'

// The production build redirects legacy primitive imports through the plugin's
// private adapter. Keep its real tooltip implementation in this source test too.
vi.mock('../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/LumaHelpTip.tsx', async () =>
  import('../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-primitives/src/client/LumaHelpTip.tsx'))

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

function savedCards(count = 1): LocalOwnedCard[] {
  const pool = getPackPool('dawn-prelude')
  return Array.from({ length: count }, (_, index) => {
    const card = pool[index]!
    return { id: `opening-${index}`, openingId: `opening-${index}`, packInstanceId: `sealed-${index}`,
      packId: 'dawn-prelude', versionKey: card.key, rarity: card.rarity, acquiredAt: 1794873600000 }
  })
}

function installPointerEvents() {
  class TestPointerEvent extends MouseEvent {
    readonly pointerId: number
    readonly isPrimary: boolean
    constructor(type: string, options: PointerEventInit) {
      super(type, options)
      this.pointerId = options.pointerId ?? 1
      this.isPrimary = options.isPrimary ?? true
    }
  }
  vi.stubGlobal('PointerEvent', TestPointerEvent)
}

function sealGesture() {
  installPointerEvents()
  render(<PackOpeningScene cards={savedCards()} onClose={() => {}} />)
  const dialog = screen.getByRole('dialog', { name: '开包结果' })
  const button = within(dialog).getByRole('button', { name: '沿封口拆开' })
  const pouch = button.parentElement!
  const art = pouch.querySelector<HTMLElement>('.lumaPouchArtwork')!
  const src = within(dialog).getByAltText(/卡包完整外观/u).getAttribute('src')!
  const bounds = getPouchSealBounds(src)
  const rect = new DOMRect(20, 40, 400, 600)
  vi.spyOn(pouch, 'getBoundingClientRect').mockReturnValue(rect)
  function point(fraction: number, verticalOffset = 0, pointerId = 8) {
    return { pointerId, button: 0, clientX: rect.x + rect.width * (bounds.left + (bounds.right - bounds.left) * fraction) / 100,
      clientY: rect.y + rect.height * bounds.seam / 100 + verticalOffset }
  }
  return { dialog, button, art, point, progress: () => Number(art.dataset.progress), cut: () => Number(art.dataset.cut) }
}

function controlImageDecoding() {
  const NativeImage = window.Image
  const requests: { src: string; resolve(): void; reject(reason: Error): void }[] = []
  vi.stubGlobal('Image', function () {
    const image = new NativeImage()
    image.decode = () => new Promise<void>((resolve, reject) => requests.push({ src: image.getAttribute('src')!, resolve, reject }))
    return image
  })
  return requests
}

describe('saved pack opening presentation', () => {
  it('keeps the seal action accessible without covering the original pack with a visible label or icon', () => {
    render(<PackOpeningScene cards={savedCards()} onClose={() => {}} />)
    const tear = screen.getByRole('button', { name: '沿封口拆开' })
    expect(tear.textContent).toBe('')
    expect(tear.querySelector('svg, img')).toBeNull()
    expect(screen.getByRole('img', { name: /卡包完整外观/u })).toBeTruthy()
  })

  it('supports keyboard activation of the tear and an immediate skip to the actual saved artwork', () => {
    const onClose = vi.fn(), cards = savedCards()
    render(<PackOpeningScene cards={cards} onClose={onClose} />)
    const dialog = screen.getByRole('dialog', { name: '开包结果' })
    const tear = within(dialog).getByRole('button', { name: '沿封口拆开' })
    expect(document.activeElement).toBe(tear)
    fireEvent.click(tear)
    fireEvent.click(within(dialog).getByRole('button', { name: '跳过动画' }))
    const artwork = getPackPool('dawn-prelude').find(card => card.key === cards[0]!.versionKey)!
    expect(within(dialog).getAllByRole('img').some(image => image.getAttribute('src') === artwork.frontUrl)).toBe(true)
    const finish = within(dialog).getByRole('button', { name: '收好这次相遇' })
    expect(document.activeElement).toBe(finish)
    fireEvent.click(finish)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('presents only provided acquisitions when several packs are opened together', () => {
    const cards = savedCards(3), onClose = vi.fn(), onOpenOwned = vi.fn()
    render(<PackOpeningScene cards={cards} onClose={onClose} onOpenOwned={onOpenOwned} />)
    const dialog = screen.getByRole('dialog', { name: '开包结果' })
    fireEvent.click(within(dialog).getByRole('button', { name: '跳过动画' }))
    const frontUrls = cards.map(owned => getPackPool(owned.packId).find(card => card.key === owned.versionKey)!.frontUrl)
    const displayed = within(dialog).getAllByRole('img').map(image => image.getAttribute('src'))
    for (const url of frontUrls) expect(displayed).toContain(url)
    fireEvent.click(within(dialog).getByRole('button', { name: '查看我的持有' }))
    expect(onOpenOwned).toHaveBeenCalledTimes(1)
  })

  it('traps keyboard focus and restores the opening trigger when the scene unmounts', () => {
    const trigger = document.createElement('button')
    trigger.textContent = '打开本地卡包'; document.body.append(trigger); trigger.focus()
    const onClose = vi.fn()
    const view = render(<PackOpeningScene cards={savedCards()} onClose={onClose} />)
    const dialog = screen.getByRole('dialog', { name: '开包结果' })
    const targets = within(dialog).getAllByRole('button').filter(button => !(button as HTMLButtonElement).disabled)
    const first = targets[0]!, last = targets[targets.length - 1]!
    last.focus(); fireEvent.keyDown(document, { key: 'Tab' })
    expect(document.activeElement).toBe(first)
    first.focus(); fireEvent.keyDown(document, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(last)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
    view.unmount()
    expect(document.activeElement).toBe(trigger)
    trigger.remove()
  })

  it('honors reduced motion by revealing immediately after the tear', () => {
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })))
    render(<PackOpeningScene cards={savedCards()} onClose={() => {}} />)
    const dialog = screen.getByRole('dialog', { name: '开包结果' })
    fireEvent.click(within(dialog).getByRole('button', { name: '沿封口拆开' }))
    expect(within(dialog).queryByRole('button', { name: '跳过动画' })).toBeNull()
    expect(within(dialog).getByRole('button', { name: '收好这次相遇' })).toBeTruthy()
    expect(dialog.querySelector('.lumaOpeningConfetti')).toBeNull()
  })

  it('accepts a pointer drag across the seal and can replay the same saved acquisitions', () => {
    installPointerEvents()
    render(<PackOpeningScene cards={savedCards()} onClose={() => {}} />)
    const dialog = screen.getByRole('dialog', { name: '开包结果' })
    const tear = within(dialog).getByRole('button', { name: '沿封口拆开' })
    fireEvent.pointerDown(tear, { pointerId: 8, button: 0, clientX: 10 })
    fireEvent.pointerMove(tear, { pointerId: 8, clientX: 110 })
    expect(within(dialog).queryByRole('button', { name: '沿封口拆开' })).toBeNull()
    fireEvent.click(within(dialog).getByRole('button', { name: '跳过动画' }))
    const fronts = () => within(dialog).getAllByRole('img').map(image => image.getAttribute('src'))
    const beforeReplay = fronts()
    fireEvent.click(within(dialog).getByRole('button', { name: '再看一次' }))
    expect(within(dialog).getByRole('button', { name: '沿封口拆开' })).toBeTruthy()
    fireEvent.click(within(dialog).getByRole('button', { name: '跳过动画' }))
    expect(fronts()).toEqual(beforeReplay)
  })

  it('keeps the pack sealed after a short drag even when the browser dispatches a click on release', () => {
    installPointerEvents()
    render(<PackOpeningScene cards={savedCards()} onClose={() => {}} />)
    const dialog = screen.getByRole('dialog', { name: '开包结果' })
    const tear = within(dialog).getByRole('button', { name: '沿封口拆开' })
    fireEvent.pointerDown(tear, { pointerId: 8, button: 0, clientX: 10 })
    fireEvent.pointerMove(tear, { pointerId: 8, clientX: 30 })
    fireEvent.pointerUp(tear, { pointerId: 8, button: 0, clientX: 30 })
    fireEvent.click(tear, { detail: 1 })
    expect(within(dialog).getByRole('button', { name: '沿封口拆开' })).toBe(tear)
    expect(within(dialog).queryByRole('button', { name: '收好这次相遇' })).toBeNull()
    // Keyboard activation remains available after a cancelled pointer gesture.
    fireEvent.click(tear, { detail: 0 })
    expect(within(dialog).queryByRole('button', { name: '沿封口拆开' })).toBeNull()
  })

  it.each([
    { direction: 'ltr', start: 0, end: 1 },
    { direction: 'rtl', start: 1, end: 0 },
    { direction: 'ltr', start: .5, end: 1 },
    { direction: 'rtl', start: .5, end: 0 },
  ])('follows and reverses signed travel from $start toward $end, finishing $direction at the opposite edge', ({ direction, start, end }) => {
    const { dialog, button, art, point, progress, cut } = sealGesture()
    const position = (distance: number) => start + (end - start) * distance
    fireEvent.pointerDown(button, point(start))
    fireEvent.pointerMove(button, point(position(.62)))
    expect(art.dataset.active).toBe('true')
    expect(art.dataset.direction).toBe(direction)
    expect(progress()).toBeCloseTo(.62, 2)
    const farCut = cut()
    fireEvent.pointerMove(button, point(position(.3)))
    expect(progress()).toBeCloseTo(.3, 2)
    expect(direction === 'ltr' ? cut() < farCut : cut() > farCut).toBe(true)
    fireEvent.pointerMove(button, point(position(.3), -40))
    expect(progress()).toBeCloseTo(.3, 2)
    fireEvent.pointerMove(button, point(position(.97)))
    expect(dialog.dataset.phase).toBe('sealed')
    fireEvent.pointerMove(button, point(position(1.02)))
    expect(dialog.dataset.phase).toBe('tearing')
    expect(art.dataset.direction).toBe(direction)
  })

  it.each(['pointercancel', 'lostpointercapture'])('clears an interrupted %s drag and permits keyboard opening from the left', eventName => {
    const { dialog, button, art, point, progress } = sealGesture()
    fireEvent.pointerDown(button, point(1))
    fireEvent.pointerMove(button, point(.65))
    expect(art.dataset.direction).toBe('rtl')
    expect(progress()).toBeGreaterThan(0)
    // Cancellation coordinates can be stale or outside the bag; only a real
    // release may complete the last stretch of a drag.
    fireEvent(button, new PointerEvent(eventName, { ...point(0), bubbles: true }))
    expect(art.dataset.active).toBe('false')
    expect(progress()).toBe(0)
    fireEvent.click(button, { detail: 1 })
    expect(dialog.dataset.phase).toBe('sealed')
    fireEvent.click(button, { detail: 0 })
    expect(dialog.dataset.phase).toBe('tearing')
    expect(art.dataset.direction).toBe('ltr')
  })

  it('uses the final release coordinates when the browser coalesces the last pointer movement', () => {
    const { dialog, button, art, point, progress } = sealGesture()
    fireEvent.pointerDown(button, point(1))
    fireEvent.pointerMove(button, point(.03))
    expect(progress()).toBeCloseTo(.97, 2)
    expect(dialog.dataset.phase).toBe('sealed')
    fireEvent.pointerUp(button, point(0))
    expect(dialog.dataset.phase).toBe('tearing')
    expect(art.dataset.direction).toBe('rtl')
    expect(art.dataset.active).toBe('false')
  })

  it('ignores secondary pointers, vertical movement and an outward tug at the starting edge', () => {
    const { dialog, button, art, point, progress } = sealGesture()
    fireEvent.pointerDown(button, { ...point(0), isPrimary: false })
    expect(art.dataset.active).toBe('false')
    fireEvent.pointerDown(button, point(0))
    fireEvent.pointerDown(button, point(1, 0, 9))
    fireEvent.pointerMove(button, point(1, 0, 9))
    fireEvent.pointerUp(button, point(1, 0, 9))
    expect(progress()).toBe(0)
    expect(art.dataset.active).toBe('true')
    fireEvent.pointerMove(button, point(0, -100))
    fireEvent.pointerMove(button, point(-.5))
    expect(progress()).toBe(0)
    fireEvent.pointerMove(button, point(.5))
    expect(progress()).toBeCloseTo(.5, 2)
    fireEvent.pointerUp(button, point(.5))
    fireEvent.click(button, { detail: 1 })
    expect(dialog.dataset.phase).toBe('sealed')
    expect(art.dataset.active).toBe('false')
    expect(progress()).toBe(0)
  })

  it('uses Escape to leave the craft detail before closing the opening scene', () => {
    const onClose = vi.fn()
    render(<PackOpeningScene cards={savedCards()} onClose={onClose} />)
    const dialog = screen.getByRole('dialog', { name: '开包结果' })
    fireEvent.click(within(dialog).getByRole('button', { name: '跳过动画' }))
    fireEvent.click(within(dialog).getByRole('button', { name: '细看卡片与工艺' }))
    expect(within(dialog).getByRole('button', { name: '返回开包结果' })).toBeTruthy()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(within(dialog).queryByRole('button', { name: '返回开包结果' })).toBeNull()
    expect(within(dialog).getByRole('button', { name: '收好这次相遇' })).toBeTruthy()
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})

describe('read-only opening artwork preview', () => {
  it('keeps the original face mounted during a cold flip and changes only the selected card after its image decodes', async () => {
    const requests = controlImageDecoding()
    const portrait = PRODUCTION_CARD_CATALOG.find(card => card.width < card.height && card.backUrl)!
    const landscape = PRODUCTION_CARD_CATALOG.find(card => card.width > card.height && card.backUrl)!
    const original = PREVIEW_CARD_CATALOG.find(card => card.seriesId === 'legacy-rose-night' && !card.backUrl)!
    expect(portrait).toBeTruthy(); expect(landscape).toBeTruthy(); expect(original).toBeTruthy()
    const cards = [portrait, landscape, original]
    render(<PackOpeningScene preview={{ cardKeys: cards.map(card => card.key), packId: 'dawn-prelude' }} onClose={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: '跳过动画' }))
    const dialog = screen.getByRole('dialog', { name: '开包结果' })
    const shown = within(dialog).getAllByRole('button', { name: /^查看卡片 /u })
    const source = (index: number) => within(shown[index]!).getByRole('img').getAttribute('src')
    const firstImage = within(shown[0]!).getByRole('img')
    for (const [index, card] of cards.entries()) {
      expect(within(shown[index]!).getAllByRole('img')).toHaveLength(1)
      expect(source(index)).toBe(card.frontUrl)
    }
    fireEvent.click(within(dialog).getByRole('button', { name: '翻到背面' }))
    expect(requests[0]?.src).toBe(portrait.backUrl)
    expect(source(0)).toBe(portrait.frontUrl)
    expect((within(dialog).getByRole('button', { busy: true }) as HTMLButtonElement).disabled).toBe(true)
    await act(async () => requests[0]!.resolve())
    expect(within(shown[0]!).getByRole('img')).toBe(firstImage)
    expect(source(0)).toBe(portrait.backUrl)
    expect(source(1)).toBe(landscape.frontUrl)
    expect(source(2)).toBe(original.frontUrl)
    fireEvent.click(within(dialog).getByRole('button', { name: `选择第 2 张：${landscape.name}` }))
    expect(source(0)).toBe(portrait.frontUrl)
    expect(source(1)).toBe(landscape.frontUrl)
    fireEvent.click(within(dialog).getByRole('button', { name: '翻到背面' }))
    expect(requests[1]?.src).toBe(landscape.backUrl)
    await act(async () => requests[1]!.resolve())
    expect(source(1)).toBe(landscape.backUrl)
    expect(source(0)).toBe(portrait.frontUrl)
    fireEvent.click(within(dialog).getByRole('button', { name: `选择第 3 张：${original.name}` }))
    expect(source(1)).toBe(landscape.frontUrl)
    expect(source(2)).toBe(original.frontUrl)
    expect((within(dialog).getByRole('button', { name: '翻到背面' }) as HTMLButtonElement).disabled).toBe(true)
    expect(dialog.textContent).not.toContain('此版本尚未收录卡背')
  })

  it('discards stale flip results after changing card or replaying the opening', async () => {
    const requests = controlImageDecoding()
    const cards = PRODUCTION_CARD_CATALOG.filter(card => card.backUrl).slice(0, 2)
    render(<PackOpeningScene preview={{ cardKeys: cards.map(card => card.key), packId: 'dawn-prelude' }} onClose={() => {}} />)
    const dialog = within(screen.getByRole('dialog', { name: '开包结果' }))
    fireEvent.click(dialog.getByRole('button', { name: '跳过动画' }))
    const shown = dialog.getAllByRole('button', { name: /^查看卡片 /u })
    fireEvent.click(dialog.getByRole('button', { name: '翻到背面' }))
    fireEvent.click(dialog.getByRole('button', { name: `选择第 2 张：${cards[1]!.name}` }))
    fireEvent.click(dialog.getByRole('button', { name: '翻到背面' }))
    expect(requests).toHaveLength(2)
    await act(async () => requests[0]!.resolve())
    expect(shown.map(card => within(card).getByRole('img').getAttribute('src'))).toEqual(cards.map(card => card.frontUrl))
    expect(dialog.getByRole('button', { busy: true })).toBeTruthy()
    fireEvent.click(dialog.getByRole('button', { name: '再看一次' }))
    fireEvent.click(dialog.getByRole('button', { name: '跳过动画' }))
    await act(async () => requests[1]!.resolve())
    expect(dialog.getAllByRole('button', { name: /^查看卡片 /u }).map(card => within(card).getByRole('img').getAttribute('src'))).toEqual(cards.map(card => card.frontUrl))
    expect(dialog.getByRole('button', { name: '翻到背面' })).toBeTruthy()
  })

  it('keeps the last visible artwork after a decode failure and replaces it once a retry succeeds', async () => {
    const requests = controlImageDecoding()
    const card = PRODUCTION_CARD_CATALOG.find(row => row.backUrl)!
    render(<PackOpeningScene preview={{ cardKeys: [card.key], packId: 'dawn-prelude' }} onClose={() => {}} />)
    const dialog = within(screen.getByRole('dialog', { name: '开包结果' }))
    fireEvent.click(dialog.getByRole('button', { name: '跳过动画' }))
    const image = within(dialog.getByRole('button', { name: /^查看卡片 /u })).getByRole('img')
    fireEvent.click(dialog.getByRole('button', { name: '翻到背面' }))
    await act(async () => requests[0]!.reject(new Error('decode failed')))
    expect(image.getAttribute('src')).toBe(card.frontUrl)
    fireEvent.click(dialog.getByRole('button', { name: '重试翻面' }))
    expect(requests[1]?.src).toBe(card.backUrl)
    await act(async () => requests[1]!.resolve())
    expect(image.isConnected).toBe(true)
    expect(image.getAttribute('src')).toBe(card.backUrl)
    fireEvent.click(dialog.getByRole('button', { name: '看看正面' }))
    expect(requests[2]?.src).toBe(card.frontUrl)
    expect(image.getAttribute('src')).toBe(card.backUrl)
    await act(async () => requests[2]!.resolve())
    expect(image.getAttribute('src')).toBe(card.frontUrl)
  })

  it('keeps selection in view through arrow navigation, numbered selection and returning from detail', async () => {
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })))
    const cards = savedCards(3)
    render(<PackOpeningScene cards={cards} onClose={() => {}} />)
    const dialog = screen.getByRole('dialog', { name: '开包结果' })
    fireEvent.click(within(dialog).getByRole('button', { name: '沿封口拆开' }))
    const gallery = dialog.querySelector<HTMLElement>('.lumaOpeningCards')!
    const shown = within(dialog).getAllByRole('button', { name: /^查看卡片 /u })
    const picker = within(dialog).getByRole('navigation', { name: '选择揭晓的卡片' })
    const numbers = within(picker).getAllByRole('button')
    const scrollTo = vi.fn()
    Object.defineProperty(gallery, 'scrollTo', { configurable: true, value: scrollTo })
    Object.defineProperty(gallery, 'clientWidth', { configurable: true, value: 360 })
    Object.defineProperty(gallery, 'scrollWidth', { configurable: true, value: 1000 })
    for (const [index, button] of shown.entries()) {
      Object.defineProperty(button, 'offsetLeft', { configurable: true, value: 220 * index })
      Object.defineProperty(button, 'clientWidth', { configurable: true, value: 160 })
      Object.defineProperty(button, 'offsetWidth', { configurable: true, value: 160 })
    }
    shown[0]!.focus()
    fireEvent.keyDown(shown[0]!, { key: 'ArrowRight' })
    expect(shown[1]!.getAttribute('aria-pressed')).toBe('true')
    expect(numbers[1]!.getAttribute('aria-pressed')).toBe('true')
    await waitFor(() => expect(scrollTo).toHaveBeenCalled())
    expect(scrollTo.mock.calls.at(-1)![0].left).toBeGreaterThan(0)
    expect(scrollTo.mock.calls.at(-1)![0].behavior).toBe('auto')
    fireEvent.keyDown(shown[1]!, { key: 'ArrowLeft' })
    expect(shown[0]!.getAttribute('aria-pressed')).toBe('true')
    expect(numbers[0]!.getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(numbers[2]!)
    expect(shown[2]!.getAttribute('aria-pressed')).toBe('true')
    expect(numbers[2]!.getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(within(dialog).getByRole('button', { name: '细看卡片与工艺' }))
    expect(dialog.querySelector('.lumaOpeningCards')).toBeNull()
    fireEvent.keyDown(document, { key: 'Escape' })
    const returnedGallery = dialog.querySelector<HTMLElement>('.lumaOpeningCards')!
    const returnedCards = within(dialog).getAllByRole('button', { name: /^查看卡片 /u })
    expect(returnedGallery).not.toBe(gallery)
    Object.defineProperty(returnedGallery, 'scrollTo', { configurable: true, value: scrollTo })
    Object.defineProperty(returnedGallery, 'clientWidth', { configurable: true, value: 360 })
    Object.defineProperty(returnedGallery, 'scrollWidth', { configurable: true, value: 1000 })
    for (const [index, button] of returnedCards.entries()) {
      Object.defineProperty(button, 'offsetLeft', { configurable: true, value: 220 * index })
      Object.defineProperty(button, 'offsetWidth', { configurable: true, value: 160 })
    }
    scrollTo.mockClear()
    expect(returnedCards[2]!.getAttribute('aria-pressed')).toBe('true')
    await waitFor(() => expect(scrollTo).toHaveBeenCalled())
    expect(scrollTo.mock.calls.at(-1)![0].left).toBeGreaterThan(0)
    expect(scrollTo.mock.calls.at(-1)![0].behavior).toBe('auto')
    expect(scrollTo.mock.contexts.at(-1)).toBe(returnedGallery)
  })

  it('shows retained artwork and the selected skin without claiming an acquisition or offering owned navigation', () => {
    const historical = PRODUCTION_CARD_CATALOG.find(card => card.historicalRevision)!
    const errata = PRODUCTION_CARD_CATALOG.find(card => card.edition === 'errata')!
    expect(historical).toBeTruthy(); expect(errata).toBeTruthy()
    const skin = OPENABLE_PACK_SKINS.find(row => row.id === 'blue-rose-v1')!
    const cardKeys = Object.freeze([historical.key, errata.key])
    const onClose = vi.fn(), onOpenOwned = vi.fn()
    render(<PackOpeningScene preview={{ cardKeys, packId: skin.packId, skin }} onClose={onClose} onOpenOwned={onOpenOwned} />)
    expect(screen.getByRole('img', { name: `${skin.name}卡包完整外观` }).getAttribute('src')).toBe(skin.openingArtworkUrl)
    expect(screen.getByText(/不计入持有/u)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '跳过动画' }))
    expect(screen.getByText('正在欣赏 2 张原始卡面 · 素材预览')).toBeTruthy()
    expect(screen.queryByText(/已收入我的卡册/u)).toBeNull()
    expect(screen.queryByRole('button', { name: '查看我的持有' })).toBeNull()
    const shown = screen.getAllByRole('img').map(image => image.getAttribute('src'))
    expect(shown).toContain(historical.frontUrl); expect(shown).toContain(errata.frontUrl)
    const before = [...shown]
    fireEvent.click(screen.getByRole('button', { name: '再看一次' }))
    fireEvent.click(screen.getByRole('button', { name: '跳过动画' }))
    expect(screen.getAllByRole('img').map(image => image.getAttribute('src'))).toEqual(before)
    fireEvent.click(screen.getByRole('button', { name: '返回素材册' }))
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(onOpenOwned).not.toHaveBeenCalled()
    expect(cardKeys).toEqual([historical.key, errata.key])
  })

  it.each(['blue-rose-v2', 'blue-rose-back'])('uses the pool’s actual foil pouch when an existing preview supplies flat artwork %s', id => {
    const skin = PACK_REFERENCE_SKINS.find(row => row.id === id)!
    render(<PackOpeningScene preview={{ cardKeys: [PREVIEW_CARD_CATALOG[0]!.key], packId: skin.packId, skin }} onClose={() => {}} />)
    expect(screen.getByAltText(/卡包完整外观/u).getAttribute('src')).toBe('/luma-economy/packs/blue-rose-cutout-r1.png')
  })
})

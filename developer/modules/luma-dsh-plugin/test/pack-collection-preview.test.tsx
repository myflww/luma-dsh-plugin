import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { PackCollectionPreview } from '../src/client/PackCollectionPreview.tsx'
import { PREVIEW_CARD_CATALOG } from '../src/shared/preview-card-catalog.ts'
import { OPENABLE_PACK_SKINS, PACK_REFERENCE_SKINS } from '../src/shared/pack-skin-catalog.ts'

vi.mock('../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/LumaHelpTip.tsx', async () =>
  import('../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-primitives/src/client/LumaHelpTip.tsx'))
afterEach(cleanup)

describe('complete read-only collection preview', () => {
  it('exposes every source edition and every source skin, including retained historical artwork', () => {
    const { container } = render(<PackCollectionPreview />)
    const shownKeys = () => [...container.querySelectorAll<HTMLElement>('[data-edition-key]')].map(row => row.dataset.editionKey)
    const keys = shownKeys()
    expect(new Set(keys)).toEqual(new Set(PREVIEW_CARD_CATALOG.map(card => card.key)))
    expect(keys).toHaveLength(PREVIEW_CARD_CATALOG.length)
    expect(keys).toHaveLength(226)
    expect(screen.getByText(/素材预览不消耗卡包或星币，也不会新增持有记录/)).toBeTruthy()
    fireEvent.change(screen.getByLabelText('筛选版本'), { target: { value: 'historical' } })
    expect(shownKeys()).toEqual(PREVIEW_CARD_CATALOG.filter(card => card.historicalRevision).map(card => card.key))
    expect(shownKeys()).toContain(PREVIEW_CARD_CATALOG.find(card => card.seriesId === 'legacy-rose-night')!.key)
    fireEvent.change(screen.getByLabelText('筛选版本'), { target: { value: 'errata' } })
    expect(shownKeys()).toEqual(PREVIEW_CARD_CATALOG.filter(card => card.edition === 'errata').map(card => card.key))
    fireEvent.click(screen.getByText('重置筛选'))
    fireEvent.change(screen.getByLabelText('筛选品质'), { target: { value: 'unrated' } })
    expect(shownKeys()).toEqual(PREVIEW_CARD_CATALOG.filter(card => !card.rarity).map(card => card.key))
    fireEvent.change(screen.getByLabelText('筛选品质'), { target: { value: 'N' } })
    expect(shownKeys()).toEqual(PREVIEW_CARD_CATALOG.filter(card => card.rarity === 'N').map(card => card.key))
    fireEvent.click(screen.getByText('重置筛选'))
    fireEvent.change(screen.getByLabelText('筛选角色'), { target: { value: '陆弥' } })
    expect(shownKeys()).toEqual(PREVIEW_CARD_CATALOG.filter(card => card.character === '陆弥').map(card => card.key))
    fireEvent.change(screen.getByLabelText('搜索全部卡牌'), { target: { value: 'no-such-luma-artwork-197361' } })
    expect(shownKeys()).toEqual([])
    fireEvent.click(screen.getByText('显示全部卡牌'))
    expect(container.querySelectorAll('[data-edition-key]')).toHaveLength(PREVIEW_CARD_CATALOG.length)
  }, 15000)

  it('shows the selected pouch in the picker, cover and opening, and opens every flat source as a read-only original', () => {
    render(<PackCollectionPreview />)
    const skins = within(screen.getByRole('region', { name: '全部卡包皮肤' }))
    const refs = within(screen.getByRole('region', { name: '图案与卡背参考' }))
    expect(skins.getAllByRole('button')).toHaveLength(5)
    expect(refs.getAllByRole('button')).toHaveLength(8)
    for (const skin of OPENABLE_PACK_SKINS) {
      const button = skins.getByRole('button', { name: `选择卡包皮肤：${skin.name}` })
      const expected = skin.openingArtworkUrl ?? skin.artworkUrl
      expect(within(button).getByRole('img').getAttribute('src')).toBe(expected)
      fireEvent.click(button)
      expect(screen.getByAltText(`${skin.name}完整包装图`).getAttribute('src')).toBe(expected)
      fireEvent.click(screen.getByText('体验这款开包'))
      const dialog = within(screen.getByRole('dialog', { name: '开包结果' }))
      expect(dialog.getByAltText(`${skin.name}卡包完整外观`).getAttribute('src')).toBe(expected)
      fireEvent.click(dialog.getByRole('button', { name: '关闭开包结果' }))
    }
    const chosen = skins.getByRole('button', { pressed: true })
    for (const material of PACK_REFERENCE_SKINS) {
      const button = refs.getByRole('button', { name: `查看参考素材：${material.name}` })
      button.focus()
      fireEvent.click(button)
      const dialog = screen.getByRole('dialog', { name: `${material.name}参考原图` })
      expect(within(dialog).getByRole('img').getAttribute('src')).toBe(material.artworkUrl)
      expect(within(dialog).getAllByRole('button')).toEqual([within(dialog).getByRole('button', { name: '关闭参考原图' })])
      fireEvent.keyDown(document, { key: 'Escape' })
      expect(dialog.isConnected).toBe(false)
      expect(document.activeElement).toBe(button)
    }
    expect(skins.getByRole('button', { pressed: true })).toBe(chosen)
  }, 20000)

  it('limits only the opening selection to five while keeping all cards browsable and skins independently selectable', () => {
    const { container } = render(<PackCollectionPreview />)
    const open = screen.getByText('体验这款开包') as HTMLButtonElement
    const choose = (key: string) => {
      const article = [...container.querySelectorAll<HTMLElement>('[data-edition-key]')].find(row => row.dataset.editionKey === key)!
      return within(article).getByRole('button', { name: `加入开包预览：${key}`, exact: true })
    }
    fireEvent.click(screen.getByText('清空所选'))
    expect(open.disabled).toBe(true)
    const legacy = PREVIEW_CARD_CATALOG.find(card => card.seriesId === 'legacy-rose-night')!
    const cards = [legacy, ...PREVIEW_CARD_CATALOG.slice(0, 4)]
    for (const card of cards) fireEvent.click(choose(card.key))
    const sixth = PREVIEW_CARD_CATALOG[4]!
    fireEvent.click(choose(sixth.key))
    expect(choose(sixth.key).getAttribute('aria-pressed')).toBe('false')
    expect(container.querySelectorAll('.lumaPackPreviewCard.is-selected')).toHaveLength(5)
    expect(screen.getByRole('status').textContent).toContain('1–5 张')
    expect(container.querySelectorAll('[data-edition-key]')).toHaveLength(PREVIEW_CARD_CATALOG.length)
    const skin = OPENABLE_PACK_SKINS.find(row => row.id === 'grok-v1')!
    const skins = within(screen.getByRole('region', { name: '全部卡包皮肤' }))
    const skinButton = skins.getByRole('button', { name: `选择卡包皮肤：${skin.name}`, exact: true })
    fireEvent.click(skinButton)
    expect(skinButton.getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(open)
    const opening = screen.getByRole('dialog', { name: '开包结果' })
    expect(within(opening).getByAltText(`${skin.name}卡包完整外观`).getAttribute('src')).toBe(skin.artworkUrl)
    fireEvent.click(within(opening).getByRole('button', { name: '跳过动画' }))
    expect(within(opening).getAllByRole('button', { name: /^查看卡片 / })).toHaveLength(5)
    const fronts = [...opening.querySelectorAll<HTMLImageElement>('.lumaOpeningCardFace.is-front img')].map(image => image.getAttribute('src'))
    expect(fronts).toEqual(cards.map(card => card.frontUrl))
    expect(opening.textContent).not.toContain('已收入我的卡册')
    expect(within(opening).queryByRole('button', { name: '查看我的持有' })).toBeNull()
    fireEvent.click(within(opening).getByRole('button', { name: '返回素材册' }))
    expect(screen.queryByRole('dialog', { name: '开包结果' })).toBeNull()
    expect(container.querySelectorAll('.lumaPackPreviewCard.is-selected')).toHaveLength(5)
    expect(container.querySelectorAll('[data-edition-key]')).toHaveLength(PREVIEW_CARD_CATALOG.length)
  }, 15000)
})

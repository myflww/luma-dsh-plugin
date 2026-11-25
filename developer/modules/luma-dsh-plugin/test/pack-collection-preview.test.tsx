import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { getPackPool } from '../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/economy/domain/cardPacks.ts'
import { PackCollectionPreview } from '../src/client/PackCollectionPreview.tsx'
import { OPENABLE_PACK_SKINS, PACK_REFERENCE_SKINS } from '../src/shared/pack-skin-catalog.ts'

vi.mock('../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/LumaHelpTip.tsx', async () =>
  import('../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-primitives/src/client/LumaHelpTip.tsx'))
afterEach(cleanup)

const pack = 'blue-rose-echo'
const pool = getPackPool(pack)
const errata = pool.find(card => card.edition === 'errata')!
const empty = { discoveredKeys: new Set<string>() }
const independent = PACK_REFERENCE_SKINS.find(row => row.packId === 'egg-channel')!

describe('free sample opening', () => {
  it('uses the selected pack’s public editions and reveals only the acquired errata key', () => {
    const onClose = vi.fn()
    const view = render(<PackCollectionPreview collection={empty} initialPackId={pack} onClose={onClose} />)
    const shown = () => [...view.container.querySelectorAll<HTMLElement>('[data-edition-key]')].map(node => node.dataset.editionKey)
    expect(shown()).toEqual(pool.filter(card => card.edition === 'standard').map(card => card.key))
    expect(view.container.querySelector(`img[src="${errata.frontUrl}"]`)).toBeNull()
    expect(view.container.querySelector(`img[src="${independent.artworkUrl}"]`)).toBeNull()

    const collection = { discoveredKeys: new Set([errata.key]) }
    view.rerender(<PackCollectionPreview collection={collection} initialPackId={pack} onClose={onClose} />)
    expect(shown()).toEqual(pool.filter(card => card.edition === 'standard' || card.key === errata.key).map(card => card.key))
    const choices = within(screen.getByRole('region', { name: '试拆样卡' }))
    fireEvent.click(choices.getByRole('button', { pressed: true }))
    fireEvent.click(choices.getByRole('button', { name: `错版 · ${errata.name} · ${errata.versionLabel}`, exact: true }))
    fireEvent.click(screen.getByRole('button', { name: '开始试拆' }))
    expect(screen.getByRole('dialog', { name: '开包结果' })).toBeTruthy()

    view.rerender(<PackCollectionPreview collection={empty} initialPackId={pack} onClose={onClose} />)
    expect(screen.queryByRole('dialog', { name: '开包结果' })).toBeNull()
    expect(view.container.querySelector(`img[src="${errata.frontUrl}"]`)).toBeNull()
  })

  it('supports 1–5 selected samples and five independent pouch designs without writing collection data', () => {
    render(<PackCollectionPreview collection={empty} initialPackId={pack} onClose={vi.fn()} />)
    const choices = within(screen.getByRole('region', { name: '试拆样卡' }))
    const start = choices.getByRole<HTMLButtonElement>('button', { name: '开始试拆' })
    const buttons = choices.getAllByRole<HTMLButtonElement>('button', { pressed: false })
    fireEvent.click(choices.getByRole('button', { pressed: true }))
    expect(start.disabled).toBe(true)
    for (const button of buttons.slice(0, 5)) fireEvent.click(button)
    expect(buttons[5]!.disabled).toBe(true)
    expect(choices.getAllByRole('button', { pressed: true })).toHaveLength(5)
    const wrappers = within(screen.getByRole('region', { name: '包装' }))
    expect(wrappers.getAllByRole('button')).toHaveLength(5)
    expect(wrappers.getByRole('button', { pressed: true }).getAttribute('aria-label')).toBe(OPENABLE_PACK_SKINS.find(skin => skin.packId === pack)!.name)
    for (const skin of OPENABLE_PACK_SKINS) {
      fireEvent.click(wrappers.getByRole('button', { name: skin.name }))
      const artwork = skin.openingArtworkUrl ?? skin.artworkUrl
      expect(wrappers.getByRole('img', { name: skin.name }).getAttribute('src')).toBe(artwork)
      fireEvent.click(start)
      const opening = within(screen.getByRole('dialog', { name: '开包结果' }))
      expect(opening.getByAltText(`${skin.name}卡包完整外观`).getAttribute('src')).toBe(artwork)
      fireEvent.click(opening.getByRole('button', { name: '跳过动画' }))
      expect(opening.getAllByRole('button', { name: /^查看卡片 / })).toHaveLength(5)
      fireEvent.click(opening.getByRole('button', { name: '返回试拆台' }))
    }
    expect(empty.discoveredKeys.size).toBe(0)
    fireEvent.click(buttons[0]!)
    expect(buttons[5]!.disabled).toBe(false)
  })

  it('keeps the independent back private until an egg edition is discovered and closes materials separately', () => {
    const onClose = vi.fn()
    const view = render(<PackCollectionPreview collection={empty} initialPackId={pack} onClose={onClose} />)
    fireEvent.click(screen.getByText('卡背与金属图案'))
    expect(screen.queryByRole('button', { name: independent.name })).toBeNull()
    const collection = { discoveredKeys: new Set(['LR-01@foil-v01-r01']) }
    view.rerender(<PackCollectionPreview collection={collection} initialPackId={pack} onClose={onClose} />)
    for (const material of PACK_REFERENCE_SKINS) {
      const trigger = screen.getByRole('button', { name: material.name })
      trigger.focus()
      fireEvent.click(trigger)
      const dialog = within(screen.getByRole('dialog', { name: material.name }))
      expect(dialog.getByRole('img', { name: material.name }).getAttribute('src')).toBe(material.artworkUrl)
      fireEvent.keyDown(document, { key: 'Escape' })
      expect(document.activeElement).toBe(trigger)
      expect(onClose).not.toHaveBeenCalled()
    }
    fireEvent.click(screen.getByRole('button', { name: independent.name }))
    view.rerender(<PackCollectionPreview collection={empty} initialPackId={pack} onClose={onClose} />)
    expect(view.container.querySelector(`img[src="${independent.artworkUrl}"]`)).toBeNull()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledOnce()
  })
})

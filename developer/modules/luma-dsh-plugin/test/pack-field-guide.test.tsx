import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { PackFieldGuide } from '../src/client/PackFieldGuide.tsx'
import { getVisibleGuideCards, projectLocalCollection, type LocalCollectionEvent } from '../src/shared/local-collection-domain.ts'
import { PREVIEW_CARD_CATALOG } from '../src/shared/preview-card-catalog.ts'

afterEach(cleanup)
const project = (...events: LocalCollectionEvent[]) => projectLocalCollection({ schemaVersion: 1, events })
const granted = (key: string): LocalCollectionEvent => ({
  type: 'local-profile-grant', id: 'album-guide-grant', at: 1, versionKeys: [key], employeeIds: [],
})

describe('卡池图鉴', () => {
  it('keeps special editions out of results and totals until the profile obtains that exact version', () => {
    const empty = project()
    const count = getVisibleGuideCards(empty).length
    const hidden = PREVIEW_CARD_CATALOG.find(card => card.workId === 'LR-01')!
    const sibling = PREVIEW_CARD_CATALOG.find(card => card.key !== hidden.key && card.workId === hidden.workId)
    const page = (collection: typeof empty) => <PackFieldGuide collection={collection} onOpenShop={() => {}}/>
    const { container, rerender } = render(page(empty))
    const allPools = screen.getByRole('button', { name: /全部卡池/ })
    expect(allPools.textContent).toContain('0 / ' + count)
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: hidden.workId } })
    expect(container.querySelector('.lumaGuideSlots li')).toBeNull()
    expect(container.querySelector('img[src="' + hidden.frontUrl + '"]')).toBeNull()

    rerender(page(project(granted(hidden.key))))
    expect(allPools.textContent).toContain('1 / ' + (count + 1))
    const slots = container.querySelectorAll('.lumaGuideSlots li')
    expect(slots).toHaveLength(1)
    expect(slots[0]?.getAttribute('data-edition-key')).toBe(hidden.key)
    if (sibling) expect(container.querySelector('[data-edition-key="' + sibling.key + '"]')).toBeNull()
    fireEvent.click(within(slots[0] as HTMLElement).getByRole('button'))
    expect(screen.getByRole('dialog', { name: hidden.name + '详情' })).toBeTruthy()
    rerender(page(empty))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(container.querySelector('.lumaGuideSlots li')).toBeNull()
  })

  it('displays the public card back before acquisition and its saved front after redemption', () => {
    const empty = project()
    const card = getVisibleGuideCards(empty, 'dawn-prelude')[0]!
    const page = (collection: typeof empty) => <PackFieldGuide collection={collection} onOpenShop={() => {}}/>
    const { container, rerender } = render(page(empty))
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: card.key } })
    const slot = screen.getByRole('listitem')
    expect(slot.querySelector('img')?.getAttribute('src')).toMatch(/^\/luma-card-library\/assets\//)
    expect(slot.querySelector('img')?.getAttribute('src')).not.toBe(card.frontUrl)
    expect(within(slot).getByText('未获得')).toBeTruthy()
    expect(container.querySelector('button.lumaGuideStamp')).toBeNull()

    const grant = granted(card.key)
    const acquired = project(grant)
    rerender(page(project(grant, { type: 'redeem-employee', id: 'guide-redemption', at: 2,
      employeeId: 'shan', cardInstanceId: acquired.cards[0]!.id })))
    expect(container.querySelector('.lumaGuideStamp img')?.getAttribute('src')).toBe(card.frontUrl)
    expect(screen.getByText('已点亮 · 已兑换')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('筛选点亮状态'), { target: { value: 'held' } })
    expect(container.querySelector('.lumaGuideSlots li')).toBeNull()
    fireEvent.change(screen.getByLabelText('筛选点亮状态'), { target: { value: 'seen' } })
    expect(container.querySelector('button.lumaGuideStamp')).toBeTruthy()
  })
})

import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { PluginShell, LUMA_PAGES } from '../src/client/PluginShell.tsx'

vi.mock('../src/client/OfficePage.tsx', () => ({ OfficePage: ({ active, onOpenChat }: { active: boolean; onOpenChat(id: string): void }) =>
  <section data-testid="office" data-active={String(active)}><button onClick={() => onOpenChat('lu-mi')}>与露米聊天</button></section> }))
vi.mock('../src/client/CardsPage.tsx', () => ({ CardsPage: () => <section data-testid="cards">我的卡牌</section> }))
vi.mock('../src/client/MessagesPage.tsx', () => ({ MessagesPage: ({ onOpenNative }: { onOpenNative(): void }) => <section data-testid="messages"><button onClick={onOpenNative}>模型设置</button></section> }))
vi.mock('../src/client/CollectionHub.tsx', () => ({ CollectionHub: ({ onOpenOwned }: { onOpenOwned(): void }) => <section><button onClick={onOpenOwned}>查看开包所得</button></section> }))
vi.mock('../src/client/PluginSettingsPage.tsx', () => ({ PluginSettingsPage: () => <section>插件偏好</section> }))
const rights = { unlockedEmployeeIds: ['lu-mi', 'jingyuniang'], unlockedThemeIds: [] }
const collection = { store: { getSnapshot: () => rights, subscribe: () => () => {} } } as never
afterEach(cleanup)

it('keeps office and role chat resident and releases native DSH for model settings', () => {
  const messages = { selectRole: vi.fn(() => true) }
  render(<PluginShell office={{} as never} cards={{} as never} collection={collection} messages={messages as never} preferences={{} as never} />)
  expect(LUMA_PAGES.map(page => page.id)).toEqual(['office', 'messages', 'cards', 'shop', 'settings'])
  const office = screen.getByTestId('office')
  fireEvent.click(screen.getByRole('button', { name: '与露米聊天' }))
  expect(messages.selectRole).toHaveBeenCalledWith('lu-mi', true)
  expect(screen.getByRole('button', { name: '联系' }).getAttribute('aria-current')).toBe('page')
  expect(office.getAttribute('data-active')).toBe('false')
  fireEvent.click(screen.getByRole('button', { name: '模型设置' }))
  expect(office.closest('main')?.hidden).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: '卡牌收藏' }))
  expect(screen.getByTestId('cards').textContent).toBe('我的卡牌')
  expect(screen.getByTestId('office')).toBe(office)
  fireEvent.click(screen.getByRole('button', { name: '办公室' }))
  expect(office.getAttribute('data-active')).toBe('true')
  expect(office.closest('main')?.hidden).toBe(false)
})

it('keeps the office visible when role switching is rejected and allows a later retry', () => {
  const messages = { selectRole: vi.fn().mockReturnValueOnce(false).mockReturnValueOnce(true) }
  render(<PluginShell office={{} as never} cards={{} as never} collection={collection} messages={messages as never} preferences={{} as never} />)
  fireEvent.click(screen.getByRole('button', { name: '与露米聊天' }))
  expect(messages.selectRole).toHaveBeenCalledWith('lu-mi', true)
  expect(screen.getByRole('button', { name: '办公室' }).getAttribute('aria-current')).toBe('page')
  expect(screen.getByTestId('office').getAttribute('data-active')).toBe('true')
  expect(screen.queryByRole('button', { name: '模型设置' })).toBeNull()
  expect(screen.getByRole('status').textContent).toBe('当前操作处理中，请稍后重试。')

  fireEvent.click(screen.getByRole('button', { name: '与露米聊天' }))
  expect(screen.getByRole('button', { name: '联系' }).getAttribute('aria-current')).toBe('page')
  expect(screen.getByTestId('office').getAttribute('data-active')).toBe('false')
  expect(screen.queryByRole('status')).toBeNull()
})

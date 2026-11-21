import { afterEach, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { PluginShell, LUMA_PAGES } from '../src/client/PluginShell.tsx'

vi.mock('../src/client/OfficePage.tsx', () => ({ OfficePage: ({ active, onOpenChat, sceneMenu }: { active: boolean; onOpenChat(id: string): void; sceneMenu: ReactNode }) =>
  <section data-testid="office" data-active={String(active)}>{sceneMenu}<button onClick={() => onOpenChat('lu-mi')}>与露米聊天</button></section> }))
vi.mock('../src/client/LoveHouseQuickConnect.tsx', () => ({ LoveHouseQuickConnect: ({ onClose }: { onClose(): void }) =>
  <div role="dialog" aria-label="爱之屋"><button onClick={onClose}>关闭</button></div> }))
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
  expect(screen.getByRole('button', { name: '菜单' }).getAttribute('aria-expanded')).toBe('false')
  expect(screen.getByTestId('office').getAttribute('data-active')).toBe('true')
  expect(screen.queryByRole('button', { name: '模型设置' })).toBeNull()
  expect(screen.getByRole('status').textContent).toBe('当前操作处理中，请稍后重试。')

  fireEvent.click(screen.getByRole('button', { name: '与露米聊天' }))
  expect(screen.getByRole('button', { name: '联系' }).getAttribute('aria-current')).toBe('page')
  expect(screen.getByTestId('office').getAttribute('data-active')).toBe('false')
  expect(screen.queryByRole('status')).toBeNull()
})

it('opens destinations, memory and native sidebar controls from the scene without a permanent rail', () => {
  const sidebar = { getSnapshot: () => true, subscribe: () => () => {}, toggle: vi.fn() }
  const exit = vi.fn()
  render(<PluginShell office={{} as never} cards={{} as never} collection={collection} messages={{} as never}
    preferences={{} as never} hostSidebar={sidebar} onReturnToDSH={exit}/>)
  expect(screen.queryByRole('navigation',{name:'Luma 页面'})).toBeNull()
  fireEvent.click(screen.getByRole('button',{name:'展开 DSH 侧栏'}))
  expect(sidebar.toggle).toHaveBeenCalledOnce()
  fireEvent.click(screen.getByRole('button',{name:'爱之屋'}))
  expect(screen.getByRole('dialog',{name:'爱之屋'})).toBeTruthy()
  fireEvent.click(screen.getByRole('button',{name:'关闭'}))
  fireEvent.click(screen.getByRole('button',{name:'菜单'}))
  fireEvent.click(screen.getByRole('button',{name:'插件设置'}))
  expect(screen.getByText('插件偏好')).toBeTruthy()
  fireEvent.click(screen.getByRole('button',{name:'办公室'}))
  fireEvent.click(screen.getByRole('button',{name:'菜单'}))
  fireEvent.click(screen.getByRole('button',{name:'返回 DSH'}))
  expect(exit).toHaveBeenCalledOnce()
})

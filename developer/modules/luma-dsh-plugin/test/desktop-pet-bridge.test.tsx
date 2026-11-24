import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { useDesktopPets } from '../src/client/useDesktopPets.ts'

const snapshot = (roles: string[]) => ({ ok: true, json: async () => ({
  ok: true, value: { supported: true, pets: roles.map(roleId => ({ roleId })) },
}) })
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

it('keeps the browser-only office local and uses the native cursor only for an actual drop', async () => {
  const fetcher = vi.fn(async (_url: string, init: RequestInit) => {
    const command = JSON.parse(String(init.body))
    return snapshot(command.action === 'open' ? [command.roleId] : [])
  })
  vi.stubGlobal('fetch', fetcher)
  const notify = vi.fn(), reduced = () => true
  const { result, rerender } = renderHook(({ desktop }) => useDesktopPets(desktop, notify, reduced), { initialProps: { desktop: false } })
  expect(fetcher).not.toHaveBeenCalled()
  rerender({ desktop: true })
  await waitFor(() => expect(result.current.open).toBeTypeOf('function'))
  act(() => result.current.open?.('jingyuniang', {screenX: -31, screenY: 80}))
  await waitFor(() => expect(result.current.roleIds).toEqual(['jingyuniang']))
  expect(JSON.parse(String(fetcher.mock.calls.at(-1)?.[1].body))).toMatchObject({action: 'open', atCursor: true, reduceMotion: true})
  act(() => result.current.recall?.('jingyuniang'))
  await waitFor(() => expect(result.current.roleIds).toEqual([]))
})

it('keeps the scene resident on failed open and ignores an older status arriving after a successful detach', async () => {
  let releaseStatus: (value: ReturnType<typeof snapshot>) => void = () => {}
  let attempted = 0, statuses = 0
  const notify = vi.fn(), reduced = () => false
  vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
    const cmd = JSON.parse(String(init.body))
    if (cmd.action === 'status') {
      if (++statuses === 1) return snapshot([])
      return new Promise<ReturnType<typeof snapshot>>(resolve => { releaseStatus = resolve })
    }
    if (++attempted === 1) return { ok: false, json: async () => ({ error: '窗口未能打开' }) }
    return snapshot(['jingyuniang'])
  }))
  const { result } = renderHook(() => useDesktopPets(true, notify, reduced))
  await waitFor(() => expect(result.current.open).toBeTypeOf('function'))
  act(() => result.current.open?.('jingyuniang'))
  await waitFor(() => expect(notify).toHaveBeenCalledWith('窗口未能打开'))
  expect(result.current.roleIds).toEqual([])
  act(() => { window.dispatchEvent(new Event('focus')); result.current.open?.('jingyuniang') })
  await waitFor(() => expect(result.current.roleIds).toEqual(['jingyuniang']))
  await act(async () => { releaseStatus(snapshot([])) })
  expect(result.current.roleIds).toEqual(['jingyuniang'])
})

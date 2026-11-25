import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { useDesktopPets } from '../src/client/useDesktopPets.ts'
import { desktopPetBedtime, desktopPetPeriod } from '../native-desktop/desktop-pet.ts'
import { createOfficeClockPolicy } from '../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/office-time/domain/timePolicy.ts'

const snapshot = (roles: string[]) => ({ ok: true, json: async () => ({
  ok: true, value: { supported: true, pets: roles.map(roleId => ({ roleId })) },
}) })
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

it('keeps bedroom and desktop night hours aligned through midnight, workdays, lunch and weekends', () => {
  for (const day of [25, 27, 28, 29, 30]) {
    for (const [hour, minute, night] of [
      [0,0,true],[5,59,true],[6,0,false],[8,59,false],[9,0,false],[12,0,false],
      [13,0,false],[18,0,false],[19,59,false],[20,0,true],[23,59,true],
    ] as const) {
      const date=new Date(2026,10,day,hour,minute)
      expect(desktopPetBedtime(date)).toBe(night)
      expect(desktopPetBedtime(date)).toBe(createOfficeClockPolicy({date}).bedtime)
    }
  }
  expect(createOfficeClockPolicy({date:new Date(2026,10,25,10)}).isWorkPeriod).toBe(true)
  expect(createOfficeClockPolicy({date:new Date(2026,10,28,10)}).isWorkPeriod).toBe(false)
  expect([new Date(2026,10,25,11,59,59), new Date(2026,10,25,12),new Date(2026,10,25,12,59,59),
    new Date(2026,10,25,13),new Date(2026,10,28,12)]
    .map(d=>desktopPetPeriod(d))).toEqual(['day','lunch','lunch','day','day'])
  expect(desktopPetPeriod(new Date(2026,10,25,12),{calendar:{schemaVersion:1,restDates:['2026-11-25']}})).toBe('day')
})

it('keeps the first pet detached when a second overlapping summon fails', async () => {
  let release!:()=>void
  const gate = new Promise<void>(resolve=>{release=resolve})
  const reduced=()=>false,notify=vi.fn()
  vi.stubGlobal('fetch',vi.fn(async (_url:string,init:RequestInit)=>{
    const command=JSON.parse(String(init.body))
    if(command.action==='status')return snapshot([])
    if(command.roleId==='shan')return {ok:false,json:async()=>({error:'未能打开窗口'})}
    await gate
    return snapshot(['jingyuniang'])
  }))
  const {result}=renderHook(()=>useDesktopPets(true,notify,reduced))
  await waitFor(()=>expect(result.current.open).toBeTypeOf('function'))
  act(()=>{result.current.open?.('jingyuniang');result.current.open?.('shan')})
  await act(async()=>release())
  await waitFor(()=>expect(notify).toHaveBeenCalledWith('未能打开窗口'))
  expect(result.current.roleIds).toEqual(['jingyuniang'])
})

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

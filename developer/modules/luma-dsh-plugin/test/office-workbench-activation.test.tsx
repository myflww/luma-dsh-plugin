import { act, cleanup, renderHook } from '@testing-library/react'
import type { MouseEvent, PointerEvent } from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { initialRuntime } from '../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/officeSceneActorRuntime.ts'
import { OFFICE_SEAT_BOXES } from '../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/officeSceneSeatTargets.ts'
import { useOfficeSceneInteractions } from '../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/useOfficeSceneInteractions.ts'
import { uncrowdedFloorPoint } from '../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/office2d/scenePlacement.ts'
import { findOfficeDropFloor, findWorkstationRouteFromPoint, isOfficeFootAnchorBlocked, OFFICE_NAV_ACTION_POINTS, OFFICE_WORKSTATION_APPROACHES } from '../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/office2d/navigation.ts'
import { officeEmployeeAction } from '../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/office2d/actorPortraitActivation.ts'

afterEach(() => { cleanup(); vi.useRealTimers() })

it('delivers an equipped paper plane at the tap or keyboard focus while preserving dragging',()=>{
  const give=vi.fn(),{open,bind,employee,view,canvas,pointer}=fixture(false,'contact',give)
  act(()=>{
    view.result.current.startActorDrag(pointer(30,22,'pointerdown'),employee)
    view.result.current.finishActorDrag(pointer(31,23,'pointerup'))
  })
  expect(give).toHaveBeenCalledWith('shan',{x:31,y:23})
  act(()=>view.result.current.handleActorClick({detail:0,currentTarget:canvas} as unknown as MouseEvent<HTMLButtonElement>,'shan'))
  expect(give).toHaveBeenCalledTimes(2)
  expect(give.mock.calls[1]![1].x).toBe(836)
  act(()=>{
    view.result.current.startActorDrag(pointer(20,30,'pointerdown'),employee)
    view.result.current.moveActorDrag(pointer(856,723,'pointermove'))
    view.result.current.finishActorDrag(pointer(856,723,'pointerup'))
  })
  expect(bind).toHaveBeenCalledWith('shan','reception')
  expect(give).toHaveBeenCalledTimes(2)
  expect(open).not.toHaveBeenCalled()
  canvas.remove()
})

it('restores the pre-drag character when an asynchronous seat write fails',async()=>{
  const {bind,employee,view,canvas,pointer,actorRef}=fixture(false,'contact')
  const initial=actorRef.current.shan
  bind.mockResolvedValue(false)
  await act(async()=>{
    view.result.current.startActorDrag(pointer(20,30,'pointerdown'),employee)
    view.result.current.moveActorDrag(pointer(856,723,'pointermove'))
    view.result.current.finishActorDrag(pointer(856,723,'pointerup'))
  })
  expect(actorRef.current.shan).toEqual(initial)
  canvas.remove()
})

it('settles at the final pointerup coordinates when the browser coalesces the last move',()=>{
  const {employee,view,canvas,pointer,actorRef}=fixture(false,'contact')
  const start=actorRef.current.shan.position
  const stops=OFFICE_NAV_ACTION_POINTS.filter(p=>!isOfficeFootAnchorBlocked([p.x,p.y]) && !OFFICE_SEAT_BOXES.some(b=>p.x>=b.x && p.x<=b.x+b.width && p.y>=b.y && p.y<=b.y+b.height))
  const first=stops[0]!, last=stops.at(-1)!
  expect(first.id).not.toEqual(last.id)
  act(()=>{
    view.result.current.startActorDrag(pointer(start.x,start.y,'pointerdown'),employee)
    view.result.current.moveActorDrag(pointer(first.x,first.y,'pointermove'))
    view.result.current.finishActorDrag(pointer(last.x,last.y,'pointerup'))
  })
  expect(actorRef.current.shan.position).toEqual({x:last.x,y:last.y})
  canvas.remove()
})

function fixture(working = false, destination:'workbench'|'contact'='workbench',paperPlanePick?: (id:string, point:{x:number;y:number})=>void) {
  const canvas = document.createElement('div')
  document.body.append(canvas)
  Object.assign(canvas, { getBoundingClientRect: () => ({ left:0, top:0, right:1672, bottom:941, width: 1672, height: 941 }),
    hasPointerCapture: () => false, setPointerCapture() {} })
  const actor = initialRuntime('shan', 0, 0)
  const actorRef = { current: { shan: { ...actor, mode: working ? 'working' as const : 'idle' as const } } }
  const open = vi.fn(), bind = vi.fn(), pet = vi.fn()
  const view = renderHook(() => useOfficeSceneInteractions({ canvasRef: { current: canvas }, scrollerRef: { current: null },
    actorRef, setActors: vi.fn(), officeBindingsRef: { current: [] }, presentationActive: true,
    closeActionMenu: vi.fn(), employeeDestination: destination, onDesktopPet: pet, onCharacterClick: open, onBindWorkstation: bind,paperPlanePick }))
  function pointer(x: number, y: number, type: string) {
    return { pointerId: 4, button: 0, isPrimary: true, currentTarget: canvas, clientX: x, clientY: y, stopPropagation() {}, type } as unknown as PointerEvent<HTMLButtonElement>
  }
  return { open, bind, pet, actorRef, actor, view, canvas, pointer, employee: { id: 'shan', name: '端木嫣', activity: '',
    availability: working ? 'working' as const : 'available' as const, sceneActivity: working ? 'working' as const : 'idle' as const, canDrag: !working } }
}

it.each([false, true])('opens idle and working employees on a single release without repeating the native click (working=%s)', working => {
  const { open, bind, employee, pointer, view, canvas } = fixture(working)
  act(() => {
    view.result.current.startActorDrag(pointer(20, 30, 'pointerdown'), employee)
    view.result.current.finishActorDrag(pointer(20, 30, 'pointerup'))
    view.result.current.handleActorClick({ detail: 1 } as MouseEvent<HTMLButtonElement>, employee.id)
  })
  expect(open.mock.calls).toEqual([['shan']])
  act(() => view.result.current.handleActorClick({ detail: 0 } as MouseEvent<HTMLButtonElement>, employee.id))
  expect(open.mock.calls).toEqual([['shan'], ['shan']])
  expect(bind).not.toHaveBeenCalled()
  expect(officeEmployeeAction(employee.name, 'workbench', employee.canDrag)['aria-label']).toBe('打开端木嫣的工作台')
  canvas.remove()
})

it('keeps the long-press drop and suppresses navigation after a drop or a cancelled gesture', () => {
  vi.useFakeTimers()
  const { open, bind, employee, pointer, view, canvas, actor } = fixture()
  const box = OFFICE_SEAT_BOXES[0]!
  const x = box.x + box.width / 2 - actor.position.x, y = box.y + box.height / 2 - actor.position.y
  act(() => {
    view.result.current.startActorDrag(pointer(0, 0, 'pointerdown'), employee)
    vi.advanceTimersByTime(550)
    view.result.current.moveActorDrag(pointer(x, y, 'pointermove'))
    view.result.current.finishActorDrag(pointer(x, y, 'pointerup'))
    view.result.current.handleActorClick({ detail: 1 } as MouseEvent<HTMLButtonElement>, employee.id)
    view.result.current.startActorDrag(pointer(0, 0, 'pointerdown'), employee)
    view.result.current.finishActorDrag(pointer(0, 0, 'pointercancel'))
    view.result.current.handleActorClick({ detail: 1 } as MouseEvent<HTMLButtonElement>, employee.id)
  })
  expect(bind.mock.calls).toEqual([['shan', box.id]])
  expect(open).not.toHaveBeenCalled()
  canvas.remove()
})

it('picks up a working companion immediately, binds the desk under the pointer and detaches only on an outside release',()=>{
  const {open,bind,pet,view,canvas,pointer,employee}=fixture(true,'contact')
  const seat=OFFICE_SEAT_BOXES[0]!
  const x=seat.x+seat.width/2,y=seat.y+seat.height/2
  act(()=>{
    view.result.current.startActorDrag(pointer(200,300,'pointerdown'),employee)
    view.result.current.moveActorDrag(pointer(x,y,'pointermove'))
    view.result.current.finishActorDrag(pointer(x,y,'pointerup'))
    view.result.current.startActorDrag(pointer(200,300,'pointerdown'),employee)
    view.result.current.moveActorDrag(pointer(-120,100,'pointermove'))
    view.result.current.finishActorDrag(pointer(-120,100,'pointercancel'))
    view.result.current.startActorDrag(pointer(200,300,'pointerdown'),employee)
    view.result.current.moveActorDrag(pointer(-120,100,'pointermove'))
    view.result.current.finishActorDrag(pointer(-120,100,'pointerup'))
  })
  expect(bind.mock.calls).toEqual([['shan',seat.id]])
  expect(pet.mock.calls).toEqual([['shan',{screenX:-120,screenY:100}]])
  expect(open).not.toHaveBeenCalled()
  canvas.remove()
})

it('places another companion beside an occupied spot and never settles on a blocked lane',()=>{
  const valid=(p:readonly [number,number])=>p[0]>=0?[p[0],200] as const:undefined
  const point=uncrowdedFloorPoint([200,200],[[200,200],[245,200]],valid)!
  expect(point[1]).toBe(200)
  expect(Math.min(Math.abs(point[0]-200),Math.abs(point[0]-245))).toBeGreaterThanOrEqual(36)
  expect(uncrowdedFloorPoint([200,200],[[200,200]],()=>[200,200])).toBeUndefined()
})

it('releases a dragged employee at reception without a frame back in the private office', () => {
  const { actorRef, bind, employee, view, pointer } = fixture(false, 'contact')
  actorRef.current.shan = { ...actorRef.current.shan, position: {x:320,y:720}, targetWorkstationId:'private-lower' }
  act(() => {
    view.result.current.startActorDrag(pointer(260,610,'pointerdown'), employee)
    view.result.current.moveActorDrag(pointer(856,723,'pointermove'))
    view.result.current.finishActorDrag(pointer(856,723,'pointerup'))
  })
  expect(bind.mock.calls).toEqual([['shan','reception']])
  const [x,y] = OFFICE_WORKSTATION_APPROACHES.reception.point
  expect(actorRef.current.shan.position).toEqual({x,y})
})

it('settles just beyond a counter edge on reachable floor and rejects distant wall drops', () => {
  const foot = [700,711] as const
  expect(isOfficeFootAnchorBlocked(foot)).toBe(true)
  const p = findOfficeDropFloor(foot, [])!
  expect(isOfficeFootAnchorBlocked(p)).toBe(false)
  expect(Math.hypot(p[0] - foot[0], p[1] - foot[1])).toBeLessThanOrEqual(25)
  expect(findWorkstationRouteFromPoint(p, 'private-lower').distance).toBeGreaterThan(0)
  expect(findOfficeDropFloor([1500,130], [])).toBeUndefined()
  const adjacent = findOfficeDropFloor(p, [p])!
  expect(Math.hypot(adjacent[0] - p[0], adjacent[1] - p[1])).toBeGreaterThanOrEqual(36)
})

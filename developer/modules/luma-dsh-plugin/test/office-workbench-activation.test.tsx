import { act, cleanup, renderHook } from '@testing-library/react'
import type { MouseEvent, PointerEvent } from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { initialRuntime } from '../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/officeSceneActorRuntime.ts'
import { OFFICE_SEAT_BOXES } from '../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/officeSceneSeatTargets.ts'
import { useOfficeSceneInteractions } from '../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/useOfficeSceneInteractions.ts'
import { officeEmployeeAction } from '../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/office2d/actorPortraitActivation.ts'

afterEach(() => { cleanup(); vi.useRealTimers() })

function fixture(working = false) {
  const canvas = document.createElement('div')
  document.body.append(canvas)
  Object.assign(canvas, { getBoundingClientRect: () => ({ width: 1672, height: 941 }),
    hasPointerCapture: () => false, setPointerCapture() {} })
  const actor = initialRuntime('shan', 0, 0)
  const actorRef = { current: { shan: { ...actor, mode: working ? 'working' as const : 'idle' as const } } }
  const open = vi.fn(), bind = vi.fn()
  const view = renderHook(() => useOfficeSceneInteractions({ canvasRef: { current: canvas }, scrollerRef: { current: null },
    actorRef, setActors: vi.fn(), officeBindingsRef: { current: [] }, presentationActive: true,
    closeActionMenu: vi.fn(), employeeDestination: 'workbench', onCharacterClick: open, onBindWorkstation: bind }))
  function pointer(x: number, y: number, type: string) {
    return { pointerId: 4, button: 0, isPrimary: true, currentTarget: canvas, clientX: x, clientY: y, stopPropagation() {}, type } as unknown as PointerEvent<HTMLButtonElement>
  }
  return { open, bind, actor, view, canvas, pointer, employee: { id: 'shan', name: '端木嫣', activity: '',
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

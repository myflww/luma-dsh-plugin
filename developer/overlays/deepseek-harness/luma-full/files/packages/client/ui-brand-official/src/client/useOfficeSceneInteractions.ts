import type { Dispatch, MutableRefObject, KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent, SetStateAction } from 'react'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { advanceOfficeActorPortraitTap, type OfficeActorPortraitTap, type OfficeEmployeeDestination } from './office2d/actorPortraitActivation.ts'
import { OFFICE_NAV_HEIGHT, OFFICE_NAV_WIDTH } from './office2d/navigation.ts'
import type { OfficeWorkstationId } from './office2d/workstationSeating.ts'
import { seatTargetForPosition, type OfficeActorBinding } from './officeSceneSeatTargets.ts'
import type { ActorRuntime, OfficeSceneEmployee, Point } from './OfficeSceneSurface.types.ts'
interface PointerPanState {
  readonly pointerId: number
  readonly startX: number
  readonly scrollLeft: number
}

export const OFFICE_ACTOR_HOLD_MS = 500
export const OFFICE_ACTOR_HOLD_SLOP_PX = 8

interface ActorDragState {
  readonly pointerId: number
  readonly captureTarget: HTMLElement
  readonly employeeId: string
  readonly pressedAt: number
  readonly startClientX: number
  readonly startClientY: number
  readonly startPosition: Point
  readonly startRuntime: ActorRuntime
  readonly startWorkstationId?: OfficeWorkstationId | null
  moved: boolean
  dragging: boolean
  cancelled: boolean
  canDrag: boolean
}

/** The dragged actor and the seat its current position would bind, if any. */
interface SeatDragState {
  readonly employeeId: string
  readonly workstationId: OfficeWorkstationId | null
}


interface OfficeSceneInteractionOptions {
  readonly canvasRef: Readonly<{ current: HTMLDivElement | null }>
  readonly scrollerRef: Readonly<{ current: HTMLDivElement | null }>
  readonly actorRef: MutableRefObject<Readonly<Record<string, ActorRuntime>>>
  readonly setActors: Dispatch<SetStateAction<Readonly<Record<string, ActorRuntime>>>>
  readonly officeBindingsRef: Readonly<{ current: readonly OfficeActorBinding[] }>
  readonly presentationActive: boolean
  readonly closeActionMenu: () => void
  readonly onCharacterClick: ((employeeId: string) => void) | undefined
  readonly employeeDestination?: OfficeEmployeeDestination | undefined
  readonly onBindWorkstation: ((employeeId: string, workstationId: OfficeWorkstationId) => void | Promise<unknown>) | undefined
}
/** One owner for pointer capture, cancel/restore, keyboard activation and seat drops. */
export function useOfficeSceneInteractions({ canvasRef, scrollerRef, actorRef, setActors,
  officeBindingsRef, presentationActive, closeActionMenu, onCharacterClick, onBindWorkstation, employeeDestination,
}: OfficeSceneInteractionOptions) {
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const clearHold = () => { if (holdTimerRef.current !== null) clearTimeout(holdTimerRef.current); holdTimerRef.current = null }
  const panRef = useRef<PointerPanState | null>(null)
  const actorDragRef = useRef<ActorDragState | null>(null)
  const [seatDrag, setSeatDrag] = useState<SeatDragState | null>(null)
  const seatDragRef = useRef<SeatDragState | null>(null)
  const suppressedClickRef = useRef<string | null>(null)
  const pendingActorTapRef = useRef<OfficeActorPortraitTap | null>(null)
  const presentationActiveRef = useRef(presentationActive)
  presentationActiveRef.current = presentationActive
  const registerActorTap = useCallback((event: { clientX: number; clientY: number }, employeeId: string) => {
    if (!presentationActiveRef.current) return
    const activation = advanceOfficeActorPortraitTap(pendingActorTapRef.current, {
      employeeId, at: performance.now(), clientX: event.clientX, clientY: event.clientY,
    }, employeeDestination)
    pendingActorTapRef.current = activation.pendingTap
    if (activation.activate) onCharacterClick?.(employeeId)
  }, [onCharacterClick, employeeDestination])

  const handleActorClick = useCallback((event: ReactMouseEvent<HTMLButtonElement>, employeeId: string) => {
    if (!presentationActiveRef.current) return
    const suppressPointerClick = suppressedClickRef.current === employeeId && event.detail > 0
    suppressedClickRef.current = null
    if (event.detail === 0) {
      // Enter/Space and assistive activation retain the native button action.
      pendingActorTapRef.current = null
      onCharacterClick?.(employeeId)
    } else if (!suppressPointerClick) registerActorTap(event, employeeId)
  }, [onCharacterClick, registerActorTap])

  const startActorDrag = useCallback((event: ReactPointerEvent<HTMLElement>, employee: OfficeSceneEmployee) => {
    if (event.button !== 0 || event.isPrimary === false || !presentationActiveRef.current) return
    const actor = actorRef.current[employee.id]
    if (!actor || actorDragRef.current) return
    event.stopPropagation()
    clearHold()
    suppressedClickRef.current = null
    // A successful hold can replace the seated button; capture on its stable canvas.
    const captureTarget = canvasRef.current ?? event.currentTarget
    actorDragRef.current = {
      pointerId: event.pointerId,
      captureTarget,
      employeeId: employee.id,
      pressedAt: performance.now(),
      startClientX: event.clientX,
      startClientY: event.clientY,
      startPosition: actor.position,
      startRuntime: actor,
      startWorkstationId: actor.targetWorkstationId,
      moved: false, dragging: false, cancelled: false, canDrag: employee.canDrag && actor.mode !== 'working',
    }
    if (!actorDragRef.current.canDrag) return
    const pending = actorDragRef.current
    holdTimerRef.current = setTimeout(() => {
    holdTimerRef.current = null
    if (actorDragRef.current !== pending || pending.cancelled || !presentationActiveRef.current) return
    const liveActor = actorRef.current[employee.id]
    if (!liveActor || liveActor.mode === 'working' || liveActor.targetWorkstationId !== pending.startWorkstationId) { pending.cancelled = true; return }
    if (!captureTarget.isConnected) { pending.cancelled = true; return }
    try { captureTarget.setPointerCapture(pending.pointerId) }
    catch { pending.cancelled = true; return }
    pending.dragging = true
    pendingActorTapRef.current = null
    const next = { ...actorRef.current, [employee.id]: { ...liveActor, mode: 'drag' as const, route: null, trafficYield: null, waitStreak: 0 } }
    actorRef.current = next
    setActors(next)
    const seat: SeatDragState = { employeeId: employee.id, workstationId: null }
    seatDragRef.current = seat
    setSeatDrag(seat)
    }, OFFICE_ACTOR_HOLD_MS)
  }, [])

  const moveActorDrag = useCallback((event: Pick<ReactPointerEvent<HTMLElement>, 'pointerId' | 'clientX' | 'clientY' | 'stopPropagation'>) => {
    const drag = actorDragRef.current
    const canvas = canvasRef.current
    if (!drag || drag.pointerId !== event.pointerId || !canvas) return
    event.stopPropagation()
    if (!drag.dragging) {
      if (Math.hypot(event.clientX - drag.startClientX, event.clientY - drag.startClientY) > OFFICE_ACTOR_HOLD_SLOP_PX) {
        clearHold(); drag.cancelled = true; pendingActorTapRef.current = null
      }
      return
    }
    const rect = canvas.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return
    const dx = (event.clientX - drag.startClientX) / rect.width * OFFICE_NAV_WIDTH
    const dy = (event.clientY - drag.startClientY) / rect.height * OFFICE_NAV_HEIGHT
    drag.moved ||= Math.hypot(dx, dy) > 5
    const actor = actorRef.current[drag.employeeId]
    if (!actor) return
    const position = {
      x: Math.max(0, Math.min(OFFICE_NAV_WIDTH, drag.startPosition.x + dx)),
      y: Math.max(0, Math.min(OFFICE_NAV_HEIGHT, drag.startPosition.y + dy)),
    }
    const next = { ...actorRef.current, [drag.employeeId]: { ...actor, position, mode: 'drag' as const } }
    actorRef.current = next
    setActors(next)
    // Highlight the seat this position would bind. Only a changed answer re-renders.
    const workstationId = seatTargetForPosition(officeBindingsRef.current, drag.employeeId, position)
    if (seatDragRef.current !== null && seatDragRef.current.workstationId !== workstationId) {
      const seat: SeatDragState = { employeeId: drag.employeeId, workstationId }
      seatDragRef.current = seat
      setSeatDrag(seat)
    }
  }, [])

  const finishActorDrag = useCallback((event: Pick<ReactPointerEvent<HTMLElement>, 'pointerId' | 'clientX' | 'clientY' | 'stopPropagation' | 'type'>) => {
    const drag = actorDragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    event.stopPropagation()
    clearHold()
    actorDragRef.current = null
    seatDragRef.current = null
    setSeatDrag(null)
    const captureTarget = drag.captureTarget
    if (captureTarget.hasPointerCapture(event.pointerId)) captureTarget.releasePointerCapture(event.pointerId)
    const actor = actorRef.current[drag.employeeId]
    if (!actor) return
    const cancelled = event.type === 'pointercancel' || event.type === 'lostpointercapture' || drag.cancelled
    if (!drag.dragging) {
      suppressedClickRef.current = drag.employeeId
      if (!cancelled && performance.now() - drag.pressedAt < OFFICE_ACTOR_HOLD_MS) registerActorTap(event, drag.employeeId)
      else pendingActorTapRef.current = null
      return
    }
    if (actor.mode === 'working') return
    // Dropping inside a drawn border binds that seat. Seats another employee
    // holds are not borders this drag may take.
    const workstationId = !cancelled && drag.moved
      ? seatTargetForPosition(officeBindingsRef.current, drag.employeeId, actor.position)
      : null
    // Drag chooses a binding, not a navigation foot point inside furniture.
    // Resume from the known-safe pre-drag floor anchor and let A* approach it.
    const next = {
      ...actorRef.current,
      [drag.employeeId]: workstationId ? {
        ...actor,
        position: drag.startPosition,
        mode: 'idle' as const,
        targetWorkstationId: null,
        nextAmbientAt: Number.POSITIVE_INFINITY,
        trafficYield: null,
        waitStreak: 0,
      } : drag.startRuntime,
    }
    actorRef.current = next
    setActors(next)
    // A held seated button can be replaced by the floor actor. Suppress its
    // trailing native click after the drag finishes.
    suppressedClickRef.current = drag.employeeId
    pendingActorTapRef.current = null
    if (workstationId) void onBindWorkstation?.(drag.employeeId, workstationId)
  }, [onBindWorkstation, registerActorTap])

  const startPan = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (!presentationActiveRef.current || event.button !== 0 || (event.target instanceof Element && event.target.closest('button:not(.lumaOfficeEmployee)'))) return
    const scroller = scrollerRef.current
    if (!scroller) return
    event.currentTarget.setPointerCapture(event.pointerId)
    panRef.current = { pointerId: event.pointerId, startX: event.clientX, scrollLeft: scroller.scrollLeft }
    event.currentTarget.dataset.dragging = 'true'
  }, [])
  const movePan = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = panRef.current
    const scroller = scrollerRef.current
    if (!drag || !scroller || drag.pointerId !== event.pointerId) return
    scroller.scrollLeft = drag.scrollLeft - (event.clientX - drag.startX)
  }, [])
  const finishPan = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (panRef.current?.pointerId !== event.pointerId) return
    panRef.current = null
    delete event.currentTarget.dataset.dragging
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }, [])
  const onKeyDown = useCallback((event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!presentationActiveRef.current) return
    const scroller = scrollerRef.current
    if (!scroller) return
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault()
      scroller.scrollBy({ left: event.key === 'ArrowLeft' ? -120 : 120, behavior: 'smooth' })
    }
  }, [])

  useEffect(() => {
    if (presentationActive) return
    clearHold()
    closeActionMenu()
    // Losing the office surface is a cancelled pointer gesture, not a drop.
    // Restore the pre-drag floor/seat and never rebind from a hidden layer.
    const drag = actorDragRef.current
    actorDragRef.current = null
    seatDragRef.current = null
    setSeatDrag(null)
    if (drag) {
      if (drag.captureTarget.hasPointerCapture(drag.pointerId)) drag.captureTarget.releasePointerCapture(drag.pointerId)
      const actor = actorRef.current[drag.employeeId]
      if (drag.dragging && actor && actor.mode !== 'working') {
        const next = { ...actorRef.current, [drag.employeeId]: drag.startRuntime }
        actorRef.current = next
        setActors(next)
      }
    }
    const pan = panRef.current
    panRef.current = null
    const scroller = scrollerRef.current
    if (scroller) {
      delete scroller.dataset.dragging
      if (pan && scroller.hasPointerCapture(pan.pointerId)) scroller.releasePointerCapture(pan.pointerId)
    }
    suppressedClickRef.current = null
    pendingActorTapRef.current = null
  }, [presentationActive, closeActionMenu])

  // Prop callbacks can change while the user holds an employee. Only an actual
  // cancellation or unmount should release the canvas pointer capture.
  const finishCurrentDrag = useRef(finishActorDrag)
  useLayoutEffect(() => { finishCurrentDrag.current = finishActorDrag }, [finishActorDrag])

  useEffect(() => {
    const cancel = () => {
      clearHold(); pendingActorTapRef.current = null
      const drag = actorDragRef.current
      if (!drag) return
      drag.cancelled = true
      finishCurrentDrag.current({ pointerId: drag.pointerId, type: 'pointercancel', stopPropagation() {}, clientX: drag.startClientX, clientY: drag.startClientY })
    }
    // Pending holds do not own capture. Observe releases and movement outside
    // the surface so a released or moved press cannot start a delayed drag.
    const move = (event: PointerEvent) => {
      if (!actorDragRef.current?.dragging) moveActorDrag(event)
    }
    const release = (event: PointerEvent) => {
      const drag = actorDragRef.current
      if (drag && !drag.dragging && event.pointerId === drag.pointerId) cancel()
    }
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') cancel() }
    const visibility = () => { if (document.hidden) cancel() }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', release); window.addEventListener('pointercancel', release)
    window.addEventListener('blur', cancel); window.addEventListener('keydown', key); document.addEventListener('visibilitychange', visibility)
    return () => {
      cancel()
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', release); window.removeEventListener('pointercancel', release)
      window.removeEventListener('blur', cancel); window.removeEventListener('keydown', key); document.removeEventListener('visibilitychange', visibility)
    }
  }, [moveActorDrag])

  const clearPendingActorTap = useCallback(() => { pendingActorTapRef.current = null }, [])
  return { seatDrag, actorDragRef, clearPendingActorTap, handleActorClick, startActorDrag,
    moveActorDrag, finishActorDrag, startPan, movePan, finishPan, onKeyDown }
}

import { getOfficeAsset } from './office2d/assets.ts'
import { OfficeSkinSelectionNotices } from './OfficeSkinSelectionNotices.tsx'
import { normalizeOfficeSkinSelections } from './office2d/skinSelectionAvailability.ts'
import { officeActorFramePresentation } from './office2d/restPresentation.ts'
import { createOfficeFrameTimeline, officeAutomaticWalkCadence } from './office2d/frameTimeline.ts'
import { IconFolderClose16 } from '@deepseek-ai/dsh-client-ui-primitives'
import type {
  CSSProperties,
  MouseEvent as ReactMouseEvent
} from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { IndependentOfficeSceneSurface } from './IndependentOfficeSceneSurface.tsx'
import { OfficeActionMenu, type OfficeActionMenuTarget } from './OfficeActionMenu.tsx'
import { OfficeMonitorScreen } from './OfficeMonitorScreen.tsx'
import { OfficeLightingImages, useOfficeSceneLighting } from './OfficeSceneLighting.tsx'
import { SeatedActor, SpriteStripCanvas } from './OfficeSceneSprites.tsx'
import { officeEmployeeAction } from './office2d/actorPortraitActivation.ts'
import type { ActorRuntime, OfficeSceneEmployee, OfficeSceneReport, OfficeSceneSurfaceProps, Point } from './OfficeSceneSurface.types.ts'
import {
  createSceneEvent,
  type SceneCommand,
  type SceneEventType
} from './office-harness/SceneProtocol.ts'
import {
  advanceOfficeAutonomyController,
  createOfficeAutonomyState,
  getOfficeAutonomyActivity,
  type OfficeAutonomyState
} from './office2d/autonomyController.ts'
import { OFFICE_CHAIR_FOREGROUND_LAYERS } from './office2d/chairForegroundLayers.ts'
import {
  EMPLOYEE_IDS
} from './office2d/employeeCatalog.ts'
import { getEmployeeCatalogWithSkin, getEmployeeTypingProfileWithSkin } from './office2d/employeeSkins.ts'
import { resolveOfficeManualAction, type OfficeManualAction } from './office2d/manualActions.ts'
import {
  OFFICE_NAV_HEIGHT,
  OFFICE_NAV_WIDTH,
  OFFICE_WORKSTATION_APPROACHES
} from './office2d/navigation.ts'
import {
  OFFICE_LIGHTING_TRANSITION_MS
} from './office2d/sceneLighting.ts'
import { isIndependentOfficeTheme } from './office2d/sceneThemeAssets.ts'
import { OFFICE_SCREEN_SURFACES } from './office2d/screenSurfaces.ts'
import {
  createOfficeTimePolicy
} from './office2d/timePolicy.ts'
import { OFFICE_WORKSTATION_PROP_LAYERS } from './office2d/workstationProps.ts'
import {
  officeSeatOccupiedIds
} from './office2d/workstationSeatTargets.ts'
import type { OfficeWorkstationId } from './office2d/workstationSeating.ts'
import {
  getOfficeWorkstation,
  isOfficeWorkstationId
} from './office2d/workstations.ts'
import { advanceOfficeActorTrafficFrame, applyOfficeAutonomyDecision, canRenderOfficeActorOverlay, initialRuntime, prepareActorRuntime, resolvePresentOfficeEmployeeIds, resolveVisibleOfficeMonitorIds } from './officeSceneActorRuntime.ts'
import { cancelSceneFrame, requestSceneFrame } from './officeSceneFrame.ts'
import { OFFICE_SEAT_BOXES, type OfficeActorBinding } from './officeSceneSeatTargets.ts'
import { useOfficeAmbientViewportEligibility } from './useOfficeAmbientViewportEligibility.ts'
import { hitOfficeActorAtPoint } from './officeActorHitTest.ts'
import { useOfficeSceneInteractions } from './useOfficeSceneInteractions.ts'
import { OfficeSeatFeedback, useOfficeSeatFeedback } from './OfficeSeatFeedback.tsx'
export type { ActorMode, ActorRuntime, OfficeSceneEmployee, OfficeSceneReport, OfficeSceneSurfaceProps, Point } from './OfficeSceneSurface.types.ts'
export { advanceOfficeActorTrafficFrame, applyOfficeAutonomyDecision, canRenderOfficeActorOverlay, prepareActorRuntime, resolvePresentOfficeEmployeeIds, resolveVisibleOfficeMonitorIds } from './officeSceneActorRuntime.ts'
export type { OfficeActorTrafficFrameInput, OfficeActorTrafficFrameResult } from './officeSceneActorRuntime.ts'
export { compileOfficeEmployeeOcclusionPolygons, compileOfficeEmployeeVisibleClipPath, compileOfficeMonitorPolygon, getOfficeWalkFrameWorldWidth, getWorkstationTypingFrameAnchor } from './officeSceneGeometry.ts'
export { isOfficeAmbientActorInViewport } from './useOfficeAmbientViewportEligibility.ts'
const REPORT_ANCHORS: Readonly<Record<OfficeWorkstationId, Point>> = Object.freeze({
  'north-private': Object.freeze({ x: 786, y: 350 }),
  'north-center': Object.freeze({ x: 914, y: 357 }),
  'west-studio': Object.freeze({ x: 1037, y: 390 }),
  'south-left': Object.freeze({ x: 659, y: 552 }),
  'south-focus': Object.freeze({ x: 786, y: 556 }),
  'south-right': Object.freeze({ x: 916, y: 574 }),
  'private-upper': Object.freeze({ x: 155, y: 452 }),
  'private-lower': Object.freeze({ x: 220, y: 651 }),
  reception: Object.freeze({ x: 842, y: 735 }),
})

function initialOfficeEmployee(employee: OfficeSceneEmployee, index: number, now: number): ActorRuntime {
  const actor = initialRuntime(employee.id, index, now)
  if (!employee.ambientDesk || employee.availability === 'working' || !employee.workstationId || !isOfficeWorkstationId(employee.workstationId)) return actor
  const target = OFFICE_WORKSTATION_APPROACHES[employee.workstationId].point
  return { ...actor, mode: 'desk-break', targetWorkstationId: employee.workstationId, position: { x: target[0], y: target[1] } }
}

function ClassicOfficeSceneSurface({
  employees,
  reports,
  commands = [],
  onSceneEvent,
  onCharacterClick, paperPlanePick,
  employeeDestination,
  onReportClick,
  onBindWorkstation, onDesktopPet,
  timePolicy: timePolicyOverride,
  officeTheme,
  employeeSkins = {},
  unavailableAssetIds = [],
  renderActorOverlay,
  decorations,
  onAmbientEligibleChange,
  presentationActive = true,
  reduceMotion: reduceMotionRequested = false,
  seatReview,
}: OfficeSceneSurfaceProps) {
  const scrollerRef = useRef<HTMLDivElement | null>(null)
  const attachScroller = useCallback((element: HTMLDivElement | null) => {
    scrollerRef.current = element
    // Keep native inert behavior on both Harness React 18 and QA React 19.
    element?.toggleAttribute('inert', !presentationActive)
  }, [presentationActive])
  const canvasRef = useRef<HTMLDivElement | null>(null)
  const [actionTarget, setActionTarget] = useState<OfficeActionMenuTarget | null>(null)
  const [manualActions, setManualActions] = useState<Readonly<Record<string, OfficeManualAction>>>({})
  const manualActionsRef = useRef(manualActions)
  manualActionsRef.current = manualActions
  const manualRevision = useRef(0)
  const closeActionMenu = useCallback(() => setActionTarget(null), [])
  const restoreAutomatic = useCallback((employeeId: string) => {
    setManualActions(actions => { const next = { ...actions }; delete next[employeeId]; return next })
    setActionTarget(null)
  }, [])
  const openActionMenu = (event: ReactMouseEvent<HTMLElement>, employee: OfficeSceneEmployee) => {
    event.preventDefault()
    event.stopPropagation()
    clearPendingActorTap()
    if (!presentationActive || drawingPaused || seatReview) return
    setActionTarget({ employeeId: employee.id, name: employee.name, x: event.clientX, y: event.clientY })
  }
  const officeBindingsRef = useRef<readonly OfficeActorBinding[]>([])
  const employeeRef = useRef(employees)
  employeeRef.current = employees
  const employeeSkinsRef = useRef(employeeSkins)
  employeeSkinsRef.current = employeeSkins
  const commandByEmployeeRef = useRef(new Map<string, SceneCommand>(
    commands.map(command => [command.employeeId, command]),
  ))
  commandByEmployeeRef.current = new Map<string, SceneCommand>(
    commands.map(command => [command.employeeId, command]),
  )
  const onSceneEventRef = useRef(onSceneEvent)
  onSceneEventRef.current = onSceneEvent
  const emittedSceneEventsRef = useRef(new Set<string>())
  const [clockNow, setClockNow] = useState(() => Date.now())
  const timePolicy = useMemo(
    () => timePolicyOverride ?? createOfficeTimePolicy({ date: new Date(clockNow) }),
    [clockNow, timePolicyOverride],
  )
  const timePolicyRef = useRef(timePolicy)
  timePolicyRef.current = timePolicy
  const [presencePaused, setPresencePaused] = useState(
    () => typeof document !== 'undefined' && document.visibilityState === 'hidden',
  )
  const presencePausedRef = useRef(presencePaused)
  presencePausedRef.current = presencePaused
  const presentationActiveRef = useRef(presentationActive)
  presentationActiveRef.current = presentationActive
  const drawingPaused = presencePaused || !presentationActive
  const [actors, setActors] = useState<Readonly<Record<string, ActorRuntime>>>(() => Object.fromEntries(
    employees.map((employee, index) => [employee.id, initialOfficeEmployee(employee, index, performance.now())]),
  ))
  const actorRef = useRef(actors)
  actorRef.current = actors
  const autonomyStateRef = useRef<Readonly<Record<string, OfficeAutonomyState>>>({})
  const [systemReducedMotion, setSystemReducedMotion] = useState(() => typeof window !== 'undefined'
    && (window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false))
  const reducedMotion = reduceMotionRequested || systemReducedMotion
  const reducedMotionRequestedRef = useRef(reduceMotionRequested)
  reducedMotionRequestedRef.current = reduceMotionRequested
  const reducedMotionRef = useRef(reducedMotion)
  reducedMotionRef.current = reducedMotion
  const { lighting, lightingControllerRef } = useOfficeSceneLighting({ timePolicy, officeTheme, drawingPaused, reducedMotion })

  const emitSceneEvent = useCallback((type: SceneEventType, command: SceneCommand, reason?: string) => {
    const key = [type, command.commandId, command.taskId, command.employeeId, command.workstationId].join('\u0000')
    if (emittedSceneEventsRef.current.has(key)) return
    try {
      const event = createSceneEvent({
        type,
        commandId: command.commandId,
        taskId: command.taskId,
        employeeId: command.employeeId,
        workstationId: command.workstationId,
        ...(reason === undefined ? {} : { reason }),
      })
      emittedSceneEventsRef.current.add(key)
      onSceneEventRef.current?.(event)
    } catch {
      // Invalid identities never leave the scene boundary.
    }
  }, [])

  const reportStacks = useMemo(() => {
    const byWorkstation = new Map<OfficeWorkstationId, OfficeSceneReport[]>()
    reports.forEach(report => {
      if (!report.workstationId || !isOfficeWorkstationId(report.workstationId)) return
      const stack = byWorkstation.get(report.workstationId) ?? []
      stack.push(report)
      byWorkstation.set(report.workstationId, stack)
    })
    return [...byWorkstation.entries()].map(([workstationId, stack]) => ({
      workstationId,
      reports: stack,
      latest: stack[stack.length - 1]!,
    }))
  }, [reports])

  useEffect(() => {
    const media = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    const syncReducedMotion = () => {
      reducedMotionRef.current = reducedMotionRequestedRef.current || (media?.matches ?? false)
      setSystemReducedMotion(media?.matches ?? false)
    }
    syncReducedMotion()
    media?.addEventListener?.('change', syncReducedMotion)
    const centered = requestSceneFrame(() => {
      const scroller = scrollerRef.current
      if (scroller) scroller.scrollLeft = Math.max(0, (scroller.scrollWidth - scroller.clientWidth) / 2)
    })
    return () => {
      cancelSceneFrame(centered)
      media?.removeEventListener?.('change', syncReducedMotion)
    }
  }, [])

  useEffect(() => {
    if (timePolicyOverride) return undefined
    const interval = window.setInterval(() => { setClockNow(Date.now()) }, 30_000)
    return () => { window.clearInterval(interval) }
  }, [timePolicyOverride])

  useEffect(() => {
    const onVisibilityChange = () => {
      const hidden = document.visibilityState === 'hidden'
      if (hidden) lightingControllerRef.current?.setMotionAllowed(false)
      else {
        // Read the wall clock directly on restore. Do not animate through the
        // stale hour from the last React render, even if the host clock updates
        // its shared policy one render later.
        const phase = timePolicyOverride?.phase ?? createOfficeTimePolicy({ date: new Date() }).phase
        lightingControllerRef.current?.request(phase, { immediate: true })
      }
      presencePausedRef.current = hidden
      setPresencePaused(hidden)
      if (!hidden && !timePolicyOverride) setClockNow(Date.now())
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => { document.removeEventListener('visibilitychange', onVisibilityChange) }
  }, [timePolicyOverride])

  useEffect(() => {
    if (seatReview) return undefined
    commands.forEach(command => { emitSceneEvent('command-accepted', command) })
  }, [commands, emitSceneEvent, seatReview])

  useEffect(() => {
    if (seatReview) return undefined
    let frameId: number | null = null
    let last = performance.now()
    const tick = (now: number) => {
      const deltaMs = Math.min(50, Math.max(0, now - last))
      last = now
      // The scene cannot claim visual arrival while its page is hidden.
      if(presencePausedRef.current||!presentationActiveRef.current){frameId=requestSceneFrame(tick);return}
      const current = actorRef.current
      const currentEmployees = employeeRef.current
      const previousAutonomyStates = autonomyStateRef.current
      const seeded = { ...current }
      currentEmployees.forEach((employee, index) => {
        seeded[employee.id] ??= initialOfficeEmployee(employee, index, now)
      })
      const prepared: Record<string, ActorRuntime> = { ...seeded }
      const autonomyStates: Record<string, OfficeAutonomyState> = {}
      for (const employee of currentEmployees) {
        let actor = prepared[employee.id]
        if (!actor) continue
        if (actor.mode !== 'drag') {
          actor = prepareActorRuntime(
            actor,
            employee,
            now,
            commandByEmployeeRef.current.get(employee.id),
            emitSceneEvent,
          )
        }
        const boundWorkstationId = employee.workstationId && isOfficeWorkstationId(employee.workstationId)
          ? employee.workstationId
          : null
        const autonomyState = autonomyStateRef.current[employee.id]
          ?? createOfficeAutonomyState({
            employeeId: employee.id,
            now,
            initiallyAtDesk: employee.ambientDesk === true && actor.mode === 'desk-break',
            timePolicy: timePolicyRef.current,
            boundWorkstationId,
          })
        const targetWorkstationId = autonomyState.targetWorkstationId
        const approach = targetWorkstationId === null
          ? null
          : OFFICE_WORKSTATION_APPROACHES[targetWorkstationId].point
        const autonomy = advanceOfficeAutonomyController({
          state: autonomyState,
          now,
          actorMode: actor.mode === 'report' ? 'task' : actor.mode,
          actorPosition: actor.position,
          occupiedWorkstationId: actor.mode === 'desk-break' ? actor.targetWorkstationId : null,
          timePolicy: timePolicyRef.current,
          boundWorkstationId,
          workstationApproachPoint: approach ? { x: approach[0], y: approach[1] } : null,
          presencePaused: presencePausedRef.current || !presentationActiveRef.current
            || now < (actor.placedUntil ?? 0) || manualActionsRef.current[employee.id] !== undefined,
          reducedMotion: reducedMotionRef.current,
          ambientDesk: employee.ambientDesk === true,
          canStartRoam: true,
        })
        autonomyStates[employee.id] = autonomy.state
        prepared[employee.id] = applyOfficeAutonomyDecision(actor, autonomy.decision)
      }
      autonomyStateRef.current = Object.freeze(autonomyStates)
      const frame = advanceOfficeActorTrafficFrame({
        actors: prepared,
        now,
        deltaMs: reducedMotionRef.current ? 60_000 : deltaMs,
        commandsByEmployee: commandByEmployeeRef.current,
        employeeSkins: employeeSkinsRef.current,
        emitSceneEvent,
        presentEmployeeIds: new Set([...resolvePresentOfficeEmployeeIds({
          employees: currentEmployees, actors: prepared, timePolicy: timePolicyRef.current,
        })].filter(id => manualActionsRef.current[id] === undefined)),
      })
      actorRef.current = frame.actors
      // Motion returns a fresh container even when every actor is unchanged.
      // Keep all semantic clocks/commands above alive, but do not make three
      // resting sprites recompute their geometry on every display frame.
      const actorIds = Object.keys(frame.actors)
      const actorsChanged = actorIds.length !== Object.keys(current).length
        || actorIds.some(id => frame.actors[id] !== current[id])
      const activityChanged = !actorsChanged && actorIds.some(id => {
        const mode = frame.actors[id]!.mode
        return getOfficeAutonomyActivity(previousAutonomyStates[id], mode === 'report' ? 'task' : mode)
          !== getOfficeAutonomyActivity(autonomyStates[id], mode === 'report' ? 'task' : mode)
      })
      if (actorsChanged || activityChanged) setActors(frame.actors)
      frameId = requestSceneFrame(tick)
    }
    frameId = requestSceneFrame(tick)
    return () => { if (frameId !== null) cancelSceneFrame(frameId) }
  }, [emitSceneEvent, seatReview])

  const seatFeedback=useOfficeSeatFeedback(employees,onBindWorkstation,officeTheme,presentationActive)
  const { seatDrag, actorDragRef, clearPendingActorTap, handleActorClick, startActorDrag,
    moveActorDrag, finishActorDrag, startPan, movePan, finishPan, onKeyDown } = useOfficeSceneInteractions({
      canvasRef, scrollerRef, actorRef, setActors, officeBindingsRef, presentationActive,
      closeActionMenu, onCharacterClick, paperPlanePick, onBindWorkstation:seatFeedback.bind, onFloorDrop:seatFeedback.floor, onDesktopPet, employeeDestination,
    })

  const visibleMonitorIds = seatReview
    ? new Set([seatReview.workstationId])
    : resolveVisibleOfficeMonitorIds({ employees, actors, timePolicy })
  const presentEmployeeIds = resolvePresentOfficeEmployeeIds({ employees, actors, timePolicy })
  const visibleEmployees = seatReview ? [] : employees.filter(employee => presentEmployeeIds.has(employee.id))
  const integratedChairStationIds = new Set<OfficeWorkstationId>()
  if (seatReview) {
    const station = getOfficeWorkstation(seatReview.workstationId)
    if (station && getEmployeeTypingProfileWithSkin(seatReview.employeeId, station.typingFacing, employeeSkins[seatReview.employeeId])?.integratedChair) {
      integratedChairStationIds.add(seatReview.workstationId)
    }
  } else {
    for (const employee of visibleEmployees) {
      const actor = actors[employee.id]
      if (!actor || manualActions[employee.id] || (actor.mode !== 'working' && actor.mode !== 'desk-break')
        || actor.targetWorkstationId === null) continue
      const station = getOfficeWorkstation(actor.targetWorkstationId)
      if (station && getEmployeeTypingProfileWithSkin(employee.id, station.typingFacing, employeeSkins[employee.id])?.integratedChair) {
        integratedChairStationIds.add(actor.targetWorkstationId)
      }
    }
  }
  const luMiSeatedStationId = seatReview?.employeeId === EMPLOYEE_IDS.LU_MI
    ? seatReview.workstationId
    : (() => {
        const actor = actors[EMPLOYEE_IDS.LU_MI]
        return visibleEmployees.some(employee => employee.id === EMPLOYEE_IDS.LU_MI)
          && !manualActions[EMPLOYEE_IDS.LU_MI]
          && actor && (actor.mode === 'working' || actor.mode === 'desk-break')
          ? actor.targetWorkstationId : null
      })()
  const luMiChairForeground = luMiSeatedStationId === null
      || integratedChairStationIds.has(luMiSeatedStationId)
      || !['west-studio', 'south-left', 'south-right', 'private-upper', 'private-lower'].includes(luMiSeatedStationId)
    ? null
    : OFFICE_WORKSTATION_PROP_LAYERS.find(layer =>
        layer.workstationId === luMiSeatedStationId && layer.kind === 'chair') ?? null
  /**
   * Effective seat per present actor: an in-flight binding wins over the stored
   * one, matching how seated actors and monitor glow already resolve it. Read
   * through a ref because pointer handlers must not depend on render identity.
   */
  const officeBindings: readonly OfficeActorBinding[] = employees
    .filter(employee => presentEmployeeIds.has(employee.id))
    .map(employee => ({ employeeId: employee.id,
      workstationId: actors[employee.id]?.targetWorkstationId ?? employee.workstationId ?? null }))
  officeBindingsRef.current = officeBindings
  const occupiedSeatIds = seatDrag === null || employeeDestination === 'contact'
    ? null
    : officeSeatOccupiedIds(officeBindings, seatDrag.employeeId)
  const ambientCandidateKey = JSON.stringify(drawingPaused || lighting.current === null ? [] : visibleEmployees.filter(employee => {
    const actor = actors[employee.id]
    return actor && !manualActions[employee.id] && canRenderOfficeActorOverlay(employee, actor)
  }).map(employee => {
    const actor = actors[employee.id]!
    return [employee.id, actor.mode, actor.targetWorkstationId, actor.position.x, actor.position.y]
  }).sort((left, right) => String(left[0]).localeCompare(String(right[0]))))
  useOfficeAmbientViewportEligibility(scrollerRef, ambientCandidateKey, onAmbientEligibleChange)

  return (
    <div
      ref={attachScroller}
      className="lumaOfficeSceneScroller"
      role="region"
      aria-label="可左右拖动的虚拟办公室场景"
      tabIndex={presentationActive ? 0 : -1}
      aria-hidden={!presentationActive || undefined}
      onKeyDown={onKeyDown}
      onPointerDownCapture={event => {
        if (event.target instanceof Element && event.target.closest('button:not(.lumaOfficeEmployee)')) return
        const canvas = canvasRef.current
        const button = canvas && hitOfficeActorAtPoint(canvas, event.clientX, event.clientY)
        const employee = employees.find(item => item.id === button?.dataset.employeeId)
        if (!employee) return
        startActorDrag(event, { ...employee, canDrag: employeeDestination === 'contact' || employee.canDrag && !manualActions[employee.id] })
      }}
      onClickCapture={event => {
        if (event.detail > 0 && event.target instanceof Element && event.target.closest('.lumaOfficeEmployee')) {
          event.stopPropagation()
          event.preventDefault()
        }
      }}
      onContextMenuCapture={event => {
        const canvas = canvasRef.current
        const button = canvas && hitOfficeActorAtPoint(canvas, event.clientX, event.clientY)
        const employee = employees.find(item => item.id === button?.dataset.employeeId)
        if (employee) openActionMenu(event, employee)
        else if (event.target instanceof Element && event.target.closest('.lumaOfficeEmployee')) { event.preventDefault(); event.stopPropagation() }
      }}
      onLostPointerCapture={finishActorDrag}
      onPointerDown={startPan}
      onPointerMove={event => { if (actorDragRef.current) moveActorDrag(event); else movePan(event) }}
      onPointerUp={event => { if (actorDragRef.current) finishActorDrag(event); else finishPan(event) }}
      onPointerCancel={event => { if (actorDragRef.current) finishActorDrag(event); else finishPan(event) }}
      data-office-characters-present={String(visibleEmployees.length > 0)}
      data-office-scheduled-characters-present={String(timePolicy.charactersPresent)}
      data-office-autonomy-paused={String(drawingPaused)}
      data-office-presentation-active={String(presentationActive)}
      data-office-monitor-mode={timePolicy.monitors.mode}
      data-visible-monitor-count={visibleMonitorIds.size}
      data-integrated-chair-count={integratedChairStationIds.size}
    >
      <div className="lumaOfficeSceneWorld">
        <div ref={canvasRef} className="lumaOfficeSceneCanvas" data-time-phase={lighting.current?.phase ?? timePolicy.phase}
          data-lighting-status={lighting.status} data-lighting-transition={String(lighting.previous !== null)}
          data-lighting-ready={String(lighting.current !== null)}
          data-lighting-motion={String(!drawingPaused && !reducedMotion)}
          style={{ '--luma-office-lighting-duration': `${OFFICE_LIGHTING_TRANSITION_MS}ms` } as CSSProperties}>
          <div className="lumaOfficeSceneArtwork" role="img" aria-label="开放式虚拟办公室，包含九个可用工位、会议室、休息区和吧台">
            <OfficeLightingImages lighting={lighting} plane="worldUrl" />
          </div>
          {OFFICE_WORKSTATION_PROP_LAYERS.filter(layer =>
            layer.kind !== 'chair' || !integratedChairStationIds.has(layer.workstationId)
          ).map(layer => (
            <div key={`workstation-prop:${layer.workstationId}:${layer.kind}`} className="lumaOfficeWorkstationProp"
              aria-hidden="true" data-prop-kind={layer.kind}
              data-prop-workstation-id={layer.workstationId}
              style={{ clipPath: layer.clipPath } satisfies CSSProperties}>
              <OfficeLightingImages lighting={lighting} plane="propsUrl" />
            </div>
          ))}
          {decorations}
          {lighting.status === 'error' && <div className="lumaOfficeLightingUnavailable" role="status">
            <span>{lighting.current ? '场景暂时未能更新，已保留上一次完整画面。' : '办公室画面暂时未能加载。'}</span>
            <button type="button" onPointerDown={event => event.stopPropagation()}
              onClick={() => { lightingControllerRef.current?.request(timePolicyRef.current.phase, {
                immediate: presencePausedRef.current || !presentationActiveRef.current || reducedMotionRef.current,
                ...(officeTheme === undefined ? {} : { theme: officeTheme }),
              }) }}>重新加载</button>
          </div>}
          <svg className="lumaOfficeMonitorLayer" viewBox={`0 0 ${OFFICE_NAV_WIDTH} ${OFFICE_NAV_HEIGHT}`} aria-hidden="true">
            {OFFICE_SCREEN_SURFACES.filter(surface => surface.renderGlow && visibleMonitorIds.has(surface.workstationId)).map(surface => (
              <OfficeMonitorScreen key={surface.workstationId} surface={surface}
                activeTask={seatReview ? seatReview.mode === 'working' : employees.some(employee =>
                  employee.availability === 'working'
                  && (actors[employee.id]?.targetWorkstationId ?? employee.workstationId) === surface.workstationId
                )} />
            ))}
          </svg>
          {/* Drag targets use the same bounds for painting and for the seat exchange. */}
          {seatDrag !== null && (
            <svg className="lumaOfficeSeatLayer" viewBox={`0 0 ${OFFICE_NAV_WIDTH} ${OFFICE_NAV_HEIGHT}`}
              data-seat-drag-employee={seatDrag.employeeId} aria-hidden="true">
              {OFFICE_SEAT_BOXES.map(box => (
                <rect key={box.id} className="lumaOfficeSeatBox" data-seat-workstation-id={box.id}
                  data-seat-state={occupiedSeatIds?.has(box.id) ? 'occupied'
                    : seatDrag.workstationId === box.id ? 'candidate' : 'available'}
                  x={box.x} y={box.y} width={box.width} height={box.height} rx="14" ry="14" />
              ))}
            </svg>
          )}
          {seatReview && employees.filter(employee => employee.id === seatReview.employeeId).map(employee => (
            <SeatedActor key={`review:${employee.id}:${seatReview.workstationId}`} employee={employee}
              workstationId={seatReview.workstationId} review={seatReview} skinId={employeeSkins[employee.id]}
              paused={drawingPaused || reducedMotion} onClick={() => {}} />
          ))}
          {reportStacks.map(stack => {
            const anchor = REPORT_ANCHORS[stack.workstationId]
            return (
              <button
                key={stack.workstationId}
                type="button"
                className="lumaOfficeReportStack"
                style={{ left: `${anchor.x / OFFICE_NAV_WIDTH * 100}%`, top: `${anchor.y / OFFICE_NAV_HEIGHT * 100}%`, zIndex: Math.round(anchor.y) } satisfies CSSProperties}
                onClick={() => { if (presentationActiveRef.current) onReportClick?.(stack.latest.reportId) }}
                aria-label={`打开报告：${stack.latest.title}${stack.reports.length > 1 ? `，共 ${stack.reports.length} 份` : ''}`}
              >
                <IconFolderClose16 size={20} />
                {stack.reports.length > 1 && <span aria-hidden="true">{stack.reports.length}</span>}
              </button>
            )
          })}
          {visibleEmployees.map(employee => {
            const actor = actors[employee.id]
            const skinId = employeeSkins[employee.id]
            const manual = resolveOfficeManualAction(employee.id, manualActions[employee.id], skinId)
            if (!actor || (!manual && (actor.mode === 'working' || actor.mode === 'desk-break') && actor.targetWorkstationId !== null)) return null
            const catalog = getEmployeeCatalogWithSkin(employee.id, skinId)
            if (!catalog) return null
            const direction = manual?.direction ?? actor.direction
            const moving = manual ? manual.mode !== 'hold' && manual.id !== 'stand-front'
              : actor.mode === 'ambient' || actor.mode === 'task' || actor.mode === 'report'
            const automaticMode = actor.mode === 'ambient' || actor.mode === 'task' || actor.mode === 'report' ? actor.mode : undefined
            const automaticStrip = automaticMode ? getOfficeAsset(catalog.walk[direction]).frameStrip : undefined
            const automaticCadence = automaticMode && automaticStrip ? officeAutomaticWalkCadence(automaticMode, automaticStrip) : undefined
            const automaticTimeline = automaticStrip ? createOfficeFrameTimeline(automaticStrip) : undefined
            const automaticFrame = !manual && moving && !drawingPaused && !reducedMotion && automaticTimeline
              ? automaticTimeline.frameAt((actor.walkPhase ?? 0) * automaticTimeline.cycleMs, true) : undefined
            const restCandidate = catalog.walkRest?.[direction]
            const walkRest = moving || manual || (restCandidate && unavailableAssetIds.includes(restCandidate.asset)) ? undefined : restCandidate
            const framePresentation = officeActorFramePresentation(employee.id, actor.position.y, direction, skinId, walkRest)
            const autonomyActivity = getOfficeAutonomyActivity(
              autonomyStateRef.current[employee.id],
              actor.mode === 'report' ? 'task' : actor.mode,
            )
            return (
              <button
                key={employee.id}
                type="button"
                className="lumaOfficeEmployee"
                data-employee-id={employee.id}
                data-skin-id={skinId}
                data-travel-status={actor.mode}
                data-travel-direction={actor.direction}
                data-manual-action={manual?.id}
                data-scene-activity={autonomyActivity}
                {...actor.activeCommandId === null ? {} : { 'data-scene-command-id': actor.activeCommandId }}
                {...officeEmployeeAction(employee.name, employeeDestination, employee.canDrag && !manual, !!paperPlanePick)}
                style={{
                  left: `${actor.position.x / OFFICE_NAV_WIDTH * 100}%`,
                  top: `${actor.position.y / OFFICE_NAV_HEIGHT * 100}%`,
                  width: `${framePresentation.width / OFFICE_NAV_WIDTH * 100}%`,
                  ...(framePresentation.anchor
                    ? { transform: `translate(${-framePresentation.anchor.x * 100}%, ${-framePresentation.anchor.y * 100}%)` }
                    : {}),
                  zIndex: Math.round(actor.position.y),
                } satisfies CSSProperties}
                onClick={event => { handleActorClick(event, employee.id) }}
                onContextMenu={event => openActionMenu(event, employee)}
                onPointerMove={moveActorDrag}
                onPointerUp={finishActorDrag}
                onPointerCancel={finishActorDrag}
              >
                <span
                  className="lumaOfficeEmployeeSprite"
                  style={walkRest?.scale || walkRest?.liftPercent
                    ? { transform: `translateY(-${walkRest.liftPercent ?? 0}%) scale(${walkRest.scale ?? 1})` }
                    : undefined}
                >
                  <SpriteStripCanvas
                    key={`${skinId ?? 'default'}:${manual ? `manual:${manual.revision}` : 'automatic'}`}
                    assetId={manual?.asset ?? walkRest?.asset ?? catalog.walk[direction]}
                    className="lumaOfficeEmployeeWalkCanvas"
                    {...manual?.mode === 'hold' || manual?.id === 'stand-front' ? { fixedFrameIndex: manual.holdFrame }
                      : automaticFrame !== undefined ? { fixedFrameIndex: automaticFrame }
                      : walkRest === undefined ? {} : { fixedFrameIndex: walkRest.frameIndex }}
                    {...manual ? { loopOverride: manual.mode === 'loop' } : {}}
                    {...automaticFrame !== undefined && automaticTimeline ? { walkElapsedMs: (actor.walkPhase ?? 0) * automaticTimeline.cycleMs } : {}}
                    playbackRate={manual ? 1 : automaticCadence?.playbackRate ?? 1}
                    paused={!moving || drawingPaused || reducedMotion}
                  />
                </span>
              </button>
            )
          })}
          {visibleEmployees.map(employee => {
            const actor = actors[employee.id]
            if (!actor || manualActions[employee.id] || (actor.mode !== 'working' && actor.mode !== 'desk-break')
              || actor.targetWorkstationId === null) return null
            // One React slot/key keeps the decoded whole seated frame alive
            // across work ↔ ready. Incoming terminal props must not unmount it
            // before the scene has acknowledged that command on its next tick.
            const executing = actor.mode === 'working' ? actor.activeTaskCommand : undefined
            return <SeatedActor
              key={`seated:${employee.id}:${actor.targetWorkstationId}`}
              employee={employee}
              employeeDestination={employeeDestination}
              paperPlane={!!paperPlanePick}
              skinId={employeeSkins[employee.id]}
              workstationId={actor.targetWorkstationId}
              {...executing ? { command: executing } : {}}
              onClick={event => { handleActorClick(event, employee.id) }}
              onContextMenu={event => openActionMenu(event, employee)}
              {...actor.mode === 'desk-break' ? {
                onPointerMove: moveActorDrag,
                onPointerUp: finishActorDrag,
                onPointerCancel: finishActorDrag,
              } : {}}
              paused={drawingPaused || reducedMotion}
            />
          })}
          {luMiChairForeground && <div
            className="lumaOfficeChairForeground"
            aria-hidden="true"
            data-chair-workstation-id={luMiChairForeground.workstationId}
            data-chair-layer="lu-mi-near-shell"
            style={{
              clipPath: luMiChairForeground.clipPath,
              zIndex: Math.max(1, Math.round(
                (getOfficeWorkstation(luMiChairForeground.workstationId)?.y ?? 0) * OFFICE_NAV_HEIGHT,
              )),
            } satisfies CSSProperties}
          ><OfficeLightingImages lighting={lighting} plane="foregroundUrl" /></div>}
          {OFFICE_CHAIR_FOREGROUND_LAYERS.filter(layer =>
            !integratedChairStationIds.has(layer.workstationId)
          ).map(layer => (
            <div
              key={`chair-foreground:${layer.workstationId}`}
              className="lumaOfficeChairForeground"
              aria-hidden="true"
              data-chair-workstation-id={layer.workstationId}
              data-chair-foot-depth={layer.footDepth}
              style={{ clipPath: layer.clipPath, zIndex: layer.zIndex } satisfies CSSProperties}
            ><OfficeLightingImages lighting={lighting} plane="foregroundUrl" /></div>
          ))}
          {presentationActive && renderActorOverlay && visibleEmployees.map(employee => {
            const actor = actors[employee.id]
            if (!actor || manualActions[employee.id] || !canRenderOfficeActorOverlay(employee, actor)) return null
            const station = actor.mode === 'desk-break' && actor.targetWorkstationId
              ? getOfficeWorkstation(actor.targetWorkstationId) : null
            const anchor = station?.seatPoint
              ? { x: station.seatPoint[0], y: station.seatPoint[1] }
              : station ? {
                  x: (station.rect.x + station.rect.width * station.employee.x) * OFFICE_NAV_WIDTH,
                  y: (station.rect.y + station.rect.height * station.employee.y) * OFFICE_NAV_HEIGHT,
                } : actor.position
            return <div key={`overlay:${employee.id}`} className="lumaOfficeActorOverlay" data-employee-id={employee.id}
              style={{ left: `${anchor.x / OFFICE_NAV_WIDTH * 100}%`, top: `${anchor.y / OFFICE_NAV_HEIGHT * 100}%`, zIndex: OFFICE_NAV_HEIGHT + 10 } satisfies CSSProperties}>
              {renderActorOverlay(employee.id)}
            </div>
          })}
          {visibleEmployees.filter(employee => manualActions[employee.id]).map(employee => {
            const actor = actors[employee.id]
            return actor && <button key={`manual-restore:${employee.id}`} type="button" className="lumaOfficeManualRestore"
              style={{ left: `${actor.position.x / OFFICE_NAV_WIDTH * 100}%`, top: `${actor.position.y / OFFICE_NAV_HEIGHT * 100}%`, zIndex: OFFICE_NAV_HEIGHT + 12 }}
              onPointerDown={event => event.stopPropagation()} onClick={() => restoreAutomatic(employee.id)}>恢复自动行为</button>
          })}
        </div>
      </div>
      {employeeDestination==='contact' && <OfficeSeatFeedback roster={employees} preview={seatDrag} receipt={seatFeedback.receipt}/>}
      {actionTarget && <OfficeActionMenu target={actionTarget} skinId={employeeSkins[actionTarget.employeeId]} onClose={closeActionMenu}
        contact={employeeDestination==='contact'?{activity:employees.find(e=>e.id===actionTarget.employeeId)?.activity,open:()=>onCharacterClick?.(actionTarget.employeeId)}:undefined}
        onRestore={() => restoreAutomatic(actionTarget.employeeId)} onAction={(id, mode) => {
          setManualActions(actions => ({ ...actions, [actionTarget.employeeId]: { id, mode, revision: ++manualRevision.current } }))
          setActionTarget(null)
        }} />}
    </div>
  )
}

export function OfficeSceneSurface(props: OfficeSceneSurfaceProps) {
  const skins = normalizeOfficeSkinSelections(props.employeeSkins)
  const selected = skins === props.employeeSkins || skins === undefined ? props : { ...props, employeeSkins: skins }
  return isIndependentOfficeTheme(props.officeTheme) ? <IndependentOfficeSceneSurface {...selected} /> : <>
    <ClassicOfficeSceneSurface {...selected} />
    <OfficeSkinSelectionNotices active={props.presentationActive !== false} employees={props.employees} employeeSkins={skins} />
  </>
}

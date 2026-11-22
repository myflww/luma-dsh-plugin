import {
  type SceneCommand,
  type SceneEventType
} from './office-harness/SceneProtocol.ts'
import { resolveOfficeActorStallRecovery } from './office2d/actorAvoidance.ts'
import {
  getOfficeAsset
} from './office2d/assets.ts'
import {
  type OfficeAutonomyActorMode,
  type OfficeAutonomyDecision
} from './office2d/autonomyController.ts'
import {
  type OfficeWalkDirection
} from './office2d/employeeCatalog.ts'
import { getEmployeeCatalogWithSkin } from './office2d/employeeSkins.ts'
import { officeAutomaticWalkCadence, OFFICE_WALK_SPEED, workstationArrivalStep } from './office2d/frameTimeline.ts'
import {
  findOfficeRouteFromPoint,
  findWorkstationRouteFromPoint,
  isOfficeFootSegmentWalkable,
  type OfficeRoute
} from './office2d/navigation.ts'
import {
  type OfficeTimePolicy
} from './office2d/timePolicy.ts'
import { EMPTY_OFFICE_TRAFFIC_STATE, type OfficeTrafficState } from './office2d/trafficPolicy.ts'
import {
  isOfficeWorkstationId
} from './office2d/workstations.ts'
import type { OfficeWorkstationId } from './office2d/workstationSeating.ts'
import type { ActorMode, ActorRuntime, OfficeSceneEmployee, Point } from './OfficeSceneSurface.types.ts'
const INITIAL_POSITIONS: readonly Point[] = Object.freeze([
  Object.freeze({ x: 850, y: 665 }),
  Object.freeze({ x: 560, y: 665 }),
  Object.freeze({ x: 1170, y: 610 }),
  Object.freeze({ x: 460, y: 520 }),
  Object.freeze({ x: 840, y: 205 }),
  Object.freeze({ x: 1030, y: 220 }),
  Object.freeze({ x: 385, y: 884 }),
  Object.freeze({ x: 625, y: 445 }),
])

// waitStreak remains a legacy 60 Hz tick counter, not a display-refresh count.
// Otherwise a 120 Hz monitor cancels a route twice as quickly as a 60 Hz one.
const navigationWaitTicks = (deltaMs: number): number => Math.min(50, Math.max(0, deltaMs)) * 60 / 1000

function directionForDelta(dx: number, dy: number, fallback: OfficeWalkDirection): OfficeWalkDirection {
  if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001) return fallback
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 'right' : 'left'
  return dy >= 0 ? 'down' : 'up'
}

export function initialRuntime(employeeId: string, index: number, _now: number): ActorRuntime {
  const position = INITIAL_POSITIONS[index % INITIAL_POSITIONS.length] ?? INITIAL_POSITIONS[0]!
  return {
    employeeId,
    position,
    direction: 'down',
    mode: 'idle',
    route: null,
    waypointIndex: 0,
    targetWorkstationId: null,
    // Kept for backwards-compatible scene telemetry. The independent autonomy
    // controller below is the sole owner of idle deadlines.
    nextAmbientAt: Number.POSITIVE_INFINITY,
    roamOrdinal: 0,
    waitStreak: 0,
    activeCommandId: null,
    activeTaskCommand: null,
  }
}

function beginRoute(
  actor: ActorRuntime,
  route: OfficeRoute,
  mode: 'ambient' | 'task' | 'report',
  targetWorkstationId: OfficeWorkstationId | null,
): ActorRuntime {
  return {
    ...actor,
    mode,
    route: officeLaneRoute(route),
    waypointIndex: 0,
    targetWorkstationId,
    waitStreak: 0,
    trafficYield: null,
  }
}

/** Right-hand half-lanes stay inside the measured floor; narrow segments retain their safe centerline. */
export function officeLaneRoute(route:OfficeRoute):OfficeRoute {
  if(route.points.length<2)return route
  const points:Array<readonly[number,number]>=[route.points[0]!]
  for(let index=1;index<route.points.length;index++){
    const a=route.points[index-1]!,b=route.points[index]!,dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy)
    if(length>50){
      const lead=Math.min(30,length*.3),offset=8
      const p=[a[0]+dx/length*lead-dy/length*offset,a[1]+dy/length*lead+dx/length*offset] as const
      const q=[b[0]-dx/length*lead-dy/length*offset,b[1]-dy/length*lead+dx/length*offset] as const
      if(isOfficeFootSegmentWalkable(a,p)&&isOfficeFootSegmentWalkable(p,q)&&isOfficeFootSegmentWalkable(q,b))points.push(p,q)
    }
    points.push(b)
  }
  return {...route,points,distance:points.slice(1).reduce((sum,p,i)=>sum+Math.hypot(p[0]-points[i]![0],p[1]-points[i]![1]),0)}
}

function officeJunctionYield(actor:ActorRuntime,peers:Readonly<Record<string,ActorRuntime>>):boolean {
  const target=actor.route?.points[actor.waypointIndex];if(!target)return false
  const distance=Math.hypot(target[0]-actor.position.x,target[1]-actor.position.y)
  for(const peer of Object.values(peers)){
    if(peer.employeeId===actor.employeeId||!['task','ambient','report'].includes(peer.mode))continue
    const other=peer.route?.points[peer.waypointIndex];if(!other||Math.hypot(target[0]-other[0],target[1]-other[1])>1)continue
    const remaining=Math.hypot(other[0]-peer.position.x,other[1]-peer.position.y)
    const separation=Math.hypot(actor.position.x-peer.position.x,actor.position.y-peer.position.y)
    if((distance<55&&remaining<55||separation<24)&&(remaining<distance-.1||Math.abs(remaining-distance)<=.1&&peer.employeeId<actor.employeeId))return true
  }
  return false
}

function candidateAlongRoute(actor: ActorRuntime, deltaMs: number, speedForDirection: (direction: OfficeWalkDirection) => number): {
  readonly position: Point
  readonly direction: OfficeWalkDirection
  readonly waypointIndex: number
  readonly arrived: boolean
  readonly walkPhase: number
} {
  const route = actor.route
  if (!route || route.points.length === 0) {
    return { position: actor.position, direction: actor.direction, waypointIndex: 0, arrived: true, walkPhase: actor.walkPhase ?? 0 }
  }
  let position = actor.position
  let waypointIndex = actor.waypointIndex
  let remainingMs = deltaMs
  let direction = actor.direction
  let walkPhase = actor.walkPhase ?? 0
  while (remainingMs > 0.001 && waypointIndex < route.points.length) {
    const tuple = route.points[waypointIndex]
    if (!tuple) break
    const target = { x: tuple[0], y: tuple[1] }
    const dx = target.x - position.x
    const dy = target.y - position.y
    const distance = Math.hypot(dx, dy)
    if (distance <= 0.01) {
      waypointIndex += 1
      continue
    }
    direction = directionForDelta(dx, dy, direction)
    const speed = speedForDirection(direction)
    if (!Number.isFinite(speed) || speed <= 0) break
    const cruiseMs=distance/speed*1000
    const toSeat=actor.targetWorkstationId && waypointIndex===route.points.length-1
    const time=toSeat ? workstationArrivalStep(cruiseMs,remainingMs) : {travelMs:Math.min(cruiseMs,remainingMs),usedMs:Math.min(cruiseMs,remainingMs)}
    const amount = Math.min(distance, speed * time.travelMs / 1000)
    const reached = amount >= distance - 0.01
    const next = reached ? target : { x: position.x + dx / distance * amount, y: position.y + dy / distance * amount }
    if (!isOfficeFootSegmentWalkable(position, next)) break
    const acceptedDistance = Math.hypot(next.x - position.x, next.y - position.y)
    position = next
    // Cadence retains OFFICE_WALK_SPEED pixels per authored cycle at every
    // mode/direction. Sum successful segments, including turns in one tick.
    walkPhase = (walkPhase + acceptedDistance / OFFICE_WALK_SPEED) % 1
    remainingMs -= time.usedMs
    if (reached) waypointIndex += 1
  }
  return { position, direction, waypointIndex, arrived: waypointIndex >= route.points.length, walkPhase }
}

type SceneEventEmitter = (type: SceneEventType, command: SceneCommand, reason?: string) => void

export function prepareActorRuntime(
  current: ActorRuntime,
  employee: OfficeSceneEmployee,
  _now: number,
  command: SceneCommand | undefined,
  emitSceneEvent: SceneEventEmitter,
): ActorRuntime {
  const workstationId = command?.type === 'start-task' ? command.workstationId : null
  let actor = current

  if (command?.type === 'start-task' && workstationId) {
    if (actor.activeCommandId !== command.commandId
      || actor.targetWorkstationId !== workstationId) {
      if (actor.targetWorkstationId===workstationId && (actor.mode==='desk-break' || actor.mode==='working')) {
        emitSceneEvent('workstation-arrived',command)
        emitSceneEvent('work-animation-ready',command)
        return {...actor,mode:'working',activeCommandId:command.commandId,activeTaskCommand:command,activeReportCommand:null}
      }
      try {
        actor = {
          ...beginRoute(actor, findWorkstationRouteFromPoint(actor.position, workstationId), 'task', workstationId),
          activeCommandId: command.commandId,
          activeTaskCommand: command,
          activeReportCommand: null,
        }
      } catch {
        emitSceneEvent('navigation-failed', command, 'workstation-route-unavailable')
        return {
          ...actor,
          mode: 'idle',
          route: null,
          targetWorkstationId: workstationId,
          activeCommandId: command.commandId,
          activeTaskCommand: command,
          trafficYield: null,
          waitStreak: 0,
        }
      }
    }
  } else if (!command && employee.sceneActivity === 'working' && employee.workstationId && isOfficeWorkstationId(employee.workstationId)) {
    const seat = employee.workstationId
    // A DSH session snapshot can show active work without owning a scene command.
    // It gets a visual route and pose, while protocol events require a command identity.
    if (actor.targetWorkstationId === seat && (actor.mode === 'task' || actor.mode === 'working')) return actor
    if (actor.targetWorkstationId === seat && actor.mode === 'desk-break') {
      return { ...actor, mode: 'working', activeCommandId: null, activeTaskCommand: null }
    }
    try {
      return { ...beginRoute(actor, findWorkstationRouteFromPoint(actor.position, seat), 'task', seat),
        activeCommandId: null, activeTaskCommand: null, activeReportCommand: null }
    } catch { return actor }
  } else {
    if (command?.type === 'complete-task' || command?.type === 'stop-task') {
      // Commands are retained by the host; an acknowledged completion must
      // not cancel later seated-ready/roaming behavior on every render tick.
      if (actor.activeCommandId === command.commandId) return actor
      const executing = actor.activeTaskCommand
      // A late terminal from a previous task (or a different seat) cannot
      // interrupt the currently executing visual identity. Nor can a second
      // terminal stand up an employee whose first terminal already settled.
      if (!executing || executing.taskId !== command.taskId
        || executing.employeeId !== command.employeeId
        || executing.workstationId !== command.workstationId) return actor
      const retainSeat = actor.mode === 'working'
        && actor.targetWorkstationId === command.workstationId
        && employee.workstationId === command.workstationId
      if (command.type === 'complete-task') {
        try {
          return {
            ...beginRoute(actor, findOfficeRouteFromPoint(actor.position, 'entry-hall', { allowWorkOnly: true }), 'report', null),
            activeCommandId: command.commandId,
            activeTaskCommand: null,
            activeReportCommand: command,
            reportReplans: 0,
          }
        } catch {
          // Work is already delivered. An unavailable visual route must not
          // turn a real completed task back into a failure or invent a path.
          emitSceneEvent('animation-finished', command)
          return { ...actor, mode: 'idle', route: null, targetWorkstationId: null,
            activeCommandId: command.commandId, activeTaskCommand: null,
            activeReportCommand: null, trafficYield: null, waitStreak: 0 }
        }
      }
      emitSceneEvent('animation-finished', command)
      return {
        ...actor,
        mode: retainSeat ? 'desk-break' : 'idle',
        route: null,
        targetWorkstationId: retainSeat ? actor.targetWorkstationId : null,
        activeCommandId: command.commandId,
        activeTaskCommand: null,
        activeReportCommand: null,
        nextAmbientAt: Number.POSITIVE_INFINITY,
        trafficYield: null,
        waitStreak: 0,
      }
    }
    if (actor.mode === 'task' || actor.mode === 'working') {
      if (actor.mode==='working' && employee.ambientDesk && actor.targetWorkstationId===employee.workstationId) {
        return {...actor,mode:'desk-break',activeTaskCommand:null,activeReportCommand:null,activeCommandId:null}
      }
      actor = {
        ...actor,
        mode: 'idle',
        route: null,
        targetWorkstationId: null,
        activeCommandId: null,
        activeTaskCommand: null,
        nextAmbientAt: Number.POSITIVE_INFINITY,
        trafficYield: null,
      }
    }
  }

  return actor
}

function actorMotionKind(actor: ActorRuntime): 'idle' | 'ambient' | 'drag' | 'task' {
  if (actor.mode === 'working' || actor.mode === 'report') return 'task'
  if (actor.mode === 'desk-break') return 'idle'
  return actor.mode
}

export function autonomyActorMode(mode: ActorMode | undefined): OfficeAutonomyActorMode | undefined {
  return mode === 'report' ? 'task' : mode
}

function recoverBlockedActor(
  actor: ActorRuntime,
  command: SceneCommand | undefined,
  emitSceneEvent: SceneEventEmitter,
  deltaMs = 1000 / 60,
): ActorRuntime {
  const waitStreak = actor.waitStreak + navigationWaitTicks(deltaMs)
  const recovery = resolveOfficeActorStallRecovery({
    motionKind: actorMotionKind(actor),
    waitStreak,
  })
  if (actor.mode === 'report' && recovery.action === 'replan-route') {
    if ((actor.reportReplans ?? 0) >= 2) {
      if (actor.activeReportCommand) emitSceneEvent('animation-finished', actor.activeReportCommand)
      return { ...actor, mode: 'idle', route: null, activeReportCommand: null, waitStreak: 0 }
    }
    try {
      return { ...beginRoute(actor, findOfficeRouteFromPoint(actor.position, 'entry-hall', { allowWorkOnly: true }), 'report', null),
        reportReplans: (actor.reportReplans ?? 0) + 1 }
    } catch {
      if (actor.activeReportCommand) emitSceneEvent('animation-finished', actor.activeReportCommand)
      return { ...actor, mode: 'idle', route: null, activeReportCommand: null, waitStreak: 0 }
    }
  }
  if (recovery.action === 'cancel-ambient-route' && actor.targetWorkstationId === null) {
    return {
      ...actor,
      mode: 'idle',
      route: null,
      waitStreak: 0,
      nextAmbientAt: Number.POSITIVE_INFINITY,
    }
  }
  if ((recovery.action === 'replan-route' || recovery.action === 'cancel-ambient-route') && actor.targetWorkstationId) {
    // The route can still stall at a wall or desk if a drag left the actor off
    // its calibrated path. Replan against static scene geometry only: another
    // employee is never a navigation obstacle.
    try {
      return beginRoute(
        actor,
        findWorkstationRouteFromPoint(actor.position, actor.targetWorkstationId),
        actor.mode === 'task' ? 'task' : 'ambient',
        actor.targetWorkstationId,
      )
    } catch {
      if (command?.type === 'start-task') {
        emitSceneEvent('navigation-failed', command, 'static-route-replan-failed')
      }
      return { ...actor, mode: 'idle', route: null, waitStreak }
    }
  }
  return { ...actor, waitStreak }
}

function finishActorCandidate(
  actor: ActorRuntime,
  candidate: ReturnType<typeof candidateAlongRoute>,
  command: SceneCommand | undefined,
  emitSceneEvent: SceneEventEmitter,
): ActorRuntime {
  if (candidate.arrived) {
    if (actor.mode === 'task') {
      const executing = actor.activeTaskCommand ?? command
      if (executing?.type === 'start-task') {
        emitSceneEvent('workstation-arrived', executing)
        emitSceneEvent('work-animation-ready', executing)
      }
      return { ...actor, ...candidate, mode: 'working', route: null, waitStreak: 0 }
    }
    if (actor.mode === 'report' && actor.activeReportCommand) {
      emitSceneEvent('animation-finished', actor.activeReportCommand)
    }
    return {
      ...actor,
      ...candidate,
      mode: 'idle',
      route: null,
      waitStreak: 0,
      nextAmbientAt: Number.POSITIVE_INFINITY,
      activeReportCommand: null,
    }
  }
  return { ...actor, ...candidate, waitStreak: 0 }
}

export function applyOfficeAutonomyDecision(
  actor: ActorRuntime,
  decision: OfficeAutonomyDecision,
): ActorRuntime {
  if (decision.type === 'none') return actor
  if (decision.type === 'stand') {
    return {
      ...actor,
      direction: decision.facing,
      mode: 'idle',
      route: null,
      waypointIndex: 0,
      targetWorkstationId: null,
      waitStreak: 0,
      nextAmbientAt: Number.POSITIVE_INFINITY,
      trafficYield: null,
    }
  }
  if (decision.type === 'enter-desk-break') {
    return {
      ...actor,
      mode: 'desk-break',
      route: null,
      waypointIndex: 0,
      targetWorkstationId: decision.workstationId,
      waitStreak: 0,
      nextAmbientAt: Number.POSITIVE_INFINITY,
      trafficYield: null,
    }
  }
  try {
    if (decision.type === 'start-roam') {
      return beginRoute(
        actor,
        findOfficeRouteFromPoint(actor.position, decision.target.nodeId),
        'ambient',
        null,
      )
    }
    return beginRoute(
      actor,
      findWorkstationRouteFromPoint(actor.position, decision.workstationId),
      'ambient',
      decision.workstationId,
    )
  } catch {
    // The next pure-controller step sees an interrupted route and schedules a
    // new action. Never invent a straight line when A* cannot provide one.
    return {
      ...actor,
      mode: 'idle',
      route: null,
      waypointIndex: 0,
      targetWorkstationId: null,
      waitStreak: 0,
      nextAmbientAt: Number.POSITIVE_INFINITY,
    }
  }
}

function hasActiveOfficeTask(employee: OfficeSceneEmployee, actor: ActorRuntime | undefined): boolean {
  return employee.availability === 'working'
    || (actor?.activeCommandId !== null && (actor?.mode === 'task' || actor?.mode === 'working'))
}

/** Attendance only changes the scene's bodies, never persistent bindings,
 * task ownership or stored positions. Rendering and traffic share this set. */
export function resolvePresentOfficeEmployeeIds({
  employees, actors, timePolicy,
}: Readonly<{
  employees: readonly OfficeSceneEmployee[]
  actors: Readonly<Record<string, ActorRuntime>>
  timePolicy: Pick<OfficeTimePolicy, 'charactersPresent'>
}>): ReadonlySet<string> {
  return new Set(employees.filter(employee => timePolicy.charactersPresent
    || hasActiveOfficeTask(employee, actors[employee.id])
    || actors[employee.id]?.mode === 'report').map(employee => employee.id))
}

export function canRenderOfficeActorOverlay(employee: OfficeSceneEmployee, actor: ActorRuntime): boolean {
  return (actor.mode === 'idle' || actor.mode === 'desk-break') && !hasActiveOfficeTask(employee, actor)
}

export function resolveVisibleOfficeMonitorIds({
  employees,
  actors,
  timePolicy,
}: Readonly<{
  employees: readonly OfficeSceneEmployee[]
  actors: Readonly<Record<string, ActorRuntime>>
  timePolicy: OfficeTimePolicy
}>): ReadonlySet<OfficeWorkstationId> {
  const ids = new Set<OfficeWorkstationId>()
  // The office schedule controls ambience and idle attendance, not Harness
  // tasks. A real task can continue into closed hours with its own screen lit.
  employees.forEach(employee => {
    const actor = actors[employee.id]
    if (hasActiveOfficeTask(employee, actor)) {
      const workstationId = actor?.targetWorkstationId ?? employee.workstationId
      if (workstationId && isOfficeWorkstationId(workstationId)) ids.add(workstationId)
      return
    }
    // A persistent binding reserves a desk; it does not mean anyone is there.
    // Match the seated renderer's state rather than lighting an empty desk
    // during entry, walking, dragging, or an asynchronous binding update.
    if (!timePolicy.charactersPresent || timePolicy.monitors.forceAllOff
      || (!timePolicy.monitors.boundWorkstationsOn && !employee.ambientDesk)) return
    if (actor && (actor.mode === 'working' || actor.mode === 'desk-break')
      && actor.targetWorkstationId !== null && isOfficeWorkstationId(actor.targetWorkstationId)) {
      ids.add(actor.targetWorkstationId)
    }
  })
  return ids
}

export interface OfficeActorTrafficFrameInput {
  readonly actors: Readonly<Record<string, ActorRuntime>>
  readonly now: number
  readonly deltaMs: number
  readonly trafficState?: OfficeTrafficState
  readonly commandsByEmployee?: ReadonlyMap<string, SceneCommand>
  readonly emitSceneEvent?: SceneEventEmitter
  /** Omit for standalone traffic fixtures; production passes visible bodies. */
  readonly presentEmployeeIds?: ReadonlySet<string>
  readonly employeeSkins?: Readonly<Record<string, string>>
}

export interface OfficeActorTrafficFrameResult {
  readonly actors: Readonly<Record<string, ActorRuntime>>
  readonly trafficState: OfficeTrafficState
}

/**
 * Advance all present actors on safe half-lanes. Converging actors briefly yield
 * at a shared junction without reserving an entire room or blocking other routes.
 */
export function advanceOfficeActorTrafficFrame({
  actors,
  deltaMs,
  commandsByEmployee = new Map(),
  emitSceneEvent = () => {},
  presentEmployeeIds,
  employeeSkins,
}: OfficeActorTrafficFrameInput): OfficeActorTrafficFrameResult {
  const next: Record<string, ActorRuntime> = { ...actors }
  for (const actor of Object.values(actors)) {
    if (presentEmployeeIds && !presentEmployeeIds.has(actor.employeeId)) continue
    const moving = actor.trafficYield ? { ...actor, trafficYield: null } : actor
    if (moving.mode !== 'task' && moving.mode !== 'ambient' && moving.mode !== 'report') {
      next[actor.employeeId] = moving
      continue
    }
    const command = commandsByEmployee.get(actor.employeeId)
    const visiblePeers = presentEmployeeIds ? Object.fromEntries(Object.entries(actors).filter(([id])=>presentEmployeeIds.has(id))) : actors
    if(officeJunctionYield(moving,visiblePeers)){next[actor.employeeId]=moving;continue}
    // A route-less task must never be declared arrived at its current point.
    // Replan against walls/furniture before any workstation arrival event.
    if ((moving.mode === 'task' || moving.mode === 'report') && !moving.route) {
      next[actor.employeeId] = recoverBlockedActor(moving, command, emitSceneEvent, deltaMs)
      continue
    }
    const skinId = employeeSkins?.[actor.employeeId]
    const catalog = getEmployeeCatalogWithSkin(actor.employeeId, skinId)
    if (!catalog) { next[actor.employeeId] = moving; continue }
    const mode = moving.mode
    const candidate = candidateAlongRoute(moving, deltaMs, direction => {
      const strip = getOfficeAsset(catalog.walk[direction]).frameStrip
      return strip ? officeAutomaticWalkCadence(mode, strip).travelSpeed : 0
    })
    if (deltaMs > 0 && !candidate.arrived
      && Math.hypot(candidate.position.x - moving.position.x, candidate.position.y - moving.position.y) <= 0.01) {
      next[actor.employeeId] = recoverBlockedActor(moving, command, emitSceneEvent, deltaMs)
      continue
    }
    next[actor.employeeId] = finishActorCandidate(moving, candidate, command, emitSceneEvent)
  }
  // Retire any old actor-to-actor passage reservations on the first frame.
  return { actors: Object.freeze(next), trafficState: EMPTY_OFFICE_TRAFFIC_STATE }
}


import {
  OFFICE_NAV_ACTION_POINTS,
  findOfficeRouteFromPoint,
  selectDeterministicRoamTarget,
  type OfficeActionPoint,
} from './navigation.ts'
import type { OfficeTimePolicy } from './timePolicy.ts'
import type { OfficeWorkstationId } from './workstationSeating.ts'

export type OfficeAutonomyPhase =
  | 'absent'
  | 'standing'
  | 'roaming'
  | 'activity'
  | 'to-desk'
  | 'desk-break'
  | 'suspended'

export type OfficeAutonomyActivity =
  | 'absent'
  | 'standing'
  | 'pause'
  | 'idle'
  | 'look'
  | 'walking'
  | 'desk-break'
  | 'task'

export type OfficeAutonomyActorMode =
  | 'idle'
  | 'ambient'
  | 'desk-break'
  | 'task'
  | 'working'
  | 'drag'

export interface OfficeAutonomyPoint {
  readonly x: number
  readonly y: number
}

export interface OfficeAutonomyState {
  readonly employeeId: string
  readonly phase: OfficeAutonomyPhase
  readonly activity: OfficeAutonomyActivity
  readonly facing: OfficeActionPoint['facing']
  readonly ordinal: number
  readonly nextTransitionAt: number
  readonly targetActionPointId: string | null
  readonly targetWorkstationId: OfficeWorkstationId | null
  readonly returnWorkstationId: OfficeWorkstationId | null
  readonly pausedAt: number | null
  readonly observedBinding?: OfficeWorkstationId | null
  readonly observedWorkPeriod?: boolean
  /** Scene-only outing provenance, retained until the safe return is seated. */
  readonly optionalOutingActive?: boolean
}

export type OfficeAutonomyDecision =
  | Readonly<{ type: 'none' }>
  | Readonly<{ type: 'stand'; facing: OfficeActionPoint['facing'] }>
  | Readonly<{ type: 'start-roam'; target: OfficeActionPoint }>
  | Readonly<{ type: 'start-desk-break'; workstationId: OfficeWorkstationId }>
  | Readonly<{ type: 'enter-desk-break'; workstationId: OfficeWorkstationId }>

export interface AdvanceOfficeAutonomyInput {
  readonly state: OfficeAutonomyState
  readonly now: number
  readonly actorMode: OfficeAutonomyActorMode
  readonly actorPosition: OfficeAutonomyPoint
  readonly timePolicy: OfficeTimePolicy
  readonly boundWorkstationId: OfficeWorkstationId | null
  readonly workstationApproachPoint?: OfficeAutonomyPoint | null
  /** Actual retained seat, never inferred from proximity to an approach point. */
  readonly occupiedWorkstationId?: OfficeWorkstationId | null
  readonly presencePaused?: boolean
  readonly reducedMotion?: boolean
  /** A busy departure aisle skips this optional outing, never forces a path. */
  readonly ambientDesk?: boolean
  readonly canStartRoam?: boolean
}

export interface AdvanceOfficeAutonomyResult {
  readonly state: OfficeAutonomyState
  readonly decision: OfficeAutonomyDecision
}

const NONE: OfficeAutonomyDecision = Object.freeze({ type: 'none' })
const ARRIVAL_RADIUS = 18
export const OFFICE_SEATED_READY_POLICY = Object.freeze({
  minStayMs: 240_000,
  maxStayMs: 420_000,
  maxOutingMs: 30_000,
  maxOutboundMs: 12_000,
  maxOutboundDistance: 80 * 12,
})

/**
 * One immutable frame snapshot grants at most one optional departure. Required
 * return-to-seat routes, task commands and drag operations do not need this
 * permit. No wall-clock lease expiry can admit a second outing while the first
 * employee is still safely returning through traffic.
 */
export function resolveOfficeOptionalOutingEmployeeId({ states, actorModes, now }: Readonly<{
  states: Readonly<Record<string, OfficeAutonomyState | undefined>>
  actorModes: Readonly<Record<string, OfficeAutonomyActorMode | undefined>>
  now: number
}>): string | null {
  if (!Number.isFinite(now)) throw new TypeError('Office outing clock must be finite')
  const available = Object.values(states).filter((state): state is OfficeAutonomyState => {
    if (state === undefined) return false
    const mode = actorModes[state.employeeId]
    return mode !== undefined && mode !== 'task' && mode !== 'working' && mode !== 'drag'
  })
  // A task can preempt the outing immediately, even if the controller has not
  // yet processed that employee in this frame. The current actor mode wins.
  if (available.some(state => state.optionalOutingActive)) return null
  return available.filter(state => state.nextTransitionAt <= now && state.pausedAt === null
    && (state.phase === 'desk-break' && actorModes[state.employeeId] === 'desk-break'
      || state.phase === 'standing' && actorModes[state.employeeId] === 'idle' && state.observedBinding == null))
    .sort((left, right) => left.nextTransitionAt - right.nextTransitionAt
      || left.employeeId.localeCompare(right.employeeId))[0]?.employeeId ?? null
}

const hashSeed = (seed: unknown): number => {
  const text = String(seed)
  let hash = 2166136261
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

const sampleRange = (
  seed: unknown,
  range: readonly [number, number] | null,
  fallback: readonly [number, number],
): number => {
  const [minimum, maximum] = range ?? fallback
  const span = Math.max(1, maximum - minimum + 1)
  return minimum + hashSeed(seed) % span
}

const activityHoldMs = (state: OfficeAutonomyState, policy: OfficeTimePolicy): number => {
  const cycle = sampleRange(
    `${state.employeeId}:cycle:${state.ordinal}`,
    policy.autonomy.roamDurationMs,
    [15_000, 30_000],
  )
  return Math.max(1_500, Math.min(3_000, Math.round(cycle * .16)))
}

const scheduleDelayMs = (
  state: OfficeAutonomyState,
  policy: OfficeTimePolicy,
  initial = false,
): number => sampleRange(
  `${state.employeeId}:delay:${state.ordinal}:${initial ? 'initial' : 'next'}`,
  policy.autonomy.roamIntervalMs,
  initial ? [1_200, 2_400] : [3_500, 8_000],
)

const deskBreakDurationMs = (
  state: OfficeAutonomyState,
  policy: OfficeTimePolicy,
): number => sampleRange(
  `${state.employeeId}:desk:${state.ordinal}`,
  policy.autonomy.preferBoundWorkstation ? [OFFICE_SEATED_READY_POLICY.minStayMs, OFFICE_SEATED_READY_POLICY.maxStayMs] : policy.autonomy.roamIntervalMs,
  [45_000, 120_000],
)

const isAtPoint = (
  position: OfficeAutonomyPoint,
  target: OfficeAutonomyPoint | null | undefined,
): boolean => Boolean(target && Math.hypot(position.x - target.x, position.y - target.y) <= ARRIVAL_RADIUS)

const actionPointById = (id: string | null): OfficeActionPoint | null =>
  id === null ? null : OFFICE_NAV_ACTION_POINTS.find(point => point.id === id) ?? null

const standState = (
  state: OfficeAutonomyState,
  policy: OfficeTimePolicy,
  now: number,
  facing: OfficeActionPoint['facing'] = state.facing,
  immediate = false,
): OfficeAutonomyState => Object.freeze({
  ...state,
  phase: 'standing',
  activity: 'standing',
  facing,
  nextTransitionAt: immediate ? now : now + scheduleDelayMs(state, policy),
  targetActionPointId: null,
  targetWorkstationId: null,
  returnWorkstationId: null,
  pausedAt: null,
  optionalOutingActive: false,
})

const startRoam = (
  state: OfficeAutonomyState,
  policy: OfficeTimePolicy,
  boundWorkstationId: OfficeWorkstationId | null,
  now: number,
  actorPosition: OfficeAutonomyPoint,
): AdvanceOfficeAutonomyResult => {
  const returnWorkstationId = policy.autonomy.returnToBoundWorkstation
    ? boundWorkstationId
    : null
  const nearby = returnWorkstationId === null ? [] : OFFICE_NAV_ACTION_POINTS.filter(target => {
    try {
      const route = findOfficeRouteFromPoint(actorPosition, target.nodeId)
      return route.distance > 40 && route.distance <= OFFICE_SEATED_READY_POLICY.maxOutboundDistance
    } catch { return false }
  })
  const target = nearby.length > 0
    ? nearby[hashSeed(`${state.employeeId}:roam:${state.ordinal}`) % nearby.length]!
    : selectDeterministicRoamTarget(
    `${state.employeeId}:roam:${state.ordinal}`,
    { excludeNodeIds: actionPointById(state.targetActionPointId)?.nodeId
      ? [actionPointById(state.targetActionPointId)!.nodeId]
      : [] },
  )
  if (returnWorkstationId !== null && nearby.length === 0) {
    return Object.freeze({ state: Object.freeze({ ...state, nextTransitionAt: now + deskBreakDurationMs(state, policy) }), decision: NONE })
  }
  return Object.freeze({
    state: Object.freeze({
      ...state,
      phase: 'roaming',
      activity: 'walking',
      facing: target.facing,
      ordinal: state.ordinal + 1,
      nextTransitionAt: returnWorkstationId === null ? Number.POSITIVE_INFINITY : now + OFFICE_SEATED_READY_POLICY.maxOutboundMs,
      targetActionPointId: target.id,
      targetWorkstationId: null,
      returnWorkstationId,
      pausedAt: null,
      optionalOutingActive: true,
    }),
    decision: Object.freeze({ type: 'start-roam', target }),
  })
}

const startDeskBreak = (
  state: OfficeAutonomyState,
  workstationId: OfficeWorkstationId,
): AdvanceOfficeAutonomyResult => Object.freeze({
  state: Object.freeze({
    ...state,
    phase: 'to-desk',
    activity: 'walking',
    ordinal: state.ordinal + 1,
    nextTransitionAt: Number.POSITIVE_INFINITY,
    targetActionPointId: null,
    targetWorkstationId: workstationId,
    returnWorkstationId: null,
    pausedAt: null,
  }),
  decision: Object.freeze({ type: 'start-desk-break', workstationId }),
})

const canRestAt = (workstationId: OfficeWorkstationId | null): workstationId is OfficeWorkstationId =>
  workstationId !== null

/**
 * Create deterministic per-employee autonomy state. This state machine is the
 * sole owner of office idle timers; React and the scene renderer only adapt its
 * decisions to calibrated A* routes and existing whole-character assets.
 */
export function createOfficeAutonomyState({
  employeeId,
  now,
  timePolicy,
  boundWorkstationId = null,
  initiallyAtDesk = false,
}: Readonly<{
  employeeId: string
  now: number
  timePolicy: OfficeTimePolicy
  boundWorkstationId?: OfficeWorkstationId | null
  initiallyAtDesk?: boolean
}>): OfficeAutonomyState {
  if (!Number.isFinite(now)) throw new TypeError('Office autonomy clock must be finite')
  const base: OfficeAutonomyState = Object.freeze({
    employeeId,
    phase: timePolicy.charactersPresent ? 'standing' : 'absent',
    activity: timePolicy.charactersPresent ? 'standing' : 'absent',
    facing: 'down',
    ordinal: 0,
    nextTransitionAt: Number.POSITIVE_INFINITY,
    targetActionPointId: null,
    targetWorkstationId: null,
    returnWorkstationId: null,
    pausedAt: null,
    observedBinding: boundWorkstationId,
    observedWorkPeriod: timePolicy.isWorkPeriod,
    optionalOutingActive: false,
  })
  if (!timePolicy.charactersPresent) return base
  if (initiallyAtDesk && boundWorkstationId) {
    return { ...base, phase: 'desk-break', activity: 'desk-break', targetWorkstationId: boundWorkstationId,
      nextTransitionAt: now + deskBreakDurationMs(base, timePolicy) }
  }
  const standing = standState(
    base,
    timePolicy,
    now,
    'down',
    timePolicy.autonomy.preferBoundWorkstation && canRestAt(boundWorkstationId),
  )
  return timePolicy.autonomy.mode === 'free-time'
    ? {...standing,nextTransitionAt:now+sampleRange(`${employeeId}:initial-roam`,[1200,6000],[1200,6000])}
    : standing
}

/**
 * Advance one renderer-independent autonomy state.
 *
 * Task/drag states always suspend autonomy. Hidden tabs and reduced-motion
 * cancel only ambient travel; task travel remains controlled by the identified
 * Harness scene command. Off-duty hours mark only idle employees absent;
 * identified tasks remain suspended from autonomy and are owned by Harness.
 */
export function advanceOfficeAutonomyController({
  state,
  now,
  actorMode,
  actorPosition,
  timePolicy,
  boundWorkstationId,
  workstationApproachPoint = null,
  occupiedWorkstationId = null,
  presencePaused = false,
  reducedMotion = false,
  canStartRoam = true,
  ambientDesk = false,
}: AdvanceOfficeAutonomyInput): AdvanceOfficeAutonomyResult {
  if (!Number.isFinite(now)) throw new TypeError('Office autonomy clock must be finite')

  // A local clock change can never stop, complete, or redirect a real task.
  // Drag ownership also lasts until the user's pointer operation finishes.
  if (actorMode === 'task' || actorMode === 'working' || actorMode === 'drag') {
    return Object.freeze({
      state: Object.freeze({
        ...state,
        phase: 'suspended',
        activity: actorMode === 'drag' ? 'standing' : 'task',
        nextTransitionAt: Number.POSITIVE_INFINITY,
        targetActionPointId: null,
        targetWorkstationId: null,
        returnWorkstationId: null,
        pausedAt: null,
        optionalOutingActive: false,
      }),
      decision: NONE,
    })
  }

  if (!timePolicy.charactersPresent) {
    return Object.freeze({
      state: Object.freeze({
        ...state,
        phase: 'absent',
        activity: 'absent',
        nextTransitionAt: Number.POSITIVE_INFINITY,
        targetActionPointId: null,
        targetWorkstationId: null,
        returnWorkstationId: null,
        pausedAt: null,
        optionalOutingActive: false,
      }),
      // Do not keep an invisible ambient route moving after clock-out. This
      // cancels scene-only motion, not any Harness command or workstation bond.
      decision: actorMode === 'ambient' || actorMode === 'desk-break'
        ? Object.freeze({ type: 'stand', facing: state.facing })
        : NONE,
    })
  }

  if (actorMode === 'desk-break' && canRestAt(occupiedWorkstationId)
    && occupiedWorkstationId === boundWorkstationId
    && (state.phase === 'suspended' || state.phase === 'absent')) {
    // An identified task ended while still occupying its bound seat. Resume
    // the seated stay directly; stand → zero-length route → sit would expose
    // an unrelated standing avatar for two frames. This grants no arrival and
    // does not make a merely nearby/walking employee seated.
    state = Object.freeze({
      ...state,
      phase: 'desk-break',
      activity: 'desk-break',
      ordinal: state.ordinal + 1,
      nextTransitionAt: now + deskBreakDurationMs(state, timePolicy),
      targetActionPointId: null,
      targetWorkstationId: occupiedWorkstationId,
      returnWorkstationId: null,
      pausedAt: null,
      observedBinding: boundWorkstationId,
      observedWorkPeriod: timePolicy.isWorkPeriod,
    })
  }

  if (presencePaused || reducedMotion) {
    const shouldCancelTravel = actorMode === 'ambient'
      || state.phase === 'roaming'
      || state.phase === 'to-desk'
    const nextState = Object.freeze({
      ...state,
      phase: shouldCancelTravel ? 'standing' as const : state.phase,
      activity: shouldCancelTravel ? 'standing' as const : state.activity,
      nextTransitionAt: shouldCancelTravel ? Number.POSITIVE_INFINITY : state.nextTransitionAt,
      targetActionPointId: shouldCancelTravel ? null : state.targetActionPointId,
      targetWorkstationId: shouldCancelTravel ? null : state.targetWorkstationId,
      returnWorkstationId: shouldCancelTravel ? null : state.returnWorkstationId,
      pausedAt: state.pausedAt ?? now,
      optionalOutingActive: shouldCancelTravel ? false : state.optionalOutingActive ?? false,
    })
    return Object.freeze({
      state: nextState,
      decision: shouldCancelTravel
        ? Object.freeze({ type: 'stand', facing: state.facing })
        : NONE,
    })
  }

  if (state.observedBinding !== boundWorkstationId || state.observedWorkPeriod !== timePolicy.isWorkPeriod) {
    const releasedPracticeSeat = state.phase === 'to-desk' && state.targetWorkstationId !== boundWorkstationId
    state = { ...state, observedBinding: boundWorkstationId, observedWorkPeriod: timePolicy.isWorkPeriod }
    if (releasedPracticeSeat && !boundWorkstationId) {
      return { state: standState(state, timePolicy, now), decision: { type: 'stand', facing: state.facing } }
    }
    if ((ambientDesk || timePolicy.autonomy.preferBoundWorkstation) && canRestAt(boundWorkstationId)) {
      // A clock boundary changes attendance timing, not an already valid seat.
      // Reissuing travel here would swap seated → standing → seated for no move.
      if (state.phase === 'desk-break' && actorMode === 'desk-break' && state.targetWorkstationId === boundWorkstationId) {
        return Object.freeze({ state: Object.freeze({ ...state, pausedAt: null,
          nextTransitionAt: now + deskBreakDurationMs(state, timePolicy) }), decision: NONE })
      }
      return startDeskBreak(state, boundWorkstationId)
    }
  }

  if (state.pausedAt !== null && state.phase === 'desk-break' && actorMode === 'desk-break'
    && canRestAt(boundWorkstationId) && state.targetWorkstationId === boundWorkstationId) {
    // A hidden page/reduced-motion pause must neither stand the employee up nor
    // consume her remaining stay. Task, drag, and binding checks already won.
    const nextTransitionAt = Number.isFinite(state.nextTransitionAt)
      ? state.nextTransitionAt + Math.max(0, now - state.pausedAt)
      : now + deskBreakDurationMs(state, timePolicy)
    return Object.freeze({ state: Object.freeze({ ...state, pausedAt: null, nextTransitionAt }), decision: NONE })
  }

  if (state.phase === 'absent' || state.phase === 'suspended' || state.pausedAt !== null) {
    const resumed = standState(
      { ...state, ordinal: state.ordinal + 1 },
      timePolicy,
      now,
      state.facing,
      timePolicy.autonomy.preferBoundWorkstation && canRestAt(boundWorkstationId),
    )
    return Object.freeze({
      state: resumed,
      decision: Object.freeze({ type: 'stand', facing: resumed.facing }),
    })
  }

  if (!timePolicy.autonomy.allowRoaming) {
    const standing = standState(state, timePolicy, now)
    return Object.freeze({
      state: { ...standing, nextTransitionAt: Number.POSITIVE_INFINITY },
      decision: actorMode === 'desk-break'
        ? Object.freeze({ type: 'stand', facing: standing.facing })
        : NONE,
    })
  }

  if (state.phase === 'roaming') {
    if (canRestAt(state.returnWorkstationId) && now >= state.nextTransitionAt) {
      return startDeskBreak(state, state.returnWorkstationId)
    }
    if (actorMode === 'ambient') return Object.freeze({ state, decision: NONE })
    const target = actionPointById(state.targetActionPointId)
    if (actorMode === 'idle' && target && isAtPoint(actorPosition, target)) {
      const activityState: OfficeAutonomyState = Object.freeze({
        ...state,
        phase: 'activity',
        activity: target.activity,
        facing: target.facing,
        nextTransitionAt: now + activityHoldMs(state, timePolicy),
        targetWorkstationId: null,
      })
      return Object.freeze({
        state: activityState,
        decision: Object.freeze({ type: 'stand', facing: target.facing }),
      })
    }
    if (canRestAt(state.returnWorkstationId)) return startDeskBreak(state, state.returnWorkstationId)
    const standing = standState(state, timePolicy, now)
    return Object.freeze({
      state: standing,
      decision: Object.freeze({ type: 'stand', facing: standing.facing }),
    })
  }

  if (state.phase === 'to-desk') {
    if (actorMode === 'ambient') return Object.freeze({ state, decision: NONE })
    const workstationId = state.targetWorkstationId
    if (actorMode === 'idle' && workstationId && isAtPoint(actorPosition, workstationApproachPoint)) {
      const resting: OfficeAutonomyState = Object.freeze({
        ...state,
        phase: 'desk-break',
        activity: 'desk-break',
        nextTransitionAt: now + deskBreakDurationMs(state, timePolicy),
        optionalOutingActive: false,
      })
      return Object.freeze({
        state: resting,
        decision: Object.freeze({ type: 'enter-desk-break', workstationId }),
      })
    }
    // A temporarily occupied approach is not a four-minute standing break.
    // Retry the existing safe route later without a per-frame replan loop.
    const standing = { ...standState(state, timePolicy, now), nextTransitionAt: now + 3_000,
      optionalOutingActive: state.optionalOutingActive ?? false }
    return Object.freeze({
      state: standing,
      decision: Object.freeze({ type: 'stand', facing: standing.facing }),
    })
  }

  if (state.phase === 'desk-break') {
    if (!canRestAt(boundWorkstationId) || boundWorkstationId !== state.targetWorkstationId) {
      const standing = standState(state, timePolicy, now)
      return Object.freeze({
        state: standing,
        decision: Object.freeze({ type: 'stand', facing: standing.facing }),
      })
    }
    if (actorMode !== 'desk-break') {
      return Object.freeze({
        state,
        decision: Object.freeze({ type: 'enter-desk-break', workstationId: boundWorkstationId }),
      })
    }
    if (now < state.nextTransitionAt) return Object.freeze({ state, decision: NONE })
    if (!canStartRoam) {
      return Object.freeze({ state: Object.freeze({ ...state, ordinal: state.ordinal + 1,
        nextTransitionAt: now + deskBreakDurationMs(state, timePolicy) }), decision: NONE })
    }
    return startRoam(state, timePolicy, boundWorkstationId, now, actorPosition)
  }

  if (state.phase === 'activity') {
    if (now < state.nextTransitionAt) return Object.freeze({ state, decision: NONE })
    if (canRestAt(state.returnWorkstationId)) {
      return startDeskBreak(state, state.returnWorkstationId)
    }
    const standing = standState(state, timePolicy, now)
    return Object.freeze({
      state: standing,
      decision: Object.freeze({ type: 'stand', facing: standing.facing }),
    })
  }

  if (now < state.nextTransitionAt) return Object.freeze({ state, decision: NONE })

  if ((ambientDesk || timePolicy.autonomy.preferBoundWorkstation) && canRestAt(boundWorkstationId)) {
    return startDeskBreak(state, boundWorkstationId)
  }

  const roll = hashSeed(`${state.employeeId}:choice:${state.ordinal}`) / 0x1_0000_0000
  if (canRestAt(boundWorkstationId) && roll < timePolicy.autonomy.seatedWeight) {
    return startDeskBreak(state, boundWorkstationId)
  }
  if (roll < timePolicy.autonomy.seatedWeight + timePolicy.autonomy.roamWeight) {
    if (!canStartRoam) {
      return Object.freeze({ state: Object.freeze({ ...state, ordinal: state.ordinal + 1,
        nextTransitionAt: now + scheduleDelayMs(state, timePolicy) }), decision: NONE })
    }
    return startRoam(state, timePolicy, boundWorkstationId, now, actorPosition)
  }

  const action = selectDeterministicRoamTarget(`${state.employeeId}:pause:${state.ordinal}`)
  const paused: OfficeAutonomyState = Object.freeze({
    ...state,
    phase: 'activity',
    activity: action.activity,
    facing: action.facing,
    ordinal: state.ordinal + 1,
    nextTransitionAt: now + activityHoldMs(state, timePolicy),
    targetActionPointId: null,
    targetWorkstationId: null,
    returnWorkstationId: null,
  })
  return Object.freeze({
    state: paused,
    decision: Object.freeze({ type: 'stand', facing: action.facing }),
  })
}

export function getOfficeAutonomyActivity(
  state: OfficeAutonomyState | null | undefined,
  actorMode: OfficeAutonomyActorMode,
): OfficeAutonomyActivity {
  if (actorMode === 'task' || actorMode === 'working') return 'task'
  if (actorMode === 'ambient') return 'walking'
  if (actorMode === 'desk-break') return 'desk-break'
  if (actorMode === 'drag') return 'standing'
  return state?.activity ?? 'standing'
}

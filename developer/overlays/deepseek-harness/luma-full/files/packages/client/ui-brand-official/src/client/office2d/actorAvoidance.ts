export type OfficeActorMotionKind = 'idle' | 'ambient' | 'entrance' | 'drag' | 'task'

export interface OfficeActorPoint {
  readonly x: number
  readonly y: number
}

export interface OfficeActorState {
  readonly employeeId?: string
  readonly id?: string
  readonly motionKind?: OfficeActorMotionKind
  readonly priority?: number
  readonly footAnchor?: OfficeActorPoint
  readonly position?: OfficeActorPoint
  readonly previousFootAnchor?: OfficeActorPoint
  readonly radiusX?: number
  readonly radiusY?: number
  readonly present?: boolean
}

export const OFFICE_ACTOR_MOTION_PRIORITY = Object.freeze({
  idle: 100,
  ambient: 200,
  entrance: 300,
  drag: 400,
  task: 500,
} satisfies Readonly<Record<OfficeActorMotionKind, number>>)

export const OFFICE_ACTOR_STALL_LIMIT_TICKS = Object.freeze({
  forcedYield: 90,
  task: 90,
  ambient: 120,
  entrance: 180,
})

const DEFAULT_RADIUS_X = 20
const DEFAULT_RADIUS_Y = 10
const DEFAULT_GAP_X = 8
const DEFAULT_GAP_Y = 4

const finiteNumber = (value: number | undefined, fallback: number): number =>
  Number.isFinite(value) ? Number(value) : fallback

const employeeIdOf = (actor: OfficeActorState): string =>
  String(actor.employeeId ?? actor.id ?? 'unknown-employee')

const pointOf = (actor: OfficeActorState, overridePoint: OfficeActorPoint | null = null): OfficeActorPoint => {
  const point = overridePoint ?? actor.footAnchor ?? actor.position ?? { x: 0, y: 0 }
  return {
    x: finiteNumber(point.x, 0),
    y: finiteNumber(point.y, 0),
  }
}

export function getOfficeActorMotionPriority(actor: OfficeActorState): number {
  if (Number.isFinite(actor.priority)) return Number(actor.priority)
  return OFFICE_ACTOR_MOTION_PRIORITY[actor.motionKind ?? 'idle']
}

export function resolveOfficeActorStallRecovery({
  motionKind = 'idle',
  waitStreak = 0,
  forcedYield = false,
}: Readonly<{
  motionKind?: OfficeActorMotionKind
  waitStreak?: number
  forcedYield?: boolean
}> = {}) {
  const normalizedWaitStreak = Math.max(0, Math.floor(finiteNumber(waitStreak, 0)))
  const threshold = forcedYield
    ? OFFICE_ACTOR_STALL_LIMIT_TICKS.forcedYield
    : OFFICE_ACTOR_STALL_LIMIT_TICKS[motionKind as keyof typeof OFFICE_ACTOR_STALL_LIMIT_TICKS]
      ?? Number.POSITIVE_INFINITY

  if (normalizedWaitStreak < threshold) {
    return Object.freeze({
      action: 'wait' as const,
      threshold,
      remainingTicks: Number.isFinite(threshold)
        ? threshold - normalizedWaitStreak
        : Number.POSITIVE_INFINITY,
    })
  }

  const action = forcedYield
    ? 'reselect-yield-route' as const
    : motionKind === 'ambient'
      ? 'cancel-ambient-route' as const
      : motionKind === 'task' || motionKind === 'entrance'
        ? 'replan-route' as const
        : 'wait' as const

  return Object.freeze({ action, threshold, remainingTicks: 0 })
}

export function getOfficeActorFootEllipse(
  actor: OfficeActorState,
  overridePoint: OfficeActorPoint | null = null,
) {
  const point = pointOf(actor, overridePoint)
  return {
    employeeId: employeeIdOf(actor),
    x: point.x,
    y: point.y,
    radiusX: Math.max(1, finiteNumber(actor.radiusX, DEFAULT_RADIUS_X)),
    radiusY: Math.max(1, finiteNumber(actor.radiusY, DEFAULT_RADIUS_Y)),
  }
}

/** Task movement wins; equal priorities use a stable employee ID tie-break. */
export function pickOfficeActorPriorityWinner(
  left: OfficeActorState,
  right: OfficeActorState,
): OfficeActorState {
  const leftPriority = getOfficeActorMotionPriority(left)
  const rightPriority = getOfficeActorMotionPriority(right)
  if (leftPriority !== rightPriority) return leftPriority > rightPriority ? left : right
  return employeeIdOf(left).localeCompare(employeeIdOf(right)) <= 0 ? left : right
}

export function calculateOfficeActorOverlap(
  left: OfficeActorState,
  right: OfficeActorState,
  {
    leftPoint = null,
    rightPoint = null,
    gapX = DEFAULT_GAP_X,
    gapY = DEFAULT_GAP_Y,
  }: Readonly<{
    leftPoint?: OfficeActorPoint | null
    rightPoint?: OfficeActorPoint | null
    gapX?: number
    gapY?: number
  }> = {},
) {
  const a = getOfficeActorFootEllipse(left, leftPoint)
  const b = getOfficeActorFootEllipse(right, rightPoint)
  const combinedRadiusX = a.radiusX + b.radiusX + Math.max(0, finiteNumber(gapX, DEFAULT_GAP_X))
  const combinedRadiusY = a.radiusY + b.radiusY + Math.max(0, finiteNumber(gapY, DEFAULT_GAP_Y))
  const dx = a.x - b.x
  const dy = a.y - b.y
  let normalizedX = dx / combinedRadiusX
  let normalizedY = dy / combinedRadiusY
  let normalizedDistance = Math.hypot(normalizedX, normalizedY)

  if (normalizedDistance === 0) {
    normalizedX = a.employeeId.localeCompare(b.employeeId) <= 0 ? -1 : 1
    normalizedY = 0
    normalizedDistance = 0
  }

  if (normalizedDistance >= 1) {
    return Object.freeze({
      overlapping: false,
      normalizedDistance,
      penetration: 0,
      separation: Object.freeze({ x: 0, y: 0 }),
    })
  }

  const directionLength = Math.max(normalizedDistance, Number.EPSILON)
  const penetration = 1 - normalizedDistance
  return Object.freeze({
    overlapping: true,
    normalizedDistance,
    penetration,
    separation: Object.freeze({
      x: normalizedX / directionLength * combinedRadiusX * penetration,
      y: normalizedY / directionLength * combinedRadiusY * penetration,
    }),
  })
}

/** Continuous foot-ellipse separation, including two actors crossing between
 * otherwise non-overlapping frame endpoints. This does not grant right of way. */
export function calculateOfficeActorSweptOverlap(
  left: OfficeActorState,
  right: OfficeActorState,
  {
    leftFrom = pointOf(left), leftTo = pointOf(left),
    rightFrom = pointOf(right), rightTo = pointOf(right),
    gapX = DEFAULT_GAP_X, gapY = DEFAULT_GAP_Y,
  }: Readonly<{
    leftFrom?: OfficeActorPoint; leftTo?: OfficeActorPoint
    rightFrom?: OfficeActorPoint; rightTo?: OfficeActorPoint
    gapX?: number; gapY?: number
  }> = {},
) {
  const a = getOfficeActorFootEllipse(left), b = getOfficeActorFootEllipse(right)
  const radiusX = a.radiusX + b.radiusX + Math.max(0, finiteNumber(gapX, DEFAULT_GAP_X))
  const radiusY = a.radiusY + b.radiusY + Math.max(0, finiteNumber(gapY, DEFAULT_GAP_Y))
  const x = (leftFrom.x - rightFrom.x) / radiusX, y = (leftFrom.y - rightFrom.y) / radiusY
  const vx = (leftTo.x - leftFrom.x - rightTo.x + rightFrom.x) / radiusX
  const vy = (leftTo.y - leftFrom.y - rightTo.y + rightFrom.y) / radiusY
  const speedSquared = vx * vx + vy * vy
  const at = speedSquared > 0 ? Math.max(0, Math.min(1, -(x * vx + y * vy) / speedSquared)) : 0
  const normalizedDistance = Math.hypot(x + vx * at, y + vy * at)
  return Object.freeze({ overlapping: normalizedDistance < 1, normalizedDistance, at })
}

/** An already-overlapping spawn may only separate monotonically; normal
 * motion may never enter overlap. This is not a smaller collision radius. */
export function isOfficeActorSeparationStepSafe(
  actor: OfficeActorState,
  other: OfficeActorState,
  candidatePoint: OfficeActorPoint,
): boolean {
  const from = pointOf(actor), otherFrom = other.previousFootAnchor ?? pointOf(other)
  const sweep = calculateOfficeActorSweptOverlap(actor, other, {
    leftFrom: from, leftTo: candidatePoint, rightFrom: otherFrom,
  })
  if (!sweep.overlapping) return true
  const initial = calculateOfficeActorOverlap(actor, other, { rightPoint: otherFrom })
  const final = calculateOfficeActorOverlap(actor, other, { leftPoint: candidatePoint })
  return initial.overlapping && sweep.at === 0 && final.normalizedDistance > initial.normalizedDistance
}

/** Losers wait rather than taking an uncalibrated sidestep into furniture. */
export function resolveOfficeActorMotionStep({
  actor,
  candidatePoint,
  actors = [],
  gapX = DEFAULT_GAP_X,
  gapY = DEFAULT_GAP_Y,
}: Readonly<{
  actor: OfficeActorState
  candidatePoint: OfficeActorPoint
  actors?: readonly OfficeActorState[]
  gapX?: number
  gapY?: number
}>) {
  const actorId = employeeIdOf(actor)
  const blockers: { employeeId: string; priority: number }[] = []
  const yieldEmployeeIds: string[] = []

  for (const other of actors) {
    if (employeeIdOf(other) === actorId || other.present === false) continue
    const overlap = calculateOfficeActorSweptOverlap(actor, other, {
      leftTo: candidatePoint, rightFrom: other.previousFootAnchor ?? pointOf(other), gapX, gapY,
    })
    if (!overlap.overlapping) continue
    const winner = pickOfficeActorPriorityWinner(actor, other)
    if (employeeIdOf(winner) === actorId) {
      yieldEmployeeIds.push(employeeIdOf(other))
    } else {
      blockers.push({
        employeeId: employeeIdOf(other),
        priority: getOfficeActorMotionPriority(other),
      })
    }
  }

  blockers.sort((left, right) => right.priority - left.priority || left.employeeId.localeCompare(right.employeeId))
  return Object.freeze({
    allowed: blockers.length === 0,
    wait: blockers.length > 0,
    candidatePoint: Object.freeze(pointOf(actor, candidatePoint)),
    blockedByEmployeeIds: Object.freeze(blockers.map(blocker => blocker.employeeId)),
    yieldEmployeeIds: Object.freeze([...new Set(yieldEmployeeIds)].sort()),
  })
}

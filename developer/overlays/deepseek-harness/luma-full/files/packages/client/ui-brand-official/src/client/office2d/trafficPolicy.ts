import {
  calculateOfficeActorOverlap,
  getOfficeActorMotionPriority,
  type OfficeActorMotionKind,
  type OfficeActorPoint,
} from './actorAvoidance.ts'

export const OFFICE_TRAFFIC_HORIZON_MS = 750
export const OFFICE_TRAFFIC_SAMPLE_INTERVAL_MS = 125

export interface OfficeTrafficSample {
  readonly atMs: number
  readonly point: OfficeActorPoint
}

export interface OfficeTrafficIntent {
  readonly employeeId: string
  readonly motionKind: OfficeActorMotionKind
  readonly priority: number
  readonly radiusX: number
  readonly radiusY: number
  readonly from: OfficeActorPoint
  readonly to: OfficeActorPoint
  readonly samples: readonly OfficeTrafficSample[]
  readonly passageId: string | null
  readonly direction: 'east' | 'west' | 'north' | 'south' | null
  readonly issuedAt: number
  readonly expiresAt: number
}

export interface OfficeTrafficToken {
  readonly passageId: string
  readonly direction: NonNullable<OfficeTrafficIntent['direction']>
  readonly priority: number
  readonly issuedAt: number
  readonly expiresAt: number
  readonly holderEmployeeIds: readonly string[]
}

export interface OfficeTrafficState {
  readonly reservations: readonly OfficeTrafficIntent[]
  readonly tokens: readonly OfficeTrafficToken[]
}

const passage = (
  id: string,
  axis: 'x' | 'y',
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
) => Object.freeze({ id, axis, bounds: Object.freeze({ minX, minY, maxX, maxY }) })

export const OFFICE_NARROW_PASSAGES = Object.freeze([
  passage('entry-neck', 'y', 330, 640, 465, 910),
  passage('west-neck', 'y', 420, 415, 545, 655),
  passage('lounge-neck', 'y', 595, 190, 755, 455),
  passage('north-neck', 'x', 720, 170, 1070, 255),
  passage('south-neck', 'x', 535, 605, 1125, 705),
  passage('east-neck', 'y', 1080, 415, 1215, 690),
  passage('private-upper-neck', 'x', 255, 475, 475, 550),
  passage('private-lower-neck', 'x', 295, 645, 465, 740),
])

const finite = (value: number | undefined, fallback = 0): number =>
  Number.isFinite(value) ? Number(value) : fallback

const point = (value: OfficeActorPoint | readonly [number, number] | undefined): OfficeActorPoint =>
  Object.freeze(Array.isArray(value)
    ? { x: finite(value[0]), y: finite(value[1]) }
    : { x: finite((value as OfficeActorPoint | undefined)?.x), y: finite((value as OfficeActorPoint | undefined)?.y) })

const insidePassage = (
  value: OfficeActorPoint,
  candidate: (typeof OFFICE_NARROW_PASSAGES)[number],
) => {
  const { minX, minY, maxX, maxY } = candidate.bounds
  return value.x >= minX && value.x <= maxX && value.y >= minY && value.y <= maxY
}

export function detectOfficeNarrowPassage(
  samples: readonly OfficeActorPoint[] = [],
  fromValue?: OfficeActorPoint,
  toValue?: OfficeActorPoint,
): Readonly<{ passageId: string; direction: NonNullable<OfficeTrafficIntent['direction']> }> | null {
  const normalizedSamples = samples.map(value => point(value))
  const from = point(fromValue ?? normalizedSamples[0])
  const to = point(toValue ?? normalizedSamples.at(-1) ?? from)

  for (const candidate of OFFICE_NARROW_PASSAGES) {
    if (!normalizedSamples.some(sample => insidePassage(sample, candidate))) continue
    const delta = candidate.axis === 'x' ? to.x - from.x : to.y - from.y
    if (Math.abs(delta) < 0.25) continue
    const direction = candidate.axis === 'x'
      ? delta > 0 ? 'east' : 'west'
      : delta > 0 ? 'south' : 'north'
    return Object.freeze({ passageId: candidate.id, direction })
  }
  return null
}

export function createOfficeTrafficIntent({
  employeeId,
  motionKind = 'idle',
  from,
  to,
  samples = [],
  issuedAt = 0,
  horizonMs = OFFICE_TRAFFIC_HORIZON_MS,
  radiusX = 20,
  radiusY = 10,
}: Readonly<{
  employeeId: string
  motionKind?: OfficeActorMotionKind
  from: OfficeActorPoint
  to?: OfficeActorPoint
  samples?: readonly Readonly<{ atMs?: number; offsetMs?: number; point: OfficeActorPoint }>[]
  issuedAt?: number
  horizonMs?: number
  radiusX?: number
  radiusY?: number
}>): OfficeTrafficIntent {
  const normalizedIssuedAt = finite(issuedAt)
  const normalizedHorizon = Math.max(0, finite(horizonMs, OFFICE_TRAFFIC_HORIZON_MS))
  const normalizedFrom = point(from)
  const normalizedTo = point(to ?? from)
  const inputSamples = samples.length > 0 ? samples : [{ offsetMs: 0, point: normalizedTo }]
  const normalizedSamples = inputSamples
    .map(sample => Object.freeze({
      atMs: Number.isFinite(sample.atMs)
        ? Number(sample.atMs)
        : normalizedIssuedAt + Math.max(0, finite(sample.offsetMs)),
      point: point(sample.point),
    }))
    .filter(sample => sample.atMs >= normalizedIssuedAt && sample.atMs <= normalizedIssuedAt + normalizedHorizon)
    .sort((left, right) => left.atMs - right.atMs)
  if (normalizedSamples.length === 0) {
    normalizedSamples.push(Object.freeze({ atMs: normalizedIssuedAt, point: normalizedTo }))
  }
  const passageState = detectOfficeNarrowPassage(
    normalizedSamples.map(sample => sample.point),
    normalizedFrom,
    normalizedSamples.at(-1)?.point ?? normalizedTo,
  )
  return Object.freeze({
    employeeId: String(employeeId),
    motionKind,
    priority: getOfficeActorMotionPriority({ employeeId, motionKind }),
    radiusX: Math.max(1, finite(radiusX, 20)),
    radiusY: Math.max(1, finite(radiusY, 10)),
    from: normalizedFrom,
    to: normalizedTo,
    samples: Object.freeze(normalizedSamples),
    passageId: passageState?.passageId ?? null,
    direction: passageState?.direction ?? null,
    issuedAt: normalizedIssuedAt,
    expiresAt: normalizedIssuedAt + normalizedHorizon,
  })
}

const pointsOverlap = (
  left: OfficeTrafficIntent,
  right: OfficeTrafficIntent,
  leftPoint: OfficeActorPoint,
  rightPoint: OfficeActorPoint,
): boolean => calculateOfficeActorOverlap(
  {
    employeeId: left.employeeId,
    motionKind: left.motionKind,
    priority: left.priority,
    radiusX: left.radiusX,
    radiusY: left.radiusY,
    footAnchor: leftPoint,
  },
  {
    employeeId: right.employeeId,
    motionKind: right.motionKind,
    priority: right.priority,
    radiusX: right.radiusX,
    radiusY: right.radiusY,
    footAnchor: rightPoint,
  },
).overlapping

const trajectoriesConflict = (left: OfficeTrafficIntent, right: OfficeTrafficIntent): boolean => {
  for (const leftSample of left.samples) {
    for (const rightSample of right.samples) {
      if (Math.abs(leftSample.atMs - rightSample.atMs) > OFFICE_TRAFFIC_SAMPLE_INTERVAL_MS / 2) continue
      if (pointsOverlap(left, right, leftSample.point, rightSample.point)) return true
    }
  }
  return false
}

const edgesSwap = (left: OfficeTrafficIntent, right: OfficeTrafficIntent): boolean =>
  pointsOverlap(left, right, left.from, right.to) && pointsOverlap(left, right, left.to, right.from)

const incumbentWins = (
  intent: OfficeTrafficIntent,
  incumbent: Readonly<{ employeeId: string; priority: number; issuedAt: number }>,
): boolean => {
  if (intent.priority !== incumbent.priority) return incumbent.priority > intent.priority
  if (intent.issuedAt !== incumbent.issuedAt) return incumbent.issuedAt < intent.issuedAt
  return incumbent.employeeId.localeCompare(intent.employeeId) <= 0
}

const freezeState = (
  reservations: readonly OfficeTrafficIntent[],
  tokens: readonly OfficeTrafficToken[],
): OfficeTrafficState => Object.freeze({
  reservations: Object.freeze(reservations),
  tokens: Object.freeze(tokens),
})

export const EMPTY_OFFICE_TRAFFIC_STATE = freezeState([], [])

const normalizeToken = (
  token: OfficeTrafficToken,
  reservations: readonly OfficeTrafficIntent[],
): OfficeTrafficToken | null => {
  const reservationByEmployee = new Map(reservations.map(entry => [entry.employeeId, entry]))
  const holders = token.holderEmployeeIds.map(id => reservationByEmployee.get(id)).filter((entry): entry is OfficeTrafficIntent => Boolean(entry))
  if (holders.length === 0) return null
  return Object.freeze({
    ...token,
    priority: Math.max(...holders.map(entry => entry.priority)),
    issuedAt: Math.min(...holders.map(entry => entry.issuedAt)),
    expiresAt: Math.max(...holders.map(entry => entry.expiresAt)),
    holderEmployeeIds: Object.freeze(holders.map(entry => entry.employeeId).sort()),
  })
}

export function pruneOfficeTrafficState(
  state: OfficeTrafficState = EMPTY_OFFICE_TRAFFIC_STATE,
  nowMs = 0,
): OfficeTrafficState {
  const now = finite(nowMs)
  const reservations = state.reservations.filter(entry => entry.expiresAt > now)
  const tokens = state.tokens.flatMap(token => {
    if (token.expiresAt <= now) return []
    const normalized = normalizeToken(token, reservations)
    return normalized ? [normalized] : []
  })
  return freezeState(reservations, tokens)
}

export function releaseOfficeTrafficEmployee(
  state: OfficeTrafficState,
  employeeId: string,
  nowMs = 0,
): OfficeTrafficState {
  const active = pruneOfficeTrafficState(state, nowMs)
  const reservations = active.reservations.filter(entry => entry.employeeId !== employeeId)
  const tokens = active.tokens.flatMap(token => {
    const holderEmployeeIds = token.holderEmployeeIds.filter(id => id !== employeeId)
    if (holderEmployeeIds.length === 0) return []
    const normalized = normalizeToken(Object.freeze({ ...token, holderEmployeeIds }), reservations)
    return normalized ? [normalized] : []
  })
  return freezeState(reservations, tokens)
}

export interface OfficeTrafficDecision {
  readonly allowed: boolean
  readonly reason: 'reserved' | 'traffic-conflict'
  readonly blockedByEmployeeIds: readonly string[]
  readonly preemptEmployeeIds: readonly string[]
  readonly reservation: OfficeTrafficIntent
  readonly token: OfficeTrafficToken | null
  readonly activeState: OfficeTrafficState
}

export function resolveOfficeTrafficAdmission({
  intent,
  state = EMPTY_OFFICE_TRAFFIC_STATE,
  nowMs = intent.issuedAt,
}: Readonly<{
  intent: OfficeTrafficIntent
  state?: OfficeTrafficState
  nowMs?: number
}>): OfficeTrafficDecision {
  const active = pruneOfficeTrafficState(state, nowMs)
  const blocked = new Set<string>()
  const preempt = new Set<string>()
  for (const reservation of active.reservations) {
    if (reservation.employeeId === intent.employeeId) continue
    if (!trajectoriesConflict(intent, reservation) && !edgesSwap(intent, reservation)) continue
    if (incumbentWins(intent, reservation)) blocked.add(reservation.employeeId)
    else preempt.add(reservation.employeeId)
  }

  let nextToken: OfficeTrafficToken | null = null
  if (intent.passageId && intent.direction) {
    const token = active.tokens.find(entry => entry.passageId === intent.passageId)
    const otherHolders = token?.holderEmployeeIds.filter(id => id !== intent.employeeId) ?? []
    if (!token || otherHolders.length === 0 || token.direction === intent.direction) {
      nextToken = Object.freeze({
        passageId: intent.passageId,
        direction: intent.direction,
        priority: Math.max(token?.priority ?? 0, intent.priority),
        issuedAt: Math.min(token?.issuedAt ?? intent.issuedAt, intent.issuedAt),
        expiresAt: Math.max(token?.expiresAt ?? 0, intent.expiresAt),
        holderEmployeeIds: Object.freeze([...new Set([...otherHolders, intent.employeeId])].sort()),
      })
    } else {
      const tokenIncumbent = {
        employeeId: [...otherHolders].sort()[0] ?? '',
        priority: token.priority,
        issuedAt: token.issuedAt,
      }
      if (incumbentWins(intent, tokenIncumbent)) otherHolders.forEach(id => blocked.add(id))
      else {
        otherHolders.forEach(id => preempt.add(id))
        nextToken = Object.freeze({
          passageId: intent.passageId,
          direction: intent.direction,
          priority: intent.priority,
          issuedAt: intent.issuedAt,
          expiresAt: intent.expiresAt,
          holderEmployeeIds: Object.freeze([intent.employeeId]),
        })
      }
    }
  }

  const blockedByEmployeeIds = [...blocked].sort()
  const allowed = blockedByEmployeeIds.length === 0
  return Object.freeze({
    allowed,
    reason: allowed ? 'reserved' : 'traffic-conflict',
    blockedByEmployeeIds: Object.freeze(blockedByEmployeeIds),
    preemptEmployeeIds: Object.freeze(allowed ? [...preempt].sort() : []),
    reservation: intent,
    token: allowed ? nextToken : null,
    activeState: active,
  })
}

export function commitOfficeTrafficAdmission(
  state: OfficeTrafficState,
  decision: OfficeTrafficDecision,
  nowMs = 0,
): OfficeTrafficState {
  if (!decision.allowed) return pruneOfficeTrafficState(state, nowMs)
  let next = releaseOfficeTrafficEmployee(decision.activeState, decision.reservation.employeeId, nowMs)
  decision.preemptEmployeeIds.forEach(employeeId => {
    next = releaseOfficeTrafficEmployee(next, employeeId, nowMs)
  })
  const reservations = [...next.reservations, decision.reservation]
    .sort((left, right) => left.employeeId.localeCompare(right.employeeId))
  const token = decision.token ? normalizeToken(decision.token, reservations) : null
  const tokens = token
    ? [...next.tokens.filter(entry => entry.passageId !== token.passageId), token]
        .sort((left, right) => left.passageId.localeCompare(right.passageId))
    : next.tokens
  return freezeState(reservations, tokens)
}

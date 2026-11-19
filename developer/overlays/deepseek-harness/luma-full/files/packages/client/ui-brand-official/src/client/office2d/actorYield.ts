import { calculateOfficeActorSweptOverlap, isOfficeActorSeparationStepSafe, type OfficeActorPoint, type OfficeActorState } from './actorAvoidance.ts'
import { isOfficeFootSegmentWalkable, OFFICE_NAV_NODES } from './navigation.ts'

export interface OfficeActorYieldPlan {
  readonly threatEmployeeId: string
  readonly destination: OfficeActorPoint
  readonly releaseAfter: number
  /** When this bay/retreat was chosen. A plan held far past `releaseAfter`
   * means the threat never cleared, whatever its mode reports. */
  readonly issuedAt?: number
  /** A narrow aisle cannot admit a lateral pass; return via A* after it clears. */
  readonly kind?: 'retreat'
}

/** A bay that sits on the winner's remaining route still blocks it: the winner
 * walks into the parked body minutes later, after the 750 ms lookahead that
 * validated the plan has long expired. */
const clearsThreatPath = (
  destination: OfficeActorPoint,
  threatFrom: OfficeActorPoint,
  threatRoute: readonly OfficeActorPoint[],
  clearanceX: number,
  clearanceY: number,
): boolean => {
  const points = [threatFrom, ...threatRoute]
  for (let index = 1; index < points.length; index += 1) {
    const a = points[index - 1], b = points[index]
    if (!a || !b) continue
    const dx = b.x - a.x, dy = b.y - a.y
    const lengthSquared = dx * dx + dy * dy
    const raw = lengthSquared === 0 ? 0
      : ((destination.x - a.x) * dx + (destination.y - a.y) * dy) / lengthSquared
    const t = Math.max(0, Math.min(1, raw))
    const nearestX = a.x + dx * t, nearestY = a.y + dy * t
    if (Math.hypot((destination.x - nearestX) / clearanceX, (destination.y - nearestY) / clearanceY) < 1) return false
  }
  return true
}

/** Select one bounded side bay, not a fresh "away" direction every frame.
 * Both the connector and destination use the existing calibrated air walls
 * and full peer foot ellipses. No seat/furniture collision exemptions. */
export function planOfficeActorYield({ actor, threat, threatTarget, threatRoute = [], peers, now }: Readonly<{
  actor: OfficeActorState & { readonly employeeId: string; readonly footAnchor: OfficeActorPoint }
  threat: OfficeActorState & { readonly employeeId: string; readonly footAnchor: OfficeActorPoint }
  threatTarget: OfficeActorPoint
  threatRoute?: readonly OfficeActorPoint[]
  peers: readonly OfficeActorState[]
  now: number
}>): OfficeActorYieldPlan | null {
  const from = actor.footAnchor, other = threat.footAnchor
  let dx = threatTarget.x - other.x, dy = threatTarget.y - other.y
  if (Math.hypot(dx, dy) < .01) { dx = from.x - other.x; dy = from.y - other.y }
  if (Math.hypot(dx, dy) < .01) { dx = 1; dy = 0 }
  const length = Math.hypot(dx, dy), nx = -dy / length, ny = dx / length
  const awayLength = Math.hypot(from.x - other.x, from.y - other.y)
  const awayX = awayLength ? (from.x - other.x) / awayLength : dx / length
  const awayY = awayLength ? (from.y - other.y) / awayLength : dy / length
  // Default pair clearance is 48×24 px. Match its ellipse in this direction,
  // leaving an 8 px buffer so the winner can pass the stationary side bay.
  const pairX = (actor.radiusX ?? 20) + (threat.radiusX ?? 20) + 8
  const pairY = (actor.radiusY ?? 10) + (threat.radiusY ?? 10) + 4
  const lateral = 1 / Math.hypot(nx / pairX, ny / pairY) + 8
  // A bay or a retreat only works if the winner can physically pass it. The
  // predicted 750 ms sweep is not enough: once the winner stops waiting, its
  // real body stays where it is.
  const passClearanceX = pairX + 16
  const passClearanceY = pairY + 8
  // The path check uses the bare pair ellipse, not the wider pass margin: a bay
  // only has to stay off the floor the winner must occupy, and padding that
  // footprint rejects honest bays near the winner's own goal. With no usable
  // bay the loser never yields at all, which deadlocks both of them.
  const pathClearanceX = pairX + 4
  const pathClearanceY = pairY + 2
  const preferred = actor.employeeId.localeCompare(threat.employeeId) <= 0 ? 1 : -1
  for (const multiplier of [1, 1.35, 1.7]) for (const side of [preferred, -preferred]) {
    const destination = { x: from.x + awayX * 12 + nx * lateral * multiplier * side,
      y: from.y + awayY * 12 + ny * lateral * multiplier * side }
    if (!isOfficeFootSegmentWalkable(from, destination)) continue
    if (Math.hypot((destination.x - other.x) / passClearanceX, (destination.y - other.y) / passClearanceY) < 1) continue
    if (!clearsThreatPath(destination, other, threatRoute, pathClearanceX, pathClearanceY)) continue
    if (peers.some(peer => peer.employeeId !== actor.employeeId && peer.present !== false
      && !isOfficeActorSeparationStepSafe(actor, peer, destination))) continue
    return Object.freeze({ threatEmployeeId: threat.employeeId, destination: Object.freeze(destination), releaseAfter: now + 300, issuedAt: now })
  }
  // A one-person strip between two desk banks has no lateral side bay. Back
  // out to one existing floor node, rather than retrying the same six blocked
  // offsets forever. The bounded connector is walked normally, never snapped;
  // it must clear actual furniture and every full peer footprint throughout.
  const retreats = Object.values(OFFICE_NAV_NODES).filter(destination => {
    const x = destination.x - from.x, y = destination.y - from.y
    const distance = Math.hypot(x, y)
    if (distance < lateral || distance > 260 || x * awayX + y * awayY <= 0) return false
    if (Math.hypot((destination.x - other.x) / passClearanceX, (destination.y - other.y) / passClearanceY) < 1) return false
    if (!clearsThreatPath(destination, other, threatRoute, pathClearanceX, pathClearanceY)) return false
    if (!isOfficeFootSegmentWalkable(from, destination)) return false
    if (peers.some(peer => peer.employeeId !== actor.employeeId && peer.present !== false
      && !isOfficeActorSeparationStepSafe(actor, peer, destination))) return false
    return !calculateOfficeActorSweptOverlap(actor, threat, {
      leftFrom: destination, leftTo: destination, rightFrom: other, rightTo: threatTarget,
    }).overlapping
  }).sort((left, right) => Math.hypot(left.x - from.x, left.y - from.y)
    - Math.hypot(right.x - from.x, right.y - from.y) || left.id.localeCompare(right.id))
  const retreat = retreats[0]
  if (retreat) return Object.freeze({ threatEmployeeId: threat.employeeId,
    destination: Object.freeze({ x: retreat.x, y: retreat.y }), releaseAfter: now + 300, issuedAt: now, kind: 'retreat' })
  return null
}

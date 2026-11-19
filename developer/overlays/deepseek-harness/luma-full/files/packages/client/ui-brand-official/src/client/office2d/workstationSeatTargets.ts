import { OFFICE_NAV_HEIGHT, OFFICE_NAV_WIDTH } from './navigation.ts'
import { isOfficeWorkstationId } from './workstations.ts'
import type { OfficeNormalizedRect } from './workstations.ts'
import type { OfficeWorkstationId } from './workstationSeating.ts'

/** A bindable seat area in 1672x941 world pixels. */
export interface OfficeSeatBox {
  readonly id: OfficeWorkstationId
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

/**
 * Workstation rects are normalized to the artwork; every scene widget draws in
 * world pixels. One conversion keeps the drawn border and the drop test from
 * ever disagreeing about where a seat is.
 */
export function toOfficeSeatBox(
  id: OfficeWorkstationId,
  rect: OfficeNormalizedRect,
): OfficeSeatBox {
  return Object.freeze({
    id,
    x: rect.x * OFFICE_NAV_WIDTH,
    y: rect.y * OFFICE_NAV_HEIGHT,
    width: rect.width * OFFICE_NAV_WIDTH,
    height: rect.height * OFFICE_NAV_HEIGHT,
  })
}

export function officeSeatBoxContainsPoint(
  box: OfficeSeatBox,
  point: Readonly<{ x: number; y: number }>,
): boolean {
  return point.x >= box.x && point.x <= box.x + box.width
    && point.y >= box.y && point.y <= box.y + box.height
}

/**
 * The border the user sees is the drop target: a point inside a seat box binds
 * that workstation. Overlapping boxes resolve to the smaller area and then to
 * the id, so the answer never depends on iteration or catalog order.
 */
export function findOfficeSeatDropTarget(
  boxes: readonly OfficeSeatBox[],
  point: Readonly<{ x: number; y: number }>,
): OfficeWorkstationId | null {
  let best: OfficeSeatBox | null = null
  for (const box of boxes) {
    if (!officeSeatBoxContainsPoint(box, point)) continue
    if (best === null) { best = box; continue }
    const area = box.width * box.height, bestArea = best.width * best.height
    if (area < bestArea || (area === bestArea && box.id < best.id)) best = box
  }
  return best?.id ?? null
}

/**
 * Seats another employee already holds are not seats this drag may take.
 * Unknown or missing ids are ignored rather than treated as a free seat.
 */
export function officeSeatOccupiedIds(
  bindings: readonly Readonly<{ employeeId: string; workstationId?: string | null }>[],
  draggingEmployeeId: string,
): ReadonlySet<OfficeWorkstationId> {
  const occupied = new Set<OfficeWorkstationId>()
  for (const binding of bindings) {
    if (binding.employeeId === draggingEmployeeId) continue
    const id = binding.workstationId
    if (typeof id === 'string' && isOfficeWorkstationId(id)) occupied.add(id)
  }
  return occupied
}

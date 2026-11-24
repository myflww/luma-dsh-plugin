import type { Point } from './OfficeSceneSurface.types.ts'
import {
  findOfficeSeatDropTarget,
  officeSeatOccupiedIds,
  toOfficeSeatBox,
  type OfficeSeatBox,
} from './office2d/workstationSeatTargets.ts'
import type { OfficeWorkstationId } from './office2d/workstationSeating.ts'
import {
  OFFICE_WORKSTATION_DIRECTORY
} from './office2d/workstations.ts'
/** Effective seat of one actor; an in-flight binding wins over the stored one. */
export interface OfficeActorBinding {
  readonly employeeId: string
  readonly workstationId: string | null
}

/**
 * Drawn seat borders and the drop test read the same boxes, so a highlighted
 * border is always a border the actor can actually be dropped into.
 */
export const OFFICE_SEAT_BOXES: readonly OfficeSeatBox[] = Object.freeze(
  OFFICE_WORKSTATION_DIRECTORY.map(entry => toOfficeSeatBox(entry.id, entry.rect)),
)

/** A seat somebody else holds is drawn, but is never a drop target. */
function officeSeatDropBoxes(
  bindings: readonly OfficeActorBinding[],
  draggingEmployeeId: string,
): readonly OfficeSeatBox[] {
  const occupied = officeSeatOccupiedIds(bindings, draggingEmployeeId)
  return occupied.size === 0
    ? OFFICE_SEAT_BOXES
    : OFFICE_SEAT_BOXES.filter(box => !occupied.has(box.id))
}

export function seatTargetForPosition(
  bindings: readonly OfficeActorBinding[],
  draggingEmployeeId: string,
  position: Point,
  allowReassign = false,
): OfficeWorkstationId | null {
  return findOfficeSeatDropTarget(allowReassign ? OFFICE_SEAT_BOXES : officeSeatDropBoxes(bindings, draggingEmployeeId), position)
}


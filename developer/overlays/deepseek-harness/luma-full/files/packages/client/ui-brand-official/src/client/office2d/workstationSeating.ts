import type { OfficeWorkstationId } from '../../office-workflow/shared/office-workstations.ts'
export type { OfficeWorkstationId } from '../../office-workflow/shared/office-workstations.ts'

export type OfficeSeatPoint = readonly [number, number]

const seatPoint = (x: number, y: number): OfficeSeatPoint => Object.freeze([x, y])

/** Physical cushion-contact points in the 1672 x 941 office coordinate space.
 * These are not the lower chair support/caster points used for depth sorting.
 */
export const OFFICE_WORKSTATION_SEAT_POINTS = Object.freeze({
  'north-private': seatPoint(809, 378),
  'north-center': seatPoint(927, 388),
  'west-studio': seatPoint(1039, 424),
  'south-left': seatPoint(676, 586),
  'south-focus': seatPoint(800, 588),
  'south-right': seatPoint(930, 602),
  'private-upper': seatPoint(200, 501),
  'private-lower': seatPoint(266, 704),
  reception: null,
} satisfies Readonly<Record<OfficeWorkstationId, OfficeSeatPoint | null>>)

export function getOfficeWorkstationSeatPoint(
  workstationId: OfficeWorkstationId,
): OfficeSeatPoint | null {
  return OFFICE_WORKSTATION_SEAT_POINTS[workstationId]
}

export function getSeatAnchorX({
  seatAnchorX,
  frameOffsetX,
  frameWidth,
}: Readonly<{
  seatAnchorX: number
  frameOffsetX: number
  frameWidth: number
}>): number {
  if (!Number.isFinite(frameWidth) || frameWidth <= 0) {
    throw new Error('Typing frame width must be a positive number')
  }

  return seatAnchorX - frameOffsetX / frameWidth
}

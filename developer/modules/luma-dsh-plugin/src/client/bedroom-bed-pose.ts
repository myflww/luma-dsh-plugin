import { standingFigureHeight } from '../../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/office2d/officeFigureScale.ts'
import type { Point } from './bedroom-routine.ts'

/** The painted head and shoe contacts span about four fifths of each reclining silhouette. */
export function bedroomBedContacts(room: {head:Point; feet:Point}, approach:Point) {
  const dx=room.feet[0]-room.head[0], dy=room.feet[1]-room.head[1]
  const bedLength=Math.hypot(dx,dy)
  // A pillow may sit far behind its walkable approach in the deeper rooms.
  // Keep the reclining body in the same size band as the original bedrooms.
  const floorDepth=Math.max(550,Math.min(750,approach[1]))
  const length=Math.min(bedLength,standingFigureHeight(floorDepth)*.8)
  const k=bedLength ? length/bedLength : 0
  const feet:Point=[room.head[0]+dx*k,room.head[1]+dy*k]
  return {head:room.head,feet}
}

import { OFFICE_SILHOUETTES } from './officeSilhouettes.generated.ts'

type Point = readonly [number, number]

/** An upper-body target anchored to the measured silhouette inside its padded frame. */
export function officeBodyHit(local: Point, size: Point, sourceSha: string | undefined, margin: number) {
  const measured = sourceSha && OFFICE_SILHOUETTES[sourceSha]
  const height = measured ? measured[0] : size[1] * .8
  const foot = measured ? measured[1] : size[1] * .91
  const rx = Math.min(size[0] * .36, height * .23) + margin
  const ry = height * .43 + margin
  return ((local[0] - size[0] / 2) / rx) ** 2 + ((local[1] - (foot - height * .57)) / ry) ** 2 <= 1
}

/** Both office renderers use the same silhouette size at a given floor depth. */
export function standingFigureHeight(footY: number): number {
  return 154 + (Math.max(0, Math.min(941, footY)) - 700) * .052
}

export function floorSpriteProfile(
  sourceSha: string, frameHeight: number,
  fallback: { coreHeightPx: number; anchor: { x: number; y: number } },
) {
  const measured = OFFICE_SILHOUETTES[sourceSha]
  if (!measured) return fallback
  return { coreHeightPx: measured[0], anchor: { x: fallback.anchor.x, y: measured[1] / frameHeight } }
}

/** A seated silhouette (including any integral chair) is shorter than a standing one.
 * Keep the original palm landmark on the keyboard when fitting transparent padding. */
export function seatedFigureScale(sourceSha: string, floorY: number, fallbackScale: number) {
  const measured = OFFICE_SILHOUETTES[sourceSha]
  return measured ? standingFigureHeight(floorY) * .91 / measured[0] : fallbackScale
}

export function fittedDeskPose(
  binding: { sourceSha256: string; uniformScale: number; origin: Point; anatomicalSourcePixels?: { hand: Point } },
  station: { seat: Point; keyboard?: Point },
): { scale: number; origin: Point } {
  const hand = binding.anatomicalSourcePixels?.hand
  if (!hand || !station.keyboard || !OFFICE_SILHOUETTES[binding.sourceSha256]) {
    return { scale: binding.uniformScale, origin: binding.origin }
  }
  const scale = seatedFigureScale(binding.sourceSha256, station.seat[1], binding.uniformScale)
  return { scale, origin: [station.keyboard[0] - scale * hand[0], station.keyboard[1] - scale * hand[1]] }
}

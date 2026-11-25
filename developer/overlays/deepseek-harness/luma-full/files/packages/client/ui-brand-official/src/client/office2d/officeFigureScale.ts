import { OFFICE_SILHOUETTES } from './officeSilhouettes.generated.ts'

type Point = readonly [number, number]

export function officeFigureCenter(size:Point, sourceSha:string|undefined):Point {
  const measured=sourceSha && OFFICE_SILHOUETTES[sourceSha]
  const height=measured?measured[0]:size[1]*.8
  const foot=measured?measured[1]:size[1]*.91
  return [size[0]/2,foot-height*.57]
}

/** An upper-body target anchored to the measured silhouette inside its padded frame. */
export function officeBodyHit(local: Point, size: Point, sourceSha: string | undefined, margin: number) {
  const measured = sourceSha && OFFICE_SILHOUETTES[sourceSha]
  const height = measured ? measured[0] : size[1] * .8
  const center = officeFigureCenter(size, sourceSha)
  const rx = Math.min(size[0] * .36, height * .23) + margin
  const ry = height * .43 + margin
  return ((local[0] - center[0]) / rx) ** 2 + ((local[1] - center[1]) / ry) ** 2 <= 1
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
  binding: { sourceSha256: string; uniformScale: number; origin: Point; anatomicalSourcePixels?: { hand: Point; hip?:Point } },
  station: { seat: Point; keyboard?: Point; keyboardSurface?:readonly Point[] },
): { scale: number; origin: Point } {
  const hand = binding.anatomicalSourcePixels?.hand
  if (!hand || !station.keyboard || !OFFICE_SILHOUETTES[binding.sourceSha256]) {
    return { scale: binding.uniformScale, origin: binding.origin }
  }
  const scale = seatedFigureScale(binding.sourceSha256, station.seat[1], binding.uniformScale)
  const hip = binding.anatomicalSourcePixels?.hip
  const keys = station.keyboardSurface
  let x = station.keyboard[0], y = station.keyboard[1]
  if (hip && keys && keys.length >= 3) {
    // A palm may land across the key bed. Move towards the cushion while retaining
    // a margin inside its measured key surface; never stretch or rotate the artwork.
    const idealX=station.seat[0]+scale*(hand[0]-hip[0]),idealY=station.seat[1]+scale*(hand[1]-hip[1])
    const xs=keys.map(p=>p[0]),ys=keys.map(p=>p[1])
    // A front counter can supply a separate point for a keyboard hidden by its
    // monitor. Keep that calibrated point if it is outside the visible key bed.
    const inside=x>=Math.min(...xs)&&x<=Math.max(...xs)&&y>=Math.min(...ys)&&y<=Math.max(...ys)
    const halfWidth=inside?Math.min(x-Math.min(...xs),Math.max(...xs)-x)*.76:0
    const halfHeight=inside?Math.min(y-Math.min(...ys),Math.max(...ys)-y)*.76:0
    x+=Math.max(-halfWidth,Math.min(halfWidth,idealX-x))
    y+=Math.max(-halfHeight,Math.min(halfHeight,idealY-y))
  }
  return { scale, origin: [x - scale * hand[0], y - scale * hand[1]] }
}

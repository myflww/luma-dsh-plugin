import { OFFICE_NAV_HEIGHT, OFFICE_NAV_WIDTH } from './navigation.ts'
import { OFFICE_WORKSTATION_DIRECTORY, type OfficeWorkstation } from './workstations.ts'

export interface OfficeChairForegroundLayer {
  readonly workstationId: OfficeWorkstation['id']
  /** The same world-space foot depth used by this workstation's seated actor. */
  readonly footDepth: number
  readonly zIndex: number
  readonly bounds: Readonly<{ left: number; top: number; right: number; bottom: number }>
  readonly clipPath: string
}

/**
 * Only the catalog's explicitly identified upper armrests belong in front.
 * The lower chair cutouts are independent props under the actor. Never copy
 * the whole chair over an occupant via a rectangular foreground layer.
 * Each partition is a sibling of actors, never a globally frontmost container.
 */
export function createOfficeChairForegroundLayer(
  workstation: Pick<OfficeWorkstation, 'id' | 'y' | 'chairArmrestPolygons'>,
): OfficeChairForegroundLayer | null {
  const polygons = workstation.chairArmrestPolygons
  const points = polygons.flat()
  // Reception has separate counter/actor-local occlusion, not atlas foreground.
  if (points.length === 0) return null
  if (!Number.isFinite(workstation.y) || polygons.some(polygon => polygon.length < 3)
    || points.some(([x, y]) => !Number.isFinite(x) || !Number.isFinite(y))) {
    throw new RangeError(`Invalid chair foreground geometry: ${workstation.id}`)
  }
  const bounds = Object.freeze({
    left: Math.max(0, Math.floor(Math.min(...points.map(([x]) => x))) - 1),
    top: Math.max(0, Math.floor(Math.min(...points.map(([, y]) => y))) - 1),
    right: Math.min(OFFICE_NAV_WIDTH, Math.ceil(Math.max(...points.map(([x]) => x))) + 1),
    bottom: Math.min(OFFICE_NAV_HEIGHT, Math.ceil(Math.max(...points.map(([, y]) => y))) + 1),
  })
  const footDepth = workstation.y * OFFICE_NAV_HEIGHT
  // Retraced zero-area bridges combine disjoint component contours in one
  // percentage-based evenodd clip. The space between the arms is not painted.
  const origin = points[0]!
  const contours = polygons.flatMap(polygon => [origin, ...polygon, polygon[0]!, origin])
  const clipPath = `polygon(evenodd, ${contours.map(([x, y]) =>
    `${x / OFFICE_NAV_WIDTH * 100}% ${y / OFFICE_NAV_HEIGHT * 100}%`).join(', ')})`
  return Object.freeze({
    workstationId: workstation.id,
    footDepth,
    // Ties intentionally match SeatedActor. These layers render after actors,
    // keeping armrests in front without moving anchors or lifting rear casters.
    zIndex: Math.max(1, Math.round(footDepth)),
    bounds,
    clipPath,
  })
}

export const OFFICE_CHAIR_FOREGROUND_LAYERS: readonly OfficeChairForegroundLayer[] = Object.freeze(
  OFFICE_WORKSTATION_DIRECTORY
    .map(createOfficeChairForegroundLayer)
    .filter((layer): layer is OfficeChairForegroundLayer => layer !== null),
)

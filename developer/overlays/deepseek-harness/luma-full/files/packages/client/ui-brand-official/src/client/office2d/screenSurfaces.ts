import { type OfficeScreenQuad } from './monitorScreenTypes.ts'
export { type OfficeScreenQuad } from './monitorScreenTypes.ts'
import type { OfficeWorkstationId } from './workstationSeating.ts'
import type { OfficeMonitorEdgeBulge } from './monitorScreenTypes.ts'



export interface OfficeScreenSurface {
  readonly workstationId: OfficeWorkstationId
  readonly bezelQuad: OfficeScreenQuad
  readonly quad: OfficeScreenQuad
  readonly alpha: number
  readonly renderGlow: boolean
  /** Curve midpoint displacement in world px: positive inward, negative outward. */
  readonly edgeBulge?: OfficeMonitorEdgeBulge
}

export const OFFICE_SCREEN_WORLD_SIZE = Object.freeze({ width: 1672, height: 941 })
export const OFFICE_SCREEN_FRAME_MS = 1000 / 5

const surface = (
  workstationId: OfficeWorkstationId,
  bezelQuad: OfficeScreenQuad,
  quad: OfficeScreenQuad,
  renderGlow = true,
  alpha = 0.86,
  edgeBulge: OfficeMonitorEdgeBulge = {},
): OfficeScreenSurface => Object.freeze({
  workstationId,
  bezelQuad: Object.freeze(bezelQuad),
  quad: Object.freeze(quad),
  alpha,
  renderGlow,
  edgeBulge: Object.freeze({ ...edgeBulge }),
})

/**
 * Monitor UI surfaces are scene-owned and independent of character art.
 * Inner glass and physical bezel are measured separately from the source art.
 * A dark pixel alone is not enough: a smaller shape can still sit entirely in
 * black while leaving several pixels of unused display around it.
 */
export const OFFICE_SCREEN_SURFACES = Object.freeze([
  // Correct corners first. Curved contours are supported, but flat illustrated
  // monitors do not receive an invented bulge to disguise coordinate errors.
  surface('north-private', [[772, 287.8], [837, 283], [773, 318], [837, 314]], [[775, 290], [835, 285.5], [775, 315.3], [835, 311.9]], true, .86),
  surface('north-center', [[905, 288.5], [968, 302], [905.5, 319], [967, 333]], [[908, 291], [965, 304], [908, 316.5], [964.5, 329.5]], true, .86),
  surface('west-studio', [[1029, 322.5], [1089, 344], [1029, 353], [1088, 374]], [[1031.5, 325], [1086, 345.9], [1032, 350.6], [1085, 370]], true, .86),
  // Re-measured against the metal rim (x635/y488 → x698/y480).
  // The old top-right y487.8 missed 5–6 px of glass; curvature cannot fix a wrong corner.
  surface('south-left', [[634, 488], [701, 479], [635, 519], [702, 512]], [[636, 490], [699, 482], [637, 516.5], [699, 509.5]], true, .86),
  surface('south-focus', [[766.5, 479.5], [834.5, 483], [767.5, 511.5], [834, 514.5]], [[769, 481.7], [832, 484.7], [769.5, 508.9], [832, 511.9]], true, .86),
  surface('south-right', [[904.7, 490.8], [971, 507], [905, 522], [970, 538.5]], [[907.2, 493], [968.3, 508.9], [907.5, 519.2], [967.5, 534.6]], true, .86),
  surface('private-upper', [[137, 446], [174, 428], [140.3, 467.3], [176.5, 449.7]], [[139, 447], [172.8, 431.1], [141.8, 464.5], [174.7, 448.4]], true, 0.84),
  surface('private-lower', [[199, 636], [247, 609], [201, 661], [249, 636]], [[201.3, 636.5], [245, 612.1], [204, 656.7], [246.7, 635.2]], true, 0.84, { top: -.1, bottom: .15, left: .2, right: .1 }),
  // The camera sees the rear of the reception terminal, so its front UI is never painted.
  surface('reception', [[819, 758], [861, 758], [819, 775], [861, 775]], [[824, 764], [855, 764], [824, 771], [855, 771]], false, 0.82),
])

type Point = Readonly<{ x: number; y: number }>

const pointInsideConvexQuad = (point: Point, quad: readonly Point[]): boolean => {
  const polygon = [quad[0], quad[1], quad[3], quad[2]]
  let sign = 0
  for (let index = 0; index < polygon.length; index += 1) {
    const start = polygon[index]
    const end = polygon[(index + 1) % polygon.length]
    if (!start || !end) return false
    const cross = (end.x - start.x) * (point.y - start.y) - (end.y - start.y) * (point.x - start.x)
    if (Math.abs(cross) < 1e-6) continue
    const edgeSign = Math.sign(cross)
    if (sign === 0) sign = edgeSign
    if (edgeSign !== sign) return false
  }
  return true
}

const toPoints = (quad: OfficeScreenQuad): Point[] => quad.map(([x, y]) => ({ x, y }))

export function validateOfficeScreenSurfaces(
  workstationIds: readonly OfficeWorkstationId[],
): true {
  const expectedIds = new Set<OfficeWorkstationId>(workstationIds)
  const seenIds = new Set<OfficeWorkstationId>()

  for (const entry of OFFICE_SCREEN_SURFACES) {
    if (!expectedIds.has(entry.workstationId)) {
      throw new Error(`Unknown office screen workstation: ${entry.workstationId}`)
    }
    if (seenIds.has(entry.workstationId)) {
      throw new Error(`Duplicate office screen workstation: ${entry.workstationId}`)
    }
    seenIds.add(entry.workstationId)

    const inner = toPoints(entry.quad)
    const bezel = toPoints(entry.bezelQuad)
    if (![...inner, ...bezel].every(point => (
      Number.isFinite(point.x) && Number.isFinite(point.y)
      && point.x >= 0 && point.x <= OFFICE_SCREEN_WORLD_SIZE.width
      && point.y >= 0 && point.y <= OFFICE_SCREEN_WORLD_SIZE.height
    ))) throw new Error(`Office screen ${entry.workstationId} has an invalid corner`)

    if (!inner.every(point => pointInsideConvexQuad(point, bezel))) {
      throw new Error(`Office screen ${entry.workstationId} leaves its monitor bezel`)
    }
  }

  const missing = workstationIds.filter(id => !seenIds.has(id))
  if (missing.length > 0) throw new Error(`Missing office screen surfaces: ${missing.join(', ')}`)
  return true
}

export function compileOfficeScreenSurfaces({
  officeWidth,
  officeHeight,
  officeX = 0,
}: Readonly<{ officeWidth: number; officeHeight: number; officeX?: number }>) {
  return OFFICE_SCREEN_SURFACES.map(entry => ({
    ...entry,
    bezelQuad: entry.bezelQuad.map(([x, y]) => ({
      x: officeX + x / OFFICE_SCREEN_WORLD_SIZE.width * officeWidth,
      y: y / OFFICE_SCREEN_WORLD_SIZE.height * officeHeight,
    })),
    quad: entry.quad.map(([x, y]) => ({
      x: officeX + x / OFFICE_SCREEN_WORLD_SIZE.width * officeWidth,
      y: y / OFFICE_SCREEN_WORLD_SIZE.height * officeHeight,
    })),
  }))
}

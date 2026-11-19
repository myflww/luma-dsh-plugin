import type { OfficeScreenQuad } from './monitorScreenTypes.ts'

export type OfficeMonitorProjectionPoint = readonly [number, number]
export interface OfficeMonitorProjectionCoefficients {
  readonly a: number
  readonly b: number
  readonly c: number
  readonly d: number
  readonly e: number
  readonly f: number
  readonly g: number
  readonly h: number
}

/** Shared unit-square homography; contour and flat-screen rendering use one implementation. */
export function compileOfficeMonitorProjection(quad: OfficeScreenQuad) {
  if (!Array.isArray(quad) || quad.length !== 4 || [...quad].some(point => (
    !Array.isArray(point) || point.length !== 2 || ![...point].every(Number.isFinite)
  ))) throw new RangeError('Invalid office monitor corner')
  const [tl, tr, bl, br] = quad
  const perimeter = [tl, tr, br, bl]
  let winding = 0
  for (let index = 0; index < 4; index += 1) {
    const a = perimeter[index]!, b = perimeter[(index + 1) % 4]!, c = perimeter[(index + 2) % 4]!
    const cross = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0])
    if (Math.abs(cross) < 1e-8 || (winding && Math.sign(cross) !== winding)) {
      throw new RangeError('Office monitor must be a non-degenerate convex quadrilateral')
    }
    winding = Math.sign(cross)
  }
  const dx1 = tr[0] - br[0], dx2 = bl[0] - br[0], dx3 = tl[0] - tr[0] + br[0] - bl[0]
  const dy1 = tr[1] - br[1], dy2 = bl[1] - br[1], dy3 = tl[1] - tr[1] + br[1] - bl[1]
  const denominator = dx1 * dy2 - dx2 * dy1
  if (Math.abs(denominator) < 1e-8) throw new RangeError('Invalid office monitor perspective')
  const g = (dx3 * dy2 - dx2 * dy3) / denominator
  const h = (dx1 * dy3 - dx3 * dy1) / denominator
  const a = tr[0] - tl[0] + g * tr[0], b = bl[0] - tl[0] + h * bl[0]
  const d = tr[1] - tl[1] + g * tr[1], e = bl[1] - tl[1] + h * bl[1]
  const c = tl[0], f = tl[1]
  const coefficients: OfficeMonitorProjectionCoefficients = Object.freeze({ a, b, c, d, e, f, g, h })
  const project = (u: number, v: number): OfficeMonitorProjectionPoint => {
    if (!Number.isFinite(u) || !Number.isFinite(v) || u < 0 || u > 1 || v < 0 || v > 1) {
      throw new RangeError('Office monitor content must stay inside its glass')
    }
    const divisor = g * u + h * v + 1
    if (Math.abs(divisor) < 1e-8) throw new RangeError('Invalid office monitor projection')
    return [(a * u + b * v + c) / divisor, (d * u + e * v + f) / divisor]
  }
  return Object.freeze({ project, coefficients })
}

export function createOfficeMonitorProjection(quad: OfficeScreenQuad) {
  return compileOfficeMonitorProjection(quad).project
}

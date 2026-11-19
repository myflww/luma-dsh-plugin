import { type OfficeMonitorContourPoint, type OfficeMonitorContourEdge, type OfficeMonitorEdgeBulge, type OfficeMonitorBezierEdge, type OfficeMonitorContour } from './monitorScreenTypes.ts'
export { type OfficeMonitorContourPoint, type OfficeMonitorContourEdge, type OfficeMonitorEdgeBulge, type OfficeMonitorBezierEdge, type OfficeMonitorContour } from './monitorScreenTypes.ts'
import type { OfficeScreenQuad } from './monitorScreenTypes.ts'
import { compileOfficeMonitorProjection } from './monitorScreenProjection.ts'



/** Signed midpoint displacement in world pixels: positive inward, negative outward. */




const EDGE_NAMES = ['top', 'right', 'bottom', 'left'] as const
const EPSILON = 1e-8
const freezePoint = ([x, y]: OfficeMonitorContourPoint): OfficeMonitorContourPoint => Object.freeze([x, y])
const cross = (a: OfficeMonitorContourPoint, b: OfficeMonitorContourPoint, c: OfficeMonitorContourPoint) =>
  (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
const perimeter = (quad: OfficeScreenQuad) => [quad[0], quad[1], quad[3], quad[2]] as const

function checkedQuad(input: OfficeScreenQuad): OfficeScreenQuad {
  if (!Array.isArray(input) || input.length !== 4 || [...input].some(point => (
    !Array.isArray(point) || point.length !== 2
    || ![...point].every(value => Number.isFinite(value) && Math.abs(value) <= 1e6)
  ))) throw new RangeError('Monitor contour needs four finite world-coordinate pairs')
  const polygon = perimeter(input)
  if (polygon.some((a, i) => cross(a, polygon[(i + 1) % 4]!, polygon[(i + 2) % 4]!) <= EPSILON)) {
    throw new RangeError('Monitor contour must use non-inverted convex TL/TR/BL/BR corners')
  }
  return Object.freeze(input.map(freezePoint)) as unknown as OfficeScreenQuad
}

function insideBezel(point: OfficeMonitorContourPoint, bezel: OfficeScreenQuad): boolean {
  const polygon = perimeter(bezel)
  return polygon.every((a, i) => cross(a, polygon[(i + 1) % 4]!, point) >= -EPSILON)
}

function checkedUv(u: number, v: number): void {
  if (![u, v].every(value => Number.isFinite(value) && value >= 0 && value <= 1)) {
    throw new RangeError('Monitor contour UV coordinates must stay within [0, 1]')
  }
}

/**
 * Homography plus a Coons-style interpolation of four boundary displacements.
 * The quadratic curves use the homography's own edge parameter, so zero bulge
 * is exactly the old projection, including trapezoidal perspective. Both use
 * monitorScreenProjection; there is no import of rendering or task state.
 */
export function createOfficeMonitorContour({
  quad: quadInput,
  bezelQuad: bezelInput,
  edgeBulge = {},
}: Readonly<{ quad: OfficeScreenQuad; bezelQuad: OfficeScreenQuad; edgeBulge?: OfficeMonitorEdgeBulge }>): OfficeMonitorContour {
  const quad = checkedQuad(quadInput), bezel = checkedQuad(bezelInput)
  if (!quad.every(point => insideBezel(point, bezel))) throw new RangeError('Monitor glass leaves its bezel')
  if (!edgeBulge || typeof edgeBulge !== 'object' || Array.isArray(edgeBulge)
    || ![null, Object.prototype].includes(Object.getPrototypeOf(edgeBulge))
    || Object.keys(edgeBulge).some(key => !EDGE_NAMES.includes(key as OfficeMonitorContourEdge))) {
    throw new RangeError('Unknown monitor contour edge')
  }
  const corners = perimeter(quad)
  const lengths = corners.map((start, i) => Math.hypot(corners[(i + 1) % 4]![0] - start[0], corners[(i + 1) % 4]![1] - start[1]))
  const bulges = EDGE_NAMES.map(name => edgeBulge[name] === undefined ? 0 : edgeBulge[name]!)
  const limit = Math.min(...lengths) / 8
  if (bulges.some(value => !Number.isFinite(value) || Math.abs(value) >= limit)) {
    throw new RangeError('Monitor bulge must be smaller than one eighth of its shortest edge')
  }

  const tl = quad[0]
  const { project: baseProject, coefficients: { a, b, c, d, e, f, g, h } } = compileOfficeMonitorProjection(quad)
  const weights = [1, 1 + g, 1 + g + h, 1 + h]
  const minWeight = Math.min(...weights), maxWeight = Math.max(...weights)
  if (!weights.every(Number.isFinite) || minWeight <= EPSILON) throw new RangeError('Monitor perspective crosses infinity')
  const normals = corners.map((start, i) => {
    const end = corners[(i + 1) % 4]!
    return [-(end[1] - start[1]) / lengths[i]!, (end[0] - start[0]) / lengths[i]!] as const
  })
  const curves = corners.map((start, i): OfficeMonitorBezierEdge => {
    const end = corners[(i + 1) % 4]!, normal = normals[i]!, bulge = bulges[i]!
    const control = freezePoint([(start[0] + end[0]) / 2 + 2 * bulge * normal[0], (start[1] + end[1]) / 2 + 2 * bulge * normal[1]])
    // A quadratic lies in the convex hull of its control points. Requiring
    // this hull inside the bezel is conservative, not a sparse-sample guess.
    if (!insideBezel(control, bezel)) throw new RangeError('Monitor curve control hull leaves its bezel')
    return Object.freeze({ start, control, end })
  })

  // Prove a global no-fold margin: ||D(displacement)|| < min singular value
  // of DH. The base maps onto a convex quad, so the same bound also certifies
  // injectivity (its inverse is Lipschitz on that convex quad).
  const u0 = [a - g * c, d - g * f], u1 = [a * h - g * b, d * h - g * e]
  const v0 = [b - h * c, e - h * f], v1 = [b * g - h * a, e * g - h * d]
  const maxDu = Math.max(Math.hypot(u0[0]!, u0[1]!), Math.hypot(u0[0]! + u1[0]!, u0[1]! + u1[1]!)) / minWeight ** 2
  const maxDv = Math.max(Math.hypot(v0[0]!, v0[1]!), Math.hypot(v0[0]! + v1[0]!, v0[1]! + v1[1]!)) / minWeight ** 2
  const determinant = a * (e - f * h) - b * (d - f * g) + c * (d * h - e * g)
  const baseMinimumStretch = determinant / maxWeight ** 3 / Math.hypot(maxDu, maxDv)
  const derivativeBounds = bulges.map((bulge, i) => {
    const w0 = weights[i]!, w1 = weights[(i + 1) % 4]!
    return 4 * Math.abs(bulge) * Math.max(w0 / w1, w1 / w0)
  })
  const deformationDu = Math.max(derivativeBounds[0]!, derivativeBounds[2]!) + Math.abs(bulges[1]!) + Math.abs(bulges[3]!)
  const deformationDv = Math.max(derivativeBounds[1]!, derivativeBounds[3]!) + Math.abs(bulges[0]!) + Math.abs(bulges[2]!)
  const deformationDerivativeBound = Math.hypot(deformationDu, deformationDv)
  if (!Number.isFinite(baseMinimumStretch) || baseMinimumStretch <= EPSILON
    || deformationDerivativeBound >= baseMinimumStretch * .9) {
    throw new RangeError('Monitor curvature cannot be certified free of folds')
  }

  const isFlat = bulges.every(value => value === 0)
  const project = (u: number, v: number): OfficeMonitorContourPoint => {
    checkedUv(u, v)
    const base = baseProject(u, v)
    if (isFlat) return base
    const parameters = [u, v, 1 - u, 1 - v]
    const blends = [1 - v, u, v, 1 - u]
    let x = base[0], y = base[1]
    for (let i = 0; i < 4; i += 1) {
      const t = parameters[i]!, w0 = weights[i]!, w1 = weights[(i + 1) % 4]!
      const s = t * w1 / ((1 - t) * w0 + t * w1)
      const displacement = blends[i]! * 4 * s * (1 - s) * bulges[i]!
      x += displacement * normals[i]![0]
      y += displacement * normals[i]![1]
    }
    return [x, y]
  }
  const print = ([x, y]: OfficeMonitorContourPoint) => `${x},${y}`
  return Object.freeze({
    isFlat,
    project,
    edges: Object.freeze(Object.fromEntries(EDGE_NAMES.map((name, i) => [name, curves[i]!])) as Record<OfficeMonitorContourEdge, OfficeMonitorBezierEdge>),
    clipPath: `M${print(tl)} ${curves.map(curve => `Q${print(curve.control)} ${print(curve.end)}`).join(' ')} Z`,
    safety: Object.freeze({ baseMinimumStretch, deformationDerivativeBound }),
  })
}

/** Subdivide in UV *before* projecting: four mapped vertices alone stay straight. */
export function projectOfficeMonitorContent(
  contour: OfficeMonitorContour,
  points: readonly OfficeMonitorContourPoint[],
  { closed = true, segmentsPerEdge = 8 }: Readonly<{ closed?: boolean; segmentsPerEdge?: number }> = {},
): readonly OfficeMonitorContourPoint[] {
  if (!Array.isArray(points) || points.length < (closed ? 3 : 2) || points.length > 256
    || typeof closed !== 'boolean' || !Number.isInteger(segmentsPerEdge) || segmentsPerEdge < 1 || segmentsPerEdge > 64) {
    throw new RangeError('Invalid monitor content subdivision')
  }
  for (const point of points) {
    if (!Array.isArray(point) || point.length !== 2) throw new RangeError('Invalid monitor content point')
    checkedUv(point[0], point[1])
  }
  if (contour.isFlat) return points.map(([u, v]) => contour.project(u, v))
  const output: OfficeMonitorContourPoint[] = []
  const edgeCount = closed ? points.length : points.length - 1
  for (let index = 0; index < edgeCount; index += 1) {
    const start = points[index]!, end = points[(index + 1) % points.length]!
    for (let step = 0; step < segmentsPerEdge; step += 1) {
      const t = step / segmentsPerEdge
      output.push(contour.project(start[0] + (end[0] - start[0]) * t, start[1] + (end[1] - start[1]) * t))
    }
  }
  if (!closed) {
    const last = points[points.length - 1]!
    output.push(contour.project(last[0], last[1]))
  }
  return output
}

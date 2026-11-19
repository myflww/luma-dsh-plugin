type Point = readonly [number, number]
type Polygon = readonly Point[]
export interface IndependentSceneOccluder {
  readonly id: string
  readonly coordinateSpace: 'scene-pixels'
  readonly sourceSize: Point
  readonly depthY: number
  readonly visualReviewed: true
  readonly phases: Readonly<Record<string, { readonly backgroundSha256: string; readonly polygons: readonly Polygon[] }>>
}
export interface IndependentScenePhaseSource {
  readonly sha256: string
  readonly authoredPhase?: string
}
export interface IndependentSelectedSceneOccluder {
  readonly id: string
  readonly depthY: number
  readonly polygons: readonly Polygon[]
}

const fail = (): never => { throw Error('场景前景遮挡与当前原始背景或深度不匹配，已保留原场景。') }
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const finitePoint = (v: unknown): v is Point => Array.isArray(v) && v.length === 2 && Array.from(v).every(n => typeof n === 'number' && Number.isFinite(n))
const cross = (a: Point, b: Point, c: Point): number => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
const area = (polygon: Polygon): number => polygon.reduce((sum, a, i) => {
  const b = polygon[(i + 1) % polygon.length]!
  return sum + a[0] * b[1] - b[0] * a[1]
}, 0) / 2
function onSegment(p: Point, a: Point, b: Point): boolean {
  return cross(a, b, p) === 0 && p[0] >= Math.min(a[0], b[0]) && p[0] <= Math.max(a[0], b[0])
    && p[1] >= Math.min(a[1], b[1]) && p[1] <= Math.max(a[1], b[1])
}
function intersects(a: Point, b: Point, c: Point, d: Point): boolean {
  const abC = cross(a, b, c), abD = cross(a, b, d), cdA = cross(c, d, a), cdB = cross(c, d, b)
  return ((abC > 0) !== (abD > 0) && (cdA > 0) !== (cdB > 0) && abC !== 0 && abD !== 0 && cdA !== 0 && cdB !== 0)
    || onSegment(c, a, b) || onSegment(d, a, b) || onSegment(a, c, d) || onSegment(b, c, d)
}
function validPolygon(value: unknown, size: Point): value is Polygon {
  if (!Array.isArray(value) || value.length < 3 || !Array.from(value).every(p => finitePoint(p)
    && p[0] >= 0 && p[1] >= 0 && p[0] <= size[0] && p[1] <= size[1])) return false
  // Accept a repeated closing point, as Native's triangulation cleanup does.
  const points = (value as Point[]).filter((p, i) => !i || p[0] !== value[i - 1][0] || p[1] !== value[i - 1][1])
  if (points.length > 1 && points[0]![0] === points.at(-1)![0] && points[0]![1] === points.at(-1)![1]) points.pop()
  if (points.length < 3 || Math.abs(area(points)) <= .00001) return false
  for (let i = 0; i < points.length; i++) for (let j = i + 1; j < points.length; j++) {
    if (j === i + 1 || (i === 0 && j === points.length - 1)) continue
    if (intersects(points[i]!, points[(i + 1) % points.length]!, points[j]!, points[(j + 1) % points.length]!)) return false
  }
  return true
}

/** All generated phase aliases pin the same authored original as Native. */
export function selectIndependentSceneOccluders(
  layout: { readonly size: Point; readonly sceneOccluders?: readonly IndependentSceneOccluder[] },
  phases: Readonly<Record<string, IndependentScenePhaseSource>>, phase: string,
): readonly IndependentSelectedSceneOccluder[] {
  const values = layout.sceneOccluders
  if (values === undefined) return []
  if (!Array.isArray(values) || !finitePoint(layout.size) || layout.size.some(n => n <= 0)) return fail()
  const ids = new Set<string>()
  for (const item of values) {
    if (!record(item) || typeof item.id !== 'string' || !item.id || ids.has(item.id)) return fail()
    ids.add(item.id)
    if (item.visualReviewed !== true || item.coordinateSpace !== 'scene-pixels' || !finitePoint(item.sourceSize)
      || item.sourceSize.some((n, i) => n !== layout.size[i]) || typeof item.depthY !== 'number' || !Number.isFinite(item.depthY)
      || item.depthY < 0 || item.depthY > layout.size[1] || !record(item.phases)) return fail()
    for (const [key, resource] of Object.entries(phases)) {
      const authoredPhase = resource.authoredPhase ?? key, geometry = item.phases[authoredPhase]
      if (!record(geometry) || typeof geometry.backgroundSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(geometry.backgroundSha256)
        || geometry.backgroundSha256 !== resource.sha256 || !Array.isArray(geometry.polygons) || !geometry.polygons.length
        || !Array.from(geometry.polygons).every(polygon => validPolygon(polygon, layout.size))) return fail()
    }
  }
  const resource = phases[phase]
  if (!resource) return fail()
  const key = resource.authoredPhase ?? phase
  return values.map(item => ({ id: item.id, depthY: item.depthY, polygons: item.phases[key]!.polygons }))
}

/** Include the actual silhouette boundary, just like Geometry2D hit testing. */
function contains(point: Point, polygon: Polygon): boolean {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]!, b = polygon[j]!
    if (onSegment(point, a, b)) return true
    if ((a[1] > point[1]) !== (b[1] > point[1]) && point[0] < (b[0] - a[0]) * (point[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside
  }
  return inside
}
export function independentSceneOccluderCovers(occluders: readonly IndependentSelectedSceneOccluder[], actorDepthY: number, point: Point): boolean {
  return occluders.some(item => actorDepthY < item.depthY && item.polygons.some(polygon => contains(point, polygon)))
}

/** Bound manual poses retain seat depth; only navigation/unbound uses the floor. */
export function independentSceneActorDepth(station: { readonly seat: Point } | undefined, floor: Point, navigation = false): number {
  return !navigation && station ? station.seat[1] : floor[1]
}

export type IndependentSceneDepthLayer<S, A> =
  | { readonly kind: 'station'; readonly depthY: number; readonly slot: S }
  | { readonly kind: 'actor'; readonly depthY: number; readonly actor: A }
  | { readonly kind: 'occluder'; readonly depthY: number; readonly occluder: IndependentSelectedSceneOccluder }

/** Native ties: original scene prop first, roaming actor second, seated station last. */
export function independentSceneDepthLayers<S extends { readonly seat: Point }, A extends { readonly depthY: number }>(
  stations: readonly S[], roaming: readonly A[], occluders: readonly IndependentSelectedSceneOccluder[],
): readonly IndependentSceneDepthLayer<S, A>[] {
  const layers: IndependentSceneDepthLayer<S, A>[] = [
    ...stations.map(slot => ({ kind: 'station' as const, depthY: slot.seat[1], slot })),
    ...roaming.map(actor => ({ kind: 'actor' as const, depthY: actor.depthY, actor })),
    ...occluders.map(occluder => ({ kind: 'occluder' as const, depthY: occluder.depthY, occluder })),
  ]
  const order = { occluder: -1, actor: 0, station: 1 }
  return layers.sort((a, b) => a.depthY - b.depthY || order[a.kind] - order[b.kind])
}

/** Restore original phase pixels once through the silhouette union at its real depth. */
export function paintIndependentSceneOccluder(context: CanvasRenderingContext2D, background: CanvasImageSource, occluder: IndependentSelectedSceneOccluder): void {
  context.save()
  try {
    context.beginPath()
    for (const polygon of occluder.polygons) {
      const points = area(polygon) < 0 ? [...polygon].reverse() : polygon
      points.forEach((point, i) => i ? context.lineTo(...point) : context.moveTo(...point)); context.closePath()
    }
    context.clip(); context.drawImage(background, 0, 0)
  } finally { context.restore() }
}

export type IndependentChairPoint = readonly [number, number]
export type IndependentChairPolygon = readonly IndependentChairPoint[]

/** Optional whole-person-and-chair ownership. Legacy bindings own no chair. */
export interface IndependentIntegratedChair {
  readonly kind: 'whole-person-chair'
  readonly employeeId: string
  readonly skinId: string
  readonly stationId: string
  readonly officeTheme: string
  readonly phase: string
  readonly actorSourceSha256: string
  readonly originalBackgroundSha256: string
  /** Opaque original-room repair; size is the scene canvas, region is an optional complete near tile. */
  readonly cleanPlate: Readonly<{
    browserSrc: string; sha256: string; size: IndependentChairPoint
    region?: Readonly<{ sourceSize: IndependentChairPoint; sceneRect: readonly [number, number, number, number] }>
  }>
  readonly chairRemovalPolygons: readonly IndependentChairPolygon[]
  /** Explicit independent desk/key foreground only; never the original chair. */
  readonly foregroundPolygons: readonly IndependentChairPolygon[]
}
export interface IndependentChairBinding {
  readonly employeeId: string
  readonly skinId: string
  readonly stationId: string
  readonly sourceSha256: string
  readonly browserSrc?: string
  readonly integratedChair?: IndependentIntegratedChair
}
export interface IndependentChairContext {
  readonly officeTheme: string
  readonly phase: string
  readonly backgroundSha256: string
  readonly size: IndependentChairPoint
}

function validPolygons(value: unknown, size: IndependentChairPoint, allowEmpty: boolean): boolean {
  return Array.isArray(value) && (allowEmpty || value.length > 0) && value.every(polygon =>
    Array.isArray(polygon) && polygon.length >= 3 && polygon.every(point => Array.isArray(point)
      && point.length === 2 && point.every((coordinate, axis) => Number.isFinite(coordinate)
        && coordinate >= 0 && coordinate <= size[axis]!))
    && Math.abs(polygon.reduce((area, point, index) => {
      const next = polygon[(index + 1) % polygon.length]
      return area + point[0] * next[1] - next[0] * point[1]
    }, 0)) > 0)
}

function validPlateRegion(region: unknown, size: IndependentChairPoint, polygons: readonly IndependentChairPolygon[]): boolean {
  if (region === undefined) return true
  if (!region || typeof region !== 'object') return false
  const { sourceSize, sceneRect } = region as { sourceSize?: unknown; sceneRect?: unknown }
  if (!Array.isArray(sourceSize) || sourceSize.length !== 2
    || ![...sourceSize].every(value => Number.isInteger(value) && value > 0 && value <= 8192)
    || !Array.isArray(sceneRect) || sceneRect.length !== 4 || ![...sceneRect].every(Number.isFinite)) return false
  const [x, y, width, height] = sceneRect as [number, number, number, number]
  const scaleX = width / sourceSize[0], scaleY = height / sourceSize[1]
  return x >= 0 && y >= 0 && width > 0 && height > 0 && x + width <= size[0] && y + height <= size[1]
    && Math.abs(scaleX - scaleY) <= 1e-9 * Math.max(scaleX, scaleY)
    && polygons.every(polygon => polygon.every(point => point[0] >= x && point[1] >= y
      && point[0] <= x + width && point[1] <= y + height))
}

/** An explicit integrated selection never borrows another actor/outfit/phase. */
export function independentChairForBinding(binding: IndependentChairBinding, context: IndependentChairContext): IndependentIntegratedChair | undefined {
  const chair = binding.integratedChair
  if (chair === undefined) return undefined
  if (!chair || chair.kind !== 'whole-person-chair' || chair.employeeId !== binding.employeeId
    || chair.skinId !== binding.skinId || chair.stationId !== binding.stationId
    || chair.officeTheme !== context.officeTheme || chair.phase !== context.phase
    || chair.actorSourceSha256 !== binding.sourceSha256 || chair.originalBackgroundSha256 !== context.backgroundSha256) {
    throw Error('当前角色、服装或工位的完整坐姿椅子资源不匹配。')
  }
  const plate = chair.cleanPlate
  if (!plate || typeof plate.browserSrc !== 'string' || !plate.browserSrc.startsWith('/') || plate.browserSrc.startsWith('//')
    || plate.browserSrc === binding.browserSrc
    || !/^[a-f0-9]{64}$/.test(plate.sha256) || plate.sha256 === context.backgroundSha256
    || !Array.isArray(plate.size) || plate.size.length !== 2 || plate.size.some((value, axis) => value !== context.size[axis])
    || !validPolygons(chair.chairRemovalPolygons, context.size, false)
    || !validPolygons(chair.foregroundPolygons, context.size, true)
    || !validPlateRegion(plate.region, context.size, chair.chairRemovalPolygons)) {
    throw Error('完整坐姿椅子缺少对应的场景清底或独立桌面前景。')
  }
  return chair
}

export function selectIndependentWholeBinding<T extends IndependentChairBinding & { readonly visualReviewed: boolean }>(
  bindings: readonly T[], employeeId: string, skinId: string | undefined, stationId: string | undefined,
  context?: IndependentChairContext,
): T | undefined {
  const exact = bindings.filter(binding => binding.visualReviewed && binding.employeeId === employeeId
    && binding.skinId === (skinId ?? '') && binding.stationId === stationId)
  if (skinId && !exact.length && bindings.some(binding => binding.employeeId === employeeId && binding.stationId === stationId)) {
    throw Error('所选皮肤不属于当前角色，或缺少该工位的完整坐姿资源。')
  }
  const joint = exact.filter(binding => binding.integratedChair !== undefined)
  if (!joint.length) return exact[0]
  const selected = joint.filter(binding => binding.integratedChair?.officeTheme === context?.officeTheme
    && binding.integratedChair?.phase === context?.phase)
  if (selected.length !== 1 || !context) throw Error('该角色在当前工位或光线下的完整坐姿椅子组合尚不可用。')
  independentChairForBinding(selected[0]!, context)
  return selected[0]
}

/** Reuse original room pixels for empty seats; repair only occupied chair pixels. */
export function paintIndependentChairUnderlay(
  context: Pick<CanvasRenderingContext2D, 'save' | 'restore' | 'beginPath' | 'moveTo' | 'lineTo' | 'closePath' | 'clip' | 'drawImage'>,
  plate: CanvasImageSource,
  chair: IndependentIntegratedChair,
): void {
  context.save()
  try {
    context.beginPath()
    for (const polygon of chair.chairRemovalPolygons) {
      polygon.forEach((point, index) => index ? context.lineTo(...point) : context.moveTo(...point))
      context.closePath()
    }
    context.clip()
    if (chair.cleanPlate.region) context.drawImage(plate, ...chair.cleanPlate.region.sceneRect)
    else context.drawImage(plate, 0, 0)
  } finally { context.restore() }
}

export function independentNeedsAnimation(active: boolean, reduceMotion: boolean, animatedRows: readonly boolean[], unfinishedCommand: boolean): boolean {
  return active && !reduceMotion && (unfinishedCommand || animatedRows.some(Boolean))
}

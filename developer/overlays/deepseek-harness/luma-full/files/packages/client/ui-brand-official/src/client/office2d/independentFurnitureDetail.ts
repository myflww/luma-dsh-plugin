type Point = readonly [number, number]
export interface IndependentFurnitureDetail {
  readonly kind: 'original-furniture-surface' | 'original-furniture-alpha-surface'
  readonly sourceOwnership: 'scene'
  readonly sourceVisualReviewed: true
  readonly sceneTheme: string
  readonly interactionId: string
  readonly sourceSha256: string
  readonly browserSrc: string
  readonly sourceSize: Point
  readonly sceneRect: readonly [number, number, number, number]
  readonly phases: Readonly<Record<string, { readonly backgroundSha256: string; readonly tint: readonly [number, number, number] }>>
}
type Slot = { readonly id: string; readonly foregroundPolygons: readonly (readonly Point[])[]; readonly furnitureDetail?: IndependentFurnitureDetail }
type Context = { readonly theme: string; readonly size: Point; readonly phase: string; readonly backgroundSha256: string }

export function independentFurnitureForSlot(slot: Slot, context: Context): IndependentFurnitureDetail | undefined {
  const detail = slot.furnitureDetail
  if (detail === undefined) return undefined
  const fail = () => { throw Error('椅子表面资源与当前工位不匹配，已保留原场景。') }
  if (!detail || !['original-furniture-surface', 'original-furniture-alpha-surface'].includes(detail.kind) || detail.sourceOwnership !== 'scene' || detail.sourceVisualReviewed !== true
    || detail.sceneTheme !== context.theme || detail.interactionId !== slot.id
    || !/^[a-f0-9]{64}$/.test(detail.sourceSha256) || detail.browserSrc !== `/luma-office/assets/furniture-${detail.sourceSha256.slice(0, 16)}.png`) return fail()
  const size = detail.sourceSize, rect = detail.sceneRect, light = detail.phases?.[context.phase]
  if (!Array.isArray(size) || size.length !== 2 || !size.every(n => Number.isInteger(n) && n > 0 && n <= 8192)
    || !Array.isArray(rect) || rect.length !== 4 || !rect.every(Number.isFinite) || rect[0] < 0 || rect[1] < 0 || rect[2] <= 0 || rect[3] <= 0
    || rect[0] + rect[2] > context.size[0] || rect[1] + rect[3] > context.size[1] || Math.abs(rect[2] / size[0] - rect[3] / size[1]) > 1e-9
    || !slot.foregroundPolygons.length || !slot.foregroundPolygons.every(p => p.every(([x, y]) => x >= rect[0] && x <= rect[0] + rect[2] && y >= rect[1] && y <= rect[1] + rect[3]))
    || !light || light.backgroundSha256 !== context.backgroundSha256 || !Array.isArray(light.tint) || light.tint.length !== 3
    || !light.tint.every(n => Number.isFinite(n) && n >= 0 && n <= 1)) return fail()
  return detail
}

const tintedAlphaSurfaces = new WeakMap<ImageBitmap, Map<string, OffscreenCanvas>>()
function tintedAlphaSurface(image: ImageBitmap, tint: readonly [number, number, number]): ImageBitmap | OffscreenCanvas {
  if (tint.every(value => value === 1)) return image
  let variants = tintedAlphaSurfaces.get(image)
  if (!variants) { variants = new Map(); tintedAlphaSurfaces.set(image, variants) }
  const key = tint.join(',')
  const cached = variants.get(key)
  if (cached) return cached
  const surface = new OffscreenCanvas(image.width, image.height)
  const context = surface.getContext('2d')!
  context.drawImage(image, 0, 0)
  const pixels = context.getImageData(0, 0, image.width, image.height)
  for (let i = 0; i < pixels.data.length; i += 4) {
    pixels.data[i] = Math.round(pixels.data[i]! * tint[0])
    pixels.data[i + 1] = Math.round(pixels.data[i + 1]! * tint[1])
    pixels.data[i + 2] = Math.round(pixels.data[i + 2]! * tint[2])
  }
  context.putImageData(pixels, 0, 0)
  variants.set(key, surface)
  return surface
}

/** Draw at the original furniture depth, before the whole-source near-hair pass.
 * Prepared alpha coverage retains its high-resolution edge; opaque reference
 * artwork still clips through the measured original furniture polygons. */
export function paintIndependentFurnitureDetail(context: CanvasRenderingContext2D, image: ImageBitmap, slot: Slot, phase: string): void {
  const detail = slot.furnitureDetail
  if (detail === undefined) return
  context.save()
  try {
    if (detail.kind === 'original-furniture-alpha-surface') {
      context.imageSmoothingEnabled = true; context.imageSmoothingQuality = 'high'
      context.drawImage(tintedAlphaSurface(image, detail.phases[phase]!.tint), ...detail.sceneRect)
      return
    }
    context.beginPath()
    for (const polygon of slot.foregroundPolygons) {
      // Consistent winding makes the shared surface a union, including overlaps.
      const area = polygon.reduce((sum, a, i) => { const b = polygon[(i + 1) % polygon.length]!; return sum + a[0] * b[1] - b[0] * a[1] }, 0)
      const points = area < 0 ? [...polygon].reverse() : polygon
      points.forEach((point, i) => i ? context.lineTo(...point) : context.moveTo(...point)); context.closePath()
    }
    context.clip(); context.imageSmoothingEnabled = true; context.imageSmoothingQuality = 'high'
    context.drawImage(image, ...detail.sceneRect)
    const tint = detail.phases[phase]!.tint
    if (tint.some(value => value !== 1)) {
      context.globalCompositeOperation = 'multiply'
      context.fillStyle = `rgb(${tint.map(value => value * 255).join(' ')})`
      context.fillRect(...detail.sceneRect)
    }
  } finally { context.restore() }
}

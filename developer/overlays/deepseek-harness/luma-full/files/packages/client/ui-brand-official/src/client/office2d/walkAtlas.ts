import type { OfficeFrameStrip } from './assets.ts'
import { createOfficeFrameTimeline } from './frameTimeline.ts'
import catalog from './walkAtlas.generated.json'
import { WALK_FRAME_FIT } from './walkFrameFit.generated.ts'

interface WalkAtlas {
  readonly src: string
  readonly sha256: string
  /** The cropped region in the original cell's coordinates, after sole registration. */
  readonly bounds: readonly number[]
  readonly cell: readonly number[]
  readonly columns: number
  readonly count: number
}
const atlases: Readonly<Record<string, WalkAtlas>> = catalog
const timelines = new WeakMap<OfficeFrameStrip, ReturnType<typeof createOfficeFrameTimeline>>()

export function getWalkAtlas(assetId: string) {
  return atlases[assetId]
}

/** Keep the sole on the same floor point when correcting the drawing's scale. */
export function walkAtlasBounds(atlas: WalkAtlas, rect: readonly [number, number, number, number]) {
  const fit = WALK_FRAME_FIT[atlas.sha256]
  if (!fit) return atlas.bounds
  const index = rect[0] / rect[2] + (rect[1] / rect[3]) * atlas.columns
  const scale = (fit.scale[index] ?? 1000) / 1000
  if (scale === 1) return atlas.bounds
  const [x, y, width, height] = atlas.bounds
  const [footX, footY] = fit.foot
  return [footX + (x! - footX) * scale, footY + (y! - footY) * scale, width! * scale, height! * scale] as const
}

export function sampleWalkAtlas(atlas: WalkAtlas, strip: OfficeFrameStrip, elapsedMs: number) {
  let timeline = timelines.get(strip)
  if (!timeline) { timeline = createOfficeFrameTimeline(strip); timelines.set(strip, timeline) }
  const phase = Math.max(0, elapsedMs) % timeline.cycleMs
  const exposure = timeline.exposureAt(phase, true)
  const fraction = (phase - timeline.starts[exposure]!) / timeline.durations[exposure]!
  const steps = atlas.count / timeline.order.length
  const index = exposure * steps + Math.min(steps - 1, Math.floor(fraction * steps))
  const width = atlas.cell[0]!, height = atlas.cell[1]!
  return { index, rect: [(index % atlas.columns) * width, Math.floor(index / atlas.columns) * height, width, height] as const }
}

export function drawWalkAtlas(context: CanvasRenderingContext2D, image: CanvasImageSource,
    atlas: WalkAtlas, rect: readonly [number, number, number, number], x: number, y: number, scale: number) {
  const [left, top, width, height] = walkAtlasBounds(atlas, rect)
  context.drawImage(image, ...rect, x + left! * scale, y + top! * scale, width! * scale, height! * scale)
}


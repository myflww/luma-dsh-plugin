import type { OfficeFrameStrip } from './assets.ts'
import { createOfficeFrameTimeline } from './frameTimeline.ts'
import catalog from './walkAtlas.generated.json'

interface WalkAtlas {
  readonly src: string
  readonly sha256: string
  /** The cropped region in the original cell's coordinates, after sole registration. */
  readonly bounds: readonly number[]
  readonly cell: readonly number[]
  readonly sole: number
  readonly figureHeight: number
  readonly columns: number
  readonly count: number
}
const atlases: Readonly<Record<string, WalkAtlas>> = catalog
const timelines = new WeakMap<OfficeFrameStrip, ReturnType<typeof createOfficeFrameTimeline>>()

export function getWalkAtlas(assetId: string) {
  return atlases[assetId]
}

export function sampleWalkAtlas(atlas: WalkAtlas, strip: OfficeFrameStrip, elapsedMs: number, loop = true) {
  let timeline = timelines.get(strip)
  if (!timeline) { timeline = createOfficeFrameTimeline(strip); timelines.set(strip, timeline) }
  const elapsed = Math.max(0, elapsedMs)
  const lastStart = timeline.starts[timeline.order.length - 1]!
  const phase = loop ? elapsed % timeline.cycleMs : Math.min(elapsed, lastStart)
  const exposure = timeline.exposureAt(phase, true)
  const fraction = (phase - timeline.starts[exposure]!) / timeline.durations[exposure]!
  const steps = atlas.count / timeline.order.length
  const subframe = Math.min(steps - 1, Math.floor(fraction * steps))
  const index = exposure * steps + subframe
  const nextDelayMs = !loop && elapsed >= lastStart ? null
    : timeline.starts[exposure]! + (subframe + 1) * timeline.durations[exposure]! / steps - phase
  const width = atlas.cell[0]!, height = atlas.cell[1]!
  return { index, nextDelayMs, rect: [(index % atlas.columns) * width, Math.floor(index / atlas.columns) * height, width, height] as const }
}

export function drawWalkAtlas(context: CanvasRenderingContext2D, image: CanvasImageSource,
    atlas: WalkAtlas, rect: readonly [number, number, number, number], x: number, y: number, scale: number) {
  const [left, top, width, height] = atlas.bounds
  context.drawImage(image, ...rect, x + left! * scale, y + top! * scale, width! * scale, height! * scale)
}

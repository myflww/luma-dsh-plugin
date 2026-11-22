import type { OfficeFrameStrip } from './assets.ts'

/** Retain the scene's one-second stride distance when a skin holds a slower gait. */
export function officeSkinTravelSpeed(baseSpeed: number, strip?: OfficeFrameStrip): number {
  if (!strip) return baseSpeed
  const cycleMs = (strip.frameDurationsMs ?? Array.from({ length: strip.frameOrder?.length ?? strip.frameCount }, () => 1000 / strip.fps))
    .reduce((sum, duration) => sum + duration, 0)
  return baseSpeed * 1000 / cycleMs
}

export const OFFICE_WALK_SPEED = 80
export const OFFICE_TASK_SPEED = 104
/** Ease the final stride into a chair. The integral also drives the foot frames,
 * so short and long render ticks cover the same ground at the same time. */
export function workstationArrivalStep(cruiseMs:number, tickMs:number) {
  const settlingMs=400
  const cruiseThreshold=settlingMs*.7
  if (cruiseMs-tickMs>=cruiseThreshold) return {travelMs:tickMs,usedMs:tickMs}
  // During the final 400 ms, velocity falls linearly from full pace to 40%.
  // Express remaining distance in milliseconds at full pace.
  const wallRemaining = cruiseMs>=cruiseThreshold ? cruiseMs+settlingMs*.3
    : (Math.sqrt(.16+1.2*cruiseMs/settlingMs)-.4)*settlingMs/.6
  const usedMs=Math.min(tickMs,wallRemaining)
  const wallAfter=Math.max(0,wallRemaining-usedMs)
  const cruiseAfter=wallAfter>=settlingMs ? wallAfter-settlingMs*.3 : wallAfter*(.4+.3*wallAfter/settlingMs)
  return {travelMs:Math.min(cruiseMs,Math.max(0,cruiseMs-cruiseAfter)),usedMs}
}
export type OfficeAutomaticWalkMode = 'ambient' | 'report' | 'task'

/** One pace scales travel and authored exposures together for the selected strip. */
export function officeAutomaticWalkCadence(mode: OfficeAutomaticWalkMode, strip: OfficeFrameStrip) {
  const cycleMs = createOfficeFrameTimeline(strip).cycleMs
  const playbackRate = mode === 'task' ? OFFICE_TASK_SPEED / OFFICE_WALK_SPEED : 1
  return Object.freeze({ playbackRate, travelSpeed: OFFICE_WALK_SPEED * 1000 / cycleMs * playbackRate })
}

/** Atlas cells and exposures are distinct: authored poses can be revisited or omitted. */
export function createOfficeFrameTimeline(strip: OfficeFrameStrip) {
  const order = strip.frameOrder ?? Array.from({ length: strip.frameCount }, (_, index) => index)
  const durations = strip.frameDurationsMs ?? order.map(() => 1_000 / strip.fps)
  if (!Number.isSafeInteger(strip.frameCount) || strip.frameCount < 1 || order.length < 1
    || order.length > 120 || order.some(index => !Number.isSafeInteger(index) || index < 0 || index >= strip.frameCount)
    || durations.length !== order.length || durations.some(duration => !Number.isFinite(duration) || duration <= 0)
    || !Number.isFinite(strip.fps) || strip.fps <= 0) throw new Error('Invalid office frame timeline')
  const starts = [0]
  durations.forEach(duration => starts.push(starts[starts.length - 1]! + duration))
  const cycleMs = starts[starts.length - 1]!
  const exposureAt = (elapsedMs: number, loop: boolean) => {
    const phase = loop ? Math.max(0, elapsedMs) % cycleMs : Math.min(Math.max(0, elapsedMs), cycleMs)
    for (let exposure = order.length - 1; exposure > 0; exposure -= 1) {
      if (phase >= starts[exposure]!) return exposure
    }
    return 0
  }
  return Object.freeze({
    order: Object.freeze([...order]), durations: Object.freeze([...durations]),
    starts: Object.freeze(starts), cycleMs, exposureAt,
    frameAt: (elapsedMs: number, loop: boolean) => order[exposureAt(elapsedMs, loop)]!,
    nextDelayMs: (elapsedMs: number, loop: boolean) => {
      if (!loop && elapsedMs >= cycleMs) return null
      const phase = loop ? Math.max(0, elapsedMs) % cycleMs : Math.max(0, elapsedMs)
      return starts[exposureAt(elapsedMs, loop) + 1]! - phase
    },
  })
}

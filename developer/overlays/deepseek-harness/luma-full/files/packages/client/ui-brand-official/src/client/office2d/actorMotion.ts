export type ActorMotion = 'held' | 'landing' | 'idle'

export const LANDING_MS = 400
const PICKUP_MS = 220
const IDLE_MS = 3200

/** An interrupted lift starts at the matching recovery exposure. All times use
 * the caller's animation clock, including the independent canvas's paused clock. */
export function landingStartForRelease(releasedAt: number, liftedAt: number | undefined) {
  const heldMs = Math.max(0, releasedAt - (liftedAt ?? releasedAt))
  // Pickup columns 0–1 are planted, 2–5 are caught and 6–7 are hanging.
  // Landing columns 0–1 hang, 2–5 absorb impact and 6–7 return to standing.
  const pickupColumn = Math.floor(heldMs * 8 / PICKUP_MS)
  const landingColumn = pickupColumn < 2 ? 6 : pickupColumn < 6 ? 2 : 0
  return releasedAt - landingColumn * LANDING_MS / 8
}

export function motionPhase(id: string) {
  let hash = 0
  for (const letter of id) hash = (31 * hash + letter.charCodeAt(0)) >>> 0
  return hash % IDLE_MS
}

/** A moving grip pulls the shoulders first. Measure displacement in body
 * heights so zoom and the size of the current room do not change the reaction. */
export function sampleGripLag(previous: { x: number; time: number; lag: number } | undefined,
    x: number, time: number, bodyHeight: number) {
  if (!previous || time < previous.time) return { x, time, lag: 0 }
  const decay = Math.exp(-Math.max(0, time - previous.time) / 165)
  const lag = previous.lag * decay - (x - previous.x) / Math.max(1, bodyHeight)
  return { x, time, lag: Math.min(.85, Math.max(-.85, lag)) }
}

/** Pickup and landing run on time. Suspended drawings respond to the grip's
 * displacement and stay on the relaxed posture once it stops. */
export function actorMotionFrame(motion: ActorMotion, elapsed: number, phase: number, lag: number | undefined,
    still: boolean, idleDurations: readonly number[]) {
  const time = Math.max(0, elapsed)
  if (still) return motion === 'held' ? 16 : 0
  if (motion === 'landing' && time < LANDING_MS) return 40 + Math.floor(time * 8 / LANDING_MS)
  if (motion === 'held') {
    if (time < PICKUP_MS) return 8 + Math.floor(time * 8 / PICKUP_MS)
    const deflection = lag ?? 0
    if (Math.abs(deflection) < .095) return 16
    const row = deflection < 0 ? 3 : 4
    const intensity = Math.min(7,Math.round((Math.abs(deflection)-.095)*10))
    return row*8+intensity
  }
  const idleTime = time - (motion === 'landing' ? LANDING_MS : 0)
  let beat = (idleTime + phase) % idleDurations.reduce((total,ms) => total + ms,0)
  for (let i=0; i<idleDurations.length; i++) {
    if (beat < idleDurations[i]!) return i
    beat -= idleDurations[i]!
  }
  return 0
}

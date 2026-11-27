export type ActorMotion = 'held' | 'landing' | 'idle'

export const LANDING_MS = 400
const PICKUP_MS = 220
// Briefly hold the neutral pose on arrival. Each actor begins breathing on a different beat.
const MAX_IDLE_DELAY_MS = 811

/** An interrupted lift starts at the matching recovery exposure. All times use
 * the caller's animation clock, including the independent canvas's paused clock. */
export function landingStartForRelease(releasedAt: number, liftedAt: number | undefined) {
  const heldMs = Math.max(0, releasedAt - (liftedAt ?? releasedAt))
  // A quick tap that never got her feet clear only needs the last recovery
  // drawing. A partially lifted character goes directly into foot contact.
  const pickupColumn = Math.floor(heldMs * 8 / PICKUP_MS)
  const landingColumn = pickupColumn < 2 ? 6 : pickupColumn < 6 ? 2 : 0
  return releasedAt - landingColumn * LANDING_MS / 8
}

export function motionPhase(id: string) {
  let hash = 0
  for (const letter of id) hash = (31 * hash + letter.charCodeAt(0)) >>> 0
  return hash % MAX_IDLE_DELAY_MS
}

export interface GripLag {
  x: number; y: number; time: number; inputAt: number
  driveX: number; driveY: number; vx: number; vy: number; horizontal: number; vertical: number
}
const clamp = (value: number, limit: number) => Math.max(-limit,Math.min(limit,value))

/** The pointer leads the shoulders. The sleeves, hair and shoes lag on two
 * damped axes. Scene and native coordinates are normalized by drawn height. */
export function sampleGripLag(previous: GripLag | undefined, x: number, y: number, time: number, bodyHeight: number): GripLag {
  if (!previous || time < previous.time || time-previous.time>450)
    return {x,y,time,inputAt:time,driveX:0,driveY:0,vx:0,vy:0,horizontal:0,vertical:0}
  const state={...previous,x,y,time}
  if (x!==previous.x || y!==previous.y) {
    const dt=Math.max(8,Math.min(100,time-previous.inputAt))
    const scale=1000/(Math.max(1,bodyHeight)*dt)
    const blend=1-Math.exp(-dt/23)
    state.driveX+=(clamp((x-previous.x)*scale,2.6)-state.driveX)*blend
    state.driveY+=(clamp((y-previous.y)*scale,2.6)-state.driveY)*blend
    state.inputAt=time
  }
  for(let ms=previous.time;ms<time;) {
    const next=Math.min(time,ms+8),dt=(next-ms)/1000
    const decay=Math.exp(-Math.max(0,next-state.inputAt-24)/65)
    const tx=clamp(state.driveX*.75,1)*decay,ty=clamp(state.driveY*.66,1)*decay
    state.vx+=(145*(tx-state.horizontal)-13*state.vx)*dt
    state.vy+=(185*(ty-state.vertical)-16*state.vy)*dt
    state.horizontal=clamp(state.horizontal+state.vx*dt,1.05)
    state.vertical=clamp(state.vertical+state.vy*dt,1.05)
    ms=next
  }
  return state
}

function suspendedPose(x: number,y: number) {
  const ax=Math.abs(x),ay=Math.abs(y),strength=Math.max(ax,ay)
  if(strength<.105) return 16
  if(Math.min(ax,ay)>.18 && Math.min(ax,ay)>.48*strength)
    return (x>0?24:32)+(y<0?4:6)+(strength>=.62?1:0)
  if(ay>ax) return y<0?17+Math.min(2,Math.floor(ay*3)):20+Math.min(3,Math.floor(ay*4))
  return (x>0?24:32)+Math.min(3,Math.floor(ax*4))
}

/** Pickup and landing run on time. Suspended drawings respond to the grip's
 * displacement and stay on the relaxed posture once it stops. */
export function actorMotionFrame(motion: ActorMotion, elapsed: number, phase: number, lag: GripLag | undefined,
    still: boolean, idleDurations: readonly number[], releasedPose?: number) {
  const time = Math.max(0, elapsed)
  if (still) return motion === 'held' ? 16 : 0
  if (motion === 'landing' && time < LANDING_MS) {
    if(time<LANDING_MS/8 && releasedPose!==undefined && releasedPose>=16 && releasedPose<40) return releasedPose
    return 40 + Math.floor(time * 8 / LANDING_MS)
  }
  if (motion === 'held') {
    if (time < PICKUP_MS) return 8 + Math.floor(time * 8 / PICKUP_MS)
    return suspendedPose(lag?.horizontal ?? 0,lag?.vertical ?? 0)
  }
  const idleTime = time - (motion === 'landing' ? LANDING_MS : 0)
  let beat = Math.max(0, idleTime - phase) % idleDurations.reduce((total,ms) => total + ms,0)
  for (let i=0; i<idleDurations.length; i++) {
    // The original six rows keep their pickup, suspension and landing indices.
    if (beat < idleDurations[i]!) return i < 8 ? i : i + 40
    beat -= idleDurations[i]!
  }
  return 0
}

/** Times are milliseconds, translations are fractions of body height. The foot
 * is the origin. Horizontal counter-travel keeps the shoulders near the grip. */
type Key = readonly [time: number, lift: number, angle: number, width: number, height: number]
const idle: Key[] = [[0,0,0,1,1],[1200,0,-.65,1,1.007],[2060,0,-.35,1,1.003],[2940,0,.48,1,1],[4100,0,0,1,1]]
const pickup: Key[] = [[0,0,0,1,1],[80,.055,-2,.99,1.035],[190,.135,5,.976,1.026],[300,.112,3,.99,1.014]]
const dangle: Key[] = [[0,.112,3,.99,1.014],[580,.098,-3.4,1,1.009],[1090,.112,3,.99,1.014]]
const land: Key[] = [[0,.108,2,.99,1.02],[90,.062,1,.986,1.032],[155,0,0,1.044,.952],[226,0,-.6,1.017,.982],[324,.012,.4,.993,1.009],[442,0,0,1,1]]
export const LANDING_MS = land[land.length - 1]![0]
export type ActorMotion = 'held' | 'landing' | 'idle'

function track(keys: Key[], elapsed: number) {
  let i=1
  while (i<keys.length-1 && elapsed>keys[i]![0]) i++
  const a=keys[i-1]!, b=keys[i]!
  const t=Math.max(0,Math.min(1,(elapsed-a[0])/(b[0]-a[0])))
  const ease=t*t*(3-2*t)
  const mix=(index:1|2|3|4)=>a[index]+(b[index]-a[index])*ease
  return {lift:mix(1), angle:mix(2), sx:mix(3), sy:mix(4)}
}

export function motionPhase(id:string) {
  let hash=0
  for(const letter of id) hash=(31*hash+letter.charCodeAt(0))>>>0
  return hash%4100
}

export function actorPose(motion:ActorMotion, elapsed:number, phase=0) {
  const time=Math.max(0,elapsed)
  const pose=motion==='held' ? time<300 ? track(pickup,time) : track(dangle,(time-300)%1090)
    : motion==='landing' ? track(land,time) : track(idle,(time+phase)%4100)
  const radians=pose.angle*Math.PI/180
  return {...pose,radians, x:motion==='held' ? -.72*Math.sin(radians) : 0}
}

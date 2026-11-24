export type ScenePoint = readonly [number, number]
export type DesktopPetDrop = (id: string, point?: {screenX:number;screenY:number}) => void

/** Captured pointers can report positions on other monitors, including negative desktop coordinates. */
export function desktopDropPoint(event: {clientX:number;clientY:number;screenX?:number;screenY?:number}, view: Window = window) {
  if (event.clientX >= 0 && event.clientX < view.innerWidth && event.clientY >= 0 && event.clientY < view.innerHeight) return undefined
  const screenX=event.screenX ?? view.screenX+event.clientX, screenY=event.screenY ?? view.screenY+event.clientY
  if (view.outerWidth > 0 && view.outerHeight > 0 && screenX >= view.screenX && screenX < view.screenX+view.outerWidth && screenY >= view.screenY && screenY < view.screenY+view.outerHeight) return undefined
  return {screenX,screenY}
}

export function nearestFloorPoint(target:ScenePoint, segments:readonly (readonly [ScenePoint, ScenePoint])[]): ScenePoint | undefined {
  let best:ScenePoint | undefined, distance=Infinity
  for (const [a,b] of segments) {
    const dx=b[0]-a[0], dy=b[1]-a[1]
    const f=Math.max(0,Math.min(1,((target[0]-a[0])*dx+(target[1]-a[1])*dy)/(dx*dx+dy*dy || 1)))
    const point:ScenePoint=[a[0]+dx*f,a[1]+dy*f]
    const d=Math.hypot(target[0]-point[0],target[1]-point[1])
    if (d<distance) { best=point; distance=d }
  }
  return best
}

/** Keep a second dropped companion beside the first, on the same walkable floor. */
export function uncrowdedFloorPoint(request:ScenePoint, peers:readonly ScenePoint[], project:(point:ScenePoint)=>ScenePoint|undefined) {
  const origin=project(request)
  if (!origin) return undefined
  const clear=(p:ScenePoint)=>peers.every(other=>Math.hypot(other[0]-p[0],other[1]-p[1])>=36)
  if(clear(origin)) return origin
  let nearest:ScenePoint|undefined, distance=Infinity
  for (const radius of [42,74,112]) {
    for(let direction=0;direction<12;direction++) {
      const angle=direction*Math.PI/6
      const p=project([origin[0]+radius*Math.cos(angle),origin[1]+radius*Math.sin(angle)])
      if(!p || !clear(p)) continue
      const d=Math.hypot(p[0]-request[0],p[1]-request[1])
      if(d<distance){nearest=p;distance=d}
    }
    if(nearest) return nearest
  }
  return undefined
}

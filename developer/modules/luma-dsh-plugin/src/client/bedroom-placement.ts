import type { OfficeWalkDirection } from '../../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/office2d/employeeCatalog.ts'
import { BEDROOM_FLOORS, bedroomFootAt, bedroomStepAt, type BedroomRoutine, type Point } from './bedroom-routine.ts'
import { bedroomFloorRoute, floorDistance, floorMix, placeOnBedroomFloor, type BedroomRoom } from './bedroom-floor.ts'

const walkSpeed=.095
function routeLength(points:readonly Point[]) {
  return points.slice(1).reduce((length,point,i)=>length+floorDistance(points[i]!,point),0)
}
export function bedroomDropJourney(room:BedroomRoom, requested:Point, routine:BedroomRoutine, now:number, holdMs=8500) {
  const floor=BEDROOM_FLOORS[room], center=floor.center
  const origin=placeOnBedroomFloor(room,requested)
  const holdUntil=now+holdMs
  const approach=bedroomFloorRoute(room,origin,center)
  const approachLength=routeLength(approach)
  const centerAt=holdUntil+approachLength/walkSpeed
  // Let the original clock run during placement. The target may have left the
  // computer by the time the employee reaches the center aisle.
  const aim=(time:number)=>bedroomFootAt(bedroomStepAt(routine,time),time)
  let lo=centerAt, hi=centerAt+Math.max(...Object.values(floor).map(stop=>routeLength(bedroomFloorRoute(room,center,stop))))/walkSpeed+1500
  for(let i=0;i<22;i++) {
    const mid=(lo+hi)/2
    if ((mid-centerAt)*walkSpeed<routeLength(bedroomFloorRoute(room,center,aim(mid)))) lo=mid
    else hi=mid
  }
  const end=hi,target=aim(end),returning=bedroomFloorRoute(room,center,target)
  return {origin,center,target,holdUntil,centerAt,end,approach,approachLength,returning}
}

export function bedroomDropFrame(trip:ReturnType<typeof bedroomDropJourney>,now:number) {
  const second=now>=trip.centerAt
  const points=second?trip.returning:trip.approach
  const start=second?trip.centerAt:trip.holdUntil
  const elapsed=Math.max(0,now-start)
  let remaining=elapsed*walkSpeed, point=points[0]!
  let facing:OfficeWalkDirection='down', travelled=0
  for(let i=1;i<points.length;i++){
    const a=points[i-1]!,b=points[i]!,length=floorDistance(a,b)
    if(length<1e-7) continue
    const dx=b[0]-a[0],dy=b[1]-a[1]
    facing=Math.abs(dx)>Math.abs(dy)?dx<0?'left':'right':dy<0?'up':'down'
    const amount=Math.min(remaining,length)
    point=amount>=length?b:floorMix(a,b,amount/length)
    travelled+=amount; remaining-=amount
    if(remaining<=0) break
  }
  return {point,facing,elapsed,distance:(second?trip.approachLength:0)+travelled,moving:now>=trip.holdUntil && now<trip.end}
}

import { independentFloorRoute, type IndependentArrivalState, type IndependentFloorGraph } from './independentTaskArrival.ts'
import type { BrowserIndependentFloorGraph } from './browserOfficeNavigation.ts'
import { floorPauseRange, type OfficeTimePolicy } from './timePolicy.ts'
import type { SceneCommand } from '../office-harness/SceneProtocol.ts'
import { dailyWalkTarget, faceNextStop, officeDailyRoutine } from './officeDailyRoutine.ts'
import { personalSpaceStep, walkingHeading, yieldsAtOfficeCrossing } from './officePathCrossing.ts'

export type IndependentAmbientState = { ordinal: number; nextAt: number; travelling: boolean; wasTask: boolean; policyMode?: OfficeTimePolicy['autonomy']['mode'] }
const seed = (value: string) => { let h=2166136261; for (const c of value) h=Math.imul(h^c.charCodeAt(0),16777619); return h>>>0 }
const delay = (id:string, ordinal:number, p:OfficeTimePolicy) => { const range=p.autonomy.roamIntervalMs??[12000,32000]; return range[0]+seed(id+':'+ordinal)%(range[1]-range[0]+1) }
export function initialIndependentAmbient(employeeId:string, now=0, initiallyAtDesk=false, policy?:OfficeTimePolicy): IndependentAmbientState {
  const firstInterval = initiallyAtDesk && policy ? officeDailyRoutine(employeeId)?.firstBreak ?? delay(employeeId, 0, policy) : 1200 + seed(employeeId) % 6000
  return { ordinal:0, nextAt:now+firstInterval, travelling:false, wasTask:false }
}

/** Scene-only wandering never creates a task command or emits task readiness. */
export function advanceIndependentAmbient(previous:IndependentAmbientState, actor:IndependentArrivalState, input:{ employeeId:string; graph:IndependentFloorGraph; now:number; policy:OfficeTimePolicy; boundStationId?:string; ambientDesk?:boolean; command?:SceneCommand; active:boolean; reduceMotion:boolean; manual:boolean; otherFootpoints?:readonly (readonly [number,number])[]; occupiedTargets?:readonly (readonly [number,number])[] }): { ambient:IndependentAmbientState; actor:IndependentArrivalState } {
  let ambient={...previous}
  const task = input.command?.type==='start-task' || actor.mode==='approaching' || actor.mode==='seat-pending' || actor.mode==='leaving' || actor.mode==='report'
  if(task) return { ambient:{...ambient,wasTask:true,travelling:false},actor }
  // A real binding may reclaim our practice seat while this actor is still en route.
  const lostSeat = actor.mode === 'returning' ? actor.ambientStationId : actor.mode === 'seated' ? actor.seatedStationId : undefined
  if (lostSeat && lostSeat !== input.boundStationId && !input.command) {
    const exit = actor.seatedStationId ? input.graph.nodes[input.graph.targets[lostSeat]!.exitNode] : undefined
    actor = { ...actor, mode:'floor', route:[], waypointIndex:0, seatedStationId:undefined, ambientStationId:undefined,
      ...(exit ? {position:exit.point, bodyCoreHeightPx:exit.bodyCoreHeightPx} : {}) }
    ambient = initialIndependentAmbient(input.employeeId, input.now)
  }
  if(!input.active || input.reduceMotion || input.manual || !input.policy.charactersPresent || !input.policy.autonomy.allowRoaming || actor.failure) return {ambient,actor}
  if (ambient.policyMode && ambient.policyMode !== input.policy.autonomy.mode) {
    ambient = { ...ambient, nextAt: input.now + 1200 + seed(input.employeeId) % 3000 }
  }
  ambient.policyMode = input.policy.autonomy.mode
  if(ambient.wasTask) { ambient={...ambient,wasTask:false,nextAt:input.now+1500+seed(input.employeeId)%3000} }
  const moving=actor.mode==='roaming'||actor.mode==='returning'
  if(moving) return {ambient:{...ambient,travelling:true},actor}
  if (ambient.travelling) {
    // After a stroll, look towards a nearby colleague for the duration of the pause.
    let nearestDistance = 210
    let direction = actor.direction
    if (actor.mode === 'floor') for (const point of input.otherFootpoints ?? []) {
      const dx = point[0] - actor.position[0], dy = point[1] - actor.position[1]
      const distance = Math.hypot(dx, dy)
      if (distance < 28 || distance >= nearestDistance) continue
      nearestDistance = distance
      direction = Math.abs(dx) > Math.abs(dy) ? dx > 0 ? 'right' : 'left' : dy > 0 ? 'down' : 'up'
    }
    const returningToDesk = actor.mode === 'floor' && input.boundStationId && input.policy.autonomy.preferBoundWorkstation
    const [min,max]=floorPauseRange(input.policy)
    const pause = actor.mode==='seated' ? delay(input.employeeId,ambient.ordinal,input.policy)
      : returningToDesk ? officeDailyRoutine(input.employeeId)?.pause ?? 2500 : min+seed(input.employeeId+':pause:'+ambient.ordinal)%(max-min+1)
    return { ambient:{...ambient,travelling:false,nextAt:input.now+pause}, actor:{...actor,direction} }
  }
  if(input.now<ambient.nextAt) {
    const target=actor.mode==='floor' && ambient.ordinal>0 && input.boundStationId && (input.ambientDesk || input.policy.autonomy.preferBoundWorkstation)
      ? input.graph.targets[input.boundStationId] : undefined
    const point=target && input.graph.nodes[target.approachNode]?.point
    if(point && ambient.nextAt-input.now<1100){
      const direction=faceNextStop(actor.position[0],actor.position[1],point[0],point[1])
      if(direction!==actor.direction) return {ambient,actor:{...actor,direction}}
    }
    return {ambient,actor}
  }
  const g=input.graph as BrowserIndependentFloorGraph
  const targetSeat=(input.ambientDesk||input.policy.autonomy.preferBoundWorkstation)&&input.boundStationId&&actor.seatedStationId!==input.boundStationId?input.boundStationId:undefined
  const candidates=(g.ambientNodes??Object.keys(g.nodes).filter(id=>!id.startsWith('seat-'))).filter(id=>Math.hypot(g.nodes[id]!.point[0]-actor.position[0],g.nodes[id]!.point[1]-actor.position[1])>80
    && !input.occupiedTargets?.some(point=>Math.hypot(point[0]-g.nodes[id]!.point[0],point[1]-g.nodes[id]!.point[1])<55))
  const nearby=candidates.filter(id=>Math.hypot(g.nodes[id]!.point[0]-actor.position[0],g.nodes[id]!.point[1]-actor.position[1])<380)
  const choices=nearby.length && ambient.ordinal%4!==3 ? nearby : candidates
  const goal=targetSeat?g.targets[targetSeat]?.approachNode:dailyWalkTarget(input.employeeId,ambient.ordinal,choices,id=>g.nodes[id]!.point,seed(input.employeeId+':roam:'+ambient.ordinal))
  if(!goal) return {ambient:{...ambient,nextAt:input.now+3000},actor}
  let next={...actor}
  if(next.seatedStationId) { const exit=g.nodes[g.targets[next.seatedStationId]!.exitNode]!; next={...next,position:exit.point,bodyCoreHeightPx:exit.bodyCoreHeightPx,seatedStationId:undefined} }
  try {
    const route=independentFloorRoute(g,next.position,goal)
    return {ambient:{...ambient,ordinal:ambient.ordinal+1,nextAt:Infinity,travelling:true,wasTask:false},actor:{...next,routeStart:next.position,route,waypointIndex:0,mode:targetSeat?'returning':'roaming',ambientStationId:targetSeat,command:undefined,walkElapsedMs:0,owned:true}}
  } catch { return {ambient:{...ambient,nextAt:input.now+3000},actor} }
}

/** Yield at converging junctions and keep a following gap. Opposing edges have half-lanes. */
export function independentTrafficMayAdvance(id:string, actor:IndependentArrivalState, peers:readonly {id:string;actor:IndependentArrivalState}[]):boolean {
  const target=actor.route[actor.waypointIndex]
  if(!target)return true
  const self = { id, from:actor.position, to:target.point, working:actor.mode==='approaching'||actor.mode==='leaving' }
  for(const peer of peers){
    if(peer.id===id||!['approaching','leaving','roaming','returning'].includes(peer.actor.mode))continue
    const other=peer.actor.route[peer.actor.waypointIndex];if(!other)continue
    if (yieldsAtOfficeCrossing(self,{id:peer.id,from:peer.actor.position,to:other.point,
      working:peer.actor.mode==='approaching'||peer.actor.mode==='leaving'})) return false
  }
  return true
}

type FloorPoint = readonly [number, number]
function rightNormal(from:FloorPoint, to:FloorPoint):FloorPoint {
  const dx=to[0]-from[0], dy=to[1]-from[1], length=Math.hypot(dx,dy)
  return length > .01 ? [-dy/length,dx/length] : [0,0]
}

/** Turn continuously on the right-hand lane. Only actual starts and stops merge with the center. */
function laneFootpoint(actor:IndependentArrivalState):FloorPoint {
  if(!['approaching','leaving','roaming','returning'].includes(actor.mode)) return actor.position
  const i=actor.waypointIndex, target=actor.route[i]?.point
  if(!target) return actor.position
  const from=actor.route[i-1]?.point??actor.routeStart??actor.position
  const length=Math.hypot(target[0]-from[0],target[1]-from[1])
  if(length<.01)return actor.position
  const left=Math.hypot(target[0]-actor.position[0],target[1]-actor.position[1])
  const blendLength=Math.min(30,length/2), normal=rightNormal(from,target)
  const previous=i===0?undefined:actor.route[i-2]?.point??actor.routeStart
  const following=actor.route[i+1]?.point
  const entry=previous?rightNormal(previous,from):[0,0]
  const exit=following?rightNormal(target,following):[0,0]
  const entryWeight=Math.max(0,1-(length-left)/blendLength)*(previous ? .5 : 1)
  const exitWeight=Math.max(0,1-left/blendLength)*(following ? .5 : 1)
  const middle=1-entryWeight-exitWeight
  return [actor.position[0]+10*(normal[0]*middle+entry[0]!*entryWeight+exit[0]!*exitWeight),
    actor.position[1]+10*(normal[1]*middle+entry[1]!*entryWeight+exit[1]!*exitWeight)]
}

export function independentFloorLanePosition(actor:IndependentArrivalState, graph:IndependentFloorGraph,
  crowd?:{id:string;peers:readonly {id:string;actor:IndependentArrivalState}[]}):FloorPoint {
  const foot=laneFootpoint(actor)
  const waypoint=actor.route[actor.waypointIndex]
  if(!crowd || !waypoint)return foot
  // Neighbouring desk approaches can run closer together than two nominal lanes.
  // Share the small remaining foot clearance; static seated artwork stays anchored.
  let closest=22, candidate=foot
  for(const peer of crowd.peers){
    if(peer.id===crowd.id || peer.actor.seatedStationId || Math.hypot(peer.actor.position[0]-foot[0],peer.actor.position[1]-foot[1])>44)continue
    const other=laneFootpoint(peer.actor),gap=Math.hypot(foot[0]-other[0],foot[1]-other[1])
    if(gap>=closest)continue
    closest=gap
    const next=peer.actor.route[peer.actor.waypointIndex]
    candidate=personalSpaceStep(crowd.id,foot,walkingHeading(actor.position,waypoint.point),{
      id:peer.id,foot:other,...(next?{heading:walkingHeading(peer.actor.position,next.point)}:{})})
  }
  if(closest===22)return foot
  const ox=candidate[0]-actor.position[0],oy=candidate[1]-actor.position[1]
  const fit=Math.min(1,16/Math.hypot(ox,oy))
  return [Math.max(0,Math.min(graph.sourceSize[0],actor.position[0]+ox*fit)),
    Math.max(0,Math.min(graph.sourceSize[1],actor.position[1]+oy*fit))]
}

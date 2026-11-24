import { independentFloorRoute, type IndependentArrivalState, type IndependentFloorGraph } from './independentTaskArrival.ts'
import type { BrowserIndependentFloorGraph } from './browserOfficeNavigation.ts'
import { floorPauseRange, type OfficeTimePolicy } from './timePolicy.ts'
import type { SceneCommand } from '../office-harness/SceneProtocol.ts'
import { dailyWalkTarget, faceNextStop, officeDailyRoutine } from './officeDailyRoutine.ts'

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
    return {ambient:{...ambient,ordinal:ambient.ordinal+1,nextAt:Infinity,travelling:true,wasTask:false},actor:{...next,route,waypointIndex:0,mode:targetSeat?'returning':'roaming',ambientStationId:targetSeat,command:undefined,walkElapsedMs:0,owned:true}}
  } catch { return {ambient:{...ambient,nextAt:input.now+3000},actor} }
}

/** Yield at converging junctions and keep a following gap. Opposing edges have half-lanes. */
export function independentTrafficMayAdvance(id:string, actor:IndependentArrivalState, peers:readonly {id:string;actor:IndependentArrivalState}[]):boolean {
  const target=actor.route[actor.waypointIndex]
  if(!target)return true
  const distance=Math.hypot(target.point[0]-actor.position[0],target.point[1]-actor.position[1])
  for(const peer of peers){
    if(peer.id===id||!['approaching','leaving','roaming','returning'].includes(peer.actor.mode))continue
    const other=peer.actor.route[peer.actor.waypointIndex];if(!other)continue
    const otherDistance=Math.hypot(other.point[0]-peer.actor.position[0],other.point[1]-peer.actor.position[1])
    if(target.id===other.id){
      const separation=Math.hypot(actor.position[0]-peer.actor.position[0],actor.position[1]-peer.actor.position[1])
      // The closer actor proceeds; exact ties are resolved by stable employee identity.
      if((distance<65&&otherDistance<65||separation<28)&& (otherDistance<distance-.1||Math.abs(otherDistance-distance)<=.1&&peer.id<id))return false
    }
  }
  return true
}

/** Opposing walkers use opposite half-lanes, easing to the center at junctions. */
export function independentFloorLanePosition(actor:IndependentArrivalState, graph:IndependentFloorGraph):readonly[number,number] {
  if(!['approaching','leaving','roaming','returning'].includes(actor.mode)) return actor.position
  const target=actor.route[actor.waypointIndex], prior=actor.waypointIndex>0?actor.route[actor.waypointIndex-1]:undefined
  if(!target) return actor.position
  const from=prior?.point??actor.position, dx=target.point[0]-from[0],dy=target.point[1]-from[1],length=Math.hypot(dx,dy)
  if(length<1)return actor.position
  const nearest=Math.min(...Object.values(graph.nodes).map(n=>Math.hypot(n.point[0]-actor.position[0],n.point[1]-actor.position[1])))
  const offset=Math.min(10,nearest*.25)
  return [actor.position[0]-dy/length*offset,actor.position[1]+dx/length*offset]
}

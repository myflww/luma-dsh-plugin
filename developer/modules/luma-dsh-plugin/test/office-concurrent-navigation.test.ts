// @vitest-environment node
import { expect, it } from 'vitest'
import { BROWSER_OFFICE_FLOOR_PLANS, withBrowserOfficeNavigation, type BrowserIndependentFloorGraph } from '../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/office2d/browserOfficeNavigation.ts'
import { createIndependentArrivalState, advanceIndependentTaskArrival, independentFloorRoute, markIndependentArrivalPainted, validateIndependentFloorGraph } from '../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/office2d/independentTaskArrival.ts'
import { advanceIndependentAmbient, independentFloorLanePosition, independentTrafficMayAdvance, initialIndependentAmbient } from '../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/office2d/independentAmbient.ts'
import { initialRuntime, officeLaneRoute, advanceOfficeActorTrafficFrame, prepareActorRuntime } from '../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/officeSceneActorRuntime.ts'
import { sampleDeskRhythm } from '../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/office2d/deskRhythm.ts'
import { isOfficeFootSegmentWalkable, findWorkstationRouteFromPoint } from '../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/office2d/navigation.ts'
import { createOfficeAutonomyState, advanceOfficeAutonomyController } from '../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/office2d/autonomyController.ts'
import { createOfficeTimePolicy } from '../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/office2d/timePolicy.ts'
import { SPACE as whale } from '../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/office2d/independent-spaces/office-jingyuniang-v1.ts'
import { SPACE as claude } from '../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/office2d/independent-spaces/office-claude-v1.ts'
import { SPACE as dragon } from '../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/office2d/independent-spaces/office-longmama-v1.ts'
import { SPACE as gemini } from '../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/office2d/independent-spaces/office-gemini-v1.ts'
import { SPACE as grok } from '../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/office2d/independent-spaces/office-grok-v1.ts'
const roles=['shan','bai-shuangming','lu-mi','jingyuniang','longmama','claude','gemini','grok']
const all=createOfficeTimePolicy({date:new Date(2026,10,18,10)})

it('gives an on-duty seated employee a full desk stay and a short pause before returning from a walk', () => {
  const policy = createOfficeTimePolicy({hour:10})
  const graph = withBrowserOfficeNavigation(whale).layout.navigation.floorGraph as BrowserIndependentFloorGraph
  const station = 'north-private', node = graph.nodes[graph.entryNode]!
  const floor = createIndependentArrivalState(node.point, node.bodyCoreHeightPx)
  const start = initialIndependentAmbient('shan', 0, true, policy)
  expect(start.nextAt).toBeGreaterThanOrEqual(240_000)
  const returning = advanceIndependentAmbient({...start, travelling:true}, floor, {employeeId:'shan', graph, now:8000, policy,
    boundStationId:station, active:true, manual:false, reduceMotion:false})
  expect(returning.ambient.nextAt).toBeLessThan(12_000)
  const move = advanceIndependentAmbient(returning.ambient, returning.actor, {employeeId:'shan', graph, now:12_000,
    policy, boundStationId:station, active:true, manual:false, reduceMotion:false})
  expect(move.actor).toMatchObject({mode:'returning',ambientStationId:station})
})

it('pauses on a reading pose between complete typing cycles at an employee-specific tempo', () => {
  const at = (id:string, t:number) => sampleDeskRhythm(id,t,1200,false)
  const first = at('shan',0), boundary = first.untilChangeMs
  expect(first.reading).toBe(false)
  expect(boundary * first.rate / 1200).toBeCloseTo(Math.round(boundary * first.rate / 1200), 8)
  const reading = at('shan',boundary+1)
  expect(reading.reading).toBe(true)
  expect(at('shan',boundary+reading.untilChangeMs+2).reading).toBe(false)
  expect(first.rate).not.toBe(at('jingyuniang',0).rate)
})

it('gives all eight classic employees distinct floor starts', () => {
  const starts = roles.map((id, index) => initialRuntime(id, index, 0).position)
  expect(new Set(starts.map(point => JSON.stringify(point))).size).toBe(roles.length)
})

it.each(roles)('keeps %s on walkable floor from their starting point to every classic workstation', id => {
  const { position } = initialRuntime(id, roles.indexOf(id), 0)
  expect(isOfficeFootSegmentWalkable(position, position)).toBe(true)
  const seats = ['north-private', 'north-center', 'west-studio', 'south-left', 'south-focus', 'south-right', 'private-upper', 'private-lower', 'reception'] as const
  for (const seat of seats) {
    const route = officeLaneRoute(findWorkstationRouteFromPoint(position, seat))
    expect(route.points.length, seat).toBeGreaterThan(1)
    for (let i = 1; i < route.points.length; i++) {
      expect(isOfficeFootSegmentWalkable(route.points[i - 1]!, route.points[i]!), seat).toBe(true)
    }
  }
})

it('starts unassigned on-duty employees independently within six seconds',()=>{
  const states=roles.map(employeeId=>createOfficeAutonomyState({employeeId,now:100000,timePolicy:all}))
  expect(new Set(states.map(s=>s.nextTransitionAt)).size).toBe(8)
  for(const [i,state] of states.entries()){
    expect(state.nextTransitionAt).toBeGreaterThan(101199)
    expect(state.nextTransitionAt).toBeLessThanOrEqual(106000)
    const result=advanceOfficeAutonomyController({state,now:106001,actorMode:'idle',actorPosition:initialRuntime(roles[i]!,i,0).position,timePolicy:all,boundWorkstationId:null,canStartRoam:true})
    expect(['start-roam','stand']).toContain(result.decision.type)
  }
})

it.each([whale,claude,dragon,gemini,grok])('connects eight spawns to all nine $layout.theme approaches and completes actual arrival only after paint',space=>{
  const original=JSON.stringify(space),updated=withBrowserOfficeNavigation(space)
  const g=updated.layout.navigation.floorGraph as BrowserIndependentFloorGraph
  validateIndependentFloorGraph(g,updated.layout.size,updated.layout.stations)
  expect(JSON.stringify(space)).toBe(original)
  expect(g.spawnNodes).toHaveLength(8)
  expect(new Set(g.spawnNodes.map(id=>JSON.stringify(g.nodes[id]!.point))).size).toBe(8)
  expect(Object.keys(BROWSER_OFFICE_FLOOR_PLANS)).toContain(space.layout.theme)
  for(const id of g.spawnNodes)for(const slot of updated.layout.stations){
    const start=g.nodes[id]!, command={type:'start-task' as const,commandId:id+slot.id,taskId:'task',employeeId:'lu-mi',workstationId:slot.id}
    let state=createIndependentArrivalState(start.point,start.bodyCoreHeightPx)
    const events:string[]=[]
    for(let tick=0;tick<3000&&state.mode!=='seat-pending';tick++){
      const result=advanceIndependentTaskArrival(state,{graph:g,command,bindingAvailable:true,deltaMs:50,active:true,reduceMotion:false})
      state=result.state;events.push(...result.events.map(e=>e.type))
    }
    expect(state.failure).toBeUndefined();expect(state.mode).toBe('seat-pending')
    expect(events).not.toContain('workstation-arrived')
    const painted=markIndependentArrivalPainted(state,'binding')
    expect(painted.state.mode).toBe('seated');expect(painted.events.map(e=>e.type)).toEqual(['workstation-arrived','work-animation-ready'])
  }
})

it.each([whale,claude,dragon,gemini,grok])('supports eight independent ambient controllers with no invented work events in $layout.theme',space=>{
  const g=withBrowserOfficeNavigation(space).layout.navigation.floorGraph as BrowserIndependentFloorGraph
  let actors=roles.map((id,index)=>{const n=g.nodes[g.spawnNodes[index]!]!;return {id,actor:createIndependentArrivalState(n.point,n.bodyCoreHeightPx),ambient:initialIndependentAmbient(id,0)}})
  const moved=new Set<string>();let maximum=0
  for(let tick=0;tick<2200;tick++){
    const next=actors.map(row=>{
      const a=advanceIndependentAmbient(row.ambient,row.actor,{employeeId:row.id,graph:g,now:tick*250,policy:all,active:true,reduceMotion:false,manual:false,occupiedTargets:actors.filter(p=>p.id!==row.id).map(p=>p.actor.route.at(-1)?.point??p.actor.position)})
      const result=advanceIndependentTaskArrival(a.actor,{graph:g,bindingAvailable:false,deltaMs:independentTrafficMayAdvance(row.id,a.actor,actors)?250:0,active:true,reduceMotion:false})
      expect(result.events).toHaveLength(0)
      if(Math.hypot(result.state.position[0]-row.actor.position[0],result.state.position[1]-row.actor.position[1])>.01)moved.add(row.id)
      return {id:row.id,actor:result.state,ambient:a.ambient}
    })
    maximum=Math.max(maximum,next.filter((r,i)=>Math.hypot(r.actor.position[0]-actors[i]!.actor.position[0],r.actor.position[1]-actors[i]!.actor.position[1])>.01).length)
    actors=next
  }
  expect(moved.size).toBe(8);expect(maximum).toBeGreaterThanOrEqual(3)
  expect(actors.every(row=>row.ambient.ordinal>=2)).toBe(true)
})

it('separates opposite first-edge walkers and initializes late employees relative to current scene time',()=>{
  const g=withBrowserOfficeNavigation(whale).layout.navigation.floorGraph as BrowserIndependentFloorGraph
  const [a,b]=g.edges[0]!,p=g.nodes[a]!,q=g.nodes[b]!
  const first={...createIndependentArrivalState(p.point,p.bodyCoreHeightPx),mode:'roaming' as const,route:independentFloorRoute(g,p.point,b),position:[p.point[0]*.5+q.point[0]*.5,p.point[1]*.5+q.point[1]*.5] as const}
  const second={...createIndependentArrivalState(q.point,q.bodyCoreHeightPx),mode:'roaming' as const,route:independentFloorRoute(g,q.point,a),position:first.position}
  const left=independentFloorLanePosition(first,g),right=independentFloorLanePosition(second,g)
  expect(Math.hypot(left[0]-right[0],left[1]-right[1])).toBeGreaterThan(10)
  const late=initialIndependentAmbient('shan',1_000_000)
  expect(late.nextAt).toBeGreaterThan(1_001_000)
  const frozen=advanceIndependentTaskArrival(first,{graph:g,bindingAvailable:false,deltaMs:50,active:false,reduceMotion:false})
  expect(frozen.state.position).toEqual(first.position)
})

it('does not let a hidden stale classic actor reserve an active task junction',()=>{
  const seats=['north-private','north-center'] as const
  const employee=(id:string,seat:typeof seats[number])=>({id,name:id,activity:'working',availability:'working' as const,sceneActivity:'working' as const,workstationId:seat,canDrag:false})
  const command={type:'start-task' as const,commandId:'real',taskId:'task',employeeId:'shan',workstationId:seats[0]}
  const active=prepareActorRuntime(initialRuntime('shan',0,0),employee('shan',seats[0]),0,command,()=>{})
  const hidden={...active,employeeId:'hidden',position:active.route?{x:active.route.points[0]![0],y:active.route.points[0]![1]}:active.position}
  const output=advanceOfficeActorTrafficFrame({actors:{shan:active,hidden},now:50,deltaMs:50,presentEmployeeIds:new Set(['shan']),commandsByEmployee:new Map([['shan',command]])})
  expect(output.actors.shan!.position).not.toEqual(active.position)
})

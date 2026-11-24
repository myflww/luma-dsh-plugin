// @vitest-environment node
import { expect, it } from 'vitest'
import { independentDropFloor } from '../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/office2d/independentDropFloor.ts'
import { BROWSER_OFFICE_FLOOR_PLANS, withBrowserOfficeNavigation, type BrowserIndependentFloorGraph } from '../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/office2d/browserOfficeNavigation.ts'
import { createIndependentArrivalState, advanceIndependentTaskArrival, independentFloorRoute, markIndependentArrivalPainted, validateIndependentFloorGraph } from '../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/office2d/independentTaskArrival.ts'
import { advanceIndependentAmbient, independentFloorLanePosition, independentTrafficMayAdvance, initialIndependentAmbient } from '../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/office2d/independentAmbient.ts'
import { initialRuntime, officeLaneRoute, advanceOfficeActorTrafficFrame, prepareActorRuntime } from '../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/officeSceneActorRuntime.ts'
import { sampleDeskRhythm } from '../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/office2d/deskRhythm.ts'
import { workstationArrivalStep } from '../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/office2d/frameTimeline.ts'
import { isOfficeFootSegmentWalkable, findWorkstationRouteFromPoint, OFFICE_WORKSTATION_APPROACHES } from '../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/office2d/navigation.ts'
import { officeDailyRoutine } from '../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/office2d/officeDailyRoutine.ts'
import { createOfficeAutonomyState, advanceOfficeAutonomyController } from '../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/office2d/autonomyController.ts'
import { createOfficeTimePolicy } from '../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/office2d/timePolicy.ts'
import { SPACE as whale } from '../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/office2d/independent-spaces/office-jingyuniang-v1.ts'
import { SPACE as claude } from '../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/office2d/independent-spaces/office-claude-v1.ts'
import { SPACE as dragon } from '../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/office2d/independent-spaces/office-longmama-v1.ts'
import { SPACE as gemini } from '../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/office2d/independent-spaces/office-gemini-v1.ts'
import { SPACE as grok } from '../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/office2d/independent-spaces/office-grok-v1.ts'
const roles=['shan','bai-shuangming','lu-mi','jingyuniang','longmama','claude','gemini','grok']
const all=createOfficeTimePolicy({date:new Date(2026,10,18,10)})

it('staggers the eight desk routines and takes a complete break and return through every office floor plan',()=>{
  const seats=['north-private','north-center','west-studio','south-left','south-focus','south-right','private-upper','private-lower'] as const
  const deadlines=new Set<number>(), routines=new Set<string>()
  for(const [i,id] of roles.entries()){
    const seat=seats[i]!, [x,y]=OFFICE_WORKSTATION_APPROACHES[seat].point
    const classic=createOfficeAutonomyState({employeeId:id,now:0,timePolicy:all,boundWorkstationId:seat,initiallyAtDesk:true})
    deadlines.add(classic.nextTransitionAt);routines.add(officeDailyRoutine(id)!.desk)
    const base={state:classic,now:classic.nextTransitionAt,actorMode:'desk-break' as const,actorPosition:{x,y},timePolicy:all,boundWorkstationId:seat,ambientDesk:true}
    const roam=advanceOfficeAutonomyController(base)
    expect(roam.decision.type).toBe('start-roam')
    if(roam.decision.type!=='start-roam')throw Error('No outing')
    const pause=advanceOfficeAutonomyController({...base,state:roam.state,actorMode:'idle',actorPosition:roam.decision.target,now:base.now+600})
    expect(pause.state.phase).toBe('activity')
    expect(advanceOfficeAutonomyController({...base,state:pause.state,actorMode:'idle',actorPosition:roam.decision.target,now:pause.state.nextTransitionAt}).decision).toEqual({type:'start-desk-break',workstationId:seat})
    expect(advanceOfficeAutonomyController({...base,actorMode:'working'}).state.phase).toBe('suspended')
    for(const room of [whale,dragon,claude,gemini,grok]){
      const graph=withBrowserOfficeNavigation(room).layout.navigation.floorGraph as BrowserIndependentFloorGraph
      const origin=graph.nodes[graph.targets[seat]!.approachNode]!
      const input={employeeId:id,graph,policy:all,boundStationId:seat,ambientDesk:true,active:true,manual:false,reduceMotion:false}
      let actor=createIndependentArrivalState(origin.point,origin.bodyCoreHeightPx,seat)
      let ambient=initialIndependentAmbient(id,0,true,all)
      expect(ambient.nextAt).toBe(classic.nextTransitionAt)
      let now=ambient.nextAt
      const step=()=>{const r=advanceIndependentAmbient(ambient,actor,{...input,now});ambient=r.ambient;actor=r.actor}
      const travel=()=>{
        for(let n=0;n<500 && actor.route.length;n++){
          now+=100
          step()
          actor=advanceIndependentTaskArrival(actor,{graph,bindingAvailable:true,active:true,deltaMs:100,reduceMotion:false}).state
        }
      }
      step(); expect(actor.mode).toBe('roaming')
      travel();expect(actor.mode).toBe('floor')
      step();expect(ambient.nextAt).toBeGreaterThan(now);now=ambient.nextAt
      step();expect(actor.mode).toBe('returning')
      travel();expect(actor.seatedStationId).toBe(seat)
    }
  }
  expect(deadlines.size).toBe(8);expect(routines.size).toBe(8)
})

it('gives an on-duty seated employee a full desk stay and a short pause before returning from a walk', () => {
  const policy = createOfficeTimePolicy({hour:10})
  const graph = withBrowserOfficeNavigation(whale).layout.navigation.floorGraph as BrowserIndependentFloorGraph
  const station = 'north-private', node = graph.nodes[graph.entryNode]!
  const floor = createIndependentArrivalState(node.point, node.bodyCoreHeightPx)
  const start = initialIndependentAmbient('shan', 0, true, policy)
  expect(start.nextAt).toBeGreaterThan(20_000)
  expect(start.nextAt).toBeLessThan(120_000)
  const returning = advanceIndependentAmbient({...start, travelling:true}, floor, {employeeId:'shan', graph, now:8000, policy,
    boundStationId:station, active:true, manual:false, reduceMotion:false})
  expect(returning.ambient.nextAt).toBeLessThan(15_000)
  const move = advanceIndependentAmbient(returning.ambient, returning.actor, {employeeId:'shan', graph, now:returning.ambient.nextAt,
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
  const edit=at('shan',boundary+reading.untilChangeMs+2)
  expect(edit.reading).toBe(false)
  expect(edit.rate).toBeLessThan(first.rate)
  expect(first.rate).not.toBe(at('jingyuniang',0).rate)
})

it('slows the last stride at a chair equally across render rates and keeps a projected worker seated between tasks',()=>{
  const at=(tick:number)=>{
    let distance=500
    for(let wall=0;wall<400;wall+=tick) distance-=workstationArrivalStep(distance,Math.min(tick,400-wall)).travelMs
    return distance
  }
  expect(at(8)).toBeCloseTo(at(40),8)
  expect(at(8)).toBeGreaterThan(100)
  expect(workstationArrivalStep(30,10).travelMs).toBeLessThan(workstationArrivalStep(300,10).travelMs)
  const employee={id:'shan',name:'端木嫣',activity:'整理资料',availability:'available' as const,sceneActivity:'idle' as const,ambientDesk:true,workstationId:'north-private' as const,canDrag:true}
  const seated={...initialRuntime('shan',0,0),mode:'desk-break' as const,targetWorkstationId:employee.workstationId}
  const command={type:'start-task' as const,commandId:'start',taskId:'a',employeeId:'shan',workstationId:employee.workstationId}
  const events:string[]=[]
  const working=prepareActorRuntime(seated,employee,100,command,type=>events.push(type))
  expect(working).toMatchObject({mode:'working',position:seated.position,route:null})
  expect(events).toEqual(['workstation-arrived','work-animation-ready'])
  expect(prepareActorRuntime(working,employee,500,undefined,()=>{})).toMatchObject({mode:'desk-break',position:seated.position,route:null})
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

it('keeps off-center interior placements in all five theme rooms and walks from them to every desk',()=>{
  for(const room of [whale,claude,dragon,gemini,grok]){
    const graph=withBrowserOfficeNavigation(room).layout.navigation.floorGraph as BrowserIndependentFloorGraph
    const point=[859,744] as const
    const placed=independentDropFloor(graph,point)!
    expect(placed.point).toEqual(point)
    expect(Math.hypot(point[0]-placed.anchor[0],point[1]-placed.anchor[1])).toBeGreaterThan(20)
    const outside=independentDropFloor(graph,[-3200,-3900])!
    expect(outside.point[0]).toBeGreaterThan(0)
    expect(outside.point[1]).toBeGreaterThan(0)
    for(const target of Object.values(graph.targets)){
      const route=independentFloorRoute(graph,point,target.approachNode)
      expect(route[0]?.point).toEqual(placed.anchor)
      expect(route.at(-1)?.id).toBe(target.approachNode)
      expect(()=>independentFloorRoute(graph,outside.point,target.approachNode)).not.toThrow()
    }
    expect(()=>independentFloorRoute(graph,[-19000,200],graph.entryNode)).toThrow()
  }
})

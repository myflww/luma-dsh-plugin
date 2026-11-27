import lumiSleep from './bedroomSleep.generated.json'
import { IdleGestureSequence } from '../../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/office2d/idleGestures.ts'
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { ActorMotionLayer } from '../../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/ActorMotionLayer.tsx'
import { LANDING_MS, landingStartForRelease, type ActorMotion } from '../../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/office2d/actorMotion.ts'
import { usePostDropLook } from '../../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/usePostDropLook.ts'
import { getActorPoseAtlas } from '../../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/office2d/actorPoseAtlas.ts'
import { standingFigureHeight } from '../../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/office2d/officeFigureScale.ts'
import { PERSONAL_BEDROOMS } from './bedroom-personal-layouts.ts'
import { createPortal } from 'react-dom'
import { ListTodo, MessageCircle, Monitor, Smartphone } from 'lucide-react'
import { desktopDropPoint, type DesktopPetDrop } from '../../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/office2d/scenePlacement.ts'
import { bedroomDropJourney, bedroomDropFrame } from './bedroom-placement.ts'
import { createBedroomInvitation, invitationReply, type BedroomFurniture } from './bedroom-invitation.ts'
import { bedroomBedContacts } from './bedroom-bed-pose.ts'
import { SceneViewport } from './SceneViewport.tsx'
import type { OfficeTimePhase } from '../../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/office2d/timePolicy.ts'
import { getBrowserOfficeDefaultSkinId, getEmployeeCatalogWithSkin, getEmployeeSkinPack } from '../../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/office2d/employeeSkins.ts'
import { getOfficeAsset, officeFrameRect, resolveOfficeAssetUrl } from '../../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/office2d/assets.ts'
import { createOfficeFrameTimeline, officeAutomaticWalkCadence } from '../../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/office2d/frameTimeline.ts'
import { officeActorFramePresentation } from '../../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/office2d/restPresentation.ts'
import type { OfficeWalkDirection } from '../../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/office2d/employeeCatalog.ts'
import { getWalkAtlas, sampleWalkAtlas } from '../../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/office2d/walkAtlas.ts'
import { OFFICE_WALK_SPEED } from '../../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/office2d/frameTimeline.ts'
import { BEDROOM_FLOORS, bedroomFootAt, bedroomTravelAt, bedroomRestFacing, bedroomStepAt, createBedroomRoutine, type ResidentId } from './bedroom-routine.ts'
import { BEDROOM_SLEEP, getBedroomArt } from './bedroom-art.generated.ts'
import type { BedroomRoom } from './bedroom-floor.ts'
import { BedroomDeskPose, BedroomPhonePose, bedroomMonitorCenter, bedroomSeatedCenter } from './BedroomFurniturePoses.tsx'
import type { EmployeeLocation } from './office-presence.ts'
export type { ResidentId } from './bedroom-routine.ts'
type Pair = readonly [number, number]
type Bounds = readonly [number, number, number, number]
// First forward-facing frame, measured on visible pixels rather than sheet margins.
const shapes: Record<ResidentId, readonly [Bounds, Bounds]> = {
  shan:[[123,87,469,671],[95,25,530,698]], 'bai-shuangming':[[127,62,484,696],[35,95,568,699]],
  'lu-mi':[[112,29,487,716],[104,28,526,696]], jingyuniang:[[102,143,490,698],[43,102,549,699]],
  longmama:[[149,310,442,699],[162,299,471,693]], claude:[[33,82,558,699],[111,252,488,691]],
  gemini:[[71,66,531,680],[71,66,531,680]], grok:[[69,46,533,680],[69,46,533,680]],
}

export function EmployeeFigure({ id, skinId }: { id: ResidentId; skinId?: string | undefined }) {
  const catalog = getEmployeeCatalogWithSkin(id, skinId)
  if (!catalog) return null
  const art = getOfficeAsset(catalog.walk.down)
  const cell=officeFrameRect(art.frameStrip!,0)
  const [left,top,right,bottom] = shapes[id][skinId ? 1 : 0]
  return <svg aria-hidden="true" viewBox={`${left-3} ${top-3} ${right-left+6} ${bottom-top+6}`} preserveAspectRatio="xMidYMax meet">
    <svg width={cell[2]} height={cell[3]} viewBox={cell.join(' ')} overflow="hidden">
      <image href={resolveOfficeAssetUrl(art.id)} width={art.dimensions.width} height={art.dimensions.height}/>
    </svg>
  </svg>
}

function sleepingArt(id: ResidentId, selected?: string) {
  if(id==='lu-mi'){
    const art=lumiSleep[selected==='skin.lu-mi.v1'?'lu-mi-v1':'lu-mi-base']
    return {src:art.src,width:art.size[0]!,height:art.size[1]!,head:art.backOfHead as unknown as Pair,feet:art.feetCenter as unknown as Pair}
  }
  const pack = getEmployeeSkinPack(id, selected ?? getBrowserOfficeDefaultSkinId(id))
  if (pack) {
    const { dimensions } = getOfficeAsset(pack.assets.sleep)
    const { backOfHead, feetCenter } = pack.sleep.contactUVs
    return {src:resolveOfficeAssetUrl(pack.assets.sleep), width:dimensions.width, height:dimensions.height,
      head: [backOfHead.x, backOfHead.y] as Pair, feet: [feetCenter.x, feetCenter.y] as Pair}
  }
  if (id === 'gemini' || id === 'grok') return undefined
  const original = BEDROOM_SLEEP[id]
  return {src:original.url, width:1254, height:1254, head:original.head, feet:original.feet}
}

function sleepingPose(room: {head:Pair; feet:Pair}, id: ResidentId, animate: boolean, skinId?: string) {
  const art = sleepingArt(id, skinId)
  if (!art) return null
  const headX = art.head[0]*art.width, headY = art.head[1]*art.height
  const dx = (art.feet[0]-art.head[0])*art.width, dy = (art.feet[1]-art.head[1])*art.height
  const tx = room.feet[0]-room.head[0], ty = room.feet[1]-room.head[1]
  const mirror = Math.sign(dx) === Math.sign(tx) ? 1 : -1
  const scale = Math.hypot(tx,ty)/Math.hypot(dx,dy)
  const rotation = (Math.atan2(ty,tx)-Math.atan2(dy,mirror*dx))*180/Math.PI
  return <g data-bedroom-pose="sleep" transform={`translate(${room.head.join(' ')}) rotate(${rotation}) scale(${scale*mirror} ${scale})`}>
    <g>{animate && <animateTransform attributeName="transform" type="scale" values="1 1;1.007 1.003;1 1" dur="4.8s" repeatCount="indefinite"/>}
      <image href={art.src} x={-headX} y={-headY} width={art.width} height={art.height}/>
    </g>
  </g>
}

function walkingArt(id: ResidentId, skinId?:string) {
  const catalog=getEmployeeCatalogWithSkin(id,skinId)!
  const durations={} as Record<OfficeWalkDirection, ReturnType<typeof createOfficeFrameTimeline>>
  const speeds={} as Record<OfficeWalkDirection,number>
  for(const dir of ['left','right','up','down'] as const) {
    const strip=getOfficeAsset(catalog.walk[dir]).frameStrip!
    durations[dir]=createOfficeFrameTimeline(strip)
    speeds[dir]=officeAutomaticWalkCadence('ambient',strip).travelSpeed
  }
  return {catalog,durations,speeds}
}

function BedroomWalker({id,skinId,sequence,look,walk,point,direction,moving,elapsed,scale,paused,motion,landingStartedAt}:{
  id:ResidentId; skinId?:string | undefined; walk: ReturnType<typeof walkingArt>; point:Pair
  direction:OfficeWalkDirection; moving:boolean; elapsed:number; scale:number; paused:boolean; motion?:ActorMotion | undefined
  landingStartedAt?:number | undefined
  sequence:IdleGestureSequence
  look:ReturnType<typeof usePostDropLook>
}) {
  const directionId=walk.catalog.walk[direction]
  const directionAtlas=getWalkAtlas(directionId)
  const still=moving || directionAtlas?.frameDurationsMs?undefined:walk.catalog.walkRest?.[direction]
  const record=getOfficeAsset(still?.asset ?? walk.catalog.walk[direction])
  const strip=record.frameStrip!
  const frame=moving ? walk.durations[direction].frameAt(elapsed,true) : still?.frameIndex ?? 0
  const rect=officeFrameRect(strip,frame)
  const [failedAtlas,setFailedAtlas]=useState<string>()
  const [failedPose,setFailedPose]=useState<string>()
  const pose=motion && getActorPoseAtlas(id,skinId)
  const atlas=(moving || directionAtlas?.frameDurationsMs) && failedAtlas!==record.id?directionAtlas:undefined
  const gait=atlas && sampleWalkAtlas(atlas,strip,moving?elapsed:0)
  const bounds=atlas && gait && atlas.bounds
  const figure=officeActorFramePresentation(id,point[1],direction,skinId,still)
  const width=figure.width*scale, height=width*strip.frameHeight/strip.frameWidth
  const bodyHeight=standingFigureHeight(point[1])*scale
  const poseScale=pose ? bodyHeight/pose.figureHeight : 1
  return <g data-bedroom-pose={moving?'walking':'awake'} data-bedroom-direction={direction} data-bedroom-frame={frame} data-gait-frame={gait?.index}
      transform={`translate(${point[0]} ${point[1]})`}>
    <ellipse cx={0} cy={1} rx={width*(motion==='held'?.11:.14)} ry={width*.03} fill="#392f3b" opacity={motion==='held'?.1:.19}/>
    {pose && failedPose!==pose.src && motion ? <ActorMotionLayer atlas={pose} id={id} skinId={skinId} motion={motion} sequence={sequence} look={look}
      footX={point[0]} footY={point[1]} bodyHeight={bodyHeight} paused={paused} landingStartedAt={landingStartedAt}
      x={-pose.foot[0]*poseScale} y={-pose.foot[1]*poseScale}
      width={pose.cell[0]*poseScale} height={pose.cell[1]*poseScale}
      onError={()=>setFailedPose(pose.src)}/> : <svg x={-width*figure.anchor.x} y={-height*figure.anchor.y} width={width} height={height} viewBox={atlas?'0 0 '+strip.frameWidth+' '+strip.frameHeight:rect.join(' ')} overflow="hidden">
      {atlas && gait && bounds ? <svg x={bounds[0]} y={bounds[1]} width={bounds[2]} height={bounds[3]}
        viewBox={gait.rect.join(' ')} preserveAspectRatio="none" overflow="hidden">
        <image href={atlas.src} onError={()=>setFailedAtlas(record.id)} width={atlas.columns*atlas.cell[0]!} height={Math.ceil(atlas.count/atlas.columns)*atlas.cell[1]!}/>
      </svg> : <image href={resolveOfficeAssetUrl(record.id)} width={record.dimensions.width} height={record.dimensions.height}/>}
    </svg>}
  </g>
}

export function OfficeBedroom({id,name,skinId,themeOwner,roomLayout,phase,bedtime,taskIdle,workingDay,clock,active,reduceMotion,location,officeActivity,onChat,onOffice,onAssign,hasInspector=false,fit,actionsTarget,onDesktop=false,onDesktopPet}: {
  id:ResidentId; name:string; skinId?:string | undefined; themeOwner?:ResidentId | undefined; roomLayout?:BedroomRoom | undefined; phase:OfficeTimePhase; bedtime:boolean
  taskIdle:boolean; workingDay:boolean; clock:Date; active:boolean; reduceMotion:boolean
  location:EmployeeLocation; officeActivity:string
  onChat:()=>void; onOffice:()=>void; onAssign?:()=>void; hasInspector?:boolean
  fit?:boolean; actionsTarget?:HTMLElement|null; onDesktop?:boolean; onDesktopPet?:DesktopPetDrop|undefined
}) {
  const gestures=useMemo(()=>new IdleGestureSequence(),[id,skinId])
  const look=usePostDropLook()
  const roomId=roomLayout ?? themeOwner ?? 'classic'
  useEffect(()=>()=>look.cancel(id),[look,id,roomId,skinId])
  const room=getBedroomArt(roomId)
  const foregroundClip=useId()
  const foreground=Object.hasOwn(PERSONAL_BEDROOMS,roomId)?PERSONAL_BEDROOMS[roomId as keyof typeof PERSONAL_BEDROOMS].foreground:undefined
  const [w,h] = room.size
  const night = ['dusk','night','closed'].includes(phase)
  const asleep = bedtime && taskIdle
  const walk=useMemo(()=>walkingArt(id,skinId),[id,skinId])
  const atHome=location==='bedroom' && !onDesktop
  useEffect(()=>{
    const pose=getActorPoseAtlas(id,skinId)
    if (!pose || !atHome || !active) return
    const image=new Image()
    image.src=pose.src
    void image.decode?.().catch(()=>{})
  },[id,skinId,active,atHome])
  // Decode the four compact walk directions while this resident is awake so a
  // doorway turn never blanks the previous frame waiting for a new image.
  useEffect(()=>{
    if (!atHome || !active || asleep || reduceMotion) return
    const images=Object.values(walk.catalog.walk).map(id=>{
      const atlas=getWalkAtlas(id)
      if(!atlas) return
      const image=new Image()
      image.src=atlas.src
      void image.decode?.().catch(()=>{})
      return image
    })
    return ()=>{images.length=0}
  },[walk,atHome,active,asleep,reduceMotion])

  const dateKey=clock.toDateString(), returning=clock.getHours()>=18
  const routine=useMemo(()=>createBedroomRoutine(id,roomId,clock,workingDay,walk.speeds),[id,roomId,dateKey,returning,workingDay,walk])
  const [journey,setJourney]=useState<ReturnType<typeof bedroomDropJourney>|null>(null)
  const [invitation,setInvitation]=useState<ReturnType<typeof createBedroomInvitation>|null>(null)
  const canInvite=atHome && active && taskIdle && !bedtime
  const visit=canInvite?invitation:null
  const [held,setHeld]=useState<Pair|null>(null)
  const grab=useRef<{pointer:number; start:Pair; foot:Pair; facing:OfficeWalkDirection; liftedAt?:number}|null>(null)
  const lastDrop=useRef<{facing:OfficeWalkDirection; landingStartedAt?:number}>({facing:'down'})
  const layer=useRef<SVGSVGElement>(null)
  const cancelGrab=()=>{grab.current=null;setHeld(null)}
  useEffect(()=>{cancelGrab();setJourney(null);setInvitation(null)},[id,roomId])
  useEffect(()=>{
    const cancel=()=>cancelGrab()
    const key=(event:KeyboardEvent)=>{if(event.key==='Escape') cancel()}
    const hidden=()=>{if(document.hidden) {cancel();setInvitation(null)}}
    window.addEventListener('blur',cancel);window.addEventListener('keydown',key);document.addEventListener('visibilitychange',hidden)
    return ()=>{window.removeEventListener('blur',cancel);window.removeEventListener('keydown',key);document.removeEventListener('visibilitychange',hidden)}
  },[])
  useEffect(()=>{if(!atHome || !active || bedtime || !taskIdle){cancelGrab();setJourney(null)}},[atHome,active,bedtime,taskIdle])
  useEffect(()=>{if(!canInvite) setInvitation(null)},[canInvite])
  const [sample,setSample]=useState(()=>Date.now())
  useEffect(()=>{
    if(!active || !atHome || asleep || !taskIdle) return
    let timer: ReturnType<typeof setTimeout>
    const tick=() => {
      clearTimeout(timer)
      if(document.hidden) return
      const now=Date.now()
      setSample(now)
      if(visit && now<visit.plan.end) {
        const step=bedroomStepAt(visit.plan,now)
        const interval=reduceMotion || step.pose==='phone'?Infinity:step.pose==='computer'?100:32
        timer=setTimeout(tick,Math.max(1,Math.ceil(Math.min(interval,step.end-now)))); return
      }
      const returnTrip=visit?.returnTrip ?? journey
      if(returnTrip && now<returnTrip.end+600) {
        timer=setTimeout(tick,now<returnTrip.holdUntil?returnTrip.holdUntil-now:Math.min(reduceMotion?200:32,returnTrip.end+600-now)); return
      }
      if(visit) setInvitation(null)
      if(now>=routine.end || now<routine.start) return
      const step=bedroomStepAt(routine,now)
      const untilNextStep=Math.max(1,Math.ceil(step.end-now))
      const livePose=step.pose!=='idle' && step.pose!=='phone'
      const cadence=step.pose==='computer'?100:30
      const idleChange=step.pose==='idle' && !reduceMotion ? [step.start+750,step.end-720].find(t=>t>now) : undefined
      timer=setTimeout(tick,livePose && !reduceMotion ? Math.min(cadence,untilNextStep) : idleChange?Math.ceil(idleChange-now):untilNextStep)
    }
    tick()
    document.addEventListener('visibilitychange',tick)
    return ()=>{clearTimeout(timer);document.removeEventListener('visibilitychange',tick)}
  },[active,atHome,asleep,taskIdle,reduceMotion,routine,journey,visit])
  const visiting=visit && sample<visit.plan.end
  const step=bedroomStepAt(visiting?visit.plan:routine,sample)
  const animate=active && !reduceMotion
  const returnTrip=visit && !visiting?visit.returnTrip:journey
  const detour=returnTrip && canInvite && sample<returnTrip.end ? bedroomDropFrame(returnTrip,sample) : null
  const pose=held ? 'idle' : !taskIdle ? 'computer' : detour ? detour.moving?'walk':'idle' : step.pose
  useEffect(()=>{
    if(!active || !atHome || reduceMotion || bedtime || !taskIdle || pose!=='idle') look.cancel(id)
  },[look,id,active,atHome,reduceMotion,bedtime,taskIdle,pose])
  const onBed=pose==='phone' || pose==='recline' || pose==='get-up'
  const atDesk=pose==='computer' || pose==='sit' || pose==='rise'
  const elapsed=detour?.elapsed ?? Math.max(0,sample-step.start)
  const progress=Math.max(0,Math.min(1,elapsed/(step.end-step.start)))
  const smooth=progress*progress*(3-2*progress)
  const settling=pose==='recline' || pose==='sit',leaving=pose==='rise' || pose==='get-up'
  const arrivalBlend=returnTrip && sample>=returnTrip.end?Math.max(0,Math.min(1,(sample-returnTrip.end)/600)):1
  const initial=step.initialContact ?? (leaving?1:0)
  const contact=reduceMotion || !taskIdle ? 1 : Math.min(arrivalBlend,settling?initial+(1-initial)*smooth:leaving?initial*(1-smooth):1)
  const weight=Math.max(0,Math.min(1,(contact-.04)/.28))
  const floor=BEDROOM_FLOORS[roomId]
  const bed=bedroomBedContacts(room,floor.bed)
  const point=held ?? detour?.point ?? (!taskIdle ? floor.desk : reduceMotion ? step.from : bedroomFootAt(step,sample))
  const facing=(held && grab.current) ? grab.current.facing
    : detour && !detour.moving && journey && returnTrip===journey ? lastDrop.current.facing
    : detour?.facing ?? bedroomRestFacing(step,sample)
  const distanceWalked=(step.strideStart ?? 0)+bedroomTravelAt(step,sample)
  const gaitTime=(detour?.distance ?? distanceWalked)/OFFICE_WALK_SPEED*walk.durations[facing].cycleMs
  const activity=!taskIdle ? officeActivity || '等待任务处理' : held ? '正在移动' : detour ? (detour.moving?'在房间里散步':'在这里歇一会儿') : asleep ? '已入睡' : step.activity
  const background=night?room.night:room.day
  const bedCenter:Pair=[(bed.head[0]+bed.feet[0])/2,(bed.head[1]+bed.feet[1])/2]
  const hitCenter:Pair=held?[held[0],held[1]-66]:asleep?bedCenter:onBed && weight>.5?bedCenter:atDesk && weight>.5?bedroomSeatedCenter(roomId,id,skinId,floor.desk,contact):[point[0],point[1]-66]
  // Convert the visible torso into the held walker's foot anchor. Furniture
  // approach nodes belong to the navigation graph and can be a full body away.
  const grabFoot:Pair=[hitCenter[0],hitCenter[1]+66]
  const invite=(target:BedroomFurniture)=>{
    const now=Date.now()
    if(!canInvite || document.hidden || held || (visit?.target===target && now<visit.leave)) return
    look.cancel(id)
    const seated=onBed?{target:'bed' as const,contact}:atDesk?{target:'desk' as const,contact}:undefined
    setJourney(null)
    const from=onBed ? floor.bed : atDesk ? floor.desk : point
    setInvitation(createBedroomInvitation(roomId,target,now,from,seated,routine,walk.speeds))
    setSample(now)
  }
  const invitePhase=visit && (sample<visit.settled?'approach':sample<visit.leave?'activity':'returning')
  // Put the affordances beyond the footboard and above the far side of the
  // monitor, leaving the reclining and seated silhouettes free for dragging.
  const bedHotspot:Pair=[room.feet[0]+Math.sign(room.feet[0]-room.head[0])*30,room.feet[1]+22]
  const monitor=bedroomMonitorCenter(roomId)
  const deskHotspot:Pair=[monitor[0]+Math.sign(monitor[0]-bedroomSeatedCenter(roomId)[0])*35,monitor[1]-36]
  const hotspots={bed:bedHotspot,desk:deskHotspot}
  const draggedFoot=(event:{clientX:number;clientY:number},grip:NonNullable<typeof grab.current>):Pair=>{
    const box=layer.current!.getBoundingClientRect()
    return [grip.foot[0]+(event.clientX-grip.start[0])*w/box.width,grip.foot[1]+(event.clientY-grip.start[1])*h/box.height]
  }
  const roomLighting=night?'lamplight':undefined
  const art = <div className="lumaBedroomArt" style={{aspectRatio:w+'/'+h}} data-bedroom-layout={roomId} data-bedroom-light={roomLighting} data-bedroom-invitation={visit?.target} data-bedroom-invitation-phase={invitePhase ?? undefined}>
      <img src={background} alt={name+'的卧室 · '+(night?'夜景':'日景')}/>
      {canInvite && (['bed','desk'] as const).map(target=>{
        const spot=hotspots[target], label=target==='bed'?'一起看手机':'一起用电脑'
        return <button key={target} type="button" className="lumaBedroomInvite" data-bedroom-invite={target}
          aria-label={'邀请'+name+label} title={label} aria-pressed={visit?.target===target && sample<visit.leave}
          style={{left:(spot[0]/w*100)+'%',top:(spot[1]/h*100)+'%'}} onClick={()=>invite(target)}>
          {target==='bed'?<Smartphone size={15}/>:<Monitor size={15}/>}<span>{label}</span>
        </button>
      })}
      {atHome && <svg ref={layer} className="lumaBedroomResidentLayer" viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
        {asleep && !held ? sleepingPose(bed,id,animate,skinId) : <g data-bedroom-action={pose}>
          {(!onBed && !atDesk || weight<1) && <g opacity={onBed || atDesk?1-weight:1}>
            <BedroomWalker id={id} skinId={skinId} sequence={gestures} look={look} walk={walk} point={point}
              motion={held ? 'held' : detour && !detour.moving && returnTrip===journey ? 'landing' : pose==='idle' ? 'idle' : undefined}
              landingStartedAt={lastDrop.current.landingStartedAt}
              direction={facing} elapsed={gaitTime} moving={pose==='walk' && animate} paused={!animate} scale={1}/>
          </g>}
          {(onBed || atDesk) && weight>0 && <g opacity={weight}>
            {onBed ? <BedroomPhonePose id={id} skinId={skinId} room={bed} approach={floor.bed} reclined={contact}
              elapsed={elapsed} animate={animate && pose==='phone'}/> : <BedroomDeskPose id={id} skinId={skinId} roomId={roomId}
              room={room} background={background} approach={floor.desk} seated={contact} elapsed={elapsed} waiting={!taskIdle} animate={animate && taskIdle && pose==='computer'}/>}
          </g>}
        </g>}
        {foreground && <>
          <defs><clipPath id={foregroundClip}><path d={foreground}/></clipPath></defs>
          <image data-bedroom-foreground="" href={background} width={w} height={h} clipPath={`url(#${foregroundClip})`}/>
        </>}
        <ellipse data-bedroom-drag={id} cx={hitCenter[0]} cy={hitCenter[1]} rx={asleep || onBed?Math.max(55,Math.abs(bed.head[0]-bed.feet[0])*.55):63} ry={asleep || onBed?62:81}
          fill="transparent" style={{pointerEvents:'all',cursor:held?'grabbing':'grab',touchAction:'none'}}
          onPointerDown={event=>{
            if(!active || event.button!==0 || event.isPrimary===false || grab.current) return
            event.stopPropagation()
            try {event.currentTarget.setPointerCapture(event.pointerId)} catch {return}
            grab.current={pointer:event.pointerId,start:[event.clientX,event.clientY],foot:grabFoot,facing:asleep || onBed || atDesk ? 'down' : facing}
          }}
          onPointerMove={event=>{
            const grip=grab.current
            if(!grip || grip.pointer!==event.pointerId) return
            if(grip.liftedAt===undefined) {
              if(Math.hypot(event.clientX-grip.start[0],event.clientY-grip.start[1])<7) return
              look.cancel(id)
              grip.liftedAt=performance.now()
            }
            setHeld(draggedFoot(event,grip))
          }}
          onPointerUp={event=>{
            const grip=grab.current
            if(!grip || grip.pointer!==event.pointerId) return
            const foot=draggedFoot(event,grip), box=layer.current!.getBoundingClientRect()
            cancelGrab()
            if(event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
            if(grip.liftedAt===undefined && Math.hypot(event.clientX-grip.start[0],event.clientY-grip.start[1])<7) {onChat();return}
            const desktop=onDesktopPet && desktopDropPoint(event)
            if(desktop){onDesktopPet?.(id,desktop);return}
            if(bedtime || !taskIdle || event.clientX<box.left || event.clientX>box.right || event.clientY<box.top || event.clientY>box.bottom) return
            const timestamp=Date.now()
            const landingStartedAt=landingStartForRelease(performance.now(),grip.liftedAt)
            lastDrop.current={facing:grip.facing,landingStartedAt}
            if(!reduceMotion && event.pointerType==='mouse') look.begin(id,event.clientX,event.clientY,landingStartedAt+LANDING_MS)
            setInvitation(null);setJourney(bedroomDropJourney(roomId,foot,routine,timestamp));setSample(timestamp)
          }}
          onPointerCancel={cancelGrab} onLostPointerCapture={cancelGrab}/>
      </svg>}
    </div>
  const actions = <div className="lumaRoomActions">
      {!hasInspector && <strong>{name}</strong>}{location==='office' && !onDesktop ? <button className="lumaBedroomLocation" type="button"
        title={'去办公室找'+name} aria-label={'去办公室找'+name} onClick={onOffice}>在办公室 · {officeActivity}<span aria-hidden="true"> ↗</span></button>
        : <span>{onDesktop?'在桌面陪伴':location==='unknown'?'位置待同步':activity}</span>}
      <button type="button" onClick={onChat} aria-label={'联系'+name}><MessageCircle size={15}/> 联系{name}</button>
      {onAssign && <button type="button" onClick={onAssign} aria-label={'给'+name+'派任务'}><ListTodo size={15}/> 派任务</button>}
      {!hasInspector && (location!=='office' || onDesktop) && <button type="button" onClick={onOffice}>返回办公室</button>}
    </div>
  const target = atHome ? (asleep ? room.head : BEDROOM_FLOORS[roomId].center) : [w/2,h/2] as const
  return <section className="lumaBedroomView" aria-label={name+'的卧室'}>
    {fit === undefined ? art : <SceneViewport fit={fit} ratio={w/h} focusX={target[0]/w} focusY={target[1]/h}>{art}</SceneViewport>}
    {visit && invitePhase==='activity' && <div className="lumaBedroomReply" role="status"
      data-side={hotspots[visit.target][0]<w/2?'right':'left'}>
      {invitationReply(id,visit.target)}
    </div>}
    {actionsTarget === undefined ? actions : actionsTarget ? createPortal(actions,actionsTarget) : null}
  </section>
}

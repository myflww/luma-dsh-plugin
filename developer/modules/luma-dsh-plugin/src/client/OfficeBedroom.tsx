import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ListTodo, MessageCircle } from 'lucide-react'
import { desktopDropPoint, type DesktopPetDrop } from '../../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/office2d/scenePlacement.ts'
import { bedroomDropJourney, bedroomDropFrame } from './bedroom-placement.ts'
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
import { BEDROOM_ART, BEDROOM_SLEEP, CLASSIC_BEDROOM_ART } from './bedroom-art.generated.ts'
import { BedroomDeskPose, BedroomPhonePose } from './BedroomFurniturePoses.tsx'
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
  const [left,top,right,bottom] = shapes[id][skinId ? 1 : 0]
  return <svg aria-hidden="true" viewBox={`${left-3} ${top-3} ${right-left+6} ${bottom-top+6}`} preserveAspectRatio="xMidYMax meet">
    <image href={resolveOfficeAssetUrl(art.id)} width={art.dimensions.width} height={art.dimensions.height}/>
  </svg>
}

function sleepingArt(id: ResidentId, selected?: string) {
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

function sleepingPose(room: typeof CLASSIC_BEDROOM_ART | typeof BEDROOM_ART[ResidentId], id: ResidentId, animate: boolean, skinId?: string) {
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

function BedroomWalker({id,skinId,walk,point,direction,moving,elapsed,scale,resting,stretch}:{
  id:ResidentId; skinId?:string | undefined; walk: ReturnType<typeof walkingArt>; point:Pair
  direction:OfficeWalkDirection; moving:boolean; elapsed:number; scale:number; resting:boolean; stretch:boolean
}) {
  const still=moving?undefined:walk.catalog.walkRest?.[direction]
  const record=getOfficeAsset(still?.asset ?? walk.catalog.walk[direction])
  const strip=record.frameStrip!
  const frame=moving ? walk.durations[direction].frameAt(elapsed,true) : still?.frameIndex ?? 0
  const rect=officeFrameRect(strip,frame)
  const [failedAtlas,setFailedAtlas]=useState<string>()
  const atlas=moving && failedAtlas!==record.id?getWalkAtlas(record.id):undefined
  const gait=atlas && sampleWalkAtlas(atlas,strip,elapsed)
  const figure=officeActorFramePresentation(id,point[1],direction,skinId,still)
  const width=figure.width*scale, height=width*strip.frameHeight/strip.frameWidth
  return <g data-bedroom-pose={moving?'walking':'awake'} data-bedroom-direction={direction} data-bedroom-frame={frame} data-gait-frame={gait?.index}
      transform={`translate(${point[0]} ${point[1]})`}>
    <ellipse cx={0} cy={1} rx={width*.14} ry={width*.035} fill="#392f3b" opacity=".19"/>
    <g>{resting && (stretch
      ? <animateTransform attributeName="transform" type="scale" values="1 1;1 1;1.012 .988;.993 1.018;1 1;1 1" keyTimes="0;.16;.32;.52;.78;1" dur="5.9s" repeatCount="indefinite"/>
      : <animateTransform attributeName="transform" type="rotate" values="0;0;-.9;-.5;0;0" keyTimes="0;.25;.43;.55;.75;1" dur="6.4s" repeatCount="indefinite"/>)}
    <svg x={-width*figure.anchor.x} y={-height*figure.anchor.y} width={width} height={height} viewBox={atlas?'0 0 '+strip.frameWidth+' '+strip.frameHeight:rect.join(' ')} overflow="hidden">
      {atlas && gait ? <svg x={atlas.bounds[0]} y={atlas.bounds[1]} width={atlas.bounds[2]} height={atlas.bounds[3]}
        viewBox={gait.rect.join(' ')} preserveAspectRatio="none" overflow="hidden">
        <image href={atlas.src} onError={()=>setFailedAtlas(record.id)} width={atlas.columns*atlas.cell[0]!} height={Math.ceil(atlas.count/atlas.columns)*atlas.cell[1]!}/>
      </svg> : <image href={resolveOfficeAssetUrl(record.id)} width={record.dimensions.width} height={record.dimensions.height}/>}
    </svg></g>
  </g>
}

export function OfficeBedroom({id,name,skinId,themeOwner,phase,bedtime,taskIdle,workingDay,clock,active,reduceMotion,location,officeActivity,onChat,onOffice,onWardrobe,onAssign,hasInspector=false,fit,actionsTarget,onDesktop=false,onDesktopPet}: {
  id:ResidentId; name:string; skinId?:string | undefined; themeOwner?:ResidentId | undefined; phase:OfficeTimePhase; bedtime:boolean
  taskIdle:boolean; workingDay:boolean; clock:Date; active:boolean; reduceMotion:boolean
  location:EmployeeLocation; officeActivity:string
  onChat:()=>void; onOffice:()=>void; onWardrobe:()=>void; onAssign?:()=>void; hasInspector?:boolean
  fit?:boolean; actionsTarget?:HTMLElement|null; onDesktop?:boolean; onDesktopPet?:DesktopPetDrop|undefined
}) {
  const room = themeOwner ? BEDROOM_ART[themeOwner] : CLASSIC_BEDROOM_ART
  const [w,h] = room.size
  const night = ['dusk','night','closed'].includes(phase)
  const asleep = bedtime && taskIdle
  const walk=useMemo(()=>walkingArt(id,skinId),[id,skinId])
  const roomId=themeOwner ?? 'classic'
  const atHome=location==='bedroom' && !onDesktop
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
  const [held,setHeld]=useState<Pair|null>(null)
  const grab=useRef<{pointer:number; start:Pair; foot:Pair; moved:boolean}|null>(null)
  const layer=useRef<SVGSVGElement>(null)
  const cancelGrab=()=>{grab.current=null;setHeld(null)}
  useEffect(()=>{
    const cancel=()=>cancelGrab()
    const key=(event:KeyboardEvent)=>{if(event.key==='Escape') cancel()}
    const hidden=()=>{if(document.hidden) cancel()}
    window.addEventListener('blur',cancel);window.addEventListener('keydown',key);document.addEventListener('visibilitychange',hidden)
    return ()=>{window.removeEventListener('blur',cancel);window.removeEventListener('keydown',key);document.removeEventListener('visibilitychange',hidden)}
  },[])
  useEffect(()=>{if(!atHome || !active || bedtime){cancelGrab();setJourney(null)}},[atHome,active,bedtime])
  const [sample,setSample]=useState(()=>Date.now())
  useEffect(()=>{
    if(!active || !atHome || asleep) return
    let timer: ReturnType<typeof setTimeout>
    const tick=() => {
      clearTimeout(timer)
      if(document.hidden) return
      const now=Date.now()
      setSample(now)
      if(journey && now<journey.end+600) {
        timer=setTimeout(tick,now<journey.holdUntil?journey.holdUntil-now:Math.min(reduceMotion?200:32,journey.end+600-now)); return
      }
      if(bedtime && !reduceMotion) { timer=setTimeout(tick,150); return }
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
  },[active,atHome,asleep,bedtime,reduceMotion,routine,journey])
  const step=bedroomStepAt(routine,sample)
  const animate=active && !reduceMotion
  const detour=journey && !bedtime && sample<journey.end ? bedroomDropFrame(journey,sample) : null
  const pose=held && !asleep ? 'idle' : detour ? detour.moving?'walk':'idle' : bedtime?'computer':step.pose
  const onBed=pose==='phone' || pose==='recline' || pose==='get-up'
  const atDesk=pose==='computer' || pose==='sit' || pose==='rise'
  const elapsed=detour?.elapsed ?? Math.max(0,sample-step.start)
  const progress=Math.max(0,Math.min(1,elapsed/(step.end-step.start)))
  const smooth=progress*progress*(3-2*progress)
  const settling=pose==='recline' || pose==='sit',leaving=pose==='rise' || pose==='get-up'
  const arrivalBlend=journey && sample>=journey.end?Math.max(0,Math.min(1,(sample-journey.end)/600)):1
  const contact=reduceMotion?1:Math.min(arrivalBlend,settling?smooth:leaving?1-smooth:1)
  const weight=Math.max(0,Math.min(1,(contact-.04)/.28))
  const floor=BEDROOM_FLOORS[roomId]
  const point=held ?? detour?.point ?? (bedtime ? floor.desk : reduceMotion ? step.from : bedroomFootAt(step,sample))
  const facing=detour?.facing ?? bedroomRestFacing(step,sample)
  const distanceWalked=(step.strideStart ?? 0)+bedroomTravelAt(step,sample)
  const gaitTime=(detour?.distance ?? distanceWalked)/OFFICE_WALK_SPEED*walk.durations[facing].cycleMs
  const activity=held?'正在移动':detour?(detour.moving?'在房间里散步':'在这里歇一会儿'):bedtime ? asleep?'已入睡':officeActivity : step.activity
  const background=night?room.night:room.day
  const bedCenter:Pair=[(room.head[0]+room.feet[0])/2,(room.head[1]+room.feet[1])/2]
  const hitCenter:Pair=asleep?bedCenter:onBed && weight>.5?bedCenter:atDesk && weight>.5?[floor.desk[0],floor.desk[1]-110]:[point[0],point[1]-66]
  const grabFoot:Pair=asleep || onBed?floor.bed:atDesk?floor.desk:point
  const draggedFoot=(event:{clientX:number;clientY:number},grip:NonNullable<typeof grab.current>):Pair=>{
    const box=layer.current!.getBoundingClientRect()
    return [grip.foot[0]+(event.clientX-grip.start[0])*w/box.width,grip.foot[1]+(event.clientY-grip.start[1])*h/box.height]
  }
  const art = <div className="lumaBedroomArt" style={{aspectRatio:w+'/'+h}}>
      <img src={background} alt={name+'的卧室 · '+(night?'夜景':'日景')}/>
      {atHome && <svg ref={layer} className="lumaBedroomResidentLayer" viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
        {asleep ? <g transform={held?'translate('+(held[0]-floor.bed[0])+' '+(held[1]-floor.bed[1])+')':undefined}>{sleepingPose(room,id,animate,skinId)}</g> : <g data-bedroom-action={pose}>
          {(!onBed && !atDesk || weight<1) && <g opacity={onBed || atDesk?1-weight:1}>
            <BedroomWalker id={id} skinId={skinId} walk={walk} point={point}
              direction={facing} elapsed={gaitTime} moving={pose==='walk' && animate} resting={pose==='idle' && animate && !held} stretch={step.activity==='在房间里伸展休息'} scale={1}/>
          </g>}
          {(onBed || atDesk) && weight>0 && <g opacity={weight}>
            {onBed ? <BedroomPhonePose id={id} skinId={skinId} room={room} approach={floor.bed} reclined={contact}
              animate={animate && pose==='phone'}/> : <BedroomDeskPose id={id} skinId={skinId} roomId={roomId}
              room={room} background={background} approach={floor.desk} seated={contact} elapsed={elapsed} animate={animate && pose==='computer'}/>}
          </g>}
        </g>}
        <ellipse data-bedroom-drag={id} cx={hitCenter[0]} cy={hitCenter[1]} rx={asleep || onBed?Math.max(55,Math.abs(room.head[0]-room.feet[0])*.55):63} ry={asleep || onBed?62:81}
          fill="transparent" style={{pointerEvents:'all',cursor:held?'grabbing':'grab',touchAction:'none'}}
          onPointerDown={event=>{
            if(!active || event.button!==0 || event.isPrimary===false || grab.current) return
            event.stopPropagation()
            try {event.currentTarget.setPointerCapture(event.pointerId)} catch {return}
            grab.current={pointer:event.pointerId,start:[event.clientX,event.clientY],foot:grabFoot,moved:false}
          }}
          onPointerMove={event=>{
            const grip=grab.current
            if(!grip || grip.pointer!==event.pointerId) return
            if(!grip.moved && Math.hypot(event.clientX-grip.start[0],event.clientY-grip.start[1])<7) return
            grip.moved=true; setHeld(draggedFoot(event,grip))
          }}
          onPointerUp={event=>{
            const grip=grab.current
            if(!grip || grip.pointer!==event.pointerId) return
            const foot=draggedFoot(event,grip), box=layer.current!.getBoundingClientRect()
            cancelGrab()
            if(event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
            if(!grip.moved) {onChat();return}
            const desktop=onDesktopPet && desktopDropPoint(event)
            if(desktop){onDesktopPet?.(id,desktop);return}
            if(bedtime || event.clientX<box.left || event.clientX>box.right || event.clientY<box.top || event.clientY>box.bottom) return
            const timestamp=Date.now()
            setJourney(bedroomDropJourney(roomId,foot,routine,timestamp));setSample(timestamp)
          }}
          onPointerCancel={cancelGrab} onLostPointerCapture={cancelGrab}/>
      </svg>}
    </div>
  const actions = <div className="lumaRoomActions">
      {!hasInspector && <strong>{name}</strong>}<span>{onDesktop?'在桌面陪伴':location==='office'?'在办公室 · '+officeActivity:location==='unknown'?'位置待同步':activity}</span>
      {!hasInspector && <button type="button" onClick={onWardrobe}>换装</button>}
      <button type="button" onClick={onChat} aria-label={'联系'+name}><MessageCircle size={15}/> 联系{name}</button>
      {onAssign && <button type="button" onClick={onAssign} aria-label={'给'+name+'派任务'}><ListTodo size={15}/> 派任务</button>}
      {!hasInspector && <button type="button" onClick={onOffice}>返回办公室</button>}
    </div>
  const target = atHome ? (asleep ? room.head : BEDROOM_FLOORS[roomId].center) : [w/2,h/2] as const
  return <section className="lumaBedroomView" aria-label={name+'的卧室'}>
    {fit === undefined ? art : <SceneViewport fit={fit} ratio={w/h} focusX={target[0]/w} focusY={target[1]/h}>{art}</SceneViewport>}
    {actionsTarget === undefined ? actions : actionsTarget ? createPortal(actions,actionsTarget) : null}
  </section>
}

import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { ListTodo, MessageCircle } from 'lucide-react'
import { SceneViewport } from './SceneViewport.tsx'
import type { OfficeTimePhase } from '../../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/office2d/timePolicy.ts'
import { getBrowserOfficeDefaultSkinId, getEmployeeCatalogWithSkin, getEmployeeSkinPack } from '../../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/office2d/employeeSkins.ts'
import { getOfficeAsset, officeFrameRect, resolveOfficeAssetUrl } from '../../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/office2d/assets.ts'
import { createOfficeFrameTimeline, officeAutomaticWalkCadence } from '../../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/office2d/frameTimeline.ts'
import { officeActorFramePresentation } from '../../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/office2d/restPresentation.ts'
import type { OfficeWalkDirection } from '../../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/office2d/employeeCatalog.ts'
import { BEDROOM_FLOORS, bedroomFootAt, bedroomStepAt, createBedroomRoutine, type ResidentId } from './bedroom-routine.ts'
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

function BedroomWalker({id,skinId,walk,point,direction,moving,elapsed,scale,resting}:{
  id:ResidentId; skinId?:string | undefined; walk: ReturnType<typeof walkingArt>; point:Pair
  direction:OfficeWalkDirection; moving:boolean; elapsed:number; scale:number; resting:boolean
}) {
  const still=moving?undefined:walk.catalog.walkRest?.[direction]
  const record=getOfficeAsset(still?.asset ?? walk.catalog.walk[direction])
  const strip=record.frameStrip!
  const frame=moving ? walk.durations[direction].frameAt(elapsed,true) : still?.frameIndex ?? 0
  const rect=officeFrameRect(strip,frame)
  const figure=officeActorFramePresentation(id,point[1],direction,skinId,still)
  const width=figure.width*scale, height=width*strip.frameHeight/strip.frameWidth
  return <g data-bedroom-pose={moving?'walking':'awake'} data-bedroom-direction={direction} data-bedroom-frame={frame}
      transform={`translate(${point[0]} ${point[1]})`}>
    <ellipse cx={0} cy={1} rx={width*.14} ry={width*.035} fill="#392f3b" opacity=".19"/>
    <g>{resting && <animateTransform attributeName="transform" type="rotate" values="0;-.85;0;.6;0" dur="5.7s" repeatCount="indefinite"/>}
    <svg x={-width*figure.anchor.x} y={-height*figure.anchor.y} width={width} height={height} viewBox={rect.join(' ')} overflow="hidden">
      <image href={resolveOfficeAssetUrl(record.id)} width={record.dimensions.width} height={record.dimensions.height}/>
    </svg></g>
  </g>
}

export function OfficeBedroom({id,name,skinId,themeOwner,phase,bedtime,taskIdle,workingDay,clock,active,reduceMotion,location,officeActivity,onChat,onOffice,onWardrobe,onAssign,hasInspector=false,fit,actionsTarget}: {
  id:ResidentId; name:string; skinId?:string | undefined; themeOwner?:ResidentId | undefined; phase:OfficeTimePhase; bedtime:boolean
  taskIdle:boolean; workingDay:boolean; clock:Date; active:boolean; reduceMotion:boolean
  location:EmployeeLocation; officeActivity:string
  onChat:()=>void; onOffice:()=>void; onWardrobe:()=>void; onAssign?:()=>void; hasInspector?:boolean
  fit?:boolean; actionsTarget?:HTMLElement|null
}) {
  const room = themeOwner ? BEDROOM_ART[themeOwner] : CLASSIC_BEDROOM_ART
  const [w,h] = room.size
  const night = ['dusk','night','closed'].includes(phase)
  const asleep = bedtime && taskIdle
  const walk=useMemo(()=>walkingArt(id,skinId),[id,skinId])
  const roomId=themeOwner ?? 'classic'
  const atHome=location==='bedroom'
  const dateKey=clock.toDateString(), returning=clock.getHours()>=18
  const routine=useMemo(()=>createBedroomRoutine(id,roomId,clock,workingDay,walk.speeds),[id,roomId,dateKey,returning,workingDay,walk])
  const [sample,setSample]=useState(()=>Date.now())
  useEffect(()=>{
    if(!active || !atHome || asleep) return
    let timer: ReturnType<typeof setTimeout>
    const tick=() => {
      clearTimeout(timer)
      if(document.hidden) return
      const now=Date.now()
      setSample(now)
      if(bedtime && !reduceMotion) { timer=setTimeout(tick,150); return }
      if(now>=routine.end || now<routine.start) return
      const step=bedroomStepAt(routine,now)
      const untilNextStep=Math.max(1,Math.ceil(step.end-now))
      const livePose=step.pose!=='idle' && step.pose!=='phone'
      const cadence=step.pose==='computer'?100:32
      timer=setTimeout(tick,livePose && !reduceMotion ? Math.min(cadence,untilNextStep) : untilNextStep)
    }
    tick()
    document.addEventListener('visibilitychange',tick)
    return ()=>{clearTimeout(timer);document.removeEventListener('visibilitychange',tick)}
  },[active,atHome,asleep,bedtime,reduceMotion,routine])
  const step=bedroomStepAt(routine,sample)
  const animate=active && !reduceMotion
  const pose=bedtime?'computer':step.pose
  const onBed=pose==='phone' || pose==='recline' || pose==='get-up'
  const atDesk=pose==='computer' || pose==='sit' || pose==='rise'
  const elapsed=Math.max(0,sample-step.start)
  const progress=Math.max(0,Math.min(1,elapsed/(step.end-step.start)))
  const smooth=progress*progress*(3-2*progress)
  const settling=pose==='recline' || pose==='sit',leaving=pose==='rise' || pose==='get-up'
  const contact=reduceMotion?1:settling?smooth:leaving?1-smooth:1
  const weight=Math.max(0,Math.min(1,(contact-.04)/.28))
  const floor=BEDROOM_FLOORS[roomId]
  const point=bedtime ? floor.desk : reduceMotion ? step.from : bedroomFootAt(step,sample)
  const activity=bedtime ? asleep?'已入睡':officeActivity : step.activity
  const background=night?room.night:room.day
  const art = <div className="lumaBedroomArt" style={{aspectRatio:w+'/'+h}}>
      <img src={background} alt={name+'的卧室 · '+(night?'夜景':'日景')}/>
      {atHome && <svg className="lumaBedroomResidentLayer" viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
        {asleep ? sleepingPose(room,id,animate,skinId) : <g data-bedroom-action={pose}>
          {(!onBed && !atDesk || weight<1) && <g opacity={onBed || atDesk?1-weight:1}>
            <BedroomWalker id={id} skinId={skinId} walk={walk} point={point}
              direction={step.facing} elapsed={elapsed} moving={pose==='walk' && animate} resting={pose==='idle' && animate} scale={1}/>
          </g>}
          {(onBed || atDesk) && weight>0 && <g opacity={weight}>
            {onBed ? <BedroomPhonePose id={id} skinId={skinId} room={room} approach={floor.bed} reclined={contact}
              animate={animate && pose==='phone'}/> : <BedroomDeskPose id={id} skinId={skinId} roomId={roomId}
              room={room} background={background} approach={floor.desk} seated={contact} elapsed={elapsed} animate={animate && pose==='computer'}/>}
          </g>}
        </g>}
      </svg>}
    </div>
  const actions = <div className="lumaRoomActions">
      {!hasInspector && <strong>{name}</strong>}<span>{location==='office'?'在办公室 · '+officeActivity:location==='unknown'?'位置待同步':activity}</span>
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

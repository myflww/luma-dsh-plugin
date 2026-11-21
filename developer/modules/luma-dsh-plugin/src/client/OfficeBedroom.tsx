import { useState } from 'react'
import { createPortal } from 'react-dom'
import { BedDouble, ListTodo, MessageCircle, Sun } from 'lucide-react'
import { SceneViewport } from './SceneViewport.tsx'
import type { OfficeTimePhase } from '../../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/office2d/timePolicy.ts'
import { getBrowserOfficeDefaultSkinId, getEmployeeCatalogWithSkin, getEmployeeSkinPack } from '../../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/office2d/employeeSkins.ts'
import { getOfficeAsset, resolveOfficeAssetUrl } from '../../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/office2d/assets.ts'
import { BEDROOM_ART, BEDROOM_SLEEP, CLASSIC_BEDROOM_ART } from './bedroom-art.generated.ts'
import type { EmployeeLocation } from './office-presence.ts'
export type ResidentId = keyof typeof BEDROOM_ART
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

function sleepingPose(room: typeof CLASSIC_BEDROOM_ART | typeof BEDROOM_ART[ResidentId], id: ResidentId, skinId?: string) {
  const art = sleepingArt(id, skinId)
  if (!art) return null
  const headX = art.head[0]*art.width, headY = art.head[1]*art.height
  const dx = (art.feet[0]-art.head[0])*art.width, dy = (art.feet[1]-art.head[1])*art.height
  const tx = room.feet[0]-room.head[0], ty = room.feet[1]-room.head[1]
  const mirror = Math.sign(dx) === Math.sign(tx) ? 1 : -1
  const scale = Math.hypot(tx,ty)/Math.hypot(dx,dy)
  const rotation = (Math.atan2(ty,tx)-Math.atan2(dy,mirror*dx))*180/Math.PI
  return <image data-bedroom-pose="sleep" href={art.src} width={art.width} height={art.height}
    transform={`translate(${room.head.join(' ')}) rotate(${rotation}) scale(${scale*mirror} ${scale}) translate(${-headX} ${-headY})`}/>
}

export function OfficeBedroom({id,name,skinId,themeOwner,phase,bedtime,location,officeActivity,onChat,onOffice,onWardrobe,onAssign,hasInspector=false,fit,actionsTarget}: {
  id:ResidentId; name:string; skinId?:string | undefined; themeOwner?:ResidentId | undefined; phase:OfficeTimePhase; bedtime:boolean
  location:EmployeeLocation; officeActivity:string
  onChat:()=>void; onOffice:()=>void; onWardrobe:()=>void; onAssign?:()=>void; hasInspector?:boolean
  fit?:boolean; actionsTarget?:HTMLElement|null
}) {
  const [pose,setPose] = useState<'awake'|'sleep'>()
  const room = themeOwner ? BEDROOM_ART[themeOwner] : CLASSIC_BEDROOM_ART
  const [w,h] = room.size
  const night = ['dusk','night','closed'].includes(phase)
  const asleep = pose ? pose === 'sleep' : bedtime
  const art = <div className="lumaBedroomArt" style={{aspectRatio:w+'/'+h}}>
      <img src={night ? room.night : room.day} alt={name+'的卧室 · '+(night?'夜景':'日景')}/>
      {location === 'bedroom' && <svg className="lumaBedroomResidentLayer" viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
        {asleep ? sleepingPose(room,id,skinId) : <svg data-bedroom-pose="awake" x={room.stand[0]-h*.105} y={room.stand[1]-h*.22} width={h*.21} height={h*.22}>
          <EmployeeFigure id={id} skinId={skinId}/>
        </svg>}
      </svg>}
    </div>
  const actions = <div className="lumaRoomActions">
      {!hasInspector && <strong>{name}</strong>}<span>{location==='office'?'在办公室 · '+officeActivity:location==='unknown'?'位置待同步':asleep?'在卧室小憩':'在卧室休息'}</span>
      {!hasInspector && <button type="button" onClick={onWardrobe}>换装</button>}
      {location==='bedroom' && <button type="button" onClick={()=>setPose(asleep?'awake':'sleep')}>{asleep?<Sun size={15}/>:<BedDouble size={15}/>} {asleep?'起身':'小憩'}</button>}
      <button type="button" onClick={onChat} aria-label={'联系'+name}><MessageCircle size={15}/> 联系{name}</button>
      {onAssign && <button type="button" onClick={onAssign} aria-label={'给'+name+'派任务'}><ListTodo size={15}/> 派任务</button>}
      {!hasInspector && <button type="button" onClick={onOffice}>返回办公室</button>}
    </div>
  const target = location === 'bedroom' ? (asleep ? room.head : room.stand) : [w/2,h/2] as const
  return <section className="lumaBedroomView" aria-label={name+'的卧室'}>
    {fit === undefined ? art : <SceneViewport fit={fit} ratio={w/h} focusX={target[0]/w} focusY={target[1]/h}>{art}</SceneViewport>}
    {actionsTarget === undefined ? actions : actionsTarget ? createPortal(actions,actionsTarget) : null}
  </section>
}

import { PERSONAL_BEDROOMS } from './bedroom-personal-layouts.ts'
import { mapShopBedrooms } from './bedroom-shop-layouts.ts'
import type { BedroomRoom } from './bedroom-floor.ts'
import { useId, useMemo } from 'react'
import type { Point, ResidentId } from './bedroom-routine.ts'
import { getEmployeeSkinPack, getBrowserOfficeDefaultSkinId } from '../../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/office2d/employeeSkins.ts'
import { getDeskRearPose } from '../../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/office2d/deskRearPose.ts'
import { standingFigureHeight } from '../../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/office2d/officeFigureScale.ts'
import chairGeometry from './bedroom-chair-plates.generated.json'
import standardPhone from '../../art/bedroom-poses/phone-standard.webp'
import outfitPhone from '../../art/bedroom-poses/phone-outfit.webp'
import dayChairs from '../../art/bedroom-poses/desk-chairs-day.webp'
import nightChairs from '../../art/bedroom-poses/desk-chairs-night.webp'

type Geometry = { readonly head: Point; readonly feet: Point; readonly size: Point }
type PhoneFrame = readonly [head:Point, feet:Point, handset:Point]
const phoneRoles: readonly ResidentId[] = ['jingyuniang','longmama','claude','gemini','grok','shan','bai-shuangming','lu-mi']
// Contacts in 240-unit atlas cells. Head, shoe and handset contacts stay
// independent of sprite padding and of each bedroom's mattress orientation.
const standard: readonly PhoneFrame[] = [
  [[158,54],[34,218],[112,100]], [[163,51],[65,205],[123,99]], [[155,53],[45,208],[121,98]], [[184,70],[40,181],[137,103]],
  [[163,65],[37,183],[134,101]], [[158,57],[44,219],[122,89]], [[163,59],[47,213],[125,97]], [[174,67],[56,214],[135,96]],
]
const outfit: readonly PhoneFrame[] = [
  [[151,63],[47,211],[111,97]], [[159,48],[58,207],[117,94]], [[157,61],[49,208],[116,97]], [[184,70],[43,203],[139,101]],
  [[169,65],[30,205],[133,98]], [[162,58],[37,217],[128,90]], [[152,57],[42,212],[117,87]], [[170,71],[42,208],[139,100]],
]
const blend = (a:number,b:number,t:number) => a+(b-a)*t

export function BedroomPhonePose({id,skinId,room,approach,reclined,animate}: {
  id:ResidentId; skinId?:string|undefined; room:Pick<Geometry,'head'|'feet'>; approach:Point; reclined:number; animate:boolean
}) {
  const filterId=useId(), cell=phoneRoles.indexOf(id)
  const outfitPack=getEmployeeSkinPack(id,skinId ?? getBrowserOfficeDefaultSkinId(id))
  const [head,feet,handset]=(outfitPack?outfit:standard)[cell]!
  const tx=room.feet[0]-room.head[0], ty=room.feet[1]-room.head[1]
  const dx=feet[0]-head[0],dy=feet[1]-head[1],mirror=Math.sign(dx)===Math.sign(tx)?1:-1
  const headX=blend(approach[0]-Math.sign(tx)*20,room.head[0],reclined)
  const headY=blend(approach[1]-129,room.head[1],reclined)
  const length=blend(Math.hypot(20,123),Math.hypot(tx,ty),reclined)
  const tilt=blend(Math.atan2(123,Math.sign(tx)*20),Math.atan2(ty,tx),reclined)
  const scale=length/Math.hypot(dx,dy)
  const angle=(tilt-Math.atan2(dy,dx*mirror))*180/Math.PI
  // A local displacement follows the painted hands and phone; the pillow and shoes stay still.
  const motionMap=useMemo(()=> 'data:image/svg+xml,'+encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240"><defs><radialGradient id="w"><stop offset="0" stop-color="#f53980"/><stop offset=".5" stop-color="#dc5580"/><stop offset="1" stop-color="#808080"/></radialGradient></defs><rect width="240" height="240" fill="#808080"/><ellipse cx="${handset[0]}" cy="${handset[1]}" rx="30" ry="35" fill="url(#w)"/></svg>`),[handset])
  return <g data-bedroom-pose="phone" transform={`translate(${headX} ${headY}) rotate(${angle}) scale(${scale*mirror} ${scale}) translate(${-head[0]} ${-head[1]})`}>
    <svg width="240" height="240" overflow="hidden" viewBox="0 0 240 240">
      {animate && <defs><filter id={filterId} x="0" y="0" width="240" height="240" filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
        <feImage href={motionMap} x="0" y="0" width="240" height="240" result="wrist"/>
        <feDisplacementMap in="SourceGraphic" in2="wrist" xChannelSelector="R" yChannelSelector="G" scale="0">
          <animate attributeName="scale" values="0;0;5.5;1;1;3;0;0" keyTimes="0;.24;.34;.44;.58;.65;.75;1" dur={4.2+cell*.14+'s'} repeatCount="indefinite"/>
        </feDisplacementMap>
      </filter></defs>}
      <g filter={animate?`url(#${filterId})`:undefined}>
        <image href={outfitPack?outfitPhone:standardPhone} x={-240*(cell%4)} y={-240*Math.floor(cell/4)} width="960" height="480"/>
      </g>
    </svg>
  </g>
}

const plainChairBack='M662 550 Q661 542 671 544 L727 555 Q734 556 734 563 L734 626 Q732 634 723 634 L668 619 Q661 617 662 610 Z'
const chairBack:Record<BedroomRoom,string>={
  ...mapShopBedrooms(layout=>layout.chair.back),
  classic:plainChairBack, shan:PERSONAL_BEDROOMS['shan'].chair.back, 'lu-mi':PERSONAL_BEDROOMS['lu-mi'].chair.back, 'bai-shuangming':PERSONAL_BEDROOMS['bai-shuangming'].chair.back,
  jingyuniang:'M1112 360 Q1108 355 1112 354 L1158 368 Q1164 368 1166 378 L1174 409 L1168 422 L1169 437 Q1150 438 1129 427 Q1121 423 1120 411 Z',
  longmama:'M1130 368 Q1131 362 1138 365 L1169 374 L1174 392 L1190 436 Q1185 449 1188 460 Q1172 460 1143 449 Z',
  claude:'M1201 522 Q1198 518 1206 518 L1257 529 Q1267 529 1270 541 L1278 580 L1278 616 Q1251 616 1211 602 Z',
  gemini:'M1118 449 Q1115 445 1123 445 L1150 446 Q1166 448 1175 471 L1181 495 Q1185 509 1171 519 Q1163 530 1175 540 Q1150 539 1132 528 Z',
  grok:'M1078 402 Q1076 397 1083 399 L1125 412 Q1139 418 1141 440 Q1142 452 1153 453 L1179 447 L1178 487 Q1145 505 1093 482 Z',
}
type Screen=readonly [topLeft:Point,topRight:Point,bottomLeft:Point]
const plainScreen:Screen=[[790,406],[894,439],[790,462]]
const screens:Record<BedroomRoom,Screen>={
  ...mapShopBedrooms(layout=>layout.screen),
  classic:plainScreen,shan:PERSONAL_BEDROOMS['shan'].screen,'bai-shuangming':PERSONAL_BEDROOMS['bai-shuangming'].screen,'lu-mi':PERSONAL_BEDROOMS['lu-mi'].screen,
  jingyuniang:[[1190,280],[1278,300],[1187,331]],longmama:[[1231,331],[1298,349],[1228,375]],
  claude:[[1282,429],[1377,455],[1281,484]],gemini:[[1232,372],[1318,394],[1225,423]],
  grok:[[1194,329],[1266,347],[1189,379]],
}
// Tiny illustrated applications live on the actual monitor plane. Keep only a few
// strokes legible at office scale, and let the cursor follow the employee's pastime.
const deskSketch: Record<ResidentId, string> = {
  jingyuniang: 'M24 35Q32 28 40 35T56 35T72 35T91 33M28 26l9-8 9 4 11-10 8 5',
  'lu-mi': 'M26 24l7-11h14l8 11-15 15zM26 24h29m-22-11 7 26 7-26M63 23q-2-7 5-7 3-6 8-1 7-2 9 5 4 6-2 10-4 6-12 4-8 0-8-8zm5 0q2-7 10-4 6 4 0 9-7 4-9-2 0-5 6-4m-2 13-4 6',
  'bai-shuangming': 'M27 15h21m-21 5h16m-16 7h58m-58 5h53m-53 5h32M63 22l6-7 6 3 10-7',
  shan: 'M34 36q4-8 9-11l2-8 6 6q6-2 12 1l7-6 1 10q5 4 9 11M48 31q3 2 5 0m6 0q3 2 5 0',
  longmama: 'M27 16h27m-27 8h59m-59 5h49m-49 5h55m-55 5h31',
  claude: 'M26 15h24v21H26zM28 33l7-9 6 6 6-8m9-4h27m-27 6h30m-30 6h22m-22 6h28',
  gemini: 'M28 35l12-15 14 5 13-12 17 8M39 20l4 15 11-10m14-12 2 12',
  grok: 'M28 15h53v25H28zM39 15v14h11v11m0-25v7h12v11h9m0-18v8h10m-53 11h11',
}
export function bedroomMonitorCenter(room: BedroomRoom): Point {
  const [,right,bottom] = screens[room]
  return [(right[0]+bottom[0])/2,(right[1]+bottom[1])/2]
}
// Cushion centres are independent of the armrests and chair-back occlusion paths.
const chairTravel:Record<BedroomRoom,readonly [open:Point,working:Point]>={
  classic:[[723,613],[757,593]], shan:[[486,739],[449,717]], 'bai-shuangming':[[1280,365],[1263,351]],
  'lu-mi':[[1167,624],[1192,608]], jingyuniang:[[1181,421],[1200,407]], longmama:[[1186,448],[1207,435]],
  claude:[[1283,598],[1303,583]], gemini:[[1189,519],[1208,504]], grok:[[1153,477],[1176,461]],
  'bedroom.shop.rose-sketchbook.v1':[[1204,552],[1228,536]],
  'bedroom.shop.sapphire-music.v1':[[1185,470],[1202,458]],
  'bedroom.shop.alpine-library.v1':[[1170,529],[1187,516]],
  'bedroom.shop.camellia-pavilion.v1':[[1220,425],[1239,412]],
  'bedroom.shop.blue-rose-gallery.v1':[[1189,455],[1205,443]],
  'bedroom.shop.frostwing-glasshouse.v1':[[1244,481],[1259,468]],
}

export function bedroomSeatedCenter(room:BedroomRoom,id?:ResidentId,skinId?:string,approach?:Point,seated=1):Point {
  const pose=id && getDeskRearPose(id,skinId)
  if(pose && approach)return deskPlacement(room,pose,approach,seated).center
  const seat=chairTravel[room][1]
  return [seat[0],seat[1]-48]
}

function DeskScreen({id,surface,tint,elapsed}: {id:ResidentId;surface:Screen;tint:string;elapsed:number}) {
  const [[x,y],right,bottom]=surface
  const matrix=[(right[0]-x)/100,(right[1]-y)/100,(bottom[0]-x)/56,(bottom[1]-y)/56,x,y]
  const line=15+Math.floor(elapsed/670)%16
  return <g transform={`matrix(${matrix.join(' ')})`} data-bedroom-monitor="awake">
    <rect width="100" height="56" rx="1" fill="#192735"/>
    <rect width="100" height="6" rx="1" fill="#384555"/>
    <circle cx="4" cy="3" r="1.2" fill={tint}/><circle cx="8" cy="3" r="1.2" fill="#cfd2d5"/>
    <path d="M0 7H21V56H0Z" fill="#223746"/>
    <path d="M4 14h12m-12 5h9m-9 5h11m-11 5h6" stroke="#73919f" strokeWidth="1.6"/>
    <path d={deskSketch[id]} stroke={id==='lu-mi'?'#8ed4ff':'#d2e0ec'} strokeWidth="1.45" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
    <path d={`M26 45h${line}`} stroke={tint} strokeWidth="2.2"/>
  </g>
}
// Usable span of each keyboard's near row, measured in background pixels.
// The two endpoints stay on the painted keys in both lighting variants.
type KeyRow = readonly [Point,Point]
const keyRows: Record<BedroomRoom,KeyRow> = {
  classic:[[766,525],[804,536]], shan:[[404,677],[443,667]],
  'bai-shuangming':[[1253,319],[1291,308]], 'lu-mi':[[1192,546],[1226,556]],
  jingyuniang:[[1195,361],[1233,371]], longmama:[[1215,400],[1248,409]],
  claude:[[1286,530],[1327,543]], gemini:[[1217,460],[1254,471]], grok:[[1186,404],[1226,412]],
  'bedroom.shop.rose-sketchbook.v1':[[1241,473],[1284,485]],
  'bedroom.shop.sapphire-music.v1':[[1196,404],[1241,415]],
  'bedroom.shop.alpine-library.v1':[[1182,471],[1225,484]],
  'bedroom.shop.camellia-pavilion.v1':[[1233,366],[1268,375]],
  'bedroom.shop.blue-rose-gallery.v1':[[1184,395],[1227,407]],
  'bedroom.shop.frostwing-glasshouse.v1':[[1238,425],[1277,431]],
}

// First cell restores the space underneath the unoccupied chair; the adjoining
// cell holds that same chair in the current lighting, including its casters.
function ChairLayer({roomId,night,underlay=false}:{roomId:BedroomRoom;night:boolean;underlay?:boolean}){
  const {cell,x,y,w,h}=chairGeometry[roomId]
  const sx=(cell%5)*440+(underlay?0:220),sy=Math.floor(cell/5)*260
  return <svg x={x} y={y} width={w} height={h} viewBox={`${sx} ${sy} ${w} ${h}`} overflow="hidden">
    <image href={night?nightChairs:dayChairs} width="2200" height="780"/>
  </svg>
}

type RearPose=NonNullable<ReturnType<typeof getDeskRearPose>>

function deskPlacement(room:BedroomRoom,pose:RearPose,approach:Point,seated:number){
  const [open,working]=chairTravel[room], [left,right]=keyRows[room]
  const monitor=bedroomMonitorCenter(room)
  const dx=monitor[0]-working[0],dy=monitor[1]-working[1]
  const yaw=dx/Math.hypot(dx,dy)
  const t=Math.max(0,Math.min(1,(seated-.32)/.68))
  const advance=t*t*(3-2*t)
  const seat:Point=[blend(open[0],working[0],advance),blend(open[1],working[1],advance)]
  const chairTransform=`translate(${seat[0]-open[0]} ${seat[1]-open[1]})`
  const scale=standingFigureHeight(approach[1])*.84/pose.bodyHeight
  const a=scale*(1-.18*Math.abs(yaw)),b=a*(right[1]-left[1])/(right[0]-left[0])
  const aimX=working[0]+yaw*scale*(pose.hip[1]-pose.hand[1])*.46
  const q=Math.max(.20,Math.min(.80,(aimX-left[0])/(right[0]-left[0])))
  const key:Point=[blend(left[0],right[0],q),blend(left[1],right[1],q)]
  const hx=pose.hand[0]-pose.hip[0],hy=pose.hand[1]-pose.hip[1]
  const c=(key[0]-working[0]-a*hx)/hy,d=(key[1]-working[1]-b*hx)/hy
  const hipX=blend(approach[0],seat[0],seated),hipY=blend(approach[1]-41,seat[1],seated)
  const tx=hipX-a*pose.hip[0]-c*pose.hip[1],ty=hipY-b*pose.hip[0]-d*pose.hip[1]
  const headLean=-scale*yaw*.19
  // Both projections meet at the wrists. The seated torso bridges the real
  // cushion and key bed while the head retains its original proportions.
  const ux=tx+(c-headLean)*pose.hand[1],uy=ty+(d-scale)*pose.hand[1]
  const headX=a*pose.head[0]+headLean*pose.head[1]+ux
  const headY=b*pose.head[0]+scale*pose.head[1]+uy
  return {side:yaw<0?'backLeft':'backRight',advance,seat,chairTransform,
    lower:`matrix(${a} ${b} ${c} ${d} ${tx} ${ty})`,
    upper:`matrix(${a} ${b} ${headLean} ${scale} ${ux} ${uy})`,
    center:[blend(hipX,headX,.58),blend(hipY,headY,.58)] as Point}
}

export function BedroomDeskPose({id,skinId,roomId,background,approach,seated,elapsed,animate,waiting=false}:{
  id:ResidentId; skinId?:string|undefined; roomId:BedroomRoom; room:Geometry; background:string; approach:Point
  seated:number; elapsed:number; animate:boolean; waiting?:boolean
}) {
  const clipId=useId()
  const pose=getDeskRearPose(id,skinId)
  if(!pose)return null
  const layout=deskPlacement(roomId,pose,approach,seated)
  const {side,advance,seat,chairTransform,lower,upper}=layout
  const slot=phoneRoles.indexOf(id),beat=elapsed%(4200+slot*137)
  const frame=animate && beat<2750?Math.floor(beat/(191+slot*6))%pose.count:0
  const [width,height]=pose.cell,night=background.includes('-night.')
  return <g data-bedroom-pose="computer" data-bedroom-frame={frame} data-desk-facing={side}
    data-desk-action={waiting?'waiting':animate && beat>=2750?'reading':'typing'}>
    {advance>0 && <><ChairLayer roomId={roomId} night={night} underlay/>
      <g transform={chairTransform}><ChairLayer roomId={roomId} night={night}/></g></>}
    {seated>.6 && <DeskScreen id={id} surface={screens[roomId]} tint={['#88c9da','#ccbae3','#efb888','#9fc1ff','#d9b77d','#f2c4ce','#a8dbea','#aeace6'][slot]!} elapsed={animate?elapsed:0}/>}
    <ellipse cx={seat[0]} cy={seat[1]+1} rx="23" ry="5" fill="#211d19" opacity={.19*seated}/>
    <g data-bedroom-seated-body="">
      <g transform={lower} data-body-projection="seated">
        <svg y={pose.hand[1]} width={width} height={height-pose.hand[1]}
          viewBox={`${frame*width} ${pose.hand[1]} ${width} ${height-pose.hand[1]}`} overflow="hidden">
          <image href={pose.src} width={width*pose.count} height={height}/>
        </svg>
      </g>
      <g transform={upper}>
        <svg width={width} height={pose.hand[1]+.4} viewBox={`${frame*width} 0 ${width} ${pose.hand[1]+.4}`} overflow="hidden">
          <image href={pose.src} width={width*pose.count} height={height}/>
        </svg>
      </g>
    </g>
    <defs><clipPath id={clipId}><path d={chairBack[roomId]}/></clipPath></defs>
    <g transform={chairTransform}><g clipPath={`url(#${clipId})`}>
      <ChairLayer roomId={roomId} night={night}/>
    </g></g>
  </g>
}

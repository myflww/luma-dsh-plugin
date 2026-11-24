import { useId, useMemo } from 'react'
import type { Point, ResidentId } from './bedroom-routine.ts'
import { getEmployeeCatalogWithSkin, getEmployeeTypingProfileWithSkin, getEmployeeSkinPack, getBrowserOfficeDefaultSkinId } from '../../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/office2d/employeeSkins.ts'
import { getOfficeAsset, officeFrameRect, resolveOfficeAssetUrl } from '../../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/office2d/assets.ts'
import { deskFrameRegistration } from '../../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/office2d/deskFrameRegistration.ts'
import { seatedFigureScale } from '../../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/office2d/officeFigureScale.ts'
import standardPhone from '../../art/bedroom-poses/phone-standard.webp'
import outfitPhone from '../../art/bedroom-poses/phone-outfit.webp'

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

type Chair = { seat:Point; back:string }
const plainChair:Chair={seat:[743,597],back:'M662 550 Q661 542 671 544 L727 555 Q734 556 734 563 L734 626 Q732 634 723 634 L668 619 Q661 617 662 610 Z'}
const chairs:Record<ResidentId|'classic',Chair>={
  classic:plainChair, shan:plainChair, 'lu-mi':plainChair, 'bai-shuangming':plainChair,
  jingyuniang:{seat:[1176,417],back:'M1112 360 Q1108 355 1112 354 L1158 368 Q1164 368 1166 378 L1174 409 L1168 422 L1169 437 Q1150 438 1129 427 Q1121 423 1120 411 Z'},
  longmama:{seat:[1179,439],back:'M1130 368 Q1131 362 1138 365 L1169 374 L1174 392 L1190 436 Q1185 449 1188 460 Q1172 460 1143 449 Z'},
  claude:{seat:[1273,589],back:'M1201 522 Q1198 518 1206 518 L1257 529 Q1267 529 1270 541 L1278 580 L1278 616 Q1251 616 1211 602 Z'},
  gemini:{seat:[1192,519],back:'M1118 449 Q1115 445 1123 445 L1150 446 Q1166 448 1175 471 L1181 495 Q1185 509 1171 519 Q1163 530 1175 540 Q1150 539 1132 528 Z'},
  grok:{seat:[1156,471],back:'M1078 402 Q1076 397 1083 399 L1125 412 Q1139 418 1141 440 Q1142 452 1153 453 L1179 447 L1178 487 Q1145 505 1093 482 Z'},
}
const plainKeys:Point=[789,531]
const keys:Record<ResidentId|'classic',Point>={classic:plainKeys,shan:plainKeys,'bai-shuangming':plainKeys,'lu-mi':plainKeys,
  jingyuniang:[1215,362],longmama:[1226,400],claude:[1306,533],gemini:[1235,462],grok:[1203,405]}
type Screen=readonly [topLeft:Point,topRight:Point,bottomLeft:Point]
const plainScreen:Screen=[[790,406],[894,439],[790,462]]
const screens:Record<ResidentId|'classic',Screen>={
  classic:plainScreen,shan:plainScreen,'bai-shuangming':plainScreen,'lu-mi':plainScreen,
  jingyuniang:[[1190,280],[1278,300],[1187,331]],longmama:[[1231,331],[1298,349],[1228,375]],
  claude:[[1282,429],[1377,455],[1281,484]],gemini:[[1232,372],[1318,394],[1225,423]],
  grok:[[1194,329],[1266,347],[1189,379]],
}
// Tiny illustrated applications live on the actual monitor plane. Keep only a few
// strokes legible at office scale, and let the cursor follow the employee's pastime.
const deskSketch: Record<ResidentId, string> = {
  jingyuniang: 'M24 35Q32 28 40 35T56 35T72 35T91 33M28 26l9-8 9 4 11-10 8 5',
  'lu-mi': 'M27 20h62m-62 4h62m-62 4h62m-62 4h62m-62 4h62M38 31v-13l12-3v12m12 8v-14l13-2v12',
  'bai-shuangming': 'M27 15h21m-21 5h16m-16 7h58m-58 5h53m-53 5h32M63 22l6-7 6 3 10-7',
  shan: 'M34 36q4-8 9-11l2-8 6 6q6-2 12 1l7-6 1 10q5 4 9 11M48 31q3 2 5 0m6 0q3 2 5 0',
  longmama: 'M27 16h27m-27 8h59m-59 5h49m-49 5h55m-55 5h31',
  claude: 'M26 15h24v21H26zM28 33l7-9 6 6 6-8m9-4h27m-27 6h30m-30 6h22m-22 6h28',
  gemini: 'M28 35l12-15 14 5 13-12 17 8M39 20l4 15 11-10m14-12 2 12',
  grok: 'M28 15h53v25H28zM39 15v14h11v11m0-25v7h12v11h9m0-18v8h10m-53 11h11',
}
export function bedroomMonitorCenter(room: ResidentId | 'classic'): Point {
  const [,right,bottom] = screens[room]
  return [(right[0]+bottom[0])/2,(right[1]+bottom[1])/2]
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
    <path d={deskSketch[id]} stroke="#d2e0ec" strokeWidth="1.45" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
    <path d={`M26 45h${line}`} stroke={tint} strokeWidth="2.2"/>
  </g>
}
// Hip and right fingertips, measured on the role's complete back-right typing frame.
const baseContacts:Partial<Record<ResidentId,readonly [Point,Point]>>={
  jingyuniang:[[277,700],[382,569]],longmama:[[244,698],[345,621]],claude:[[241,662],[371,562]],
  shan:[[267,550],[413,366]],'bai-shuangming':[[247,637],[400,416]],'lu-mi':[[241,634],[421,511]],
}
const basePixels:Partial<Record<ResidentId,number>>={jingyuniang:527,longmama:397,claude:459,shan:671,'bai-shuangming':700,'lu-mi':587}
// The outfit strips shift whole bodies between cells. Register to the seated
// torso so the keystrokes move the arms without scooting the chair each frame.
const outfitRegistration:Record<ResidentId,readonly Point[]>={
  jingyuniang:[[0,0],[12,0],[0,0],[10,1]],longmama:[[0,0],[54,0],[0,1],[53,1]],
  claude:[[0,0],[79,1],[0,-1],[73,-2]],gemini:[[0,0],[23,-2],[-1,14],[27,14]],
  grok:[[0,0],[-4,-3],[-2,16],[5,14]],shan:[[0,0],[49,-1],[2,-2],[49,2]],
  'bai-shuangming':[[0,0],[-1,0],[0,-3],[-3,-3]],'lu-mi':[[0,0],[18,-1],[1,1],[15,0]],
}

export function BedroomDeskPose({id,skinId,roomId,room,background,approach,seated,elapsed,animate}:{
  id:ResidentId; skinId?:string|undefined; roomId:ResidentId|'classic'; room:Geometry; background:string; approach:Point
  seated:number; elapsed:number; animate:boolean
}) {
  const clipId=useId()
  const facing='backRight', chair=chairs[roomId]
  const catalog=getEmployeeCatalogWithSkin(id,skinId)!, rig=getEmployeeTypingProfileWithSkin(id,facing,skinId)!
  const asset=getOfficeAsset(catalog.typing[facing]),strip=asset.frameStrip!
  const variant=getEmployeeSkinPack(id,skinId??getBrowserOfficeDefaultSkinId(id))
  const anatomy=variant?.typingProfiles[facing].landmarks
  const sourcePoint=(p:{x:number;y:number}):Point=>[p.x*strip.frameWidth,p.y*strip.frameHeight]
  const [hip,hand]=anatomy?[sourcePoint(anatomy.hip),sourcePoint(anatomy.hand)]:baseContacts[id]!
  const keyboard=keys[roomId]
  const sourceHeight=variant?variant.typingProfiles[facing].visibleRect.height*strip.frameHeight:basePixels[id]!
  // Use the approaching figure's scale. Different arm lengths should move a
  // resident's chair contact, never enlarge her entire body at the keyboard.
  const seatedScale=seatedFigureScale(asset.sha256,approach[1],145/sourceHeight)
  const scale=blend(seatedScale/.91,seatedScale,seated)
  // Typing comes in short bursts, with a held pose while the employee reads the monitor.
  const beat=elapsed%(4200+phoneRoles.indexOf(id)*137)
  const frame=animate && beat<2750 ? Math.floor(beat/(191+phoneRoles.indexOf(id)*6))%strip.frameCount : rig.reducedMotionFrame
  const rect=officeFrameRect(strip,frame)
  const shift=deskFrameRegistration(asset.sha256,frame) ?? (variant?outfitRegistration[id][frame]!:[rig.frameX[frame]??0,0] as const)
  const x=blend(approach[0]-hip[0]*scale,keyboard[0]-hand[0]*scale,seated)+shift[0]*scale
  const y=blend(approach[1]-41-hip[1]*scale,keyboard[1]-hand[1]*scale,seated)+shift[1]*scale
  const width=strip.frameWidth*scale,height=strip.frameHeight*scale
  const reading=animate && beat>=2750
  const readingFraction=reading?(beat-2750)/(4200+phoneRoles.indexOf(id)*137-2750):0
  const lean=reading?Math.sin(Math.PI*readingFraction)**2*1.6:0
  return <g data-bedroom-pose="computer" data-bedroom-frame={frame} data-desk-action={reading?'reading':'typing'}>
    {seated>.6 && <DeskScreen id={id} surface={screens[roomId]} tint={['#88c9da','#ccbae3','#efb888','#9fc1ff','#d9b77d','#f2c4ce','#a8dbea','#aeace6'][phoneRoles.indexOf(id)]!} elapsed={animate?elapsed:0}/>}
    <svg transform={lean?'rotate('+lean+' '+chair.seat[0]+' '+chair.seat[1]+')':undefined} x={x} y={y} width={width} height={height} viewBox={rect.join(' ')} overflow="hidden">
      <image href={resolveOfficeAssetUrl(asset.id)} width={asset.dimensions.width} height={asset.dimensions.height}/>
    </svg>
    <defs><clipPath id={clipId}><path d={chair.back}/></clipPath></defs>
    <image href={background} width={room.size[0]} height={room.size[1]} clipPath={`url(#${clipId})`} opacity={seated}/>
  </g>
}

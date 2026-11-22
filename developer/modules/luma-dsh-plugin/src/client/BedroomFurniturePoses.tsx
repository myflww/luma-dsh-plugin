import { useId, useMemo } from 'react'
import type { Point, ResidentId } from './bedroom-routine.ts'
import { getEmployeeCatalogWithSkin, getEmployeeTypingProfileWithSkin, getEmployeeSkinPack, getBrowserOfficeDefaultSkinId } from '../../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/office2d/employeeSkins.ts'
import { getOfficeAsset, officeFrameRect, resolveOfficeAssetUrl } from '../../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/office2d/assets.ts'
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
  id:ResidentId; skinId?:string|undefined; room:Geometry; approach:Point; reclined:number; animate:boolean
}) {
  const filterId=useId(), cell=phoneRoles.indexOf(id), alt=!!skinId
  const [head,feet,handset]=(alt?outfit:standard)[cell]!
  const tx=room.feet[0]-room.head[0], ty=room.feet[1]-room.head[1]
  const dx=feet[0]-head[0],dy=feet[1]-head[1],mirror=Math.sign(dx)===Math.sign(tx)?1:-1
  const footX=blend(approach[0],room.feet[0],reclined),footY=blend(approach[1]-6,room.feet[1],reclined)
  const headX=blend(approach[0]-Math.sign(tx)*20,room.head[0],reclined)
  const headY=blend(approach[1]-129,room.head[1],reclined)
  const scale=Math.hypot(footX-headX,footY-headY)/Math.hypot(dx,dy)
  const angle=(Math.atan2(footY-headY,footX-headX)-Math.atan2(dy,dx*mirror))*180/Math.PI
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
        <image href={alt?outfitPhone:standardPhone} x={-240*(cell%4)} y={-240*Math.floor(cell/4)} width="960" height="480"/>
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
function DeskScreen({surface,tint,elapsed}: {surface:Screen;tint:string;elapsed:number}) {
  const [[x,y],right,bottom]=surface
  const matrix=[(right[0]-x)/100,(right[1]-y)/100,(bottom[0]-x)/56,(bottom[1]-y)/56,x,y]
  const line=15+Math.floor(elapsed/670)%16
  return <g transform={`matrix(${matrix.join(' ')})`} data-bedroom-monitor="awake">
    <rect width="100" height="56" rx="1" fill="#192735"/>
    <rect width="100" height="6" rx="1" fill="#384555"/>
    <circle cx="4" cy="3" r="1.2" fill={tint}/><circle cx="8" cy="3" r="1.2" fill="#cfd2d5"/>
    <path d="M0 7H21V56H0Z" fill="#223746"/>
    <path d="M4 14h12m-12 5h9m-9 5h11m-11 5h6" stroke="#73919f" strokeWidth="1.6"/>
    <path d="M26 14h28m-28 8h51m-51 5h45m-45 5h32" stroke="#c6d8e3" strokeWidth="1.8"/>
    <path d={`M26 40h${line}`} stroke={tint} strokeWidth="2.2"/>
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
  const armX=hand[0]-hip[0], armY=hand[1]-hip[1]
  const contactScale=((keyboard[0]-chair.seat[0])*armX+(keyboard[1]-chair.seat[1])*armY)/(armX*armX+armY*armY)
  const sourceHeight=variant?variant.typingProfiles[facing].visibleRect.height*strip.frameHeight:basePixels[id]!
  const scale=blend(158,Math.max(170,Math.min(235,contactScale*sourceHeight)),seated)/sourceHeight
  // Typing comes in short bursts, with a held pose while the employee reads the monitor.
  const beat=elapsed%(4200+phoneRoles.indexOf(id)*137)
  const frame=animate && beat<2750 ? Math.floor(beat/(191+phoneRoles.indexOf(id)*6))%strip.frameCount : rig.reducedMotionFrame
  const rect=officeFrameRect(strip,frame)
  const shift=variant?outfitRegistration[id][frame]!:[rig.frameX[frame]??0,0] as const
  const x=blend(approach[0]-hip[0]*scale,keyboard[0]-hand[0]*scale,seated)+shift[0]*scale
  const y=blend(approach[1]-41-hip[1]*scale,keyboard[1]-hand[1]*scale,seated)+shift[1]*scale
  const width=strip.frameWidth*scale,height=strip.frameHeight*scale
  return <g data-bedroom-pose="computer" data-bedroom-frame={frame}>
    {seated>.6 && <DeskScreen surface={screens[roomId]} tint={['#88c9da','#ccbae3','#efb888','#9fc1ff','#d9b77d','#f2c4ce','#a8dbea','#aeace6'][phoneRoles.indexOf(id)]!} elapsed={animate?elapsed:0}/>}
    <svg x={x} y={y} width={width} height={height} viewBox={rect.join(' ')} overflow="hidden">
      <image href={resolveOfficeAssetUrl(asset.id)} width={asset.dimensions.width} height={asset.dimensions.height}/>
    </svg>
    <defs><clipPath id={clipId}><path d={chair.back}/></clipPath></defs>
    <image href={background} width={room.size[0]} height={room.size[1]} clipPath={`url(#${clipId})`} opacity={seated}/>
  </g>
}

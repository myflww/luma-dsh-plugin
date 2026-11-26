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
// The physical keycaps in each background, clockwise from the left corner.
// Two hand contacts are fitted inside this quadrilateral in the room's view.
const keyBeds:Record<BedroomRoom,readonly [Point,Point,Point,Point]>={
  'classic':[[749,522],[764,512],[834,535],[818,546]],
  'shan':[[348,678],[421,652],[451,668],[374,698]],
  'bai-shuangming':[[1234,314],[1304,294],[1324,306],[1252,326]],
  'lu-mi':[[1178,542],[1205,528],[1279,557],[1253,573]],
  'jingyuniang':[[1172,358],[1186,350],[1246,366],[1232,374]],
  'longmama':[[1207,402],[1220,396],[1268,409],[1255,418]],
  'claude':[[1265,524],[1285,514],[1344,533],[1327,544]],
  'gemini':[[1194,457],[1209,450],[1274,466],[1256,475]],
  'grok':[[1160,400],[1174,392],[1236,408],[1221,417]],
  'bedroom.shop.rose-sketchbook.v1':[[1236,472],[1261,458],[1338,486],[1311,499]],
  'bedroom.shop.sapphire-music.v1':[[1178,402],[1197,392],[1270,413],[1253,422]],
  'bedroom.shop.alpine-library.v1':[[1168,468],[1190,459],[1251,476],[1230,489]],
  'bedroom.shop.camellia-pavilion.v1':[[1224,367],[1242,356],[1298,370],[1280,382]],
  'bedroom.shop.blue-rose-gallery.v1':[[1170,395],[1186,386],[1249,403],[1228,412]],
  'bedroom.shop.frostwing-glasshouse.v1':[[1224,422],[1240,413],[1304,427],[1287,438]],
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

// Projected left-to-right span of the actual upholstered cushion. Measure at
// the seat plane, independently of the arms, tall backs, casters and shadows.
const cushionWidth:Record<BedroomRoom,number>={
  classic:104,shan:105,'bai-shuangming':92,'lu-mi':116,jingyuniang:96,longmama:85,
  claude:111,gemini:97,grok:109,
  'bedroom.shop.rose-sketchbook.v1':132,'bedroom.shop.sapphire-music.v1':105,
  'bedroom.shop.alpine-library.v1':124,'bedroom.shop.camellia-pavilion.v1':82,
  'bedroom.shop.blue-rose-gallery.v1':103,'bedroom.shop.frostwing-glasshouse.v1':90,
}
// Coordinates in each chair plate before sliding it into the desk. The rim is
// where the forward top surface ends under a bent knee. Exposed armrests and
// the visible side of the upholstery sit in front of a thigh tucked behind
// them. The forward face of the seat stays behind the overhanging calf.
type ChairProfile={rim:Point; nearSide:string}
const chairProfile:Record<BedroomRoom,ChairProfile>={
  classic:{rim:[111,86],nearSide:'M73 82 Q74 78 83 76L111 65Q117 63 119 68L119 71 87 86Q78 90 73 86Z M101 79L105 77 106 109 102 113Z'},
  shan:{rim:[24,79],nearSide:'M24 56Q27 55 33 60L68 75 69 80 64 81 27 64 23 64Z M20 63L24 63 24 88 20 88Z'},
  'bai-shuangming':{rim:[24,53],nearSide:'M19 55Q31 62 54 67L58 76 54 80Q32 75 20 66Z'},
  'lu-mi':{rim:[142,88],nearSide:'M55 67Q62 78 77 100Q84 111 95 112L118 108 122 112Q114 122 94 126L72 124 58 105Z'},
  jingyuniang:{rim:[115,73],nearSide:'M77 65Q87 65 100 58L115 50 119 51 119 55 101 64 80 72Z M113 54L118 53 115 77 110 78Z'},
  longmama:{rim:[101,93],nearSide:'M72 84Q78 82 90 78L101 73 105 73 105 77 75 90Z M101 76L105 75 105 97 101 98Z M18 86Q42 97 72 98L78 104 72 111 44 110 16 100Z'},
  claude:{rim:[131,85],nearSide:'M88 71Q99 69 110 63L126 55Q132 52 134 57L134 61 109 73 91 78Z M124 63L129 61 129 91 124 95Z'},
  gemini:{rim:[130,101],nearSide:'M65 94Q83 89 97 83L127 74 131 74 130 78Q105 85 91 92L69 102Z M124 79L128 78 124 103 121 107Z'},
  grok:{rim:[137,88],nearSide:'M80 64Q91 67 106 63L123 59 130 62 130 67 127 72 128 98Q115 105 98 108L84 108Z'},
  'bedroom.shop.rose-sketchbook.v1':{rim:[156,119],nearSide:'M88 93Q106 92 121 88L145 81Q153 80 156 84L156 89 127 95 95 100 88 99Z M142 92L148 90 147 135 142 138Z'},
  'bedroom.shop.sapphire-music.v1':{rim:[145,90],nearSide:'M79 71Q84 82 98 91Q107 96 127 94L134 94 133 104Q119 113 102 113L83 107Z M32 71Q53 83 76 89Q95 102 118 99L134 95 133 106Q114 118 91 119L46 110 32 102Z'},
  'bedroom.shop.alpine-library.v1':{rim:[165,107],nearSide:'M91 99Q98 91 106 91L139 84Q146 84 149 91L148 128Q134 134 108 137L90 133Z'},
  'bedroom.shop.camellia-pavilion.v1':{rim:[107,69],nearSide:'M63 64Q68 76 79 77L92 75 95 77 94 85Q80 93 63 92L56 84Z'},
  'bedroom.shop.blue-rose-gallery.v1':{rim:[124,75],nearSide:'M86 61Q92 71 100 75Q108 77 115 75L119 75 118 91Q106 97 94 97L85 91Z'},
  'bedroom.shop.frostwing-glasshouse.v1':{rim:[113,66],nearSide:'M93 59Q101 56 114 49L119 46 122 48 122 52 112 57 96 64Z M118 52L121 51 120 70 115 74Z'},
}
// These points are in the original chair painting. The first pair follows
// the depth of the upholstered seat towards the desk, at equal height in
// the room. The final three values locate the fixed desktop lip relative
// to the keyboard centre (intercept, slope, thickness).
type SeatPlane = readonly [back:Point,front:Point,lipY:number,slope:number,thickness:number]
const seatPlane:Record<BedroomRoom,SeatPlane>={
  classic:[[45,97],[104,79],24,.325,8], shan:[[80,88],[28,70],17,-.35,9],
  'bai-shuangming':[[66,67],[28,55],14,-.29,6], 'lu-mi':[[83,98],[140,84],23,.40,10],
  jingyuniang:[[63,85],[110,69],22,.245,8], longmama:[[63,103],[100,89],23,.29,6],
  claude:[[82,100],[123,80],21,.31,10], gemini:[[76,111],[125,99],21,.33,7],
  grok:[[74,102],[132,82],18,.29,9],
  'bedroom.shop.rose-sketchbook.v1':[[84,121],[148,110],24,.37,10],
  'bedroom.shop.sapphire-music.v1':[[83,103],[138,87],21,.29,9],
  'bedroom.shop.alpine-library.v1':[[91,118],[155,103],21,.30,8],
  'bedroom.shop.camellia-pavilion.v1':[[54,82],[100,68],20,.27,8],
  'bedroom.shop.blue-rose-gallery.v1':[[81,89],[118,74],20,.265,7],
  'bedroom.shop.frostwing-glasshouse.v1':[[72,79],[108,65],20,.22,7],
}
function desktopLip(room:BedroomRoom){
  const [, ,height,slope,thickness]=seatPlane[room],keys=keyBeds[room]
  const x=keys.reduce((sum,p)=>sum+p[0],0)/4,y=keys.reduce((sum,p)=>sum+p[1],0)/4+height
  const span=92
  return `M${x-span} ${y-span*slope} l${span*2} ${span*2*slope}v${thickness}l${-span*2} ${-span*2*slope}Z`
}

// Fixed cabinet fronts and projecting desk legs. They occlude the legs only;
// the hands and sleeves stay above the top and the movable chair stays in front.
const deskFront:Partial<Record<BedroomRoom,string>>={
  shan:'M238 690 L334 709 421 688 423 711 414 715 414 824 238 854Z',
  'bai-shuangming':'M1114 321 L1191 342 1229 331 1229 447 1191 463 1114 437Z',
  'lu-mi':'M1245 586 L1333 613 1369 601 1369 724 1327 739 1243 704Z',
  jingyuniang:'M1276 397 L1324 410 1363 392 1363 473 1322 489 1274 474Z',
  longmama:'M1270 426 L1331 445 1378 428 1378 508 1329 526 1269 505Z',
  claude:'M1360 552 L1437 578 1460 567 1460 664 1438 673 1360 651Z',
  grok:'M1239 442 L1293 459 1346 439 1345 528 1293 548 1238 531Z',
  'bedroom.shop.rose-sketchbook.v1':'M1305 516 L1386 542 1411 531 1411 677 1305 644Z',
  'bedroom.shop.sapphire-music.v1':'M1287 433 L1367 456 1397 443 1397 567 1287 545Z',
  'bedroom.shop.alpine-library.v1':'M1266 501 L1338 523 1360 513 1360 639 1264 612Z',
  'bedroom.shop.camellia-pavilion.v1':'M1284 388 L1350 406 1380 397 1380 525 1284 504Z',
  'bedroom.shop.blue-rose-gallery.v1':'M1249 424 L1310 442 1369 419 1369 534 1311 551 1248 534Z',
  'bedroom.shop.frostwing-glasshouse.v1':'M1320 459 L1380 473 1422 453 1422 556 1320 546Z',
}

type RearPose=NonNullable<ReturnType<typeof getDeskRearPose>>

// Clip the range of possible cushion centres by each physical key-bed edge.
// This solves both fingertip contacts by sliding the chair under the seated
// character. The entire character, including the short bent legs, stays rigid.
function intersectHalfPlane(points:Point[],origin:Point,edge:Point):Point[]{
  const cross=(p:Point)=>edge[0]*(p[1]-origin[1])-edge[1]*(p[0]-origin[0])
  const kept:Point[]=[]
  for(const [i,q] of points.entries()){
    const p=points[(i+points.length-1)%points.length]!,u=cross(p),v=cross(q)
    if((u>=0)!==(v>=0)){
      const t=u/(u-v)
      kept.push([blend(p[0],q[0],t),blend(p[1],q[1],t)])
    }
    if(v>=0)kept.push(q)
  }
  return kept
}

function closestInPolygon(poly:Point[],target:Point):Point {
  let best=poly[0]!,min=Infinity,inside=true
  for(const [i,a] of poly.entries()){
    const b=poly[(i+1)%poly.length]!,dx=b[0]-a[0],dy=b[1]-a[1]
    const vx=target[0]-a[0],vy=target[1]-a[1]
    if(dx*vy-dy*vx<0)inside=false
    const t=Math.max(0,Math.min(1,(vx*dx+vy*dy)/(dx*dx+dy*dy||1)))
    const p:Point=[a[0]+dx*t,a[1]+dy*t],dist=(p[0]-target[0])**2+(p[1]-target[1])**2
    if(dist<min){best=p;min=dist}
  }
  return inside?target:best
}

type DeskAngle='rear'|'oblique'|'highOblique'|'joint'
function deskViewFit(room:BedroomRoom,pose:RearPose,footY:number,angle:DeskAngle){
  const [center,preferred]=chairTravel[room],monitor=bedroomMonitorCenter(room)
  const dx=monitor[0]-preferred[0]
  const view=angle==='joint'?pose.joints![room]!:pose[angle]!
  const side=dx<0?-1:1
  // Room perspective changes the size of the chair. The head occupies the
  // same fraction of its real cushion for every resident and skin.
  // A deeply upholstered armchair has a wide seat without bringing its
  // occupant closer to the camera. Cap its apparent skull size against the
  // normal walker at this same point on the floor.
  const scale=Math.min(cushionWidth[room]*.61,standingFigureHeight(footY)*.38)/view.headHeight
  const plate=chairGeometry[room],profile=chairProfile[room]
  const rim:Point=[plate.x+profile.rim[0],plate.y+profile.rim[1]]
  // Put the knee over the forward lip. The whole chair can slide beneath a
  // character with shorter thighs without relocating the desk or its keys.
  const joint=angle==='joint'?pose.joints![room]!:undefined
  // Copainted armchairs register at the actual wood/padded rail crossing
  // the near elbow. The underlying upholstery stays at its original size.
  const contact=room==='bedroom.shop.rose-sketchbook.v1'?[122,90]:[135,92]
  const open:Point=joint?[plate.x+contact[0]!-side*scale*(joint.rail[0]-view.hip[0]),
    plate.y+contact[1]!-scale*(joint.rail[1]-view.hip[1])]:[rim[0]+side*2-side*scale*(view.knee[0]-view.hip[0]),
    rim[1]-3-scale*(view.knee[1]-view.hip[1])]
  const [rearEdge,forwardEdge]=seatPlane[room]
  // A knee hanging forward has a range of valid contacts. A long coat or
  // a short thigh must not shift the load out past the cushion centre.
  const support:Point=[plate.x+blend(rearEdge[0],forwardEdge[0],.55),plate.y+blend(rearEdge[1],forwardEdge[1],.55)]
  const miss=Math.hypot((open[0]-support[0])*.75,open[1]-support[1])
  const offsets=view.palms.map(([x,y])=>[side*(x-view.hip[0])*scale,(y-view.hip[1])*scale] as Point)
  const keys=keyBeds[room]
  const mid:Point=[keys.reduce((n,p)=>n+p[0],0)/4,keys.reduce((n,p)=>n+p[1],0)/4]
  // Keep the fingertips a little inside the original keycaps for each stroke.
  const caps=keys.map(p=>[blend(p[0],mid[0],.075),blend(p[1],mid[1],.075)] as Point)
  let possible:Point[]=[[0,0],[2000,0],[2000,1200],[0,1200]]
  for(const [finger,offset] of offsets.entries()){
    for(const [i,p] of caps.entries()){
      const q=caps[(i+1)%4]!
      // The nearer hand reaches the key row. The other has a short
      // recovery arc above it; forcing both onto a single projected plane
      // previously pulled the pelvis away from a tall chair back.
      const clearance=finger===0 && q[0]>p[0]?Math.min(8,view.headHeight*scale*.14):0
      possible=intersectHalfPlane(possible,[p[0]-offset[0],p[1]-offset[1]-clearance],[q[0]-p[0],q[1]-p[1]])
    }
  }
  // In an almost edge-on view one hand may overlap the other, or the
  // foreshortened key row may be narrower than their depth separation.
  const fallback:Point=[mid[0]-(offsets[0]![0]+offsets[1]![0])/2,mid[1]-(offsets[0]![1]+offsets[1]![1])/2]
  const working=possible.length?closestInPolygon(possible,preferred):fallback
  const thigh=(view.knee[0]-view.hip[0])*scale
  const deepEnough=thigh>=Math.max(13,Math.abs(rim[0]-center[0])*.36)
  return {open,working,angle,view,side,scale,deepEnough,miss,reachable:possible.length>0}
}

function fitDesk(room:BedroomRoom,pose:RearPose,footY:number,allowJoint:boolean){
  if(allowJoint && pose.joints?.[room])return deskViewFit(room,pose,footY,'joint')
  const seat=chairTravel[room][1],screen=bedroomMonitorCenter(room)
  const dx=screen[0]-seat[0],dy=screen[1]-seat[1]
  const [rear,front]=seatPlane[room]
  // Project the horizontal seat axis back onto its ground plane. The
  // screen can be mounted off-centre, so its height is not a camera angle.
  const yaw=Math.atan2(Math.abs(front[0]-rear[0])*.43,Math.abs(front[1]-rear[1]))*180/Math.PI
  const preferred:DeskAngle=pose.highOblique && yaw>=51?'highOblique':
    pose.preferOblique || Math.abs(dx/Math.hypot(dx,dy))>.34?'oblique':'rear'
  const choices:DeskAngle[]=[preferred,'oblique',...(pose.preferOblique?[]:['rear' as const])]
  if(pose.highOblique)choices.push('highOblique')
  const fits=[...new Set(choices)].map(angle=>deskViewFit(room,pose,footY,angle))
  const good=fits.filter(fit=>fit.reachable && fit.deepEnough)
  // Avoid a view whose projected thighs put the pelvis beyond the actual
  // load-bearing patch even if its fingers could reach the key bed.
  return (good.length?good:fits).sort((a,b)=>(a.angle===preferred?0:9)+a.miss-((b.angle===preferred?0:9)+b.miss))[0]!
}

type DeskFit=ReturnType<typeof fitDesk>
const deskFits=new WeakMap<RearPose,Map<string,DeskFit>>()
function deskPlacement(room:BedroomRoom,pose:RearPose,approach:Point,seated:number,allowJoint=true){
  let rooms=deskFits.get(pose)
  if(!rooms){rooms=new Map();deskFits.set(pose,rooms)}
  const key=room+(allowJoint?'':'/approach')
  let fit=rooms.get(key)
  if(!fit){fit=fitDesk(room,pose,approach[1],allowJoint);rooms.set(key,fit)}
  const {open,working,side,scale,view}=fit
  const t=Math.max(0,Math.min(1,(seated-.32)/.68)),advance=t*t*(3-2*t)
  const seat:Point=[blend(open[0],working[0],advance),blend(open[1],working[1],advance)]
  const hip:Point=[blend(approach[0],seat[0],seated),blend(approach[1]-41,seat[1],seated)]
  const tx=hip[0]-side*scale*view.hip[0],ty=hip[1]-scale*view.hip[1]
  const head:Point=[side*scale*view.head[0]+tx,scale*view.head[1]+ty]
  return {...fit,advance,seat,
    chairTransform:`translate(${seat[0]-open[0]} ${seat[1]-open[1]})`,
    body:`matrix(${side*scale} 0 0 ${scale} ${tx} ${ty})`,
    undoChair:`translate(${open[0]-seat[0]} ${open[1]-seat[1]})`,
    center:[blend(hip[0],head[0],.58),blend(hip[1],head[1],.58)] as Point}
}

export function BedroomDeskPose({id,skinId,roomId,room,background,approach,seated,elapsed,animate,waiting=false,allowJoint=true}:{
  id:ResidentId; skinId?:string|undefined; roomId:BedroomRoom; room:Geometry; background:string; approach:Point
  seated:number; elapsed:number; animate:boolean; waiting?:boolean; allowJoint?:boolean
}) {
  const clipId=useId()
  const pose=getDeskRearPose(id,skinId)
  if(!pose)return null
  const layout=deskPlacement(roomId,pose,approach,seated,allowJoint)
  const {side,advance,seat,chairTransform,body,angle,view,undoChair}=layout
  const slot=phoneRoles.indexOf(id),beat=elapsed%(4200+slot*137)
  const frame=animate && beat<2750?Math.floor(beat/(111+slot*3))%pose.count:0
  const [width,height]=pose.cell,night=background.includes('-night.')
  const ankleBeat=(elapsed+slot*370)%(6700+slot*160)
  const ankle=animate && ankleBeat<860?[0,1,3,5,0][Math.min(4,Math.floor(ankleBeat/172))]!:0
  const joint=angle==='joint'?pose.joints?.[roomId]:undefined
  const row=angle==='oblique'?height:0
  const high=angle==='highOblique'
  const src=high?pose.highOblique!.src:pose.src
  const sheetHeight=high?height:height*2
  const lap=view.hip[1]-view.headHeight*.19
  const legClip=clipId+'-desk',front=deskFront[roomId]
  const plate=chairGeometry[roomId],profile=chairProfile[roomId]
  if(joint){
    const enter=Math.max(0,Math.min(1,(seated-.65)/.32))
    if(enter===0)return <BedroomDeskPose {...{id,skinId,roomId,room,background,approach,seated,elapsed,animate,waiting}} allowJoint={false}/>
    const [cw,ch]=joint.cell,[sw,sh]=joint.imageSize,[wx,wy,ww,wh]=joint.hands
    const [r,g,b]=joint.nightTint,shade=clipId+'-lamp'
    return <g data-bedroom-pose="computer" data-bedroom-frame={frame} data-desk-facing="backRight"
      data-desk-view="joint" data-desk-action={waiting?'waiting':animate && beat>=2750?'reading':'typing'}>
      {enter<1 && <g opacity={1-enter}><BedroomDeskPose {...{id,skinId,roomId,room,background,approach,seated,elapsed,animate,waiting}} allowJoint={false}/></g>}
      <g opacity={enter}>
        <ChairLayer roomId={roomId} night={night} underlay/>
        <g data-bedroom-original-chair="" transform={chairTransform}><ChairLayer roomId={roomId} night={night}/></g>
        <DeskScreen id={id} surface={screens[roomId]} tint="#a2cfdd" elapsed={animate?elapsed:0}/>
        {night && <defs><filter id={shade} colorInterpolationFilters="sRGB"><feColorMatrix values={`${r} 0 0 0 0 0 ${g} 0 0 0 0 0 ${b} 0 0 0 0 0 1 0`}/></filter></defs>}
        <g data-bedroom-seated-body="" transform={body} data-body-projection="seated" filter={night?`url(#${shade})`:undefined}>

          <svg data-bedroom-joint-chair="" width={cw} height={ch} viewBox={`0 0 ${cw} ${ch}`} overflow="hidden">
            <image href={joint.src} width={sw} height={sh}/>
          </svg>
          <svg data-bedroom-joint-hands="" x={wx} y={wy} width={ww} height={wh} viewBox={`${frame*(ww+8)+4} ${ch+4} ${ww} ${wh}`} overflow="hidden">
            <image href={joint.src} width={sw} height={sh}/>
          </svg>
        </g>
      </g>
    </g>
  }
  return <g data-bedroom-pose="computer" data-bedroom-frame={frame} data-desk-facing={side<0?'backLeft':'backRight'}
    data-desk-view={high?'high-oblique':angle==='oblique'?'three-quarter':'rear'} data-desk-action={waiting?'waiting':animate && beat>=2750?'reading':'typing'}>
    {advance>0 && <><ChairLayer roomId={roomId} night={night} underlay/>
      <g transform={chairTransform}><ChairLayer roomId={roomId} night={night}/></g></>}
    {seated>.6 && <DeskScreen id={id} surface={screens[roomId]} tint={['#88c9da','#ccbae3','#efb888','#9fc1ff','#d9b77d','#f2c4ce','#a8dbea','#aeace6'][slot]!} elapsed={animate?elapsed:0}/>}
    <defs>
      <clipPath id={legClip}><path d={'M0 0H2000V1200H0Z '+desktopLip(roomId)} clipRule="evenodd"/></clipPath>
      {front && <clipPath id={legClip+'-cabinet'}><path d={'M0 0H2000V1200H0Z '+front} clipRule="evenodd"/></clipPath>}
      <clipPath id={clipId+'-near-arm'}><path d={profile.nearSide} transform={`translate(${plate.x} ${plate.y})`}/></clipPath>
      <clipPath id={clipId+'-sleeve'}><path d={view.forearm}/></clipPath>
    </defs>
    <ellipse cx={seat[0]} cy={seat[1]+1} rx={cushionWidth[roomId]*.195} ry="4"
      transform={`rotate(${-side*12} ${seat[0]} ${seat[1]+1})`} fill="#211d19" opacity={.22*seated}/>
    <g data-bedroom-seated-body="">
      <g transform={body} data-body-projection="seated">
        <svg width={width} height={lap+.3} viewBox={`${frame*width} ${row} ${width} ${lap+.3}`} overflow="hidden">
          <image href={src} width={width*pose.count} height={sheetHeight}/>
        </svg>
      </g>
      <g clipPath={`url(#${legClip})`} data-bedroom-desk-front-lip="">
        <g clipPath={front?`url(#${legClip}-cabinet)`:undefined}>
          <g transform={body}>
            <svg y={lap} width={width} height={view.ankleLine-lap+.3}
              viewBox={`${frame*width} ${row+lap} ${width} ${view.ankleLine-lap+.3}`} overflow="hidden">
              <image href={src} width={width*pose.count} height={sheetHeight}/>
            </svg>
            <svg y={view.ankleLine} width={width} height={height-view.ankleLine}
              data-bedroom-seated-legs="" data-ankle-frame={ankle} viewBox={`${ankle*width} ${row+view.ankleLine} ${width} ${height-view.ankleLine}`} overflow="hidden">
              <image href={src} width={width*pose.count} height={sheetHeight}/>
            </svg>
          </g>
        </g>
      </g>
    </g>
    <defs><clipPath id={clipId}><path d={chairBack[roomId]}/>
      <path data-bedroom-chair-near-side="" transform={`translate(${plate.x} ${plate.y})`} d={profile.nearSide}/>
    </clipPath></defs>
    <g data-bedroom-chair-foreground="" transform={chairTransform}><g clipPath={`url(#${clipId})`}>
      <ChairLayer roomId={roomId} night={night}/>
    </g></g>
    <g data-bedroom-near-sleeve="" transform={chairTransform}>
      <g clipPath={`url(#${clipId}-near-arm)`}><g transform={undoChair}><g transform={body}>
        <g clipPath={`url(#${clipId}-sleeve)`}>
          <svg width={width} height={lap} viewBox={`${frame*width} ${row} ${width} ${lap}`} overflow="hidden">
            <image href={src} width={width*pose.count} height={sheetHeight}/>
          </svg>
        </g>
      </g></g></g>
    </g>
  </g>
}

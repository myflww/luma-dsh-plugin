import { getRoomSeatedDrawing } from './roomSeated.ts'
import { getDeskRearPose } from './deskRearPose.ts'
import { standingFigureHeight } from './officeFigureScale.ts'
import { officeKeyboardCenter, officeKeyboardContact } from './officeKeyboardContact.ts'
import { sampleDeskRhythm } from './deskRhythm.ts'
import shells from './officeChairShells.generated.json'
import reception from './officeReceptionPoses.generated.json'
import { OFFICE_WORKSTATION_IDS } from '../../office-workflow/shared/office-workstations.ts'

type Point = readonly [number, number]
type Polygon = readonly Point[]
type Station = { id:string; seat:Point; keyboard?:Point; facing?:string }
type FrontPose = { src:string; sha256:string; cell:Point; count:number; hip:Point; headHeight:number; palms:Point }
const frontPoses = reception as unknown as Readonly<Record<string,FrontPose>>
const chairShapes = shells as unknown as Readonly<Record<string,Readonly<Record<string,readonly Polygon[]>>>>
// Eye spacing in the standing portrait / the occupied front chair, measured at
// the same floor depth. A halo, horns or long side locks inflate outline widths.
const receptionEyeSpacing:Readonly<Record<string,number>>={
  'gemini-v1':39/48,
  'jingyuniang-v1':38/42,
  'longmama-base':41/44,
  'longmama-v1':41/46,
}
// Straight-back paintings have a compact crown. Register to the same outfit's
// walk-away and seated side portraits at a 150 px standing height. Compare the
// upper head and matched ears/ornaments, excluding loose hair below the nape.
const rearCrownScale:Readonly<Record<string,number>>={
  'bai-shuangming-base':65/59, 'bai-shuangming-v1':65/55,
  'claude-base':67/60, 'claude-v1':65/54,
  'gemini-v1':68/59, 'grok-v1':72/60,
  'jingyuniang-base':65/59, 'jingyuniang-v1':63/54,
  'longmama-base':70/62, 'longmama-v1':69/58,
  'lu-mi-base':65/64, 'lu-mi-v1':61/53,
  'shan-base':70/59, 'shan-v1':67/56,
}
// Screen centres on the installed 1672 × 941 backgrounds. The keyboard may
// sit off-centre on a curved desk. Read the screen for the torso direction,
// then register the wrists separately on the usable part of the keyboard.
const screens: Readonly<Record<string, readonly (Point | null)[]>> = {
  classic: [[804,304],[936,313],[1059,352],[668,503],[800,500],[941,518],[157,433],[223,618],null],
  'office.claude.v1': [[516,251],[609,267],[703,282],[381,518],[492,487],[602,458],[1019,415],[1133,436],[1258,459]],
  'office.gemini.v1': [[607,253],[1063,253],[534,399],[624,367],[1046,368],[1138,398],[706,560],[835,580],[968,559]],
  'office.grok.v1': [[424,377],[526,397],[637,404],[1051,403],[1162,394],[1266,378],[702,553],[836,558],[969,553]],
  'office.jingyuniang.v1': [[749,254],[916,254],[357,496],[472,453],[781,384],[894,429],[1227,448],[1340,498],null],
  'office.longmama.v1': [[689,276],[837,267],[984,276],[190,290],[1483,290],[379,394],[486,485],[1295,392],[1188,484]],
}

// These chairs expose their near arm and the side of the cushion. Select
// the independently painted high three-quarter view at that physical seat.
const sideChairs: Readonly<Record<string,readonly string[]>> = {
  classic:['private-upper','private-lower'],
  'office.gemini.v1':['west-studio','south-right'],
  'office.jingyuniang.v1':['west-studio','south-left','south-focus','south-right','private-upper','private-lower'],
}

export interface OfficeDeskDrawing {
  src:string; sha256:string; cell:Point; count:number; bank:number; mirror:boolean
  scale:number; origin:Point; hip:Point; palm:Point; facing:'rear'|'rearLeft'|'rearRight'|'front'
  hiddenShins?:readonly [left:number,right:number,top:number]
}

/** The chair is part of the room. Trace its real upholstery instead of filling the slot polygon. */
export function officeDeskShell(theme:string,stationId:string) {
  return chairShapes[theme]?.[stationId]
}

export function classicOfficeDeskPlacement(station:{id:string;seatPoint:Point|null;typingFacing:string},role:string,skinId?:string){
  return officeDeskPlacement('classic',{id:station.id,seat:station.seatPoint??[838,753],facing:station.typingFacing},role,skinId)
}

/** Seat and keyboard are two independent contact surfaces in the same projection. */
export function officeDeskPlacement(theme:string,station:Station,role:string,skinId?:string):OfficeDeskDrawing|undefined {
  if(role==='lu-mi')return lumiDeskPlacement(theme,station,role,skinId)
  const pose=getDeskRearPose(role,skinId)
  if(!pose)return undefined
  const {id,seat}=station
  const key=role+'-'+(skinId || role==='gemini' || role==='grok'?'v1':'base')
  const front=station.facing==='front' || theme==='classic' && id==='reception'
  if(front){
    const art=frontPoses[key]
    if(!art)return undefined
    const scale=standingFigureHeight(seat[1])*.355*(receptionEyeSpacing[key]??1)/art.headHeight
    const surface:Point=theme==='classic'?[838,753]:[seat[0],(station.keyboard?.[1]??seat[1]+16)-3]
    const origin:Point=[surface[0]-art.palms[0]*scale,surface[1]-art.palms[1]*scale]
    return {...art,origin,scale,hip:[origin[0]+art.hip[0]*scale,origin[1]+art.hip[1]*scale],
      palm:surface,bank:0,mirror:false,facing:'front'}
  }
  const keys=officeKeyboardCenter(theme,id)
  if(!keys || station.keyboard && Math.hypot(keys[0]-station.keyboard[0],keys[1]-station.keyboard[1])>35)return undefined
  const dy=keys[1]-seat[1]
  if(dy>=0)return undefined
  const screen=screens[theme]?.[OFFICE_WORKSTATION_IDS.findIndex(slot=>slot===id)]
  if(!screen)return undefined
  const screenOffset=screen[0]-seat[0]
  const oblique=Math.abs(screenOffset)>=9
  const mirror=oblique && screenOffset<0
  const high=sideChairs[theme]?.includes(id)?pose.highOblique:undefined
  const shallow=oblique && !high && Math.abs(screenOffset)<=22 ? pose.shallow : undefined
  const view=high??shallow??(oblique?pose.oblique:pose.rear)
  const crown=oblique?1:rearCrownScale[key]??1
  const scale=standingFigureHeight(seat[1])*.375*crown/view.headHeight
  const direction=mirror?-1:1
  const reachX=(view.palms[0][0]+view.palms[1][0])/2-view.hip[0]
  const reachY=(view.palms[0][1]+view.palms[1][1])/2-view.hip[1]
  // Front-on wrists disappear behind the nape. Centre the head over its cushion
  // and allow only a small seated lean, never a full arm's lateral translation.
  const clamp=(v:number,limit:number)=>Math.max(-limit,Math.min(limit,v))
  const wristAtRest:Point=[seat[0]+(oblique?reachX*direction*scale:0),seat[1]+reachY*scale]
  const contact=officeKeyboardContact(theme,id,wristAtRest)??keys
  const hip:Point=[seat[0]+clamp(contact[0]-wristAtRest[0],shallow?7:oblique?22:5),
    seat[1]+clamp(contact[1]-wristAtRest[1],Math.max(26,-dy*.56))]
  const origin:Point=[hip[0]-(mirror?pose.cell[0]-view.hip[0]:view.hip[0])*scale,hip[1]-view.hip[1]*scale]
  return {src:high?.src??pose.src,sha256:high?.sha256??pose.sha256,cell:pose.cell,count:pose.count,bank:high?0:shallow?2:oblique?1:0,mirror,
    // Both lower legs point forward under the desk in this projection. Keep
    // the outer drape of the outfit and hair visible at the sides of the seat.
    ...(!oblique && view.wristsOccluded ? {hiddenShins:[view.hip[0]-view.headHeight*.37,view.hip[0]+view.headHeight*.37,view.knee[1]] as const}:{}),
    facing:oblique?(mirror?'rearLeft':'rearRight'):'rear',origin,scale,hip,
    palm:[hip[0]+(oblique?reachX*direction*scale:0),hip[1]+reachY*scale]}
}

export function officeDeskFrame(pose:OfficeDeskDrawing,actor:string,elapsedMs:number,working:boolean,ambient:boolean) {
  if(!working)return 0
  const stepMs=actor==='lu-mi'?65:130
  const beat=sampleDeskRhythm(actor,elapsedMs,pose.count*stepMs,ambient)
  return beat.reading?0:Math.floor(beat.stripElapsedMs/stepMs)%pose.count
}

function lumiDeskPlacement(theme:string,station:Station,role:string,skinId?:string):OfficeDeskDrawing|undefined {
  const {id,seat}=station
  const front=station.facing==='front' || theme==='classic' && id==='reception'
  if(front){
    const art=getRoomSeatedDrawing(role,skinId,'front')
    if(!art)return undefined
    const scale=standingFigureHeight(seat[1])*.355/art.crownWidth
    const surface:Point=theme==='classic'?[838,753]:[seat[0],(station.keyboard?.[1]??seat[1]+16)-3]
    const origin:Point=[surface[0]-art.hand[0]*scale,surface[1]-art.hand[1]*scale]
    return {...art,origin,scale,hip:[origin[0]+art.hip[0]*scale,origin[1]+art.hip[1]*scale],
      palm:surface,bank:0,mirror:false,facing:'front'}
  }
  const keys=officeKeyboardCenter(theme,id)
  if(!keys || station.keyboard && Math.hypot(keys[0]-station.keyboard[0],keys[1]-station.keyboard[1])>35)return undefined
  const dy=keys[1]-seat[1]
  if(dy>=0)return undefined
  const screen=screens[theme]?.[OFFICE_WORKSTATION_IDS.findIndex(slot=>slot===id)]
  if(!screen)return undefined
  const screenOffset=screen[0]-seat[0]
  const oblique=Math.abs(screenOffset)>=9
  const left=screenOffset<0
  const side=oblique && sideChairs[theme]?.includes(id)
  const shallow=oblique && !side && Math.abs(screenOffset)<=22
  const angle=!oblique?'rear':shallow?(left?'shallowLeft':'shallowRight')
    :side?(left?'sideLeft':'sideRight'):(left?'quarterLeft':'quarterRight')
  const view=getRoomSeatedDrawing(role,skinId,angle)
  if(!view)return undefined
  // Lu Mi's long straight hair and horns extend beyond the actual head.
  // Fit the registered crown and keep the long back hem behind the seat shell.
  const scale=standingFigureHeight(seat[1])*.35/view.crownWidth
  const reachX=view.hand[0]-view.hip[0],reachY=view.hand[1]-view.hip[1]
  // Front-on wrists disappear behind the nape. Centre the head over its cushion
  // and allow only a small seated lean, never a full arm's lateral translation.
  const clamp=(v:number,limit:number)=>Math.max(-limit,Math.min(limit,v))
  const wristAtRest:Point=[seat[0]+(oblique?reachX*scale:0),seat[1]+reachY*scale]
  const contact=officeKeyboardContact(theme,id,wristAtRest)??keys
  const hip:Point=[seat[0]+clamp(contact[0]-wristAtRest[0],shallow?7:oblique?22:5),
    seat[1]+clamp(contact[1]-wristAtRest[1],Math.max(26,-dy*.56))]
  const origin:Point=[hip[0]-view.hip[0]*scale,hip[1]-view.hip[1]*scale]
  return {...view,bank:0,mirror:false,
    ...(!oblique?{hiddenShins:[0,view.cell[0],view.hip[1]-view.figureHeight*.065] as const}:{}),
    facing:oblique?(left?'rearLeft':'rearRight'):'rear',origin,scale,hip,
    palm:[hip[0]+(oblique?reachX*scale:0),hip[1]+reachY*scale]}

}

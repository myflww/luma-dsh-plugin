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
// Projection of each real seat's near-to-far axis. A private cubicle or wing
// of a curved bank can face sideways even when its screen is mounted off-centre.
// The sign selects left/right. Magnitude two selects the higher three-quarter painting.
const seatYaw:Readonly<Record<string,readonly number[]>>={
  classic:[0,0,0,0,0,0,-2,-2,0],
  'office.claude.v1':[1,1,1,-1,-1,-1,1,1,1],
  'office.gemini.v1':[-1,1,-2,-1,1,2,1,0,-1],
  'office.grok.v1':[0,0,0,0,0,-1,1,0,-1],
  'office.jingyuniang.v1':[0,0,-2,-2,2,2,2,2,0],
  'office.longmama.v1':[-1,0,1,-1,1,1,1,-1,-1],
}

export interface OfficeDeskDrawing {
  src:string; sha256:string; cell:Point; count:number; bank:number; mirror:boolean
  scale:number; origin:Point; hip:Point; palm:Point; facing:'rear'|'rearLeft'|'rearRight'|'front'
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
  const pose=getDeskRearPose(role,skinId)
  if(!pose)return undefined
  const {id,seat}=station
  const front=station.facing==='front' || theme==='classic' && id==='reception'
  if(front){
    const key=role+'-'+(skinId || role==='gemini' || role==='grok'?'v1':'base')
    const art=frontPoses[key]
    if(!art)return undefined
    const scale=standingFigureHeight(seat[1])*.355/art.headHeight
    const surface:Point=theme==='classic'?[838,753]:[seat[0],(station.keyboard?.[1]??seat[1]+16)-3]
    const origin:Point=[surface[0]-art.palms[0]*scale,surface[1]-art.palms[1]*scale]
    return {...art,origin,scale,hip:[origin[0]+art.hip[0]*scale,origin[1]+art.hip[1]*scale],
      palm:surface,bank:0,mirror:false,facing:'front'}
  }
  const keys=officeKeyboardCenter(theme,id)
  if(!keys || station.keyboard && Math.hypot(keys[0]-station.keyboard[0],keys[1]-station.keyboard[1])>35)return undefined
  const dy=keys[1]-seat[1]
  if(dy>=0)return undefined
  const yaw=seatYaw[theme]?.[OFFICE_WORKSTATION_IDS.findIndex(s=>s===id)]??0
  const oblique=yaw!==0
  const mirror=yaw<0
  const high=Math.abs(yaw)===2?pose.highOblique:undefined
  const view=high??(oblique?pose.oblique:pose.rear)
  const scale=standingFigureHeight(seat[1])*.375/view.headHeight
  const direction=mirror?-1:1
  const reachX=(view.palms[0][0]+view.palms[1][0])/2-view.hip[0]
  const reachY=(view.palms[0][1]+view.palms[1][1])/2-view.hip[1]
  // Front-on wrists disappear behind the nape. Centre the head over its cushion
  // and allow only a small seated lean, never a full arm's lateral translation.
  const clamp=(v:number,limit:number)=>Math.max(-limit,Math.min(limit,v))
  const wristAtRest:Point=[seat[0]+(oblique?reachX*direction*scale:0),seat[1]+reachY*scale]
  const contact=officeKeyboardContact(theme,id,wristAtRest)??keys
  const hip:Point=[seat[0]+clamp(contact[0]-wristAtRest[0],oblique?22:5),
    seat[1]+clamp(contact[1]-wristAtRest[1],Math.max(26,-dy*.56))]
  const origin:Point=[hip[0]-(mirror?pose.cell[0]-view.hip[0]:view.hip[0])*scale,hip[1]-view.hip[1]*scale]
  return {src:high?.src??pose.src,sha256:high?.sha256??pose.sha256,cell:pose.cell,count:pose.count,bank:high?0:oblique?1:0,mirror,
    facing:oblique?(mirror?'rearLeft':'rearRight'):'rear',origin,scale,hip,
    palm:[hip[0]+(oblique?reachX*direction*scale:0),hip[1]+reachY*scale]}
}

export function officeDeskFrame(pose:OfficeDeskDrawing,actor:string,elapsedMs:number,working:boolean,ambient:boolean) {
  if(!working)return 0
  const beat=sampleDeskRhythm(actor,elapsedMs,pose.count*130,ambient)
  return beat.reading?0:Math.floor(beat.stripElapsedMs/130)%pose.count
}

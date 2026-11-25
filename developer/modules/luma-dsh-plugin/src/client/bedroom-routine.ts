import { PERSONAL_BEDROOMS } from './bedroom-personal-layouts.ts'
import { mapShopBedrooms, SHOP_BEDROOM_LAYOUTS } from './bedroom-shop-layouts.ts'
import { isShopBedroomId } from '../shared/shop-bedrooms.ts'
import { BEDROOM_WALKABLE, bedroomFloorRoute, floorDistance, type BedroomRoom } from './bedroom-floor.ts'
import { OFFICE_OPEN_MINUTE, OFFICE_CLOSE_MINUTE, OFFICE_WORK_START_MINUTE, OFFICE_WORK_END_MINUTE } from '../../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/office-time/domain/timePolicy.ts'
import type { OfficeWalkDirection } from '../../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/office2d/employeeCatalog.ts'
import { BEDROOM_ART, getBedroomArt } from './bedroom-art.generated.ts'
import type { OfficeEmployeeVisualState } from '../../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/office-harness/HarnessOfficeProjectionAdapter.ts'

export type ResidentId = keyof typeof BEDROOM_ART
/** A finished report stays in the employee's chat without keeping them at work. */
export function canResumeBedroomRoutine(state:OfficeEmployeeVisualState['taskState'] | undefined) {
  return state==='idle' || state==='completed' || state==='failed'
}
export type Point = readonly [number, number]
type Stop = 'bed' | 'desk' | 'nook' | 'entry' | 'center'
type Floor = Record<Stop, Point>
// Foot contacts on the open floor in each shipped illustration. Every stop
// connects to the center aisle, keeping straight-line walks off the furniture.
const smallRoom: Floor = { bed:[549,621], center:[782,760], desk:[749,712], nook:[985,656], entry:[930,765] }
export const BEDROOM_FLOORS: Record<BedroomRoom, Floor> = {
  ...mapShopBedrooms(layout=>layout.stops),
  classic:smallRoom, shan:PERSONAL_BEDROOMS['shan'].stops, 'bai-shuangming':PERSONAL_BEDROOMS['bai-shuangming'].stops, 'lu-mi':PERSONAL_BEDROOMS['lu-mi'].stops,
  jingyuniang:{bed:[636,587], center:[807,577], desk:[1171,521], nook:[903,478], entry:[790,751]},
  longmama:{bed:[533,612], center:[800,544], desk:[1173,540], nook:[863,464], entry:[796,753]},
  claude:{bed:[692,685], center:[857,671], desk:[1281,708], nook:[790,528], entry:[908,793]},
  gemini:{bed:[608,572], center:[802,622], desk:[1201,617], nook:[880,481], entry:[796,758]},
  grok:{bed:[620,629], center:[807,563], desk:[1166,573], nook:[814,493], entry:[800,765]},
}
export type BedroomPose = 'idle' | 'walk' | 'phone' | 'computer' | 'sit' | 'rise' | 'recline' | 'get-up'
export interface BedroomStep {
  pose:BedroomPose
  start:number
  end:number
  from:Point
  to:Point
  facing:OfficeWalkDirection
  moving:boolean
  activity:string
  strideStart?:number
  /** Adjacent floor segments share a tangent in the open aisle. */
  throughFrom?:Point
  throughTo?:Point
  arrivalFacing?:OfficeWalkDirection
  departureFacing?:OfficeWalkDirection
  /** A furniture invitation can interrupt a sitting or standing transition. */
  initialContact?:number
}
export interface BedroomRoutine { start:number; end:number; steps:BedroomStep[] }
type Speeds = Record<OfficeWalkDirection, number>
const minute = 60_000
const origin = (day:Date,minuteOfDay:number) =>
  new Date(day.getFullYear(),day.getMonth(),day.getDate(),0,minuteOfDay).getTime()

const deskPastime: Record<ResidentId, string> = {
  jingyuniang:'在电脑上整理航海手记', shan:'在电脑上看画稿', 'bai-shuangming':'在电脑上查资料', 'lu-mi':'在电脑上给蓝蔷薇相册排封面',
  longmama:'在电脑上写日记', claude:'在电脑上整理手账', gemini:'在电脑上记笔记', grok:'在电脑上解谜',
}
function direction(from:Point,to:Point):OfficeWalkDirection {
  const dx=to[0]-from[0], dy=to[1]-from[1]
  return Math.abs(dx)>Math.abs(dy) ? dx>=0?'right':'left' : dy>=0?'down':'up'
}
export function bedroomFurnitureFacing(room:BedroomRoom,target:'bed'|'desk'):OfficeWalkDirection {
  if(target==='bed')return direction(BEDROOM_FLOORS[room].bed,getBedroomArt(room).head)
  const layout=isShopBedroomId(room)?SHOP_BEDROOM_LAYOUTS[room]:
    Object.hasOwn(PERSONAL_BEDROOMS,room)?PERSONAL_BEDROOMS[room as keyof typeof PERSONAL_BEDROOMS]:undefined
  if(!layout)return 'right'
  const [,right,bottom]=layout.screen
  return (right[0]+bottom[0])/2<layout.chair.seat[0]?'left':'right'
}
function activityAt(stop:Stop,id:ResidentId):string {
  if(stop==='desk') return deskPastime[id]
  if(stop==='bed') return '躺在床上看手机'
  if(stop==='nook') return '在角落安静独处'
  return '在房间里伸展休息'
}

/** The same local date, outfit and calendar yield the same pose after changing
 * rooms or reopening the plugin. The brief walks join longer purposeful stops. */
export function createBedroomRoutine(id:ResidentId, room:BedroomRoom, date:Date, workingDay:boolean, speeds:Speeds):BedroomRoutine {
  const returning = workingDay && date.getHours()*60 >= OFFICE_WORK_END_MINUTE
  const start=origin(date,returning ? OFFICE_WORK_END_MINUTE : OFFICE_OPEN_MINUTE)
  const end=origin(date,workingDay && !returning ? OFFICE_WORK_START_MINUTE : OFFICE_CLOSE_MINUTE)
  const floor=BEDROOM_FLOORS[room]
  const tracedRoom=Object.hasOwn(PERSONAL_BEDROOMS,room) || isShopBedroomId(room)
  const steps:BedroomStep[]=[]
  const paths=new Map<string,readonly Point[]>()
  let cursor:Stop=returning?'entry':'bed'
  let time=start
  let seed=date.getDate()+date.getMonth()*31
  for(const char of id) seed=(Math.imul(seed,31)+char.charCodeAt(0))>>>0
  const next=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed}
  const wait=(ms:number,activity:string,facing:OfficeWalkDirection,pose:BedroomPose='idle') =>{
    if(ms<=0) return
    steps.push({start:time,end:time+ms,from:floor[cursor],to:floor[cursor],facing,moving:false,activity,pose})
    time+=ms
  }
  const walk=(target:Stop,activity:string) =>{
    if(cursor===target) return
    const key=cursor+'-'+target
    let path=paths.get(key)
    if(!path){path=tracedRoom?bedroomFloorRoute(room,floor[cursor],floor[target]):[floor[cursor],floor[target]];paths.set(key,path)}
    for(let i=1;i<path.length;i++){
      const from=path[i-1]!,to=path[i]!,facing=direction(from,to)
      const duration=1000*Math.hypot(from[0]-to[0],from[1]-to[1])/speeds[facing]
      if(!duration)continue
      steps.push({start:time,end:time+duration,from,to,facing,moving:true,activity,pose:'walk'})
      time+=duration
    }
    cursor=target
  }
  if (returning) wait(4_000,'刚回到房间','down')
  else {
    wait(2_600,'刚刚醒来','down','phone')
    wait(1_400,'起床活动','down','get-up')
  }
  walk('center','在房间里散步')
  const stops = ['desk','nook','bed'] as const
  let index=next()%3
  const quiet = ['up','down','left'] as const
  // A complete errand and the journey home always fit in the reserved tail.
  while(time < end - 2*minute) {
    index=(index+1+(next()>>>8)%2)%3
    const stop=stops[index]!
    walk(stop,'在房间里散步')
    if(stop==='bed') wait(1_400,'正在躺下',bedroomFurnitureFacing(room,'bed'),'recline')
    if(stop==='desk') wait(820,'在电脑前坐下',bedroomFurnitureFacing(room,'desk'),'sit')
    wait(18_000+(next()>>>8)%32_000,activityAt(stop,id),quiet[index]!,stop==='bed'?'phone':stop==='desk'?'computer':'idle')
    if(stop==='bed') wait(1_400,'从床上起身',bedroomFurnitureFacing(room,'bed'),'get-up')
    if(stop==='desk') wait(820,'离开书桌',bedroomFurnitureFacing(room,'desk'),'rise')
    walk('center','在房间里散步')
    wait(2_000+(next()>>>8)%5_000,'在房间里伸展休息','down')
  }
  const finalStop=workingDay && !returning?'entry':'bed'
  const target=floor[finalStop]
  const finalPath=tracedRoom?bedroomFloorRoute(room,floor.center,target):[floor.center,target]
  const travel=finalPath.slice(1).reduce((ms,next,i)=>ms+1000*floorDistance(finalPath[i]!,next)/speeds[direction(finalPath[i]!,next)],0)
  wait(end-time-travel-2_000,finalStop==='entry'?'在准备上班':'正在收拾房间','down')
  walk(finalStop,finalStop==='entry'?'正准备出门':'正准备入睡')
  if(finalStop==='bed') wait(1_400,'正在躺下',bedroomFurnitureFacing(room,'bed'),'recline')
  wait(end-time,finalStop==='entry'?'正准备出门':'正准备入睡','left',finalStop==='bed'?'phone':'idle')
  let distance = 0
  for (const [i, step] of steps.entries()) {
    const previous = steps[i-1], nextStep = steps[i+1]
    step.strideStart = distance
    if (step.moving) {
      distance += Math.hypot(step.to[0]-step.from[0], step.to[1]-step.from[1])
      // A shortest path bends at an obstacle boundary. Rounding that corner
      // could cut across the cave's pool, a chair or the edge of the train.
      if (previous?.moving && !BEDROOM_WALKABLE[room].includes(step.from)) step.throughFrom = previous.from
      if (nextStep?.moving && !BEDROOM_WALKABLE[room].includes(step.to)) step.throughTo = nextStep.to
    } else {
      if (previous?.moving) step.arrivalFacing = previous.facing
      if (nextStep?.moving) step.departureFacing = nextStep.facing
    }
  }
  return {start,end,steps}
}

export function bedroomStepAt(routine:BedroomRoutine, now:number) {
  let left=0, right=routine.steps.length-1
  while(left<right) {
    const middle=(left+right)>>>1
    if(routine.steps[middle]!.end<=now) left=middle+1
    else right=middle
  }
  return routine.steps[left]!
}
const distance = (a:Point, b:Point) => Math.hypot(b[0]-a[0], b[1]-a[1])
const mix = (a:Point, b:Point, t:number):Point => [a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t]
const easeFromRest = (u:number) => u*u*(2-u)

/** The central aisle is traversed at walking pace. Only a real stop gets a
 * launch or braking interval. The middle retains the atlas' calibrated stride. */
export function bedroomTravelAt(step:BedroomStep, now:number) {
  const t=Math.max(0,Math.min(1,(now-step.start)/(step.end-step.start)))
  const ramp=Math.min(.2,210/Math.max(1,step.end-step.start))
  const fraction = !step.throughFrom && t<ramp ? ramp*easeFromRest(t/ramp)
    : !step.throughTo && t>1-ramp ? 1-ramp*easeFromRest((1-t)/ramp) : t
  return fraction*distance(step.from,step.to)
}

function radius(a:Point,b:Point,c:Point) {
  return Math.min(18, distance(a,b)*.14, distance(b,c)*.14)
}
function bend(a:Point,b:Point,c:Point,r:number,t:number) {
  const before=mix(b,a,r/distance(a,b)), after=mix(b,c,r/distance(b,c))
  return mix(mix(before,b,t),mix(b,after,t),t)
}
export function bedroomFootAt(step:BedroomStep,now:number):Point {
  const length=distance(step.from,step.to)
  if(length===0) return step.from
  const travelled=bedroomTravelAt(step,now)
  if(step.throughFrom) {
    const r=radius(step.throughFrom,step.from,step.to)
    if(r>0 && travelled<r) return bend(step.throughFrom,step.from,step.to,r,.5+travelled/(2*r))
  }
  if(step.throughTo) {
    const r=radius(step.from,step.to,step.throughTo)
    if(r>0 && length-travelled<r) return bend(step.from,step.to,step.throughTo,r,.5-(length-travelled)/(2*r))
  }
  return mix(step.from,step.to,travelled/length)
}

export function bedroomRestFacing(step:BedroomStep,now:number) {
  if(step.pose!=='idle') return step.facing
  if(step.arrivalFacing && now-step.start<750) return step.arrivalFacing
  if(step.departureFacing && step.end-now<720) return step.departureFacing
  return step.facing
}

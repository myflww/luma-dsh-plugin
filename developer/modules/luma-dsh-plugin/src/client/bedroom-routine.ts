import { OFFICE_OPEN_MINUTE, OFFICE_CLOSE_MINUTE, OFFICE_WORK_START_MINUTE, OFFICE_WORK_END_MINUTE } from '../../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/office-time/domain/timePolicy.ts'
import type { OfficeWalkDirection } from '../../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/office2d/employeeCatalog.ts'
import { BEDROOM_ART } from './bedroom-art.generated.ts'

export type ResidentId = keyof typeof BEDROOM_ART
export type Point = readonly [number, number]
type Stop = 'bed' | 'desk' | 'nook' | 'entry' | 'center'
type Floor = Record<Stop, Point>
// Foot contacts on the open floor in each shipped illustration. Every stop
// connects to the center aisle, keeping straight-line walks off the furniture.
const smallRoom: Floor = { bed:[549,616], center:[797,709], desk:[744,673], nook:[987,653], entry:[926,730] }
export const BEDROOM_FLOORS: Record<ResidentId | 'classic', Floor> = {
  classic:smallRoom, shan:smallRoom, 'bai-shuangming':smallRoom, 'lu-mi':smallRoom,
  jingyuniang:{bed:[590,582],center:[804,582],desk:[1166,489],nook:[904,477],entry:[790,756]},
  longmama:{bed:[529,587],center:[800,605],desk:[1173,501],nook:[863,463],entry:[796,755]},
  claude:{bed:[597,598],center:[827,648],desk:[1258,672],nook:[791,526],entry:[907,795]},
  gemini:{bed:[590,552],center:[801,623],desk:[1180,581],nook:[879,481],entry:[797,774]},
  grok:{bed:[589,559],center:[804,555],desk:[1138,547],nook:[814,494],entry:[798,768]},
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
}
export interface BedroomRoutine { start:number; end:number; steps:BedroomStep[] }
type Speeds = Record<OfficeWalkDirection, number>
const minute = 60_000
const origin = (day:Date,minuteOfDay:number) =>
  new Date(day.getFullYear(),day.getMonth(),day.getDate(),0,minuteOfDay).getTime()

const deskPastime: Record<ResidentId, string> = {
  jingyuniang:'在电脑上整理航海手记', shan:'在电脑上看画稿', 'bai-shuangming':'在电脑上查资料', 'lu-mi':'在电脑上编辑乐谱',
  longmama:'在电脑上写日记', claude:'在电脑上整理手账', gemini:'在电脑上记笔记', grok:'在电脑上解谜',
}
function direction(from:Point,to:Point):OfficeWalkDirection {
  const dx=to[0]-from[0], dy=to[1]-from[1]
  return Math.abs(dx)>Math.abs(dy) ? dx>=0?'right':'left' : dy>=0?'down':'up'
}
function activityAt(stop:Stop,id:ResidentId):string {
  if(stop==='desk') return deskPastime[id]
  if(stop==='bed') return '躺在床上看手机'
  if(stop==='nook') return '在角落安静独处'
  return '在房间里伸展休息'
}

/** The same local date, outfit and calendar yield the same pose after changing
 * rooms or reopening the plugin. The brief walks join longer purposeful stops. */
export function createBedroomRoutine(id:ResidentId, room:ResidentId|'classic', date:Date, workingDay:boolean, speeds:Speeds):BedroomRoutine {
  const returning = workingDay && date.getHours()*60 >= OFFICE_WORK_END_MINUTE
  const start=origin(date,returning ? OFFICE_WORK_END_MINUTE : OFFICE_OPEN_MINUTE)
  const end=origin(date,workingDay && !returning ? OFFICE_WORK_START_MINUTE : OFFICE_CLOSE_MINUTE)
  const floor=BEDROOM_FLOORS[room]
  const steps:BedroomStep[]=[]
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
    const from=floor[cursor], to=floor[target], facing=direction(from,to)
    const duration=1000*Math.hypot(from[0]-to[0],from[1]-to[1])/speeds[facing]
    steps.push({start:time,end:time+duration,from,to,facing,moving:true,activity,pose:'walk'})
    time+=duration
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
    if(stop==='bed') wait(1_400,'正在躺下','left','recline')
    if(stop==='desk') wait(820,'在电脑前坐下','right','sit')
    wait(18_000+(next()>>>8)%32_000,activityAt(stop,id),quiet[index]!,stop==='bed'?'phone':stop==='desk'?'computer':'idle')
    if(stop==='bed') wait(1_400,'从床上起身','down','get-up')
    if(stop==='desk') wait(820,'离开书桌','right','rise')
    walk('center','在房间里散步')
    wait(2_000+(next()>>>8)%5_000,'在房间里伸展休息','down')
  }
  const finalStop=workingDay && !returning?'entry':'bed'
  const target=floor[finalStop]
  const travel=1000*Math.hypot(target[0]-floor.center[0],target[1]-floor.center[1])/speeds[direction(floor.center,target)]
  wait(end-time-travel-2_000,finalStop==='entry'?'在准备上班':'正在收拾房间','down')
  walk(finalStop,finalStop==='entry'?'正准备出门':'正准备入睡')
  if(finalStop==='bed') wait(1_400,'正在躺下','left','recline')
  wait(end-time,finalStop==='entry'?'正准备出门':'正准备入睡','left',finalStop==='bed'?'phone':'idle')
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
export function bedroomFootAt(step:BedroomStep, now:number):Point {
  const t=Math.max(0,Math.min(1,(now-step.start)/(step.end-step.start)))
  // Ease only the first and last fifth of a walk; keep the middle stride steady.
  const ramp=.2
  const distance=t<ramp?t*t/(2*ramp):t>1-ramp?1-ramp-(1-t)*(1-t)/(2*ramp):t-ramp/2
  const fraction=distance/(1-ramp)
  return [step.from[0]+(step.to[0]-step.from[0])*fraction,step.from[1]+(step.to[1]-step.from[1])*fraction]
}

import { bedroomFloorRoute, floorDistance, type BedroomRoom } from './bedroom-floor.ts'
import { bedroomDropJourney } from './bedroom-placement.ts'
import { BEDROOM_FLOORS, bedroomFurnitureFacing, type BedroomRoutine, type BedroomStep, type Point, type ResidentId } from './bedroom-routine.ts'

export type BedroomFurniture = 'bed' | 'desk'
type Direction = BedroomStep['facing']
const lines: Record<ResidentId, readonly [bed: string, desk: string]> = {
  shan: ['这张猫猫的表情，像不像刚睡醒的我？', '帮我看看，画稿用哪种粉色？'],
  'lu-mi': ['这张蓝蔷薇拍得最好，连花瓣上的水珠都看得清。', '我画了个蓝水晶切面，放在蓝蔷薇相册的封面上怎么样？'],
  'bai-shuangming': ['你看，这张照片把月亮也拍进去了。', '正好，我存的那张星图在这里。'],
  jingyuniang: ['过来看，这只小鲸刚浮出海面。', '来，我给你看今天记下的海流。'],
  longmama: ['茶凉得慢，还有时间看一小段。', '留一行给你，今天想记下什么？'],
  claude: ['这张配色真好，我先收进相册。', '帮我挑一页手账贴纸吧。'],
  gemini: ['这句话我划了线，你也读读。', '书签找到了，我们接着上次那一页。'],
  grok: ['这个谜面挺短，你先猜。', '这一格我有两个答案，一起试试？'],
}
const settleTime = (furniture: BedroomFurniture) => furniture === 'bed' ? 1400 : 820
export const invitationReply = (id: ResidentId, furniture: BedroomFurniture) => lines[id][furniture === 'bed' ? 0 : 1]

/** A short visit followed by a floor route that intercepts the original live routine. */
export function createBedroomInvitation(room: BedroomRoom, target: BedroomFurniture, start: number, from: Point,
  seated: {target: BedroomFurniture; contact: number} | undefined, routine: BedroomRoutine, speeds: Record<Direction, number>) {
  const floor = BEDROOM_FLOORS[room]
  const steps: BedroomStep[] = []
  let now = start, point = from, stride = 0
  const append = (pose: BedroomStep['pose'], ms: number, to: Point, facing: Direction, activity: string, initialContact?: number) => {
    if (ms <= 0) return
    steps.push({start:now,end:now+ms,from:point,to,pose,facing,moving:pose==='walk',activity,strideStart:stride,
      ...(initialContact===undefined?{}:{initialContact})})
    stride += floorDistance(point,to)
    now += ms
    point = to
  }
  const same = seated?.target === target
  if (seated && !same) {
    append(seated.target==='bed'?'get-up':'rise', settleTime(seated.target)*seated.contact, point, bedroomFurnitureFacing(room,seated.target), '起身赴约', seated.contact)
  }
  const approach = bedroomFloorRoute(room,point,floor[target])
  for (const next of approach.slice(1)) {
    const dx=next[0]-point[0], dy=next[1]-point[1]
    const facing: Direction = Math.abs(dx)>Math.abs(dy) ? (dx<0?'left':'right') : (dy<0?'up':'down')
    append('walk',1000*floorDistance(point,next)/speeds[facing],next,facing,target==='bed'?'正往床边走':'正往书桌走')
  }
  const arrival = now
  const contact = same ? seated.contact : 0
  const facing=bedroomFurnitureFacing(room,target)
  append(target==='bed'?'recline':'sit',settleTime(target)*(1-contact),floor[target],facing,
    target==='bed'?'正在靠上枕头':'正在书桌前坐下',contact)
  const settled = now
  append(target==='bed'?'phone':'computer',17_000,floor[target],facing,
    target==='bed'?'一起看手机':'一起用电脑')
  const leave = now
  append(target==='bed'?'get-up':'rise',settleTime(target),floor[target],facing,'准备起身')
  const plan: BedroomRoutine = {start,end:now,steps}
  return {target,arrival,settled,leave,plan,returnTrip:bedroomDropJourney(room,floor[target],routine,now,0)}
}

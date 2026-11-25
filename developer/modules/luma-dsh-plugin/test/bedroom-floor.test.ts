import { expect, it } from 'vitest'
import { BEDROOM_WALKABLE, bedroomFloorContains, bedroomFloorRoute, floorDistance, floorMix, placeOnBedroomFloor, type BedroomRoom } from '../src/client/bedroom-floor.ts'
import { BEDROOM_FLOORS, bedroomFurnitureFacing, bedroomFootAt, bedroomStepAt, createBedroomRoutine, type Point } from '../src/client/bedroom-routine.ts'
import { bedroomDropFrame, bedroomDropJourney } from '../src/client/bedroom-placement.ts'
import { PERSONAL_BEDROOMS } from '../src/client/bedroom-personal-layouts.ts'
import { SHOP_BEDROOM_LAYOUTS } from '../src/client/bedroom-shop-layouts.ts'

// Pairs are 110 px apart at the same floor depth in the shipped illustrations,
// each comfortably away from the authored bed / desk / entrance walk lines.
const drops:Record<BedroomRoom,Point>={
  'bedroom.shop.rose-sketchbook.v1':[724,760], 'bedroom.shop.sapphire-music.v1':[736,787],
  'bedroom.shop.alpine-library.v1':[681,788], 'bedroom.shop.camellia-pavilion.v1':[734,777],
  'bedroom.shop.blue-rose-gallery.v1':[709,763], 'bedroom.shop.frostwing-glasshouse.v1':[681,788],
  classic:[824,792],shan:[734,777],'bai-shuangming':[770,595],'lu-mi':[734,782],
  jingyuniang:[728,624],longmama:[720,592],claude:[792,712],gemini:[720,672],grok:[736,616],
}

const illustrated={...PERSONAL_BEDROOMS,...SHOP_BEDROOM_LAYOUTS}
it('preserves the garden studio, cave bridge and rail carriage layouts when an earned theme is equipped',()=>{
  expect(PERSONAL_BEDROOMS.shan.head[0]).toBeGreaterThan(PERSONAL_BEDROOMS.shan.keyboard[0])
  expect(bedroomFurnitureFacing('shan','desk')).toBe('left')
  expect(bedroomFurnitureFacing('bai-shuangming','desk')).toBe('left')
  const cave=BEDROOM_FLOORS['lu-mi']
  const bridge=bedroomFloorRoute('lu-mi',cave.center,cave.nook)
  expect(bridge.length).toBeGreaterThan(2)
  expect(bedroomFloorContains(BEDROOM_WALKABLE['lu-mi'],[459,615])).toBe(false)
  expect(bedroomFloorContains(BEDROOM_WALKABLE['bai-shuangming'],[800,730])).toBe(false)
  expect(bedroomFloorContains(BEDROOM_WALKABLE.shan,[1130,300])).toBe(false)
})
it.each(Object.keys(illustrated) as (keyof typeof illustrated)[])('%s keeps the pillow, chair and keyboard off its traversable floor', room=>{
  const scene=illustrated[room], polygon=BEDROOM_WALKABLE[room]
  for(const prop of [scene.head,scene.feet,scene.chair.seat,scene.keyboard,...scene.screen]) {
    expect(bedroomFloorContains(polygon,prop),JSON.stringify(prop)).toBe(false)
  }
  for(const point of Object.values(scene.stops)) expect(bedroomFloorContains(polygon,point)).toBe(true)
  const routine=createBedroomRoutine('shan',room,new Date(2026,10,22,7),false,{left:76,right:76,down:80,up:80})
  // Verify every distinct combination of entrances and exits at the aisle,
  // including the curved transitions, against this particular room's walls.
  const sampled = new Set<string>()
  for(const step of routine.steps.filter(step=>step.moving)) {
    const key=JSON.stringify([step.from,step.to,step.throughFrom,step.throughTo])
    if(sampled.has(key)) continue
    sampled.add(key)
    for(let i=0;i<=48;i++) expect(bedroomFloorContains(polygon,bedroomFootAt(step,step.start+(step.end-step.start)*i/48)),key).toBe(true)
  }
})
it.each(Object.keys(drops) as BedroomRoom[])('%s preserves independent horizontal and diagonal placement and rejoins the current routine on open floor', room=>{
  const date=new Date(2026,10,22,14,4), now=date.getTime()
  const routine=createBedroomRoutine('jingyuniang',room,date,false,{left:76,right:76,down:80,up:80})
  const [x,y]=drops[room], polygon=BEDROOM_WALKABLE[room]
  for(const spot of [[x,y],[x+110,y],[x+55,y-20]] as const){
    const trip=bedroomDropJourney(room,spot,routine,now)
    expect(trip.origin).toEqual(spot)
    expect(bedroomDropFrame(trip,now+8000).point).toEqual(spot)
    for(let t=trip.holdUntil;t<trip.end;t+=85) expect(bedroomFloorContains(polygon,bedroomDropFrame(trip,t).point)).toBe(true)
    const scheduled=bedroomFootAt(bedroomStepAt(routine,trip.end),trip.end)
    expect(floorDistance(trip.target,scheduled)).toBeLessThan(.01)
  }
  const beforeDesk=routine.steps.find(step=>step.moving && step.to===BEDROOM_FLOORS[room].desk)!
  for(let i=0;i<=30;i++) expect(bedroomFloorContains(polygon,bedroomFootAt(beforeDesk,beforeDesk.start+(beforeDesk.end-beforeDesk.start)*i/30))).toBe(true)
})

it('routes an obstructed drop around chair feet instead of crossing the chair on its way back to the aisle',()=>{
  const room='classic'
  const underBed:Point=[480,495]
  expect(bedroomFloorContains(BEDROOM_WALKABLE[room],underBed)).toBe(false)
  const route=bedroomFloorRoute(room,placeOnBedroomFloor(room,[0,-10000]),BEDROOM_FLOORS[room].center)
  expect(route.length).toBeGreaterThan(2)
  const obstacles=[underBed,[-1e6,1e6] as Point,[1100,500] as Point]
  for(const obstacle of obstacles){
    const snapped=placeOnBedroomFloor(room,obstacle)
    expect(snapped).not.toEqual(obstacle)
    expect(bedroomFloorContains(BEDROOM_WALKABLE[room],snapped)).toBe(true)
  }
  for(let i=1;i<route.length;i++) for(let j=0;j<=30;j++){
    expect(bedroomFloorContains(BEDROOM_WALKABLE[room],floorMix(route[i-1]!,route[i]!,j/30))).toBe(true)
  }
})

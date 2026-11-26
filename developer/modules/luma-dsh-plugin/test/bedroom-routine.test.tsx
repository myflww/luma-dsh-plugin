import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { bedroomDropJourney, bedroomDropFrame } from '../src/client/bedroom-placement.ts'
import { bedroomBedContacts } from '../src/client/bedroom-bed-pose.ts'
import { BedroomDeskPose, bedroomSeatedCenter } from '../src/client/BedroomFurniturePoses.tsx'
import { BEDROOM_FLOORS, bedroomFootAt, bedroomStepAt, createBedroomRoutine } from '../src/client/bedroom-routine.ts'
import { OfficeBedroom, type ResidentId } from '../src/client/OfficeBedroom.tsx'
import { BEDROOM_ART, getBedroomArt } from '../src/client/bedroom-art.generated.ts'
import { BEDROOM_WALKABLE, bedroomFloorContains, type BedroomRoom } from '../src/client/bedroom-floor.ts'
import { OfficeActionMenu } from '../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/OfficeActionMenu.tsx'
import { getEmployeeCatalogWithSkin } from '../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/office2d/employeeSkins.ts'
import { getDeskRearPose } from '../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/office2d/deskRearPose.ts'
import { getOfficeAsset } from '../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/office2d/assets.ts'
import { officeAutomaticWalkCadence } from '../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/office2d/frameTimeline.ts'

const speeds={left:65,right:65,up:72,down:72}
afterEach(()=>{ cleanup(); vi.useRealTimers() })

it('keeps reclining figures on the pillow at a consistent size across different beds',()=>{
  const lengths:number[]=[]
  for(const theme of Object.keys(BEDROOM_FLOORS) as BedroomRoom[]){
    const room=getBedroomArt(theme)
    const pose=bedroomBedContacts(room,BEDROOM_FLOORS[theme].bed)
    expect(pose.head).toEqual(room.head)
    const dx=pose.feet[0]-pose.head[0],dy=pose.feet[1]-pose.head[1]
    const bedX=room.feet[0]-room.head[0],bedY=room.feet[1]-room.head[1]
    expect(dx*bedY-dy*bedX).toBeCloseTo(0,8)
    expect(dx*bedX+dy*bedY).toBeGreaterThan(0)
    expect(Math.hypot(dx,dy)).toBeLessThanOrEqual(Math.hypot(bedX,bedY))
    lengths.push(Math.hypot(dx,dy))
  }
  expect(Math.min(...lengths)).toBeGreaterThan(110)
  expect(Math.max(...lengths)/Math.min(...lengths)).toBeLessThan(1.08)
})

it('moves the chair towards the fixed key bed and registers the rear wrists and pelvis in either lighting',()=>{
  const roomId='classic',room=getBedroomArt(roomId),id='shan',approach=BEDROOM_FLOORS[roomId].desk
  const pose=getDeskRearPose(id)!
  for(const background of [room.day,room.night]){
    const view=render(<svg><BedroomDeskPose {...{id,roomId,room,background,approach}}
      seated={1} elapsed={0} animate/></svg>)
    const actor=view.container.querySelector('[data-bedroom-pose="computer"]')!
    expect(actor.querySelector('[data-bedroom-keyboard],[data-bedroom-input-tray]')).toBeNull()
    expect(actor.querySelector(`image[href="${background}"]`)).toBeNull()
    const figure=actor.querySelector('[data-body-projection="seated"]')!
    expect(figure.querySelector('image')?.getAttribute('href')).toBe(pose.src)
    const [a,b,c,d,tx,ty]=figure.getAttribute('transform')!.slice(7,-1).split(' ').map(Number) as [number,number,number,number,number,number]
    const world=(p:readonly [number,number])=>[a*p[0]+c*p[1]+tx,b*p[0]+d*p[1]+ty]
    const selected=actor.getAttribute('data-desk-view')==='three-quarter'?pose.oblique:pose.rear
    const [hipX,hipY]=world(selected.hip)
    expect(Math.abs(a)).toBeCloseTo(d)
    expect(b).toBe(0)
    expect(c).toBe(0)
    // Clockwise outline of the painted desktop keyboard in the original classic art.
    const corners=[[749,522],[764,512],[834,535],[818,546]] as const
    for(const hand of selected.palms){
      const [x,y]=world(hand)
      for(const [i,start] of corners.entries()){
        const end=corners[(i+1)%corners.length]!
        expect((end[0]-start[0])*(y!-start[1])-(end[1]-start[1])*(x!-start[0])).toBeGreaterThan(0)
      }
    }
    const padded=actor.querySelector('ellipse')!
    expect(hipX!).toBeCloseTo(Number(padded.getAttribute('cx')))
    expect(hipY!).toBeCloseTo(Number(padded.getAttribute('cy'))-1)
    expect(hipX!).toBeGreaterThan(723)
    expect(hipY!).toBeLessThan(613)
    expect((selected.soleY-selected.hip[1])*d).toBeLessThan(.72*selected.headHeight*d)
    const hit=bedroomSeatedCenter(roomId,id,undefined,approach)
    expect(hit[1]).toBeLessThan(hipY!)
    expect(Math.abs(hit[0]-hipX!)).toBeLessThan(55)
    view.unmount()
  }
})

it('preserves each painted chibi at the same chair scale for all 210 bedroom and outfit pairs',()=>{
  // Front lip, in the original room painting. These four deep seats had
  // previously rendered both shoes on the top surface.
  const referenceLips:Partial<Record<BedroomRoom,readonly [number,number]>>={
    'bedroom.shop.alpine-library.v1':[1217,545],
    claude:[1316,597],
    'bedroom.shop.sapphire-music.v1':[1222,476],
    longmama:[1213,448],
  }
  let combinations=0
  const view=render(<svg/>)
  for(const roomId of Object.keys(BEDROOM_FLOORS) as BedroomRoom[]){
    const room=getBedroomArt(roomId),approach=BEDROOM_FLOORS[roomId].desk
    let skull:number|undefined
    for(const id of Object.keys(BEDROOM_ART) as ResidentId[]){
      const custom='skin.'+id+'.v1'
      for(const skinId of id==='gemini' || id==='grok'?[custom]:[undefined,custom]){
        view.rerender(<svg><BedroomDeskPose {...{roomId,room,id,skinId,approach}}
          background={room.day} seated={1} elapsed={750} animate/></svg>)
        const actor=view.container.querySelector('[data-bedroom-pose="computer"]')!
        const body=actor.querySelector('[data-body-projection]')!
        const pose=getDeskRearPose(id,skinId)!
        const selected=actor.getAttribute('data-desk-view')==='three-quarter'?pose.oblique:pose.rear
        expect(body.querySelector('image')?.getAttribute('href')).toBe(pose.src)
        const [a,b,c,d,tx,ty]=body.getAttribute('transform')!.slice(7,-1).split(' ').map(Number)
        expect(Math.abs(a!)).toBeCloseTo(d!)
        expect([b,c]).toEqual([0,0])
        const cushion=actor.querySelector('ellipse')!
        expect(a!*selected.hip[0]+tx!).toBeCloseTo(Number(cushion.getAttribute('cx')))
        expect(d!*selected.hip[1]+ty!).toBeCloseTo(Number(cushion.getAttribute('cy'))-1)
        const edge=referenceLips[roomId]
        if(edge){
          const chair=actor.querySelector('[data-bedroom-chair-foreground]')!
          const [shiftX,shiftY]=chair.getAttribute('transform')!.slice(10,-1).split(' ').map(Number)
          const lipX=edge[0]+shiftX!,lipY=edge[1]+shiftY!
          const forward=Math.sign(a!)
          expect((a!*selected.knee[0]+tx!-lipX)*forward).toBeGreaterThan(0)
          expect(Math.abs(d!*selected.knee[1]+ty!-lipY)).toBeLessThan(5)
          expect(d!*selected.sole[1]+ty!-lipY).toBeGreaterThan(7)
          expect(actor.querySelector('[data-bedroom-chair-near-side]')?.getAttribute('d')).toMatch(/^M/)
        }
        const height=d!*selected.headHeight
        skull??=height
        expect(height).toBeCloseTo(skull)
        // The shoe-hip distance is bounded by the source painting. Room
        // furniture height cannot lengthen the calf or force a foot down.
        expect((selected.soleY-selected.hip[1])/selected.headHeight).toBeLessThan(.8)
        expect(actor.querySelector('[data-bedroom-keyboard],[data-bedroom-input-tray]')).toBeNull()
        combinations++
      }
    }
  }
  expect(combinations).toBe(210)
  view.unmount()
})

it('uses continuous floor routes in every room, with sleep and attendance transitions at the correct landmarks',()=>{
  const roles=Object.keys(BEDROOM_ART) as ResidentId[]
  const themes=Object.keys(BEDROOM_FLOORS) as BedroomRoom[]
  for (const room of themes) for (const [hour,working] of [[7,true],[18,true],[13,false]] as const) {
    const date=new Date(2026,10,22,hour)
    const routine=createBedroomRoutine(roles[themes.indexOf(room)%roles.length]!,room,date,working,speeds)
    const floor=BEDROOM_FLOORS[room]
    expect(routine.steps[0]!.from).toEqual(hour===18?floor.entry:floor.bed)
    expect(routine.steps.at(-1)!.to).toEqual(hour===7?floor.entry:floor.bed)
    expect(routine.steps.at(-1)!.end).toBe(routine.end)
    expect(new Set(routine.steps.filter(s=>!s.moving).map(s=>s.activity)).size).toBeGreaterThan(4)
    const broken=routine.steps.find((step,i)=>step.end<=step.start || i>0 && (
      step.start!==routine.steps[i-1]!.end || step.from!==routine.steps[i-1]!.to))
    expect(broken).toBeUndefined()
    expect(routine.steps.filter(s=>s.moving).every(s=>bedroomFloorContains(BEDROOM_WALKABLE[room],s.from)
      && bedroomFloorContains(BEDROOM_WALKABLE[room],s.to))).toBe(true)
    for(const [pose,arrival,departure] of [['computer','sit','rise'],['phone','recline','get-up']] as const){
      const i=routine.steps.findIndex((s,i)=>i>0 && s.pose===pose)
      expect(routine.steps.slice(i-2,i+3).map(s=>s.pose)).toEqual(['walk',arrival,pose,departure,'walk'])
    }
    const walk=routine.steps.find(s=>s.moving)!
    const middle=(walk.start+walk.end)/2
    expect(bedroomStepAt(routine,middle)).toBe(walk)
    expect(bedroomFootAt(walk,middle)[0]).toBeCloseTo((walk.from[0]+walk.to[0])/2)
  }
})

const props={id:'jingyuniang' as const,name:'鲸鱼娘',themeOwner:'jingyuniang' as const,phase:'morning' as const,location:'bedroom' as const,
  bedtime:false,taskIdle:true,workingDay:false,active:true,reduceMotion:false,officeActivity:'',onChat:vi.fn(),onOffice:vi.fn()}
it('sleeps by the clock, keeps sleeping after contact, wakes and walks without input',()=>{
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026,10,22,5,59))
  const view=render(<OfficeBedroom {...props} clock={new Date()} bedtime/>)
  expect(view.container.querySelector('[data-bedroom-pose="sleep"]')).toBeTruthy()
  expect(view.queryByRole('button',{name:/起身|叫醒|小憩/})).toBeNull()
  fireEvent.click(view.getByRole('button',{name:'联系鲸鱼娘'}))
  expect(view.container.querySelector('[data-bedroom-pose="sleep"]')).toBeTruthy()
  vi.setSystemTime(new Date(2026,10,22,6))
  view.rerender(<OfficeBedroom {...props} clock={new Date()}/>)
  expect(view.getByText('刚刚醒来')).toBeTruthy()
  act(()=>vi.advanceTimersByTime(4_200))
  const walker=view.container.querySelector('[data-bedroom-pose="walking"]')!
  expect(walker).toBeTruthy()
  const before=[walker.getAttribute('transform'),walker.getAttribute('data-bedroom-frame')]
  act(()=>vi.advanceTimersByTime(420))
  expect(walker.getAttribute('transform')).not.toBe(before[0])
  expect(walker.getAttribute('data-bedroom-frame')).not.toBe(before[1])
  view.unmount()
  const reopened=render(<OfficeBedroom {...props} clock={new Date()}/>)
  expect(reopened.container.querySelector('[data-bedroom-pose="walking"]')).toBeTruthy()
})
it('respects reduced motion and the same authoritative office membership',()=>{
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026,10,22,6,0,5))
  const view=render(<OfficeBedroom {...props} reduceMotion clock={new Date()}/>)
  const still=view.container.querySelector('[data-bedroom-pose="awake"]')
  const initial=still?.getAttribute('transform')
  act(()=>vi.advanceTimersByTime(480))
  expect(still?.getAttribute('transform')).toBe(initial)
  view.rerender(<OfficeBedroom {...props} clock={new Date()} location="office" officeActivity="正在处理任务"/>)
  expect(view.container.querySelector('.lumaBedroomResidentLayer')).toBeNull()
  expect(view.getByText('在办公室 · 正在处理任务')).toBeTruthy()
})

it('keeps the redrawn costume in a stationary walking frame with reduced motion',()=>{
  vi.useFakeTimers()
  const id='lu-mi', date=new Date(2026,10,22,8)
  const routine=createBedroomRoutine(id,'classic',date,false,speeds)
  const step=routine.steps.find(step=>step.pose==='walk')!
  vi.setSystemTime(step.start+100)
  const view=render(<OfficeBedroom {...props} id={id} roomLayout="classic" reduceMotion clock={new Date()}/>)
  const still=view.container.querySelector('[data-bedroom-pose="awake"]')
  expect(still?.getAttribute('data-gait-frame')).toBe('0')
  expect(still?.querySelector('image')?.getAttribute('href')).toContain('/gait-')
  act(()=>vi.advanceTimersByTime(100))
  expect(still?.getAttribute('data-gait-frame')).toBe('0')
})

it('renders each resident in the matching phone outfit and animated chair pose at the real routine times',()=>{
  vi.useFakeTimers()
  const date=new Date(2026,10,22,8)
  for(const id of Object.keys(BEDROOM_ART) as ResidentId[]) for(const skinId of [undefined,'skin.'+id+'.v1']){
    const catalog=getEmployeeCatalogWithSkin(id,skinId)!
    const cadence=Object.fromEntries(Object.entries(catalog.walk).map(([dir,asset])=>[
      dir,officeAutomaticWalkCadence('ambient',getOfficeAsset(asset).frameStrip!).travelSpeed,
    ])) as typeof speeds
    const room=skinId?id:'classic'
    const routine=createBedroomRoutine(id,room,date,false,cadence)
    const phone=routine.steps.find(s=>s.pose==='phone' && s.start>routine.start)!
    vi.setSystemTime(phone.start+500)
    const opts={...props,id,skinId,themeOwner:room==='classic'?undefined:id}
    const view=render(<OfficeBedroom {...opts} clock={new Date()}/>)
    const image=view.container.querySelector('[data-bedroom-pose="phone"] svg g image')
    const usesOutfit=Boolean(skinId) || id==='gemini' || id==='grok'
    expect(image?.getAttribute('href')).toContain(usesOutfit?'phone-outfit.webp':'phone-standard.webp')
    expect(view.getByText('躺在床上看手机')).toBeTruthy()
    view.unmount()
    const desk=routine.steps.find(s=>s.pose==='computer')!
    vi.setSystemTime(desk.start+20)
    const computer=render(<OfficeBedroom {...opts} clock={new Date()}/>)
    const actor=computer.container.querySelector('[data-bedroom-pose="computer"]')!
    expect(actor.querySelector('[data-bedroom-monitor="awake"]')).toBeTruthy()
    expect(actor.querySelector('[data-bedroom-seated-body] image')?.getAttribute('href')).toBe(getDeskRearPose(id,skinId)!.src)
    expect(actor.querySelector('[data-bedroom-keyboard],[data-bedroom-input-tray]')).toBeNull()
    const initial=actor.getAttribute('data-bedroom-frame')
    act(()=>vi.advanceTimersByTime(320))
    expect(actor.getAttribute('data-bedroom-frame')).not.toBe(initial)
    computer.rerender(<OfficeBedroom {...opts} clock={new Date()} reduceMotion/>)
    const fixed=actor.getAttribute('data-bedroom-frame')
    act(()=>vi.advanceTimersByTime(700))
    expect(actor.getAttribute('data-bedroom-frame')).toBe(fixed)
    computer.unmount()
  }
})

it('opens contact from a live employee without exposing the manual animation controls',()=>{
  const contact=vi.fn(),close=vi.fn(),action=vi.fn()
  const view=render(<OfficeActionMenu target={{employeeId:'jingyuniang',name:'鲸鱼娘',x:170,y:120}}
    contact={{activity:'午间休息',open:contact}} onClose={close} onAction={action} onRestore={()=>{}}/>)
  expect(view.getByText('午间休息')).toBeTruthy()
  expect(view.queryByText('恢复自动行为')).toBeNull()
  fireEvent.click(view.getByRole('button',{name:'联系鲸鱼娘'}))
  expect(contact).toHaveBeenCalledOnce()
  expect(close).toHaveBeenCalledOnce()
  expect(action).not.toHaveBeenCalled()
})

it('returns dropped companions to their routines through each bedroom floor plan',()=>{
  const date=new Date(2026,10,22,16,5), now=date.getTime()
  for(const id of Object.keys(BEDROOM_ART) as ResidentId[]) {
    for(const room of [id,'classic'] as const) {
      const routine=createBedroomRoutine(id,room,date,false,speeds)
      const trip=bedroomDropJourney(room,[-1e6,-1e6],routine,now)
      expect(bedroomDropFrame(trip,now).point).toEqual(trip.origin)
      expect(bedroomDropFrame(trip,now).moving).toBe(false)
      expect(bedroomDropFrame(trip,trip.centerAt).point).toEqual(trip.center)
      const actual=bedroomFootAt(bedroomStepAt(routine,trip.end),trip.end)
      expect(Math.hypot(trip.target[0]-actual[0],trip.target[1]-actual[1])).toBeLessThan(3)
      expect(trip.end-now).toBeGreaterThanOrEqual(8500)
    }
  }
})

it('drags the bedroom resident onto the floor, cancels a second gesture, then carries a sleeping companion outside without waking her',()=>{
  vi.useFakeTimers();vi.setSystemTime(new Date(2026,10,22,16,5))
  const onDesktopPet=vi.fn(), onChat=vi.fn(), config={...props,clock:new Date(),onDesktopPet,onChat}
  const view=render(<OfficeBedroom {...config}/>)
  const target=view.container.querySelector('[data-bedroom-drag]') as SVGEllipseElement
  Object.assign(target,{setPointerCapture(){},hasPointerCapture(){return false}})
  Object.assign(target.ownerSVGElement!,{getBoundingClientRect:()=>({left:0,top:0,width:1672,height:941,right:1672,bottom:941})})
  const pointer=(type:string,x:number,y:number)=>{
    const e=new MouseEvent(type,{bubbles:true,button:0,clientX:x,clientY:y,screenX:x,screenY:y})
    Object.defineProperties(e,{pointerId:{value:1},isPrimary:{value:true}})
    fireEvent(target,e)
  }
  pointer('pointerdown',600,500);pointer('pointermove',750,600)
  expect(view.container.querySelector('[data-actor-motion="held"]')).toBeTruthy()
  act(()=>vi.advanceTimersByTime(30))
  pointer('pointerup',750,600)
  expect(view.container.querySelector('[data-actor-motion="landing"]')?.getAttribute('data-pose-frame')).toBe('46')
  expect(view.getByText('在这里歇一会儿')).toBeTruthy()
  const pose=target.ownerSVGElement!.querySelector('[data-bedroom-pose]')?.getAttribute('transform')
  pointer('pointerdown',750,600);pointer('pointermove',700,550);pointer('pointercancel',700,550)
  expect(target.ownerSVGElement!.querySelector('[data-bedroom-pose]')?.getAttribute('transform')).toBe(pose)
  const [, ,sceneWidth,sceneHeight]=target.ownerSVGElement!.getAttribute('viewBox')!.split(' ').map(Number)
  for(const state of [{bedtime:true,taskIdle:true},{bedtime:false,taskIdle:false}]){
    view.rerender(<OfficeBedroom {...config} {...state}/>)
    const centerX=Number(target.getAttribute('cx')),centerY=Number(target.getAttribute('cy'))
    pointer('pointerdown',300,350);pointer('pointermove',320,360)
    expect(Number(target.getAttribute('cx'))).toBeCloseTo(centerX+20*sceneWidth!/1672)
    expect(Number(target.getAttribute('cy'))).toBeCloseTo(centerY+10*sceneHeight!/941)
    pointer('pointercancel',320,360)
  }
  view.rerender(<OfficeBedroom {...config} bedtime/>)
  // A fast desktop handoff can arrive with no intervening pointermove.
  pointer('pointerdown',300,350);pointer('pointerup',-120,100)
  expect(onDesktopPet).toHaveBeenCalledExactlyOnceWith('jingyuniang',{screenX:-120,screenY:100})
  expect(onChat).not.toHaveBeenCalled()
  expect(target.ownerSVGElement!.querySelector('[data-bedroom-pose="sleep"]')).toBeTruthy()
  view.rerender(<OfficeBedroom {...config} onDesktop/>)
  expect(view.container.querySelector('[data-bedroom-drag]')).toBeNull()
  expect(view.getByText('在桌面陪伴')).toBeTruthy()
})

import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { bedroomDropJourney, bedroomDropFrame } from '../src/client/bedroom-placement.ts'
import { bedroomBedContacts } from '../src/client/bedroom-bed-pose.ts'
import { BEDROOM_FLOORS, bedroomFootAt, bedroomStepAt, createBedroomRoutine } from '../src/client/bedroom-routine.ts'
import { OfficeBedroom, type ResidentId } from '../src/client/OfficeBedroom.tsx'
import { BEDROOM_ART, CLASSIC_BEDROOM_ART } from '../src/client/bedroom-art.generated.ts'
import { OfficeActionMenu } from '../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/OfficeActionMenu.tsx'
import { getEmployeeCatalogWithSkin } from '../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/office2d/employeeSkins.ts'
import { getOfficeAsset } from '../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/office2d/assets.ts'
import { officeAutomaticWalkCadence } from '../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/office2d/frameTimeline.ts'

const speeds={left:65,right:65,up:72,down:72}
afterEach(()=>{ cleanup(); vi.useRealTimers() })

it('keeps reclining figures on the pillow at a consistent size across different beds',()=>{
  const lengths:number[]=[]
  for(const theme of Object.keys(BEDROOM_FLOORS) as (ResidentId|'classic')[]){
    const room=theme==='classic'?CLASSIC_BEDROOM_ART:BEDROOM_ART[theme]
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

it('uses continuous floor routes in every room, with sleep and attendance transitions at the correct landmarks',()=>{
  const roles=Object.keys(BEDROOM_ART) as ResidentId[]
  const themes=Object.keys(BEDROOM_FLOORS) as (ResidentId|'classic')[]
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
    expect(routine.steps.filter(s=>s.moving).every(s=>s.from===floor.center || s.to===floor.center)).toBe(true)
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
  bedtime:false,taskIdle:true,workingDay:false,active:true,reduceMotion:false,officeActivity:'',onChat:vi.fn(),onOffice:vi.fn(),onWardrobe:vi.fn()}
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
    expect(actor.querySelector('svg image')?.getAttribute('href')).toContain(getOfficeAsset(catalog.typing.backRight).sha256.slice(0,12))
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
  pointer('pointerdown',600,500);pointer('pointermove',750,600);pointer('pointerup',750,600)
  expect(view.getByText('在这里歇一会儿')).toBeTruthy()
  const pose=target.ownerSVGElement!.querySelector('[data-bedroom-pose]')?.getAttribute('transform')
  pointer('pointerdown',750,600);pointer('pointermove',700,550);pointer('pointercancel',700,550)
  expect(target.ownerSVGElement!.querySelector('[data-bedroom-pose]')?.getAttribute('transform')).toBe(pose)
  view.rerender(<OfficeBedroom {...config} bedtime/>)
  pointer('pointerdown',300,350);pointer('pointermove',-120,100);pointer('pointerup',-120,100)
  expect(onDesktopPet).toHaveBeenCalledExactlyOnceWith('jingyuniang',{screenX:-120,screenY:100})
  expect(onChat).not.toHaveBeenCalled()
  expect(target.ownerSVGElement!.querySelector('[data-bedroom-pose="sleep"]')).toBeTruthy()
  view.rerender(<OfficeBedroom {...config} onDesktop/>)
  expect(view.container.querySelector('[data-bedroom-drag]')).toBeNull()
  expect(view.getByText('在桌面陪伴')).toBeTruthy()
})

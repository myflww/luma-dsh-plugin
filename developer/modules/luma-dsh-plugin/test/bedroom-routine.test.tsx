import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { BEDROOM_FLOORS, bedroomFootAt, bedroomStepAt, createBedroomRoutine } from '../src/client/bedroom-routine.ts'
import { OfficeBedroom, type ResidentId } from '../src/client/OfficeBedroom.tsx'
import { BEDROOM_ART } from '../src/client/bedroom-art.generated.ts'
import { OfficeActionMenu } from '../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/OfficeActionMenu.tsx'

const speeds={left:65,right:65,up:72,down:72}
afterEach(()=>{ cleanup(); vi.useRealTimers() })

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

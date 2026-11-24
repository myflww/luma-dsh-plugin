import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { bedroomFloorContains, BEDROOM_WALKABLE, type BedroomRoom } from '../src/client/bedroom-floor.ts'
import { createBedroomInvitation } from '../src/client/bedroom-invitation.ts'
import { bedroomDropFrame } from '../src/client/bedroom-placement.ts'
import { BEDROOM_FLOORS, bedroomFootAt, bedroomStepAt, createBedroomRoutine } from '../src/client/bedroom-routine.ts'
import { OfficeBedroom } from '../src/client/OfficeBedroom.tsx'

afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks() })
const speeds = {left:72,right:72,up:68,down:68}
const morning = new Date(2026,10,22,8)
const props = {id:'jingyuniang' as const,name:'鲸鱼娘',themeOwner:'jingyuniang' as const,phase:'morning' as const,
  location:'bedroom' as const,bedtime:false,taskIdle:true,workingDay:false,active:true,reduceMotion:false,
  clock:morning,officeActivity:'',onChat:vi.fn(),onOffice:vi.fn(),onWardrobe:vi.fn()}

it('reaches both pieces of furniture by open floor and meets the live routine again in all nine rooms', () => {
  for (const room of Object.keys(BEDROOM_FLOORS) as BedroomRoom[]) {
    const original = createBedroomRoutine('jingyuniang',room,morning,false,speeds)
    for (const target of ['bed','desk'] as const) {
      const floor=BEDROOM_FLOORS[room], from=floor[target==='bed'?'desk':'bed']
      const trip=createBedroomInvitation(room,target,+morning,from,undefined,original,speeds)
      expect(trip.arrival).toBeGreaterThan(+morning)
      for (const step of trip.plan.steps) {
        if (step.moving) for(let i=0;i<=20;i++) {
          expect(bedroomFloorContains(BEDROOM_WALKABLE[room],bedroomFootAt(step, step.start+(step.end-step.start)*i/20))).toBe(true)
        }
      }
      const activity=bedroomStepAt(trip.plan,trip.settled+1)
      expect(activity.from).toEqual(floor[target])
      expect(activity.pose).toBe(target==='bed'?'phone':'computer')
      expect(bedroomDropFrame(trip.returnTrip,trip.plan.end).point).toEqual(floor[target])
      const aim=bedroomFootAt(bedroomStepAt(original,trip.returnTrip.end),trip.returnTrip.end)
      expect(Math.hypot(aim[0]-trip.returnTrip.target[0],aim[1]-trip.returnTrip.target[1])).toBeLessThan(1)
    }
  }
})

it('uses the furniture controls, ignores repeat clicks, and leaves the current furniture before a new invitation', () => {
  vi.useFakeTimers()
  vi.setSystemTime(+new Date(2026,10,22,6,0,1))
  const view=render(<OfficeBedroom {...props} clock={new Date()}/>)
  const get=(name:string)=>view.getByRole('button',{name})
  const art=view.container.querySelector('.lumaBedroomArt')!
  fireEvent.click(get('邀请鲸鱼娘一起看手机'))
  expect(art.getAttribute('data-bedroom-invitation-phase')).toBe('activity')
  expect(view.getByRole('status').textContent).toContain('小鲸')
  act(()=>vi.advanceTimersByTime(1000))
  fireEvent.click(get('邀请鲸鱼娘一起看手机'))
  act(()=>vi.advanceTimersByTime(16010))
  expect(art.getAttribute('data-bedroom-invitation-phase')).toBe('returning')
  fireEvent.click(get('邀请鲸鱼娘一起用电脑'))
  expect(view.container.querySelector('[data-bedroom-action="get-up"]')).toBeTruthy()
  act(()=>vi.advanceTimersByTime(1600))
  expect(view.container.querySelector('[data-bedroom-pose="walking"]')).toBeTruthy()
  expect(view.container.querySelector('[data-bedroom-pose="computer"]')).toBeNull()
  act(()=>vi.advanceTimersByTime(12000))
  expect(art.getAttribute('data-bedroom-invitation-phase')).toBe('activity')
  expect(view.container.querySelector('[data-bedroom-pose="computer"]')).toBeTruthy()
  expect(view.getByRole('status').textContent).toContain('海流')
  act(()=>vi.advanceTimersByTime(45000))
  expect(art.hasAttribute('data-bedroom-invitation')).toBe(false)
})

it('cancels on hiding or loss of availability, and offers static furniture interaction with reduced motion', () => {
  vi.useFakeTimers()
  vi.setSystemTime(+new Date(2026,10,22,6,0,1))
  const view=render(<OfficeBedroom {...props} clock={new Date()} reduceMotion/>)
  const invite=()=>fireEvent.click(view.getByRole('button',{name:'邀请鲸鱼娘一起看手机'}))
  invite()
  expect(view.container.querySelector('[data-bedroom-pose="phone"] animate')).toBeNull()
  const hidden=vi.spyOn(document,'hidden','get').mockReturnValue(true)
  fireEvent(document,new Event('visibilitychange'))
  hidden.mockRestore()
  expect(view.container.querySelector('[data-bedroom-invitation]')).toBeNull()
  for (const changed of [{active:false},{bedtime:true},{taskIdle:false},{location:'office' as const},{onDesktop:true}]) {
    invite()
    view.rerender(<OfficeBedroom {...props} {...changed} clock={new Date()}/>)
    expect(view.container.querySelector('[data-bedroom-invite]')).toBeNull()
    view.rerender(<OfficeBedroom {...props} clock={new Date()}/>)
    expect(view.container.querySelector('[data-bedroom-invitation]')).toBeNull()
  }
})

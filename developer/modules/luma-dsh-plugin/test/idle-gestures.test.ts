import { expect, it } from 'vitest'
import { LANDING_MS, motionPhase } from '../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/office2d/actorMotion.ts'
import { IdleGestureSequence } from '../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/office2d/idleGestures.ts'

// Source cells live in another sheet. Cell zero in its first row must still
// switch textures even when the ordinary breathing pose also uses index zero.
const idle=[80,120]
const actions=[
  {id:'stretch',frames:[0,2,5,7],durationsMs:[40,100,80,50]},
  {id:'sleeve',frames:[8,10,13,15],durationsMs:[60,90,100,50]},
]
const quiet={frame:0}

it('plays both painted actions with a full neutral-to-neutral breathing loop between them',()=>{
  const player=new IdleGestureSequence()
  const at=(t:number)=>player.sample('idle',t,0,undefined,false,idle,actions)
  expect(at(0)).toEqual(quiet)
  expect(at(199)).toEqual({frame:1})
  expect(at(200)).toEqual({frame:0,gesture:'stretch'})
  expect(at(245)).toEqual({frame:2,gesture:'stretch'})
  expect(at(469)).toEqual({frame:7,gesture:'stretch'})
  expect(at(470)).toEqual(quiet)
  expect(at(669)).toEqual({frame:1})
  expect(at(670)).toEqual({frame:8,gesture:'sleeve'})
  expect(at(969)).toEqual({frame:15,gesture:'sleeve'})
  expect(at(970)).toEqual(quiet)
  expect(at(1170)).toEqual({frame:0,gesture:'stretch'})
})

it('drops a gesture on pickup or reduce-motion and saves the other action for the next standing spell',()=>{
  const player=new IdleGestureSequence()
  const at=(t:number)=>player.sample('idle',t,0,undefined,false,idle,actions)
  expect(at(250).gesture).toBe('stretch')
  expect(player.sample('held',300,0,undefined,false,idle,actions)).toEqual({frame:16})
  expect(player.sample('landing',300,0,undefined,false,idle,actions)).toEqual({frame:46})
  expect(player.sample('landing',LANDING_MS,0,undefined,false,idle,actions)).toEqual(quiet)
  expect(at(205).gesture).toBe('sleeve')
  expect(player.sample('idle',410,0,undefined,true,idle,actions)).toEqual(quiet)
  expect(at(0)).toEqual(quiet)
  expect(at(201).gesture).toBe('stretch')
})

it('withholds missing action sheets and staggers two employees who stop together',()=>{
  const a=new IdleGestureSequence(), b=new IdleGestureSequence()
  expect(a.sample('idle',450,0,undefined,false,idle)).toEqual(quiet)
  expect(a.sample('idle',452,0,undefined,false,idle,actions).gesture).toBeUndefined()
  expect(a.sample('idle',600,0,undefined,false,idle,actions).gesture).toBe('stretch')
  a.interrupt()
  const early=motionPhase('grok'),late=motionPhase('lu-mi')
  const when=early+200
  expect(b.sample('idle',when,late,undefined,false,idle,actions).gesture).toBeUndefined()
  expect(a.sample('idle',when,early,undefined,false,idle,actions).gesture).toBeDefined()
})

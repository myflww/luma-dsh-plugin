import { expect,it } from 'vitest'
import { PostDropLook } from '../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/office2d/postDropLook.ts'

it('starts after landing, moves the eyes ahead of the head, and crosses center when the pointer reverses',()=>{
  const look=new PostDropLook()
  look.begin('shan',200,120,400)
  const at=(t:number)=>look.sample('shan',t,100,120,140)
  expect(at(399)).toBeUndefined()
  expect(at(440)?.eyeX).toBeGreaterThan(.4)
  expect(at(475)?.headX).toBe(0)
  expect(at(850)?.headX).toBeGreaterThan(.8)
  look.move(5,120)
  const reversed=at(930)!
  expect(reversed.eyeX).toBeLessThan(0)
  expect(reversed.headX).toBeGreaterThan(0)
  expect(at(1200)?.headX).toBeLessThan(-.5)
  for(let t=2850;t<3329;t+=16)at(t)
  expect(Math.abs(at(3329)!.eyeX)).toBeLessThan(.02)
  expect(Math.abs(at(3329)!.headX)).toBeLessThan(.2)
  expect(at(3330)).toBeUndefined()
  expect(look.has('shan')).toBe(false)
})

it('cancels an interrupted resident without rearming from later mouse movements',()=>{
  const look=new PostDropLook()
  look.begin('shan',12,40,50)
  look.begin('claude',12,40,90)
  look.cancel('shan')
  look.move(450,300)
  expect(look.sample('shan',120,10,20,130)).toBeUndefined()
  expect(look.sample('claude',120,10,20,130)?.eyeY).toBeGreaterThan(0)
  look.cancel()
  expect(look.has('claude')).toBe(false)
})

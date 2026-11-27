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

it('holds each grid cell through one-pixel pointer noise on either side of an angle boundary',()=>{
  for(const initial of [0,.55]){
    const look=new PostDropLook(),height=164
    look.begin('whale',initial*height*.36,-initial*height*.30,0)
    const expected=initial===0?12:8
    for(let t=0;t<800;t+=16)look.sample('whale',t,0,0,height)
    for(let t=800;t<2000;t+=16){
      const offset=Math.floor(t/80)%2?1:-1
      look.move(height*.36*.25+offset,-height*.30*.25-offset)
      const gaze=look.sample('whale',t,0,0,height)!
      expect([gaze.head,gaze.eyes]).toEqual([expected,expected])
    }
    look.move(height,-height)
    for(let t=2000;t<=2400;t+=16)look.sample('whale',t,0,0,height)
    const far=look.sample('whale',2420,0,0,height)!
    expect([far.head,far.eyes]).toEqual([4,4])
  }
})

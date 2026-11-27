import { expect, it } from 'vitest'
import { actorMotionFrame, LANDING_MS, landingStartForRelease, motionPhase, sampleGripLag } from '../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/office2d/actorMotion.ts'
import { getActorPoseAtlas } from '../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/office2d/actorPoseAtlas.ts'

const roles = ['shan','bai-shuangming','lu-mi','jingyuniang','longmama','claude','gemini','grok']

it.each([[30,46],[100,42],[165,40],[600,40]])('joins a %i ms lift to landing exposure %i', (held,first) => {
  const timing=getActorPoseAtlas('jingyuniang')!.idleDurationsMs
  const released=1025, start=landingStartForRelease(released,released-held)
  const frames=Array.from({length:LANDING_MS+1},(_,afterRelease)=>
    actorMotionFrame('landing',released+afterRelease-start,0,undefined,false,timing))
  expect(frames[0]).toBe(first)
  if (held<165) expect(frames).not.toContain(40)
  if (held<165) expect(frames).not.toContain(41)
  expect(frames.at(-1)).toBe(0)
})

it('plants both feet before starting each character’s idle loop on their own beat', () => {
  const holds=[120,90,80,100,95,105,120,95]
  const phases=roles.map(motionPhase)
  expect(new Set(phases).size).toBe(roles.length)
  for(const delay of phases){
    const draw=(motion:'idle'|'landing',elapsed:number,still=false)=>
      actorMotionFrame(motion,elapsed,delay,undefined,still,holds)
    expect(draw('idle',0)).toBe(0)
    expect(draw('landing',LANDING_MS)).toBe(0)
    expect(draw('idle',delay+119)).toBe(0)
    expect(draw('idle',delay+120)).toBe(1)
    expect(draw('idle',delay+120,true)).toBe(0)
  }
})

it('registers every selectable outfit to planted feet and supplies a full idle cycle plus five action strips', () => {
  const sources = new Set<string>()
  for (const id of roles) for (const skin of [undefined, `skin.${id}.v1`]) {
    const atlas = getActorPoseAtlas(id,skin)!
    expect(atlas.count).toBe(64)
    expect(atlas.columns).toBe(8)
    expect(atlas.foot[1]).toBeGreaterThan(atlas.grip[1] + atlas.figureHeight * .65)
    expect(atlas.idleDurationsMs).toHaveLength(24)
    expect(atlas.idleDurationsMs.every(ms => ms > 0)).toBe(true)
    let elapsed = 0
    const idleFrames = atlas.idleDurationsMs.map(duration => {
      const index = actorMotionFrame('idle', elapsed, 0, undefined, false, atlas.idleDurationsMs)
      elapsed += duration
      return index
    })
    expect(new Set(idleFrames).size).toBe(24)
    expect(idleFrames.every(index => index < 8 || index >= 48 && index < atlas.count)).toBe(true)
    sources.add(atlas.src)
  }
  expect(sources.size).toBe(14)
})

it('carries both axes through reversals, releases the last pose and settles to a still hang', () => {
  const timing = getActorPoseAtlas('jingyuniang')!.idleDurationsMs
  let grip=sampleGripLag(undefined,0,0,0,150)
  const frame=() => actorMotionFrame('held',600,0,grip,false,timing)
  const move=(dx:number,dy:number,n=18) => {
    for(let i=0;i<n;i++) grip=sampleGripLag(grip,grip.x+dx,grip.y+dy,grip.time+16,150)
    return frame()
  }
  expect(move(7,0)).toBe(27)
  expect(move(-7,0,1)).toBe(27)
  expect(move(-7,0)).toBe(35)
  expect(move(0,-7)).toBe(19)
  expect(move(0,7)).toBe(23)
  expect(move(7,-7)).toBe(29)
  expect(move(-7,7)).toBe(39)
  expect(actorMotionFrame('landing',20,0,undefined,false,timing,frame())).toBe(39)
  expect(actorMotionFrame('landing',180,0,undefined,false,timing,frame())).toBe(43)
  expect(actorMotionFrame('landing',LANDING_MS,0,undefined,false,timing)).toBe(0)
  expect(actorMotionFrame('held',300,0,grip,true,timing)).toBe(16)
  expect(move(0,0,85)).toBe(16)
  expect(move(0,0,42)).toBe(16)
  expect(actorMotionFrame('idle',1800,0,undefined,true,timing)).toBe(0)
})

import { expect, it } from 'vitest'
import { actorMotionFrame, LANDING_MS, landingStartForRelease, sampleGripLag } from '../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/office2d/actorMotion.ts'
import { getActorPoseAtlas } from '../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/office2d/actorPoseAtlas.ts'

const roles = ['shan','bai-shuangming','lu-mi','jingyuniang','longmama','claude','gemini','grok']

it.each([[30,46],[100,42],[165,40],[600,40]])('joins a %i ms lift to landing exposure %i', (held,first) => {
  const timing=getActorPoseAtlas('jingyuniang')!.idleDurationsMs
  const released=1025, start=landingStartForRelease(released,released-held)
  const frames=Array.from({length:LANDING_MS+1},(_,afterRelease)=>
    actorMotionFrame('landing',released+afterRelease-start,0,0,false,timing))
  expect(frames[0]).toBe(first)
  if (held<165) expect(frames).not.toContain(40)
  if (held<165) expect(frames).not.toContain(41)
  expect(frames.at(-1)).toBe(0)
})

it('registers every selectable outfit to planted feet and supplies six complete action strips', () => {
  const sources = new Set<string>()
  for (const id of roles) for (const skin of [undefined, `skin.${id}.v1`]) {
    const atlas = getActorPoseAtlas(id,skin)!
    expect(atlas.count).toBe(48)
    expect(atlas.columns).toBe(8)
    expect(atlas.foot[1]).toBeGreaterThan(atlas.grip[1] + atlas.figureHeight * .65)
    expect(atlas.idleDurationsMs).toHaveLength(8)
    expect(atlas.idleDurationsMs.every(ms => ms > 0)).toBe(true)
    sources.add(atlas.src)
  }
  expect(sources.size).toBe(14)
})

it('changes the limb pose on a direction reversal and settles after the pointer stops', () => {
  const timing = getActorPoseAtlas('jingyuniang')!.idleDurationsMs
  const grip = sampleGripLag(undefined,0,0,100)
  const right = sampleGripLag(grip,48,20,100)
  const left = sampleGripLag(right,-40,40,100)
  const rest = sampleGripLag(left,-40,900,100)
  const row = (t: number, lag: number) => Math.floor(actorMotionFrame('held',t,0,lag,false,timing)/8)
  expect([row(60,0),row(300,right.lag),row(500,left.lag),row(1050,rest.lag)]).toEqual([1,3,4,2])
  expect(actorMotionFrame('landing',180,0,0,false,timing)).toBeGreaterThanOrEqual(40)
  expect(actorMotionFrame('landing',LANDING_MS,0,0,false,timing)).toBe(0)
  expect(actorMotionFrame('held',300,0,left.lag,true,timing)).toBe(16)
  for (const elapsed of [260,310,850,1900,6800]) {
    expect(actorMotionFrame('held',elapsed,0,0,false,timing)).toBe(16)
    expect(actorMotionFrame('held',elapsed,0,left.lag,false,timing)).toBe(actorMotionFrame('held',300,0,left.lag,false,timing))
  }
  expect(actorMotionFrame('idle',1800,0,0,true,timing)).toBe(0)
})

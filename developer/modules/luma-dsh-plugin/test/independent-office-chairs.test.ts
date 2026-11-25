// @vitest-environment node
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect,it } from 'vitest'
import chairMattes from '../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/office2d/sceneChairMattes.generated.json'
import { seatMatte } from '../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/office2d/sceneChairMatte.ts'
import { fittedDeskPose } from '../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/office2d/officeFigureScale.ts'

it('ships an exact-size verified chair matte for each supported rear outfit and preserves whole-chair bindings',()=>{
  const rows=JSON.parse(readFileSync(join(__dirname,'../lib/asset-manifest.json'),'utf8')) as {path:string;sha256:string}[]
  for(const [sha,matte] of Object.entries(chairMattes)){
    const data=readFileSync(join(__dirname,'../art/release-assets',matte.path.slice(1)))
    expect(rows.find(r=>r.path===matte.path.slice(1))?.sha256).toBe(createHash('sha256').update(data).digest('hex'))
    expect([data.readUInt32BE(16),data.readUInt32BE(20)]).toEqual([2048,860])
    expect(seatMatte({sourceSha256:sha})).toEqual(matte)
    expect(seatMatte({sourceSha256:sha,integratedChair:{}})).toBeUndefined()
    expect(seatMatte({sourceSha256:sha,actorFurnitureOwnership:{sourceHasChair:false}})).toBeUndefined()
  }
  expect(Object.keys(chairMattes)).toHaveLength(14)
})

it('centres a rear pose towards the seat while keeping palms inside the key bed, preserving a hidden counter point',()=>{
  const hand=[256,446] as const,hip=[256,600] as const
  const binding={sourceSha256:Object.keys(chairMattes)[0]!,uniformScale:.3,origin:[0,0] as const,anatomicalSourcePixels:{hand,hip}}
  const station={seat:[1220,568] as const,keyboard:[1249,512] as const,keyboardSurface:[[1221,505],[1277,505],[1277,519],[1221,519]] as const}
  const pose=fittedDeskPose(binding,station),x=pose.origin[0]+hand[0]*pose.scale,y=pose.origin[1]+hand[1]*pose.scale
  expect(x).toBeGreaterThan(1221);expect(x).toBeLessThan(1249)
  expect(y).toBeGreaterThan(505);expect(y).toBeLessThan(519)
  const counter=fittedDeskPose(binding,{...station,keyboard:[1249,590]})
  expect(counter.origin[0]+hand[0]*counter.scale).toBeCloseTo(1249)
  expect(counter.origin[1]+hand[1]*counter.scale).toBeCloseTo(590)
})

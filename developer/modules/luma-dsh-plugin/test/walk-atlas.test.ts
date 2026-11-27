import { expect, it } from 'vitest'
import { getOfficeAsset } from '../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/office2d/assets.ts'
import { getEmployeeCatalogWithSkin } from '../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/office2d/employeeSkins.ts'
import { createOfficeFrameTimeline } from '../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/office2d/frameTimeline.ts'
import { getWalkAtlas, sampleWalkAtlas } from '../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/office2d/walkAtlas.ts'
import { OFFICE_SILHOUETTES } from '../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/office2d/officeSilhouettes.generated.ts'
import { BEDROOM_FLOORS, bedroomFootAt, bedroomTravelAt, createBedroomRoutine } from '../src/client/bedroom-routine.ts'

it('preserves the installed gait for peers and each original pose and exposure for Lu Mi', () => {
  const ids = ['shan','lu-mi','bai-shuangming','jingyuniang','longmama','claude','gemini','grok']
  for (const id of ids) for (const skin of [undefined,'skin.'+id+'.v1']) {
    const catalog = getEmployeeCatalogWithSkin(id,skin)!
    for (const asset of Object.values(catalog.walk)) {
      const atlas = getWalkAtlas(asset)!
      const strip = getOfficeAsset(asset).frameStrip!
      const timeline = createOfficeFrameTimeline(strip)
      if(id==='lu-mi'){
        expect(atlas.sourceSha256).toBe(getOfficeAsset(asset).sha256)
        expect(atlas.count).toBe(timeline.order.length*2)
        expect(atlas.frameDurationsMs).toEqual(timeline.durations.flatMap(d=>[d/2,d/2]))
      }else{
        expect(atlas.count).toBe(4)
        expect(atlas.frameDurationsMs).toHaveLength(4)
      }
      let phase=0
      for (let i=0;i<atlas.count;i++) {
        const duration=atlas.frameDurationsMs![i]!
        const frame=sampleWalkAtlas(atlas,strip,phase+duration/2)
        expect(frame.index).toBe(i)
        expect(frame.rect).toEqual([(i%atlas.columns)*atlas.cell[0]!,Math.floor(i/atlas.columns)*atlas.cell[1]!,...atlas.cell])
        phase+=duration
      }
      expect(phase).toBeCloseTo(timeline.cycleMs,5)
      expect(sampleWalkAtlas(atlas,strip,phase).index).toBe(0)
      const last = sampleWalkAtlas(atlas,strip,phase,false)
      expect(last.index).toBe(atlas.count-1)
      expect(last.nextDelayMs).toBeNull()
    }
  }
})

it('places every rebuilt direction on the scene floor at the same displayed figure height', () => {
  for (const role of ['shan','lu-mi','bai-shuangming','jingyuniang','longmama','claude','gemini','grok']) {
    for (const skin of [undefined, 'skin.'+role+'.v1']) {
      for (const id of Object.values(getEmployeeCatalogWithSkin(role, skin)!.walk)) {
        const atlas = getWalkAtlas(id)!
        const [height, floor] = OFFICE_SILHOUETTES[getOfficeAsset(id).sha256]!
        const units = atlas.bounds[3]! / atlas.cell[1]!
        expect(atlas.figureHeight * units).toBeCloseTo(height, 3)
        expect(atlas.bounds[1]! + atlas.sole * units).toBeCloseTo(floor, 3)
        expect(atlas.src).toMatch(/\.png$/)
      }
    }
  }
})

it('keeps the planted foot phase and the same tangent through every room鈥檚 central aisle', () => {
  for(const room of Object.keys(BEDROOM_FLOORS) as (keyof typeof BEDROOM_FLOORS)[]) {
    const steps=createBedroomRoutine('jingyuniang',room,new Date(2026,10,22,8),false,
      {left:75,right:75,up:80,down:80}).steps
    const first=steps.findIndex(step=>step.throughTo)
    const before=steps[first]!,after=steps[first+1]!
    expect(bedroomFootAt(before,before.end)).toEqual(bedroomFootAt(after,after.start))
    expect(before.strideStart! + bedroomTravelAt(before,before.end)).toBeCloseTo(after.strideStart!)
    const p=bedroomFootAt(before,before.end-5),q=bedroomFootAt(before,before.end),r=bedroomFootAt(after,after.start+5)
    const a=[q[0]-p[0],q[1]-p[1]],b=[r[0]-q[0],r[1]-q[1]]
    // A route can immediately turn back towards the bed. The arc then decelerates to rest.
    if (Math.hypot(...a)>.08 && Math.hypot(...b)>.08) {
      expect((a[0]!*b[0]!+a[1]!*b[1]!)/(Math.hypot(...a)*Math.hypot(...b))).toBeGreaterThan(.97)
    }
  }
})

import { expect, it } from 'vitest'
import { getOfficeAsset } from '../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/office2d/assets.ts'
import { getEmployeeCatalogWithSkin } from '../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/office2d/employeeSkins.ts'
import { createOfficeFrameTimeline } from '../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/office2d/frameTimeline.ts'
import { getWalkAtlas, sampleWalkAtlas, walkAtlasBounds } from '../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/office2d/walkAtlas.ts'
import { BEDROOM_FLOORS, bedroomFootAt, bedroomTravelAt, createBedroomRoutine } from '../src/client/bedroom-routine.ts'

it('gives every owned character and outfit three distinct draw cells per painted exposure in all directions', () => {
  const ids = ['shan','lu-mi','bai-shuangming','jingyuniang','longmama','claude','gemini','grok']
  for (const id of ids) for (const skin of [undefined,'skin.'+id+'.v1']) {
    const catalog = getEmployeeCatalogWithSkin(id,skin)!
    for (const asset of Object.values(catalog.walk)) {
      const atlas = getWalkAtlas(asset)!
      const strip = getOfficeAsset(asset).frameStrip!
      const timeline = createOfficeFrameTimeline(strip)
      expect(atlas.count).toBe(timeline.order.length*3)
      for (let i=0;i<timeline.order.length;i++) {
        const phase = timeline.starts[i]!, exposure = timeline.durations[i]!
        for(const sample of [0,1,2]) {
          const cell = sampleWalkAtlas(atlas,strip,phase+exposure*(sample+.1)/3)
          expect(cell.index).toBe(i*3+sample)
          expect(cell.rect[0]+cell.rect[2]).toBeLessThanOrEqual(atlas.columns*atlas.cell[0]!)
        }
      }
      expect(sampleWalkAtlas(atlas,strip,timeline.cycleMs).index).toBe(0)
    }
  }
})

it('fits the two drawing scales in Claude’s rear walk around the same floor contact', () => {
  const atlas = getWalkAtlas(getEmployeeCatalogWithSkin('claude')!.walk.up)!
  const [width, height] = atlas.cell
  function measurement(index: number, inkHeight: number) {
    const bounds = walkAtlasBounds(atlas, [
      index % atlas.columns * width!, Math.floor(index / atlas.columns) * height!, width!, height!,
    ])
    const sole = 699
    const soleUV = (sole - atlas.bounds[1]!) / atlas.bounds[3]!
    expect(bounds[1]! + soleUV * bounds[3]!).toBeCloseTo(sole)
    return inkHeight * bounds[3]! / height!
  }
  // Opaque extents measured in the 256-pixel packed cell.
  expect(measurement(0, 248) / measurement(12, 224)).toBeLessThan(1.04)
})

it('keeps the planted foot phase and the same tangent through every room’s central aisle', () => {
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


import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { BEDROOM_ART, CLASSIC_BEDROOM_ART, SHOP_BEDROOM_ART } from '../src/client/bedroom-art.generated.ts'
import { SHOP_BEDROOMS } from '../src/shared/shop-bedrooms.ts'
import { OFFICE_THEME_CHOICES } from '../src/client/office-theme-catalog.ts'
import { COMPANION_REWARDS } from '../src/shared/local-collection-domain.ts'
import { getOfficeWorldAssetForPhase } from '../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/office2d/timeSceneAssets.ts'

it('only offers and awards rooms with registered day, night and office time-phase art in the shipped manifest', () => {
  const manifest = JSON.parse(readFileSync(join(__dirname,'../lib/asset-manifest.json'),'utf8')) as {path:string;bytes:number}[]
  const artwork = new Set(manifest.filter(item=>item.bytes>0).map(item=>'/'+item.path))
  const offices = OFFICE_THEME_CHOICES.map(theme=>theme.id)
  for (const theme of offices) {
    for (const phase of ['morning','noon','afternoon','dusk','night','closed']) {
      expect(artwork.has(getOfficeWorldAssetForPhase(phase,undefined,theme ?? undefined))).toBe(true)
    }
  }
  for (const room of [CLASSIC_BEDROOM_ART,...Object.values(BEDROOM_ART),...Object.values(SHOP_BEDROOM_ART)]) {
    expect(artwork.has(room.day)).toBe(true)
    expect(artwork.has(room.night)).toBe(true)
  }
  for (const reward of COMPANION_REWARDS) {
    expect(offices).toContain(reward.office)
    expect(BEDROOM_ART[reward.id]).toBeDefined()
    expect(reward.targets.length).toBeGreaterThan(0)
  }
})

it('keeps every shop illustration distinct from the eight earned bedrooms and the included room',()=>{
  expect(Object.keys(SHOP_BEDROOM_ART).sort()).toEqual(SHOP_BEDROOMS.map(room=>room.id).sort())
  const rooms=[CLASSIC_BEDROOM_ART,...Object.values(BEDROOM_ART),...Object.values(SHOP_BEDROOM_ART)]
  expect(new Set(rooms.map(room=>room.day)).size).toBe(15)
  expect(new Set(rooms.map(room=>room.night)).size).toBe(15)
  for(const id of Object.keys(SHOP_BEDROOM_ART))expect(COMPANION_REWARDS.some(reward=>reward.bedroom===id)).toBe(false)
})

it('ships the new illustrations under the existing earned room IDs', () => {
  const rows = JSON.parse(readFileSync(join(__dirname,'../lib/asset-manifest.json'),'utf8')) as {path:string;bytes:number;sha256:string}[]
  const expected = {shan:'bedroom.duanmu-yan.v1','lu-mi':'bedroom.lu-mi.v1','bai-shuangming':'bedroom.bai-shuangming.v1'} as const
  const seen = new Set<string>()
  const originalIds=Object.keys(expected) as (keyof typeof expected)[]
  for (const id of originalIds) {
    expect(COMPANION_REWARDS.find(reward=>reward.id===id)?.bedroom).toBe(expected[id])
  }
  for (const room of [...originalIds.map(id=>BEDROOM_ART[id]),...Object.values(SHOP_BEDROOM_ART)]) {
    let daySize: string | undefined
    for (const url of [room.day,room.night]) {
      const key = url.slice(1), row = rows.find(asset=>asset.path===key)!
      const bytes = readFileSync(join(__dirname,'../art/release-assets',key))
      expect(bytes.length).toBe(row.bytes)
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(row.sha256)
      expect(url).toContain(row.sha256.slice(0,12))
      const width=bytes.readUInt32BE(16), height=bytes.readUInt32BE(20)
      const size=width+'x'+height
      if (daySize) expect(size).toBe(daySize)
      else daySize=size
      expect(Math.abs(room.size[0]/room.size[1]-width/height)).toBeLessThan(.002)
      seen.add(row.sha256)
    }
  }
  expect(seen.size).toBe(18)
})

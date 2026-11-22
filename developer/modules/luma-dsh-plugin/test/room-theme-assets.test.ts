import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { BEDROOM_ART, CLASSIC_BEDROOM_ART } from '../src/client/bedroom-art.generated.ts'
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
  for (const room of [CLASSIC_BEDROOM_ART,...Object.values(BEDROOM_ART)]) {
    expect(artwork.has(room.day)).toBe(true)
    expect(artwork.has(room.night)).toBe(true)
  }
  for (const reward of COMPANION_REWARDS) {
    expect(offices).toContain(reward.office)
    expect(BEDROOM_ART[reward.id]).toBeDefined()
    expect(reward.targets.length).toBeGreaterThan(0)
  }
})

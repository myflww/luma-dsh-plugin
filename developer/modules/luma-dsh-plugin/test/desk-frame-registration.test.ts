import { expect, it } from 'vitest'
import { getOfficeAsset } from '../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/office2d/assets.ts'
import { deskFrameRegistration } from '../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/office2d/deskFrameRegistration.ts'
import { getEmployeeCatalogWithSkin, getReadyEmployeeSkinOptions } from '../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/office2d/employeeSkins.ts'

it('registers every selectable seated strip to its own frame zero', () => {
  const checked = new Set<string>()
  for (const role of ['shan','lu-mi','bai-shuangming','jingyuniang','longmama','claude','gemini','grok']) {
    for (const skin of [undefined,...getReadyEmployeeSkinOptions(role).map(option => option.skinId)]) {
      const catalog = getEmployeeCatalogWithSkin(role, skin)!
      for (const asset of Object.values(catalog.typing)) {
        const {sha256, frameStrip} = getOfficeAsset(asset)
        checked.add(sha256)
        expect(deskFrameRegistration(sha256, 0)).toEqual([0,0])
        for (let i = 0; i < frameStrip!.frameCount; i++) {
          const shift = deskFrameRegistration(sha256, i)
          expect(shift?.every(Number.isInteger), asset + ' cell ' + i).toBe(true)
        }
        expect(deskFrameRegistration(sha256, frameStrip!.frameCount)).toBeUndefined()
      }
    }
  }
  expect(checked.size).toBe(56)
  expect(deskFrameRegistration('unmeasured', 0)).toBeUndefined()
})

it('keeps the large alternating sailor-outfit displacement in source pixels', () => {
  const catalog = getEmployeeCatalogWithSkin('claude', 'skin.claude.v1')!
  const {sha256} = getOfficeAsset(catalog.typing.backRight)
  expect(deskFrameRegistration(sha256, 1)?.[0]).toBeGreaterThan(75)
  expect(Math.abs(deskFrameRegistration(sha256, 2)![0])).toBeLessThan(4)
})


import type { OfficePresentationThemeId } from '../office-presentation-settings.ts'
import { OFFICE_EMPLOYEE_DEFINITIONS, OFFICE_EMPLOYEE_IDS } from '../../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/office-harness/OfficeRelationships.ts'
import { getBrowserOfficeDefaultSkinId, getEmployeeSkinPack, isBrowserOfficeOutfitReady } from '../../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/office2d/employeeSkins.ts'

export const OFFICE_THEME_CHOICES: readonly Readonly<{ id: OfficePresentationThemeId | null; name: string }>[] = Object.freeze([
  { id: null, name: '经典办公室' },
  { id: 'office.duanmu-yan.v1', name: '端木嫣的办公室' },
  { id: 'office.lu-mi.v1', name: '陆弥的办公室' },
  { id: 'office.bai-shuangming.v1', name: '白霜命的办公室' },
  { id: 'office.jingyuniang.v1', name: '鲸鱼娘的办公室' },
  { id: 'office.claude.v1', name: '克劳德的办公室' },
  { id: 'office.longmama.v1', name: '龙妈妈的办公室' },
  { id: 'office.gemini.v1', name: '吉米的办公室' },
  { id: 'office.grok.v1', name: '绯洛的办公室' },
])

/** Resource registration and actor admission remain separate; staged identities stay staged. */
export const OFFICE_OUTFIT_CHOICES = Object.freeze(OFFICE_EMPLOYEE_IDS.map(employeeId => {
  const skinId = `skin.${employeeId}.v1` as const
  const pack = getEmployeeSkinPack(employeeId, skinId)
  return Object.freeze({ employeeId, name: OFFICE_EMPLOYEE_DEFINITIONS[employeeId].displayName, skinId,
    skinName: pack?.name ?? 'V1 衣装', defaultSkinId: getBrowserOfficeDefaultSkinId(employeeId),
    available: isBrowserOfficeOutfitReady(employeeId, skinId) })
}))

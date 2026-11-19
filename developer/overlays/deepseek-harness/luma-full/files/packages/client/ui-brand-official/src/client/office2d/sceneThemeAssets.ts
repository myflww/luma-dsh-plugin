import type { OfficeTimePhase } from './timePolicy.ts'
import type { OfficeAssetId } from './assets.ts'
import { READY_EMPLOYEE_SKIN_IDS } from './employeeSkins.ts'
import { EXTENDED_READY_SCENE_ART_IDS } from './extendedSceneThemeAssetRecords.ts'

export const OFFICE_THEME_IDS = ['office.duanmu-yan.v1', 'office.lu-mi.v1', 'office.bai-shuangming.v1', 'office.jingyuniang.v1', 'office.claude.v1', 'office.longmama.v1', 'office.gemini.v1', 'office.grok.v1'] as const
export type OfficeThemeId = typeof OFFICE_THEME_IDS[number]
export const INDEPENDENT_OFFICE_THEME_IDS = ['office.jingyuniang.v1','office.claude.v1','office.longmama.v1','office.gemini.v1','office.grok.v1'] as const
export function isIndependentOfficeTheme(value: string | undefined): boolean {
  return INDEPENDENT_OFFICE_THEME_IDS.some(id => id === value)
}
export function normalizeOfficeTheme(value: string | undefined): OfficeThemeId | undefined {
  return OFFICE_THEME_IDS.find(id => id === value)
}

const world = (character: 'duanmu-yan' | 'lu-mi' | 'bai-shuangming' | 'jingyuniang' | 'claude' | 'longmama' | 'gemini' | 'grok'): Readonly<Record<OfficeTimePhase, OfficeAssetId>> => Object.freeze({
  morning: `office.theme.${character}.morning.v1`, noon: `office.theme.${character}.noon.v1`,
  afternoon: `office.theme.${character}.afternoon.v1`, dusk: `office.theme.${character}.dusk.v1`,
  night: `office.theme.${character}.night.v1`, closed: `office.theme.${character}.closed.v1`,
})
export const OFFICE_THEME_WORLD_ASSET_IDS_BY_PHASE = Object.freeze({
  'office.duanmu-yan.v1': world('duanmu-yan'),
  'office.lu-mi.v1': world('lu-mi'),
  'office.bai-shuangming.v1': world('bai-shuangming'),
  'office.jingyuniang.v1': world('jingyuniang'),
  'office.claude.v1': world('claude'),
  'office.longmama.v1': world('longmama'),
  'office.gemini.v1': world('gemini'),
  'office.grok.v1': world('grok'),
})

/** Theme render admission and complete skin-resource admission; neither grants ownership. */
export const READY_SCENE_ART_IDS: readonly string[] = Object.freeze([
  'office.duanmu-yan.v1', 'office.lu-mi.v1', 'office.bai-shuangming.v1',
  'bedroom.duanmu-yan.v1', 'bedroom.lu-mi.v1', 'bedroom.bai-shuangming.v1',
  ...EXTENDED_READY_SCENE_ART_IDS,
  ...READY_EMPLOYEE_SKIN_IDS,
])

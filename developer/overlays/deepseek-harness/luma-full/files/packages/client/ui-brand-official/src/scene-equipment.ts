import { SKIN_EMPLOYEE_IDS, getEmployeeSkinRegistration, isRegisteredEmployeeSkinFor, type RegisteredEmployeeSkinId } from './employee-skin-registry.ts'

/** Durable scene choices are separate from workbench appearance and asset ownership. */
export const SCENE_EQUIPMENT_NAMESPACE = 'luma-scene-equipment'
export const SCENE_EQUIPMENT_FIELD = 'equipment'
export const SCENE_EQUIPMENT_EMPLOYEES = SKIN_EMPLOYEE_IDS
export type SceneEquipmentEmployeeId = typeof SCENE_EQUIPMENT_EMPLOYEES[number]
export const OFFICE_THEME_IDS = ['office.duanmu-yan.v1', 'office.lu-mi.v1', 'office.bai-shuangming.v1',
  'office.jingyuniang.v1', 'office.claude.v1', 'office.longmama.v1', 'office.gemini.v1', 'office.grok.v1'] as const
export const BEDROOM_THEME_IDS = ['bedroom.duanmu-yan.v1', 'bedroom.lu-mi.v1', 'bedroom.bai-shuangming.v1',
  'bedroom.jingyuniang.v1', 'bedroom.claude.v1', 'bedroom.longmama.v1', 'bedroom.gemini.v1', 'bedroom.grok.v1'] as const
export type OfficeThemeId = typeof OFFICE_THEME_IDS[number]
export type BedroomThemeId = typeof BEDROOM_THEME_IDS[number]
export type SceneThemeId = OfficeThemeId | BedroomThemeId
export type SceneSkinId = RegisteredEmployeeSkinId
export type SceneEquipmentAssetId = SceneThemeId | SceneSkinId
export type SceneEquipmentSubject = `local-demo:${string}` | `cloud:${string}`
export interface SceneEquipmentSelectionV1 {
  readonly officeTheme: OfficeThemeId | null
  readonly employeeSkins: Readonly<Partial<Record<SceneEquipmentEmployeeId, SceneSkinId>>>
  readonly bedroomThemes: Readonly<Partial<Record<SceneEquipmentEmployeeId, BedroomThemeId>>>
}
export interface SceneEquipmentDocumentV1 {
  readonly schemaVersion: 1
  readonly subjects: Readonly<Record<string, SceneEquipmentSelectionV1>>
}
export const EMPTY_SCENE_SELECTION: SceneEquipmentSelectionV1 = Object.freeze({officeTheme: null, employeeSkins: Object.freeze({}), bedroomThemes: Object.freeze({})})
export const EMPTY_SCENE_EQUIPMENT: SceneEquipmentDocumentV1 = Object.freeze({schemaVersion: 1, subjects: Object.freeze({})})
const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
  && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
export const isSceneEquipmentSubject = (value: unknown): value is SceneEquipmentSubject => typeof value === 'string'
  && /^(?:local-demo|cloud):[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(value)
export const isSceneEquipmentEmployee = (value: unknown): value is SceneEquipmentEmployeeId => SCENE_EQUIPMENT_EMPLOYEES.some(id => id === value)
export const isSceneThemeId = (value: unknown): value is SceneThemeId => [...OFFICE_THEME_IDS, ...BEDROOM_THEME_IDS].some(id => id === value)
export const isSceneSkinId = (value: unknown): value is SceneSkinId => getEmployeeSkinRegistration(value) !== undefined
export const sceneCharacterSlug = (employee: SceneEquipmentEmployeeId): string => employee === 'shan' ? 'duanmu-yan' : employee

/** Exact keys, finite catalogs and budgets; unknown/future documents are never normalized or rewritten. */
export function decodeSceneEquipment(value: unknown): SceneEquipmentDocumentV1 | undefined {
  if (!record(value) || value.schemaVersion !== 1 || Object.keys(value).length !== 2 || !record(value.subjects)
    || Object.keys(value.subjects).length > 64) return undefined
  const subjects: Record<string, SceneEquipmentSelectionV1> = {}
  for (const [subject, raw] of Object.entries(value.subjects)) {
    if (!isSceneEquipmentSubject(subject) || !record(raw) || Object.keys(raw).length !== 3
      || !Object.hasOwn(raw, 'officeTheme') || !Object.hasOwn(raw, 'employeeSkins') || !Object.hasOwn(raw, 'bedroomThemes')
      || raw.officeTheme !== null && !OFFICE_THEME_IDS.some(id => id === raw.officeTheme)
      || !record(raw.employeeSkins) || !record(raw.bedroomThemes)
      || Object.keys(raw.employeeSkins).length > SCENE_EQUIPMENT_EMPLOYEES.length || Object.keys(raw.bedroomThemes).length > BEDROOM_THEME_IDS.length) return undefined
    for (const [employee, skin] of Object.entries(raw.employeeSkins)) {
      if (!isSceneEquipmentEmployee(employee) || !isRegisteredEmployeeSkinFor(employee, skin)) return undefined
    }
    const themes = Object.values(raw.bedroomThemes)
    if (new Set(themes).size !== themes.length || Object.entries(raw.bedroomThemes).some(([room, theme]) =>
      !isSceneEquipmentEmployee(room) || !BEDROOM_THEME_IDS.some(id => id === theme))) return undefined
    subjects[subject] = Object.freeze({officeTheme: raw.officeTheme as OfficeThemeId | null,
      employeeSkins: Object.freeze({...raw.employeeSkins}), bedroomThemes: Object.freeze({...raw.bedroomThemes})}) as SceneEquipmentSelectionV1
  }
  return Object.freeze({schemaVersion: 1, subjects: Object.freeze(subjects)})
}

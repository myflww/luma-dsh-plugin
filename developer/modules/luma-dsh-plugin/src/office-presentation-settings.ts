import z from '@deepseek-ai/schemastery'
import { BEDROOM_THEME_IDS, OFFICE_THEME_IDS, type BedroomThemeId, type OfficeThemeId } from '../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/scene-equipment.ts'
import { SKIN_EMPLOYEE_IDS, type RegisteredSkinEmployeeId } from '../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/employee-skin-registry.ts'
import { isShopBedroomId, type ShopBedroomId } from './shared/shop-bedrooms.ts'

/** Local DSH presentation preferences; no task, purchase or account ownership data. */
export const OFFICE_PRESENTATION_NAMESPACE = 'luma-dsh-office-presentation'
export const OFFICE_PRESENTATION_FIELD = 'selection'
export type OfficePresentationThemeId = OfficeThemeId
export type OfficeNames = Readonly<Partial<Record<'classic' | OfficeThemeId, string>>>
export const cleanOfficeName = (name: string): string =>
  name.replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029\u202a-\u202e\u2066-\u2069]/gu, ' ').trim()
export type OfficePresentationEmployeeId = RegisteredSkinEmployeeId
export type OfficePresentationSkinId = `skin.${OfficePresentationEmployeeId}.v1`
export type OfficePresencePreference = 'all' | 'schedule'
export const DEFAULT_OFFICE_PRESENCE: OfficePresencePreference = 'schedule'
export interface OfficePresentationSelection {
  readonly schemaVersion: 1
  readonly officeTheme: OfficePresentationThemeId | null
  readonly officeNames?: OfficeNames
  readonly employeeSkins: Readonly<Partial<Record<OfficePresentationEmployeeId, OfficePresentationSkinId>>>
  readonly bedroomThemes?: Readonly<Partial<Record<OfficePresentationEmployeeId, BedroomThemeId | ShopBedroomId>>>
  /** Display preference only; never changes attendance or actual DSH work. */
  readonly presence?: OfficePresencePreference
}
export interface OfficePresentationSettings { readonly selection?: OfficePresentationSelection }

export const DEFAULT_OFFICE_PRESENTATION: OfficePresentationSelection = Object.freeze({
  schemaVersion: 1, officeTheme: null, employeeSkins: Object.freeze({}),
})
const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
  && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
export const isOfficePresentationTheme = (value: unknown): value is OfficePresentationThemeId => OFFICE_THEME_IDS.some(theme => theme === value)
export const isBedroomPresentationTheme = (value: unknown): value is BedroomThemeId | ShopBedroomId => isShopBedroomId(value) || BEDROOM_THEME_IDS.some(theme => theme === value)
export const isOfficePresentationEmployee = (value: unknown): value is OfficePresentationEmployeeId => SKIN_EMPLOYEE_IDS.some(employee => employee === value)

/** Reject unknown/future/cross-character values without rewriting the source document. */
export function decodeOfficePresentationSettings(value: unknown): OfficePresentationSettings | undefined {
  if (!record(value) || Object.keys(value).some(key => key !== OFFICE_PRESENTATION_FIELD)) return undefined
  if (!Object.hasOwn(value, OFFICE_PRESENTATION_FIELD)) return Object.freeze({})
  const selection = value.selection
  if (!record(selection) || selection.schemaVersion !== 1
    || Object.keys(selection).some(key => !['schemaVersion', 'officeTheme', 'officeNames', 'employeeSkins', 'presence', 'bedroomThemes'].includes(key))
    || Object.hasOwn(selection, 'presence') && selection.presence !== 'all' && selection.presence !== 'schedule'
    || !Object.hasOwn(selection, 'officeTheme') || selection.officeTheme !== null && !isOfficePresentationTheme(selection.officeTheme)
    || !record(selection.employeeSkins) || Object.entries(selection.employeeSkins).some(([employee, skin]) =>
      !isOfficePresentationEmployee(employee) || skin !== `skin.${employee}.v1`)) return undefined
  const bedrooms = selection.bedroomThemes
  const names = selection.officeNames
  if (Object.hasOwn(selection, 'officeNames') && (!record(names) || Object.entries(names).some(([key, name]) =>
    (key !== 'classic' && !isOfficePresentationTheme(key)) || typeof name !== 'string' || !name || cleanOfficeName(name) !== name))) return undefined
  const exclusive=record(bedrooms)?Object.values(bedrooms).filter(theme=>!isShopBedroomId(theme)):[]
  if (Object.hasOwn(selection, 'bedroomThemes') && (!record(bedrooms)
    || Object.entries(bedrooms).some(([employee, theme]) => !isOfficePresentationEmployee(employee) || !isBedroomPresentationTheme(theme))
    || new Set(exclusive).size !== exclusive.length)) return undefined
  return Object.freeze({ selection: Object.freeze({ schemaVersion: 1,
    officeTheme: selection.officeTheme as OfficePresentationThemeId | null,
    ...(record(names) ? { officeNames: Object.freeze({ ...names }) as OfficeNames } : {}),
    employeeSkins: Object.freeze({ ...selection.employeeSkins }) as OfficePresentationSelection['employeeSkins'],
    ...(record(bedrooms) ? { bedroomThemes: Object.freeze({ ...bedrooms }) as NonNullable<OfficePresentationSelection['bedroomThemes']> } : {}),
    ...(Object.hasOwn(selection, 'presence') ? { presence: selection.presence as OfficePresencePreference } : {}),
  }) })
}

/** Semantic validation owns the finite theme/identity contract on the Host. */
export const OfficePresentationSettingsSchema = z.dict(z.any().required(), z.string().pattern(/^selection$/u)).default({})
export function validateOfficePresentationSettingsWire(value: unknown): void {
  if (!decodeOfficePresentationSettings(value)) throw new Error('办公室主题设置格式不受支持，已保留原记录。')
}

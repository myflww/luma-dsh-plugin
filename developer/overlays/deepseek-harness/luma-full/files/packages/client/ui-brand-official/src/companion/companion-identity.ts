import { isOfficeEmployeeKey, type OfficeEmployeePresetKey } from '../office-employee-presets.ts'

export type CompanionId = OfficeEmployeePresetKey

export const isCompanionId = (value: unknown): value is CompanionId => isOfficeEmployeeKey(value)

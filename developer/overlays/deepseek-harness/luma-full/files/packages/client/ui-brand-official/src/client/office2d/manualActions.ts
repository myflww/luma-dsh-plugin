import type { OfficeWalkDirection } from './employeeCatalog.ts'
import { getEmployeeCatalogWithSkin } from './employeeSkins.ts'
import { getOfficeAsset, type OfficeAssetId } from './assets.ts'

export const OFFICE_MANUAL_ACTION_IDS = Object.freeze(['stand-front', 'front-step', 'back-step', 'left-step', 'right-step'] as const)
export type OfficeManualActionId = typeof OFFICE_MANUAL_ACTION_IDS[number]
export type OfficeManualPlayback = 'once' | 'loop' | 'hold'
export interface OfficeManualAction { readonly id: OfficeManualActionId; readonly mode: OfficeManualPlayback; readonly revision: number }
export interface OfficeManualActionChoice {
  readonly id: OfficeManualActionId
  readonly label: string
  readonly direction: OfficeWalkDirection
  readonly asset: OfficeAssetId
  readonly holdFrame: number
}
const DIRECTIONS = { 'stand-front': 'down', 'front-step': 'down', 'back-step': 'up', 'left-step': 'left', 'right-step': 'right' } as const
const LABELS = { 'stand-front': '站立', 'front-step': '向前步态', 'back-step': '向后步态', 'left-step': '向左步态', 'right-step': '向右步态' } as const

/** Only whole authored frames registered for this exact employee can play. */
export function officeManualActionChoices(employeeId: string, skinId?: string): readonly OfficeManualActionChoice[] {
  const catalog = getEmployeeCatalogWithSkin(employeeId, skinId)
  if (!catalog) return []
  return OFFICE_MANUAL_ACTION_IDS.flatMap(id => {
    const direction = DIRECTIONS[id]
    const asset = catalog.walk[direction]
    const strip = getOfficeAsset(asset).frameStrip
    if (!strip) return []
    return [{ id, label: LABELS[id], direction, asset,
      holdFrame: catalog.walkRest?.[direction]?.frameIndex ?? strip.frameCount - 1 }]
  })
}

export function isOfficeManualAction(value: unknown): value is OfficeManualAction {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const v = value as Record<string, unknown>
  return Object.keys(v).sort().join(',') === 'id,mode,revision'
    && OFFICE_MANUAL_ACTION_IDS.some(id => id === v.id)
    && (v.mode === 'once' || v.mode === 'loop' || v.mode === 'hold')
    && Number.isSafeInteger(v.revision) && (v.revision as number) > 0
}

export function resolveOfficeManualAction(employeeId: string, action: OfficeManualAction | undefined, skinId?: string) {
  if (!isOfficeManualAction(action)) return undefined
  const choice = officeManualActionChoices(employeeId, skinId).find(item => item.id === action.id)
  return choice ? { ...choice, ...action } : undefined
}

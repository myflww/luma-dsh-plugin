import {
  resolveOfficeAssetUrl,
  type OfficeAssetId,
} from './assets.ts'
import {
  OFFICE_TIME_PHASES,
  type OfficeTimePhase,
} from './timePolicy.ts'
import { normalizeOfficeTheme, OFFICE_THEME_WORLD_ASSET_IDS_BY_PHASE, OFFICE_THEME_IDS, isIndependentOfficeTheme, type OfficeThemeId } from './sceneThemeAssets.ts'

export const OFFICE_WORLD_ASSET_IDS_BY_PHASE = Object.freeze({
  [OFFICE_TIME_PHASES.MORNING]: 'office.world.morning.v2',
  [OFFICE_TIME_PHASES.NOON]: 'office.world.noon.v2',
  [OFFICE_TIME_PHASES.AFTERNOON]: 'office.world.afternoon.v2',
  [OFFICE_TIME_PHASES.DUSK]: 'office.world.dusk.v2',
  [OFFICE_TIME_PHASES.NIGHT]: 'office.world.night.v2',
  [OFFICE_TIME_PHASES.CLOSED]: 'office.world.closed.v2',
} satisfies Readonly<Record<OfficeTimePhase, OfficeAssetId>>)

export const OFFICE_WORKSTATION_PROPS_ASSET_IDS_BY_PHASE = Object.freeze({
  [OFFICE_TIME_PHASES.MORNING]: 'office.workstation-props.morning.v1',
  [OFFICE_TIME_PHASES.NOON]: 'office.workstation-props.noon.v1',
  [OFFICE_TIME_PHASES.AFTERNOON]: 'office.workstation-props.afternoon.v1',
  [OFFICE_TIME_PHASES.DUSK]: 'office.workstation-props.dusk.v1',
  [OFFICE_TIME_PHASES.NIGHT]: 'office.workstation-props.night.v1',
  [OFFICE_TIME_PHASES.CLOSED]: 'office.workstation-props.closed.v1',
} satisfies Readonly<Record<OfficeTimePhase, OfficeAssetId>>)

export const OFFICE_CHAIR_FOREGROUND_ASSET_IDS_BY_PHASE = Object.freeze({
  [OFFICE_TIME_PHASES.MORNING]: 'office.workstation-chairs.morning.v1',
  [OFFICE_TIME_PHASES.NOON]: 'office.workstation-chairs.noon.v1',
  [OFFICE_TIME_PHASES.AFTERNOON]: 'office.workstation-chairs.afternoon.v1',
  [OFFICE_TIME_PHASES.DUSK]: 'office.workstation-chairs.dusk.v1',
  [OFFICE_TIME_PHASES.NIGHT]: 'office.workstation-chairs.night.v1',
  [OFFICE_TIME_PHASES.CLOSED]: 'office.workstation-chairs.closed.v1',
} satisfies Readonly<Record<OfficeTimePhase, OfficeAssetId>>)

/** Independent spaces already contain their own furniture and computer geometry. */
export const OFFICE_WORLD_ASSET_IDS_BY_THEME_AND_PHASE = Object.freeze({default: OFFICE_WORLD_ASSET_IDS_BY_PHASE,
  ...OFFICE_THEME_WORLD_ASSET_IDS_BY_PHASE})
const sameForeground = <T,>(value: T): Readonly<Record<'default' | OfficeThemeId, T>> => Object.freeze({default:value, ...Object.fromEntries(OFFICE_THEME_IDS.map(id => [id,value]))}) as Readonly<Record<'default' | OfficeThemeId, T>>
export const OFFICE_WORKSTATION_PROPS_ASSET_IDS_BY_THEME_AND_PHASE = sameForeground(OFFICE_WORKSTATION_PROPS_ASSET_IDS_BY_PHASE)
export const OFFICE_CHAIR_FOREGROUND_ASSET_IDS_BY_THEME_AND_PHASE = sameForeground(OFFICE_CHAIR_FOREGROUND_ASSET_IDS_BY_PHASE)

const normalizePhase = (phase: string): OfficeTimePhase =>
  Object.prototype.hasOwnProperty.call(OFFICE_WORLD_ASSET_IDS_BY_PHASE, phase)
    ? phase as OfficeTimePhase
    : OFFICE_TIME_PHASES.NOON

export function getOfficeWorldAssetIdForPhase(phase: string, theme?: string): OfficeAssetId {
  return OFFICE_WORLD_ASSET_IDS_BY_THEME_AND_PHASE[normalizeOfficeTheme(theme) ?? 'default'][normalizePhase(phase)]
}

export function getOfficeChairForegroundAssetIdForPhase(phase: string, theme?: string): OfficeAssetId | undefined {
  if (isIndependentOfficeTheme(theme)) return undefined
  return OFFICE_CHAIR_FOREGROUND_ASSET_IDS_BY_THEME_AND_PHASE[normalizeOfficeTheme(theme) ?? 'default'][normalizePhase(phase)]
}

export function getOfficeWorkstationPropsAssetIdForPhase(phase: string, theme?: string): OfficeAssetId | undefined {
  if (isIndependentOfficeTheme(theme)) return undefined
  return OFFICE_WORKSTATION_PROPS_ASSET_IDS_BY_THEME_AND_PHASE[normalizeOfficeTheme(theme) ?? 'default'][normalizePhase(phase)]
}

/**
 * Resolve a phase-matched 1672x941 background; each independent theme owns
 * its complete architecture, furniture and measured workstation layout.
 */
export function getOfficeWorldAssetForPhase(
  phase: string,
  publicBase?: string,
  theme?: string,
): string {
  return resolveOfficeAssetUrl(getOfficeWorldAssetIdForPhase(phase, theme), publicBase)
}

/** A phase-matched chair-only atlas keeps desk devices out of this plane. */
export function getOfficeChairForegroundAssetForPhase(
  phase: string,
  publicBase?: string,
  theme?: string,
): string {
  const id = getOfficeChairForegroundAssetIdForPhase(phase, theme)
  if (id === undefined) return ''
  return resolveOfficeAssetUrl(
    id,
    publicBase,
  )
}

/** Full-canvas transparent workstation props paired with the same phase. */
export function getOfficeWorkstationPropsAssetForPhase(
  phase: string,
  publicBase?: string,
  theme?: string,
): string {
  const id = getOfficeWorkstationPropsAssetIdForPhase(phase, theme)
  if (id === undefined) return ''
  return resolveOfficeAssetUrl(
    id,
    publicBase,
  )
}

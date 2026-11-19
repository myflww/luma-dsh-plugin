import { officeFrameGrid, resolveOfficeAssetUrl, type OfficeAssetId, type OfficeAssetRecord, type OfficeFrameStrip } from './assets.ts'
import { getEmployeeCatalogEntry, isOfficialEmployeeId, type OfficeEmployeeCatalogEntry, type OfficeEmployeeId, type OfficeWalkDirection, type ResolvedOfficeEmployeeAssets } from './employeeCatalog.ts'
import { getEmployeeTypingProfile, type OfficeEmployeeTypingProfile, type OfficeTypingPoint } from './employeeTypingRigs.ts'
import type { OfficeTypingFacing } from './workstations.ts'
import { EXTENDED_SKIN_PACKS, EXTENDED_SKIN_ASSET_RECORDS } from './extendedEmployeeSkinAssetRecords.ts'
import { SKIN_PACKS, SKIN_ASSET_RECORDS } from './officeSkinAssetRecords.ts'
import { WORK_MOTION_REPLACEMENTS } from './workMotionAssetRecords.generated.ts'

import { EMPLOYEE_SKIN_REGISTRY, getEmployeeSkinRegistration, isRegisteredEmployeeSkinFor } from '../../employee-skin-registry.ts'

const WALK_DIRECTIONS = ['left', 'right', 'up', 'down'] as const
const TYPING_FACINGS = ['back', 'backLeft', 'backRight', 'front'] as const
const TYPING_ACTION = { back: 'back', backLeft: 'back-left', backRight: 'back-right', front: 'front' } as const
type SkinRect = Readonly<{ x: number; y: number; width: number; height: number }>
export interface EmployeeSkinTypingProfile extends Omit<OfficeEmployeeTypingProfile, 'integratedChair' | 'useRearChairOcclusion'> {
  readonly integratedChair: boolean
  readonly useRearChairOcclusion: boolean
  readonly landmarks: Readonly<Record<'foot' | 'hip' | 'hand' | 'head', OfficeTypingPoint>>
  readonly handRect: SkinRect
  readonly visibleRect: SkinRect
  readonly height: number
}
export interface EmployeeSkinWalkProfile {
  readonly coreHeightPx: number
  readonly anchor: OfficeTypingPoint
}
export type SkinEmployeeId = OfficeEmployeeId | 'gemini' | 'grok'
export interface EmployeeSkinPack {
  readonly employeeId: SkinEmployeeId
  readonly name: string
  /** Complete source files can be previewed before the outfit is ready for sale. */
  readonly runtimeReady: boolean
  readonly assets: Readonly<{
    portrait: OfficeAssetId
    avatar: OfficeAssetId
    portraitScene: OfficeAssetId
    sleep: OfficeAssetId
    walk: Readonly<Record<OfficeWalkDirection, OfficeAssetId>>
    typing: Readonly<Record<OfficeTypingFacing, OfficeAssetId>>
    reportHandoff: OfficeAssetId
  }>
  readonly walkProfiles: Readonly<Record<OfficeWalkDirection, EmployeeSkinWalkProfile>>
  readonly typingProfiles: Readonly<Record<OfficeTypingFacing, EmployeeSkinTypingProfile>>
  readonly sleep: Readonly<{
    file: string
    sha256: string
    contactUVs: Readonly<Record<'backOfHead' | 'hips' | 'feetCenter', OfficeTypingPoint>>
  }>
}
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value)
const positive = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)
const point = (value: unknown): value is OfficeTypingPoint => object(value) && finite(value.x) && finite(value.y)
const uv = (value: unknown): value is OfficeTypingPoint => point(value) && value.x >= 0 && value.x <= 1 && value.y >= 0 && value.y <= 1
const rect = (value: unknown): value is SkinRect => object(value) && finite(value.x) && finite(value.y) && positive(value.width) && positive(value.height)
const digest = (value: unknown): value is string => typeof value === 'string' && /^[a-f\d]{64}$/.test(value)
const validFile = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && !value.startsWith('/') && !value.includes('..') && !value.includes('\\') && !/^[a-z][a-z\d+.-]*:/i.test(value)

/** Pure admission boundary: one missing action or profile rejects the entire outfit. */
export function validateEmployeeSkinPack(
  employeeId: string,
  skinId: string,
  candidate: unknown,
  records: Readonly<Record<string, unknown>>,
): candidate is EmployeeSkinPack {
  const registration = getEmployeeSkinRegistration(skinId)
  if (!(isOfficialEmployeeId(employeeId) || employeeId === 'gemini' || employeeId === 'grok') || !registration || registration.employeeId !== employeeId || !object(candidate)
    || candidate.employeeId !== employeeId || typeof candidate.name !== 'string' || !candidate.name.trim() || typeof candidate.runtimeReady !== 'boolean'
    || !object(candidate.assets) || !object(candidate.assets.walk) || !object(candidate.assets.typing)
    || !object(candidate.walkProfiles) || !object(candidate.typingProfiles) || !object(candidate.sleep)) return false
  const assets = candidate.assets
  const walk = assets.walk as Record<string, unknown>
  const typing = assets.typing as Record<string, unknown>
  const prefix = `employee.${employeeId}.skin.${registration.resourceVersion}.`
  const bindings: [unknown, string, readonly number[] | undefined][] = [
    [candidate.assets.portrait, 'portrait', undefined], [candidate.assets.avatar, 'avatar', undefined],
    [candidate.assets.portraitScene, 'portrait-scene', undefined], [candidate.assets.sleep, 'sleep', undefined],
    [candidate.assets.reportHandoff, 'report-handoff', ['bai-shuangming', 'jingyuniang', 'gemini', 'grok'].includes(employeeId) ? [7] : [6]],
    ...WALK_DIRECTIONS.map(direction => [walk[direction], `walk.${direction}`, direction === 'left' || direction === 'right' ? [12] : [6]] as [unknown, string, readonly number[]]),
    ...TYPING_FACINGS.map(facing => [typing[facing], `typing.${TYPING_ACTION[facing]}`, [4]] as [unknown, string, readonly number[]]),
  ]
  for (const [id, action, counts] of bindings) {
    if (typeof id !== 'string' || id !== `${prefix}${action}`) return false
    const record = records[id]
    if (!object(record) || record.id !== id || !digest(record.sha256) || !validFile(record.file)
      || !record.file.includes(record.sha256.slice(0, 12))
      || !record.file.split('/').at(-1)?.startsWith(`${employeeId}-skin-${registration.resourceVersion}-`) || !positive(record.bytes)
      || !object(record.dimensions) || !Number.isSafeInteger(record.dimensions.width) || !positive(record.dimensions.width)
      || !Number.isSafeInteger(record.dimensions.height) || !positive(record.dimensions.height)) return false
    if (counts === undefined) {
      if (record.kind !== 'actor-static' || record.frameStrip !== undefined) return false
      continue
    }
    const strip = record.frameStrip
    if (record.kind !== 'actor-sheet' || record.alpha !== true || !object(strip)
      || !Number.isSafeInteger(strip.frameCount) || !counts.includes(strip.frameCount as number)
      || !positive(strip.fps) || !uv(strip.anchor) || typeof strip.loop !== 'boolean'
      || !positive(strip.frameWidth) || !positive(strip.frameHeight)) return false
    try {
      const grid = officeFrameGrid(strip as unknown as OfficeFrameStrip)
      if (record.dimensions.width !== grid.width || record.dimensions.height !== grid.height) return false
    } catch { return false }
    if (action.startsWith('walk.') && (strip.frameWidth !== 592 || strip.frameHeight !== 724 || strip.loop !== true)) return false
    if (action.startsWith('typing.') && (strip.frameWidth !== 512 || strip.frameHeight !== 860 || strip.loop !== true)) return false
    if (action === 'report-handoff' && (!(strip.frameWidth === 768 && strip.frameHeight === 1152 || strip.frameWidth === 1024 && strip.frameHeight === 1536) || strip.loop !== false)) return false
    const order = strip.frameOrder
    if (order !== undefined && (!Array.isArray(order) || !order.length || order.length > 120
      || order.some(index => !Number.isSafeInteger(index) || index < 0 || index >= (strip.frameCount as number)))) return false
    const durations = strip.frameDurationsMs
    if (durations !== undefined && (!Array.isArray(durations) || durations.length !== (Array.isArray(order) ? order.length : strip.frameCount)
      || durations.some(duration => !positive(duration) || duration > 10000))) return false
  }
  for (const direction of WALK_DIRECTIONS) {
    const profile = candidate.walkProfiles[direction]
    if (!object(profile) || !positive(profile.coreHeightPx) || !uv(profile.anchor)) return false
  }
  for (const facing of TYPING_FACINGS) {
    const profile = candidate.typingProfiles[facing]
    if (!object(profile) || !uv(profile.anchor) || !uv(profile.seatAnchor)
      || !Array.isArray(profile.frameX) || profile.frameX.length !== 4 || !profile.frameX.every(finite)
      || !positive(profile.scaleMultiplier) || !positive(profile.fps)
      || !Number.isSafeInteger(profile.reducedMotionFrame) || (profile.reducedMotionFrame as number) < 0 || (profile.reducedMotionFrame as number) > 3
      || typeof profile.integratedChair !== 'boolean' || typeof profile.useRearChairOcclusion !== 'boolean'
      || !object(profile.landmarks)
      || !rect(profile.handRect) || !rect(profile.visibleRect) || !positive(profile.height)) return false
    const landmarks = profile.landmarks
    if (!['foot', 'hip', 'hand', 'head'].every(key => uv(landmarks[key]))) return false
  }
  const sleepRecord = records[candidate.assets.sleep as string]
  const contact = candidate.sleep.contactUVs
  return object(sleepRecord) && candidate.sleep.file === sleepRecord.file && candidate.sleep.sha256 === sleepRecord.sha256
    && object(contact) && ['backOfHead', 'hips', 'feetCenter'].every(key => uv(contact[key]))
}

const sourcePacks: Readonly<Record<string, unknown>> = Object.freeze({...SKIN_PACKS, ...EXTENDED_SKIN_PACKS})
const sourceRecords: Readonly<Record<string, unknown>> = Object.freeze({...SKIN_ASSET_RECORDS, ...EXTENDED_SKIN_ASSET_RECORDS})
const admittedPacks: Readonly<Record<string, EmployeeSkinPack>> = Object.freeze(Object.fromEntries(
  Object.entries(sourcePacks).flatMap(([skinId, pack]) => object(pack) && typeof pack.employeeId === 'string'
    && validateEmployeeSkinPack(pack.employeeId, skinId, pack, sourceRecords) ? [[skinId, pack]] : []),
))

// These two Browser employees have one complete authored outfit each. It is
// their default appearance, not a second invented base costume. The generated
// pack's historical Native staging/qualification fields remain unchanged.
const browserFirstOutfits = Object.freeze({
  gemini: Object.freeze({ name: '吉米', skinId: 'skin.gemini.v1' }),
  grok: Object.freeze({ name: '绯洛', skinId: 'skin.grok.v1' }),
})
export function getBrowserOfficeDefaultSkinId(employeeId: string): string | undefined {
  const first = Object.hasOwn(browserFirstOutfits, employeeId) ? browserFirstOutfits[employeeId as keyof typeof browserFirstOutfits] : undefined
  return first && getEmployeeSkinPack(employeeId, first.skinId) ? first.skinId : undefined
}

/** Browser resource admission only; ownership and persistent selection stay with the caller. */
export function isBrowserOfficeOutfitReady(employeeId: string, skinId: string | undefined): boolean {
  return getEmployeeCatalogWithSkin(employeeId, skinId) !== undefined
}

/** Resource admission does not grant an account ownership. SceneEquipmentStore owns that guard. */
export const READY_EMPLOYEE_SKIN_IDS: readonly string[] = Object.freeze(Object.keys(admittedPacks))
export function getEmployeeSkinPack(employeeId: string, skinId: string | undefined): EmployeeSkinPack | undefined {
  if (!isRegisteredEmployeeSkinFor(employeeId, skinId)) return undefined
  const pack = admittedPacks[skinId]
  return pack?.employeeId === employeeId ? pack : undefined
}
export function getEmployeeSkinName(skinId: string): string | undefined {
  return admittedPacks[skinId]?.name
}

/** Registration alone does not admit missing actions or grant ownership or actor activation. */
export function getReadyEmployeeSkinOptions(employeeId: string) {
  return Object.freeze(EMPLOYEE_SKIN_REGISTRY.flatMap(registration => {
    if (registration.employeeId !== employeeId) return []
    const pack = getEmployeeSkinPack(employeeId, registration.skinId)
    return pack ? [Object.freeze({ ...registration, pack })] : []
  }))
}

/** No selection preserves the original catalog. An explicit invalid selection renders no outfit. */
export function getEmployeeCatalogWithSkin(employeeId: string, skinId?: string): OfficeEmployeeCatalogEntry<SkinEmployeeId> | undefined {
  const original = getEmployeeCatalogEntry(employeeId)
  if (original && skinId === undefined) return original
  const defaultSkinId = getBrowserOfficeDefaultSkinId(employeeId)
  if (!original && !defaultSkinId) return undefined
  const pack = getEmployeeSkinPack(employeeId, skinId ?? defaultSkinId)
  if (!pack) return undefined
  const first = browserFirstOutfits[employeeId as keyof typeof browserFirstOutfits]
  const identity = original ? (({ walkRest: _originalRest, ...rest }) => rest)(original) : {
    id: pack.employeeId, name: first.name, modelId: `model-${employeeId}`,
    defaultBoundWorkstationId: null, portraitMotion: 'ambient-breathe' as const,
  }
  const report = sourceRecords[pack.assets.reportHandoff] as OfficeAssetRecord
  return Object.freeze({ ...identity, portrait: pack.assets.portrait, avatar: pack.assets.avatar,
    walk: pack.assets.walk, typing: pack.assets.typing,
    walkRest: Object.freeze(Object.fromEntries(WALK_DIRECTIONS.map(direction => [direction, Object.freeze({ asset: pack.assets.walk[direction], frameIndex: 0 })]))),
    reportHandoff: Object.freeze({ mode: 'frame-strip' as const, asset: pack.assets.reportHandoff, frameCount: report.frameStrip!.frameCount,
      frameAspectRatio: `${report.frameStrip!.frameWidth} / ${report.frameStrip!.frameHeight}` }),
  })
}
export function getEmployeeTypingProfileWithSkin(employeeId: string, facing: string, skinId?: string): OfficeEmployeeTypingProfile | undefined {
  const selectedSkinId = skinId ?? getBrowserOfficeDefaultSkinId(employeeId)
  if (selectedSkinId === undefined) {
    const profile = getEmployeeTypingProfile(employeeId, facing)
    const replacements = WORK_MOTION_REPLACEMENTS as Readonly<Record<string, Readonly<Record<string, string>>>>
    return replacements[employeeId]?.[facing] ? Object.freeze({ ...profile, reducedMotionFrame: 0 }) : profile
  }
  const profile = getEmployeeSkinPack(employeeId, selectedSkinId)?.typingProfiles[facing as OfficeTypingFacing]
  if (!profile) return undefined
  // Whole skin frames never inherit the base outfit's forearm or countertop stencils.
  const { integratedChair, useRearChairOcclusion, ...geometry } = profile
  const hand = profile.handRect
  const handMask = `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 860"><rect x="${hand.x * 512}" y="${hand.y * 860}" width="${hand.width * 512}" height="${hand.height * 860}" fill="white"/></svg>`)}")`
  return Object.freeze({ ...geometry,
    ...(integratedChair ? { integratedChair: true as const } : {}),
    ...(useRearChairOcclusion ? { useRearChairOcclusion: true as const } : {}),
    receptionCountertopForearmMask: handMask,
  })
}
export function getEmployeeSkinWalkProfile(employeeId: string, direction: string, skinId?: string): EmployeeSkinWalkProfile | undefined {
  return getEmployeeSkinPack(employeeId, skinId ?? getBrowserOfficeDefaultSkinId(employeeId))?.walkProfiles[direction as OfficeWalkDirection]
}
export function resolveOfficeEmployeeAssetsWithSkin(employeeId: string, skinId?: string, publicBase?: string): ResolvedOfficeEmployeeAssets | undefined {
  const catalog = getEmployeeCatalogWithSkin(employeeId, skinId)
  if (!catalog) return undefined
  const directions = <K extends string>(ids: Readonly<Record<K, OfficeAssetId>>): Readonly<Record<K, string>> => Object.freeze(Object.fromEntries(
    Object.entries(ids).map(([key, asset]) => [key, resolveOfficeAssetUrl(asset as OfficeAssetId, publicBase)]),
  ) as Record<K, string>)
  return Object.freeze({ portrait: resolveOfficeAssetUrl(catalog.portrait, publicBase), avatar: resolveOfficeAssetUrl(catalog.avatar, publicBase),
    walk: directions(catalog.walk), typing: directions(catalog.typing), reportHandoff: Object.freeze({ ...catalog.reportHandoff,
      ...(catalog.reportHandoff.asset === undefined ? {} : { asset: resolveOfficeAssetUrl(catalog.reportHandoff.asset, publicBase) }),
    }),
  })
}

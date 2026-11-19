import {
  resolveOfficeAssetUrl,
  type OfficeAssetId,
} from './assets.ts'
import type { OfficeWorkstationId } from './workstationSeating.ts'
import type { OfficeTypingFacing } from './workstations.ts'

export const EMPLOYEE_IDS = Object.freeze({
  DUANMU_YAN: 'shan',
  BAI_SHUANGMING: 'bai-shuangming',
  LU_MI: 'lu-mi',
  JINGYUNIANG: 'jingyuniang',
  LONGMAMA: 'longmama',
  CLAUDE: 'claude',
} as const)

export type OfficeEmployeeId = typeof EMPLOYEE_IDS[keyof typeof EMPLOYEE_IDS]
export type OfficeWalkDirection = 'right' | 'left' | 'up' | 'down'

export interface OfficeEmployeeReportHandoff {
  readonly mode: 'frame-strip' | 'portrait-transition'
  readonly asset?: OfficeAssetId
  readonly frameCount?: number
  readonly frameAspectRatio?: string
}

export interface OfficeEmployeeCatalogEntry<EmployeeId extends string = OfficeEmployeeId> {
  readonly id: EmployeeId
  readonly name: string
  readonly modelId: string
  readonly defaultBoundWorkstationId: OfficeWorkstationId | null
  readonly portrait: OfficeAssetId
  readonly portraitMotion: 'ambient-breathe'
  readonly reportHandoff: OfficeEmployeeReportHandoff
  readonly avatar: OfficeAssetId
  readonly walk: Readonly<Record<OfficeWalkDirection, OfficeAssetId>>
  readonly walkRest?: Readonly<Partial<Record<OfficeWalkDirection, Readonly<{
    asset: OfficeAssetId
    frameIndex: number
    scale?: number
    liftPercent?: number
    /** Explicit source-frame geometry for newly authored stills, independent of walking padding. */
    anchor?: Readonly<{ x: number; y: number }>
    coreHeightPx?: number
  }>>>>
  readonly typing: Readonly<Record<OfficeTypingFacing, OfficeAssetId>>
}

export interface CatalogEmployee {
  readonly id: OfficeEmployeeId
  readonly name: string
  readonly modelId: string
  readonly online: true
  readonly boundWorkstationId: OfficeWorkstationId | null
}

export interface ResolvedOfficeEmployeeAssets {
  readonly portrait: string
  readonly reportHandoff: Readonly<{
    mode: OfficeEmployeeReportHandoff['mode']
    asset?: string
    frameCount?: number
    frameAspectRatio?: string
  }>
  readonly avatar: string
  readonly walk: Readonly<Record<OfficeWalkDirection, string>>
  readonly typing: Readonly<Record<OfficeTypingFacing, string>>
}

const freezeAssetDirections = <K extends string>(
  assets: Readonly<Record<K, OfficeAssetId>>,
): Readonly<Record<K, OfficeAssetId>> => Object.freeze({ ...assets })

const catalogEntry = (
  input: Omit<OfficeEmployeeCatalogEntry, 'portraitMotion'> & {
    readonly portraitMotion?: OfficeEmployeeCatalogEntry['portraitMotion']
  },
): OfficeEmployeeCatalogEntry => Object.freeze({
  ...input,
  portraitMotion: input.portraitMotion ?? 'ambient-breathe',
  reportHandoff: Object.freeze({ ...input.reportHandoff }),
  walk: freezeAssetDirections(input.walk),
  ...(input.walkRest === undefined ? {} : { walkRest: Object.freeze({ ...input.walkRest }) }),
  typing: freezeAssetDirections(input.typing),
})

export const EMPLOYEE_CATALOG_ORDER = Object.freeze([
  EMPLOYEE_IDS.DUANMU_YAN,
  EMPLOYEE_IDS.BAI_SHUANGMING,
  EMPLOYEE_IDS.LU_MI,
  EMPLOYEE_IDS.JINGYUNIANG,
  EMPLOYEE_IDS.LONGMAMA,
  EMPLOYEE_IDS.CLAUDE,
] as const)

/**
 * Stable employee identity and authored animation selection.
 *
 * Workstation geometry, chair masks and monitor surfaces deliberately stay in
 * their environment-owned catalogs. Adding a character never recalibrates a
 * workstation or changes an already approved character's seating profile.
 */
export const EMPLOYEE_CATALOG = Object.freeze({
  [EMPLOYEE_IDS.DUANMU_YAN]: catalogEntry({
    id: EMPLOYEE_IDS.DUANMU_YAN,
    name: '端木嫣',
    modelId: 'model-a',
    defaultBoundWorkstationId: null,
    portrait: 'employee.duanmu-yan.portrait.v1',
    reportHandoff: {
      mode: 'frame-strip',
      asset: 'employee.duanmu-yan.report-handoff.v1',
      frameCount: 6,
      frameAspectRatio: '994 / 2373',
    },
    avatar: 'employee.duanmu-yan.avatar.v1',
    walk: {
      right: 'employee.duanmu-yan.walk.right.v3',
      left: 'employee.duanmu-yan.walk.left.v3',
      up: 'employee.duanmu-yan.walk.up.v2',
      down: 'employee.duanmu-yan.walk.down.v2',
    },
    walkRest: {
      right: { asset: 'employee.duanmu-yan.walk.right.v3', frameIndex: 3 },
      left: { asset: 'employee.duanmu-yan.walk.left.v3', frameIndex: 3 },
    },
    typing: {
      back: 'employee.duanmu-yan.typing.back.plugin-r1',
      backLeft: 'employee.duanmu-yan.typing.back-left.plugin-r1',
      backRight: 'employee.duanmu-yan.typing.back-right.v1',
      front: 'employee.duanmu-yan.typing.front.plugin-r1',
    },
  }),
  [EMPLOYEE_IDS.BAI_SHUANGMING]: catalogEntry({
    id: EMPLOYEE_IDS.BAI_SHUANGMING,
    name: '白霜命',
    modelId: 'model-a',
    defaultBoundWorkstationId: 'north-center',
    portrait: 'employee.bai-shuangming.portrait.v2',
    reportHandoff: { mode: 'portrait-transition' },
    avatar: 'employee.bai-shuangming.avatar.v1',
    walk: {
      right: 'employee.bai-shuangming.walk.right.v4',
      left: 'employee.bai-shuangming.walk.left.v5-low-clearance',
      up: 'employee.bai-shuangming.walk.up.v2',
      down: 'employee.bai-shuangming.walk.down.v2',
    },
    walkRest: {
      right: { asset: 'employee.bai-shuangming.walk.right.v4', frameIndex: 11 },
      left: { asset: 'employee.bai-shuangming.walk.left.v5-low-clearance', frameIndex: 11 },
    },
    typing: {
      back: 'employee.bai-shuangming.typing.back.plugin-r1',
      backLeft: 'employee.bai-shuangming.typing.back-left.plugin-r1',
      backRight: 'employee.bai-shuangming.typing.back-right.v2',
      front: 'employee.bai-shuangming.typing.front.plugin-r1',
    },
  }),
  [EMPLOYEE_IDS.LU_MI]: catalogEntry({
    id: EMPLOYEE_IDS.LU_MI,
    name: '陆弥',
    modelId: 'model-a',
    defaultBoundWorkstationId: 'south-focus',
    portrait: 'employee.lu-mi.portrait.v1',
    reportHandoff: { mode: 'portrait-transition' },
    avatar: 'employee.lu-mi.avatar.v1',
    walk: {
      right: 'employee.lu-mi.walk.right.v3',
      left: 'employee.lu-mi.walk.left.v4-low-front-f4',
      up: 'employee.lu-mi.walk.up.v1',
      down: 'employee.lu-mi.walk.down.v2',
    },
    walkRest: {
      right: { asset: 'employee.lu-mi.rest.right.plugin-r1', frameIndex: 0, anchor: { x: 767 / 1134, y: 1319 / 1387 }, coreHeightPx: 1173 },
      left: { asset: 'employee.lu-mi.rest.left.plugin-r1', frameIndex: 0, anchor: { x: 370 / 1135, y: 1308 / 1386 }, coreHeightPx: 1173 },
    },
    typing: {
      back: 'employee.lu-mi.typing.back.plugin-r1',
      backLeft: 'employee.lu-mi.typing.back-left.plugin-r1',
      backRight: 'employee.lu-mi.typing.back-right.plugin-r1',
      front: 'employee.lu-mi.typing.front.plugin-r1',
    },
  }),
  [EMPLOYEE_IDS.JINGYUNIANG]: catalogEntry({
    id: EMPLOYEE_IDS.JINGYUNIANG,
    name: '鲸鱼娘',
    modelId: 'model-a',
    defaultBoundWorkstationId: null,
    portrait: 'employee.jingyuniang.portrait.v1',
    reportHandoff: { mode: 'frame-strip', asset: 'employee.jingyuniang.report-handoff.v1', frameCount: 6, frameAspectRatio: '2 / 3' },
    avatar: 'employee.jingyuniang.avatar.v1',
    walk: { right: 'employee.jingyuniang.walk.right.v1', left: 'employee.jingyuniang.walk.left.v1', up: 'employee.jingyuniang.walk.up.v1', down: 'employee.jingyuniang.walk.down.v1' },
    walkRest: { up: { asset: 'employee.jingyuniang.walk.up.v1', frameIndex: 4 } },
    typing: { back: 'employee.jingyuniang.typing.back.v1', backLeft: 'employee.jingyuniang.typing.back-left.v1', backRight: 'employee.jingyuniang.typing.back-right.v1', front: 'employee.jingyuniang.typing.front.v1' },
  }),
  [EMPLOYEE_IDS.LONGMAMA]: catalogEntry({
    id: EMPLOYEE_IDS.LONGMAMA,
    name: '龙妈妈',
    modelId: 'model-a',
    defaultBoundWorkstationId: null,
    portrait: 'employee.longmama.portrait.v1',
    reportHandoff: { mode: 'frame-strip', asset: 'employee.longmama.report-handoff.v1', frameCount: 6, frameAspectRatio: '2 / 3' },
    avatar: 'employee.longmama.avatar.v1',
    walk: { right: 'employee.longmama.walk.right.v1', left: 'employee.longmama.walk.left.v1', up: 'employee.longmama.walk.up.v1', down: 'employee.longmama.walk.down.v1' },
    typing: { back: 'employee.longmama.typing.back.v1', backLeft: 'employee.longmama.typing.back-left.v1', backRight: 'employee.longmama.typing.back-right.v1', front: 'employee.longmama.typing.front.v1' },
  }),
  [EMPLOYEE_IDS.CLAUDE]: catalogEntry({
    id: EMPLOYEE_IDS.CLAUDE,
    name: '克劳德',
    modelId: 'model-a',
    defaultBoundWorkstationId: null,
    portrait: 'employee.claude.portrait.v1',
    reportHandoff: { mode: 'frame-strip', asset: 'employee.claude.report-handoff.v1', frameCount: 6, frameAspectRatio: '2 / 3' },
    avatar: 'employee.claude.avatar.v1',
    walk: { right: 'employee.claude.walk.right.v1', left: 'employee.claude.walk.left.v1', up: 'employee.claude.walk.up.v1', down: 'employee.claude.walk.down.v1' },
    typing: { back: 'employee.claude.typing.back.v1', backLeft: 'employee.claude.typing.back-left.v1', backRight: 'employee.claude.typing.back-right.v1', front: 'employee.claude.typing.front.v1' },
  }),
} satisfies Readonly<Record<OfficeEmployeeId, OfficeEmployeeCatalogEntry>>)

export function getEmployeeCatalogEntry(
  employeeId: string,
): OfficeEmployeeCatalogEntry | null {
  return isOfficialEmployeeId(employeeId) ? EMPLOYEE_CATALOG[employeeId] : null
}

export function isOfficialEmployeeId(employeeId: string): employeeId is OfficeEmployeeId {
  return Object.prototype.hasOwnProperty.call(EMPLOYEE_CATALOG, employeeId)
}

export function createCatalogEmployee(
  employeeId: string,
  options: Readonly<{ boundWorkstationId?: OfficeWorkstationId | null }> = {},
): CatalogEmployee | null {
  const entry = getEmployeeCatalogEntry(employeeId)
  if (!entry) return null

  return Object.freeze({
    id: entry.id,
    name: entry.name,
    modelId: entry.modelId,
    online: true as const,
    boundWorkstationId: options.boundWorkstationId === undefined
      ? entry.defaultBoundWorkstationId
      : options.boundWorkstationId,
  })
}

const resolveDirections = <K extends string>(
  assets: Readonly<Record<K, OfficeAssetId>>,
  publicBase?: string,
): Readonly<Record<K, string>> => Object.freeze(Object.fromEntries(
  Object.entries(assets).map(([key, assetId]) => [
    key,
    resolveOfficeAssetUrl(assetId as OfficeAssetId, publicBase),
  ]),
) as Record<K, string>)

/** Resolve one catalog entry without leaking prototype `/assets/**` paths. */
export function resolveOfficeEmployeeAssets(
  employeeId: string,
  publicBase?: string,
): ResolvedOfficeEmployeeAssets | null {
  const entry = getEmployeeCatalogEntry(employeeId)
  if (!entry) return null
  const handoffAsset = entry.reportHandoff.asset
  return Object.freeze({
    portrait: resolveOfficeAssetUrl(entry.portrait, publicBase),
    reportHandoff: Object.freeze({
      ...entry.reportHandoff,
      ...(handoffAsset === undefined
        ? {}
        : { asset: resolveOfficeAssetUrl(handoffAsset, publicBase) }),
    }),
    avatar: resolveOfficeAssetUrl(entry.avatar, publicBase),
    walk: resolveDirections(entry.walk, publicBase),
    typing: resolveDirections(entry.typing, publicBase),
  })
}

/**
 * Immutable office-art catalog for the Harness overlay.
 *
 * The files live in apps/web/public with content-addressed names. Consumers
 * resolve an asset ID through this module instead of importing prototype
 * `/assets/**` paths or leaking an absolute source-machine path into runtime.
 */
import { EXTENDED_SCENE_THEME_ASSET_RECORDS } from './extendedSceneThemeAssetRecords.ts'
import { SCENE_THEME_ASSET_RECORDS } from './sceneThemeAssetRecords.ts'
import { EXTENDED_SKIN_ASSET_RECORDS } from './extendedEmployeeSkinAssetRecords.ts'
import { SKIN_ASSET_RECORDS } from './officeSkinAssetRecords.ts'
import { STAGED_IDENTITY_ASSET_RECORDS, getStagedIdentityStaticArt, type StagedIdentityAssetId } from './stagedIdentityAssetRecords.ts'
import { WORK_MOTION_ASSET_RECORDS } from './workMotionAssetRecords.generated.ts'

export type OfficeAssetKind =
  | 'office-world'
  | 'office-overlay'
  | 'actor-static'
  | 'actor-sheet'

export type OfficeAssetId =
  | keyof typeof WORK_MOTION_ASSET_RECORDS
  | StagedIdentityAssetId
  | `employee.${'shan' | 'lu-mi' | 'bai-shuangming' | 'jingyuniang' | 'longmama' | 'claude' | 'gemini' | 'grok'}.skin.v1.${'portrait' | 'avatar' | 'portrait-scene' | 'sleep' | 'report-handoff' | `walk.${'left' | 'right' | 'up' | 'down'}` | `typing.${'back' | 'back-left' | 'back-right' | 'front'}`}`
  | `office.theme.${'duanmu-yan' | 'lu-mi' | 'bai-shuangming' | 'jingyuniang' | 'claude' | 'longmama' | 'gemini' | 'grok'}.${'morning' | 'noon' | 'afternoon' | 'dusk' | 'night' | 'closed'}.v1`
  // BEGIN new-roster office motion IDs
  | 'employee.jingyuniang.walk.left.v1'
  | 'employee.jingyuniang.walk.right.v1'
  | 'employee.jingyuniang.walk.up.v1'
  | 'employee.jingyuniang.walk.down.v1'
  | 'employee.jingyuniang.typing.back.v1'
  | 'employee.jingyuniang.typing.back-left.v1'
  | 'employee.jingyuniang.typing.back-right.v1'
  | 'employee.jingyuniang.typing.front.v1'
  | 'employee.jingyuniang.report-handoff.v1'
  | 'employee.longmama.walk.left.v1'
  | 'employee.longmama.walk.right.v1'
  | 'employee.longmama.walk.up.v1'
  | 'employee.longmama.walk.down.v1'
  | 'employee.longmama.typing.back.v1'
  | 'employee.longmama.typing.back-left.v1'
  | 'employee.longmama.typing.back-right.v1'
  | 'employee.longmama.typing.front.v1'
  | 'employee.longmama.report-handoff.v1'
  | 'employee.claude.walk.left.v1'
  | 'employee.claude.walk.right.v1'
  | 'employee.claude.walk.up.v1'
  | 'employee.claude.walk.down.v1'
  | 'employee.claude.typing.back.v1'
  | 'employee.claude.typing.back-left.v1'
  | 'employee.claude.typing.back-right.v1'
  | 'employee.claude.typing.front.v1'
  | 'employee.claude.report-handoff.v1'
  // END new-roster office motion IDs
  // BEGIN new-roster portrait IDs
  | 'employee.jingyuniang.portrait.v1'
  | 'employee.jingyuniang.avatar.v1'
  | 'employee.longmama.portrait.v1'
  | 'employee.longmama.avatar.v1'
  | 'employee.claude.portrait.v1'
  | 'employee.claude.avatar.v1'
  // END new-roster portrait IDs
  | 'office.world.morning.v2'
  | 'office.world.noon.v2'
  | 'office.world.afternoon.v2'
  | 'office.world.dusk.v2'
  | 'office.world.night.v2'
  | 'office.world.closed.v2'
  | 'office.workstation-props.morning.v1'
  | 'office.workstation-props.noon.v1'
  | 'office.workstation-props.afternoon.v1'
  | 'office.workstation-props.dusk.v1'
  | 'office.workstation-props.night.v1'
  | 'office.workstation-props.closed.v1'
  | 'office.workstation-chairs.morning.v1'
  | 'office.workstation-chairs.noon.v1'
  | 'office.workstation-chairs.afternoon.v1'
  | 'office.workstation-chairs.dusk.v1'
  | 'office.workstation-chairs.night.v1'
  | 'office.workstation-chairs.closed.v1'
  | 'employee.duanmu-yan.portrait.v1'
  | 'employee.duanmu-yan.report-handoff.v1'
  | 'employee.duanmu-yan.avatar.v1'
  | 'employee.duanmu-yan.walk.right.v3'
  | 'employee.duanmu-yan.walk.left.v3'
  | 'employee.duanmu-yan.walk.up.v2'
  | 'employee.duanmu-yan.walk.down.v2'
  | 'employee.duanmu-yan.typing.back-chair.v2'
  | 'employee.duanmu-yan.typing.back-left-chair.v2'
  | 'employee.duanmu-yan.typing.back-right.v1'
  | 'employee.duanmu-yan.typing.front-reception-chair.v3'
  | 'employee.duanmu-yan.reception-arm-mask.v2'
  | 'employee.bai-shuangming.portrait.v2'
  | 'employee.bai-shuangming.avatar.v1'
  | 'employee.bai-shuangming.walk.right.v4'
  | 'employee.bai-shuangming.walk.left.v4'
  | 'employee.bai-shuangming.walk.left.v5-low-clearance'
  | 'employee.bai-shuangming.walk.up.v2'
  | 'employee.bai-shuangming.walk.down.v2'
  | 'employee.bai-shuangming.typing.back-chair.v13'
  | 'employee.bai-shuangming.typing.back-left-chair.v3'
  | 'employee.bai-shuangming.typing.back-right.v2'
  | 'employee.bai-shuangming.typing.front-reception-chair.v3'
  | 'employee.bai-shuangming.reception-arm-mask.v3'
  | 'employee.lu-mi.portrait.v1'
  | 'employee.lu-mi.avatar.v1'
  | 'employee.lu-mi.walk.right.v1'
  | 'employee.lu-mi.walk.left.v1'
  | 'employee.lu-mi.walk.right.v3'
  | 'employee.lu-mi.walk.left.v3'
  | 'employee.lu-mi.walk.left.v4-low-front-f4'
  | 'employee.lu-mi.walk.up.v1'
  | 'employee.lu-mi.walk.down.v2'
  | 'employee.lu-mi.rest.right.whole.v2'
  | 'employee.lu-mi.rest.left.whole.v2'
  | 'employee.lu-mi.rest.left.plugin-r1'
  | 'employee.lu-mi.rest.right.plugin-r1'
  | 'employee.lu-mi.typing.back-chair.v1'
  | 'employee.lu-mi.typing.back-left.v2'
  | 'employee.lu-mi.typing.back-right.v2'
  | 'employee.lu-mi.typing.front-reception.v3'
  | 'employee.lu-mi.reception-arm-mask.v2'

export interface OfficeAssetDimensions {
  readonly width: number
  readonly height: number
}

export interface OfficeFrameStrip {
  readonly frameWidth: number
  readonly frameHeight: number
  readonly frameCount: number
  readonly atlasColumns?: number
  readonly atlasRows?: number
  readonly fps: number
  /** Physical atlas cell for each exposure; omitting it uses the cell order. */
  readonly frameOrder?: readonly number[]
  /** Authored exposure time for each entry in frameOrder; overrides uniform fps. */
  readonly frameDurationsMs?: readonly number[]
  readonly loop: boolean
  readonly anchor: Readonly<{ x: number; y: number }>
}

/** A complete physical cell layout. Spare cells are never playable frames. */
export function officeFrameGrid(strip: Pick<OfficeFrameStrip, 'frameWidth' | 'frameHeight' | 'frameCount' | 'atlasColumns' | 'atlasRows'>) {
  if (!Number.isSafeInteger(strip.frameWidth) || strip.frameWidth <= 0
    || !Number.isSafeInteger(strip.frameHeight) || strip.frameHeight <= 0
    || !Number.isSafeInteger(strip.frameCount) || strip.frameCount <= 0) throw new Error('Invalid office frame geometry')
  if ((strip.atlasColumns === undefined) !== (strip.atlasRows === undefined)) throw new Error('Invalid office atlas grid')
  const columns = strip.atlasColumns === undefined ? strip.frameCount : strip.atlasColumns
  const rows = strip.atlasRows === undefined ? 1 : strip.atlasRows
  const capacity = columns * rows, width = strip.frameWidth * columns, height = strip.frameHeight * rows
  if (!Number.isSafeInteger(columns) || columns <= 0 || !Number.isSafeInteger(rows) || rows <= 0
    || !Number.isSafeInteger(capacity) || capacity < strip.frameCount
    || !Number.isSafeInteger(width) || !Number.isSafeInteger(height)) throw new Error('Invalid office atlas grid')
  return { columns, rows, width, height }
}

export function officeFrameRect(strip: OfficeFrameStrip, frame: number): readonly [number, number, number, number] {
  const { columns } = officeFrameGrid(strip)
  if (!Number.isSafeInteger(frame) || frame < 0 || frame >= strip.frameCount) throw new Error('Invalid office physical frame')
  return [(frame % columns) * strip.frameWidth, Math.floor(frame / columns) * strip.frameHeight, strip.frameWidth, strip.frameHeight]
}

/** CSS foreground stencils must select the same physical cell as the canvas. */
export function officeFrameBackground(strip: OfficeFrameStrip, frame: number) {
  const { columns, rows } = officeFrameGrid(strip)
  officeFrameRect(strip, frame)
  return {
    backgroundSize: `${columns * 100}% ${rows * 100}%`,
    backgroundPosition: `${columns === 1 ? 0 : (frame % columns) / (columns - 1) * 100}% ${rows === 1 ? '0' : `${Math.floor(frame / columns) / (rows - 1) * 100}%`}`,
  }
}

export interface OfficeAssetRecord {
  readonly id: OfficeAssetId
  readonly kind: OfficeAssetKind
  readonly file: string
  /** Versioned plugin-owned art has a separate public root; historical files retain theirs. */
  readonly publicBase?: '/luma-office/luma-plugin-art/'
  readonly sha256: string
  readonly bytes: number
  readonly dimensions: OfficeAssetDimensions
  readonly alpha: boolean
  readonly frameStrip?: OfficeFrameStrip
}

const actorSheet = (
  record: Omit<OfficeAssetRecord, 'kind' | 'dimensions' | 'alpha' | 'frameStrip'>,
  frameStrip: OfficeFrameStrip,
): OfficeAssetRecord => Object.freeze({
  ...record,
  kind: 'actor-sheet',
  dimensions: Object.freeze({
    width: officeFrameGrid(frameStrip).width,
    height: officeFrameGrid(frameStrip).height,
  }),
  alpha: true,
  frameStrip: Object.freeze({
    ...frameStrip,
    ...(frameStrip.frameOrder === undefined ? {} : { frameOrder: Object.freeze([...frameStrip.frameOrder]) }),
    ...(frameStrip.frameDurationsMs === undefined ? {} : { frameDurationsMs: Object.freeze([...frameStrip.frameDurationsMs]) }),
    anchor: Object.freeze({ ...frameStrip.anchor }),
  }),
})

const actorStatic = (
  record: Omit<OfficeAssetRecord, 'kind' | 'alpha' | 'frameStrip'>,
): OfficeAssetRecord => Object.freeze({
  ...record,
  kind: 'actor-static',
  dimensions: Object.freeze({ ...record.dimensions }),
  alpha: true,
})

const officeScene = (
  record: Omit<OfficeAssetRecord, 'kind' | 'dimensions' | 'frameStrip'>,
  kind: 'office-world' | 'office-overlay',
): OfficeAssetRecord => Object.freeze({
  ...record,
  kind,
  dimensions: Object.freeze({ width: 1672, height: 941 }),
})

const WALK_STRIP = Object.freeze({
  frameWidth: 592,
  frameHeight: 724,
  frameCount: 6,
  fps: 8,
  loop: true,
  anchor: Object.freeze({ x: 0.5, y: 0.985 }),
})

const sideWalkStrip = (frameDurationsMs: readonly number[]): OfficeFrameStrip => Object.freeze({
  ...WALK_STRIP,
  frameCount: 12,
  fps: 12_000 / frameDurationsMs.reduce((sum, duration) => sum + duration, 0),
  frameDurationsMs: Object.freeze([...frameDurationsMs]),
})

// A planted foot gets a longer exposure; the swinging leg passes quickly.
// The three characters have different strides, so their timing is authored
// separately without duplicating or blending any whole-character frames.
const DUANMU_RIGHT_WALK_STRIP = sideWalkStrip([115, 85, 85, 145, 75, 95, 115, 80, 80, 90, 135, 100])
const DUANMU_LEFT_WALK_STRIP = sideWalkStrip([125, 90, 85, 145, 70, 85, 120, 90, 75, 85, 135, 95])
const BAI_SIDE_WALK_STRIP = sideWalkStrip([110, 90, 80, 70, 80, 130, 110, 80, 70, 80, 70, 130])
const LUMI_SIDE_WALK_STRIP = sideWalkStrip([128, 106, 77, 68, 64, 68, 128, 106, 77, 68, 64, 68])

const TYPING_STRIP = Object.freeze({
  frameWidth: 512,
  frameHeight: 860,
  frameCount: 4,
  fps: 4,
  loop: true,
  anchor: Object.freeze({ x: 0.5, y: 0.985 }),
})

export const OFFICE_ASSET_PUBLIC_BASE = '/luma-office/assets/'

export const OFFICE_ASSET_MANIFEST = Object.freeze({
  schemaVersion: 1,
  coordinateSpace: Object.freeze({ width: 1672, height: 941 }),
  provenance: Object.freeze({
    sourceProject: 'design/phase2-office-prototype',
    sourceProvider: '豆包 AI 生成',
    derivation: 'phase-matched workstation backgrounds and independent 2D prop atlas',
  }),
  rights: Object.freeze({
    intendedUse: 'internal-prototype',
    commercialRights: 'unconfirmed',
  }),
  rightsStatus: 'provisional-generated-assets; commercial rights not established',
  assets: Object.freeze({
    ...STAGED_IDENTITY_ASSET_RECORDS,
    ...WORK_MOTION_ASSET_RECORDS,
    ...SCENE_THEME_ASSET_RECORDS,
  ...EXTENDED_SCENE_THEME_ASSET_RECORDS,
    ...SKIN_ASSET_RECORDS,
    ...EXTENDED_SKIN_ASSET_RECORDS,
  // BEGIN new-roster office motion sources
    'employee.jingyuniang.walk.left.v1': actorSheet({
      id: 'employee.jingyuniang.walk.left.v1',
      file: 'jingyuniang-walk-left-v1.e394724fcf22.png',
      sha256: 'e394724fcf224e8a4ccc2cd844d5b7ad35ec9479eae967fc8faac6855cfed44d',
      bytes: 4492936,
    }, {"frameWidth":592,"frameHeight":724,"frameCount":12,"fps":11.741682974559687,"frameDurationsMs":[128,106,77,68,64,68,128,106,77,68,64,68],"loop":true,"anchor":{"x":0.5,"y":0.9654696132596685}}),
    'employee.jingyuniang.walk.right.v1': actorSheet({
      id: 'employee.jingyuniang.walk.right.v1',
      file: 'jingyuniang-walk-right-v1.b2719c4c9d28.png',
      sha256: 'b2719c4c9d28661a518edad54d6ebbf465da358a5bb9ebd340861ebc43c2afa3',
      bytes: 4679244,
    }, {"frameWidth":592,"frameHeight":724,"frameCount":12,"fps":11.741682974559687,"frameDurationsMs":[128,106,77,68,64,68,128,106,77,68,64,68],"loop":true,"anchor":{"x":0.5,"y":0.9654696132596685}}),
    'employee.jingyuniang.walk.up.v1': actorSheet({
      id: 'employee.jingyuniang.walk.up.v1',
      file: 'jingyuniang-walk-up-v1.b175000f5474.png',
      sha256: 'b175000f5474acdebed6b9a2cd47cd9a4d0d941c0e85cd31af7443c39bd64b8b',
      bytes: 1519680,
    }, {"frameWidth":592,"frameHeight":724,"frameCount":6,"fps":8,"frameDurationsMs":[155,135,90,125,95,150],"loop":true,"anchor":{"x":0.5,"y":0.9654696132596685}}),
    'employee.jingyuniang.walk.down.v1': actorSheet({
      id: 'employee.jingyuniang.walk.down.v1',
      file: 'jingyuniang-walk-down-v1.91a28afb5d64.png',
      sha256: '91a28afb5d64be28352e828b96e1fbc1d20605ecebd7994cef216c17ec602ad7',
      bytes: 1872666,
    }, {"frameWidth":592,"frameHeight":724,"frameCount":6,"fps":8,"frameDurationsMs":[150,90,155,125,90,140],"loop":true,"anchor":{"x":0.5,"y":0.9654696132596685}}),
    'employee.jingyuniang.typing.back.v1': actorSheet({
      id: 'employee.jingyuniang.typing.back.v1',
      file: 'jingyuniang-typing-back-v1.6de0fda03a22.png',
      sha256: '6de0fda03a227f5f550db3c38c0c1b2fe7bc4f29452e984532887b9ce7619080',
      bytes: 843642,
    }, {"frameWidth":512,"frameHeight":860,"frameCount":4,"fps":4,"frameDurationsMs":[250,250,250,250],"loop":true,"anchor":{"x":0.5,"y":0.985}}),
    'employee.jingyuniang.typing.back-left.v1': actorSheet({
      id: 'employee.jingyuniang.typing.back-left.v1',
      file: 'jingyuniang-typing-backLeft-v1.e1f3421ad27c.png',
      sha256: 'e1f3421ad27c37f22b895799a597ab0b67a02c0cdc83e470f3bc964eb0077bc4',
      bytes: 866999,
    }, {"frameWidth":512,"frameHeight":860,"frameCount":4,"fps":4,"frameDurationsMs":[250,250,250,250],"loop":true,"anchor":{"x":0.5,"y":0.985}}),
    'employee.jingyuniang.typing.back-right.v1': actorSheet({
      id: 'employee.jingyuniang.typing.back-right.v1',
      file: 'jingyuniang-typing-backRight-v1.222382597abe.png',
      sha256: '222382597abea9654458f86e749e48c2864c89721df330294c8b177cb75e78a1',
      bytes: 1063284,
    }, {"frameWidth":512,"frameHeight":860,"frameCount":4,"fps":4,"frameDurationsMs":[250,250,250,250],"loop":true,"anchor":{"x":0.5,"y":0.985}}),
    'employee.jingyuniang.typing.front.v1': actorSheet({
      id: 'employee.jingyuniang.typing.front.v1',
      file: 'jingyuniang-typing-front-v1.c294213a5643.png',
      sha256: 'c294213a5643cdbd87f05998ef8ab46c895ad3317128a1dc7e8e7e2a8d046dad',
      bytes: 1407108,
    }, {"frameWidth":512,"frameHeight":860,"frameCount":4,"fps":4,"frameDurationsMs":[250,250,250,250],"loop":true,"anchor":{"x":0.5,"y":0.985}}),
    'employee.jingyuniang.report-handoff.v1': actorStatic({
      id: 'employee.jingyuniang.report-handoff.v1',
      file: 'report-handoff-v1.e83f25f7bd75.png',
      sha256: 'e83f25f7bd75b655e8ca9a2ea64c697989c965223afe092a88fb38185b35b9a4',
      bytes: 4731923,
      dimensions: {"width":4608,"height":1152},
    }),
    'employee.longmama.walk.left.v1': actorSheet({
      id: 'employee.longmama.walk.left.v1',
      file: 'longmama-walk-left-v1.4c5a8bc8484f.png',
      sha256: '4c5a8bc8484fa10ce7a9e84e5ef18297dcbec4eb618a174acf0706dbe9a722ee',
      bytes: 614600,
    }, {"frameWidth":592,"frameHeight":724,"frameCount":12,"fps":11.741682974559687,"frameDurationsMs":[128,106,77,68,64,68,128,106,77,68,64,68],"loop":true,"anchor":{"x":0.5,"y":0.9654696132596685}}),
    'employee.longmama.walk.right.v1': actorSheet({
      id: 'employee.longmama.walk.right.v1',
      file: 'longmama-walk-right-v1.4edcaa1248f6.png',
      sha256: '4edcaa1248f6f5f592be89d27d7c6bfa9bb79a9002c1c8099e37a60856d7d806',
      bytes: 1076164,
    }, {"frameWidth":592,"frameHeight":724,"frameCount":12,"fps":11.741682974559687,"frameDurationsMs":[128,106,77,68,64,68,128,106,77,68,64,68],"loop":true,"anchor":{"x":0.5,"y":0.9654696132596685}}),
    'employee.longmama.walk.up.v1': actorSheet({
      id: 'employee.longmama.walk.up.v1',
      file: 'longmama-walk-up-v1.a30c6aeac5eb.png',
      sha256: 'a30c6aeac5eb51ab4db4cbb603c321a7ddb7ee040cacd057680b20b22da25150',
      bytes: 666210,
    }, {"frameWidth":592,"frameHeight":724,"frameCount":6,"fps":8,"frameDurationsMs":[155,135,90,125,95,150],"loop":true,"anchor":{"x":0.5,"y":0.9654696132596685}}),
    'employee.longmama.walk.down.v1': actorSheet({
      id: 'employee.longmama.walk.down.v1',
      file: 'longmama-walk-down-v1.4fe0b5ba060d.png',
      sha256: '4fe0b5ba060ddad422b2d08ff42b6cdbdb9f40f663109c606f851ded8445ef39',
      bytes: 1252175,
    }, {"frameWidth":592,"frameHeight":724,"frameCount":6,"fps":8,"frameDurationsMs":[150,90,155,125,90,140],"loop":true,"anchor":{"x":0.5,"y":0.9654696132596685}}),
    'employee.longmama.typing.back.v1': actorSheet({
      id: 'employee.longmama.typing.back.v1',
      file: 'longmama-typing-back-v1.6d5cbfd16381.png',
      sha256: '6d5cbfd16381482028f169b6ecb6cdb60ec1ab19e054f560cbbdef33d86573f2',
      bytes: 383653,
    }, {"frameWidth":512,"frameHeight":860,"frameCount":4,"fps":4,"frameDurationsMs":[250,250,250,250],"loop":true,"anchor":{"x":0.5,"y":0.985}}),
    'employee.longmama.typing.back-left.v1': actorSheet({
      id: 'employee.longmama.typing.back-left.v1',
      file: 'longmama-typing-backLeft-v1.39fe0724b9d8.png',
      sha256: '39fe0724b9d8de9c8a55ee11916fd7f2c92795858fa273d845e1dee3e86e2b03',
      bytes: 808472,
    }, {"frameWidth":512,"frameHeight":860,"frameCount":4,"fps":4,"frameDurationsMs":[250,250,250,250],"loop":true,"anchor":{"x":0.5,"y":0.985}}),
    'employee.longmama.typing.back-right.v1': actorSheet({
      id: 'employee.longmama.typing.back-right.v1',
      file: 'longmama-typing-backRight-v1.23b0510d95ee.png',
      sha256: '23b0510d95ee0b63e6e4dae4b76266186d758de6dd9e9607020dc152ea410382',
      bytes: 784995,
    }, {"frameWidth":512,"frameHeight":860,"frameCount":4,"fps":4,"frameDurationsMs":[250,250,250,250],"loop":true,"anchor":{"x":0.5,"y":0.985}}),
    'employee.longmama.typing.front.v1': actorSheet({
      id: 'employee.longmama.typing.front.v1',
      file: 'longmama-typing-front-v1.0861525ee9dd.png',
      sha256: '0861525ee9dde0306b815b7c22401b9307fb9d5c11da2b53bda12474e5e2816f',
      bytes: 1016551,
    }, {"frameWidth":512,"frameHeight":860,"frameCount":4,"fps":4,"frameDurationsMs":[250,250,250,250],"loop":true,"anchor":{"x":0.5,"y":0.985}}),
    'employee.longmama.report-handoff.v1': actorStatic({
      id: 'employee.longmama.report-handoff.v1',
      file: 'report-handoff-v1.4f75ef4e4200.png',
      sha256: '4f75ef4e420075417e1814435c88c797c00b3e58683c4914c4f6806d4b6f26dc',
      bytes: 6023532,
      dimensions: {"width":4608,"height":1152},
    }),
    'employee.claude.walk.left.v1': actorSheet({
      id: 'employee.claude.walk.left.v1',
      file: 'claude-walk-left-v1.271b9d6075e7.png',
      sha256: '271b9d6075e76748dd3f08c9cb04d3a79f79b010e23b73da2f59527ba90acba2',
      bytes: 1188392,
    }, {"frameWidth":592,"frameHeight":724,"frameCount":12,"fps":11.741682974559687,"frameDurationsMs":[128,106,77,68,64,68,128,106,77,68,64,68],"loop":true,"anchor":{"x":0.5,"y":0.9654696132596685}}),
    'employee.claude.walk.right.v1': actorSheet({
      id: 'employee.claude.walk.right.v1',
      file: 'claude-walk-right-v1.236c7b79b610.png',
      sha256: '236c7b79b6107c26b3180bf9b0ba030b40f4617427da5f19bb2fceb774439890',
      bytes: 840483,
    }, {"frameWidth":592,"frameHeight":724,"frameCount":12,"fps":11.741682974559687,"frameDurationsMs":[128,106,77,68,64,68,128,106,77,68,64,68],"loop":true,"anchor":{"x":0.5,"y":0.9654696132596685}}),
    'employee.claude.walk.up.v1': actorSheet({
      id: 'employee.claude.walk.up.v1',
      file: 'claude-walk-up-v1.0622a4645c7a.png',
      sha256: '0622a4645c7af58b52e6f1645a1a2fff1ec6f76c951b55b877c454370e35156b',
      bytes: 888490,
    }, {"frameWidth":592,"frameHeight":724,"frameCount":6,"fps":8,"frameDurationsMs":[155,135,90,125,95,150],"loop":true,"anchor":{"x":0.5,"y":0.9654696132596685}}),
    'employee.claude.walk.down.v1': actorSheet({
      id: 'employee.claude.walk.down.v1',
      file: 'claude-walk-down-v1.94d6c43f633d.png',
      sha256: '94d6c43f633d80abe451cbc24110b77587c54d6d7b4728321aca933ffe34231d',
      bytes: 2987654,
    }, {"frameWidth":592,"frameHeight":724,"frameCount":6,"fps":8,"frameDurationsMs":[150,90,155,125,90,140],"loop":true,"anchor":{"x":0.5,"y":0.9654696132596685}}),
    'employee.claude.typing.back.v1': actorSheet({
      id: 'employee.claude.typing.back.v1',
      file: 'claude-typing-back-v1.613ce89a3207.png',
      sha256: '613ce89a32070e604940dd175c4716f02d9d1ff1d0cd3bd647fe6c776afee970',
      bytes: 1166498,
    }, {"frameWidth":512,"frameHeight":860,"frameCount":4,"fps":4,"frameDurationsMs":[250,250,250,250],"loop":true,"anchor":{"x":0.5,"y":0.985}}),
    'employee.claude.typing.back-left.v1': actorSheet({
      id: 'employee.claude.typing.back-left.v1',
      file: 'claude-typing-backLeft-v1.c14639f22a21.png',
      sha256: 'c14639f22a2160294ad6356cb54e139bf6edf360ffe391aab56dbfd683d23feb',
      bytes: 1120086,
    }, {"frameWidth":512,"frameHeight":860,"frameCount":4,"fps":4,"frameDurationsMs":[250,250,250,250],"loop":true,"anchor":{"x":0.5,"y":0.985}}),
    'employee.claude.typing.back-right.v1': actorSheet({
      id: 'employee.claude.typing.back-right.v1',
      file: 'claude-typing-backRight-v1.9a4186765fa9.png',
      sha256: '9a4186765fa9ec7ade7f2e849fbd3090633ec9380eb27d1d3660a7f73c7aa4bc',
      bytes: 1171032,
    }, {"frameWidth":512,"frameHeight":860,"frameCount":4,"fps":4,"frameDurationsMs":[250,250,250,250],"loop":true,"anchor":{"x":0.5,"y":0.985}}),
    'employee.claude.typing.front.v1': actorSheet({
      id: 'employee.claude.typing.front.v1',
      file: 'claude-typing-front-v1.dccfd8c3116f.png',
      sha256: 'dccfd8c3116f6907900235d8c377c42d508281cc7609a51da72f669e7059d5c5',
      bytes: 1525938,
    }, {"frameWidth":512,"frameHeight":860,"frameCount":4,"fps":4,"frameDurationsMs":[250,250,250,250],"loop":true,"anchor":{"x":0.5,"y":0.985}}),
    'employee.claude.report-handoff.v1': actorStatic({
      id: 'employee.claude.report-handoff.v1',
      file: 'report-handoff-v1.2b244f2cef01.png',
      sha256: '2b244f2cef01453c04d8287cc3e94896098c77a128f62e1242143fb16d8e16f3',
      bytes: 6551628,
      dimensions: {"width":4608,"height":1152},
    }),
  // END new-roster office motion sources
  // BEGIN new-roster portrait sources
    'employee.jingyuniang.portrait.v1': actorStatic({
      id: 'employee.jingyuniang.portrait.v1',
      file: 'jingyuniang-portrait-v1.25f2f9d00390.png',
      sha256: '25f2f9d003905f5980b76f579eca858e7a0973ebb7e56dbc777ad0d96b4cfe23',
      bytes: 1905652,
      dimensions: { width: 1024, height: 1536 },
    }),
    'employee.jingyuniang.avatar.v1': actorStatic({
      id: 'employee.jingyuniang.avatar.v1',
      file: 'jingyuniang-avatar-v1.808602d19a6f.png',
      sha256: '808602d19a6fcdc7ffc17b290dbc0c22a2a7f385330c047ae83dfd457120be35',
      bytes: 1806077,
      dimensions: { width: 1254, height: 1254 },
    }),
    'employee.longmama.portrait.v1': actorStatic({
      id: 'employee.longmama.portrait.v1',
      file: 'longmama-portrait-v1.f824d9f1f5f1.png',
      sha256: 'f824d9f1f5f10cf3d64b90f08091e4c6f7a74d3fc03012773b4ded7b126c3dce',
      bytes: 2033886,
      dimensions: { width: 1024, height: 1536 },
    }),
    'employee.longmama.avatar.v1': actorStatic({
      id: 'employee.longmama.avatar.v1',
      file: 'longmama-avatar-v1.2d48b5cc6c53.png',
      sha256: '2d48b5cc6c53c5909fe3311ca12ade31025d52ad48dd8243d562e3d2e76b92ce',
      bytes: 1983184,
      dimensions: { width: 1254, height: 1254 },
    }),
    'employee.claude.portrait.v1': actorStatic({
      id: 'employee.claude.portrait.v1',
      file: 'claude-portrait-v1.b75199d87649.png',
      sha256: 'b75199d87649a1fb0f2ec77d1ff3d9c50a4154ba1f0d7d1cdbb1b6b4315f0192',
      bytes: 2341737,
      dimensions: { width: 1024, height: 1536 },
    }),
    'employee.claude.avatar.v1': actorStatic({
      id: 'employee.claude.avatar.v1',
      file: 'claude-avatar-v1.c70e3ddb5962.png',
      sha256: 'c70e3ddb5962a76aa0be985328c970b30222b56ae64e235b277fcb23a34b8ed7',
      bytes: 2046267,
      dimensions: { width: 1254, height: 1254 },
    }),
  // END new-roster portrait sources
    'office.world.morning.v2': officeScene({
      id: 'office.world.morning.v2',
      file: 'office-world-morning-v2.1be4d68f55bf.png',
      sha256: '1be4d68f55bf05328cd4c6081270b5c93a27a616e8dec726c79119b0277de8b9',
      bytes: 2_512_042,
      alpha: false,
    }, 'office-world'),
    'office.workstation-chairs.morning.v1': officeScene({
      id: 'office.workstation-chairs.morning.v1',
      file: 'office-workstation-chairs-morning-v1.98d8f61d1da9.png',
      sha256: '98d8f61d1da9dda31d8ef0393717b0d2bfa6d8b6d8c18838fa699639cdf4c87a',
      bytes: 85_350,
      alpha: true,
    }, 'office-overlay'),
    'office.workstation-props.morning.v1': officeScene({
      id: 'office.workstation-props.morning.v1',
      file: 'office-workstation-props-morning-v1.722821005c7f.png',
      sha256: '722821005c7fab656ee9a7a25e7dc736e49be720dc243107362002d161d417fe',
      bytes: 106_040,
      alpha: true,
    }, 'office-overlay'),
    'office.world.noon.v2': officeScene({
      id: 'office.world.noon.v2',
      file: 'office-world-noon-v2.da799bced411.png',
      sha256: 'da799bced4117ccf419e5180363afb3b891c8104303b81404031f9f78da12e38',
      bytes: 2_554_818,
      alpha: false,
    }, 'office-world'),
    'office.workstation-chairs.noon.v1': officeScene({
      id: 'office.workstation-chairs.noon.v1',
      file: 'office-workstation-chairs-noon-v1.c323ff816b8c.png',
      sha256: 'c323ff816b8ce76f133eacc392969bfca0ff679c047495529183beb5c043000f',
      bytes: 101_937,
      alpha: true,
    }, 'office-overlay'),
    'office.workstation-props.noon.v1': officeScene({
      id: 'office.workstation-props.noon.v1',
      file: 'office-workstation-props-noon-v1.d6d73e180557.png',
      sha256: 'd6d73e180557db8e7a1c09ef84ddb4bde194e0a607c74957982101795b56fafa',
      bytes: 126_015,
      alpha: true,
    }, 'office-overlay'),
    'office.world.afternoon.v2': officeScene({
      id: 'office.world.afternoon.v2',
      file: 'office-world-afternoon-v2.9d83c901cedb.png',
      sha256: '9d83c901cedb72788b84feeb2c744098cbeda77e2a70aebc9771c913378346e6',
      bytes: 2_676_169,
      alpha: false,
    }, 'office-world'),
    'office.workstation-chairs.afternoon.v1': officeScene({
      id: 'office.workstation-chairs.afternoon.v1',
      file: 'office-workstation-chairs-afternoon-v1.948a905612d5.png',
      sha256: '948a905612d5db638797a0c8c620b94f214d9f0b2dffa41fa9f64c582ca199e0',
      bytes: 85_196,
      alpha: true,
    }, 'office-overlay'),
    'office.workstation-props.afternoon.v1': officeScene({
      id: 'office.workstation-props.afternoon.v1',
      file: 'office-workstation-props-afternoon-v1.0874905b9471.png',
      sha256: '0874905b9471aba430c2e0d8c9acebf7b993216d5900a43302c0f46726d95a1b',
      bytes: 106_321,
      alpha: true,
    }, 'office-overlay'),
    'office.world.dusk.v2': officeScene({
      id: 'office.world.dusk.v2',
      file: 'office-world-dusk-v2.c93aaad1156b.png',
      sha256: 'c93aaad1156b26e70be911d22ae42d05714ec498c4c0480163f805a467916fee',
      bytes: 2_494_400,
      alpha: false,
    }, 'office-world'),
    'office.workstation-chairs.dusk.v1': officeScene({
      id: 'office.workstation-chairs.dusk.v1',
      file: 'office-workstation-chairs-dusk-v1.61b4651c20ad.png',
      sha256: '61b4651c20adeb0dc962ff708898aec1f8c9a1cd5b187e6bffa4a8d8aa57a9fe',
      bytes: 80_741,
      alpha: true,
    }, 'office-overlay'),
    'office.workstation-props.dusk.v1': officeScene({
      id: 'office.workstation-props.dusk.v1',
      file: 'office-workstation-props-dusk-v1.1535c9f2ecde.png',
      sha256: '1535c9f2ecde48677986008c715564e3f3c9d8ff76f72dc81e9bf7ffdf23b26f',
      bytes: 101_173,
      alpha: true,
    }, 'office-overlay'),
    'office.world.night.v2': officeScene({
      id: 'office.world.night.v2',
      file: 'office-world-night-v2.db058eee9b2a.png',
      sha256: 'db058eee9b2a509623f86cfee45307bbbeaf7d468489ac2cf0400dcc1401301b',
      bytes: 2_482_202,
      alpha: false,
    }, 'office-world'),
    'office.workstation-chairs.night.v1': officeScene({
      id: 'office.workstation-chairs.night.v1',
      file: 'office-workstation-chairs-night-v1.389f075490c9.png',
      sha256: '389f075490c98cc6d8dc35ffc146abf5a716fe6f08dff7280aa027fe08fc0a39',
      bytes: 81_478,
      alpha: true,
    }, 'office-overlay'),
    'office.workstation-props.night.v1': officeScene({
      id: 'office.workstation-props.night.v1',
      file: 'office-workstation-props-night-v1.028b55dc0c89.png',
      sha256: '028b55dc0c89013cdc57b682bd2365c388a19aea4be44394953224aa7700488f',
      bytes: 103_419,
      alpha: true,
    }, 'office-overlay'),
    'office.world.closed.v2': officeScene({
      id: 'office.world.closed.v2',
      file: 'office-world-closed-v2.b8644f0411c9.png',
      sha256: 'b8644f0411c9710afe895f942555d7badc3ee5de8df154005aaeb04c8c94052f',
      bytes: 2_215_021,
      alpha: false,
    }, 'office-world'),
    'office.workstation-chairs.closed.v1': officeScene({
      id: 'office.workstation-chairs.closed.v1',
      file: 'office-workstation-chairs-closed-v1.06da79fcbb56.png',
      sha256: '06da79fcbb5604abd909bdd3b6a5433cbbaf5126a254249c533730d37b569a5b',
      bytes: 75_095,
      alpha: true,
    }, 'office-overlay'),
    'office.workstation-props.closed.v1': officeScene({
      id: 'office.workstation-props.closed.v1',
      file: 'office-workstation-props-closed-v1.31f751426259.png',
      sha256: '31f751426259b13c788a0050434456da04dc8c812015b5cfbd7e488f57399292',
      bytes: 94_161,
      alpha: true,
    }, 'office-overlay'),
    'employee.duanmu-yan.portrait.v1': actorStatic({
      id: 'employee.duanmu-yan.portrait.v1',
      file: 'duanmu-yan-portrait-v1.554caadcc15c.png',
      sha256: '554caadcc15cc43b00c47588267947e727510d702310fdc72efd5329727a9b95',
      bytes: 1_561_837,
      dimensions: { width: 879, height: 1523 },
    }),
    'employee.duanmu-yan.report-handoff.v1': actorStatic({
      id: 'employee.duanmu-yan.report-handoff.v1',
      file: 'duanmu-yan-report-handoff-v1.40916b6e2951.png',
      sha256: '40916b6e2951db7286fa9ca6f3ffd6a9de242b017080a93d7b06bc4a5224622d',
      bytes: 1_799_433,
      dimensions: { width: 1988, height: 791 },
    }),
    'employee.duanmu-yan.avatar.v1': Object.freeze({
      id: 'employee.duanmu-yan.avatar.v1',
      kind: 'actor-static',
      file: 'duanmu-yan-avatar-v1.d35cdd0eb10a.png',
      sha256: 'd35cdd0eb10ab7aed95b9aa5dac1ad673bc397426f0f1774aa409e8da0275bd9',
      bytes: 653_193,
      dimensions: Object.freeze({ width: 587, height: 824 }),
      alpha: true,
    }),
    'employee.duanmu-yan.walk.right.v3': actorSheet({
      id: 'employee.duanmu-yan.walk.right.v3',
      file: 'duanmu-yan-walk-right-v3.8ac9e268df69.png',
      sha256: '8ac9e268df69f34a72c8989af94a8074bc277b8a81a070ab8d546bd43bafdf20',
      bytes: 3_706_861,
    }, DUANMU_RIGHT_WALK_STRIP),
    'employee.duanmu-yan.walk.left.v3': actorSheet({
      id: 'employee.duanmu-yan.walk.left.v3',
      file: 'duanmu-yan-walk-left-v3.e9053015f369.png',
      sha256: 'e9053015f3692486dc332a7cee948eebc59ab7d52bc10bdf4ba579a879d40948',
      bytes: 3_704_226,
    }, DUANMU_LEFT_WALK_STRIP),
    'employee.duanmu-yan.walk.up.v2': actorSheet({
      id: 'employee.duanmu-yan.walk.up.v2',
      file: 'duanmu-yan-walk-up-v2.fce91bb3a6f8.png',
      sha256: 'fce91bb3a6f80f0dbf82ab5e5c27433a3fc92ed7fab959018a7a92bcb1e8843f',
      bytes: 1_579_676,
    }, WALK_STRIP),
    'employee.duanmu-yan.walk.down.v2': actorSheet({
      id: 'employee.duanmu-yan.walk.down.v2',
      file: 'duanmu-yan-walk-down-v2.9e59c9d7878d.png',
      sha256: '9e59c9d7878d7aafa5ed004cf37d8c29996ac768f125cef04d2fbc3c00abee68',
      bytes: 1_898_409,
    }, WALK_STRIP),
    'employee.duanmu-yan.typing.back-chair.v2': actorSheet({
      id: 'employee.duanmu-yan.typing.back-chair.v2',
      file: 'duanmu-yan-seat-back-with-chair-v2.69f22ddb0dcd.png',
      sha256: '69f22ddb0dcdca538de3726ab6b55bcff5b4f6bb083d48417e137b5bdea0005e',
      bytes: 450_974,
    }, TYPING_STRIP),
    'employee.duanmu-yan.typing.back-left-chair.v2': actorSheet({
      id: 'employee.duanmu-yan.typing.back-left-chair.v2',
      file: 'duanmu-yan-seat-back-left-with-chair-v2.f4e29968283d.png',
      sha256: 'f4e29968283d7b125efa79061fc8fb7f2382ff145081522e291c66aecfa21f70',
      bytes: 450_883,
    }, TYPING_STRIP),
    'employee.duanmu-yan.typing.back-right.v1': actorSheet({
      id: 'employee.duanmu-yan.typing.back-right.v1',
      file: 'duanmu-yan-typing-back-right-v1.751c11dc3fd4.png',
      sha256: '751c11dc3fd458b6187cf08a96df2fc1a946f0b77a31a8310f3f344d23a4191c',
      bytes: 1_647_019,
    }, TYPING_STRIP),
    'employee.duanmu-yan.typing.front-reception-chair.v3': actorSheet({
      id: 'employee.duanmu-yan.typing.front-reception-chair.v3',
      file: 'duanmu-yan-typing-front-reception-chair-v3.722189b859fe.png',
      sha256: '722189b859fe5ba09d23d64437c4c340ec7e8d2bf3e141bae118267af86a2748',
      bytes: 499_629,
    }, TYPING_STRIP),
    'employee.duanmu-yan.reception-arm-mask.v2': actorStatic({
      id: 'employee.duanmu-yan.reception-arm-mask.v2',
      file: 'duanmu-yan-reception-countertop-arm-mask-v2.fba36651169c.png',
      sha256: 'fba36651169c7bd8270506c6ad896b017b947573246f0f7f12d9fccceefc03f0',
      bytes: 3_560,
      dimensions: { width: 512, height: 860 },
    }),
    'employee.bai-shuangming.portrait.v2': actorStatic({
      id: 'employee.bai-shuangming.portrait.v2',
      file: 'bai-shuangming-portrait-v2.fed1f9a07558.png',
      sha256: 'fed1f9a07558a74375ead01c9136628d7c33198f8d48da61a4997a96ac927092',
      bytes: 1_938_815,
      dimensions: { width: 1272, height: 1920 },
    }),
    'employee.bai-shuangming.avatar.v1': actorStatic({
      id: 'employee.bai-shuangming.avatar.v1',
      file: 'bai-shuangming-avatar-v1.40330fcc9b20.png',
      sha256: '40330fcc9b204884c01b74dd23fafbf43d3d44dea0f61ebc0e2c9e3c6fd99989',
      bytes: 468_744,
      dimensions: { width: 640, height: 800 },
    }),
    'employee.bai-shuangming.walk.right.v4': actorSheet({
      id: 'employee.bai-shuangming.walk.right.v4',
      file: 'bai-shuangming-walk-right-v4.bf444f398981.png',
      sha256: 'bf444f398981775e0b6c84239bc4bcd036aa3374d2a0cf8933b3a1f668884e90',
      bytes: 3_259_581,
    }, BAI_SIDE_WALK_STRIP),
    'employee.bai-shuangming.walk.left.v4': actorSheet({
      id: 'employee.bai-shuangming.walk.left.v4',
      file: 'bai-shuangming-walk-left-v4.fda325e6cab1.png',
      sha256: 'fda325e6cab10e34ce10bf56209f2bdb0188fe74964cec9e6188f4a041b4c588',
      bytes: 3_289_046,
    }, BAI_SIDE_WALK_STRIP),
    'employee.bai-shuangming.walk.left.v5-low-clearance': actorSheet({
      id: 'employee.bai-shuangming.walk.left.v5-low-clearance',
      file: 'bai-shuangming-walk-left-v5-low-clearance.aef9f368f495.png',
      sha256: 'aef9f368f49504c2f93e74d7f594b9ff344702a7ba3bdcc81ffcd5e8c25de903',
      bytes: 3_364_307,
    }, {
      ...BAI_SIDE_WALK_STRIP,
      // Cell 11 remains the declared standing pose, outside ordinary walking exposures.
      frameOrder: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      // Redistribute the former stop exposure; retain the 1100ms cycle and scene travel speed.
      frameDurationsMs: [125, 102, 91, 79, 91, 147, 125, 91, 79, 91, 79],
    }),
    'employee.bai-shuangming.walk.up.v2': actorSheet({
      id: 'employee.bai-shuangming.walk.up.v2',
      file: 'bai-shuangming-walk-up-v2.c2208beb48a7.png',
      sha256: 'c2208beb48a72fde71968030ab88cb786a412b8e97e84e53aef52ef1ccaea945',
      bytes: 1_374_582,
    }, WALK_STRIP),
    'employee.bai-shuangming.walk.down.v2': actorSheet({
      id: 'employee.bai-shuangming.walk.down.v2',
      file: 'bai-shuangming-walk-down-v2.771a359acf06.png',
      sha256: '771a359acf0645748ea34ea4e454bf4e3af296b8cb0cebeb50540cff38148a54',
      bytes: 1_703_992,
    }, WALK_STRIP),
    'employee.bai-shuangming.typing.back-chair.v13': actorSheet({
      id: 'employee.bai-shuangming.typing.back-chair.v13',
      file: 'bai-shuangming-typing-back-chair-v13.0b5adb46625d.png',
      sha256: '0b5adb46625d4cd4796fa04f75ad4df8b237bb65985567d1f791cacd9f4e4d69',
      bytes: 220_730,
    }, TYPING_STRIP),
    'employee.bai-shuangming.typing.back-left-chair.v3': actorSheet({
      id: 'employee.bai-shuangming.typing.back-left-chair.v3',
      file: 'bai-shuangming-typing-back-left-chair-v3.8c958c0f7f14.png',
      sha256: '8c958c0f7f1404438ef5ae8ab95580087c23662eba087080305b0b3d4e0de2d5',
      bytes: 235_756,
    }, TYPING_STRIP),
    'employee.bai-shuangming.typing.back-right.v2': actorSheet({
      id: 'employee.bai-shuangming.typing.back-right.v2',
      file: 'bai-shuangming-typing-back-right-v2.ab3677e7082c.png',
      sha256: 'ab3677e7082cda665ebd751ce29ea398c4cc66f2057a763089a4b071df3d2e0f',
      bytes: 1_578_633,
    }, TYPING_STRIP),
    'employee.bai-shuangming.typing.front-reception-chair.v3': actorSheet({
      id: 'employee.bai-shuangming.typing.front-reception-chair.v3',
      file: 'bai-shuangming-typing-front-reception-chair-v3.c42750725849.png',
      sha256: 'c427507258497c048aa802c38068e28377ab109a4c78fa1f099083be1191ebb4',
      bytes: 246_260,
    }, TYPING_STRIP),
    'employee.bai-shuangming.reception-arm-mask.v3': actorStatic({
      id: 'employee.bai-shuangming.reception-arm-mask.v3',
      file: 'bai-shuangming-reception-countertop-arm-mask-v3.c1f8e852a12d.png',
      sha256: 'c1f8e852a12dc085a242128cd265c0e2182cbbe897936983a0cd05416da01f1b',
      bytes: 3_388,
      dimensions: { width: 512, height: 860 },
    }),
    'employee.lu-mi.portrait.v1': actorStatic({
      id: 'employee.lu-mi.portrait.v1',
      file: 'lu-mi-portrait-v1.057d21dc90cf.png',
      sha256: '057d21dc90cf15d975f8d58c1cb7873e5d0b0125870b48b53705d39c76343eb5',
      bytes: 1_528_642,
      dimensions: { width: 1366, height: 1402 },
    }),
    'employee.lu-mi.avatar.v1': actorStatic({
      id: 'employee.lu-mi.avatar.v1',
      file: 'lu-mi-avatar-v1.b4320b48d5b9.png',
      sha256: 'b4320b48d5b9f8cfe0ad09990e297f8edaf0277716fff7a8050ae14ee639a53b',
      bytes: 1_070_657,
      dimensions: { width: 1086, height: 1448 },
    }),
    'employee.lu-mi.walk.right.v1': actorSheet({
      id: 'employee.lu-mi.walk.right.v1',
      file: 'lu-mi-walk-right-v1.9e4eafc1ad2c.png',
      sha256: '9e4eafc1ad2c9c1f06f23c9398bab399250b4f6a21ede687ecf981e1acbd1b16',
      bytes: 2_560_457,
    }, WALK_STRIP),
    'employee.lu-mi.walk.right.v3': actorSheet({
      id: 'employee.lu-mi.walk.right.v3',
      file: 'lu-mi-walk-right-v3.c626e4e953e1.png',
      sha256: 'c626e4e953e1b66249315533282d68ba8ca077e1da82c811ad427da6ef19a0b9',
      bytes: 4_355_230,
    }, LUMI_SIDE_WALK_STRIP),
    'employee.lu-mi.walk.left.v1': actorSheet({
      id: 'employee.lu-mi.walk.left.v1',
      file: 'lu-mi-walk-left-v1.33cb805ba1ea.png',
      sha256: '33cb805ba1ea0991a06d3923ef9ef2382ba3b4f1f63b611ba5a1ea1997b2eff6',
      bytes: 1_942_897,
    }, WALK_STRIP),
    'employee.lu-mi.walk.left.v3': actorSheet({
      id: 'employee.lu-mi.walk.left.v3',
      file: 'lu-mi-walk-left-v3.d5af3afaae04.png',
      sha256: 'd5af3afaae043b3a2dafb63055e9e89a60404e895229b6fdf26acccebc052fb3',
      bytes: 4_566_202,
    }, LUMI_SIDE_WALK_STRIP),
    'employee.lu-mi.walk.left.v4-low-front-f4': actorSheet({
      id: 'employee.lu-mi.walk.left.v4-low-front-f4',
      file: 'lu-mi-walk-left-v4-low-front-f4.da3e6f0e4169.png',
      sha256: 'da3e6f0e41694e8687ff1b74a9bd5353dec690783e053e9dda3f741eb265cb2c',
      bytes: 4_557_168,
    }, LUMI_SIDE_WALK_STRIP),
    'employee.lu-mi.walk.up.v1': actorSheet({
      id: 'employee.lu-mi.walk.up.v1',
      file: 'lu-mi-walk-up-v1.dee8ac599679.png',
      sha256: 'dee8ac599679178d5c667c0b12666e81140fe8d1ce07ee6595c68fd3f48ee18a',
      bytes: 1_811_042,
    }, { ...WALK_STRIP, frameDurationsMs: [155, 135, 90, 125, 95, 150] }),
    'employee.lu-mi.walk.down.v2': actorSheet({
      id: 'employee.lu-mi.walk.down.v2',
      file: 'lu-mi-walk-down-v2.5cef2e4611ef.png',
      sha256: '5cef2e4611ef263167a83a3c83ca8138704676c0325ac69620a3ab743c6c5ea5',
      bytes: 3_050_119,
    }, { ...WALK_STRIP, frameDurationsMs: [150, 90, 155, 125, 90, 140] }),
    'employee.lu-mi.rest.left.whole.v2': actorSheet({
      id: 'employee.lu-mi.rest.left.whole.v2',
      file: 'lu-mi-rest-left-whole-v2.3aab1fd20706.png',
      sha256: '3aab1fd20706f12764dbfd939c55c9dec541e471478d7fe81b89a0155fc64ac8',
      bytes: 358443,
    }, { ...WALK_STRIP, frameCount: 1, fps: 1, loop: false, anchor: { x: .5, y: 699 / 724 } }),
    'employee.lu-mi.rest.right.whole.v2': actorSheet({
      id: 'employee.lu-mi.rest.right.whole.v2',
      file: 'lu-mi-rest-right-whole-v2.ef7149cd1f14.png',
      sha256: 'ef7149cd1f140f429e124f9dfaf5e5d6b02fbf160a3e082bb6d7fe877dcf80b2',
      bytes: 344417,
    }, { ...WALK_STRIP, frameCount: 1, fps: 1, loop: false, anchor: { x: .5, y: 699 / 724 } }),
    'employee.lu-mi.rest.left.plugin-r1': actorSheet({
      id: 'employee.lu-mi.rest.left.plugin-r1',
      file: 'lumi-idle-left-r1.ce19c2e146e0.png',
      publicBase: '/luma-office/luma-plugin-art/',
      sha256: 'ce19c2e146e0506df843155db15b21bfbc489264a74b36110d4dc82bd975137f',
      bytes: 1_322_680,
    }, { frameWidth: 1135, frameHeight: 1386, frameCount: 1, fps: 1, loop: false, anchor: { x: 370 / 1135, y: 1308 / 1386 } }),
    'employee.lu-mi.rest.right.plugin-r1': actorSheet({
      id: 'employee.lu-mi.rest.right.plugin-r1',
      file: 'lumi-idle-right-r1.290d6449ab5a.png',
      publicBase: '/luma-office/luma-plugin-art/',
      sha256: '290d6449ab5a0be93489c32420dc2346e9508a725975a7d412786deea83317f2',
      bytes: 1_299_533,
    }, { frameWidth: 1134, frameHeight: 1387, frameCount: 1, fps: 1, loop: false, anchor: { x: 767 / 1134, y: 1319 / 1387 } }),
    'employee.lu-mi.typing.back-chair.v1': actorSheet({
      id: 'employee.lu-mi.typing.back-chair.v1',
      file: 'lu-mi-typing-back-chair-v1.48135a18ed91.png',
      sha256: '48135a18ed9151a781a7448e89fab4047a1f4636ab2d8ff38e4e5e04aa2d76c3',
      bytes: 447_133,
    }, TYPING_STRIP),
    'employee.lu-mi.typing.back-left.v2': actorSheet({
      id: 'employee.lu-mi.typing.back-left.v2',
      file: 'lu-mi-typing-back-left-v2.338b9d266dd0.png',
      sha256: '338b9d266dd03c729a33a5cbf8d20d4ab590dc40a54d22df486702615d99de26',
      bytes: 329_819,
    }, TYPING_STRIP),
    'employee.lu-mi.typing.back-right.v2': actorSheet({
      id: 'employee.lu-mi.typing.back-right.v2',
      file: 'lu-mi-typing-back-right-v2.ad0147791cf8.png',
      sha256: 'ad0147791cf8757ae8025122f521dbeceed04bc5b8a5750dd71e71344e5091de',
      bytes: 328_414,
    }, TYPING_STRIP),
    'employee.lu-mi.typing.front-reception.v3': actorSheet({
      id: 'employee.lu-mi.typing.front-reception.v3',
      file: 'lu-mi-typing-front-reception-v3.f4263e303a5e.png',
      sha256: 'f4263e303a5ee415bc4fd69bf1f47f509cfe81c81ca98f1d0c761f2e69cbb42a',
      bytes: 492_558,
    }, TYPING_STRIP),
    'employee.lu-mi.reception-arm-mask.v2': actorStatic({
      id: 'employee.lu-mi.reception-arm-mask.v2',
      file: 'lu-mi-reception-countertop-arm-mask-v2.ace9836c2397.png',
      sha256: 'ace9836c2397a92edcac0978e91e501f4f9d7b4b6f0844e40b49e8d5ac6b7552',
      bytes: 3_410,
      dimensions: { width: 512, height: 860 },
    }),
  } satisfies Readonly<Record<OfficeAssetId, OfficeAssetRecord>>),
})

const ABSOLUTE_URL_PATTERN = /^[a-z][a-z\d+.-]*:\/\//i

function normalizePublicBase(base: string): string {
  const value = base.trim()
  if (ABSOLUTE_URL_PATTERN.test(value)) return value.endsWith('/') ? value : `${value}/`

  const leadingSlash = value.startsWith('/')
  const normalized = value.split('/').filter(Boolean).join('/')
  return `${leadingSlash ? '/' : ''}${normalized}${normalized ? '/' : ''}`
}

export function getOfficeAsset(assetId: OfficeAssetId): OfficeAssetRecord {
  return OFFICE_ASSET_MANIFEST.assets[assetId]
}

export function resolveOfficeAssetUrl(
  assetId: OfficeAssetId,
  publicBase = OFFICE_ASSET_PUBLIC_BASE,
): string {
  const asset = getOfficeAsset(assetId)
  const normalizedBase = normalizePublicBase(publicBase === OFFICE_ASSET_PUBLIC_BASE ? asset.publicBase ?? publicBase : publicBase)
  return ABSOLUTE_URL_PATTERN.test(normalizedBase)
    ? new URL(asset.file, normalizedBase).toString()
    : `${normalizedBase}${asset.file}`
}

/** Static source binding only: no employee roster, model, task or entitlement activation. */
export function resolveStagedIdentityArt(value: unknown, publicBase = OFFICE_ASSET_PUBLIC_BASE) {
  const identity = getStagedIdentityStaticArt(value)
  if (!identity) return undefined
  return Object.freeze({
    ...identity,
    portrait: Object.freeze({ status: 'bound' as const, asset: getOfficeAsset(identity.portrait),
      url: resolveOfficeAssetUrl(identity.portrait, publicBase) }),
    avatar: Object.freeze({ status: 'bound' as const, asset: getOfficeAsset(identity.avatar),
      url: resolveOfficeAssetUrl(identity.avatar, publicBase) }),
  })
}

export function validateOfficeAssetManifest(): true {
  const entries = Object.entries(OFFICE_ASSET_MANIFEST.assets) as [
    OfficeAssetId,
    OfficeAssetRecord,
  ][]
  for (const [assetId, asset] of entries) {
    if (asset.id !== assetId) throw new Error(`Office asset ID mismatch: ${assetId}`)
    if (!/^[a-f\d]{64}$/.test(asset.sha256)) {
      throw new Error(`Office asset ${assetId} has an invalid SHA-256 digest`)
    }
    if (!asset.file.includes(asset.sha256.slice(0, 12))) {
      throw new Error(`Office asset ${assetId} is not content-addressed`)
    }
    if (asset.bytes <= 0 || asset.dimensions.width <= 0 || asset.dimensions.height <= 0) {
      throw new Error(`Office asset ${assetId} has invalid physical metadata`)
    }
    if (asset.frameStrip) {
      const { frameCount, frameOrder, frameDurationsMs } = asset.frameStrip
      const grid = officeFrameGrid(asset.frameStrip)
      if (
        grid.width !== asset.dimensions.width
        || grid.height !== asset.dimensions.height
      ) throw new Error(`Office asset ${assetId} frame strip does not fill its atlas`)
      if (frameOrder !== undefined && (frameOrder.length < 1 || frameOrder.length > 120
        || frameOrder.some(index => !Number.isSafeInteger(index) || index < 0 || index >= frameCount)
      )) throw new Error(`Office asset ${assetId} has invalid frame exposure order`)
      if (frameDurationsMs !== undefined && (
        frameDurationsMs.length !== (frameOrder?.length ?? frameCount)
        || frameDurationsMs.some(duration => !Number.isFinite(duration) || duration <= 0)
      )) throw new Error(`Office asset ${assetId} has invalid frame exposure times`)
    }
  }

  return true
}

export const DUANMU_YAN_SCENE_ASSETS = Object.freeze({
  employeeId: 'shan',
  displayName: '端木嫣',
  avatar: 'employee.duanmu-yan.avatar.v1' as const,
  walk: Object.freeze({
    right: 'employee.duanmu-yan.walk.right.v3' as const,
    left: 'employee.duanmu-yan.walk.left.v3' as const,
    up: 'employee.duanmu-yan.walk.up.v2' as const,
    down: 'employee.duanmu-yan.walk.down.v2' as const,
  }),
  typing: Object.freeze({
    back: 'employee.duanmu-yan.typing.back-chair.v2' as const,
    backLeft: 'employee.duanmu-yan.typing.back-left-chair.v2' as const,
    backRight: 'employee.duanmu-yan.typing.back-right.v1' as const,
    front: 'employee.duanmu-yan.typing.front-reception-chair.v3' as const,
  }),
})

/** Stable, ready-to-render URLs for the first OfficeExperience vertical slice. */
export const officeImageUrl = resolveOfficeAssetUrl('office.world.noon.v2')
export const employeeImageUrl = resolveOfficeAssetUrl('employee.duanmu-yan.avatar.v1')
export const employeeTypingBackSheetUrl = resolveOfficeAssetUrl(
  'employee.duanmu-yan.typing.back-chair.v2',
)
export const employeeTypingBackFrameStrip = getOfficeAsset(
  'employee.duanmu-yan.typing.back-chair.v2',
).frameStrip as OfficeFrameStrip

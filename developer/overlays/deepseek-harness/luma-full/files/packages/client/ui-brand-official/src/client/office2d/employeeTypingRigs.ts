import {
  EMPLOYEE_CATALOG_ORDER,
  EMPLOYEE_IDS,
  type OfficeEmployeeId,
} from './employeeCatalog.ts'
import type { OfficeTypingFacing } from './workstations.ts'
import type { OfficeAssetId } from './assets.ts'

export const OFFICE_TYPING_FRAME_COUNT = 4
export const OFFICE_TYPING_FRAME_WIDTH = 512

export interface OfficeTypingPoint {
  readonly x: number
  readonly y: number
}

export interface OfficeEmployeeTypingProfile {
  readonly anchor: OfficeTypingPoint
  readonly seatAnchor: OfficeTypingPoint
  readonly frameX: readonly number[]
  readonly scaleMultiplier: number
  readonly fps: number
  readonly reducedMotionFrame: number
  readonly useRearChairOcclusion?: true
  /** The complete frame owns the chair; scene prop/foreground must not replay it. */
  readonly integratedChair?: true
  /** Alpha stencil exposing this complete frame's forearms above the counter. */
  readonly receptionCountertopArmMask?: OfficeAssetId
  /** Forearms bridge the desk-edge clip to the existing pixel-accurate palms. */
  readonly receptionCountertopForearmMask?: string
}

export type OfficeEmployeeTypingRig = Readonly<
  Record<OfficeTypingFacing, OfficeEmployeeTypingProfile>
>

type ProfileInput = Readonly<{
  anchor: OfficeTypingPoint
  seatAnchor: OfficeTypingPoint
  frameX: readonly number[]
  scaleMultiplier?: number
  fps?: number
  reducedMotionFrame?: number
  useRearChairOcclusion?: boolean
  integratedChair?: boolean
  receptionCountertopArmMask?: OfficeAssetId
  receptionCountertopForearmMask?: string
}>

const freezePoint = ({ x, y }: OfficeTypingPoint): OfficeTypingPoint =>
  Object.freeze({ x, y })

const freezeProfile = ({
  anchor,
  seatAnchor,
  frameX,
  scaleMultiplier = 1,
  fps = 4,
  reducedMotionFrame = OFFICE_TYPING_FRAME_COUNT - 1,
  useRearChairOcclusion = false,
  integratedChair = false,
  receptionCountertopArmMask,
  receptionCountertopForearmMask,
}: ProfileInput): OfficeEmployeeTypingProfile => Object.freeze({
  anchor: freezePoint(anchor),
  seatAnchor: freezePoint(seatAnchor),
  frameX: Object.freeze([...frameX]),
  scaleMultiplier,
  fps,
  reducedMotionFrame,
  ...(useRearChairOcclusion ? { useRearChairOcclusion: true as const } : {}),
  ...(integratedChair ? { integratedChair: true as const } : {}),
  ...(receptionCountertopArmMask ? { receptionCountertopArmMask } : {}),
  ...(receptionCountertopForearmMask ? { receptionCountertopForearmMask } : {}),
})

// Source-frame coordinates. These only reveal the existing complete drawing;
// they do not move or redraw individual limbs. Both stencil layers are additive.
const forearmMask = (...polygons: string[]): string => `url("data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 860">${polygons.map(points => `<polygon fill="white" points="${points}"/>`).join('')}</svg>`,
)}")`

const freezeRig = (
  profiles: Readonly<Record<OfficeTypingFacing, ProfileInput>>,
): OfficeEmployeeTypingRig => Object.freeze(Object.fromEntries(
  Object.entries(profiles).map(([facing, profile]) => [facing, freezeProfile(profile)]),
) as Record<OfficeTypingFacing, OfficeEmployeeTypingProfile>)

/**
 * 人物解剖锚点与环境座点独立。历史配置不是视觉通过证明；最新反馈
 * 需按真实场景复验，但不能用移动显示器或椅子来迁就错误姿势。
 */
const DUANMU_YAN_TYPING_RIG = freezeRig({
  back: {
    anchor: { x: 0.5, y: 0.942 },
    seatAnchor: { x: 0.5, y: 600 / 860 },
    frameX: [0, 0, 0, 0],
    scaleMultiplier: 1.5,
    integratedChair: true,
  },
  backLeft: {
    anchor: { x: 0.5, y: 0.904 },
    seatAnchor: { x: 0.52, y: 640 / 860 },
    frameX: [0, 0, 0, 0],
    scaleMultiplier: 1.45,
    integratedChair: true,
  },
  backRight: {
    anchor: { x: 0.5, y: 758 / 860 },
    seatAnchor: { x: 0.43, y: 600 / 860 },
    frameX: [0, 0, 0, 0],
  },
  front: {
    seatAnchor: { x: 0.5, y: 620 / 860 },
    anchor: { x: 0.5, y: 0.95 },
    frameX: [0, 0, 0, 0],
    scaleMultiplier: 1.25,
    integratedChair: true,
    receptionCountertopArmMask: 'employee.duanmu-yan.reception-arm-mask.v2',
    receptionCountertopForearmMask: forearmMask(
      '139,584 194,584 188,611 172,637 171,648 133,648 126,630 127,612',
      '307,584 356,584 369,612 370,630 360,648 322,648 319,634 314,614',
    ),
  },
})

const BAI_SHUANGMING_TYPING_RIG = freezeRig({
  back: {
    anchor: { x: 0.5, y: 0.94 },
    seatAnchor: { x: 254.45 / 512, y: 689.24 / 860 },
    frameX: [0, 0, 0, 0],
    // This atlas has a large transparent top margin. Size its visible figure
    // alongside the other seated employees, not by the 860 px sheet height.
    scaleMultiplier: 2.45,
    integratedChair: true,
  },
  backLeft: {
    anchor: { x: 0.5, y: 0.91 },
    seatAnchor: { x: 238.79 / 512, y: 674.59 / 860 },
    frameX: [0, 0, 0, 0],
    scaleMultiplier: 2.5,
    integratedChair: true,
  },
  backRight: {
    anchor: { x: 0.5, y: 0.91 },
    seatAnchor: { x: 0.5, y: 610 / 860 },
    frameX: [0, 0, 0, 0],
    scaleMultiplier: 671 / 700,
  },
  front: {
    // Match the visible body to the other reception poses while keeping the
    // authored palm line (y=648) fixed on the countertop as the whole frame grows.
    anchor: { x: 0.5, y: (648 + (0.91 * 860 - 648) * 1.55 / 1.92) / 860 },
    seatAnchor: { x: 255.03 / 512, y: 681.08 / 860 },
    frameX: [0, 0, 0, 0],
    scaleMultiplier: 1.92,
    integratedChair: true,
    receptionCountertopArmMask: 'employee.bai-shuangming.reception-arm-mask.v3',
    receptionCountertopForearmMask: forearmMask(
      '177,587 219,587 203,621 192,637 174,642 150,637 151,617 166,599',
      '293,587 335,587 346,599 361,617 362,637 338,642 320,637 309,621',
    ),
  },
})

const LU_MI_TYPING_RIG = freezeRig({
  back: {
    anchor: { x: 0.5, y: 0.94 },
    // This authored frame contains the character and chair together. The
    // anchor marks the cushion; the chair casters remain below that point.
    seatAnchor: { x: 0.5, y: 630 / 860 },
    frameX: [0, 0, 0, 0],
    scaleMultiplier: 1.65,
    integratedChair: true,
  },
  backLeft: {
    anchor: { x: 0.5, y: 0.91 },
    // The private desks face left-front; move the whole seated frame so the
    // hands reach that keyboard while the hip remains over the cushion.
    seatAnchor: { x: 0.55, y: 635 / 860 },
    frameX: [0, 0, 0, 0],
    scaleMultiplier: 1.8,
    useRearChairOcclusion: true,
  },
  backRight: {
    anchor: { x: 0.5, y: 0.91 },
    seatAnchor: { x: 0.45, y: 635 / 860 },
    frameX: [0, 0, 0, 0],
    scaleMultiplier: 1.8,
    useRearChairOcclusion: true,
  },
  front: {
    // Lu Mi is the tallest of the three at this counter. Keep her palms on
    // the surface as the complete pose grows around its reception anchor.
    anchor: { x: 0.5, y: 0.815 },
    seatAnchor: { x: 0.5, y: 530 / 860 },
    frameX: [0, 0, 0, 0],
    scaleMultiplier: 1.5,
    receptionCountertopArmMask: 'employee.lu-mi.reception-arm-mask.v2',
    receptionCountertopForearmMask: forearmMask(
      '171,508 199,518 186,534 158,551 125,571 118,579 98,579 104,560 134,539',
      '314,508 339,508 374,539 406,560 414,579 392,579 383,571 350,551 325,534',
    ),
  },
})

// Dedicated anatomy measured on each character's complete 512 × 860 frame 00.
// Transparent margins differ substantially; scale the complete drawing only.
const JINGYUNIANG_TYPING_RIG = freezeRig({
  back: {
    anchor: { x: 250 / 512, y: 814 / 860 },
    seatAnchor: { x: 250 / 512, y: 672 / 860 },
    frameX: [0, 0, 0, 0], scaleMultiplier: 2.65, integratedChair: true,
  },
  backLeft: {
    anchor: { x: 174 / 512, y: 805 / 860 },
    seatAnchor: { x: 270 / 512, y: 698 / 860 },
    frameX: [0, 0, 0, 0], scaleMultiplier: 2.6, useRearChairOcclusion: true,
  },
  backRight: {
    anchor: { x: 386 / 512, y: 806 / 860 },
    seatAnchor: { x: 277 / 512, y: 700 / 860 },
    frameX: [0, 0, 0, 0], scaleMultiplier: 2.45, useRearChairOcclusion: true,
  },
  front: {
    // Preserve the existing counter palm plane (189 source-scale units above base).
    anchor: { x: 235 / 512, y: (582 + 189 / 1.75) / 860 },
    seatAnchor: { x: 236 / 512, y: 654 / 860 },
    frameX: [0, 0, 0, 0], scaleMultiplier: 1.75,
    receptionCountertopForearmMask: forearmMask(
      '149,548 191,548 207,572 210,593 194,606 152,606 137,587 140,565',
      '277,548 319,548 334,565 336,587 321,606 277,606 261,593 265,571',
    ),
  },
})

const LONGMAMA_TYPING_RIG = freezeRig({
  back: {
    anchor: { x: 268 / 512, y: 814 / 860 },
    seatAnchor: { x: 268 / 512, y: 744 / 860 },
    frameX: [0, 0, 0, 0], scaleMultiplier: 4.7, integratedChair: true,
  },
  backLeft: {
    anchor: { x: 212 / 512, y: 793 / 860 },
    seatAnchor: { x: 282 / 512, y: 694 / 860 },
    frameX: [0, 0, 0, 0], scaleMultiplier: 3.1, useRearChairOcclusion: true,
  },
  backRight: {
    anchor: { x: 360 / 512, y: 801 / 860 },
    seatAnchor: { x: 244 / 512, y: 698 / 860 },
    frameX: [0, 0, 0, 0], scaleMultiplier: 3.15, useRearChairOcclusion: true,
  },
  front: {
    anchor: { x: 260 / 512, y: (625 + 189 / 2.4) / 860 },
    seatAnchor: { x: 268 / 512, y: 678 / 860 },
    frameX: [0, 0, 0, 0], scaleMultiplier: 2.4,
    receptionCountertopForearmMask: forearmMask(
      '211,598 239,598 251,613 259,631 246,640 209,640 198,627 201,611',
      '282,598 307,598 319,611 323,627 314,640 276,640 265,631 273,612',
    ),
  },
})

const CLAUDE_TYPING_RIG = freezeRig({
  back: {
    anchor: { x: 236 / 512, y: 814 / 860 },
    seatAnchor: { x: 236 / 512, y: 663 / 860 },
    frameX: [0, 0, 0, 0], scaleMultiplier: 2.5, integratedChair: true,
  },
  backLeft: {
    anchor: { x: 171 / 512, y: 806 / 860 },
    seatAnchor: { x: 277 / 512, y: 659 / 860 },
    frameX: [0, 0, 0, 0], scaleMultiplier: 2.9, useRearChairOcclusion: true,
  },
  backRight: {
    anchor: { x: 395 / 512, y: 807 / 860 },
    seatAnchor: { x: 241 / 512, y: 662 / 860 },
    frameX: [0, 0, 0, 0], scaleMultiplier: 2.85, useRearChairOcclusion: true,
  },
  front: {
    anchor: { x: 266 / 512, y: (562 + 189 / 2) / 860 },
    seatAnchor: { x: 265 / 512, y: 632 / 860 },
    frameX: [0, 0, 0, 0], scaleMultiplier: 2,
    receptionCountertopForearmMask: forearmMask(
      '183,523 220,523 238,543 241,562 229,582 180,590 165,573 168,546',
      '316,523 353,523 369,546 373,573 358,590 309,582 297,562 301,543',
    ),
  },
})

export const EMPLOYEE_TYPING_FACINGS = Object.freeze([
  'back',
  'backLeft',
  'backRight',
  'front',
] as const satisfies readonly OfficeTypingFacing[])

export const EMPLOYEE_TYPING_RIGS = Object.freeze({
  [EMPLOYEE_IDS.DUANMU_YAN]: DUANMU_YAN_TYPING_RIG,
  [EMPLOYEE_IDS.BAI_SHUANGMING]: BAI_SHUANGMING_TYPING_RIG,
  [EMPLOYEE_IDS.LU_MI]: LU_MI_TYPING_RIG,
  [EMPLOYEE_IDS.JINGYUNIANG]: JINGYUNIANG_TYPING_RIG,
  [EMPLOYEE_IDS.LONGMAMA]: LONGMAMA_TYPING_RIG,
  [EMPLOYEE_IDS.CLAUDE]: CLAUDE_TYPING_RIG,
} satisfies Readonly<Record<OfficeEmployeeId, OfficeEmployeeTypingRig>>)

if (Object.keys(EMPLOYEE_TYPING_RIGS).join('|') !== EMPLOYEE_CATALOG_ORDER.join('|')) {
  throw new Error('Employee typing rigs must preserve the official employee catalog order')
}

export function getEmployeeTypingProfile(
  employeeId: string,
  facing: string,
): OfficeEmployeeTypingProfile {
  const employeeRig = EMPLOYEE_TYPING_RIGS[employeeId as OfficeEmployeeId]
    ?? EMPLOYEE_TYPING_RIGS[EMPLOYEE_IDS.DUANMU_YAN]
  return employeeRig[facing as OfficeTypingFacing] ?? employeeRig.back
}

export function getTypingFrameAnchor(
  profile: OfficeEmployeeTypingProfile,
  frameIndex: number,
  { seated = true }: Readonly<{ seated?: boolean }> = {},
): OfficeTypingPoint {
  const baseAnchor = seated ? profile.seatAnchor : profile.anchor
  const normalizedFrameIndex = Math.max(
    0,
    Math.min(
      OFFICE_TYPING_FRAME_COUNT - 1,
      Number.isInteger(frameIndex) ? frameIndex : 0,
    ),
  )
  return Object.freeze({
    x: baseAnchor.x
      - (profile.frameX[normalizedFrameIndex] ?? 0) / OFFICE_TYPING_FRAME_WIDTH,
    y: baseAnchor.y,
  })
}

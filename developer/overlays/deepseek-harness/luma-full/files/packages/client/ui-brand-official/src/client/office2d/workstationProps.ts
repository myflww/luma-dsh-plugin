import { OFFICE_NAV_HEIGHT, OFFICE_NAV_WIDTH } from './navigation.ts'
import { OFFICE_WORKSTATION_IDS } from './workstations.ts'
import type { OfficeWorkstationId } from './workstationSeating.ts'

export interface OfficeWorkstationPropBounds {
  readonly left: number
  readonly top: number
  readonly right: number
  readonly bottom: number
}

export interface OfficeWorkstationPropLayer {
  readonly workstationId: OfficeWorkstationId
  readonly kind: 'chair' | 'keyboard' | 'mouse'
  readonly bounds: OfficeWorkstationPropBounds
  readonly clipPath: string
}

/**
 * Calibrated source-pixel partitions of the phase-matched workstation prop
 * atlas. Each chair has its own render slot, so an occupant can be placed
 * between the chair and the existing near-side armrest layer. The atlas keeps
 * the exact perspective and lighting of the source office at every hour.
 */
export const OFFICE_WORKSTATION_CHAIR_BOUNDS = Object.freeze({
  'north-private': { left: 762, top: 346, right: 853, bottom: 421 },
  'north-center': { left: 886, top: 358, right: 970, bottom: 430 },
  'west-studio': { left: 1016, top: 383, right: 1081, bottom: 466 },
  'south-left': { left: 630, top: 549, right: 706, bottom: 635 },
  'south-focus': { left: 750, top: 550, right: 848, bottom: 639 },
  'south-right': { left: 903, top: 558, right: 977, bottom: 644 },
  'private-upper': { left: 163, top: 464, right: 235, bottom: 552 },
  'private-lower': { left: 228, top: 646, right: 316, bottom: 752 },
  reception: { left: 805, top: 706, right: 873, bottom: 759 },
} satisfies Readonly<Record<OfficeWorkstationId, OfficeWorkstationPropBounds>>)

export const OFFICE_WORKSTATION_KEYBOARD_BOUNDS: Readonly<Partial<Record<OfficeWorkstationId, OfficeWorkstationPropBounds>>> = Object.freeze({
  'north-private': { left: 783, top: 328, right: 833, bottom: 348 },
  'north-center': { left: 895, top: 336, right: 947, bottom: 361 },
  'west-studio': { left: 1018, top: 375, right: 1068, bottom: 403 },
  'south-left': { left: 646, top: 522, right: 691, bottom: 546 },
  'south-focus': { left: 771, top: 522, right: 825, bottom: 548 },
  'south-right': { left: 903, top: 539, right: 955, bottom: 566 },
  'private-upper': { left: 143, top: 451, right: 185, bottom: 480 },
  'private-lower': { left: 226, top: 644, right: 272, bottom: 676 },
})

export const OFFICE_WORKSTATION_MOUSE_BOUNDS: Readonly<Partial<Record<OfficeWorkstationId, OfficeWorkstationPropBounds>>> = Object.freeze({
  'north-private': { left: 827, top: 330, right: 840, bottom: 347 },
  'north-center': { left: 943, top: 346, right: 956, bottom: 364 },
  'west-studio': { left: 1060, top: 393, right: 1077, bottom: 415 },
  'south-left': { left: 689, top: 520, right: 707, bottom: 546 },
  'south-focus': { left: 819, top: 525, right: 838, bottom: 550 },
  'south-right': { left: 951, top: 543, right: 971, bottom: 568 },
})

export function createOfficeWorkstationPropLayer(
  workstationId: OfficeWorkstationId,
  bounds: OfficeWorkstationPropBounds,
  kind: OfficeWorkstationPropLayer['kind'] = 'chair',
): OfficeWorkstationPropLayer {
  const { left, top, right, bottom } = bounds
  if (![left, top, right, bottom].every(Number.isFinite)
    || left < 0 || top < 0 || right > OFFICE_NAV_WIDTH || bottom > OFFICE_NAV_HEIGHT
    || left >= right || top >= bottom) {
    throw new RangeError(`Invalid workstation prop bounds: ${workstationId}`)
  }
  return Object.freeze({
    workstationId,
    kind,
    bounds: Object.freeze({ ...bounds }),
    clipPath: `inset(${top / OFFICE_NAV_HEIGHT * 100}% ${(OFFICE_NAV_WIDTH - right) / OFFICE_NAV_WIDTH * 100}% ${(OFFICE_NAV_HEIGHT - bottom) / OFFICE_NAV_HEIGHT * 100}% ${left / OFFICE_NAV_WIDTH * 100}%)`,
  })
}

export const OFFICE_WORKSTATION_PROP_LAYERS = Object.freeze(
  OFFICE_WORKSTATION_IDS.flatMap(id => {
    const layers: OfficeWorkstationPropLayer[] = [
      createOfficeWorkstationPropLayer(id, OFFICE_WORKSTATION_CHAIR_BOUNDS[id], 'chair'),
    ]
    const keyboard = OFFICE_WORKSTATION_KEYBOARD_BOUNDS[id]
    if (keyboard) layers.push(createOfficeWorkstationPropLayer(id, keyboard, 'keyboard'))
    const mouse = OFFICE_WORKSTATION_MOUSE_BOUNDS[id]
    if (mouse) layers.push(createOfficeWorkstationPropLayer(id, mouse, 'mouse'))
    return layers
  }),
)

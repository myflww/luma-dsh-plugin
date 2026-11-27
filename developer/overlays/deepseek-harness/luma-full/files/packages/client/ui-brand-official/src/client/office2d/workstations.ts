import { OFFICE_WORKSTATION_AUTO_ASSIGN_PRIORITY, isOfficeWorkstationId } from '../../office-workflow/shared/office-workstations.ts'
export { OFFICE_WORKSTATION_IDS, OFFICE_WORKSTATION_AUTO_ASSIGN_PRIORITY, isOfficeWorkstationId } from '../../office-workflow/shared/office-workstations.ts'

import {
  getOfficeWorkstationOcclusion,
  type OfficeWorkstationOcclusion,
} from './workstationOcclusion.ts'
import {
  getOfficeWorkstationSeatPoint,
  type OfficeSeatPoint,
  type OfficeWorkstationId,
} from './workstationSeating.ts'

export type OfficeTypingFacing = 'back' | 'backLeft' | 'backRight' | 'front'

export interface OfficeNormalizedRect {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

export interface OfficeEmployeePlacement {
  readonly x: number
  readonly y: number
  readonly scale: number
  readonly rotation: number
}

export interface OfficeWorkstation extends OfficeWorkstationOcclusion {
  readonly id: OfficeWorkstationId
  readonly label: string
  readonly autoAssignPriority: number
  readonly zone: 'central-north' | 'central-south' | 'private-office' | 'reception'
  readonly bindable: true
  readonly x: number
  readonly y: number
  readonly seatPoint: OfficeSeatPoint | null
  readonly snapRadius: number
  readonly rect: OfficeNormalizedRect
  readonly typingFacing: OfficeTypingFacing
  readonly employee: OfficeEmployeePlacement
}

type WorkstationInput = Omit<
  OfficeWorkstation,
  keyof OfficeWorkstationOcclusion | 'bindable' | 'seatPoint'
>

const workstation = (input: WorkstationInput): OfficeWorkstation => Object.freeze({
  ...input,
  bindable: true as const,
  seatPoint: getOfficeWorkstationSeatPoint(input.id),
  rect: Object.freeze({ ...input.rect }),
  employee: Object.freeze({ ...input.employee }),
  ...getOfficeWorkstationOcclusion(input.id),
})

/**
 * Single nine-seat catalog shared by scene geometry and Harness projections.
 * The legacy fallback uses the broad facing groups below. The painted desk
 * renderer registers the actual screen and keyboard of each seat separately,
 * including shallow turns along the two curved banks.
 */
export const OFFICE_WORKSTATION_DIRECTORY = Object.freeze([
  workstation({
    id: 'north-private', label: '北排左工位', autoAssignPriority: 10,
    zone: 'central-north', x: 0.4839, y: 0.4463, snapRadius: 0.052,
    rect: { x: 0.4533, y: 0.2869, width: 0.061, height: 0.1722 },
    typingFacing: 'back', employee: { x: 0.5, y: 0.96, scale: 0.78, rotation: -0.025 },
  }),
  workstation({
    id: 'north-center', label: '北排中工位', autoAssignPriority: 20,
    zone: 'central-north', x: 0.5544, y: 0.4601, snapRadius: 0.052,
    rect: { x: 0.5233, y: 0.2954, width: 0.0622, height: 0.1796 },
    typingFacing: 'back', employee: { x: 0.5, y: 0.96, scale: 0.78, rotation: 0 },
  }),
  workstation({
    id: 'west-studio', label: '北排右工位', autoAssignPriority: 30,
    zone: 'central-north', x: 0.6208, y: 0.4878, snapRadius: 0.052,
    rect: { x: 0.5885, y: 0.3348, width: 0.067, height: 0.1668 },
    typingFacing: 'back', employee: { x: 0.505, y: 0.93, scale: 0.78, rotation: 0.025 },
  }),
  workstation({
    id: 'south-left', label: '南排左工位', autoAssignPriority: 40,
    zone: 'central-south', x: 0.4037, y: 0.6621, snapRadius: 0.052,
    rect: { x: 0.3708, y: 0.4942, width: 0.0652, height: 0.1785 },
    typingFacing: 'back', employee: { x: 0.5, y: 0.94, scale: 0.78, rotation: -0.025 },
  }),
  workstation({
    id: 'south-focus', label: '南排中工位', autoAssignPriority: 50,
    zone: 'central-south', x: 0.4773, y: 0.6748, snapRadius: 0.052,
    rect: { x: 0.4438, y: 0.4973, width: 0.0664, height: 0.1881 },
    typingFacing: 'back', employee: { x: 0.5, y: 0.94, scale: 0.78, rotation: 0 },
  }),
  workstation({
    id: 'south-right', label: '南排右工位', autoAssignPriority: 60,
    zone: 'central-south', x: 0.555, y: 0.6886, snapRadius: 0.052,
    rect: { x: 0.5185, y: 0.5101, width: 0.0706, height: 0.1892 },
    typingFacing: 'back', employee: { x: 0.52, y: 0.93, scale: 0.78, rotation: 0.025 },
  }),
  workstation({
    id: 'private-upper', label: '左侧上方独立办公室', autoAssignPriority: 70,
    zone: 'private-office', x: 0.116, y: 0.5632, snapRadius: 0.058,
    rect: { x: 0.0526, y: 0.4145, width: 0.1017, height: 0.1637 },
    typingFacing: 'back', employee: { x: 0.658, y: 0.94, scale: 0.69, rotation: -0.06 },
  }),
  workstation({
    id: 'private-lower', label: '左侧下方独立办公室', autoAssignPriority: 80,
    zone: 'private-office', x: 0.1693, y: 0.7885, snapRadius: 0.058,
    rect: { x: 0.0891, y: 0.6217, width: 0.1077, height: 0.1807 },
    typingFacing: 'back', employee: { x: 0.708, y: 0.94, scale: 0.69, rotation: -0.05 },
  }),
  workstation({
    id: 'reception', label: '服务前台', autoAssignPriority: 90,
    zone: 'reception', x: 0.5006, y: 0.8321, snapRadius: 0.056,
    rect: { x: 0.4522, y: 0.7279, width: 0.0993, height: 0.1722 },
    typingFacing: 'front', employee: { x: 0.5, y: 0.64, scale: 0.76, rotation: 0 },
  }),
])

const OFFICE_WORKSTATION_BY_ID = new Map<OfficeWorkstationId, OfficeWorkstation>(
  OFFICE_WORKSTATION_DIRECTORY.map(entry => [entry.id, entry]),
)

export function getOfficeWorkstation(workstationId: string): OfficeWorkstation | null {
  return isOfficeWorkstationId(workstationId)
    ? OFFICE_WORKSTATION_BY_ID.get(workstationId) ?? null
    : null
}

export function assertOfficeWorkstationId(workstationId: string): OfficeWorkstation {
  const entry = getOfficeWorkstation(workstationId)
  if (!entry) throw new Error(`Unknown office workstation: ${workstationId}`)
  return entry
}

export function findAvailableOfficeWorkstationId({
  occupiedIds = [],
  preferredId = null,
}: Readonly<{
  occupiedIds?: Iterable<string>
  preferredId?: string | null
}> = {}): OfficeWorkstationId | null {
  const occupied = new Set(occupiedIds)
  if (preferredId && isOfficeWorkstationId(preferredId) && !occupied.has(preferredId)) {
    return preferredId
  }

  return OFFICE_WORKSTATION_AUTO_ASSIGN_PRIORITY.find(id => !occupied.has(id)) ?? null
}

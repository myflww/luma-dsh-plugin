export type OfficeWorkstationId =
  | 'north-private'
  | 'north-center'
  | 'west-studio'
  | 'south-left'
  | 'south-focus'
  | 'south-right'
  | 'private-upper'
  | 'private-lower'
  | 'reception'

export const OFFICE_WORKSTATION_IDS: readonly OfficeWorkstationId[] = Object.freeze([
  "north-private",
  "north-center",
  "west-studio",
  "south-left",
  "south-focus",
  "south-right",
  "private-upper",
  "private-lower",
  "reception"
])

export const OFFICE_WORKSTATION_AUTO_ASSIGN_PRIORITY: readonly OfficeWorkstationId[] = Object.freeze([
  "north-private",
  "north-center",
  "west-studio",
  "south-left",
  "south-focus",
  "south-right",
  "private-upper",
  "private-lower",
  "reception"
])

const OFFICE_WORKSTATION_BY_ID = new Map<OfficeWorkstationId, true>(
  OFFICE_WORKSTATION_IDS.map(id => [id, true]),
)

export function isOfficeWorkstationId(value: string): value is OfficeWorkstationId {
  return OFFICE_WORKSTATION_BY_ID.has(value as OfficeWorkstationId)
}

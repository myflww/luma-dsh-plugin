import { getEmployeeSkinPack } from './employeeSkins.ts'

export interface SkinSelectionEmployee {
  readonly id: string
  readonly name: string
}

/** An empty equipment entry means the original outfit, as it does on the Native bridge. */
export function normalizeOfficeSkinSelections(skins: Readonly<Record<string, string>> | undefined) {
  if (!skins || !Object.values(skins).includes('')) return skins
  return Object.fromEntries(Object.entries(skins).filter(([, skin]) => skin !== ''))
}

/** Validate the explicit selection without substituting another outfit or granting ownership. */
export function unavailableOfficeSkinSelections(employees: readonly SkinSelectionEmployee[], skins: Readonly<Record<string, string>> | undefined) {
  return employees.flatMap(employee => {
    const skinId = skins?.[employee.id]
    return skinId && !getEmployeeSkinPack(employee.id, skinId) ? [{ ...employee, skinId }] : []
  })
}

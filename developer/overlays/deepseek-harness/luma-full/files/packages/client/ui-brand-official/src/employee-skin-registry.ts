/** Finite outfit identities shared by durable selection, renderers and portrait production.
 * Registration does not prove ownership or resource readiness. A complete resource
 * pack must use this identity's own namespace before an outfit can be displayed.
 */
export const SKIN_EMPLOYEE_IDS = ['shan', 'lu-mi', 'bai-shuangming', 'jingyuniang', 'longmama', 'claude', 'gemini', 'grok'] as const
export type RegisteredSkinEmployeeId = typeof SKIN_EMPLOYEE_IDS[number]
export type RegisteredEmployeeSkinId = `skin.${RegisteredSkinEmployeeId}.${string}`
export interface EmployeeSkinRegistration {
  readonly skinId: RegisteredEmployeeSkinId
  readonly employeeId: RegisteredSkinEmployeeId
  readonly resourceVersion: string
}

/** A new outfit is a new entry; never infer the first/default outfit from an employee ID. */
export function createEmployeeSkinRegistry(entries: readonly EmployeeSkinRegistration[]) {
  if (entries.length > SKIN_EMPLOYEE_IDS.length * 16) throw new Error('Too many registered outfits')
  const seen = new Set<string>(), counts = new Map<string, number>()
  const registrations = Object.freeze(entries.map(entry => {
    if (!SKIN_EMPLOYEE_IDS.some(id => id === entry.employeeId)
      || !/^[a-z][a-z\d_-]{0,31}$/u.test(entry.resourceVersion)
      || entry.skinId !== `skin.${entry.employeeId}.${entry.resourceVersion}` || seen.has(entry.skinId)) {
      throw new Error('Invalid or duplicate outfit identity')
    }
    seen.add(entry.skinId)
    const count = (counts.get(entry.employeeId) ?? 0) + 1
    if (count > 16) throw new Error('Too many outfits for one employee')
    counts.set(entry.employeeId, count)
    return Object.freeze({ skinId: entry.skinId, employeeId: entry.employeeId, resourceVersion: entry.resourceVersion })
  }))
  const getEmployeeSkinRegistration = (skinId: unknown): EmployeeSkinRegistration | undefined =>
    registrations.find(entry => entry.skinId === skinId)
  const getRegisteredEmployeeSkins = (employeeId: string): readonly EmployeeSkinRegistration[] =>
    Object.freeze(registrations.filter(entry => entry.employeeId === employeeId))
  const isRegisteredEmployeeSkinFor = (employeeId: string, skinId: unknown): skinId is RegisteredEmployeeSkinId =>
    getEmployeeSkinRegistration(skinId)?.employeeId === employeeId
  return Object.freeze({ registrations, getEmployeeSkinRegistration, getRegisteredEmployeeSkins, isRegisteredEmployeeSkinFor })
}

const registry = createEmployeeSkinRegistry([
  { skinId: 'skin.shan.v1', employeeId: 'shan', resourceVersion: 'v1' },
  { skinId: 'skin.lu-mi.v1', employeeId: 'lu-mi', resourceVersion: 'v1' },
  { skinId: 'skin.bai-shuangming.v1', employeeId: 'bai-shuangming', resourceVersion: 'v1' },
  { skinId: 'skin.jingyuniang.v1', employeeId: 'jingyuniang', resourceVersion: 'v1' },
  { skinId: 'skin.longmama.v1', employeeId: 'longmama', resourceVersion: 'v1' },
  { skinId: 'skin.claude.v1', employeeId: 'claude', resourceVersion: 'v1' },
  // Resource registration preserves the existing staged character status; it does not activate an office actor.
  { skinId: 'skin.gemini.v1', employeeId: 'gemini', resourceVersion: 'v1' },
  { skinId: 'skin.grok.v1', employeeId: 'grok', resourceVersion: 'v1' },
])
export const EMPLOYEE_SKIN_REGISTRY = registry.registrations
export const { getEmployeeSkinRegistration, getRegisteredEmployeeSkins, isRegisteredEmployeeSkinFor } = registry

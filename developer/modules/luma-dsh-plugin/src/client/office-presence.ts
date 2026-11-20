import type { OfficeTimePolicy } from '../../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/office2d/timePolicy.ts'

export type EmployeeLocation = 'office' | 'bedroom' | 'unknown'

/** The office and bedroom both consume this decision, including across attendance boundaries. */
export function employeeLocation(policy: OfficeTimePolicy, working: boolean, available: boolean): EmployeeLocation {
  if (working) return 'office'
  if (!available) return 'unknown'
  return policy.charactersPresent ? 'office' : 'bedroom'
}

export function withActiveTaskMonitors(policy: OfficeTimePolicy, hasActiveTask: boolean): OfficeTimePolicy {
  if (!hasActiveTask || !policy.monitors.forceAllOff) return policy
  return { ...policy, monitors: { ...policy.monitors, mode:'active-tasks-only', forceAllOff:false, activeTaskWorkstationsOn:true } }
}

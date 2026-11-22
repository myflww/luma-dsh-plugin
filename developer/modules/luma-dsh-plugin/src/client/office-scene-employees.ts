import type { OfficeEmployeeVisualState } from '../../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/office-harness/HarnessOfficeProjectionAdapter.ts'
import type { OfficeTimePolicy } from '../../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/office2d/timePolicy.ts'
import { OFFICE_WORKSTATION_AUTO_ASSIGN_PRIORITY } from '../../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/office-workflow/shared/office-workstations.ts'
import { employeeLocation } from './office-presence.ts'
import { OFFICE_EMPLOYEE_DEFINITIONS } from '../../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/office-harness/OfficeRelationships.ts'

const label = {
  idle: '等待新任务', running: '正在处理任务', 'awaiting-user': '等待你的确认',
  stopping: '正在停止', completed: '报告待查看', failed: '任务执行遇到问题',
} as const

/** Temporary places for visible desk activity. The Host retains all durable assignments. */
export function projectPluginSceneEmployees(roster: readonly OfficeEmployeeVisualState[], runningRoles: readonly string[], policy: OfficeTimePolicy, _date: Date, available = true) {
  const occupied = new Set(roster.map(employee => employee.workstationId))
  const free = new Set(OFFICE_WORKSTATION_AUTO_ASSIGN_PRIORITY.filter(seat => !occupied.has(seat)))
  const working = (employee: OfficeEmployeeVisualState) => runningRoles.includes(employee.employeeId) || available && employee.sceneActivity === 'working'
  // Keep a colleague's ordinary desk when someone else arrives or starts a job.
  // An explicit Host binding always owns its seat, including during breaks.
  const regulars = Object.keys(OFFICE_EMPLOYEE_DEFINITIONS)
  const displaySeats = new Map<string,typeof OFFICE_WORKSTATION_AUTO_ASSIGN_PRIORITY[number]>()
  const unbound = roster.filter(employee=>!employee.workstationId)
  for (const employee of unbound) {
    const seat=OFFICE_WORKSTATION_AUTO_ASSIGN_PRIORITY[regulars.indexOf(employee.employeeId)]
    if (seat && free.delete(seat)) displaySeats.set(employee.employeeId,seat)
  }
  for (const employee of unbound.filter(employee=>!displaySeats.has(employee.employeeId))) {
    const seat=free.values().next().value
    if (seat) {displaySeats.set(employee.employeeId,seat);free.delete(seat)}
  }
  return roster.map(employee => {
    const busy = working(employee)
    const location = employeeLocation(policy, busy, available)
    const task = runningRoles.includes(employee.employeeId) && employee.sceneActivity !== 'working' ? 'running' : employee.taskState
    const workstationId = employee.workstationId ?? (busy || policy.attendancePeriod!=='off-duty' ? displaySeats.get(employee.employeeId) : undefined)
    const ambientDesk = Boolean(available && policy.isWorkPeriod && task==='idle' && !busy && workstationId)
    const idleLabel = ambientDesk ? '整理资料' : policy.attendancePeriod === 'lunch' ? '午间休息'
      : policy.attendancePeriod === 'off-duty' ? (policy.isWorkingDate && policy.hour < 9 ? '尚未上班' : '下班休息') : label.idle
    return { id: employee.employeeId, name: employee.displayName, location, activity: location === 'unknown' ? '位置待同步' : task === 'idle' ? idleLabel : label[task],
      availability: busy ? 'working' as const : 'available' as const, sceneActivity: busy ? 'working' as const : employee.sceneActivity,
      canDrag: employee.canDrag && !busy, taskState: task, ambientDesk, deskOnHold: (task === 'awaiting-user' || task === 'stopping') && !runningRoles.includes(employee.employeeId),
      ...(workstationId ? { workstationId } : {}) }
  })
}

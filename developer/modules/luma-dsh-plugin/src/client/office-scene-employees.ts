import type { OfficeEmployeeVisualState } from '../../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/office-harness/HarnessOfficeProjectionAdapter.ts'
import type { OfficeTimePolicy } from '../../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/office2d/timePolicy.ts'
import { OFFICE_WORKSTATION_AUTO_ASSIGN_PRIORITY } from '../../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/office-workflow/shared/office-workstations.ts'
import { employeeLocation } from './office-presence.ts'

const label = {
  idle: '等待新任务', running: '正在处理任务', 'awaiting-user': '等待你的确认',
  stopping: '正在停止', completed: '报告待查看', failed: '任务执行遇到问题',
} as const

/** Temporary places for visible desk activity. The Host retains all durable assignments. */
export function projectPluginSceneEmployees(roster: readonly OfficeEmployeeVisualState[], runningRoles: readonly string[], policy: OfficeTimePolicy, date: Date, available = true) {
  const occupied = new Set(roster.map(employee => employee.workstationId))
  const free = OFFICE_WORKSTATION_AUTO_ASSIGN_PRIORITY.filter(seat => !occupied.has(seat))
  const working = (employee: OfficeEmployeeVisualState) => runningRoles.includes(employee.employeeId) || available && employee.sceneActivity === 'working'
  const priority = roster.filter(employee => working(employee) && !employee.workstationId)
  // Rotate the informal desks once per half-day so every employee can use one.
  // Lunch keeps the morning's arrangement; only actual jobs claim new seats then.
  const day = Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000)
  const start = roster.length ? ((day * 2 + Number(policy.minuteOfDay >= 13 * 60)) * 3) % roster.length : 0
  const rotation = [...roster.slice(start), ...roster.slice(0, start)]
  const daily = policy.attendancePeriod === 'off-duty' ? [] : rotation.filter(employee => employee.taskState === 'idle' && !working(employee) && !employee.workstationId).slice(0, 3)
  const displaySeats = new Map([...priority, ...daily].map((employee, i) => [employee.employeeId, free[i]]))
  return roster.map(employee => {
    const busy = working(employee)
    const location = employeeLocation(policy, busy, available)
    const task = runningRoles.includes(employee.employeeId) && employee.sceneActivity !== 'working' ? 'running' : employee.taskState
    const workstationId = employee.workstationId ?? displaySeats.get(employee.employeeId)
    const ambientDesk = Boolean(policy.isWorkPeriod && !busy && !employee.workstationId && workstationId)
    const idleLabel = ambientDesk ? '整理资料' : policy.attendancePeriod === 'lunch' ? '午间休息'
      : policy.attendancePeriod === 'off-duty' ? (policy.isWorkingDate && policy.hour < 9 ? '尚未上班' : '下班休息') : label.idle
    return { id: employee.employeeId, name: employee.displayName, location, activity: location === 'unknown' ? '位置待同步' : task === 'idle' ? idleLabel : label[task],
      availability: busy ? 'working' as const : 'available' as const, sceneActivity: busy ? 'working' as const : employee.sceneActivity,
      canDrag: employee.canDrag && !busy, taskState: task, ambientDesk, deskOnHold: (task === 'awaiting-user' || task === 'stopping') && !runningRoles.includes(employee.employeeId),
      ...(workstationId ? { workstationId } : {}) }
  })
}

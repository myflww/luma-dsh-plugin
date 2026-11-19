export interface OfficeActorPortraitTap {
  readonly employeeId: string
  readonly at: number
  readonly clientX: number
  readonly clientY: number
}

export type OfficeEmployeeDestination = 'portrait' | 'workbench'

export function officeEmployeeAction(name: string, destination: OfficeEmployeeDestination = 'portrait', canDrag = true) {
  const workbench = destination === 'workbench'
  const hint = workbench ? '单击或按 Enter 打开工作台' : '双击查看立绘'
  return { 'aria-label': `打开${name}的${workbench ? '工作台' : '立绘页'}`,
    title: canDrag ? hint + '，长按半秒可拖动选择工位' : hint }
}

/** Pointer capture replaces seated buttons, so match completed taps by identity. */
export function advanceOfficeActorPortraitTap(previous: OfficeActorPortraitTap | null, tap: OfficeActorPortraitTap, destination: OfficeEmployeeDestination = 'portrait'): {
  readonly pendingTap: OfficeActorPortraitTap | null
  readonly activate: boolean
} {
  if (destination === 'workbench') return { pendingTap: null, activate: true }
  const interval = previous === null ? Infinity : tap.at - previous.at
  const activate = previous !== null && previous.employeeId === tap.employeeId
    && interval >= 0 && interval <= 500
    && Math.hypot(tap.clientX - previous.clientX, tap.clientY - previous.clientY) <= 12
  return { pendingTap: activate ? null : tap, activate }
}

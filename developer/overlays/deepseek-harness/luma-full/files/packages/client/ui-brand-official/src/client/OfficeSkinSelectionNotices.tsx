import type { MissingFinalPose } from './office2d/independentFinalPoseAvailability.ts'
import { useLumaText } from './LumaLocale.tsx'
import { unavailableOfficeSkinSelections, type SkinSelectionEmployee } from './office2d/skinSelectionAvailability.ts'
import './OfficeSkinSelectionNotices.css'

export function OfficeSkinSelectionNotices({ active, employees, employeeSkins, missingFinalPoses = [] }: Readonly<{
  active: boolean
  employees: readonly SkinSelectionEmployee[]
  employeeSkins?: Readonly<Record<string, string>> | undefined
  missingFinalPoses?: readonly MissingFinalPose[]
}>) {
  const t = useLumaText()
  if (!active) return null
  const unavailable = unavailableOfficeSkinSelections(employees, employeeSkins)
  const invalidIds = new Set(unavailable.map(employee => employee.id))
  const missing = missingFinalPoses.filter(notice => !invalidIds.has(notice.employeeId))
  if (!unavailable.length && !missing.length) return null
  return <div className="lumaOfficeSkinSelectionNotices">
    {unavailable.map(employee => <p key={`skin:${employee.id}`} role="alert" data-skin-selection-unavailable="outfit-unavailable"
      data-employee-id={employee.id} data-skin-id={employee.skinId}>
      {t(`${employee.name}的所选皮肤暂不可用或不属于该角色，请重新选择皮肤。`, `${employee.name}'s selected outfit is unavailable or belongs to another character. Please select an outfit again.`)}
    </p>)}
    {missing.map(notice => <p key={`pose:${notice.employeeId}:${notice.interactionId}`} role="alert"
      data-final-pose-unavailable={notice.reason} data-employee-id={notice.employeeId}
      data-skin-id={notice.skinId} data-interaction-id={notice.interactionId}>
      {notice.reason === 'point-unavailable' ? t(`${notice.name}的目标位置暂不可用。`, `${notice.name}'s destination is unavailable.`)
        : notice.reason === 'phase-unavailable' ? t(`${notice.name}在当前场景时段的姿势暂不可用。`, `${notice.name}'s pose is unavailable for this scene phase.`)
          : t(`${notice.name}的当前衣装在这个工位的坐姿尚未完成。`, `${notice.name}'s current outfit has no completed seated pose for this workstation.`)}
    </p>)}
  </div>
}

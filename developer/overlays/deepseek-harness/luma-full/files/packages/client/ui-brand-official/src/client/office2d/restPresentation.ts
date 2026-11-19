import { getOfficeAsset } from './assets.ts'
import type { OfficeEmployeeCatalogEntry, OfficeWalkDirection } from './employeeCatalog.ts'
import { getEmployeeCatalogWithSkin, getEmployeeSkinWalkProfile } from './employeeSkins.ts'
import { getOfficeEmployeeMovementCalibration } from './employeeMovementCalibration.generated.ts'
import { standingFigureHeight, floorSpriteProfile } from './officeFigureScale.ts'

type RestPose = NonNullable<OfficeEmployeeCatalogEntry['walkRest']>[OfficeWalkDirection]
/** Preserve the walking body's yardstick and place the still's own physical feet on that same world point. */
export function officeActorFramePresentation(employeeId: string, footY: number, direction: OfficeWalkDirection, skinId?: string, rest?: RestPose) {
  const profile = getEmployeeSkinWalkProfile(employeeId, direction, skinId)
    ?? (skinId === undefined ? getOfficeEmployeeMovementCalibration(employeeId, direction) : undefined)
  const catalog = getEmployeeCatalogWithSkin(employeeId, skinId)
  if (!catalog || !profile) throw new Error('Actor pose calibration unavailable')
  const record = getOfficeAsset(rest?.asset ?? catalog.walk[direction]), strip = record.frameStrip
  const authored = { coreHeightPx: rest?.coreHeightPx ?? profile.coreHeightPx, anchor: rest?.anchor ?? profile.anchor }
  if (!strip || !(authored.coreHeightPx > 0 && authored.coreHeightPx <= strip.frameHeight)) throw new Error('Rest pose physical source geometry is unavailable')
  const measured = floorSpriteProfile(record.sha256, strip.frameHeight, authored)
  return { width: standingFigureHeight(footY) * strip.frameWidth / measured.coreHeightPx, anchor: measured.anchor }
}

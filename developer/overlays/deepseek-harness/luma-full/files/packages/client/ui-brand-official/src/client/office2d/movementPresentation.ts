import { getOfficeAsset } from './assets.ts'
import { type OfficeWalkDirection } from './employeeCatalog.ts'
import { getEmployeeCatalogWithSkin, getEmployeeSkinWalkProfile } from './employeeSkins.ts'
import { getOfficeEmployeeMovementCalibration } from './employeeMovementCalibration.generated.ts'
import { floorSpriteProfile, standingFigureHeight } from './officeFigureScale.ts'

/** One source-bound body yardstick; hair/padding affect clearance, never body size. */
export function getOfficeWalkFrameWorldWidth(employeeId: string, footY: number, direction: OfficeWalkDirection = 'down', skinId?: string): number {
  const catalog = getEmployeeCatalogWithSkin(employeeId, skinId)
  const strip = catalog && getOfficeAsset(catalog.walk[direction]).frameStrip
  const profile = getEmployeeSkinWalkProfile(employeeId, direction, skinId)
    ?? (skinId === undefined ? getOfficeEmployeeMovementCalibration(employeeId, direction) : undefined)
  if (!strip || !profile) throw new Error(`Own walk body calibration unavailable: ${employeeId}/${skinId ?? 'base'}/${direction}`)
  const measured = floorSpriteProfile(getOfficeAsset(catalog!.walk[direction]).sha256, strip.frameHeight, profile)
  return standingFigureHeight(footY) * strip.frameWidth / measured.coreHeightPx
}

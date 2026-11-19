import { getOfficeAsset, type OfficeAssetId, type OfficeFrameStrip } from './assets.ts'
import { type OfficeWalkDirection } from './employeeCatalog.ts'
import { getEmployeeCatalogWithSkin, getEmployeeSkinWalkProfile } from './employeeSkins.ts'

/** Body/sole data only. The owning independent room retains its nominal size,
 * station depth, complete seated bindings, playback and drag state. */
export function getIndependentOfficeWalkBodyProfile(
  employeeId: string,
  direction: OfficeWalkDirection,
  assetId: OfficeAssetId,
  skinId?: string,
) {
  const catalog = getEmployeeCatalogWithSkin(employeeId, skinId)
  if (!catalog || catalog.walk[direction] !== assetId) return undefined
  const record = getOfficeAsset(assetId)
  const strip = record.frameStrip
  if (!strip) return undefined
  // Preserve the accepted Parent renderer's own-outfit profile and its exact
  // strip-anchor/.88 fallback; no unselected generated calibration is admitted.
  const authored = getEmployeeSkinWalkProfile(employeeId, direction, skinId)
  const profile = authored ?? { coreHeightPx: strip.frameHeight * .88, anchor: strip.anchor }
  if (!profile || !Number.isFinite(profile.coreHeightPx) || profile.coreHeightPx <= 0
    || profile.coreHeightPx > strip.frameHeight || !Number.isFinite(profile.anchor.x) || !Number.isFinite(profile.anchor.y)
    || profile.anchor.x < 0 || profile.anchor.x > 1 || profile.anchor.y < 0 || profile.anchor.y > 1) return undefined
  return profile
}


/** Pure cell math lives with this consumer; the accepted asset table is unchanged.
 * Single-row strips retain the Parent frame*width origin. Optional grids are
 * structural input only and grant no source or resource admission. */
export function independentFrameRect(
  strip: Pick<OfficeFrameStrip, 'frameWidth' | 'frameHeight' | 'frameCount'> & Readonly<{ atlasColumns?: number; atlasRows?: number }>,
  frame: number,
): readonly [number, number, number, number] {
  if (!Number.isSafeInteger(strip.frameWidth) || strip.frameWidth <= 0
    || !Number.isSafeInteger(strip.frameHeight) || strip.frameHeight <= 0
    || !Number.isSafeInteger(strip.frameCount) || strip.frameCount <= 0) throw Error('角色动作帧的尺寸不匹配。')
  if ((strip.atlasColumns === undefined) !== (strip.atlasRows === undefined)) throw Error('角色动作帧的排列不匹配。')
  const columns = strip.atlasColumns ?? strip.frameCount, rows = strip.atlasRows ?? 1
  if (!Number.isSafeInteger(columns) || columns <= 0 || !Number.isSafeInteger(rows) || rows <= 0
    || !Number.isSafeInteger(columns * rows) || columns * rows < strip.frameCount
    || !Number.isSafeInteger(strip.frameWidth * columns) || !Number.isSafeInteger(strip.frameHeight * rows)) throw Error('角色动作帧的排列不匹配。')
  if (!Number.isSafeInteger(frame) || frame < 0 || frame >= strip.frameCount) throw Error('角色动作帧的索引不匹配。')
  return [(frame % columns) * strip.frameWidth, Math.floor(frame / columns) * strip.frameHeight, strip.frameWidth, strip.frameHeight]
}

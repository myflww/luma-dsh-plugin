import { getOfficeAsset, resolveOfficeAssetUrl, type OfficeAssetId } from './assets.ts'
import { WORK_MOTION_SOURCE_REPLACEMENTS } from './workMotionAssetRecords.generated.ts'
import type { IndependentOfficeSpace } from './generatedIndependentSpaceTypes.ts'

/** New Browser artwork replaces held base poses without rewriting Source27. */
export function withCompletedWorkMotion(space: IndependentOfficeSpace): IndependentOfficeSpace {
  return { ...space, layout: { ...space.layout, renderBindings: space.layout.renderBindings.map(binding => {
    if (binding.skinId) return binding
    const id = WORK_MOTION_SOURCE_REPLACEMENTS[binding.sourceSha256 as keyof typeof WORK_MOTION_SOURCE_REPLACEMENTS] as OfficeAssetId | undefined
    if (!id) return binding
    const record = getOfficeAsset(id), strip = record.frameStrip!
    const replacement = { texture: { path: resolveOfficeAssetUrl(id), bytes: record.bytes, sha256: record.sha256 },
      browserSrc: resolveOfficeAssetUrl(id), sourcePath: resolveOfficeAssetUrl(id), sourceSha256: record.sha256,
      frameSize: [strip.frameWidth, strip.frameHeight] as const, frameCount: strip.frameCount,
      frameOrder: strip.frameOrder!, frameDurationsMs: strip.frameDurationsMs!, restFrame: 0,
      wholeSourceTransform: 'New complete image_gen work keyframes, one common sequence scale and whole-frame foot/chair registration to the prior 512x860 source space; no local limb editing or runtime shaking.',
      visualReviewReceipt: 'modules/luma-dsh-plugin/art/work-motion-r1/browser-review.json',
      visualScope: 'Browser work-motion r1 only; original source and historical Native qualification are retained.',
    }
    if (!binding.anatomicalSourcePixels) {
      return { ...binding, ...replacement,
        sourceForegroundSemantics: { ...binding.sourceForegroundSemantics, sourceSHA256: record.sha256 } }
    }
    return { ...binding, ...replacement, ...(binding.sourceForegroundSemantics
      ? { sourceForegroundSemantics: { ...binding.sourceForegroundSemantics, sourceSHA256: record.sha256 } } : {}) }
  }) } }
}

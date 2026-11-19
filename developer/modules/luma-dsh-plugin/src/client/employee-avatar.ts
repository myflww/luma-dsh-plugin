import { getEmployeeCatalogWithSkin } from '../../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/office2d/employeeSkins.ts'
import { resolveOfficeAssetUrl } from '../../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/office2d/assets.ts'
import type { MessageAvatarViewport } from './MessageAvatar.tsx'

type Crop = readonly [x: number, y: number, size: number]
// The first front-facing frame in each authored atlas is 592 x 724. Head size
// and transparent margins vary independently between base outfits and skins.
const headCrops: Record<string, readonly [Crop, Crop]> = {
  shan: [[135, 69, 320], [121, 14, 335]],
  'bai-shuangming': [[144, 43, 310], [116, 66, 365]],
  'lu-mi': [[136, 15, 322], [139, 12, 330]],
  jingyuniang: [[98, 127, 388], [84, 81, 424]],
  longmama: [[188, 300, 222], [215, 291, 218]],
  claude: [[125, 69, 335], [174, 234, 242]],
  gemini: [[137, 57, 321], [137, 57, 321]],
  grok: [[107, 29, 379], [107, 29, 379]],
}
export function getChibiAvatar(id: string, skinId?: string): { src: string; viewport: MessageAvatarViewport } {
  const crops = headCrops[id]
  const catalog = getEmployeeCatalogWithSkin(id, skinId) ?? getEmployeeCatalogWithSkin(id)
  if (!catalog || !crops) throw Error('未知员工形象。')
  const [x, y, size] = crops[skinId === `skin.${id}.v1` ? 1 : 0]
  return { src: resolveOfficeAssetUrl(catalog.walk.down), viewport: { width: 3552, height: 724, x, y, size } }
}

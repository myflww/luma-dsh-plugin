import { getOfficeAsset, resolveOfficeAssetUrl } from '../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/office2d/assets.ts'
import { getEmployeeCatalogWithSkin, getEmployeeSkinPack } from '../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/office2d/employeeSkins.ts'

const records = {}
const info = asset => ({src: resolveOfficeAssetUrl(asset.id), sha256: asset.sha256, strip: asset.frameStrip})
for (const variant of ['base', 'v1']) {
  const skin = variant === 'v1' ? 'skin.lu-mi.v1' : undefined
  const employee = getEmployeeCatalogWithSkin('lu-mi', skin)
  const pack = skin && getEmployeeSkinPack('lu-mi', skin)
  const down = getOfficeAsset(employee.walk.down)
  const seat = getOfficeAsset(pack ? pack.assets.typing.front : 'employee.lu-mi.typing.front-reception.v3')
  records['lu-mi-' + variant] = {down: info(down), seat: info(seat)}
}
process.stdout.write(JSON.stringify(records))

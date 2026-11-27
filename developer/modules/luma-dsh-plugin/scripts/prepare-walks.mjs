import { build } from 'esbuild'
import { spawnSync } from 'node:child_process'

const source = 'overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/office2d'
const body = `
import { getEmployeeCatalogWithSkin, getEmployeeSkinWalkProfile } from './${source}/employeeSkins.ts'
import { getOfficeAsset, resolveOfficeAssetUrl } from './${source}/assets.ts'
import { createOfficeFrameTimeline } from './${source}/frameTimeline.ts'
import { OFFICE_SILHOUETTES } from './${source}/officeSilhouettes.generated.ts'
const assets = new Map()
for (const role of ['jingyuniang','longmama','claude','gemini','grok','shan','bai-shuangming','lu-mi']) {
  for (const skin of [undefined, 'skin.' + role + '.v1']) {
    for (const [direction, id] of Object.entries(getEmployeeCatalogWithSkin(role, skin).walk)) {
      const asset = getOfficeAsset(id)
      const strip = asset.frameStrip
      const anchor = getEmployeeSkinWalkProfile(role, direction, skin)?.anchor ?? strip.anchor
      const [height, sole] = OFFICE_SILHOUETTES[asset.sha256]
      const variant=skin || role==='gemini' || role==='grok' ? 'v1' : 'base'
      const {order,durations}=createOfficeFrameTimeline(strip)
      assets.set(id, {id,order,durations,costume:role+'-'+variant, direction, cycleMs:createOfficeFrameTimeline(strip).cycleMs,
        src: 'modules/luma-dsh-plugin/public' + resolveOfficeAssetUrl(id),
        sha: asset.sha256, strip, height, sole, center: anchor.x * strip.frameWidth})
    }
  }
}
console.log(JSON.stringify([...assets.values()]))
`
const bundled = await build({stdin:{contents:body,resolveDir:process.cwd()},bundle:true,write:false,platform:'node',format:'cjs'})
const listing = spawnSync(process.execPath, ['-'], {input:bundled.outputFiles[0].text,encoding:'utf8'})
if (listing.status !== 0) throw Error(listing.stderr)
const job = spawnSync(process.env.PYTHON || 'python', ['modules/luma-dsh-plugin/scripts/prepare-walks.py',...process.argv.slice(2)],
  {input:listing.stdout,stdio:['pipe','inherit','inherit']})
if (job.error) throw job.error
process.exitCode = job.status ?? 1

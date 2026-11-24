import {build} from 'esbuild'
import {spawnSync} from 'node:child_process'
const source = 'overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/office2d'
const body = `
import {getEmployeeCatalogWithSkin} from './${source}/employeeSkins.ts'
import {getOfficeAsset,resolveOfficeAssetUrl} from './${source}/assets.ts'
const output=[];
for(const role of ['jingyuniang','longmama','claude','gemini','grok','shan','bai-shuangming','lu-mi']){
  for(const skin of [undefined,'skin.'+role+'.v1']){
    const catalog=getEmployeeCatalogWithSkin(role,skin)
    for(const id of Object.values(catalog.walk)){
      const asset=getOfficeAsset(id)
      output.push({id,src:'modules/luma-dsh-plugin/public'+resolveOfficeAssetUrl(id),sha:asset.sha256,strip:asset.frameStrip})
    }
  }
}
console.log(JSON.stringify(output))
`
const bundled=await build({stdin:{contents:body,resolveDir:process.cwd()},bundle:true,write:false,platform:'node',format:'cjs'})
const listing=spawnSync(process.execPath, ['-'], {input:bundled.outputFiles[0].text,encoding:'utf8'})
if(listing.status!==0) throw Error(listing.stderr)
const job=spawnSync(process.env.PYTHON || 'python',['modules/luma-dsh-plugin/scripts/prepare-walks.py'],{input:listing.stdout,stdio:['pipe','inherit','inherit']})
if(job.error) throw job.error
process.exitCode=job.status??1

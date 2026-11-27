import {build} from 'esbuild'
import {spawnSync} from 'node:child_process'
const office='overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/office2d'
const sources=`
import {getEmployeeCatalogWithSkin,getEmployeeSkinPack,getEmployeeTypingProfileWithSkin} from './${office}/employeeSkins.ts'
import {getOfficeAsset,resolveOfficeAssetUrl} from './${office}/assets.ts'
import {deskFrameRegistration} from './${office}/deskFrameRegistration.ts'
import {officeRearHands} from './${office}/officeKeyboardContact.ts'
import {OFFICE_SILHOUETTES} from './${office}/officeSilhouettes.generated.ts'
import mattes from './${office}/sceneChairMattes.generated.json'
const role='lu-mi'
const measured={backRight:[[241,634],[421,511]],backLeft:[[213,625],[84,515]]}
const rows=[]
for(const skin of [undefined,'skin.lu-mi.v1']){
  const cat=getEmployeeCatalogWithSkin(role,skin),pack=getEmployeeSkinPack(role,skin)
  for(const view of ['back','backRight','backLeft','front']){
    const rig=getEmployeeTypingProfileWithSkin(role,view,skin)
    const reflected=view==='backLeft' && rig.integratedChair
    const dir=reflected?'backRight':view,art=getOfficeAsset(cat.typing[dir]),strip=art.frameStrip
    const point=p=>[p.x*strip.frameWidth,p.y*strip.frameHeight]
    const anatomy=pack?.typingProfiles[dir].landmarks
    const [height,sole]=OFFICE_SILHOUETTES[art.sha256]
    const seat=point(getEmployeeTypingProfileWithSkin(role,dir,skin).seatAnchor)
    const fallback=measured[dir]
    const hip=anatomy?point(anatomy.hip):fallback?.[0]??seat
    const hand=anatomy?point(anatomy.hand):fallback?.[1]??officeRearHands[art.sha256]??[seat[0],seat[1]-.20*height]
    const head=anatomy?point(anatomy.head):[hip[0],sole-height*.77]
    const foot=anatomy?point(anatomy.foot):[hand[0]-(dir==='backLeft'?-1:1)*height*.14,sole]
    rows.push({key:role+'-'+(skin?'v1':'base'),view,reflected,src:resolveOfficeAssetUrl(art.id),sha:art.sha256,
      matte:dir==='back'?mattes[art.sha256]:undefined,strip,head,foot,hip,hand,height,sole,
      offsets:Array.from({length:strip.frameCount},(_,i)=>deskFrameRegistration(art.sha256,i)??[0,0])})
  }
}
console.log(JSON.stringify(rows))
`
const api=await build({stdin:{contents:sources,resolveDir:process.cwd()},bundle:true,write:false,format:'cjs',platform:'node'})
const list=spawnSync(process.execPath,['-'],{input:api.outputFiles[0].text,encoding:'utf8'})
if(list.status!==0)throw Error(list.stderr)
const run=spawnSync(process.env.PYTHON||'python',['modules/luma-dsh-plugin/scripts/prepare-original-seating.py'],{input:list.stdout,stdio:['pipe','inherit','inherit']})
if(run.error)throw run.error
process.exitCode=run.status??1

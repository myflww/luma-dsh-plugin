import { build } from 'esbuild'
import { nativeBundleOptions } from '../scripts/native-bundle-options.mjs'
import { prepareStudioDesktop } from '../scripts/prepare-studio-desktop.mjs'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { DEFAULT_SCHEMA, Type, load as parse } from 'js-yaml'
import { mkdir, readFile, readdir } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { getEmployeeCatalogWithSkin, getEmployeeSkinPack, getBrowserOfficeDefaultSkinId } from '../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/office2d/employeeSkins.ts'
import { BEDROOM_SLEEP } from '../src/client/bedroom-art.generated.ts'
import { createOfficeFrameTimeline } from '../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/office2d/frameTimeline.ts'
import { getOfficeAsset, resolveOfficeAssetUrl } from '../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/office2d/assets.ts'

const here = dirname(fileURLToPath(import.meta.url))
const plugin = dirname(here), repo = resolve(plugin, '../..')
const baseline = process.env.LUMA_DSH_SOURCE ?? join(repo, '.luma-cache/deepseek-harness-baseline/141eb6fef83422698aef7a981029e843e8161534')
const output = join(plugin, '.runtime/native-desktop')
await mkdir(output, {recursive:true})
await prepareStudioDesktop(output)
if (process.platform==='win32') execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',join(here,'build-pet.ps1'),output],{windowsHide:true,stdio:'inherit'})
// This release is Windows-only and the plugin requires profileContext. Resolve
// exactly those three official switches at build time; reject unfamiliar tags.
const pinned = JSON.parse(await readFile(join(repo, 'upstream/pins.json'), 'utf8'))
const standard = await readFile(join(repo, 'upstream/desktop-0.2.2-rc.1/standard.patch.yml'), 'utf8')
if (createHash('sha256').update(standard).digest('hex') !== pinned.standardPresetSha256) throw Error('Unexpected desktop standard preset')
const conditions = new Map([["process.platform === 'win32'",true],["process.platform !== 'win32'",false],["!ctx.get('profileContext')",false]])
const schema = DEFAULT_SCHEMA.extend([new Type('tag:yaml.org,2002:js', { kind:'scalar', construct(condition) {
  if (!conditions.has(condition)) throw Error('Unsupported native preset condition: '+condition)
  return conditions.get(condition)
}})])
const config = parse(standard,{schema})[0].insert.find(row=>row.id==='preset-standard')?.config
if (config?.id !== 'standard' || !Array.isArray(config.plugins) || !config.plugins.some(row=>row.id==='persona')) throw Error('Invalid standard preset')
const employees = {}
for (const id of (await readdir(join(plugin,'presets'))).filter(id => /^luma-[a-z-]+$/.test(id)).sort()) {
  const meta = parse(await readFile(join(plugin,'presets',id,'preset.yml'), 'utf8'))
  if (!meta.name || !meta.description || !Number.isSafeInteger(meta.order)) throw Error('Invalid Luma preset '+id)
  employees[id]={name:meta.name,description:meta.description,order:meta.order}
}
if (Object.keys(employees).length !== 8) throw Error('Expected eight Luma employee presets.')
const petArt = {}
const gaits=JSON.parse(await readFile(join(repo,'overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/office2d/walkAtlas.generated.json'),'utf8'))
const poses=JSON.parse(await readFile(join(repo,'overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/office2d/actorPoseAtlas.generated.json'),'utf8'))
const gestures=JSON.parse(await readFile(join(repo,'overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/office2d/actorGestureAtlas.generated.json'),'utf8'))
const looks=JSON.parse(await readFile(join(repo,'overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/office2d/actorLookAtlas.generated.json'),'utf8'))
for (const preset of Object.keys(employees)) {
  const role = preset === 'luma-duanmu-yan' ? 'shan' : preset.slice('luma-'.length)
  for (const variant of ['base', 'v1']) {
    if (variant==='base' && (role==='gemini'||role==='grok')) continue
    const employee = getEmployeeCatalogWithSkin(role, variant === 'base' ? undefined : 'skin.' + role + '.v1')
    if (!employee) throw Error('Missing desktop companion art for ' + role)
    const pack=getEmployeeSkinPack(role,variant==='base'?getBrowserOfficeDefaultSkinId(role):'skin.'+role+'.v1')
    const points=pack?.sleep.contactUVs
    const sleeper=points?{url:resolveOfficeAssetUrl(pack.assets.sleep),head:[points.backOfHead.x,points.backOfHead.y],feet:[points.feetCenter.x,points.feetCenter.y]}:BEDROOM_SLEEP[role]
    const dx=sleeper.feet[0]-sleeper.head[0],dy=sleeper.feet[1]-sleeper.head[1]
    const strips=Object.fromEntries(['down','up','left','right'].map(direction => {
      const asset = getOfficeAsset(employee.walk[direction])
      const {frameWidth,frameHeight,frameCount,frameDurationsMs} = asset.frameStrip
      const gait=gaits[asset.id]
      if(!gait || role==='lu-mi' && gait.sourceSha256!==asset.sha256)throw Error('Missing or mismatched desktop gait: '+asset.id)
      const timing=createOfficeFrameTimeline(asset.frameStrip), steps=gait.count/timing.order.length
      let nativeClock=0
      const durations=gait.frameDurationsMs?.map(value=>{
        const start=Math.round(nativeClock)
        nativeClock+=value
        return Math.round(nativeClock)-start
      }) ?? Array.from({length:gait.count},(_,i)=>{
        const t=timing.durations[Math.floor(i/steps)],n=i%steps
        return Math.round((n+1)*t/steps)-Math.round(n*t/steps)
      })
      return [direction,{path:resolveOfficeAssetUrl(asset.id).slice(1),frameWidth,frameHeight,frameCount,frameDurationsMs,
        gaitPath:gait.src.slice(1),cell:gait.cell,columns:gait.columns,durations,figureHeight:gait.figureHeight,sole:gait.sole}]
    }))
    const key=role+'-'+variant
    const pose=poses[key]
    if (!pose || ![48,64].includes(pose.count) || pose.columns!==8) throw Error('Missing desktop pose artwork for '+key)
    const gesture=gestures[key]
    if(!gesture || gesture.count!==16 || gesture.actions?.length!==2)throw Error('Missing desktop gestures for '+key)
    const look=looks[key]
    if(!look || look.count!==25 || !look.eyesSrc)throw Error('Missing desktop gaze artwork for '+key)
    petArt[key]={strips,poses:{...pose,path:pose.src.slice(1),gestures:{...gesture,path:gesture.src.slice(1)},
        look:{...look,path:look.src.slice(1),eyesPath:look.eyesSrc.slice(1)}},
      sleep:sleeper.url.slice(1),sleepMirror:dx<0,sleepAngle:13-Math.atan2(dy,Math.abs(dx))*180/Math.PI}
  }
}
await build({
  entryPoints:[join(plugin,'src/host/pet-pdf-worker.mjs')],outfile:join(output,'pet-pdf-worker.mjs'),
  platform:'node',format:'esm',target:'node24',bundle:true,minify:true,legalComments:'eof',
})
await build({
  ...nativeBundleOptions,
  banner:{js:"import { createRequire as createNodeRequire } from 'node:module'; const require=createNodeRequire(import.meta.url);"},
  entryPoints:[join(here, 'server-entry.ts')], outfile:join(output, 'server.mjs'),
  platform:'node', format:'esm', target:'node24', bundle:true,
  define:{__LUMA_DESKTOP_PRESETS__:JSON.stringify({employees,plugins:config.plugins}),__LUMA_PET_ART__:JSON.stringify(petArt)},
  alias:{
    '@deepseek-ai/schemastery':join(baseline, 'vendor/schemastery/src/index.ts'),
    '@deepseek-ai/cosmokit':join(baseline, 'vendor/cosmokit/src/index.ts'),
  },
})

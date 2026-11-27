import { test } from 'node:test'
import { execFileSync } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { compileCheck, native } from './tests/compile-check.mjs'

test('all costumes dock on both sides and rest their hands on the lower desktop edge', {skip:process.platform!=='win32'}, async t=>{
  const art=join(native,'pet-art')
  const index=JSON.parse(await readFile(new URL('../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/office2d/actorPoseAtlas.generated.json',import.meta.url),'utf8'))
  const commands=Object.fromEntries(Object.entries(index).map(([key,pose])=>{
    const role=key.replace(/-(base|v1)$/,'')
    const file=(folder)=>join(art,folder,key+'.png')
    return [key,{roleId:role,skinId:key.endsWith('-v1')?'skin.'+role+'.v1':null,
      reduceMotion:true,poses:{...pose,path:resolve(native,'../art/release-assets',pose.src.slice(1))},
      strips:{},peek:file(''),bottomPeek:file('bottom'),bottomSleep:role==='lu-mi'?file('bottom-night'):undefined,ledge:file('ledge'),
      greet:file('greet'),sleepyPose:file('drowsy'),lunchPose:file('lunch'),performance:file('performance')}]
  }))
  const temp=await mkdtemp(join(tmpdir(),'luma-edge-check-'))
  t.after(()=>rm(temp,{recursive:true,force:true}))
  const spec=join(temp,'wardrobe.json'), exe=await compileCheck('PetEdgePortraitCheck',temp)
  await writeFile(spec,JSON.stringify(commands))
  const proof=process.env.LUMA_PET_EDGE_PROOF
  execFileSync(exe,proof?[spec,proof]:[spec],{windowsHide:true})
})

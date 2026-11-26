import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

test('native pet pose continuity, gaze and hand inertia for every outfit', {skip:process.platform!=='win32'}, async t=>{
  const here=fileURLToPath(new URL('.',import.meta.url))
  const temporary=await mkdtemp(join(tmpdir(),'luma-native-motion-'))
  t.after(()=>rm(temporary,{recursive:true,force:true}))
  const atlas=JSON.parse(await readFile(new URL('../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/office2d/actorPoseAtlas.generated.json',import.meta.url),'utf8'))
  assert.equal(Object.keys(atlas).length,14)
  const config=Object.fromEntries(Object.entries(atlas).map(([key,entry])=>[key,{...entry,path:resolve(here,'../art/release-assets',entry.src.slice(1))}]))
  const input=join(temporary,'poses.json')
  const executable=join(temporary,'CheckMotion.exe')
  await writeFile(input,JSON.stringify(config))
  const compiler=join(process.env.SystemRoot,'Microsoft.NET/Framework/v4.0.30319/csc.exe')
  execFileSync(compiler,['/nologo','/r:System.Drawing.dll','/r:System.Web.Extensions.dll','/out:'+executable,
    join(here,'PetPoseAtlas.cs'),join(here,'PetFace.cs'),join(here,'tests/PetMotionCheck.cs')],{windowsHide:true})
  execFileSync(executable,[input],{windowsHide:true})
})

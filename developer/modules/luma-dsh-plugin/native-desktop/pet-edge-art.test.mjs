import { test } from 'node:test'
import { execFileSync } from 'node:child_process'
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

test('all costumes dock on both sides and rest their hands on the lower desktop edge', {skip:process.platform!=='win32'}, async t=>{
  const native=fileURLToPath(new URL('.',import.meta.url))
  const art=join(native,'pet-art')
  const index=JSON.parse(await readFile(new URL('../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/office2d/actorPoseAtlas.generated.json',import.meta.url),'utf8'))
  const commands=Object.fromEntries(Object.entries(index).map(([key,pose])=>{
    const role=key.replace(/-(base|v1)$/,'')
    const file=(folder)=>join(art,folder,key+'.png')
    return [key,{roleId:role,skinId:key.endsWith('-v1')?'skin.'+role+'.v1':null,
      reduceMotion:true,poses:{...pose,path:resolve(native,'../art/release-assets',pose.src.slice(1))},
      strips:{},peek:file(''),bottomPeek:file('bottom'),ledge:file('ledge'),
      greet:file('greet'),sleepyPose:file('drowsy'),lunchPose:file('lunch')}]
  }))
  const temp=await mkdtemp(join(tmpdir(),'luma-edge-check-'))
  t.after(()=>rm(temp,{recursive:true,force:true}))
  const spec=join(temp,'wardrobe.json'), exe=join(temp,'EdgeCheck.exe')
  await writeFile(spec,JSON.stringify(commands))
  const csc=join(process.env.SystemRoot,'Microsoft.NET/Framework/v4.0.30319/csc.exe')
  const wpf=join(dirname(csc),'WPF')
  const sources=(await readdir(native)).filter(name=>name.endsWith('.cs')).map(name=>join(native,name))
  execFileSync(csc,['/nologo','/codepage:65001','/r:System.Drawing.dll','/r:System.Windows.Forms.dll','/r:System.Web.Extensions.dll','/r:System.Xaml.dll',
    '/r:'+join(wpf,'PresentationCore.dll'),'/r:'+join(wpf,'WindowsBase.dll'),'/main:PetEdgePortraitCheck','/out:'+exe,
    ...sources,join(native,'tests/PetEdgePortraitCheck.cs')],{windowsHide:true})
  const proof=process.env.LUMA_PET_EDGE_PROOF
  execFileSync(exe,proof?[spec,proof]:[spec],{windowsHide:true})
})

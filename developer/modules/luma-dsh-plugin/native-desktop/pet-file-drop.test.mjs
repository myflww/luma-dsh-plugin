import assert from 'node:assert/strict'
import {test} from 'node:test'
import {execFileSync} from 'node:child_process'
import {createServer} from 'node:http'
import {once} from 'node:events'
import {copyFile,mkdir,mkdtemp,readdir,readFile,rm,writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {dirname,join} from 'node:path'
import {setTimeout as delay} from 'node:timers/promises'
import {fileURLToPath} from 'node:url'
import {desktopPets} from './desktop-pet.ts'
import {createAgentWork} from '../src/host/agent-work.ts'

test('Windows FileDrop enters the real pet, asks about the document, then accepts its native reply', {skip:process.platform!=='win32',timeout:45000},async t=>{
  const native=fileURLToPath(new URL('.',import.meta.url)),root=await mkdtemp(join(tmpdir(),'pet-window-flow-'))
  const bin=join(root,'native'),assets=join(root,'public'),store=join(root,'desk')
  await Promise.all([bin,assets,store].map(path=>mkdir(path)))
  const key='shan-base',name=key+'.png'
  const index=JSON.parse(await readFile(new URL('../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/office2d/actorPoseAtlas.generated.json',import.meta.url),'utf8'))
  for(const sub of ['','bottom','ledge','drowsy','greet','lunch','performance']){
    const target=join(bin,'pet-art',sub);await mkdir(target,{recursive:true});await copyFile(join(native,'pet-art',sub,name),join(target,name))
  }
  const pose=index[key]
  await copyFile(join(native,'../art/release-assets',pose.src.slice(1)),join(assets,'pose.png'))
  globalThis.__LUMA_PET_ART__={[key]:{poses:{...pose,path:'pose.png'},strips:{},sleep:'pose.png'}}
  const csc=join(process.env.SystemRoot,'Microsoft.NET/Framework/v4.0.30319/csc.exe'),wpf=join(dirname(csc),'WPF')
  const sources=(await readdir(native)).filter(n=>n.endsWith('.cs')).map(n=>join(native,n))
  execFileSync(csc,['/nologo','/codepage:65001','/r:System.Windows.Forms.dll','/r:System.Drawing.dll','/r:System.Web.Extensions.dll','/r:System.Xaml.dll',
    '/r:'+join(wpf,'PresentationCore.dll'),'/r:'+join(wpf,'WindowsBase.dll'),'/out:'+join(bin,'DesktopPet.exe'),'/main:PetFileDropCheck',...sources,join(native,'tests/PetFileDropCheck.cs')],{windowsHide:true})
  const path=join(bin,'纸鸢试飞.md'),original='合成资料：纸鸢试飞的稳定率是 47%。';await writeFile(path,original)
  let turns=0
  const host={get:name=>name==='agentDefaultModel'?{currentSelection:()=>({provider:'host',model:'selected',reasoningEffort:'balanced'})}:undefined,
    llm:{listProviders:()=>[{id:'host'}],async *stream(options){
      assert.equal(options.provider,'host');assert.equal(options.model,'selected');assert.equal(options.reasoningEffort,'balanced')
      const input=JSON.stringify(options.messages);assert.match(input,/纸鸢试飞/);assert.match(input,/47%/)
      if(++turns===2)assert.match(input,/下一轮用蓝色标尺做对照/)
      yield {type:'block-end',index:0,block:{type:'text',text:turns===1?'纸鸢试飞中，47% 的稳定率是怎样测量的？':'我们可以保留蓝色对照组。'}}
      yield {type:'finish',reason:{kind:'stop'}}
    }}}
  const desk=createAgentWork(store,undefined,undefined,undefined,false,host)
  const pets=desktopPets(bin,()=>['shan'],()=>undefined,()=>({}),desk.petFiles)
  const server=createServer(pets.handler).listen(0,'127.0.0.1');await once(server,'listening')
  t.after(async()=>{await pets.dispose();desk.dispose();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));delete globalThis.__LUMA_PET_ART__;await rm(root,{recursive:true,force:true})})
  const response=await fetch('http://127.0.0.1:'+server.address().port,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'open',roleId:'shan',reduceMotion:true})})
  const opened=await response.json()
  let report='';for(let i=0;i<120 && !report;i++){report=await readFile(join(bin,'ui-report.txt'),'utf8').catch(()=>'');if(!report)await delay(50)}
  assert.equal(report,'PASS',report||JSON.stringify(opened));assert.equal(opened.ok,true);assert.equal(turns,2)
  const state=await desk.call('state',{});assert.equal(state.petFileDefault,true);assert.equal(state.roles.shan.model,'')
  assert.equal(state.jobs.length,2);assert.equal(state.jobs[0].topic,state.jobs[1].topic)
  assert.equal(await readFile(path,'utf8'),original)
})

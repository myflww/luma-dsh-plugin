import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { once } from 'node:events'
import { randomUUID } from 'node:crypto'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'
import { createStudioDesktop } from '../src/host/studio-desktop.ts'
import { createAgentWork } from '../src/host/agent-work.ts'
import { prepareStudioDesktop } from '../scripts/prepare-studio-desktop.mjs'

test('studio HTTP dispatch gives two roles independent WinForms windows, then reviews their verified UIA results', {
  skip:process.platform!=='win32' || process.env.LUMA_TEST_WINDOWS_UI!=='1', timeout:75000
}, async()=>{
  const dir=await mkdtemp(join(tmpdir(),'luma-studio-probe-'))
  let child,desk,api,provider
  try {
    await prepareStudioDesktop(dir)
    const exe=join(dir,'LumaStudioProbe.exe')
    execFileSync(join(process.env.WINDIR,'Microsoft.NET/Framework64/v4.0.30319/csc.exe'),[
      '/nologo','/target:winexe','/reference:System.Windows.Forms.dll','/reference:System.Drawing.dll','/out:'+exe,
      fileURLToPath(new URL('fixtures/StudioDesktopProbe.cs',import.meta.url))
    ],{windowsHide:true})
    const title='LumaStudio-'+randomUUID()
    child=spawn(exe,[title,'overlap',dir],{windowsHide:true,stdio:['pipe','ignore','ignore']})
    const desktop=createStudioDesktop(join(dir,'agent-desktop/agent-desktop.exe'))
    desk=createAgentWork(join(dir,'profile'),undefined,undefined,undefined,false,undefined,undefined,desktop)
    api=createServer(desk.handler).listen(0,'127.0.0.1')
    await once(api,'listening')
    const origin='http://127.0.0.1:'+api.address().port
    async function post(action,body={}) {
      const response=await fetch(origin+'/luma-agents/'+action,{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(body)})
      const data=await response.json()
      assert.equal(data.ok,true,data.error)
      return data.value
    }
    assert.equal((await post('desktopstatus')).available,true)
    let targets=[]
    for (let i=0;i<20 && targets.length!==2;i++) {
      targets=(await post('desktoptargets')).targets.filter(item=>item.label.startsWith(title))
      if (targets.length!==2) await delay(150)
    }
    assert.equal(targets.length,2)
    targets.sort((a,b)=>a.title.localeCompare(b.title))
    // Identically located windows with different solid fills prove that the
    // occluded window is captured from its compositor surface, not the screen.
    for (const [index,window] of targets.entries()) {
      const {image}=await post('desktoppreview',{targetId:window.id,view:'screen'})
      assert.ok(image.width<600 && image.height<400)
      const colors=JSON.parse(execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',
        'Add-Type -AssemblyName System.Drawing; $bytes=[Convert]::FromBase64String([Console]::In.ReadToEnd()); $s=[IO.MemoryStream]::new($bytes); $im=[Drawing.Bitmap]::new($s); $a=0; $b=0; for($y=0;$y -lt $im.Height;$y+=3){for($x=0;$x -lt $im.Width;$x+=3){$c=$im.GetPixel($x,$y); if($c.R -eq 201 -and $c.G -eq 43 -and $c.B -eq 68){$a++}; if($c.R -eq 27 -and $c.G -eq 130 -and $c.B -eq 150){$b++}}}; ConvertTo-Json @($a,$b)'
      ],{windowsHide:true,input:image.dataUrl.split(',')[1],encoding:'utf8'}))
      assert.ok(colors[index]>100,'Missing color belonging to the selected window: '+colors)
      assert.equal(colors[1-index],0,'Unselected window visible in image')
    }
    // Both roles must observe their own live window before either is allowed to write.
    let arrived=0, unlock
    const barrier=new Promise(resolve=>{unlock=resolve})
    const failures=[]
    async function decide(messages,value) {
        if (!messages[0].content.includes('Windows 窗口')) {
          if (messages[0].content.includes('逐一核对成员')) {
            assert.match(messages[1].content,/role-shan/)
            assert.match(messages[1].content,/role-lu-mi/)
            return '已核对两个窗口'
          }
          return '分别填写、确认并回读各自的表单。'
        }
        const {actions,lastObservation}=JSON.parse(messages.at(-1).content).desktop
        const find=name=>lastObservation.find(node=>node.name===name)
        if (!actions.length) {
          if (++arrived===2) unlock()
          await Promise.race([barrier,delay(8000,null,{ref:false}).then(()=>{throw Error('Independent windows did not overlap')})])
          assert.ok(find('Draft')?.ref,'Missing the assigned field in the selected window')
          return JSON.stringify({action:'set-value',ref:find('Draft').ref,text:value})
        }
        if (actions.length===1) {
          assert.ok(find('Draft')?.value===value,'Selected window did not contain the assigned input')
          return JSON.stringify({action:'click',ref:find('Apply').ref})
        }
        assert.ok(find('Verified '+value),'Selected window did not show the expected result')
        return JSON.stringify({action:'finish',result:value})
    }
    provider=createServer(async(req,res)=>{
      try {
        let raw=''
        for await (const chunk of req) raw+=chunk
        const {messages,model}=JSON.parse(raw)
        const content=await decide(messages,'role-'+model)
        res.end(JSON.stringify({choices:[{message:{content}}]}))
      } catch (e) { failures.push(e);res.writeHead(500);res.end() }
    }).listen(0,'127.0.0.1')
    await once(provider,'listening')
    const roleIds=['shan','lu-mi']
    for (const roleId of roleIds) await post('configure',{roleId,model:roleId,baseUrl:'http://127.0.0.1:'+provider.address().port})
    const room=await post('createroom',{name:'本机测试',roleIds,workflow:'studio',requestId:'test'})
    await post('run',{requestId:'desktop-probe',topic:room.id,mode:'team',roleIds,text:'分别填写两个测试窗并验收',
      desktopTargets:Object.fromEntries(roleIds.map((id,index)=>[id,targets[index].id]))})
    let job
    for (let i=0;i<200;i++) {
      job=(await post('state')).jobs[0]
      if (!['running','queued'].includes(job.status)) break
      await delay(150)
    }
    assert.deepEqual(failures,[])
    assert.equal(job.status,'done',JSON.stringify(job))
    assert.deepEqual(job.steps.map(step=>step.output),['分别填写、确认并回读各自的表单。','role-shan','role-lu-mi','已核对两个窗口'])
    const sample='PROBE-4492'
    const accepted=await desktop.runWithReceipt(targets[0].id,[{role:'user',content:'Enter '+sample+' and submit this test form.'}],async msgs=>{
      const {lastObservation,actions}=JSON.parse(msgs.at(-1).content).desktop
      const find=name=>lastObservation.find(row=>row.name===name)
      if(!actions.length)return JSON.stringify({action:'set-value',ref:find('Draft').ref,text:sample})
      if(actions.length===1)return JSON.stringify({action:'click',ref:find('Apply').ref})
      const row=find('Verified '+sample)
      assert.ok(row?.readbackId)
      return JSON.stringify({action:'finish',result:'这句话未经 UI 核验',readbackRefs:[row.readbackId]})
    },AbortSignal.timeout(18000))
    assert.equal(accepted.receipt.title,targets[0].title);assert.equal(accepted.receipt.status,'observed')
    assert.equal(accepted.receipt.clickCount,1);assert.deepEqual(accepted.receipt.actions.map(a=>a.control),['Draft','Apply'])
    assert.deepEqual(accepted.receipt.readbacks.map(row=>row.text),['Verified '+sample])
    const changed=await desktop.runWithReceipt(targets[0].id,[],async msgs=>{
      const {lastObservation,actions}=JSON.parse(msgs.at(-1).content).desktop
      if(!actions.length)return JSON.stringify({action:'set-value',ref:lastObservation.find(row=>row.name==='Draft').ref,text:'Check before submit'})
      child.stdin.write('change-a\n')
      for(let i=0;i<30;i++){
        if(await access(join(dir,'change-observed')).then(()=>true,()=>false))break
        await delay(50)
      }
      await access(join(dir,'change-observed'))
      return JSON.stringify({action:'click',ref:lastObservation.find(row=>row.name==='Apply').ref})
    },AbortSignal.timeout(30000))
    assert.match(changed.result,/待确认/);assert.equal(changed.receipt.status,'unconfirmed')
    assert.deepEqual(changed.receipt.actions.map(row=>row.action),['set-value'])
    assert.equal(changed.receipt.clickCount,0);assert.deepEqual(changed.receipt.readbacks,[])
    assert.doesNotMatch(JSON.stringify(changed.receipt),/Edited by another participant/)
    await desktop.run(targets[0].id,[],async msgs=>{
      const {lastObservation}=JSON.parse(msgs.at(-1).content).desktop
      assert.ok(lastObservation.some(row=>row.name==='Verified '+sample),'The prior result must survive an interrupted submission')
      return JSON.stringify({action:'finish',result:'checked'})
    },AbortSignal.timeout(15000))
    child.stdin.end('minimize-a\n')
    for (let i=0;i<20 && (await post('desktoptargets')).targets.some(t=>t.id===targets[0].id);i++) await delay(100)
    await assert.rejects(post('desktoppreview',{targetId:targets[0].id,view:'screen'}),/最小化/)
  } finally {
    desk?.dispose()
    for (const server of [api,provider]) if (server) { server.closeAllConnections(); await new Promise(done=>server.close(done)) }
    if (child && child.exitCode===null) {const stopped=once(child,'exit'); child.kill(); await stopped}
    await rm(dir,{recursive:true,force:true,maxRetries:5,retryDelay:250})
  }
})

async function activateLoadedFixtureTab(profile,pages) {
  // At startup the native title can already name the first page while Edge
  // is still opening the second tab. Establish the foreground tab through
  // this fixture's private browser before asking the production UIA layer.
  const signal=AbortSignal.timeout(15000)
  const [active]=pages
  while (!signal.aborted) {
    const file=await readFile(join(profile,'DevToolsActivePort'),'utf8').catch(error=>{
      if (error.code!=='ENOENT') throw error
      return ''
    })
    const port=file.split(/\r?\n/,1)[0]
    if (/^\d+$/.test(port)) {
      const endpoint='http://127.0.0.1:'+port
      const response=await fetch(endpoint+'/json/list',{signal})
      assert.equal(response.ok,true,'Could not list the fixture tabs')
      const tabs=await response.json()
      const matching=pages.map(page=>tabs.find(tab=>tab.type==='page' &&
        tab.title===page.name && tab.url===pathToFileURL(page.html).href))
      if (matching.every(Boolean)) {
        const selected=await fetch(endpoint+'/json/activate/'+matching[0].id,{signal})
        assert.equal(selected.ok,true,'Could not activate '+active.name)
        // Initialize the selected renderer's accessibility tree. A newly
        // opened Edge window can paint its page before it exposes that page
        // to Windows UI Automation. All preview assertions still use UIA.
        const socket=new WebSocket(matching[0].webSocketDebuggerUrl)
        try {
          await once(socket,'open',{signal})
          const response=once(socket,'message',{signal})
          socket.send(JSON.stringify({id:1,method:'Accessibility.getFullAXTree'}))
          const [event]=await response
          const tree=JSON.parse(event.data).result?.nodes ?? []
          assert.ok(tree.some(node=>node.name?.value===active.marker),'Fixture document is not accessible yet')
        } finally { socket.close() }
        return
      }
    }
    await delay(100,undefined,{signal})
  }
  throw Error('Both fixture pages must finish opening before preview')
}

test('browser preview returns only the active document in a real two-tab Edge window', {
  skip:process.platform!=='win32' || process.env.LUMA_TEST_WINDOWS_UI!=='1', timeout:90000
},async t=>{
  const edge=join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)','Microsoft/Edge/Application/msedge.exe')
  try { await access(edge) } catch { return t.skip('Edge is not installed') }
  const dir=await mkdtemp(join(tmpdir(),'luma-preview-edge-')), title='LumaWeb-'+randomUUID()
  let browser
  try {
    await prepareStudioDesktop(dir)
    const pages=['Alpha','Beta'].map(suffix=>({html:join(dir,suffix+'-only.html'),name:title+'-'+suffix,marker:'校对目录 '+suffix+' '+randomUUID().slice(0,8)}))
    for (const page of pages) await writeFile(page.html,'<!doctype html><meta charset="utf-8"><title>'+page.name+'</title><main><h1>'+page.marker+
      '</h1><button>Read page</button><input type="password" aria-label="Protected example" value="fixture-hidden-value"></main>')
    const profile=join(dir,'browser-profile')
    browser=spawn(edge,['--user-data-dir='+profile,'--remote-debugging-port=0','--no-first-run','--no-default-browser-check',
      '--disable-sync','--disable-background-networking','--enable-features=UiaProvider',
      '--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows',
      '--force-renderer-accessibility=complete','--window-size=500,340',
      '--new-window',...pages.map(page=>pathToFileURL(page.html).href)],{windowsHide:false,stdio:'ignore'})
    await activateLoadedFixtureTab(profile,pages)
    const [active,background]=pages
    const desktop=createStudioDesktop(join(dir,'agent-desktop/agent-desktop.exe'))
    let picked,preview
    for (let i=0;i<40 && !picked;i++) {
      picked=(await desktop.targets()).find(row=>row.browser && row.title.includes(active.name))
      if (!picked) await delay(350)
    }
    assert.ok(picked,'Owned browser window was not discovered')
    await desktop.run(picked.id,[],async messages=>{
      const rows=JSON.parse(messages.at(-1).content).desktop.lastObservation
      assert.ok(rows.some(row=>row.name.includes(background.name)),'The target window must contain the other tab in its browser shell')
      return JSON.stringify({action:'finish',result:'确认后台标签存在'})
    },AbortSignal.timeout(15000))
    for (let i=0;i<4;i++) {
      preview=await desktop.preview(picked.id,'browser')
      if (preview.content.some(row=>row.name===active.marker)) break
      await delay(1000)
    }
    assert.ok(preview.image.dataUrl.startsWith('data:image/png;base64,'))
    assert.ok(preview.browser)
    assert.ok(preview.content.some(row=>row.name===active.marker))
    assert.ok(preview.content.some(row=>row.name==='Read page'))
    const pending=await desktop.runWithReceipt(picked.id,[],async messages=>{
      const rows=JSON.parse(messages.at(-1).content).desktop.lastObservation
      const control=rows.find(row=>row.name==='Read page' && row.ref)
      assert.ok(control,'Expected a real browser-document button')
      return JSON.stringify({action:'click',ref:control.ref})
    },AbortSignal.timeout(18000))
    assert.equal(pending.receipt.status,'unconfirmed');assert.equal(pending.receipt.clickCount,0)
    assert.match(pending.result,/待确认/)
    const text=JSON.stringify(preview.content)
    assert.ok(!text.includes(background.name) && !text.includes(background.marker))
    assert.doesNotMatch(text,/Alpha-only\.html|Beta-only\.html|fixture-hidden-value|最小化|最大化/)
    assert.ok(preview.content.every(row=>!['window','tab','menuitem','toolbar'].includes(row.role)))
  } finally {
    if (browser && browser.exitCode===null) {const exited=once(browser,'exit');browser.kill();await exited}
    await rm(dir,{recursive:true,force:true,maxRetries:8,retryDelay:300})
  }
})

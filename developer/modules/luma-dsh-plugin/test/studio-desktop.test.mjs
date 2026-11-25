import test from 'node:test'
import assert from 'node:assert/strict'
import { access } from 'node:fs/promises'
import { createStudioDesktop, DesktopReceiptError } from '../src/host/studio-desktop.ts'

function driver() {
  const windows=['1','2'].map(id=>({id:'w-'+id,pid:73,process_instance:'probe-1',app_name:'probe.exe',
    title:'Probe '+id,accessible:true,visible:true,minimized:false}))
  const calls=[], homes=new Set()
  let round=0
  const studio=createStudioDesktop('fake',async(args,home,signal,input)=>{
    signal.throwIfAborted()
    homes.add(home)
    calls.push({args,input})
    if (args[0]==='list-windows') return windows
    if (args[0]==='snapshot') return {window:{id:args[args.indexOf('--window-id')+1]},tree:{role:'window',name:'Test',children:[
      {role:'textfield',name:'Draft',ref_id:'@s'+(++round)+':e2',available_actions:['SetValue']},
      {role:'password',name:'never-expose',value:'never-expose'},
    ]}}
    return {}
  })
  return {studio,windows,calls,homes}
}
const finish=async()=>JSON.stringify({action:'finish',result:'已读'})

function receiptWindow({failClick=false,existing=false,sample='BLUE-AB12',ordinaryResult=false}={}){
  const window={id:'w-22',pid:43,process_instance:'receipt-instance',title:'Owned test',app_name:'fixture.exe',accessible:true,visible:true}
  let input='',count=0,round=0
  const applied=[]
  const desktop=createStudioDesktop('fixture',async(args,home,signal,value)=>{
    if(args[0]==='list-windows')return [window]
    if(args[0]==='snapshot'){
      const prefix='@o'+(++round)
      return {window,tree:{role:'window',children:[
        {role:'edit',name:'Draft',value:input,ref_id:prefix+':e1'},
        {role:'button',name:'Apply',ref_id:prefix+':e2'},
        ordinaryResult ? {role:'edit',name:'提交结果',value:count?'编辑部已收件，等下一轮分派':'未提交',states:['read_only']}
          : {role:'statictext',name:count || existing?'Verified BLUE-AB12 / SIGN-C10C447BB230':'Pending'},
        {role:'status',name:'mail',value:'user@example.com'},
        {role:'statictext',name:'Secret token',value:'must not enter receipt'},
        {role:'statictext',name:'Unrelated content: do not share'},
      ]}}
    }
    if(args[0]==='click' && failClick)throw Error('Delivery unclear')
    applied.push(args[0]);if(args[0]==='set-value')input=value;else count++
  })
  const user=[{role:'user',content:'Put '+sample+' in Draft and press Apply.'}]
  const decide=async messages=>{
    const {actions,lastObservation}=JSON.parse(messages.at(-1).content).desktop
    const find=name=>lastObservation.find(row=>row.name===name)
    if(!actions.length)return JSON.stringify({action:'set-value',ref:find('Draft').ref,text:sample})
    if(actions.length===1)return JSON.stringify({action:'click',ref:find('Apply').ref})
    const id=lastObservation.find(row=>ordinaryResult ? row.name==='提交结果':row.name.startsWith('Verified ')).readbackId
    return JSON.stringify({action:'finish',result:'model claims the wrong SIGN-DEADBEEF',readbackRefs:id?[id]:[]})
  }
  return {desktop,user,decide,applied}
}
test('receipts credit delivered actions and only new, bounded UI readbacks from the actual granted window',async()=>{
  const {desktop,user,decide}=receiptWindow()
  const [target]=await desktop.targets()
  const {result,receipt}=await desktop.runWithReceipt(target.id,user,decide,AbortSignal.timeout(12000))
  assert.match(result,/DEADBEEF/)
  assert.deepEqual(receipt.readbacks,[{control:'结果',text:'Verified BLUE-AB12 / SIGN-C10C447BB230'}])
  assert.equal(receipt.targetId,target.id);assert.equal(receipt.windowId,'w-22');assert.equal(receipt.title,'Owned test')
  assert.equal(receipt.clickCount,1);assert.equal(receipt.status,'observed')
  assert.deepEqual(receipt.actions.map(({action,control,input})=>[action,control,input]),[['set-value','Draft','BLUE-AB12'],['click','Apply',undefined]])
  assert.ok(receipt.observedAt>=receipt.actions[1].at)
  assert.doesNotMatch(JSON.stringify(receipt),/DEADBEEF|example.com|do not share|must not enter/)
})
test('a pre-existing status is never credited to this run; a failed click cannot become a successful action',async()=>{
  const old=receiptWindow({existing:true})
  const [target]=await old.desktop.targets()
  const stale=await old.desktop.runWithReceipt(target.id,old.user,old.decide,AbortSignal.timeout(12000))
  assert.equal(stale.receipt.status,'unconfirmed');assert.deepEqual(stale.receipt.readbacks,[])
  const interrupted=receiptWindow({failClick:true})
  await assert.rejects(interrupted.desktop.runWithReceipt(target.id,interrupted.user,interrupted.decide,AbortSignal.timeout(12000)),err=>{
    assert.ok(err instanceof DesktopReceiptError)
    assert.equal(err.receipt.status,'failed');assert.equal(err.receipt.clickCount,0);assert.deepEqual(err.receipt.actions.map(a=>a.action),['set-value'])
    assert.equal(err.receipt.uncertainAction.action,'click');assert.deepEqual(err.receipt.readbacks,[]);return true
  })
})
test('short everyday inputs belong to the current request and named read-only results do not require a special text format',async()=>{
  const owned=receiptWindow({sample:'五月校样',ordinaryResult:true})
  const [target]=await owned.desktop.targets()
  const first=await owned.desktop.runWithReceipt(target.id,owned.user,owned.decide,AbortSignal.timeout(12000))
  assert.equal(first.receipt.actions[0].input,'五月校样')
  assert.deepEqual(first.receipt.readbacks,[{control:'提交结果',text:'编辑部已收件，等下一轮分派'}])
  const privateHistory=receiptWindow({sample:'PERSONAL-PRIOR77',ordinaryResult:true})
  const current=[{role:'user',content:'旧的私聊资料：PERSONAL-PRIOR77'},{role:'user',content:'查看编辑部是否已经收件。'}]
  const second=await privateHistory.desktop.runWithReceipt(target.id,current,privateHistory.decide,AbortSignal.timeout(12000))
  assert.equal(second.receipt.actions[0].input,undefined)
  assert.equal(second.receipt.actions[0].inputSha256,undefined)
  assert.doesNotMatch(JSON.stringify(second.receipt),/PERSONAL-PRIOR77/)
})

test('one window is leased through model thinking, cancelled waiters leave no gaps, and the lease is released',async()=>{
  const {studio,homes}=driver()
  const [target]=await studio.targets()
  let unblock,hasEntered
  const blocked=new Promise(resolve=>{unblock=resolve})
  const entered=new Promise(resolve=>{hasEntered=resolve})
  const active=studio.run(target.id,[],async()=>{hasEntered();await blocked;return finish()},AbortSignal.timeout(10000))
  await entered
  let calls=0
  const cancel=new AbortController()
  const failed=studio.run(target.id,[],async()=>{calls++;return finish()},cancel.signal)
  const third=studio.run(target.id,[],async()=>{calls++;return finish()},AbortSignal.timeout(10000))
  cancel.abort()
  await assert.rejects(failed,/abort/i)
  assert.equal(calls,0)
  unblock()
  await Promise.all([active,third])
  assert.equal(calls,1)
  for (const home of homes) await assert.rejects(access(home),{code:'ENOENT'})
})

test('two windows think concurrently, share one mutation lane and never credit an unverified field',async()=>{
  const windows=['w-71','w-72'].map(id=>({id,pid:73,process_instance:'shared-desktop',title:id,
    app_name:'fixture.exe',accessible:true,visible:true}))
  const values=new Map(),windowHomes=new Map()
  let writing=0,peak=0,arrived=0,release
  const barrier=new Promise(done=>{release=done})
  const desk=createStudioDesktop('fixture',async(args,home,signal,text)=>{
    if(args[0]==='list-windows')return windows
    if(args[0]==='snapshot'){
      const id=args[args.indexOf('--window-id')+1]
      windowHomes.set(home,id)
      return {window:{id},tree:{role:'window',children:[{role:'textfield',name:'Draft',value:values.get(id),ref_id:'@s:e1'}]}}
    }
    if(args[0]==='set-value'){
      peak=Math.max(peak,++writing)
      await new Promise(done=>setTimeout(done,25))
      values.set(windowHomes.get(home),windowHomes.get(home)==='w-72'?'wrong field value':text)
      writing--
    }
  })
  const targets=await desk.targets()
  const results=await Promise.allSettled(targets.map(target=>desk.runWithReceipt(target.id,[],async messages=>{
    const {actions}=JSON.parse(messages.at(-1).content).desktop
    if(actions.length)return finish()
    if(++arrived===2)release()
    await barrier
    return JSON.stringify({action:'set-value',ref:'@s:e1',text:target.title})
  },AbortSignal.timeout(9000))))
  assert.equal(peak,1)
  assert.equal(results[0].status,'fulfilled');assert.equal(results[0].value.receipt.actions.length,1)
  assert.equal(results[1].status,'rejected');assert.match(results[1].reason.message,/核实填写值/)
  assert.deepEqual(results[1].reason.receipt.actions,[]);assert.equal(results[1].reason.receipt.uncertainAction.action,'set-value')
})

test('a recycled process ID invalidates the selection before observations reach a model',async()=>{
  const {studio,windows,calls}=driver()
  const [target]=await studio.targets()
  windows[0].process_instance='probe-restarted'
  await assert.rejects(studio.run(target.id,[],async()=>assert.fail(),AbortSignal.timeout(10000)),/重新选择/)
  assert.ok(calls.every(call=>call.args[0]==='list-windows'))
})

test('refs must come from the current read and global input is unavailable',async()=>{
  const {studio,calls}=driver()
  const [target]=await studio.targets()
  for (const action of [{action:'click',ref:'@foreign:e2'},{action:'press',ref:'@s1:e2'}]) {
    await assert.rejects(studio.run(target.id,[],async messages=>{
      assert.ok(!messages.at(-1).content.includes('never-expose'))
      return JSON.stringify(action)
    },AbortSignal.timeout(10000)),/当前窗口之外/)
  }
  assert.ok(calls.every(call=>['snapshot','list-windows'].includes(call.args[0])))
})

test('an already verified value is never rewritten and a repeated click needs an outstanding goal',async()=>{
  const window={id:'w-7',pid:35,process_instance:'stable',title:'Draft',app_name:'probe.exe',accessible:true,visible:true}
  const actual=[]
  let round=0
  const desktop=createStudioDesktop('fixture',async args=>{
    if (args[0]==='list-windows') return [window]
    if (args[0]==='snapshot') return {window,tree:{role:'window',children:[
      {role:'textfield',name:'Draft',value:'correct',ref_id:'@s'+(++round)+':e1'},
      {role:'button',name:'Apply',ref_id:'@s'+round+':e2'},
    ]}}
    actual.push(args[0])
    return {}
  })
  const [target]=await desktop.targets()
  const result=await desktop.run(target.id,[],async messages=>{
    const {lastObservation,actions}=JSON.parse(messages.at(-1).content).desktop
    const ref=lastObservation.find(row=>row.name==='Apply').ref
    if (!actions.length) return JSON.stringify({action:'click',ref})
    if (actions.length===1) return JSON.stringify({action:'set-value',ref:lastObservation.find(row=>row.name==='Draft').ref,text:'correct'})
    if (actions.length===2) return JSON.stringify({action:'click',ref})
    if (actions.length===3) {
      assert.match(actions.at(-1),/先前已点击/)
      return JSON.stringify({action:'click',ref,repeatReason:'用户要求计数两次，还需要一次。'})
    }
    return finish()
  },AbortSignal.timeout(10000))
  assert.equal(result,'已读')
  assert.deepEqual(actual,['click','click'])
})

test('browser previews with missing or ambiguous page documents return no shell content',async()=>{
  const window={id:'w-9',pid:52,process_instance:'browser-fixture',title:'Current',app_name:'msedge.exe',accessible:true,visible:true}
  const tree={role:'window',children:[
    {role:'toolbar',children:[{role:'textfield',name:'Address',value:'address-bar-sentinel'}, {role:'document',name:'shell-document'}]},
    {role:'tablist',children:[{role:'tab',name:'other-tab-sentinel'}]},
    {role:'group',states:['hidden'],children:[{role:'document',name:'hidden-document'}]},
  ]}
  const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='
  const desktop=createStudioDesktop('fixture',async args=>{
    if (args[0]==='list-windows') return [window]
    if (args[0]==='screenshot') return {format:'png',width:1,height:1,data:png}
    if (args[0]==='snapshot') return {window,tree}
  })
  const [target]=await desktop.targets()
  assert.deepEqual((await desktop.preview(target.id,'browser')).content,[])
  tree.children.push({role:'document',name:'Side pane'},{role:'webarea',name:'Other pane'})
  assert.deepEqual((await desktop.preview(target.id,'browser')).content,[])
})

import assert from 'node:assert/strict'
import test from 'node:test'
import { once } from 'node:events'
import { mkdtemp } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as wait } from 'node:timers/promises'
import { createStudioDesktop } from '../src/host/studio-desktop.ts'
import { createAgentWork } from '../src/host/agent-work.ts'

test('one private read-window task grounds its reply in the selected document, with zero input operations and no reusable memory',async t=>{
  const inbox={id:'w-A1',pid:16,process_instance:'mail-process',app_name:'msedge.exe',title:'收件箱',accessible:true,visible:true,minimized:false}
  const calls=[]
  const desktop=createStudioDesktop('fake',async(args)=>{
    calls.push(args)
    if(args[0]==='list-windows')return [inbox,{...inbox,id:'w-B2',title:'Private window'}]
    assert.equal(args[0],'snapshot')
    assert.equal(args[args.indexOf('--window-id')+1],inbox.id)
    return {window:{id:inbox.id},tree:{role:'window',children:[
      {role:'toolbar',name:'private address bar'},{role:'document',name:'收件箱',value:'private url',children:[
        {role:'text',name:'Unread: budget approval due Friday',ref_id:'@a:e1',available_actions:['click']},
        {role:'text',name:'private offscreen',states:['offscreen']},{role:'password',value:'private password'},
      ]},
    ]}}
  })
  const [target]=await desktop.targets()
  const messages=[]
  const api=createServer(async(req,res)=>{
    let data='';for await(const chunk of req)data+=chunk
    messages.push(JSON.parse(data).messages)
    res.writeHead(200,{'content-type':'application/json'})
    res.end(JSON.stringify({choices:[{message:{content:'预算审批周五截止。'}}]}))
  }).listen(0,'127.0.0.1')
  await once(api,'listening')
  const root=await mkdtemp(join(tmpdir(),'luma-mail-test-'))
  const desk=createAgentWork(root,undefined,undefined,undefined,false,undefined,undefined,desktop)
  t.after(()=>{desk.dispose();api.close()})
  await desk.call('configure',{roleId:'shan',baseUrl:'http://127.0.0.1:'+api.address().port+'/v1',model:'secretary',apiKey:'TEST'})
  const request={requestId:'summary',mode:'task',roleIds:['shan'],text:'整理紧急邮件',topic:'desk-test',readWindow:{id:target.id,title:target.title}}
  await assert.rejects(desk.call('run',request),/只读/)
  await assert.rejects(desk.call('readwindowtask',{...request,mode:'team',roleIds:['shan','lu-mi']}),/单人/)
  await assert.rejects(desk.call('readwindowtask',{...request,desktopTargets:{shan:target.id}}),/只读/)
  await desk.call('readwindowtask',request)
  let state
  for(let i=0;i<150;i++){
    state=await desk.call('state',{})
    if(state.jobs[0]?.status==='done')break
    await wait(40)
  }
  assert.equal(state.jobs[0]?.steps[0].output,'预算审批周五截止。')
  assert.equal(state.memories.shan,0)
  assert.equal(messages.length,1)
  assert.match(JSON.stringify(messages),/Unread: budget/)
  assert.doesNotMatch(JSON.stringify(messages),/private (window|address|url|offscreen|password)|@a:e1|available_actions/i)
  assert.equal(calls.filter(args=>args[0]==='snapshot').length,1)
  await desk.call('readwindowtask',request)
  await assert.rejects(desk.call('readwindowtask',{...request,readWindow:{...request.readWindow,title:'New tab'}}),/请求编号/)
  await assert.rejects(desktop.readWindow({...request.readWindow,title:'New tab'},AbortSignal.timeout(5000)),/标题已变化/)
  assert.equal(calls.filter(args=>args[0]==='snapshot').length,1)
})

import test from 'node:test'
import assert from 'node:assert/strict'
import {createServer} from 'node:http'
import {once} from 'node:events'
import {mkdtemp, readdir, rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {setTimeout as wait} from 'node:timers/promises'
import {createAgentWork} from '../src/host/agent-work.ts'
import {DatabaseSync} from 'node:sqlite'
import {deliverableFolder} from '../src/host/job-deletion.ts'
import {precedingRoomSpeakers,roomChatPlan} from '../src/client/room-speakers.ts'
import {repeatedRoomChat} from '../src/host/room-chat-repeat.ts'
import {defaultContactProfile} from '../src/shared/contact-profile.ts'

async function listen(t,handler) {
  const server=createServer(handler).listen(0,'127.0.0.1')
  await once(server,'listening')
  t.after(()=>{server.closeAllConnections();server.close()})
  return 'http://127.0.0.1:'+server.address().port
}
async function until(get) {
  for (let i=0;i<200;i++) {
    const result=await get()
    if (result) return result
    await wait(15)
  }
  assert.fail('No expected progress')
}

test('a room greeting rotates speakers, a follow-up stays with its speaker and a roll call reaches everyone',()=>{
  const ids=['shan','lu-mi','grok'], names={shan:['嫣姐','端木嫣'],'lu-mi':['陆弥'],grok:['克劳德']}
  const pick=(text,available=ids,preceding=['shan'])=>{
    const plan=roomChatPlan(text,ids,names,available,preceding)
    return plan.ids.slice(0,plan.required ?? plan.ids.length)
  }
  assert.deepEqual(pick('hello，大家好'),['lu-mi'])
  assert.deepEqual(pick('为什么这么说？'),['shan'])
  assert.deepEqual(pick('大家都说说'),ids)
  assert.deepEqual(pick('陆弥和嫣姐，你们看到了吗？'),['lu-mi','shan'])
  assert.deepEqual(pick('@端木嫣 你呢？'),['shan'])
  assert.deepEqual(pick('克劳德你觉得呢'),['grok'])
  assert.deepEqual(pick('麻烦克劳德看看'),['grok'])
  assert.deepEqual(pick('克劳德的想法不错'),['lu-mi'])
  assert.deepEqual(pick('今天忙吗？',['grok']),['grok'])
  assert.deepEqual(pick('@陆弥 你呢？',['grok']),['lu-mi'])
  assert.deepEqual(pick('我们来分配岗位，你们自己告诉我，你们适合做什么岗位'),ids)
  assert.deepEqual(pick('其他人呢',ids,['grok','shan']),['lu-mi'])
  const job=(text,speakers)=>({text,steps:speakers.map(roleId=>({roleId,status:'done',output:'我的想法'}))})
  const participated=precedingRoomSpeakers([job('我们都说说',['shan']),job('其他人呢',['lu-mi','grok']),job('其他人呢',[])])
  assert.deepEqual(roomChatPlan('其他人呢',ids,names,ids,participated),{ids,required:0})
  assert.deepEqual(roomChatPlan('先到这里吧',ids,names,ids,['lu-mi']),{ids:['lu-mi']})
})

test('open room conversations pass the floor, accept a voluntary reply, answer a named question, and stop without replay',async t=>{
  const root=await mkdtemp(join(tmpdir(),'luma-room-floor-'))
  const desk=createAgentWork(root),calls=[]
  let release, releaseWork, hold=false
  t.after(async()=>{release?.();releaseWork?.();desk.dispose();await rm(root,{recursive:true,force:true})})
  const endpoint=await listen(t,async(req,res)=>{
    let raw='';for await(const chunk of req)raw+=chunk
    const {model,messages}=JSON.parse(raw)
    const task=messages.at(-1).content
    const prompt=messages[0].content
    calls.push({model,task,prompt,data:messages[1].content})
    const invited=prompt.includes('这是一次可选的接话机会')
    if(task==='HOLD-WORK')await new Promise(resolve=>{releaseWork=resolve})
    if(invited && task==='模型离线'){res.writeHead(502);res.end();return}
    if(hold && invited) await new Promise(resolve=>{release=resolve})
    let answer='我在想封面该留多少空白。'
    if(task==='查旧稿')answer='WORK-ONLY-窗口手动确认，台账已经补记。'
    if(task.includes('分配岗位'))answer=model+'选自己最擅长的岗位。'
    if(invited)answer=task==='聊聊封面'?'LUMA_SAY\n下面留一行题记会更稳。端木嫣，你觉得呢？':'LUMA_PASS'
    if(prompt.includes('刚在群里问到你'))answer='留一行刚好，先到这里吧。'
    res.setHeader('content-type','application/json')
    res.end(JSON.stringify({choices:[{message:{content:answer}}]}))
  })
  const ids=['shan','lu-mi','grok']
  for(const roleId of ids)await desk.call('configure',{roleId,model:roleId,baseUrl:endpoint})
  const room=await desk.call('createroom',{requestId:'room',name:'讨论',roleIds:ids,duties:{grok:'预算核算'}})
  const send=(id,text,required=1)=>desk.call('run',{requestId:id,text,mode:'chat',roomRequired:required,roleIds:ids,topic:room.id})
  const completed=id=>until(async()=>{const j=(await desk.call('state',{})).jobs.find(j=>j.id===id);return j?.status==='done' && j})
  await send('budget','预算核算有什么诀窍？')
  assert.equal((await completed('budget')).steps[0].roleId,'grok')
  await desk.call('run',{requestId:'work',text:'查旧稿',mode:'task',roleIds:['shan'],topic:room.id})
  await completed('work')
  const jobsQuery='我们来分配岗位，你们自己告诉我，你们适合做什么岗位'
  await send('jobs',jobsQuery,3)
  assert.deepEqual((await completed('jobs')).steps.map(s=>s.roleId),ids)
  assert.ok(calls.filter(c=>c.task===jobsQuery).every(c=>!c.data.includes('WORK-ONLY')))
  await send('others','其他人呢',0)
  assert.deepEqual((await completed('others')).steps,[])
  assert.equal(calls.filter(c=>c.task==='其他人呢').length,0)
  await send('design','聊聊封面')
  const design=await completed('design')
  assert.deepEqual(design.steps.map(s=>s.roleId),['shan','lu-mi','shan'])
  assert.ok(design.steps[1].output.startsWith('下面留一行'))
  assert.match(calls.filter(c=>c.task==='聊聊封面')[2].data,/留一行题记/)
  assert.ok(!JSON.stringify(design).includes('LUMA_SAY'))
  await send('quiet','早上好')
  assert.deepEqual((await completed('quiet')).steps.map(s=>s.output),['我在想封面该留多少空白。',''])
  assert.equal((await send('quiet','早上好')).status,'done')
  assert.equal(calls.filter(c=>c.task==='早上好').length,2)
  await assert.rejects(send('quiet','早上好',2),/编号/)
  await desk.call('run',{requestId:'busy-worker',text:'HOLD-WORK',mode:'task',roleIds:['lu-mi'],topic:'own-project'})
  await until(()=>releaseWork)
  await send('busy-skip','看看新消息')
  assert.deepEqual((await completed('busy-skip')).steps.map(s=>s.roleId),['shan','grok'])
  releaseWork()
  await completed('busy-worker')
  await send('offline-peer','模型离线')
  const offline=await completed('offline-peer')
  assert.deepEqual(offline.steps.map(s=>s.status),['done','failed'])
  assert.match(offline.error,/可选接话/)
  hold=true
  await send('cancelled','午饭有什么打算')
  await until(()=>release)
  await assert.rejects(send('collision','又一个问题'),/上一条消息/)
  await desk.call('cancel',{id:'cancelled'})
  release()
  const stopped=await send('cancelled','午饭有什么打算')
  assert.equal(stopped.status,'cancelled')
  assert.deepEqual(stopped.steps.map(s=>s.status),['done','cancelled'])
  assert.equal(calls.filter(c=>c.task==='午饭有什么打算').length,2)
})

test('public chat sends one attributable turn per selected speaker and no deliverable or private memory',async t=>{
  const root=await mkdtemp(join(tmpdir(),'luma-room-chat-'))
  const desk=createAgentWork(root)
  t.after(async()=>{desk.dispose();await rm(root,{recursive:true,force:true})})
  const long='完整原文。'.repeat(1200)
  const calls=[]
  const endpoint=await listen(t,async(req,res)=>{
    let raw=''
    for await(const chunk of req) raw+=chunk
    const input=JSON.parse(raw)
    calls.push(input)
    res.setHeader('content-type','application/json')
    res.end(JSON.stringify({choices:[{message:{content:input.model==='shan'?'我这边是晴天。':long}}]}))
  })
  const ids=['shan','lu-mi']
  for(const roleId of ids) await desk.call('configure',{roleId,model:roleId,baseUrl:endpoint})
  const room=await desk.call('createroom',{requestId:'existing',name:'海岸',roleIds:ids,workflow:'studio'})
  const request={requestId:'both',mode:'chat',roleIds:ids,text:'你们各自说说？',topic:room.id}
  await assert.rejects(desk.call('run',{...request,topic:'private'}),/组合/)
  await desk.call('remember',{roleId:'lu-mi',text:'PRIVATE-MARKER'})
  await desk.call('run',request)
  const done=await until(async()=>{const job=(await desk.call('state',{})).jobs[0];return job?.status==='done' && job})
  assert.deepEqual(done.steps.map(s=>[s.roleId,s.phase,s.output]),[['shan',undefined,'我这边是晴天。'],['lu-mi',undefined,long]])
  assert.deepEqual(calls.map(c=>c.model),ids)
  assert.match(calls[1].messages[1].content,/我这边是晴天/)
  assert.doesNotMatch(JSON.stringify(calls),/PRIVATE-MARKER|并行子任务/)
  assert.equal((await desk.call('run',request)).status,'done')
  await assert.rejects(readdir(deliverableFolder(root,'both')),/ENOENT/)
  await desk.call('archiverecord',{kind:'job',roomId:room.id,id:'both'})
  await desk.call('run',{...request,requestId:'after-archive',roleIds:['shan'],text:'后来呢？'})
  await until(async()=>(await desk.call('state',{})).jobs.find(job=>job.id==='after-archive')?.status==='done')
  assert.doesNotMatch(calls.at(-1).messages[1].content,/我这边是晴天|你们各自说说/)
})

const chatEcho='我刚刚回头看了一眼群里那份安排，目前手上这页还差一张图，等对方把图发过来我再一起核对。'
test('whole-message chat repetition keeps short agreement, new positions, quoted or structured answers',()=>{
  const repeated=(answer,task='觉得呢？')=>repeatedRoomChat(answer,task,[chatEcho])
  assert.ok(repeated(chatEcho.slice(0,-1)+'！','别重复前面的内容'))
  assert.ok(!repeated(chatEcho+'另外，我选后一版。'))
  assert.ok(!repeated(chatEcho.replace('还差','不差')))
  assert.ok(!repeated(chatEcho.slice(0,-1)+'？'))
  assert.ok(!repeated(chatEcho,'把刚才那段原样再说一遍'))
  for(const value of ['我也这么想。',chatEcho+'总数为 10。','\x60'+chatEcho+'\x60','“'+chatEcho+'”'])
    assert.equal(repeatedRoomChat(value,'你呢？',[value]),false)
})

test('a provider repeating its full room reply produces one public message without extra calls or files',async t=>{
  const root=await mkdtemp(join(tmpdir(),'luma-room-echo-'))
  const desk=createAgentWork(root)
  t.after(async()=>{desk.dispose();await rm(root,{recursive:true,force:true})})
  let requests=0
  const endpoint=await listen(t,async(req,res)=>{
    for await(const _ of req){}
    requests++
    res.setHeader('content-type','application/json')
    res.end(JSON.stringify({choices:[{message:{content:chatEcho}}]}))
  })
  const ids=['shan','lu-mi']
  for(const roleId of ids) await desk.call('configure',{roleId,model:'same-provider',baseUrl:endpoint})
  const room=await desk.call('createroom',{requestId:'echo',name:'校对组',roleIds:ids})
  async function send(id,text,roleIds) {
    await desk.call('run',{requestId:id,text,roleIds,mode:'chat',topic:room.id})
    return until(async()=>{const j=(await desk.call('state',{})).jobs.find(j=>j.id===id);return j?.status==='done' && j})
  }
  const first=await send('both','大家都说说自己的想法',ids)
  assert.deepEqual(first.steps.map(s=>s.output),[chatEcho,''])
  const next=await send('again','还有要补充的吗？',[ids[0]])
  assert.equal(next.steps[0].output,'')
  const quote=await send('quote','请复述刚才那段话。',ids)
  assert.deepEqual(quote.steps.map(s=>s.output),[chatEcho,chatEcho])
  assert.equal(requests,5)
  await assert.rejects(readdir(deliverableFolder(root,'again')),/ENOENT/)
})

test('opening a legacy studio delivers the human reply and keeps protocol examples in ordinary tasks intact',async t=>{
  const root=await mkdtemp(join(tmpdir(),'luma-studio-history-'))
  createAgentWork(root).dispose()
  const db=new DatabaseSync(join(root,'employees.sqlite3'))
  const output='已经复核。\nLUMA_HANDOFF {"to":"shan"}'
  const step={roleId:'shan',status:'done',output,model:'example'}
  const job={id:'group',mode:'team',roleIds:['shan','lu-mi'],topic:'group',createdAt:1,status:'done',text:'复核'}
  const insert=db.prepare('INSERT INTO jobs VALUES(?,?)')
  insert.run('group',JSON.stringify({...job,workflow:'studio',steps:[{...step,phase:'assist'}]}))
  insert.run('solo',JSON.stringify({...job,id:'solo',mode:'task',roleIds:['shan'],steps:[step]}))
  db.close()
  const desk=createAgentWork(root)
  t.after(async()=>{desk.dispose();await rm(root,{recursive:true,force:true})})
  const {jobs}=await desk.call('state',{})
  assert.equal(jobs.find(j=>j.id==='group').steps[0].output,'已经复核。')
  assert.equal(jobs.find(j=>j.id==='solo').steps[0].output,output)
})

test('a studio dispatches concurrent role-bound workers, routes peer requests, reviews published work and forgets the original job',async t=>{
  const root=await mkdtemp(join(tmpdir(),'luma-studio-test-'))
  const calls=[], windows=[], charges=[]
  let release
  const barrier=new Promise(resolve=>{release=resolve})
  const endpoint=await listen(t,async(req,res)=>{
    let raw=''
    for await(const chunk of req) raw+=chunk
    const {messages,model}=JSON.parse(raw)
    const system=messages[0].content
    const phase=system.includes('你在执行自己的并行子任务')?'work':system.includes('点名向你协查')?'assist':system.includes('逐一核对成员')?'review':system.includes('按成员标识')?'plan':'solo'
    calls.push({model,phase,messages})
    if (phase==='work') await barrier
    const output=phase==='work' && model==='shan'
      ? 'PUBLIC-SHAN\nLUMA_HANDOFF {"to":"lu-mi","task":"核对年份"}'
      : phase==='assist'?'PUBLIC-PEER-CHECK\nLUMA_HANDOFF {"to":"shan"}':phase+'-'+model
    res.setHeader('content-type','application/json')
    res.end(JSON.stringify({choices:[{message:{content:output}}],usage:{total_tokens:12}}))
  })
  const desktop={
    targets:async()=>[],status:async()=>({available:true}),
    async run(target,messages,model,signal,progress) {
      windows.push(target);progress('回读目标窗口')
      return model(messages,signal)
    },
  }
  const saved={shan:{name:'自定义协调人',personality:'role-A-precise',scenario:'档案馆',addressImpression:'称呼我为阿宁',greeting:'GREETING-ONLY'}}
  const {greeting, ...expectedLead} = saved.shan
  let desk=createAgentWork(root,undefined,undefined,undefined,false,undefined,(role,id)=>charges.push([role,id]),desktop,()=>saved)
  t.after(async()=>{release();desk.dispose();await rm(root,{recursive:true,force:true})})
  const base=await listen(t,(req,res)=>desk.handler(req,res))
  async function post(action,body={}) {
    const result=await fetch(base+'/luma-agents/'+action,{method:'POST',headers:{origin:base,'content-type':'application/json'},body:JSON.stringify(body)})
    const data=await result.json()
    if (!data.ok) throw Error(data.error)
    return data.value
  }
  for (const roleId of ['shan','lu-mi']) await post('configure',{roleId,model:roleId,baseUrl:endpoint})
  await post('remember',{roleId:'shan',text:'PRIVATE-SHAN-ONLY'})
  const room=await post('createroom',{name:'编辑工作室',workflow:'studio',roleIds:['shan','lu-mi'],requestId:'persistent',duties:{shan:'撰稿','lu-mi':'校订'}})
  const key='0'.repeat(64)
  const request={requestId:'round',topic:room.id,roleIds:room.roleIds,mode:'team',
    desktopTargets:{'lu-mi':key},text:'我喜欢用靛蓝色标题。整理这一版目录。'}
  await post('run',request)
  await until(()=>calls.filter(c=>c.phase==='work').length===2)
  const live=(await post('state')).jobs[0]
  assert.equal(live.status,'running')
  assert.deepEqual(live.steps.map(s=>s.status),['done','running','running','queued'])
  assert.equal(live.steps[2].activity,'回读目标窗口')
  assert.deepEqual(windows,[key])
  await post('run',{requestId:'private-chat',topic:'private-while-working',roleIds:['shan'],mode:'chat',text:'还记得我的备注吗'})
  const chat=await until(()=>calls.find(c=>c.phase==='solo'))
  assert.match(JSON.stringify(chat.messages),/PRIVATE-SHAN-ONLY/)
  assert.match(chat.messages[0].content,/role-A-precise/)
  assert.equal((await post('state')).jobs.find(j=>j.id==='round').status,'running')
  await assert.rejects(post('deletejob',{id:'round'}),/结束/)
  await assert.rejects(post('run',{...request,desktopTargets:{}}),/编号/)
  saved.shan.personality='在工作中途修改的下一轮设定'
  release()
  const done=await until(async()=>{const job=(await post('state')).jobs[0];return job.status==='done' && job})
  assert.deepEqual(done.steps.map(s=>[s.phase,s.roleId]),[['plan','shan'],['work','shan'],['work','lu-mi'],['assist','lu-mi'],['review','shan']])
  assert.equal(done.steps[1].handoff.to,'lu-mi')
  assert.equal(done.steps[1].output,'PUBLIC-SHAN')
  assert.equal(done.steps[3].output,'PUBLIC-PEER-CHECK')
  assert.equal(done.steps[3].handoff,undefined)
  assert.match(JSON.stringify(calls.find(c=>c.phase==='assist').messages),/核对年份/)
  for(const call of calls.filter(c=>c.phase!=='solo')) {
    assert.doesNotMatch(JSON.stringify(call.messages),/PRIVATE-SHAN-ONLY/)
    const mine=call.model==='shan'
    assert.deepEqual(JSON.parse(call.messages[0].content.split('角色设定：').at(-1)),mine?expectedLead:defaultContactProfile('lu-mi'))
    assert.doesNotMatch(call.messages[0].content,/GREETING-ONLY|工作中途修改/)
  }
  assert.match(JSON.stringify(calls.at(-1).messages),/PUBLIC-PEER-CHECK/)
  assert.equal(new Set(charges.map(entry=>JSON.stringify(entry))).size,6)
  assert.deepEqual(charges.filter(([,id])=>id.startsWith('job:')),[['shan','job:private-chat']])
  assert.equal((await readdir(deliverableFolder(root,'round'))).length,5)
  assert.equal((await post('run',request)).status,'done')
  await post('deletejob',{id:'round'})
  assert.deepEqual((await post('state')).jobs.map(j=>j.id),['private-chat'])
  await assert.rejects(readdir(deliverableFolder(root,'round')),/ENOENT/)
  await assert.rejects(post('run',request),/已删除/)
  desk.dispose()
  desk=createAgentWork(root)
  const portrait=await post('portrait',{roleId:'shan'})
  assert(portrait.items.some(item=>item.scope===room.id && item.text.includes('靛蓝色')))
  assert((await post('state')).rooms.some(item=>item.workflow==='studio'))
  assert.equal((await post('deletejob',{id:'round'})).deleted,true)
  await post('run',{requestId:'next',topic:room.id,roleIds:['shan'],mode:'task',text:'你知道我的标题偏好吗？'})
  await until(async()=> (await post('state')).jobs.find(j=>j.id==='next')?.status==='done')
  const latest=JSON.stringify(calls.at(-1).messages)
  assert.deepEqual(JSON.parse(calls.at(-1).messages[0].content.split('角色设定：').at(-1)),defaultContactProfile('shan'))
  assert.match(latest,/靛蓝色/)
  assert.doesNotMatch(latest,/整理这一版目录|PUBLIC-PEER-CHECK|PRIVATE-SHAN-ONLY/)
})

test('failed parallel work preserves successful contributions and skips synthesis',async t=>{
  const root=await mkdtemp(join(tmpdir(),'luma-studio-failure-')), seen=[]
  const desk=createAgentWork(root)
  t.after(async()=>{desk.dispose();await rm(root,{recursive:true,force:true})})
  const endpoint=await listen(t,async(req,res)=>{
    let text='';for await(const bytes of req)text+=bytes
    const input=JSON.parse(text)
    seen.push(input)
    if (input.model==='lu-mi') { res.writeHead(502);return res.end() }
    res.setHeader('content-type','application/json')
    res.end(JSON.stringify({choices:[{message:{content:'可保留的成果'}}]}))
  })
  const roleIds=['shan','lu-mi']
  for (const roleId of roleIds) await desk.call('configure',{roleId,model:roleId,baseUrl:endpoint})
  const room=await desk.call('createroom',{name:'测试组',workflow:'studio',roleIds,requestId:'test'})
  await desk.call('run',{requestId:'failed-turn',topic:room.id,roleIds,mode:'team',text:'分工'})
  const job=await until(async()=>{const j=(await desk.call('state',{})).jobs[0];return j.status==='failed' && j})
  assert.deepEqual(job.steps.map(s=>s.status),['done','done','failed','cancelled'])
  assert.equal(seen.length,3)
  assert.equal(job.steps[1].output,'可保留的成果')
})

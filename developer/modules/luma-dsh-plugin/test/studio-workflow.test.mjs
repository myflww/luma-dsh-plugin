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
import {OFFICE_CHARACTER_CARDS} from '../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/office-harness/OfficeCharacterCards.ts'

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
  const saved={shan:{name:'自定义协调人',personality:'role-A-precise',scenario:'档案馆',greeting:'GREETING-ONLY'}}
  const expectedLead={name:saved.shan.name,personality:saved.shan.personality,scenario:saved.shan.scenario}
  const fromCard=id=>{
    const {name,personality,scenario}=OFFICE_CHARACTER_CARDS[id].companionCard.data
    return {name,personality,scenario}
  }
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
    assert.deepEqual(JSON.parse(call.messages[0].content.split('角色设定：').at(-1)),mine?expectedLead:fromCard('lu-mi'))
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
  assert.deepEqual(JSON.parse(calls.at(-1).messages[0].content.split('角色设定：').at(-1)),fromCard('shan'))
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

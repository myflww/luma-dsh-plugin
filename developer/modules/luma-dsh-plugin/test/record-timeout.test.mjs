import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {setTimeout as sleep} from 'node:timers/promises'
import {createAgentWork} from '../src/host/agent-work.ts'

test('an unresponsive subscription releases the task record and a late answer stays unpublished',async t=>{
  const folder=await mkdtemp(join(tmpdir(),'luma-record-timeout-'))
  let finish
  const harness={models:async()=>[{id:'test',name:'test'}],request:()=>new Promise(ok=>{finish=ok})}
  const desk=createAgentWork(folder,undefined,undefined,undefined,false,undefined,undefined,undefined,undefined,harness)
  t.after(async()=>{desk.dispose();await rm(folder,{recursive:true,force:true})})
  const timeout=AbortSignal.timeout.bind(AbortSignal)
  t.mock.method(AbortSignal,'timeout',ms=>timeout(ms===180000?120:ms))
  const id='jingyuniang'
  await desk.call('configure',{roleId:id,source:'local',provider:'codex',model:'test'})
  const req={requestId:'stalled',topic:'new-topic',roleIds:[id],mode:'task',text:'核对页脚'}
  await desk.call('run',req)
  const current=async()=>(await desk.call('state',{})).jobs.find(j=>j.id===req.requestId)
  let job
  for(let i=0;i<100;i++){job=await current();if(job.status==='failed')break;await sleep(15)}
  assert.equal(job.status,'failed');assert.match(job.error,/超时/);assert.equal(typeof finish,'function')
  assert.deepEqual(job.steps[0].harnessTrace.map(e=>e.stage),['context'])
  finish('迟到的交付');await sleep(10)
  assert.equal((await current()).steps[0].output,'')
  assert.equal((await desk.call('deletejob',{id:req.requestId})).deleted,true)
})


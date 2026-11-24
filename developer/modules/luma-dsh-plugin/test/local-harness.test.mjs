import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,writeFile,rm,access} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {setTimeout as delay} from 'node:timers/promises'
import {createLocalHarness} from '../src/host/local-harness.ts'
import {harnessProcess,subscriptionEnvironment} from '../src/host/local-harness-process.ts'
import {createAgentWork} from '../src/host/agent-work.ts'

// CLI protocol fixture. Each request is a separate OS process, using the same
// stdin/stdout framing as the installed tools. It needs no personal login.
const fixture = `
import {createInterface} from 'node:readline'
const [provider,scenario,...args]=process.argv.slice(2)
const send=value=>console.log(JSON.stringify(value))
const lines=createInterface({input:process.stdin})
if(args[0]==='app-server') {
  for await(const line of lines){
    const msg=JSON.parse(line)
    if(msg.method==='initialized') continue
    let result={}
    if(msg.method==='account/read') result={account:{type:scenario==='apikey'?'apiKey':'chatgpt'}}
    if(msg.method==='model/list') result=msg.params.cursor
      ? {data:[{id:'writer-b',displayName:'Writer B',supportedReasoningEfforts:[]}],nextCursor:null}
      : {data:[{id:'writer',displayName:'Writer',supportedReasoningEfforts:[{reasoningEffort:'low'}],defaultReasoningEffort:'low'},{id:'hidden',hidden:true}],nextCursor:'page2'}
    send({id:msg.id,result})
  }
}else if(args[0]==='auth') send({loggedIn:true,authMethod:'claude.ai'})
else if(provider==='claude' && !args.includes('--model')){
  for await(const line of lines){const r=JSON.parse(line); send({type:'control_response',response:{request_id:r.request_id,response:{models:[{value:'opus',displayName:'Opus'}]}}})}
}else{
  let input=''; for await(const line of lines) input+=line
  if(scenario==='wait') await new Promise(r=>setTimeout(r,90000))
  if(process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY || args.some(a=>a.includes('PRIVATE-LUMA'))) process.exit(2)
  const reply=JSON.stringify({cwd:process.cwd(),input,flags:args})
  if(provider==='claude') send({type:'result',subtype:'success',is_error:false,result:reply,usage:{input_tokens:20,output_tokens:2}})
  else {
    send({type:'thread.started',thread_id:'af001122-ccdd-4321-8888-000000000123'})
    send({type:'turn.started'})
    if(scenario==='tool') send({type:'item.started',item:{type:'command_execution'}})
    send({type:'item.completed',item:{type:'reasoning',text:'HIDDEN-REASONING'}})
    send({type:'item.completed',item:{type:'agent_message',text:reply}})
    send({type:'turn.completed',usage:{input_tokens:4,output_tokens:6,cached_input_tokens:2}})
  }
}
`
async function setup(t,scenario='ok'){
  const root=await mkdtemp(join(tmpdir(),'luma-local-adapter-test-'))
  const script=join(root,'fake.mjs')
  await writeFile(script,fixture)
  t.after(()=>rm(root,{recursive:true,force:true}))
  return {root,local:createLocalHarness(async id=>({file:process.execPath,args:[script,id,scenario]}))}
}
test('subscription adapters discover their live catalogs and send private persona, attachments and accounting over isolated CLI turns',async t=>{
  const {local}=await setup(t)
  assert.deepEqual(subscriptionEnvironment({OPENAI_API_KEY:'unused',CODEX_API_KEY:'unused',ANTHROPIC_API_KEY:'unused',CODEX_HOME:'profile',PATH:'cli'}),{CODEX_HOME:'profile',PATH:'cli'})
  assert((await local.providers()).every(row=>row.authenticated && row.installed))
  assert.deepEqual((await local.models('codex')).map(row=>row.id),['writer','writer-b'])
  assert.deepEqual((await local.models('claude')).map(row=>row.id),['opus'])
  const messages=[{role:'system',content:'PRIVATE-LUMA'}, {role:'user',content:'查阅附图',attachments:[
    {name:'测试.png',mediaType:'image/png',bytes:8,data:'iVBORw0KGgo='},
    {name:'短文.txt',mediaType:'text/plain',bytes:4,data:'dGV4dA=='},
  ]}]
  const usage=[]
  const [a,b]=await Promise.all(['codex','claude'].map(id=>local.request(id,id==='codex'?'writer':'opus','',messages,AbortSignal.timeout(5000),n=>usage.push(n))))
  assert.deepEqual(usage.sort((x,y)=>x-y),[10,22])
  const first=JSON.parse(a),second=JSON.parse(b)
  assert.notEqual(first.cwd,second.cwd)
  assert(first.flags.includes('--ignore-user-config') && first.flags.includes('--ephemeral') && first.flags.includes('--image'))
  assert(second.flags.includes('--no-session-persistence') && second.flags.includes('--strict-mcp-config'))
  assert.doesNotMatch(a,/HIDDEN-REASONING/)
  assert.match(first.input,/PRIVATE-LUMA/);assert.match(first.input,/短文.txt/)
  assert.equal(JSON.parse(second.input).message.content.at(-1).source.data,'iVBORw0KGgo=')
  await assert.rejects(access(first.cwd));await assert.rejects(access(second.cwd))
})

test('the host persists a local role binding and dispatches chat, private window tasks and studio work with its selected model',async t=>{
  const {local,root}=await setup(t)
  const windows=[], charges=[],key='a'.repeat(64)
  const desktop={run:async(window,messages,call,signal)=>{windows.push(window);return call(messages,signal)}}
  const open=()=>createAgentWork(root,undefined,undefined,undefined,false,undefined,(id,key,n)=>charges.push(n),desktop,undefined,local)
  let desk=open()
  try{
    const ids=['shan','lu-mi']
    for(const roleId of ids) await desk.call('configure',{roleId,source:'local',provider:'codex',model:'writer',effort:'low'})
    await assert.rejects(desk.call('configure',{roleId:'shan',source:'local',provider:'codex',model:'other'}),/目录/)
    desk.dispose();desk=open()
    const state=await desk.call('state',{})
    assert.deepEqual([state.roles.shan.source,state.roles.shan.provider,state.roles.shan.model,state.roles.shan.hasKey],['local','codex','writer',false])
    const room=await desk.call('createroom',{name:'工作室',requestId:'room',roleIds:ids,workflow:'studio'})
    const single={requestId:'private',roleIds:['shan'],mode:'task',topic:'desk-shan',text:'PRIVATE-LUMA',desktopTargets:{shan:key}}
    await assert.rejects(desk.call('run',{...single,mode:'chat'}),/窗口/)
    await assert.rejects(desk.call('run',{...single,desktopTargets:{'lu-mi':key}}),/本轮参与/)
    for(const request of [single,{...single,requestId:'chat',mode:'chat',desktopTargets:{}},{requestId:'team',topic:room.id,roleIds:ids,mode:'team',text:'审阅资料'}]){
      const job=await desk.call('run',request)
      for(let i=0;i<200 && ['queued','running'].includes(job.status);i++)await delay(20)
      assert.equal(job.status,'done',job.error)
      assert(job.steps.every(step=>step.model==='writer'))
      for(const step of job.steps) {
        assert.deepEqual(step.harnessTrace.map(e=>e.stage),['context','lookup','account','authenticated','model','thread','turn','response'])
        assert.ok(step.harnessTrace.filter(e=>e.pid).every(e=>Number.isSafeInteger(e.pid) && e.pid>0))
        assert.equal(step.harnessTrace.find(e=>e.stage==='thread').threadId,'af001122-ccdd-4321-8888-000000000123')
        assert.ok(step.harnessTrace.every(e=>Object.keys(e).every(k=>['stage','at','pid','threadId'].includes(k))))
      }
    }
    assert.deepEqual(windows,[key]);assert.equal(charges.length,6)
    desk.dispose();desk=open()
    const reloaded=(await desk.call('state',{})).jobs.find(j=>j.id==='chat')
    assert.equal(reloaded.steps[0].harnessTrace.at(-1).stage,'response')
  }finally{desk.dispose()}
})

test('deadlines release stalled discovery and stalled protocol consumers without starting a late CLI',async t=>{
  let releaseDiscovery
  const lookup=new Promise(resolve=>{releaseDiscovery=resolve})
  const stages=[]
  const local=createLocalHarness(()=>lookup)
  const stop=new AbortController(), reason=new Error('fixture expired')
  const pending=local.request('codex','writer','',[],stop.signal,undefined,e=>stages.push(e.stage))
  await delay(20);stop.abort(reason)
  const released=p=>Promise.race([p,delay(1500,undefined,{ref:false}).then(()=>{throw Error('adapter remained pending')})])
  try {await assert.rejects(released(pending),error=>error===reason)}
  finally {releaseDiscovery({file:process.execPath})}
  await delay(20);assert.deepEqual(stages,['lookup'])

  let resume,ready,pid
  const release=new Promise(ok=>{resume=ok}),entered=new Promise(ok=>{ready=ok})
  const control=new AbortController()
  const turn=harnessProcess({file:process.execPath},['-e',"console.log('READY');setInterval(()=>{},10000)"],{
    cwd:tmpdir(),signal:control.signal,onSpawn:n=>{pid=n},
  },async(send,lines)=>{
    assert.equal((await lines.next()).value,'READY');ready();await release
  })
  t.after(()=>{control.abort();resume()})
  await entered;control.abort(reason)
  try {await assert.rejects(released(turn),error=>error===reason)}
  finally {resume()}
  assert.throws(()=>process.kill(pid,0),{code:'ESRCH'})
})

test('rejects API-key-only Codex logins, unexpected tool calls and interrupted CLI turns',async t=>{
  const {local:api}=await setup(t,'apikey'),{local:tool}=await setup(t,'tool'),{local:slow}=await setup(t,'wait')
  assert.equal((await api.providers())[0].authenticated,false)
  await assert.rejects(api.models('codex'),/订阅登录/)
  await assert.rejects(tool.request('codex','writer','',[],AbortSignal.timeout(5000)),/额外工具/)
  await assert.rejects(slow.request('codex','writer','',[],AbortSignal.timeout(350)))
})

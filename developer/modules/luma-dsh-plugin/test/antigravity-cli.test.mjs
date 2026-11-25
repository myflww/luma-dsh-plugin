import test from 'node:test'
import assert from 'node:assert/strict'
import {writeFile, readFile, mkdtemp, rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {antigravityCatalog,antigravityRequest} from '../src/host/local-harness-antigravity.ts'
import {createLocalHarness} from '../src/host/local-harness.ts'

const driver = `
import {createInterface} from 'node:readline'
import {readFileSync,appendFileSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import {join} from 'node:path'
import assert from 'node:assert/strict'
const [scenario,...args]=process.argv.slice(2), profile=args[args.indexOf('--gemini-dir')+1]
const modelId=scenario==='host'?'Gemini Pro (High)':'gemini-test'
if(scenario==='host') appendFileSync(fileURLToPath(new URL('starts.txt',import.meta.url)),process.pid+'\\n')
const settings=JSON.parse(readFileSync(join(profile,'antigravity-cli','settings.json')))
assert.equal(settings.toolPermission,'strict')
assert.equal(args[0],'acp')
const send=data=>console.log(JSON.stringify({jsonrpc:'2.0',...data}))
let pending
for await(const line of createInterface({input:process.stdin})){
  const r=JSON.parse(line);let result={}
  if(r.method==='initialize') {
    assert.deepEqual(r.params.clientCapabilities,{})
    result={protocolVersion:1,agentInfo:{name:'Antigravity ACP Server',version:'1.5.17'},authMethods:[{id:'oauth-personal'}],agentCapabilities:{sessionCapabilities:{close:{}},promptCapabilities:{image:true}}}
  }else if(r.method==='session/new') {
    assert.deepEqual(r.params.mcpServers,[])
    if(scenario==='loggedout'){send({id:r.id,error:{code:-32000,message:'Authentication required'}});continue}
    result={sessionId:'s',configOptions:[{id:'model',type:'select',currentValue:'original',options:[{group:'google',options:[{name:'Gemini',value:modelId}]}]}]}
  }else if(r.method==='session/set_config_option'){
    assert.deepEqual(r.params,{sessionId:'s',configId:'model',value:modelId})
  }else if(r.method==='session/prompt'){
    pending=r.id
    assert.match(r.params.prompt[0].text,/整理会议记录/)
    send({id:42,method:'session/request_permission',params:{sessionId:'s',options:[]}})
    continue
  }else if(r.id===42){
    assert.deepEqual(r.result,{outcome:{outcome:'cancelled'}})
    for(const [sessionId,sessionUpdate,text] of [['x','agent_message_chunk','foreign'],['s','agent_thought_chunk','private'],['s',scenario==='tool'?'tool_call':'agent_message_chunk','回复']]){
      send({method:'session/update',params:{sessionId,update:{sessionUpdate,content:{type:'text',text}}}})
    }
    send({id:pending,result:{stopReason:'end_turn'}})
    continue
  }
  send({id:r.id,result})
}
`

test('Antigravity ACP validates login, selects the live model and accepts only the chosen session’s text',async t=>{
  const base=await mkdtemp(join(tmpdir(),'luma-agy-test-'))
  t.after(()=>rm(base,{force:true,recursive:true}))
  const script=join(base,'fixture.mjs')
  await writeFile(script,driver)
  const cli=scenario=>({file:process.execPath,args:[script,scenario]})
  const signal=AbortSignal.timeout(10000)
  assert.deepEqual(await antigravityCatalog(cli('ok'),base,signal,true),[{id:'gemini-test',name:'Gemini',efforts:[]}])
  await assert.rejects(antigravityCatalog(cli('loggedout'),base,signal,false),/Google 登录/)
  const request=(scenario,model='gemini-test')=>antigravityRequest(cli(scenario),base,signal,model,[{role:'user',content:'整理会议记录'}])
  assert.equal(await request('ok'),'回复')
  await assert.rejects(request('tool'),/额外工具/)
  await assert.rejects(request('ok','outdated'),/目录已变更/)
  const host=createLocalHarness(async()=>cli('host')),events=[]
  const send=model=>host.request('antigravity',model,'',[{role:'user',content:'整理会议记录'}],signal,undefined,event=>events.push(event))
  await assert.rejects(send('model\nother'),/参数无效/)
  events.length=0
  assert.equal(await send('Gemini Pro (High)'),'回复')
  assert.deepEqual(events.map(e=>e.stage),['lookup','account','authenticated','model','response'])
  assert.deepEqual((await readFile(join(base,'starts.txt'),'utf8')).trim().split('\n'),[String(events[1].pid)])
  assert.equal(events[1].pid,events[3].pid)
})

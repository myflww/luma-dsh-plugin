import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as pause } from 'node:timers/promises'
import { createAgentWork } from '../src/host/agent-work.ts'

test('per-role DSH routes, exact reasoning metadata and custom discoveries survive reopening and drive chat, tasks and a mixed room',async t=>{
  const root=await mkdtemp(join(tmpdir(),'luma-services-'))
  const calls=[], streams=[]
  const server=createServer(async(req,res)=>{
    let raw=''
    for await (const chunk of req) raw+=chunk
    const body=raw ? JSON.parse(raw) : {}
    calls.push({path:req.url,headers:req.headers,body})
    res.setHeader('Content-Type','application/json')
    if (req.url==='/chat/models') res.end(JSON.stringify({data:[{id:'public-chat'}]}))
    else if (req.url==='/gem/models') res.end(JSON.stringify({models:[{name:'models/embed',supportedGenerationMethods:['embedContent']}],nextPageToken:'opaque'}))
    else if (req.url==='/gem/models?pageToken=opaque') res.end(JSON.stringify({models:[{name:'models/gemini-3-flash',displayName:'Flash',supportedGenerationMethods:['generateContent']}]}))
    else if (req.url==='/claude/models') res.end(JSON.stringify({data:[{id:'claude-sonnet-4-6',display_name:'Sonnet'}],has_more:false}))
    else if (req.url==='/claude/messages') res.end(JSON.stringify({usage:{input_tokens:30,output_tokens:4,cache_read_input_tokens:5},content:[{type:'text',text:'Independent account reply'}]}))
    else if (req.url==='/gem/models/gemini-3-flash:generateContent') res.end(JSON.stringify({usageMetadata:{totalTokenCount:42},candidates:[{content:{parts:[{text:'Gemini reply'}]}}]}))
    else res.end(JSON.stringify({usage:{total_tokens:63},choices:[{message:{content:'Custom reply'}}]}))
  }).listen(0,'127.0.0.1')
  await once(server,'listening')
  const url='http://127.0.0.1:'+server.address().port
  const native={
    llm:{
      listProviders:()=>[{id:'office-account', name:'办公室账户',credential:'HOST-ONLY'}],
      listModels:async id=>{assert.equal(id,'office-account');return [{id:'model-a',name:'长文模型',apiKey:'HOST-ONLY'}]},
      resolveModelInfo:async(id,model)=>{assert.equal(id,'office-account');assert.equal(model,'model-a');return {reasoning:{defaultEffort:'normal',efforts:[{id:'normal',name:'平衡'},{id:'deep',name:'深思'}]}}},
      async *stream(options) {
        streams.push(options)
        yield {type:'block-end',index:0,block:{type:'reasoning',text:'HIDDEN-THOUGHT'}}
        yield {type:'block-end',index:1,block:{type:'text',text:'Host account reply'}}
        yield {type:'usage',usage:{inputTokens:20,cacheReadTokens:3,outputTokens:5}}
        yield {type:'finish',reason:{kind:'stop'}}
      },
    },
    attachments:{async saveImages(inputs){assert.equal(inputs[0].name,'preview.png');return [{id:'stored-image'}]}},
  }
  const usageRows=[]
  const create=()=>createAgentWork(root,undefined,undefined,undefined,false,native,(...row)=>usageRows.push(row))
  let desk=create()
  t.after(async()=>{desk.dispose();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await rm(root,{recursive:true,force:true})})
  assert.deepEqual(await desk.call('providers',{}),{providers:[{id:'office-account',name:'办公室账户'}]})
  assert.deepEqual(await desk.call('models',{provider:'office-account'}),{models:[{id:'model-a',name:'长文模型'}]})
  const route={roleId:'shan',source:'dsh',provider:'office-account',model:'model-a'}
  assert.deepEqual((await desk.call('reasoning',route)).efforts.map(e=>e.id),['normal','deep'])
  await assert.rejects(desk.call('configure',{...route,effort:'not-offered'}),/思考强度/)
  await desk.call('configure',{...route,effort:'deep'})
  const custom={roleId:'claude',protocol:'anthropic',baseUrl:url+'/claude',model:'claude-sonnet-4-6',effort:'medium'}
  await desk.call('configure',{...custom,apiKey:'CUSTOM-ONLY'})
  assert.deepEqual(await desk.call('discover',custom),{models:[{id:custom.model,name:'Sonnet'}]})
  assert.equal(calls.at(-1).headers['x-api-key'],'CUSTOM-ONLY')
  const gem={roleId:'gemini',protocol:'gemini',baseUrl:url+'/gem',apiKey:'GEM-ONLY',model:'gemini-3-flash',effort:'low'}
  assert.deepEqual(await desk.call('discover',gem),{models:[{id:gem.model,name:'Flash'}]})
  assert.equal(calls.at(-1).headers['x-goog-api-key'],'GEM-ONLY')
  await desk.call('configure',gem)
  const chat={roleId:'claude',protocol:'openai',baseUrl:url+'/chat'}
  assert.equal((await desk.call('discover',chat)).models[0].id,'public-chat')
  assert.equal(calls.at(-1).headers.authorization,undefined)
  const manual={...chat,roleId:'lu-mi',apiKey:'CHAT-ONLY',model:'manual-model',effort:'high'}
  await desk.call('configure',manual)

  desk.dispose();desk=create()
  const state=await desk.call('state',{})
  assert.equal(state.roles.shan.source,'dsh')
  assert.equal(state.roles.shan.effort,'deep')
  assert.doesNotMatch(JSON.stringify(state),/HOST-ONLY|CUSTOM-ONLY|GEM-ONLY|CHAT-ONLY/)
  async function run(id,mode,roleIds,topic,attachments) {
    await desk.call('run',{requestId:id,mode,roleIds,topic,text:'本次任务',attachments})
    for(let i=0;i<150;i++) {
      const job=(await desk.call('state',{})).jobs.find(j=>j.id===id)
      if(!['running','queued'].includes(job.status)){assert.equal(job.status,'done',job.error);return job}
      await pause(15)
    }
    assert.fail('model did not finish')
  }
  const png=Buffer.from('89504E470D0A1A0A','hex')
  const file={name:'preview.png',bytes:png.length,mediaType:'image/png',data:png.toString('base64')}
  await run('private','chat',['shan'],'private',[file])
  assert.deepEqual(streams[0].messages.at(-1).content.at(-1),{type:'image',attachment:{id:'stored-image'}})
  await run('assignment','task',['shan'],'task')
  const room=await desk.call('createroom',{requestId:'mixed',name:'群聊',roleIds:['shan','claude','gemini','lu-mi']})
  const result=await run('discussion','team',room.roleIds,room.id)
  assert.equal(streams.length,3)
  for (const opts of streams) {assert.equal(opts.provider,route.provider);assert.equal(opts.model,route.model);assert.equal(opts.reasoningEffort,'deep')}
  assert.deepEqual(result.steps.map(s=>s.output),['Host account reply','Independent account reply','Gemini reply','Custom reply'])
  assert.deepEqual(usageRows.filter(row=>row[1]==='job:discussion'),[['shan','job:discussion',28],['claude','job:discussion',39],['gemini','job:discussion',42],['lu-mi','job:discussion',63]])
  const requests=calls.filter(c=>c.body.messages || c.body.contents)
  assert.equal(requests[0].body.output_config.effort,'medium')
  assert.deepEqual(requests[0].body.thinking,{type:'adaptive'})
  assert.equal(requests[0].headers['x-api-key'],'CUSTOM-ONLY')
  assert.equal(requests[1].body.generationConfig.thinkingConfig.thinkingLevel,'LOW')
  assert.equal(requests[2].body.reasoning_effort,'high')
  assert.equal(requests[2].body.model,'manual-model')
  assert.equal(requests[2].headers.authorization,'Bearer CHAT-ONLY')
  assert.doesNotMatch(JSON.stringify(result),/HIDDEN-THOUGHT|HOST-ONLY|CUSTOM-ONLY/)
  assert.equal(await desk.requestRoleModel('bai-shuangming',[],AbortSignal.timeout(1000)),undefined)
})

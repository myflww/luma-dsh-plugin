import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,mkdir,writeFile,readFile,access,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {kimiCatalog,kimiRequest} from '../src/host/local-harness-kimi.ts'

const fixture = `
import {createServer} from 'node:http'
import {createInterface} from 'node:readline'
import {readFile} from 'node:fs/promises'
import {join} from 'node:path'
const [scenario,command]=process.argv.slice(2)
const send=(data)=>process.stdout.write(JSON.stringify(data)+'\\n')
if(process.env.KIMI_MODEL_API_KEY || process.env.KIMI_CODE_BASE_URL) process.exit(1)
if(command==='web'){
  const server=createServer((req,res)=>{
    if(req.headers.authorization!=='Bearer temporary-local-test') {res.writeHead(401);res.end();return}
    const data=req.url.endsWith('/auth')?{managed_provider:scenario==='api'?null:{name:'managed:kimi-code',status:'authenticated'}}:
      req.url.endsWith('/models')?{items:[{provider:'managed:kimi-code',model:'kimi-code/writer',display_name:'Writer'},{provider:'other',model:'wrong'}]}:{}
    res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({code:0,data}))
  })
  server.listen(0,'127.0.0.1',()=>send({origin:'http://127.0.0.1:'+server.address().port,token:'temporary-local-test'}))
}else if(command==='acp'){
  const agent=await readFile(join(process.cwd(),'.kimi-code','agents','agent.md'),'utf8')
  if(!agent.includes('tools: []') || !agent.includes('role instruction'))process.exit(1)
  for await(const line of createInterface({input:process.stdin})){
    const row=JSON.parse(line)
    let result={}
    if(row.method==='initialize')result={agentCapabilities:{promptCapabilities:{image:true}}}
    if(row.method==='session/new')result={sessionId:'session-test'}
    if(row.method==='session/set_model' && row.params.modelId!=='kimi-code/writer')process.exit(1)
    if(row.method==='session/prompt'){
      const payload=row.params.prompt
      if(!payload[0].text.includes('private text') || payload[1].mimeType!=='image/png')process.exit(1)
      if(scenario==='tool')send({jsonrpc:'2.0',method:'session/request_permission',id:90,params:{}})
      send({jsonrpc:'2.0',method:'session/update',params:{sessionId:row.params.sessionId,update:{sessionUpdate:'agent_message_chunk',content:{type:'text',text:'reply'}}}})
      result={stopReason:'end_turn'}
    }
    send({jsonrpc:'2.0',id:row.id,result})
  }
}
`

test('Kimi binds only managed OAuth models and receives tool-free ACP replies using a temporary profile',async t=>{
  const root=await mkdtemp(join(tmpdir(),'luma-kimi-test-'))
  t.after(()=>rm(root,{recursive:true,force:true}))
  const user=join(root,'account'),cwd=join(root,'turn'),script=join(root,'fake.mjs')
  await mkdir(join(user,'credentials'),{recursive:true});await mkdir(cwd)
  await writeFile(script,fixture)
  await writeFile(join(user,'credentials','sentinel'),'intact')
  const originals=new Map(['KIMI_CODE_HOME','KIMI_CODE_BASE_URL','KIMI_MODEL_API_KEY'].map(key=>[key,process.env[key]]))
  Object.assign(process.env,{KIMI_CODE_HOME:user,KIMI_CODE_BASE_URL:'https://invalid.test',KIMI_MODEL_API_KEY:'unused'})
  t.after(()=>{for(const [key,value] of originals) {if(value===undefined) delete process.env[key];else process.env[key]=value}})
  const cli=scenario=>({file:process.execPath,args:[script,scenario]})
  const signal=AbortSignal.timeout(10000)
  assert.deepEqual(await kimiCatalog(cli('ok'),cwd,signal,true),[{id:'kimi-code/writer',name:'Writer',efforts:[]}])
  await assert.rejects(kimiCatalog(cli('api'),cwd,signal,true),/订阅登录/)
  const messages=[{role:'user',content:'private text',attachments:[{mediaType:'image/png',name:'image.png',data:'iVBORw0KGgo='}]}]
  assert.equal(await kimiRequest(cli('ok'),cwd,signal,'kimi-code/writer',messages,'role instruction'),'reply')
  await assert.rejects(kimiRequest(cli('tool'),cwd,signal,'kimi-code/writer',messages,'role instruction'),/额外权限/)
  assert.equal(await readFile(join(user,'credentials','sentinel'),'utf8'),'intact')
  await assert.rejects(access(join(cwd,'kimi-profile','credentials')))
})

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { mkdtemp,rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { DatabaseSync } from 'node:sqlite'
import { setTimeout as pause } from 'node:timers/promises'
import { createAgentWork } from '../src/host/agent-work.ts'

test('a real room relays Anthropic text to Gemini while keeping keys, thought parts and private notes isolated',async t=>{
  const root=await mkdtemp(join(tmpdir(),'luma-models-'))
  const legacy=new DatabaseSync(join(root,'employees.sqlite3'))
  legacy.exec("CREATE TABLE configs(role TEXT PRIMARY KEY,baseUrl TEXT NOT NULL,model TEXT NOT NULL,secret TEXT NOT NULL); INSERT INTO configs VALUES ('shan','http://localhost','legacy','')")
  legacy.close()
  const desk=createAgentWork(root)
  const calls=[]
  async function provider(response){
    const server=createServer(async(req,res)=>{
      let bytes=''
      for await(const chunk of req)bytes+=chunk
      calls.push({path:req.url,headers:req.headers,payload:JSON.parse(bytes)})
      res.setHeader('Content-Type','application/json')
      res.end(JSON.stringify(response))
    }).listen(0,'127.0.0.1')
    await once(server,'listening')
    t.after(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve))})
    return 'http://127.0.0.1:'+server.address().port
  }
  t.after(async()=>{desk.dispose();await rm(root,{recursive:true,force:true})})
  assert.equal((await desk.call('state',{})).roles.shan.protocol,'openai')
  const a=await provider({content:[{type:'thinking',thinking:'HIDDEN-A'},{type:'text',text:'A research brief'}]})
  const b=await provider({candidates:[{content:{parts:[{thought:true,text:'HIDDEN-B'},{text:'Joint final draft'}]}}]})
  await desk.call('configure',{roleId:'shan',protocol:'anthropic',baseUrl:a+'/proxy/v1/',model:'model-a',apiKey:'A-test'})
  await desk.call('configure',{roleId:'shan',protocol:'anthropic',baseUrl:a+'/proxy/v1/messages///',model:'model-a'})
  await desk.call('configure',{roleId:'lu-mi',protocol:'gemini',baseUrl:b+'/v1beta/models/previous:generateContent/',model:'models/model-b',apiKey:'B-test'})
  const configured=(await desk.call('state',{})).roles
  assert.equal(configured.shan.baseUrl,a+'/proxy/v1')
  assert.equal(configured['lu-mi'].baseUrl,b+'/v1beta')
  // A previously saved full URL also works without asking the user to reconfigure it.
  const stored=new DatabaseSync(join(root,'employees.sqlite3'))
  try {
    stored.prepare("UPDATE configs SET baseUrl=? WHERE role='lu-mi'").run(b+'/v1beta/models/previous:generateContent/')
  } finally { stored.close() }
  await desk.call('remember',{roleId:'shan',text:'PRIVATE-ROOM-SENTINEL'})
  const room=await desk.call('createroom',{requestId:'review-room',name:'编辑组',roleIds:['shan','lu-mi'],duties:{shan:'梳理史料','lu-mi':'核对日期并定稿'}})
  await desk.call('run',{requestId:'joint',topic:room.id,mode:'team',roleIds:room.roleIds,text:'Prepare and review a brief'})
  const db=new DatabaseSync(join(root,'employees.sqlite3'))
  try {
    const job=()=>JSON.parse(db.prepare("SELECT value FROM jobs WHERE id='joint'").get().value)
    for(let i=0;i<250 && ['queued','running'].includes(job().status);i++)await pause(20)
    assert.equal(job().status,'done',job().error)
    assert.deepEqual(job().steps.map(step=>step.output),['A research brief','Joint final draft'])
    assert.deepEqual(calls.map(c=>c.path),['/proxy/v1/messages','/v1beta/models/model-b:generateContent'])
    assert.equal(calls[0].headers['x-api-key'],'A-test')
    assert.equal(calls[1].headers['x-goog-api-key'],'B-test')
    assert.match(JSON.stringify(calls[1].payload),/A research brief/)
    assert.match(JSON.stringify(calls[1].payload),/核对日期并定稿/)
    assert.deepEqual(job().steps.map(step=>step.model),['model-a','models/model-b'])
    assert.doesNotMatch(JSON.stringify(calls.map(c=>c.payload)),/HIDDEN-|PRIVATE-ROOM-SENTINEL|A-test|B-test/)
  } finally {db.close()}
})

import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { randomUUID } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { once } from 'node:events'
import { DatabaseSync } from 'node:sqlite'
import { createOfficeWorker } from '../cloud-office/worker.mjs'
import { createCloudOffice } from '../src/host/cloud-office.ts'

test('employee cloud work authenticates, scopes results, produces real artifacts and resumes after restart', async t => {
  const folder = await mkdtemp(join(tmpdir(), 'luma-cloud-office-'))
  const token = randomUUID()
  let count = 0, body
  let waitForModel
  const model = createServer(async (req,res)=>{
    let text = ''
    for await (const part of req) text += part
    assert.equal(req.url,'/v1/chat/completions')
    body = JSON.parse(text); count++
    if (waitForModel) await waitForModel
    res.writeHead(200,{'content-type':'application/json'})
    res.end(JSON.stringify({choices:[{message:{content:'## 项目周报\n已交付任务表。'}}]}))
  }).listen(0,'127.0.0.1')
  await once(model,'listening')
  const options = {token, dataDir:folder, modelUrl:'http://127.0.0.1:'+model.address().port+'/v1', model:'fixture-writer'}
  let worker = createOfficeWorker(options)
  worker.server.listen(0,'127.0.0.1')
  await once(worker.server,'listening')
  const port = worker.server.address().port
  const url = 'http://127.0.0.1:'+port
  const host = new DatabaseSync(join(folder,'client.sqlite3'))
  host.exec('CREATE TABLE integration(id TEXT PRIMARY KEY,value TEXT NOT NULL)')
  const call = createCloudOffice(host, s=>s, id=>{if(!['shan','grok'].includes(id)) throw Error();return id})
  t.after(async()=>{await worker.close();await new Promise(resolve=>model.close(resolve));host.close();await rm(folder,{recursive:true,force:true})})
  assert.equal((await call('cloudstate',{})).url,'')
  assert.equal((await fetch(url+'/v1/status')).status,401)
  await assert.rejects(call('cloudprobe',{}),/连接云办公服务器/)
  await call('cloudconfigure',{url,token})
  assert.deepEqual((await call('cloudprobe',{})).kinds,['document','checklist','draft'])
  const job = {id:randomUUID(),roleId:'shan',name:'端木嫣',server:url,kind:'checklist',title:'发布清单',text:'- [x] 校对标题\n=危险公式\n跟进排期'}
  const result = await call('cloudsubmit',job)
  assert.equal(result.status,'done')
  assert.ok(!('output' in result))
  assert.equal((await call('cloudresult',job)).output,'\ufeff任务,负责人,状态\r\n"校对标题","端木嫣","完成"\r\n"\'=危险公式","端木嫣","待办"\r\n"跟进排期","端木嫣","待办"\r\n')
  await assert.rejects(call('cloudresult',{...job,roleId:'grok'}),/其他员工/)
  assert.deepEqual((await call('cloudstate',{roleId:'grok'})).jobs,[])
  await assert.rejects(call('cloudsubmit',{...job,text:'替换材料'}),/内容或服务器/)
  const draft = {...job,id:randomUUID(),kind:'draft'}
  await call('cloudsubmit',draft)
  assert.deepEqual(call.workingRoles(),['shan'])
  for (let i=0;i<20;i++) {
    if ((await call('cloudrefresh',draft)).status === 'done') break
    await new Promise(resolve=>setTimeout(resolve,10))
  }
  assert.match((await call('cloudresult',draft)).output,/已交付任务表/)
  assert.equal(count,1)
  assert.deepEqual(call.workingRoles(),[])
  assert.equal(body.messages.length,2)
  assert.equal(body.tools,undefined)
  await call('cloudsubmit',draft)
  assert.equal(count,1)
  let release
  waitForModel = new Promise(resolve=>{release=resolve})
  const cancelled={...draft,id:randomUUID()}
  await call('cloudsubmit',cancelled)
  const cancelResult=await call('cloudcancel',cancelled)
  release()
  assert.equal(cancelResult.status,'cancelled')
  assert.equal((await call('cloudretry',cancelled)).status,'cancelled')
  assert.deepEqual(call.workingRoles(),[])
  const remoteUrl=url+'/v1/jobs/'+randomUUID()
  const headers={Authorization:'Bearer '+token,'content-type':'application/json'}
  await fetch(remoteUrl,{method:'DELETE',headers})
  const late=await fetch(remoteUrl,{method:'PUT',headers,body:JSON.stringify(cancelled)})
  assert.equal((await late.json()).status,'cancelled')
  await worker.close()
  worker=createOfficeWorker(options)
  worker.server.listen(0,'127.0.0.1'); await once(worker.server,'listening')
  const remote = await fetch('http://127.0.0.1:'+worker.server.address().port+'/v1/jobs/'+draft.id,{headers:{Authorization:'Bearer '+token}})
  assert.equal((await remote.json()).status,'done')
  await assert.rejects(call('cloudconfigure',{url:'https://other.example'}),/更换地址/)
  await call('cloudconfigure',{url:''})
  assert.equal((await call('cloudstate',{})).hasToken,false)
  assert.match((await call('cloudresult',draft)).output,/项目周报/)
})

test('changing the configured destination during discovery never sends the employee material', async t=>{
  let resolveProbe, markProbe
  const gate = new Promise(resolve=>{resolveProbe=resolve})
  const started = new Promise(resolve=>{markProbe=resolve})
  const routes=[]
  const remote=createServer(async (req,res)=>{
    routes.push(req.url); markProbe(); await gate
    res.end(JSON.stringify({protocol:'luma-office/1',kinds:['document']}))
  }).listen(0,'127.0.0.1')
  await once(remote,'listening')
  const db=new DatabaseSync(':memory:')
  db.exec('CREATE TABLE integration(id TEXT PRIMARY KEY,value TEXT NOT NULL)')
  const call=createCloudOffice(db,s=>s,id=>id)
  t.after(async()=>{resolveProbe();await new Promise(resolve=>remote.close(resolve));db.close()})
  const url='http://127.0.0.1:'+remote.address().port
  const job={id:randomUUID(),roleId:'shan',server:url,name:'端木嫣',kind:'document',title:'项目',text:'员工材料'}
  await call('cloudconfigure',{url,token:randomUUID()})
  await assert.rejects(call('cloudsubmit',{...job,server:'https://stale.example'}),/变更/)
  const submission=call('cloudsubmit',job)
  await started
  await call('cloudconfigure',{url:''})
  resolveProbe()
  await assert.rejects(submission,/材料未发送/)
  assert.deepEqual(routes,['/v1/status'])
  assert.deepEqual((await call('cloudstate',{roleId:'shan'})).jobs,[])
})

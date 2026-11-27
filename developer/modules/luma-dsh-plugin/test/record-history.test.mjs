import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { mkdtemp, access, readFile, rm, unlink, mkdir, rmdir } from 'node:fs/promises'
import { join, dirname, resolve, basename } from 'node:path'
import { tmpdir } from 'node:os'
import { DatabaseSync } from 'node:sqlite'
import { setTimeout as delay } from 'node:timers/promises'
import { createAgentWork } from '../src/host/agent-work.ts'
import { deliverableFolder } from '../src/host/job-deletion.ts'

async function fixture(t) {
  const root=await mkdtemp(join(tmpdir(),'luma-record-history-'))
  let release
  const server=createServer(async(req,res)=>{
    let raw=''
    for await(const chunk of req) raw+=chunk
    const p=JSON.parse(raw)
    if(p.messages.at(-1).content==='WAIT-FIXTURE') await new Promise(resolve=>{release=resolve})
    res.end(JSON.stringify({choices:[{message:{content:'实际交付 '+p.messages.at(-1).content}}]}))
  }).listen(0,'127.0.0.1')
  await once(server,'listening')
  let unlocked=['shan','lu-mi','jingyuniang']
  const create=()=>createAgentWork(root,undefined,undefined,()=>unlocked)
  let desk=create()
  const database=new DatabaseSync(join(root,'employees.sqlite3'))
  const call=(a,b={})=>desk.call(a,b)
  for(const roleId of unlocked) await call('configure',{roleId,model:roleId,baseUrl:'http://127.0.0.1:'+server.address().port})
  async function waitJob(id){
    for(let i=0;i<250;i++){
      const got=(await call('state')).jobs.find(j=>j.id===id)
      if(got?.status==='done')return got
      if(got?.status==='failed')assert.fail(got.error)
      await delay(10)
    }
    assert.fail('Timed out '+id)
  }
  async function run(requestId,roleIds,topic,mode,text,extra={}){
    await call('run',{requestId,roleIds,topic,mode,text,...extra})
    return waitJob(requestId)
  }
  function letter(role,topic,text) {
    const id=database.prepare('INSERT INTO companion_letters(role,topic,text,time) VALUES(?,?,?,?)').run(role,'desk:'+topic,text,Date.now()).lastInsertRowid
    return call('record',{roleId:role,topic:'outreach',id:'letter-'+id,user:'来信',assistant:text})
  }
  t.after(async()=>{
    release?.();desk.dispose();database.close();server.closeAllConnections();await new Promise(ok=>server.close(ok))
    assert.equal(dirname(resolve(root)),resolve(tmpdir()));assert.ok(basename(root).startsWith('luma-record-history-'))
    await rm(root,{recursive:true,force:true})
  })
  return {root,db:database,call,run,waitJob,letter,restart(){desk.dispose();desk=create()},lock(id){unlocked=unlocked.filter(x=>x!==id)}}
}

test('local topics archive, read, restore and delete only one person’s private jobs and linked letters; a delayed replay cannot revive them',async t=>{
  const f=await fixture(t), {call,run,root}=f
  const selector={kind:'topic',roleId:'shan',topic:'overlap'}
  const a={kind:'job',roleId:'shan',id:'first'}
  await run('first',['shan'],'overlap','chat','我的长期偏好是清单先列日期。')
  await run('file',['shan'],'overlap','task','DROPPED-TASK-BODY',{attachments:[{name:'DROPPED-INDEX.txt',mediaType:'text/plain',bytes:3,data:'YWJj'}]})
  const deliverable=join(deliverableFolder(root,'file'),'1-shan.md')
  await access(deliverable)
  await run('other',['lu-mi'],'overlap','chat','OTHER-PERSON-STAYS')
  await run('team',['shan','lu-mi'],'overlap','team','SHARED-WORK-STAYS')
  await f.letter('shan','overlap','DROPPED-PRIVATE-LETTER')
  await f.letter('lu-mi','overlap','OTHER-LETTER-STAYS')
  await call('archiverecord',a)
  await call('archiverecord',selector)
  await call('archiverecord',selector)
  f.restart()
  let state=await call('state')
  assert.deepEqual(state.jobs.map(j=>j.id),['other','team'])
  assert.ok(!state.letters.some(l=>l.role==='shan'))
  assert.ok(!JSON.stringify(state.previews.shan).includes('DROPPED'))
  const archived=(await call('archivedrecords',{roleId:'shan'})).items
  assert.equal(archived.length,1)
  assert.equal(archived[0].count,3)
  const read=await call('readrecord',selector)
  assert.deepEqual(read.jobs.map(j=>j.id),['first','file'])
  assert.deepEqual(read.letters.map(l=>l.text),['DROPPED-PRIVATE-LETTER'])
  assert.deepEqual((await call('archivedrecords',{roleId:'lu-mi'})).items,[])
  await assert.rejects(call('restorerecord',a),/先恢复/)
  await assert.rejects(call('run',{requestId:'fresh',topic:'overlap',roleIds:['shan'],mode:'chat',text:'try'}),/归档或删除/)
  await call('restorerecord',selector);await call('restorerecord',selector)
  assert.ok((await call('state')).jobs.some(j=>j.id==='file'))
  assert.equal((await call('archivedrecords',{roleId:'shan'})).items[0].id,'first')
  await call('restorerecord',a)
  await call('archiverecord',selector)
  // A directory at an exact generated filename simulates a Windows cleanup
  // failure without touching any user file or requiring a live file lock.
  await unlink(deliverable);await mkdir(deliverable)
  const deletion=await call('deleterecord',selector)
  assert.deepEqual(deletion,{ok:true,filesPending:true,removed:{jobs:['first','file'],letters:['1']}})
  assert.deepEqual(await call('deleterecord',selector),deletion)
  await rmdir(deliverable)
  assert.deepEqual(await call('deleterecord',selector),{...deletion,filesPending:false})
  await assert.rejects(access(deliverable))
  f.restart()
  state=await call('state')
  assert.deepEqual(state.jobs.map(j=>j.id),['other','team'])
  assert.deepEqual(state.letters.map(l=>l.text),['OTHER-LETTER-STAYS'])
  assert.deepEqual((await call('archivedrecords',{roleId:'shan'})).items,[])
  assert.doesNotMatch(JSON.stringify(await call('memory',{roleId:'shan'})),/DROPPED/)
  assert.match(JSON.stringify(await call('portrait',{roleId:'shan'})),/清单先列日期/)
  await assert.rejects(call('record',{roleId:'shan',id:'first',topic:'overlap',user:'DROPPED-REPLAY',assistant:'text'}),/已[经]?删除/)
  await assert.rejects(call('run',{requestId:'different',roleIds:['shan'],topic:'overlap',mode:'chat',text:'after'}),/删除/)
  assert.equal(f.db.prepare('SELECT count(*) n FROM jobs WHERE value LIKE ?').get('%DROPPED%').n,0)
  assert.equal(f.db.prepare('SELECT count(*) n FROM notes WHERE user LIKE ? OR assistant LIKE ?').get('%DROPPED%','%DROPPED%').n,0)
  assert.equal(f.db.prepare('SELECT count(*) n FROM companion_letters WHERE text LIKE ?').get('%DROPPED%').n,0)
  assert.equal((await readFile(join(root,'employees.sqlite3'))).includes(Buffer.from('DROPPED-TASK-BODY')),false)
})

test('a room selector can affect only its own work; a locked member or active job blocks archive, read, or deletion',async t=>{
  const f=await fixture(t), {call,run}=f
  const r=await call('createroom',{requestId:'alpha',name:'一号工作室',roleIds:['shan','lu-mi']})
  const r2=await call('createroom',{requestId:'beta',name:'二号工作室',roleIds:['shan','jingyuniang']})
  await run('room-work',['shan'],r.id,'task','我的长期偏好是先确认目录。')
  await run('room-chat',['shan'],r.id,'chat','ROOM-CHAT-KEPT')
  await run('different-room',['shan'],r2.id,'task','OTHER-ROOM-KEPT')
  await run('private',['lu-mi'],'separate','chat','PRIVATE-KEPT')
  const target={kind:'job',id:'room-work',roomId:r.id}
  for(const wrong of [{...target,roomId:r2.id},{kind:'job',id:'room-work',roleId:'shan'},{...target,id:'private'},
    {kind:'job',id:'room-chat',roleId:'shan'},{kind:'topic',roleId:'shan',topic:r.id}]) {
    for(const op of ['archiverecord','readrecord','deleterecord'])await assert.rejects(call(op,wrong))
  }
  await call('archiverecord',target);f.restart()
  assert.deepEqual((await call('archivedrecords',{roomId:r.id})).items.map(i=>i.id),['room-work'])
  assert.deepEqual((await call('archivedrecords',{roomId:r2.id})).items,[])
  assert.deepEqual((await call('archivedrecords',{roleId:'shan'})).items,[])
  assert.equal((await call('readrecord',target)).jobs[0].id,'room-work')
  await call('restorerecord',target)
  const pending={requestId:'busy',mode:'task',topic:'busy-topic',roleIds:['shan'],text:'WAIT-FIXTURE'}
  await call('run',pending)
  for(const t of [{kind:'job',id:'busy',roleId:'shan'},{kind:'topic',topic:pending.topic,roleId:'shan'}])
    for(const op of ['archiverecord','deleterecord'])await assert.rejects(call(op,t),/仍在执行/)
  await call('cancel',{id:'busy'})
  await call('deleterecord',target)
  f.restart()
  const state=await call('state')
  assert.ok(state.rooms.some(room=>room.id===r.id))
  assert.ok(['room-chat','different-room','private'].every(id=>state.jobs.some(j=>j.id===id)))
  const groupChat={...target,id:'room-chat'}
  await call('archiverecord',groupChat)
  assert.equal((await call('readrecord',groupChat)).jobs[0].mode,'chat')
  await call('restorerecord',groupChat)
  // Earlier hosts observed even room chat as a work portrait. Its room-only
  // evidence must stay room-only after deletion and restart.
  const preference='我的长期偏好是在海岸项目中将清样页脚写为海星6247。'
  f.db.prepare('INSERT INTO portrait_items VALUES(?,?,?,?,?,?,?,?,?,?)')
    .run('legacy-room-chat','shan',r.id,preference,preference,'stated','work',1,Date.now(),1)
  f.db.prepare('INSERT INTO portrait_evidence VALUES(?,?)').run('legacy-room-chat','room-chat')
  assert.deepEqual((await call('deleterecord',groupChat)).removed.jobs,['room-chat'])
  f.restart()
  const recalled=await call('recall',{roleId:'shan',topic:'new-private',privateChat:true,query:'在海岸项目中清样页脚怎么写？'})
  assert.doesNotMatch(recalled.context,/海星6247/)
  await assert.rejects(call('deletejob',{id:'room-chat'}))
  assert.match(JSON.stringify(await call('portrait',{roleId:'shan'})),/先确认目录/)
  assert.equal((await call('deleterecord',target)).ok,true)
  f.lock('lu-mi')
  assert.ok(!(await call('state')).jobs.some(j=>j.topic===r.id))
  for(const op of ['readrecord','deleterecord','restorerecord','archiverecord']) await assert.rejects(call(op,target))
  await assert.rejects(call('archivedrecords',{roomId:r.id}))
  await assert.rejects(call('deletejob',{id:'room-work'}))
})

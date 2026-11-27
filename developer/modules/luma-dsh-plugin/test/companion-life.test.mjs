import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { setTimeout as pause } from 'node:timers/promises'
import { DatabaseSync } from 'node:sqlite'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createCompanionLife } from '../src/host/companion-life.ts'
import { createAppUsage } from '../src/host/foreground-apps.ts'
import { createAgentWork } from '../src/host/agent-work.ts'
import { companionVoices, feeling, turnTone } from '../src/shared/companion-life.ts'

const min=60_000
function fixture(t) {
  const db=new DatabaseSync(':memory:')
  db.exec(`CREATE TABLE integration(id TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE notes(role TEXT, user TEXT, assistant TEXT, topic TEXT, createdAt INTEGER);
    CREATE VIEW employee_private_notes AS SELECT *,rowid AS noteOrder FROM notes;
    CREATE VIEW portrait_recallable_notes AS SELECT *,noteOrder AS id,'' AS chatPosition FROM employee_private_notes;`)
  const clock={at:new Date(2026,10,23,9,0).getTime()}
  const options={unlocked:()=>['jingyuniang'],busy:()=>false,makeReply:async()=>undefined,
    topic:(_,t)=>t?'native:'+t:'native-inbox',record:()=>{},now:()=>clock.at}
  const create=()=>createCompanionLife(db,options)
  let life=create()
  const get=()=>life
  const restart=()=>{life.dispose();life=create()}
  const pulse=(candidates=[{role:'jingyuniang',place:'office',topic:'whale-thread'}])=>life.pulse({candidates})
  t.after(()=>{life.dispose();db.close()})
  return {db,clock,options,get,restart,pulse}
}

test('outreach uses a real unlocked idle person and one durable conversation across simultaneous pulses and restarts',async t=>{
  const f=fixture(t)
  assert.equal((await f.pulse()).letter,undefined)
  f.clock.at+=3*min
  assert.equal((await f.pulse([{role:'shan',place:'office'}])).letter,undefined)
  f.options.busy=()=>true
  assert.equal((await f.pulse()).letter,undefined)
  f.options.busy=()=>false
  const sent=(await Promise.all([f.pulse(),f.pulse()])).map(v=>v.letter).filter(Boolean)
  assert.equal(sent.length,1)
  assert.equal(sent[0].source,'local')
  assert.equal(sent[0].topic,'native:whale-thread')
  f.restart()
  assert.equal((await f.pulse()).letter,undefined)
  assert.deepEqual(f.get().history().map(v=>({...v})),sent)
  f.clock.at+=91*min
  f.get().configure({model:true})
  let request
  f.options.makeReply=async(role,brief)=>{request=JSON.parse(brief);return '我给你留了一张便签。'}
  assert.equal((await f.pulse()).letter,undefined)
  assert.equal(request,undefined)
  const note=f.db.prepare('INSERT INTO notes VALUES(?,?,?,?,?)')
  note.run('jingyuniang','在试一种新纸','我喜欢纸张的纹理。','main',f.clock.at-25*min)
  let res=await f.pulse()
  assert.equal(res.letter.source,'model')
  assert.equal(request.place,'办公室')
  assert.ok(request.context.previousLetters.includes(sent[0].text))
  assert.equal(request.context.recentForegroundApps,undefined)
  f.clock.at+=91*min
  note.run('jingyuniang','纸边还要再裁一次','那等你试过。','main',f.clock.at-25*min)
  f.options.makeReply=async()=>'[安静]'
  assert.equal((await f.pulse()).letter,undefined)
  f.clock.at+=91*min
  assert.equal((await f.pulse()).letter,undefined)
  assert.equal(f.get().history().length,2)
})
test('an outreach completion after its topic is removed cannot recreate a letter or reuse a deleted feedback ID',async t=>{
  const f=fixture(t),recorded=[]
  f.options.record=letter=>recorded.push(letter)
  await f.pulse()
  f.clock.at+=3*min
  f.get().configure({model:true})
  let resolve
  f.options.makeReply=()=>new Promise(done=>{resolve=done})
  const writing=f.pulse()
  while(!resolve)await pause(1)
  const reserved=f.db.prepare('SELECT id FROM companion_letters').get().id
  f.db.prepare('DELETE FROM companion_letters WHERE id=?').run(reserved)
  resolve('这条旧话题的来信已被删除。')
  assert.equal((await writing).letter,undefined)
  assert.deepEqual(recorded,[])
  f.restart()
  f.get().configure({model:false})
  f.clock.at+=91*min
  const next=(await f.pulse()).letter
  assert.ok(Number(next.id)>Number(reserved))
})
test('schedule, recent chat, explicit request for space and muted or revoked preferences suppress delivery',async t=>{
  const f=fixture(t)
  await f.pulse()
  f.clock.at+=4*min
  f.get().configure({proactive:false})
  assert.equal((await f.pulse()).letter,undefined)
  f.get().configure({proactive:true})
  const note=f.db.prepare('INSERT INTO notes VALUES(?,?,?,?,?)')
  note.run('jingyuniang','今天很累','那先歇一歇','main',f.clock.at)
  assert.equal((await f.pulse()).letter,undefined)
  assert.equal(f.get().privateContext('jingyuniang',false).expression.mood,'沉静')
  f.clock.at+=21*min
  note.run('jingyuniang','让我静静','好','main',f.clock.at)
  f.clock.at+=21*min
  assert.equal((await f.pulse()).letter,undefined)
  f.clock.at=new Date(2026,10,24,6,45).getTime()
  assert.equal((await f.pulse()).letter,undefined)
  f.clock.at=new Date(2026,10,24,20,0).getTime()
  assert.equal((await f.pulse()).letter,undefined)
  f.clock.at=new Date(2026,10,25,10,0).getTime()
  f.get().configure({model:true})
  let finish
  f.options.makeReply=()=>new Promise(ok=>{finish=ok})
  const writing=f.pulse()
  f.get().configure({proactive:false})
  finish('不应被投递的草稿')
  assert.equal((await writing).letter,undefined)
  assert.equal(f.get().history().length,0)
})
test('a delayed model letter respects quiet hours, a new local day and a chat opened while writing',async t=>{
  for (const change of ['quiet','next-day','chat']) {
    const f=fixture(t)
    f.clock.at=new Date(2026,10,25,19,56).getTime()
    await f.pulse()
    f.clock.at+=3*min
    let finish
    f.options.makeReply=()=>new Promise(resolve=>{finish=resolve})
    f.get().configure({model:true})
    const pending=f.pulse()
    assert.equal(typeof finish,'function')
    if(change==='quiet') f.clock.at+=min
    if(change==='next-day') f.clock.at=new Date(2026,10,26,9).getTime()
    if(change==='chat') f.db.prepare('INSERT INTO notes VALUES(?,?,?,?,?)').run('jingyuniang','在忙','好的','main',f.clock.at)
    finish('写好的睡前来信')
    assert.equal((await pending).letter,undefined,change)
    assert.equal(f.get().history().length,0,change)
  }
})
test('a model can develop a longer thought or stay quiet; a new chat never causes an identical letter to be delivered twice',async t=>{
  const f=fixture(t)
  const letter='我还想和你聊聊书里的那张地图。'+ '想展开说说地图边缘的记号，以及它和前一张的关系。'.repeat(12)
  f.get().configure({model:true})
  let calls=0
  f.options.makeReply=async()=>{calls++;return letter}
  await f.pulse()
  f.clock.at+=3*min
  assert.equal((await f.pulse()).letter?.text,letter)
  f.clock.at+=91*min
  assert.equal((await f.pulse()).letter,undefined)
  assert.equal(calls,1)
  f.db.prepare('INSERT INTO notes VALUES(?,?,?,?,?)').run('jingyuniang','我重新看了那张地图','继续聊吧。','main',f.clock.at-25*min)
  assert.equal((await f.pulse()).letter,undefined)
  assert.equal(calls,2)
  f.clock.at+=91*min
  assert.equal((await f.pulse()).letter,undefined)
  assert.equal(calls,2)
})

test('private chats recover a role’s latest relevant position after restart, from that role’s own non-fictional words only',async t=>{
  const root=await mkdtemp(join(tmpdir(),'luma-own-position-'))
  let desk=createAgentWork(root)
  t.after(async()=>{desk.dispose();await rm(root,{recursive:true,force:true})})
  const a='jingyuniang', b='shan'
  const save=(roleId,id,user,assistant,privateChat=true)=>desk.call('record',{roleId,topic:'archive',id,user,assistant,privateChat})
  const recall=async(roleId,query,privateChat=true)=>JSON.parse((await desk.call('recall',{roleId,query,topic:'new',privateChat})).context).companion.ownPosition
  await save(a,'one','港口版画配什么纸？','我偏爱港口版画用的米色纸。')
  await save(a,'two','港口版画的新版试印呢？','我现在更喜欢灰纸，岸线更清晰。')
  await save(a,'story','给港口版画写一段独白。','我喜欢亮紫色的海面。')
  await save(a,'work','港口版画的介绍','我偏爱荧光红的外框。',false)
  await save(a,'unrelated','玉米要怎么吃？','我喜欢烤玉米。')
  await save(b,'other','这幅港口版画呢？','我喜欢白色的浮雕边。')
  desk.dispose();desk=createAgentWork(root)
  assert.equal((await recall(a,'你现在对港口版画怎么看？')).quote,'我现在更喜欢灰纸，岸线更清晰。')
  assert.equal((await recall(b,'你现在对港口版画怎么看？')).quote,'我喜欢白色的浮雕边。')
  assert.equal(await recall(a,'群内工作，港口版画',false),undefined)
  assert.equal(await recall(a,'咖啡豆要烘多久？'),undefined)
  // The source view controls what can be recalled. Forgetting or deleting the
  // original material must also remove the derived view from subsequent prompts.
  const db=new DatabaseSync(join(root,'employees.sqlite3'))
  try {
    db.prepare("INSERT INTO portrait_hidden_sources SELECT role,'private',id FROM notes WHERE assistant LIKE '%岸线更清晰%'").run()
    assert.equal((await recall(a,'港口版画？')).quote,'我偏爱港口版画用的米色纸。')
    db.prepare('DELETE FROM notes WHERE role=? AND assistant LIKE ?').run(a,'%米色纸%')
    assert.equal(await recall(a,'港口版画？'),undefined)
  } finally { db.close() }
})
test('application names and dwell only, suspend gaps and invalid paths excluded, samples immediately forgotten on stop',()=>{
  const usage=createAppUsage(()=>0)
  assert.equal(usage.status(),'off')
  usage.accept('Editor',0);usage.accept('Editor',15000)
  usage.accept('Browser',30000);usage.accept('Browser',45000)
  usage.accept('C:\\Users\\fixture\\private.txt',55000)
  usage.accept('Browser',65000);usage.accept('Browser',360000)
  assert.deepEqual(usage.summary(360000),[{app:'Editor',seconds:15},{app:'Browser',seconds:15}])
  assert.equal(usage.summary(30*min).length,0)
  usage.stop()
  assert.deepEqual(usage.summary(360000),[])
  assert.equal(usage.status(),'off')
})

test('one evidence-backed model reflection stays private, survives a restart and disappears with its source',async t=>{
  const root=await mkdtemp(join(tmpdir(),'luma-considered-'))
  let at=new Date(2026,10,23,10).getTime()
  t.mock.method(Date,'now',()=>at)
  let desk=createAgentWork(root), calls=0, forged=false
  const thought='我想给下一张潮汐图留出水退后的痕迹。'
  const evidence='石阶上留下了一道浅白的线'
  const server=createServer(async(req,res)=>{
    let raw=''
    for await(const part of req) raw+=part
    const input=JSON.parse(JSON.parse(raw).messages.at(-1).content)
    calls++
    const decision={action:'reflect',thought,source:input.triggerId,evidence:forged?'我编的材料':evidence}
    res.end(JSON.stringify({choices:[{message:{content:JSON.stringify(decision)}}]}))
  }).listen(0,'127.0.0.1')
  await once(server,'listening')
  t.after(async()=>{desk.dispose();server.closeAllConnections();await new Promise(ok=>server.close(ok));await rm(root,{recursive:true,force:true})})
  const roleId='jingyuniang', topic='sea'
  const pulse=()=>desk.call('companionpulse',{candidates:[{role:roleId,topic,place:'home'}]})
  const recall=async(role=roleId)=>JSON.parse((await desk.call('recall',{roleId:role,topic:'elsewhere',privateChat:true,query:'怎么画潮汐图？'})).context)
  await desk.call('configure',{roleId,baseUrl:'http://127.0.0.1:'+server.address().port,model:'local-test'})
  await desk.call('companionconfigure',{model:true})
  await desk.call('record',{roleId,id:'ebb',topic,user:'今天看退潮，'+evidence+'。',assistant:'这回看得真仔细。',privateChat:true})
  await pulse();at+=25*min
  assert.equal((await pulse()).letter,undefined)
  assert.equal(calls,1)
  at+=91*min;await pulse();assert.equal(calls,1)
  assert.deepEqual((await desk.call('state',{})).letters,[])
  desk.dispose();desk=createAgentWork(root)
  const remembered=await recall()
  assert.equal(remembered.companion.ownPosition.kind,'reflection')
  assert.equal(remembered.companion.ownPosition.evidence,evidence)
  assert.equal(remembered.companion.ownPosition.quote,thought)
  assert.ok(!JSON.stringify(remembered.userPortrait).includes(thought))
  assert.equal((await recall('shan')).companion.ownPosition,undefined)
  forged=true
  await desk.call('record',{roleId,id:'later',topic,user:'另外还想看看石阶的颜色。',assistant:'好。',privateChat:true})
  at+=25*min
  assert.equal((await pulse()).letter,undefined)
  assert.equal(calls,2)
  const db=new DatabaseSync(join(root,'employees.sqlite3'))
  try {
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM notes WHERE reflection IS NOT NULL').get().n,1)
    db.prepare('DELETE FROM notes WHERE id=?').run(remembered.companion.ownPosition.source)
    assert.equal((await recall()).companion.ownPosition,undefined)
  } finally {db.close()}
})
test('mood returns to baseline; each employee has a distinct voice, lived-in dialogue and contextual memory',async t=>{
  assert.equal(Object.keys(companionVoices).length,8)
  assert.equal(new Set(Object.values(companionVoices).map(v=>v.voice)).size,8)
  assert.equal(feeling({tone:turnTone('谢谢你，我很开心'),at:0},1000),'轻快')
  assert.equal(feeling({tone:-1,at:0},10*60*min),'平和')
  const root=await mkdtemp(join(tmpdir(),'luma-life-'))
  const desk=createAgentWork(root,undefined,undefined,()=>['jingyuniang','shan'])
  t.after(async()=>{desk.dispose();await rm(root,{recursive:true,force:true})})
  assert.equal((await desk.call('companionsettings',{})).settings.collectApps,false)
  await assert.rejects(desk.call('companionconfigure',{sharedRoles:['grok']}))
  await desk.call('record',{roleId:'jingyuniang',topic:'t',id:'old',user:'我喜欢深蓝色海岸线邮票',assistant:'把这份喜好写进手帐。'})
  await desk.call('record',{roleId:'shan',topic:'s',id:'foreign',user:'ONLY-SHAN 海岸线邮票',assistant:'仅自己的记忆'})
  for(let n=0;n<12;n++)await desk.call('record',{roleId:'jingyuniang',topic:'t',id:'filler'+n,user:'普通约定'+n,assistant:'收到'})
  const recalled=JSON.parse((await desk.call('recall',{roleId:'jingyuniang',topic:'t',query:'你记得我说的海岸线邮票吗？',privateChat:true})).context)
  assert.ok(recalled.related.some(r=>r.user.includes('深蓝色')))
  assert.ok(!JSON.stringify(recalled).includes('ONLY-SHAN'))
  assert.equal(recalled.companion.recentForegroundApps,undefined)
})


test('application summaries are absent until opted into the particular recipient and cleared immediately on revoke',async t=>{
  const f=fixture(t)
  const applications=[{app:'Example Studio',seconds:47}]
  let samplesStarted=0, enabled=false
  f.options.usage={pulse:()=>{samplesStarted++;enabled=true},stop:()=>{enabled=false},summary:()=>enabled?applications:[],status:()=>'ready'}
  f.options.unlocked=()=>['jingyuniang','shan']
  f.restart()
  assert.equal(samplesStarted,0)
  await f.pulse()
  assert.equal(samplesStarted,0)
  let p=f.get().configure({collectApps:true})
  assert.deepEqual(p.apps,applications)
  assert.deepEqual(p.settings.sharedRoles,[])
  assert.equal(f.get().privateContext('jingyuniang',true).recentForegroundApps,undefined)
  f.get().configure({sharedRoles:['jingyuniang']})
  assert.deepEqual(f.get().privateContext('jingyuniang',true).recentForegroundApps,applications)
  assert.equal(f.get().privateContext('shan',true).recentForegroundApps,undefined)
  assert.equal(f.get().privateContext('jingyuniang',false).recentForegroundApps,undefined)
  p=f.get().configure({collectApps:false})
  assert.deepEqual(p.settings.sharedRoles,[])
  assert.deepEqual(p.apps,[])
  assert.equal(enabled,false)
})

test('only explicit direct requests become role-owned conversation preferences and corrections survive replay, deletion and restart',async t=>{
  const root=await mkdtemp(join(tmpdir(),'luma-style-'))
  let desk=createAgentWork(root)
  t.after(async()=>{desk.dispose();await rm(root,{recursive:true,force:true})})
  const whale='jingyuniang'
  const send=(id,user,roleId=whale,privateChat=true)=>desk.call('record',{roleId,topic:'chat-'+roleId,id,user,assistant:'好，我听到了。',privateChat})
  const preferences=async(roleId)=>JSON.parse((await desk.call('recall',{roleId,topic:'chat-'+roleId,query:'今天想说点什么',privateChat:true})).context).companion.conversationPreferences
  await send('initial','下次先给结论，别叫我老板，少用表情。')
  await send('project','写一段包含「叫我大王」的舞台说明')
  await send('work','叫我组长',whale,false)
  for(let n=0;n<14;n++)await send('chat-'+n,'分享一下第'+n+'种颜色')
  desk.dispose();desk=createAgentWork(root)
  const original=await preferences(whale)
  assert.deepEqual(original.current,['避免称呼我为「老板」','少用表情','先给结论，再按需补充依据'])
  assert.deepEqual((await preferences('shan')).current,[])
  await send('change','改叫我小禾吧。以后先讲理由，再给结论。')
  assert.deepEqual((await preferences(whale)).current,['称呼我为「小禾」','少用表情','先说思路，再给结论'])
  const memory=await desk.call('memory',{roleId:whale})
  const item=memory.styles.find(row=>row.key==='address')
  await assert.rejects(desk.call('forgetstyle',{roleId:whale,key:'address',value:'old'}))
  const result=await desk.call('forgetstyle',{roleId:whale,key:item.key,value:item.value})
  assert.ok(!result.styles.some(row=>row.key==='address'))
  // Native sessions replay old turns on reload; a replay does not re-learn a withdrawn preference.
  await send('change','改叫我小禾吧。以后先讲理由，再给结论。')
  desk.dispose();desk=createAgentWork(root)
  const after=await preferences(whale)
  assert.deepEqual(after.withdrawn,['称呼'])
  assert.ok(!after.current.some(x=>x.includes('小禾')))
  await send('forget-emoji','撤回表情习惯')
  assert.deepEqual((await preferences(whale)).withdrawn.sort(),['称呼','表情习惯'].sort())
})

test('private prompts and voluntary model letters read the active style while group and handoff services get no private preferences',async t=>{
  const root=await mkdtemp(join(tmpdir(),'luma-life-provider-'))
  let at=new Date(2026,10,23,9,0).getTime()
  t.mock.method(Date,'now',()=>at)
  const desk=createAgentWork(root)
  const requests=[]
  const server=createServer(async(req,res)=>{
    let body=''
    for await(const chunk of req)body+=chunk
    const decoded=JSON.parse(body)
    requests.push(decoded)
    res.end(JSON.stringify({choices:[{message:{content:'刚才想到一件小事。'}}]}))
  }).listen(0,'127.0.0.1')
  await once(server,'listening')
  t.after(async()=>{desk.dispose();server.closeAllConnections();await new Promise(ok=>server.close(ok));await rm(root,{recursive:true,force:true})})
  const whale='jingyuniang', other='shan'
  for(const roleId of [whale,other])await desk.call('configure',{roleId,baseUrl:'http://127.0.0.1:'+server.address().port,model:roleId})
  await desk.call('record',{roleId:whale,topic:'personal',id:'style',user:'以后叫我琉璃海',assistant:'记住了。',privateChat:true})
  async function send(id,roleIds,topic,mode){
    await desk.call('run',{requestId:id,roleIds,topic,mode,text:'谈谈今天的计划',profiles:{}})
    for(let n=0;n<40;n++){
      const job=(await desk.call('state',{})).jobs.find(j=>j.id===id)
      if(job.status==='done')return
      await pause(30)
    }
    assert.fail('job did not finish')
  }
  await send('direct',[whale],'personal','chat')
  assert.ok(JSON.stringify(requests.at(-1)).includes('称呼我为「琉璃海」'))
  await send('other',[other],'personal-2','chat')
  assert.ok(!JSON.stringify(requests.at(-1)).includes('琉璃海'))
  const room=await desk.call('createroom',{requestId:'r',name:'工作室',roleIds:[whale,other]})
  await send('room',[whale],room.id,'chat')
  assert.ok(!JSON.stringify(requests.at(-1)).includes('琉璃海'))
  await send('relay',[whale,other],'handoff','team')
  assert.ok(requests.slice(-2).every(payload=>!JSON.stringify(payload).includes('琉璃海')))
  at+=21*min
  const candidate={candidates:[{role:whale,place:'office',topic:'personal'}]}
  await desk.call('companionconfigure',{model:true})
  await desk.call('companionpulse',candidate)
  at+=3*min
  const letter=await desk.call('companionpulse',candidate)
  assert.equal(letter.letter.source,'model')
  assert.ok(JSON.stringify(requests.at(-1)).includes('称呼我为「琉璃海」'))
})

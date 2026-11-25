import assert from 'node:assert/strict'
import {test} from 'node:test'
import {createServer} from 'node:http'
import {once} from 'node:events'
import {mkdtemp,rm} from 'node:fs/promises'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {setTimeout as pause} from 'node:timers/promises'
import {createAgentWork} from '../src/host/agent-work.ts'

async function until(fn) {
  for (let i=0;i<200;i++) {const result=await fn();if (result) return result;await pause(15)}
  assert.fail('Timed out waiting for the host result')
}
async function fixture(t,respond=()=> '已完成。') {
  const root=await mkdtemp(join(tmpdir(),'luma-portrait-'))
  const requests=[]
  const server=createServer(async(req,res)=>{
    let body=''
    for await (const chunk of req) body+=chunk
    const payload=JSON.parse(body)
    requests.push(payload)
    res.end(JSON.stringify({choices:[{message:{content:await respond(payload)}}]}))
  }).listen(0,'127.0.0.1')
  await once(server,'listening')
  let desk=createAgentWork(root)
  t.after(async()=>{desk.dispose();server.closeAllConnections();await new Promise(ok=>server.close(ok));await rm(root,{recursive:true,force:true})})
  const call=(action,body)=>desk.call(action,body)
  const roles=['jingyuniang','shan']
  for (const roleId of roles) await call('configure',{roleId,model:roleId,baseUrl:'http://127.0.0.1:'+server.address().port})
  async function run(id,roleIds,topic,mode,text) {
    await call('run',{requestId:id,roleIds,topic,mode,text,profiles:{
      jingyuniang:{name:'鲸鱼娘',personality:'用潮汐手帐简短记录。'},
      shan:{name:'珊',personality:'爱从色彩说起。'}
    }})
    await until(async()=> (await call('state',{})).jobs.find(j=>j.id===id)?.status==='done')
  }
  return {call,requests,roles,run,restart(){desk.dispose();desk=createAgentWork(root)}}
}
test('chat and assignment keep the bound voice and scoped portrait after actual job deletion, restart, correction and withdrawal',async t=>{
  const {call,roles:[whale,other],requests,run,restart}=await fixture(t)
  await run('origin',[whale],'work-topic','task','我的默认格式是海蓝手帐。请整理本次的潮位表。')
  const view=(roleId)=>call('portrait',{roleId})
  assert.equal((await view(whale)).items[0].source,'work')
  await call('deletejob',{id:'origin'})
  assert.equal((await view(whale)).remoteRecall,'unbound')
  assert.equal((await call('state',{})).jobs.some(j=>j.id==='origin'),false)
  assert.equal((await call('memory',{roleId:whale})).entries.length,0)
  restart()
  await Promise.all([run('after-chat',[whale],'new-chat','chat','你还记得我的格式吗？'),run('parallel',[other],'separate','task','说说你记得什么？')])
  let payload=requests.findLast(p=>p.model===whale)
  assert.match(payload.messages[0].content,/潮汐手帐/)
  assert.match(payload.messages[1].content,/海蓝手帐/)
  const separate=requests.findLast(p=>p.model===other)
  assert.match(separate.messages[0].content,/爱从色彩说起/)
  assert.doesNotMatch(JSON.stringify(separate),/海蓝手帐|潮汐手帐/)
  await run('work',[whale],'next-job','task','按我惯用的格式起草。')
  payload=requests.at(-1)
  assert.match(payload.messages[0].content,/潮汐手帐/)
  assert.match(payload.messages[1].content,/海蓝手帐/)
  const room=await call('createroom',{requestId:'scope',name:'排版群',roleIds:[whale,other]})
  await run('group',[whale],room.id,'task','以后群稿统一使用星轨版。')
  assert.doesNotMatch(JSON.stringify(requests.at(-1)),/海蓝手帐/)
  await run('group-again',[whale],room.id,'task','按上次的来。')
  assert.match(requests.at(-1).messages[1].content,/星轨版/)
  assert.equal((await view(other)).items.length,0)
  const recall=async()=>JSON.parse((await call('recall',{roleId:whale,topic:'fresh',query:'格式'})).context)
  assert.doesNotMatch(JSON.stringify(await recall()),/星轨版/)
  const original=(await view(whale)).items.find(i=>i.scope==='private')
  const current=(await call('portraitedit',{roleId:whale,id:original.id,revision:original.revision,text:'我的默认格式是素白笔记'})).items.find(i=>i.id===original.id)
  assert.match(JSON.stringify(await recall()),/素白笔记/)
  await assert.rejects(call('portraitforget',{roleId:whale,id:original.id,revision:original.revision}),/已有变化/)
  await call('portraitforget',{roleId:whale,id:current.id,revision:current.revision})
  await assert.rejects(call('portraitedit',{roleId:other,id:current.id,revision:current.revision,text:'OTHER'}))
  restart()
  assert.doesNotMatch(JSON.stringify(await recall()),/海蓝手帐|素白笔记|星轨版/)
  await call('record',{roleId:whale,topic:'late-replay',id:'late',user:'我的默认格式是海蓝手帐。',assistant:'好的。'})
  assert.doesNotMatch(JSON.stringify(await recall()),/海蓝手帐|素白笔记/)
  await call('remember',{roleId:whale,text:'我的默认格式是白瓷信纸。'})
  assert.match(JSON.stringify((await recall()).userPortrait),/白瓷信纸/)
})

test('only direct user evidence and three distinct repeated requests form automatic portraits',async t=>{
  const {call,roles:[roleId,other]}=await fixture(t)
  const record=(id,user,assistant='收到')=>call('record',{id,roleId,topic:'a',user,assistant})
  const list=async()=>(await call('portrait',{roleId})).items
  await record('one','今天试试海盐蓝。','我的默认语言是火星文。')
  await record('two','这是示例：我的职业是火星园丁。')
  await record('secret','我的密码是 SAMPLE_SECRET。')
  await record('question','我的默认语言是中文吗？我的昵称是什么？')
  const recurring='请使用双栏格式'
  await record('three',recurring);await record('three',recurring);await record('four',recurring)
  assert.deepEqual(await list(),[])
  await record('five',recurring)
  assert.equal((await list())[0].count,3)
  assert.equal((await list())[0].kind,'repeated')
  await record('six','我的默认语言是中文。')
  await record('seven','我的默认语言改为日语。')
  assert.equal((await list()).filter(item=>item.text.includes('默认语言')).length,1)
  assert.match((await list()).find(item=>item.text.includes('默认语言')).text,/日语/)
  await call('portraitconfigure',{roleId,automatic:false,modelReview:false})
  await record('eight','我的昵称是粉红海星。')
  assert.doesNotMatch(JSON.stringify(await list()),/粉红海星|SAMPLE_SECRET|火星/)
  assert.deepEqual((await call('portrait',{roleId:other})).items,[])
})

test('a new private chat receives query-relevant, source-labelled facts from deleted work, independently of transcript recency',async t=>{
  const {call,roles:[role,other],run,restart,requests}=await fixture(t)
  const read=(p)=>JSON.parse(p.messages[1].content.split('\n')[1]).context
  await run('shared-work',[role,other],'handoff','team','我的长期偏好是在青芜编校簿-P38中将校样眉签写为雾蓝松枝9314。')
  await call('record',{roleId:role,topic:'side',id:'aux',user:'我的长期偏好是在青芜编校簿-P38中将封面角标写为茶青棋盘1763。',assistant:'收到。'})
  await call('record',{roleId:role,topic:'old',id:'today',user:'今天青芜编校簿-P38的校样眉签临时试用朱墨9271。',assistant:'仅用于当天。'})
  for (let n=0;n<22;n++) await call('remember',{roleId:role,text:'常备工具柜标为ZAPP'+n})
  await call('deletejob',{id:'shared-work'})
  restart()
  await run('blind',[role],'empty','chat','我们在青芜编校簿-P38中亲自约定过哪些编校取值？校样眉签、封面角标与索引呢？')
  const prompt=requests.at(-1), context=read(prompt)
  assert.equal(typeof context,'object')
  assert.deepEqual(context.userPortrait.map(({text,source})=>[text.match(/写为(.+)/)[1],source]).sort(),[['茶青棋盘1763','chat'],['雾蓝松枝9314','work']].sort())
  assert.deepEqual(context.previous,[])
  assert.doesNotMatch(JSON.stringify(context),/ZAPP|朱墨9271/)
  assert.match(prompt.messages[0].content,/work 来自你亲自参与的工作/)
  await run('unrelated',[role],'another','chat','烤栗子要预热多久？')
  assert.deepEqual(read(requests.at(-1)).userPortrait,[])
  await run('other-check',[other],'other-empty','chat','青芜编校簿-P38的封面角标和校样眉签定了什么？')
  assert.doesNotMatch(JSON.stringify(read(requests.at(-1))),/茶青棋盘1763/)
})

test('a participant recalls only an explicit personal project preference from a room, using its original edited or withdrawn item',async t=>{
  const ask='青芜编校簿-P38的清样页脚和标稿偏好是什么？'
  const {call,roles:[member,other],run,restart,requests}=await fixture(t,p=>p.messages.at(-1).content===ask?'当时定了叶纹2481。':'已完成。')
  const room=await call('createroom',{requestId:'first',name:'海岛',roleIds:[member,other]})
  const another=await call('createroom',{requestId:'second',name:'北岸',roleIds:[member,other]})
  const facts=async(roleId,query=ask,privateChat=true)=>JSON.parse((await call('recall',{roleId,query,topic:'empty',privateChat})).context)
  await run('team-source',[member],room.id,'task','我的长期偏好是在青芜编校簿-P38中将清样页脚写为叶纹2481。以后本群群稿统一标为群规代码-7788。')
  await run('only-chat',[member],room.id,'chat','我的长期偏好是在青芜编校簿-P38中将目录角标写为漆金7662。')
  await run('ordinary',[member],room.id,'task','我喜欢在邮件里看到紫色信封6247。')
  await run('room-two',[member],another.id,'task','我的长期偏好是在青芜编校簿-P389中将清样页脚写为密苑5196。')
  await call('deletejob',{id:'team-source'})
  restart()
  let view=await facts(member)
  assert.equal(view.userPortrait.length,1)
  assert.equal(view.userPortrait[0].source,'work')
  assert.equal(view.userPortrait[0].participation,'own-project-work')
  assert.match(view.userPortrait[0].text,/叶纹2481/)
  assert.doesNotMatch(JSON.stringify(view),/群规代码|漆金7662|密苑5196|紫色信封|room-first|海岛/)
  for (const query of ['我的偏好','看看我的笔记','说说清样页脚','想查邮件','青芜编校簿-P389的资料']) {
    assert.doesNotMatch(JSON.stringify(await facts(member,query)),/叶纹2481|紫色信封/)
  }
  assert.doesNotMatch(JSON.stringify(await facts(other)),/叶纹2481/)
  assert.doesNotMatch(JSON.stringify(await facts(member,ask,false)),/叶纹2481/)
  await run('actually-chatted',[member],'ask-directly','chat',ask)
  assert.match(requests.at(-1).messages[1].content,/叶纹2481/)
  assert.doesNotMatch(JSON.stringify(await facts(member,'看看我的笔记')),/叶纹2481/)
  await call('recall',{roleId:member,topic:'native-topic',journalId:'native-turn',privateChat:true,query:ask})
  await call('record',{roleId:member,topic:'native-topic',id:'native-turn',user:ask,assistant:'这是原先一起敲定的叶纹2481。',privateChat:true})
  assert.match(JSON.stringify((await call('memory',{roleId:member})).entries),/原先一起敲定/)
  for (const q of ['看看我的笔记','青芜编校簿-P389的清样页脚是什么？']) assert.doesNotMatch(JSON.stringify(await facts(member,q)),/叶纹2481/)
  const list=async()=>(await call('portrait',{roleId:member})).items
  const item=(await list()).find(i=>i.text.includes('叶纹2481'))
  assert.equal(item.scope,room.id)
  assert.ok(!(await list()).some(i=>i.scope==='private' && i.text.includes('叶纹2481')))
  await call('record',{roleId:member,topic:'echo',id:'echo',user:'青芜编校簿-P38原定的页脚是什么？',assistant:'叶纹2481。'})
  await call('portraitedit',{roleId:member,id:item.id,revision:item.revision,text:'我的长期偏好是在青芜编校簿-P38中将清样页脚写为水纹5917'})
  view=await facts(member)
  assert.equal(view.userPortrait[0].source,'manual')
  assert.match(view.userPortrait[0].text,/水纹5917/)
  assert.doesNotMatch(JSON.stringify(view),/叶纹2481/)
  const edited=(await list()).find(i=>i.id===item.id)
  await call('portraitforget',{roleId:member,id:item.id,revision:edited.revision})
  restart()
  assert.doesNotMatch(JSON.stringify(await facts(member)),/水纹5917|叶纹2481/)
})

test('general personal preferences follow their participant into an on-topic DM; arbitrary named projects retain their qualifier',async t=>{
  const {call,roles:[role,peer],run,restart}=await fixture(t)
  const room=await call('createroom',{requestId:'red',name:'图文排版',roleIds:[role,peer]})
  const recall=async(query,roleId=role)=>JSON.parse((await call('recall',{roleId,topic:'dm',privateChat:true,query})).context).userPortrait
  await run('general',[role],room.id,'task','我喜欢交付清单先写结论，再列风险。请据此整理。')
  await run('named',[role],room.id,'task','我的长期偏好是在《红茶》项目中将标题写为竖排青字。')
  await run('room-rule',[role],room.id,'task','以后交付清单统一列出内部合同编号。')
  await call('deletejob',{id:'general'}); await call('deletejob',{id:'named'})
  restart()
  assert.match(JSON.stringify(await recall('这份交付清单怎么排？')),/先写结论，再列风险/)
  assert.doesNotMatch(JSON.stringify(await recall('这份交付清单怎么排？')),/内部合同|竖排/)
  assert.match(JSON.stringify(await recall('《红茶》项目的标题怎么设置？')),/竖排青字/)
  for(const query of ['《绿茶》项目的标题怎么设置？','《红茶拿铁》项目的标题怎么设置？','红茶拿铁项目的标题怎么设置？','你记得我的哪些偏好？','这次私人聚餐选哪家？']) {
    assert.deepEqual(await recall(query),[])
  }
  assert.deepEqual(await recall('这份交付清单怎么排？',peer),[])
  const item=(await call('portrait',{roleId:role})).items.find(i=>i.text.includes('先写结论'))
  await call('portraitedit',{roleId:role,id:item.id,revision:item.revision,text:'我喜欢交付清单先列风险，再写结论'})
  const revised=await recall('这份交付清单怎么排？')
  assert.match(JSON.stringify(revised),/先列风险，再写结论/)
  assert.doesNotMatch(JSON.stringify(revised),/先写结论，再列风险/)
})

test('editing and withdrawing fact A preserves unrelated original evidence B in private and group recall after restart',async t=>{
  const {call,roles:[roleId,other],run,restart,requests}=await fixture(t)
  const view=()=>call('portrait',{roleId})
  const record=(id,user,assistant)=>call('record',{id,topic:'private',roleId,user,assistant})
  const recent=async()=>JSON.stringify(JSON.parse((await call('recall',{roleId,query:'笔记',topic:'new'})).context).previous)
  await record('kept','我的昵称是北窗。','私聊独立原始回执 B')
  await record('remove','我的默认格式是月白折页。','私聊待撤回的原始回执 A')
  await record('echo','那我上次用哪款？','上次是月白折页。')
  const edit=async(scope,action,text)=>{
    const item=(await view()).items.find(i=>i.scope===scope && i.text.includes('格式'))
    await call(action,{roleId,id:item.id,revision:item.revision,text})
  }
  await edit('private','portraitedit','我的默认格式是云纹底稿')
  assert.match(await recent(),/独立原始回执 B/)
  assert.doesNotMatch(await recent(),/原始回执 A|月白折页/)
  await edit('private','portraitforget')
  const room=await call('createroom',{requestId:'scope-precision',name:'双栏小组',roleIds:[roleId,other]})
  await run('room-kept',[roleId],room.id,'task','以后群稿统一提供摘要。独立群稿原文 B。')
  await run('room-removed',[roleId],room.id,'task','我的默认格式是深海索引。需要撤回的群稿 A。')
  await edit(room.id,'portraitedit','新格式采用云纹')
  await run('check-edited',[roleId],room.id,'chat','查旧稿')
  assert.match(requests.at(-1).messages[1].content,/独立群稿原文 B/)
  assert.doesNotMatch(requests.at(-1).messages[1].content,/需要撤回的群稿 A|深海索引/)
  await edit(room.id,'portraitforget')
  restart()
  assert.match(await recent(),/独立原始回执 B/)
  assert.doesNotMatch(await recent(),/原始回执 A|月白折页/)
  await run('check-forgotten',[roleId],room.id,'chat','再查旧稿')
  assert.match(requests.at(-1).messages[1].content,/独立群稿原文 B/)
  assert.doesNotMatch(requests.at(-1).messages[1].content,/需要撤回的群稿 A|深海索引/)
  assert.equal((await view()).remoteRecall,'unbound')
})
test('opted-in four-turn reflection uses just that role’s user text, checks quotes, and never retains a model invention without a matching source',async t=>{
  const {call,requests,roles:[roleId,other]}=await fixture(t,p=>{
    const batch=JSON.parse(p.messages.at(-1).content)
    const id=batch[0].id
    return JSON.stringify([{id,quote:'蓝标签贴在左侧',summary:'用户是左撇子。'},{id,quote:'用户来自火星',summary:'错误猜测。'}])
  })
  const record=(role,id,user)=>call('record',{id,roleId:role,topic:'new-session',user,assistant:'ASSISTANT-ONLY'})
  await call('portraitconfigure',{roleId,automatic:true,modelReview:true})
  await record(other,'other','OTHER-PRIVATE-TEXT')
  await record(roleId,'first','蓝标签贴在左侧，是老习惯了。')
  await record(roleId,'second','明天再来看。')
  await record(roleId,'third','这次的脸谱换个配色。')
  assert.equal(requests.length,0)
  await record(roleId,'fourth','我的密码是 DO_NOT_SEND。')
  const receipt=await until(async()=> (await call('portrait',{roleId})).items.find(item=>item.kind==='model'))
  assert.equal(receipt.evidence,'蓝标签贴在左侧')
  assert.equal(receipt.text,'蓝标签贴在左侧')
  assert.equal(requests.length,1)
  assert.doesNotMatch(JSON.stringify(requests),/DO_NOT_SEND|OTHER-PRIVATE-TEXT|ASSISTANT-ONLY/)
  assert.doesNotMatch(JSON.stringify(await call('portrait',{roleId})),/火星|错误猜测|左撇子/)
})

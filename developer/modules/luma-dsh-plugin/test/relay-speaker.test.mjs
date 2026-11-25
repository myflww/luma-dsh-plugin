import assert from 'node:assert/strict'
import { once } from 'node:events'
import { mkdtemp, rm } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { setTimeout as wait } from 'node:timers/promises'
import test from 'node:test'
import { createAgentWork } from '../src/host/agent-work.ts'
import { relayNeedsRevision, relaySpeakerInstruction } from '../src/host/relay-speaker.ts'

const names={jingyuniang:'鲸鱼娘',shan:'端木嫣','lu-mi':'陆弥','bai-shuangming':'白霜命'}
const ids=Object.keys(names)
const first='鲸鱼娘：我核了一遍，数字依次是一二三四。'
const writtenForPeers='鲸鱼娘：我核过了。\n陆弥：我会保留紧凑排法。\n白霜命：字形无误。\n端木嫣：颜色已对齐。'
const turn={actor:'shan',names,earlier:[{employee:'jingyuniang',output:first}],
  history:[{employee:'lu-mi',output:'我偏左边，因为页边有余量。'}],task:'请四位伙伴接力校对这个公共栏目，每人各用自己平时的口吻交付一句校对意见。',final:false}

test('recognizes unattributed roster dialogue while preserving actual published sources, quotes, summaries, code and requested scripts',()=>{
  const check=(answer,extra={})=>relayNeedsRevision(answer,{...turn,...extra})
  assert.equal(check(writtenForPeers),true)
  assert.equal(check('白霜命：字形无误。'),true)
  assert.equal(check('**陆弥**：我已经提交完了。',{task:'一起复核排版。'}),true)
  assert.equal(check('**陆弥：** 我已经替你提交了。'),true)
  assert.equal(check('【陆弥】我已经提交完了。'),true)
  assert.equal(check('【陆弥（排版）】我已经提交了。'),true)
  assert.equal(check('### 陆弥\n我已经提交了。'),true)
  assert.equal(check('陆弥：我已改好。',{names:{...names,'lu-mi':'小弥'},officialNames:names}),true)
  assert.equal(check('【校样_v2】我已改好。',{names:{...names,'lu-mi':'校样_v2'},officialNames:names}),true)
  assert.equal(check('ＬＵ－ＭＩ：我代大家提交了。'),true)
  assert.equal(check('**陆弥**：我偏**左边**，因为页边有余量。'),false)
  assert.equal(check('陆弥：我偏左边，层次清楚。',{sourceTexts:['记录：我偏**左边**，层次清楚。']}),false)
  assert.equal(check(first+'\n端木嫣：字体整齐。'),false)
  assert.equal(check('陆弥：我偏左边，因为页边有余量。\n我同意。'),false)
  assert.equal(check('> 陆弥：我选版本一。\n\n我建议比较字号。'),false)
  assert.equal(check('```text\n'+writtenForPeers+'\n```'),false)
  assert.equal(check('~~~yaml\n'+writtenForPeers+'\n~~~'),false)
  assert.equal(check(writtenForPeers,{task:'请创作一段剧本，让组内四人每人一句，保留姓名。'}),false)
  assert.equal(check(writtenForPeers,{task:'Draft a sample dialogue using the four members.'}),false)
  assert.equal(check(writtenForPeers,{task:'接着上回那稿继续。',previousRequest:'创作四人登场的两幕短剧。'}),false)
  assert.equal(check('第二幕\n内景 · 夏末\n'+writtenForPeers,{task:'把前一稿写完。'}),false)
  assert.equal(check(writtenForPeers,{task:'按批注校订附件全文，保持原有署名。'}),false)
  assert.equal(check(writtenForPeers,{task:'每人给出一条校对意见，不要写成剧本。'}),true)
  assert.equal(check('稿件已整理。\n作者：鲸鱼娘\n插图：陆弥'),false)
  assert.equal(check('鲸鱼娘：检查数字。\n陆弥：考虑留白。',{final:true,task:'每人给一句建议，最后汇总各自重点。'}),false)
  assert.equal(check('陆弥：负责排版。\n白霜命：负责核验。',{task:'请给四位成员安排职责。'}),false)
  assert.equal(check('合作方：我认为可行。'),false)
  assert.equal(check('同名：我会检查。',{names:{...names,shan:'同名','lu-mi':'同名'}}),false)
  assert.match(relaySpeakerInstruction(turn),/当前发言者是端木嫣/)
  assert.match(relaySpeakerInstruction({...turn,final:true}),/若用户要求逐人各说一句/)
})

test('real relay entry point repairs only the speaker text, never re-executes a desktop and never forwards or saves another member’s invented answer',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'luma-speakers-'))
  const calls=[],charges=[],desktopRuns=[]
  let persistInvalid=false
  const desktop={async run(window,messages,model,signal){desktopRuns.push(window);return model(messages,signal)}}
  const desk=createAgentWork(dir,undefined,undefined,undefined,false,undefined,(id,key)=>charges.push([id,key]),desktop)
  const db=new DatabaseSync(join(dir,'employees.sqlite3'))
  const endpoint=createServer(async(req,res)=>{
    let body=''
    for await(const chunk of req)body+=chunk
    const {model,messages}=JSON.parse(body)
    const correction=messages.at(-1).content.includes('刚才的草稿')
    const question=messages.find(m=>m.content===turn.task)
    calls.push({model,correction,messages})
    const answer=model==='jingyuniang'?first
      : model==='shan' && question ? correction && !persistInvalid ? '颜色已对齐。' : writtenForPeers
      : model==='lu-mi' && question ? '我会保留紧凑排法。' : model==='bai-shuangming' && question ? '「笺」字与数字无空格。' : writtenForPeers
    res.setHeader('Content-Type','application/json')
    res.end(JSON.stringify({choices:[{message:{content:answer}}],usage:{total_tokens:2}}))
  }).listen(0,'127.0.0.1')
  await once(endpoint,'listening');t.after(async()=>{desk.dispose();db.close();endpoint.closeAllConnections();await new Promise(ok=>endpoint.close(ok));await rm(dir,{recursive:true,force:true})})
  for(const id of ids)await desk.call('configure',{roleId:id,baseUrl:'http://127.0.0.1:'+endpoint.address().port,model:id})
  const room=await desk.call('createroom',{requestId:'editors',name:'校对室',roleIds:ids})
  const key='1'.repeat(64)
  const read=db.prepare('SELECT value FROM jobs WHERE id=?')
  async function run(id,topic,options={}){
    await desk.call('run',{requestId:id,topic,roleIds:ids,mode:'team',text:turn.task,...options})
    for(let i=0;i<600;i++){
      const job=JSON.parse(read.get(id).value)
      if(['done','failed'].includes(job.status))return job
      await wait(10)
    }
    assert.fail('Relay timed out')
  }
  const result=await run('verified',room.id,{desktopTargets:{shan:key}})
  assert.equal(result.status,'done',result.error)
  assert.deepEqual(result.steps.map(s=>s.output),[first,'颜色已对齐。','我会保留紧凑排法。','「笺」字与数字无空格。'])
  assert.deepEqual(desktopRuns,[key])
  assert.deepEqual(calls.map(c=>[c.model,c.correction]),[['jingyuniang',false],['shan',false],['shan',true],['lu-mi',false],['bai-shuangming',false]])
  const downstream=calls.find(c=>c.model==='lu-mi').messages
  assert.match(JSON.stringify(downstream),/颜色已对齐。/)
  assert.doesNotMatch(JSON.stringify(downstream),/我核过了。/)
  assert.equal(charges.filter(([id])=>id==='shan').length,2)
  assert.equal(new Set(charges.filter(([id])=>id==='shan').map(([,key])=>key)).size,2)

  persistInvalid=true
  const failed=await run('repeated','one-off')
  assert.equal(failed.status,'failed')
  assert.match(failed.error,/当前成员自己的接力发言/)
  assert.equal(failed.steps[1].output,'')
  assert.equal(failed.steps[2].status,'cancelled')
  assert.equal(calls.filter(c=>c.model==='shan'&&c.correction).length,2)
  const script=await run('play',room.id,{text:'请编写一段四位角色参加的剧本。'})
  assert.equal(script.status,'done')
  assert.equal(script.steps[1].output,writtenForPeers)
  assert.equal(calls.filter(c=>c.model==='shan' && c.correction).length,2)
})

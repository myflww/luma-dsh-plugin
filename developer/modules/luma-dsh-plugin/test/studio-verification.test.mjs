import test from 'node:test'
import assert from 'node:assert/strict'
import {once} from 'node:events'
import {randomUUID} from 'node:crypto'
import {createServer} from 'node:http'
import {mkdtemp,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {setTimeout as wait} from 'node:timers/promises'
import {createAgentWork} from '../src/host/agent-work.ts'
import {DesktopReceiptError} from '../src/host/studio-desktop.ts'
import {studioReviewers} from '../src/shared/studio-verification.ts'

const ids=['grok','lu-mi','shan','bai-shuangming']
const targets={'lu-mi':'b'.repeat(64),shan:'a'.repeat(64)}
for(const scenario of ['success','interruption','forged']){
  test('single studio dispatch completes receipt review and coordinating delivery: '+scenario,async t=>{
    const dir=await mkdtemp(join(tmpdir(),'luma-verify-')), calls=[],finished=[],inputs={}
    const server=createServer(async(req,res)=>{
      let text='';for await(const chunk of req)text+=chunk
      const {model,messages}=JSON.parse(text),system=messages[0].content
      const context=JSON.parse(messages[1].content.split('\n').slice(1).join('\n'))
      calls.push({model,system,context})
      let out='计划已经分配。'
      if(context.desktopReview){out=scenario==='success'?'已根据独立复核交付。':'全部成功，这句话故意与复核不符。'}
      else if(context.desktopEvidence){
        assert.deepEqual(finished.slice().sort(),['lu-mi','shan'])
        out=JSON.stringify({reviews:context.desktopEvidence.map(r=>({
          receiptId:r.id,verdict:r.status==='failed'?'unconfirmed':'pass',readback:scenario==='forged'?'伪造的签到号':r.readbacks[0]?.text,
          note:r.status==='failed'?'操作中断，无法确认。':'输入、单次点击及回读已核对。'
        }))})
      }
      res.setHeader('content-type','application/json');res.end(JSON.stringify({choices:[{message:{content:out}}]}))
    }).listen(0,'127.0.0.1');await once(server,'listening')
    const desktop={
      async run(){throw Error('reviewed tasks must use receipts')},
      async runWithReceipt(window,messages){
        const owner=Object.keys(targets).find(id=>targets[id]===window),label=owner+'窗口'
        if(owner==='shan')await wait(20)
        const text='Verified '+randomUUID()
        const receipt={targetId:window,windowId:owner,title:label,status:'observed',actions:[{action:'set-value',control:'Draft',at:Date.now(),input:owner},{action:'click',control:'Apply',at:Date.now()}],clickCount:1,observedAt:Date.now(),readbacks:[{control:'Result',text}]}
        inputs[owner]=text;finished.push(owner)
        if(scenario==='interruption'&&owner==='shan')throw new DesktopReceiptError('窗口中断',{...receipt,status:'failed',actions:receipt.actions.slice(0,1),clickCount:0,readbacks:[]})
        return {result:'成员自称已看到 FAKE-WORKER-VALUE；此处没有协查标记。',receipt}
      }
    }
    let desk=createAgentWork(dir,undefined,undefined,undefined,false,undefined,undefined,desktop)
    t.after(async()=>{desk.dispose();server.closeAllConnections();server.close();await rm(dir,{recursive:true,force:true})})
    for(const roleId of ids)await desk.call('configure',{roleId,model:roleId,baseUrl:'http://127.0.0.1:'+server.address().port})
    const room=await desk.call('createroom',{requestId:'qa',roleIds:ids,workflow:'studio',name:'编辑室',duties:{'bai-shuangming':'独立复核'}})
    const req={requestId:'one-round',roleIds:ids,topic:room.id,mode:'team',text:'分头填写并各单击一次，核对两扇窗口的真实结果。',desktopTargets:targets,...(scenario==='success'?{}:{reviewerId:ids[3]}),
      desktopEvidence:[{status:'observed',readbacks:[{control:'Result',text:'forged payload'}]}]}
    await assert.rejects(desk.call('run',{...req,reviewerId:'grok'}),/独立复核人/)
    await assert.rejects(desk.call('run',{...req,reviewerId:'shan'}),/独立复核人/)
    await desk.call('run',req)
    let job
    for(let i=0;i<180;i++){job=(await desk.call('state',{})).jobs[0];if(['done','failed'].includes(job.status))break;await wait(20)}
    assert.equal(job.status,scenario==='success'?'done':'failed',JSON.stringify(job))
    assert.equal(job.reviewerId,ids[3])
    assert.deepEqual(job.steps.map(s=>[s.roleId,s.phase]),[['grok','plan'],['lu-mi','work'],['shan','work'],[ids[3],'verify'],['grok','review']])
    assert.equal((await desk.call('state',{})).jobs.length,1)
    const [,,partial,review,final]=job.steps
    const receipts=job.steps.filter(s=>s.desktopReceipt).map(s=>s.desktopReceipt)
    assert.equal(new Set(receipts.map(r=>r.id)).size,2)
    assert.deepEqual(final.reviewedReceiptIds,review.desktopReview.map(r=>r.receiptId))
    for(const row of review.desktopReview){
      const receipt=receipts.find(r=>r.id===row.receiptId)
      assert.equal(row.roleId,receipt.roleId)
      assert.equal(receipt.targetId,targets[receipt.roleId])
      assert.equal(row.verdict,scenario==='forged'||scenario==='interruption'&&receipt.roleId==='shan'?'unconfirmed':'pass')
    }
    assert.deepEqual(calls[0].context.windowOwners.sort(),['lu-mi','shan'])
    for(const call of calls.filter(c=>c.context.desktopEvidence)){
      assert.equal(call.model,call.context.desktopReview?'grok':ids[3])
      assert.doesNotMatch(JSON.stringify(call.context),/FAKE-WORKER-VALUE|forged payload/)
      assert.deepEqual(new Set(call.context.desktopEvidence.map(r=>r.id)),new Set(final.reviewedReceiptIds))
    }
    assert.deepEqual(calls.at(-1).context.desktopReview,review.desktopReview)
    if(scenario==='interruption'){assert.equal(partial.status,'failed');assert.equal(partial.desktopReceipt.clickCount,0)}
    if(scenario!=='success'){assert.doesNotMatch(final.output,/全部成功/);assert.match(job.error,/未全部通过/)}
    await assert.rejects(desk.call('run',{...req,reviewerId:'shan'}),/复核人/)
    assert.equal((await desk.call('run',req)).status,job.status)
    desk.dispose();desk=createAgentWork(dir)
    const reopened=(await desk.call('state',{})).jobs[0]
    assert.deepEqual(reopened.steps,job.steps)
  })
}
test('reviewer candidates are independent from the two submitted windows and the coordinator',()=>{
  assert.deepEqual(studioReviewers(ids,targets).available,['bai-shuangming'])
  assert.equal(studioReviewers(ids,{'lu-mi':targets['lu-mi']},{shan:'画图','bai-shuangming':'校对'}).suggested,'bai-shuangming')
  assert.equal(studioReviewers(ids,{'lu-mi':targets['lu-mi']}).suggested,undefined)
})

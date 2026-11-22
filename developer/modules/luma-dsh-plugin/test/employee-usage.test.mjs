import assert from 'node:assert/strict'
import { test } from 'node:test'
import { DatabaseSync } from 'node:sqlite'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createEmployeeUsage, providerUsageTotal, sessionRoleTokens } from '../src/host/employee-usage.ts'

const whale = 'luma-jingyuniang', shan = 'luma-duanmu-yan'
const usage = (inputTokens,outputTokens=0) => ({inputTokens,outputTokens})
const settle = (turn,step,sample) => ({type:'assistant/message', data:{turn,step,usage:sample}})
const switchTo = agentPreset => ({type:'agent-preset/selected', data:{agentPreset}})
const partial = (turn,step,sample) => ({type:'assistant/attempt', data:{turn,step,stream:[{type:'chunk',chunk:{type:'usage',usage:sample}}]}})

test('matches DSH disjoint buckets, retry boundaries, last samples, fork ownership and per-step role attribution', () => {
  const session = {id:'mixed',agentPreset:whale}
  const events = [settle(0,1,usage(999)),partial(1,1,usage(100)),settle(1,1,{...usage(90,20),cacheReadTokens:20,cacheWriteTokens:1,reasoningTokens:6}),
    {type:'llm/retry-started',data:{turn:1,step:1}},partial(1,1,usage(8,2)),settle(1,1,usage(9,2)),
    switchTo(shan),settle(2,1,usage(15,3)),switchTo('standard'),settle(3,1,usage(4000))]
  assert.deepEqual(Object.fromEntries(sessionRoleTokens({session,events,inheritedEventCount:1})),{jingyuniang:142,shan:18})
  assert.equal(providerUsageTotal('openai',{usage:{total_tokens:15,prompt_tokens:9,completion_tokens:6}}),15)
  assert.equal(providerUsageTotal('anthropic',{usage:{input_tokens:7,output_tokens:3,cache_read_input_tokens:8,cache_creation_input_tokens:2}}),20)
  assert.equal(providerUsageTotal('gemini',{usageMetadata:{totalTokenCount:50,thoughtsTokenCount:15,cachedContentTokenCount:4}}),50)
  assert.equal(providerUsageTotal('openai',{}),undefined)
})

test('backfills 10.2K, deduplicates claims and same-step callbacks across restart, isolates profiles and preserves unspent remainders per employee', async t => {
  const root=await mkdtemp(join(tmpdir(),'luma-usage-'))
  const homes={jingyuniang:join(root,'old-desktop','luma-plugin','characters','jingyuniang')}
  const foreign=join(root,'other','luma-plugin','characters','jingyuniang')
  const records = new Map()
  const put = (id,cwd,agentPreset,events) => records.set(id,{session:{id,cwd,agentPreset},events})
  put('whale',homes.jingyuniang,whale,[settle(1,0,usage(9886,312))])
  put('other',foreign,whale,[settle(1,0,usage(6_000_000))])
  put('unverified',root,whale,[settle(1,0,usage(7_000_000))])
  const query={listSessions:async()=>[...records.values()].map(({session:header})=>({header,live:false})),readSession:async id=>records.get(id)}
  const file=join(root,'wallet.sqlite')
  let db=new DatabaseSync(file),meter=createEmployeeUsage(db,query,homes)
  t.after(async()=>{meter.dispose();db.close();await rm(root,{recursive:true,force:true})})
  const first=await meter.progress()
  assert.deepEqual(first.roles.jingyuniang,{totalTokens:10198,earnedCoins:0,remainderTokens:10198})
  meter.recordModelUsage('jingyuniang','job:1',1_000_002)
  meter.recordModelUsage('jingyuniang','job:1',1_000_002)
  meter.recordModelUsage('shan','job:1',700000)
  assert.equal(meter.snapshot().roles.shan.earnedCoins,0)
  meter.dispose(); db.close(); db=new DatabaseSync(file); meter=createEmployeeUsage(db,query,homes)
  assert.deepEqual((await meter.progress()).roles.jingyuniang,{totalTokens:1010200,earnedCoins:1,remainderTokens:10200})
  const direct={id:'owner-direct',cwd:join(root,'project'),agentPreset:'standard'}
  meter.created(direct,0)
  const events=[switchTo(whale),partial(1,1,usage(10))]
  const live={id:direct.id,header:direct,seq:events.length,snapshotEvents:()=>events}
  meter.changed(live,events[0]);meter.changed(live,events[1]);events.push(settle(1,1,usage(9880,312)))
  meter.changed(live,events[2])
  put(direct.id,direct.cwd,'standard',events)
  assert.equal((await meter.progress()).roles.jingyuniang.totalTokens,1020392)
  meter.created({id:'other',cwd:foreign,agentPreset:whale},0)
  assert.equal((await meter.progress()).roles.jingyuniang.totalTokens,1020392)
  const otherDb=new DatabaseSync(':memory:')
  try {
    const other=createEmployeeUsage(otherDb,query,{jingyuniang:foreign})
    assert.deepEqual((await other.progress()).roles.jingyuniang,{totalTokens:6000000,earnedCoins:6,remainderTokens:0})
    other.dispose()
  } finally { otherDb.close() }
})

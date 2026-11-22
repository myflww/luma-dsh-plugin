import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { copyFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { DatabaseSync } from 'node:sqlite'

test('desktop proxy owner, role memories, revision conflicts, assets and reactivation', async t => {
  const base = await mkdtemp(join(tmpdir(), 'luma-native-backend-'))
  const runtimeBefore = process.env.LUMA_LOVEHOUSE_RUNTIME_FILE
  process.env.LUMA_LOVEHOUSE_RUNTIME_FILE = join(base, 'fixture-lovehouse-offline.json')
  t.after(() => { if (runtimeBefore) process.env.LUMA_LOVEHOUSE_RUNTIME_FILE = runtimeBefore; else delete process.env.LUMA_LOVEHOUSE_RUNTIME_FILE })
  await mkdir(join(base,'lib'))
  await mkdir(join(base,'public','luma-office'), {recursive:true})
  await writeFile(join(base,'public','luma-office','fixture.txt'), 'office')
  await copyFile(new URL('../.runtime/native-desktop/server.mjs', import.meta.url),join(base,'lib','server.mjs'))
  const { apply } = await import(pathToFileURL(join(base,'lib','server.mjs')).href)
  const routes = new Map(), stops = new Set(), browserPeer = {}
  const presets = new Map()
  const archived = new Set(), sessions = new Map(), workspaces = []
  const lifecycle = new Map()
  let attachCount = 0
  const ctx = {
    on(name, handle) { lifecycle.set(name,handle); return () => lifecycle.delete(name) },
    profileContext:{home:join(base,'profile')},
    agentPresets:{
      async readDocument(id) {
        assert.equal(id,'standard')
        return {content:JSON.stringify([{id:'persona',name:'@deepseek-ai/dsh-persona'},{id:'tool-pwsh',name:'@deepseek-ai/dsh-tool-pwsh',disabled:false},{id:'tool-bash',name:'@deepseek-ai/dsh-tool-bash',disabled:true},{id:'host-revision',name:'runtime-extension'},{id:'mode',group:[],isolate:{planMode:true}}])}
      },
      async register(definition) {
        assert.ok(!presets.has(definition.id))
        presets.set(definition.id,structuredClone(definition))
        return async()=>{presets.delete(definition.id)}
      },
      async resolve(id) { assert.ok(presets.has(id)); return {id} },
    },
    sessionQuery:{async listSessions(){return [...sessions.values()].map(({session:header})=>({header,live:false}))}, async readSession(id) {
      if (!sessions.has(id)) throw Error('missing')
      return structuredClone(sessions.get(id))
    } },
    workspaceRegistry:{
      get archivedSessionIds(){ return [...archived] },
      list(){ return workspaces },
      async resolveByPath(path){ return workspaces.find(w=>w.path===path) },
      async create(path,title){
        const existing=workspaces.find(w=>w.path===path)
        if (existing) return existing
        const workspace={id:'w-'+workspaces.length,path,title,sessionIds:[],async attachSession(id){
          attachCount++
          this.sessionIds.push(id)
          if (id==='archive-race') archived.add(id)
        },async detachSession(id){ this.sessionIds=this.sessionIds.filter(s=>s!==id) }}
        workspaces.push(workspace)
        return workspace
      },
    },
    connection:{
      browserPeer,
      admit(req) {
        if (req.headers.origin && req.headers.origin !== 'http://' + req.headers.host) return {rejection:403}
        if (req.headers.cookie === 'fixture=owner') return {peer:browserPeer}
        if (req.headers.cookie === 'fixture=limited') return {peer:{}}
        return {rejection:401}
      },
    },
    webServer:{ register(route) {
      assert.ok(!routes.has(route.path))
      routes.set(route.path, route)
      return () => routes.delete(route.path)
    }},
    effect(setup) { stops.add(setup()) },
  }
  const unload = async () => { await Promise.all([...stops].map(stop=>stop())); stops.clear() }
  let server
  t.after(async () => {
    await unload()
    if (server) {
      server.closeAllConnections()
      await new Promise(ok => server.close(ok))
    }
    await rm(base, { recursive:true, force:true })
  })
  await apply(ctx)
  assert.deepEqual([...presets.keys()],['luma-jingyuniang'])
  const nativeWhale = presets.get('luma-jingyuniang')
  assert.ok(nativeWhale.plugins.some(plugin=>plugin.id==='host-revision'))
  assert.equal(nativeWhale.name,'鲸鱼娘')
  assert.match(nativeWhale.plugins.find(entry=>entry.id==='persona').config.prefix,/鲸鱼娘/)
  assert.equal(nativeWhale.plugins.find(entry=>entry.id==='tool-pwsh').disabled,false)
  assert.equal(nativeWhale.plugins.find(entry=>entry.id==='tool-bash').disabled,true)
  assert.ok(nativeWhale.plugins.some(entry=>entry.group && entry.isolate?.planMode))
  server = createServer((req,res) => {
    const route = Array.from(routes.values()).find(r => r.path === req.url || (r.kind === 'prefix' && req.url.startsWith(r.path+'/')))
    if (!route) { res.writeHead(404); res.end(); return }
    return route.handler(req,res)
  }).listen(0, '127.0.0.1')
  await once(server, 'listening')
  const origin = 'http://127.0.0.1:'+server.address().port
  const post = (path,body,headers={}) => fetch(origin+path,{
    method:'POST',headers:{'content-type':'application/json',cookie:'fixture=owner',...headers},body:JSON.stringify(body),
  })
  const settings = body => post('/luma-native/settings',body)
  const describe = async () => (await (await settings({action:'describe'})).json()).value.namespaces
  for (const path of ['/luma-native/settings', '/luma-agents/memory','/luma-native/employee-workspace','/luma-native/token-usage']) {
    const args = path.endsWith('settings') ? {action:'describe'} : {roleId:'shan'}
    assert.ok(!(await post(path,args,{cookie:''})).ok)
    assert.equal((await post(path,args,{cookie:'fixture=limited'})).status,403)
    assert.equal((await post(path,args,{origin:'https://example.test'})).status,403)
  }
  assert.equal((await fetch(origin+'/luma-office/fixture.txt')).status,401)
  assert.equal(await (await fetch(origin+'/luma-office/fixture.txt',{headers:{cookie:'fixture=owner'}})).text(),'office')
  const initial = await describe()
  assert.equal(initial.length,7)
  const homes = initial.find(x=>x.ns==='luma-dsh-messages').base.homes
  const usageResponse=await (await post('/luma-native/token-usage',{role:'jingyuniang',tokens:9000000})).json()
  assert.equal(usageResponse.value.roles.jingyuniang.totalTokens,0)
  assert.equal(Object.keys(homes).length,8)
  const hydrate = (id,cwd=homes.jingyuniang,agentPreset='luma-jingyuniang',events=[])=>sessions.set(id,{session:{id,cwd,agentPreset},events})
  const directId='native-role-outside-luma'
  const billed={type:'assistant/message',data:{turn:1,step:1,usage:{inputTokens:9886,outputTokens:312}}}
  hydrate(directId,join(base,'work-project'),'luma-jingyuniang',[billed])
  const liveSession={id:directId,header:sessions.get(directId).session,seq:0,firstLifecycleSeq:0,inheritedEventCount:0,snapshotEvents:()=>[billed]}
  lifecycle.get('session/created')(liveSession)
  lifecycle.get('session/event')(liveSession,billed)
  const tokens = async () => (await (await post('/luma-native/token-usage',{})).json()).value.roles.jingyuniang
  assert.deepEqual(await tokens(),{totalTokens:10198,earnedCoins:0,remainderTokens:10198})
  const attach = (id,roleId='jingyuniang') => post('/luma-native/employee-workspace',{sessionId:id,roleId})
  assert.equal((await attach('locked','shan')).status,403)
  assert.equal((await post('/luma-agents/createroom',{requestId:'locked',name:'test',roleIds:['jingyuniang','shan']})).status,403)
  assert.equal((await post('/luma-agents/cloudsubmit',{roleId:'shan'})).status,403)
  assert.deepEqual(Object.keys((await (await post('/luma-agents/state',{})).json()).value.roles),['jingyuniang'])
  hydrate('alien-folder',homes.grok)
  hydrate('changed-preset',homes.jingyuniang,'luma-jingyuniang',[{type:'agent-preset/selected',data:{agentPreset:'luma-grok'}}])
  hydrate('archived')
  archived.add('archived')
  for (const id of ['alien-folder','changed-preset','archived','missing']) assert.equal((await attach(id)).status,409)
  assert.equal(workspaces.length,0)
  hydrate('other-owner')
  const other=await ctx.workspaceRegistry.create(homes.grok,'绯洛')
  other.sessionIds.push('other-owner')
  assert.equal((await attach('other-owner')).status,409)
  hydrate('legacy')
  const snapshot=structuredClone(sessions.get('legacy'))
  const repaired=await Promise.all([attach('legacy'),attach('legacy')])
  for (const response of repaired) assert.deepEqual(await response.json(),{ok:true,value:{sessionId:'legacy',workspaceId:'w-1'}})
  assert.equal(attachCount,1)
  assert.deepEqual(sessions.get('legacy'),snapshot)
  hydrate('archive-race')
  assert.equal((await attach('archive-race')).status,409)
  assert.deepEqual(workspaces[1].sessionIds,['legacy'])
  const update = {action:'update',ns:'luma-dsh-plugin-preferences',expectedRevision:0,section:{preferences:{schemaVersion:1,reducedMotion:'reduce'}}}
  const writes = await Promise.all([settings(update),settings(update)])
  assert.deepEqual(writes.map(r=>r.status).sort(),[200,409])
  assert.equal((await (await settings({...update,expectedRevision:1,section:{wrong:true}})).json()).ok,false)
  assert.equal((await settings({...update,ns:'luma-dsh-messages',section:{homes:{shan:'C:/elsewhere'}}})).status,400)
  assert.equal((await post('/luma-agents/remember',{roleId:'jingyuniang',text:'fixture only'})).status,200)
  const memories = async roleId => (await (await post('/luma-agents/memory',{roleId})).json()).value.entries
  assert.equal((await memories('jingyuniang'))[0].text,'fixture only')
  assert.equal((await post('/luma-agents/memory',{roleId:'gemini'})).status,403)
  await unload()
  assert.equal(presets.size,0)
  assert.equal(routes.size,0)
  await apply(ctx)
  assert.deepEqual([...presets.keys()],['luma-jingyuniang'])
  assert.equal((await memories('jingyuniang')).length,1)
  assert.equal((await tokens()).totalTokens,10198)
  assert.equal((await describe()).find(x=>x.ns===update.ns).revision,1)
  const walletNs = 'luma-dsh-local-collection'
  const walletView = async () => (await describe()).find(x=>x.ns===walletNs)
  assert.equal((await walletView()).revision,0)
  const history = {state:{schemaVersion:1,events:[
    {type:'welcome',id:'historic-welcome',at:10},
    {type:'buy-album-skin',id:'historic-purchase',at:11,skinId:'prism',price:100},
    {type:'equip-album-skin',id:'historic-selection',at:12,skinId:'prism'},
  ]}}
  await unload()
  const profile = new DatabaseSync(join(ctx.profileContext.home,'profiles','desktop','luma-plugin','desktop-settings.sqlite3'))
  try {
    profile.prepare('UPDATE sections SET revision=1,value=? WHERE ns=?').run(JSON.stringify(history),walletNs)
    profile.prepare('INSERT INTO employee_usage_requests VALUES(?,?,?)').run('shan','startup-fixture',1_000_100)
  } finally { profile.close() }
  await apply(ctx)
  const startup = new DatabaseSync(join(ctx.profileContext.home,'profiles','desktop','luma-plugin','desktop-settings.sqlite3'),{readOnly:true})
  try {
    const row = startup.prepare('SELECT revision,value FROM sections WHERE ns=?').get(walletNs)
    assert.equal(row.revision,2)
    assert.deepEqual(JSON.parse(row.value).state.events.slice(-2).map(e=>e.type),['token-reward','album-skin-refund'])
  } finally { startup.close() }
  const startWallet = await walletView()
  const next={type:'assistant/message',data:{turn:2,step:1,usage:{inputTokens:1_000_000,outputTokens:0}}}
  sessions.get(directId).events.push(next)
  lifecycle.get('session/event')({...liveSession,snapshotEvents:()=>sessions.get(directId).events},next)
  const progress = await (await post('/luma-native/token-usage',{})).json()
  assert.equal(progress.value.collectionRevision,3)
  assert.deepEqual(progress.value.roles.jingyuniang,{totalTokens:1_010_198,earnedCoins:1,remainderTokens:10198})
  const stale = {action:'update',ns:walletNs,section:history,expectedRevision:startWallet.revision,restore:true}
  assert.equal((await settings(stale)).status,409)
  const second={...next,data:{...next.data,turn:3}}
  sessions.get(directId).events.push(second)
  lifecycle.get('session/event')({...liveSession,snapshotEvents:()=>sessions.get(directId).events},second)
  const observed = await walletView()
  assert.equal(observed.revision,4)
  assert.equal(observed.user.state.events.at(-1).throughCoins,2)
  const restored = await (await settings({...stale,expectedRevision:4})).json()
  assert.equal(restored.ok,true)
  assert.deepEqual(restored.value.user.state.events.slice(0,3),history.state.events)
  assert.deepEqual(restored.value.user.state.events.filter(e=>e.type==='token-reward').map(e=>e.throughCoins).sort(),[1,2])
  assert.equal(restored.value.user.state.events.filter(e=>e.type==='album-skin-refund').length,1)
  assert.equal((await walletView()).revision,5)
})

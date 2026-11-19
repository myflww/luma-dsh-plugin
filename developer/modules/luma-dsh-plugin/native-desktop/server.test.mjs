import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { copyFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

test('desktop proxy owner, role memories, revision conflicts, assets and reactivation', async t => {
  const base = await mkdtemp(join(tmpdir(), 'luma-native-backend-'))
  await mkdir(join(base,'lib'))
  await mkdir(join(base,'public','luma-office'), {recursive:true})
  await writeFile(join(base,'public','luma-office','fixture.txt'), 'office')
  await copyFile(new URL('../.runtime/native-desktop/server.mjs', import.meta.url),join(base,'lib','server.mjs'))
  const { apply } = await import(pathToFileURL(join(base,'lib','server.mjs')).href)
  const routes = new Map(), stops = new Set(), browserPeer = {}
  const archived = new Set(), sessions = new Map(), workspaces = []
  let attachCount = 0
  const ctx = {
    profileContext:{home:join(base,'profile')},
    sessionQuery:{ async readSession(id) {
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
  const unload = () => { for (const stop of stops) stop(); stops.clear() }
  let server
  t.after(async () => {
    unload()
    if (server) {
      server.closeAllConnections()
      await new Promise(ok => server.close(ok))
    }
    await rm(base, { recursive:true, force:true })
  })
  await apply(ctx)
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
  for (const path of ['/luma-native/settings', '/luma-agents/memory','/luma-native/employee-workspace']) {
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
  assert.equal(Object.keys(homes).length,8)
  const hydrate = (id,cwd=homes.shan,agentPreset='luma-duanmu-yan',events=[])=>sessions.set(id,{session:{id,cwd,agentPreset},events})
  const attach = (id,roleId='shan') => post('/luma-native/employee-workspace',{sessionId:id,roleId})
  hydrate('alien-folder',homes.grok)
  hydrate('changed-preset',homes.shan,'luma-duanmu-yan',[{type:'agent-preset/selected',data:{agentPreset:'luma-grok'}}])
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
  assert.equal((await post('/luma-agents/remember',{roleId:'shan',text:'fixture only'})).status,200)
  const memories = async roleId => (await (await post('/luma-agents/memory',{roleId})).json()).value.entries
  assert.equal((await memories('shan'))[0].text,'fixture only')
  assert.equal((await memories('gemini')).length,0)
  unload()
  assert.equal(routes.size,0)
  await apply(ctx)
  assert.equal((await memories('shan')).length,1)
  assert.equal((await describe()).find(x=>x.ns===update.ns).revision,1)
})

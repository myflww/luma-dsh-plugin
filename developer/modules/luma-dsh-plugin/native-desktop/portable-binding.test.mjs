import assert from 'node:assert/strict'
import { test } from 'node:test'
import { DatabaseSync } from 'node:sqlite'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createAgentWork } from '../src/host/agent-work.ts'
import { parsePortableBinding, verifyPortableLibraries } from '../src/host/love-house.ts'
import { readPortableBinding } from './portable-binding.ts'

test('portable reuse validates eight real libraries without copying old profile or mutating its database', async t => {
  const root = await mkdtemp(join(tmpdir(), 'luma-portable-binding-'))
  const path = join(root, 'Luma-DSH','Data','luma-plugin','agent-workbench')
  await mkdir(path, { recursive:true })
  const oldFile = join(path,'employees.sqlite3')
  const old = new DatabaseSync(oldFile)
  const names = {shan:'端木嫣','bai-shuangming':'白霜命','lu-mi':'陆弥',jingyuniang:'鲸鱼娘',longmama:'龙妈妈',claude:'克劳德',gemini:'吉米',grok:'绯洛'}
  const libs = Object.fromEntries(Object.keys(names).map(id=>[id,'lib-'+id]))
  const binding = {instance:'acdecafe',libraries:libs}
  old.exec("CREATE TABLE integration(id TEXT PRIMARY KEY,value TEXT);CREATE TABLE configs(secret TEXT);CREATE TABLE notes(user TEXT);INSERT INTO configs VALUES('test-key-only');INSERT INTO notes VALUES('test-history-only')")
  old.prepare('INSERT INTO integration VALUES(?,?)').run('house',JSON.stringify({...binding,extra:'private'}))
  old.close()
  const original = await readFile(oldFile)
  const requests = []
  let mismatch = true, brokenId, duplicate = false
  const catalog = Object.entries(names).map(([id,name])=>({id:libs[id],name:'Luma · '+name+' · '+binding.instance,is_demo:false}))
  const server = createServer((req,res)=>{
    requests.push([req.method,req.url])
    res.setHeader('content-type','application/json')
    if (req.url === '/api/health') return res.end(JSON.stringify({ok:true,mode:'storage',controller_instance_id:mismatch?'other':'test-instance',protocol_version:'test-v1'}))
    if (req.url !== '/api/libraries') { res.writeHead(404); return res.end() }
    const libraries = catalog.map(row=>row.id === brokenId ? {...row,is_demo:true} : row)
    if (duplicate) libraries.push({...libraries[0],id:'other'})
    res.end(JSON.stringify({libraries}))
  }).listen(0,'127.0.0.1')
  await once(server,'listening')
  const runtimeFile = join(root,'app.json')
  const discovery = {read:()=>readPortableBinding(root), verify:b=>verifyPortableLibraries(b,runtimeFile)}
  const current = join(root,'native')
  let service = createAgentWork(current,undefined,discovery)
  t.after(async()=>{
    service.dispose()
    server.closeAllConnections()
    await new Promise(ok=>server.close(ok))
    await rm(root,{recursive:true,force:true})
  })
  assert.deepEqual(await readPortableBinding(root),binding)
  assert.equal(await readPortableBinding(join(root,'absent')),undefined)
  assert.equal(parsePortableBinding({...binding,libraries:{...libs,grok:libs.shan}}),undefined)
  assert.equal(parsePortableBinding({...binding,libraries:{...libs,unexpected:'extra'}}),undefined)
  const action = () => service.call('connect',{source:'portable'})
  const readState = () => service.call('state',{})
  assert.equal((await readState()).loveHouse.portableAvailable,true)
  await assert.rejects(action(),/离线/)
  assert.equal((await readState()).loveHouse.connected,false)
  await writeFile(runtimeFile, JSON.stringify({controller_port:server.address().port,controller_instance_id:'test-instance',service_version:'test-v1'}))
  await assert.rejects(action(),/核验/)
  assert.ok(requests.every(([,url])=>url==='/api/health'))
  mismatch = false
  brokenId = libs.shan
  await assert.rejects(action(),/端木嫣/)
  brokenId = undefined
  duplicate = true
  await assert.rejects(action(),/端木嫣/)
  duplicate = false
  assert.equal((await readState()).loveHouse.connected,false)
  const pending = action()
  await assert.rejects(service.call('connect',{source:'new'}),/正在进行/)
  await pending
  assert.ok(requests.every(([method])=>method==='GET'))
  const state = await readState()
  assert.equal(state.loveHouse.reusedPortable,true)
  assert.equal(state.loveHouse.portableAvailable,false)
  assert.equal(state.memories.shan,0)
  assert.equal(state.roles.shan.hasKey,false)
  assert.deepEqual(state.jobs,[])
  assert.deepEqual(await readFile(oldFile),original)
  assert.deepEqual(await readdir(path),['employees.sqlite3'])
  service.dispose()
  service = createAgentWork(current,undefined,discovery)
  assert.equal((await readState()).loveHouse.reusedPortable,true)
  const signed = new DatabaseSync(join(current,'employees.sqlite3'),{readOnly:true})
  try { assert.deepEqual(JSON.parse(signed.prepare("SELECT value FROM integration WHERE id='house'").get().value),{...binding,source:'portable'}) }
  finally { signed.close() }
})

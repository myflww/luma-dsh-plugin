import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createServer } from 'node:http'
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { DatabaseSync } from 'node:sqlite'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { once } from 'node:events'
import { setTimeout as pause } from 'node:timers/promises'
import { createAgentWork } from '../src/host/agent-work.ts'

test('group membership, public multi-turn history and named replies survive restart without private context', async t => {
  const root = await mkdtemp(join(tmpdir(), 'luma-room-test-'))
  let desk = createAgentWork(root)
  const received = []
  const server = createServer(async (req, res) => {
    let body = ''
    for await (const part of req) body += part
    const payload = JSON.parse(body)
    received.push(payload)
    res.end(JSON.stringify({choices:[{message:{content:'DELIVERED-' + payload.model + '-' + received.length}}]}))
  }).listen(0, '127.0.0.1')
  await once(server,'listening')
  t.after(async () => {
    desk.dispose(); server.closeAllConnections(); await new Promise(ok => server.close(ok))
    await rm(root, {recursive:true, force:true})
  })
  const make = { requestId:'test-group', name:'星图编辑部', roleIds:['shan','lu-mi'] }
  const room = await desk.call('createroom', make)
  assert.deepEqual(await desk.call('createroom', make), room)
  await assert.rejects(desk.call('createroom',{...make, name:'另一个群'}))
  await assert.rejects(desk.call('createroom',{...make, requestId:'solo', roleIds:['shan']}))
  await desk.call('remember',{roleId:'shan',text:'PRIVATE-SENTINEL'})
  for (const id of make.roleIds) await desk.call('configure',{
    roleId:id, baseUrl:'http://127.0.0.1:' + server.address().port, model:id,
  })
  const send = (id, text, ids, topic=room.id) => desk.call('run',{
    requestId:id, roleIds:ids, mode:ids.length === 1 ? 'task' : 'team', text, topic,
  })
  const db = new DatabaseSync(join(root,'employees.sqlite3')); t.after(() => { try { db.close() } catch {} })
  const done = async id => {
    for (let i=0; i<200; i++) {
      if (JSON.parse(db.prepare('SELECT value FROM jobs WHERE id=?').get(id).value).status === 'done') return
      await pause(15)
    }
    assert.fail('Job did not finish: ' + id)
  }
  try {
    await assert.rejects(send('outsider','wrong',['grok']), /群里的员工/)
    await assert.rejects(send('ghost','wrong',['shan'],'room-missing'), /不存在/)
    await send('round1','SHARED-BRIEF',make.roleIds)
    await assert.rejects(send('overlap','no',['lu-mi']), /上一条消息/)
    await done('round1')
    assert.match(JSON.stringify(received[1]), /DELIVERED-shan-1/)
    assert.equal(db.prepare('SELECT count(*) n FROM notes WHERE topic=?').get(room.id).n,0)
    const legacy = db.prepare('INSERT INTO notes(id,role,topic,user,assistant,createdAt,synced) VALUES(?,?,?,?,?,?,?)')
    legacy.run('room-synced','shan',room.id,'OLD-GROUP-USER','OLD-GROUP-OUTPUT',Date.now(),1)
    legacy.run('room-pending','lu-mi',room.id,'PENDING-GROUP-USER','PENDING-GROUP-OUTPUT',Date.now(),0)
    legacy.run('legacy-private','shan','room-old-personal-topic','OLD-PERSONAL','OLD-PERSONAL-ANSWER',Date.now(),0)
    desk.dispose(); desk = createAgentWork(root)
    const state = await desk.call('state',{})
    assert.deepEqual(state.rooms,[room])
    assert.equal(state.memories.shan,2)
    assert.equal(state.memories['lu-mi'],0)
    assert.equal(state.loveHouse.pending,2)
    assert.equal(state.jobs.find(j => j.id === 'round1').steps.length,2)
    await send('round2','continue',['shan'])
    await done('round2')
    assert.deepEqual(received.map(p => p.model), ['shan','lu-mi','shan'])
    assert.match(JSON.stringify(received[2]),/SHARED-BRIEF/)
    assert.match(JSON.stringify(received[2]),/DELIVERED-lu-mi-2/)
    assert.doesNotMatch(JSON.stringify(received),/PRIVATE-SENTINEL/)
    const other = await desk.call('createroom',{...make, requestId:'separate', name:'独立群'})
    await send('independent','new group',['shan'],other.id); await done('independent')
    assert.doesNotMatch(JSON.stringify(received[3]),/SHARED-BRIEF|DELIVERED|PRIVATE-SENTINEL/)
    await send('private-after-room','private follow-up',['shan'],'desk-shan'); await done('private-after-room')
    assert.match(JSON.stringify(received[4]),/PRIVATE-SENTINEL/)
    assert.match(JSON.stringify(received[4]),/OLD-PERSONAL/)
    assert.doesNotMatch(JSON.stringify(received[4]),/OLD-GROUP|SHARED-BRIEF|DELIVERED|new group/)
    const personal = await desk.call('memory',{roleId:'lu-mi'})
    assert.deepEqual(personal.entries,[])
    await assert.rejects(desk.call('record',{roleId:'shan', topic:room.id, id:'leak',user:'test',assistant:'test'}),/群/)
    await assert.rejects(desk.call('recall',{roleId:'shan',topic:room.id,query:'test'}),/群/)
  } finally { db.close() }
})

test('role-specific models, sequential handoff, durable transcripts, memory and key boundaries', async (t) => {
  const requests = []
  const provider = createServer(async (req, res) => {
    const chunks = []
    for await (const c of req) chunks.push(c)
    const data = JSON.parse(Buffer.concat(chunks))
    requests.push({ data, auth: req.headers.authorization })
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ choices: [{ message: { content: 'work by ' + data.model } }] }))
  }).listen(0, '127.0.0.1')
  await once(provider, 'listening')
  t.after(() => provider.close())
  const root = await mkdtemp(join(tmpdir(), 'luma-role-test-'))
  const service = createAgentWork(root)
  const url = 'http://127.0.0.1:' + provider.address().port + '/v1'
  for (const role of ['shan', 'lu-mi'])
    await service.call('configure', { roleId: role, baseUrl: url, model: role, apiKey: 'TEST-' + role })
  const assignment = {
    requestId: 'two-person-test',
    roleIds: ['shan', 'lu-mi'],
    text: 'compose',
    topic: 'example',
    mode: 'team',
    profiles: { shan: { name: 'Yan', personality: 'quiet', scenario: 'office' } },
  }
  await service.call('run', assignment)
  for (let i = 0; i < 100 && requests.length < 2; i++) await pause(50)
  await pause(150)
  const state = await service.call('state', {})
  assert.equal(state.jobs[0].status, 'done')
  assert.equal(requests.length, 2)
  assert.equal(requests[0].auth, 'Bearer TEST-shan')
  assert.equal(requests[1].auth, 'Bearer TEST-lu-mi')
  assert.match(JSON.stringify(requests[0].data.messages), /quiet/)
  assert.match(JSON.stringify(requests[1].data.messages), /work by shan/)
  assert.doesNotMatch(JSON.stringify(state), /TEST-shan/)
  assert.equal(state.memories.shan, 1)
  assert.equal(state.memories.claude, 0)
  assert.equal((await service.call('run', assignment)).status, 'done')
  await service.call('configure', { roleId: 'shan', model: 'new', baseUrl: url + '/other' })
  assert.equal((await service.call('state', {})).roles.shan.hasKey, false)
  await service.call('configure', { roleId: 'shan', model: '', baseUrl: '', apiKey: '' })
  await assert.rejects(service.call('run', { ...assignment, requestId: 'second' }), /配置/)
  service.dispose()
  const next = createAgentWork(root)
  t.after(() => next.dispose())
  assert.equal((await next.call('state', {})).jobs[0].steps[1].output, 'work by lu-mi')
  const web = createServer(next.handler).listen(0, '127.0.0.1')
  await once(web, 'listening')
  t.after(() => web.close())
  const endpoint = 'http://127.0.0.1:' + web.address().port
  const req = (origin) =>
    fetch(endpoint + '/luma-agents/state', {
      method: 'POST',
      headers: { origin, 'content-type': 'application/json' },
      body: '{}',
    })
  assert.equal((await req('https://example.com')).status, 403)
  assert.equal((await req(endpoint)).status, 200)
})

test('dispatch snapshots, durable stop and atomic step delivery survive interruption', async t => {
  const root = await mkdtemp(join(tmpdir(), 'luma-dispatch-'))
  const handles = new Map(), requests = []
  const provider = createServer(async (req, res) => {
    let bytes = ''
    for await (const part of req) bytes += part
    const data = JSON.parse(bytes)
    const task = data.messages.at(-1).content
    requests.push({task,model:data.model,path:req.url})
    if (data.model === 'gated') await new Promise(resolve => {
      handles.set(task,resolve)
      res.once('close', resolve)
    })
    if (!res.destroyed) res.end(JSON.stringify({choices:[{message:{content:'answer '+data.model}}]}))
  }).listen(0,'127.0.0.1')
  await once(provider,'listening')
  let service = createAgentWork(root)
  const db = new DatabaseSync(join(root,'employees.sqlite3'))
  t.after(async () => {
    service.dispose()
    db.close()
    provider.closeAllConnections()
    await new Promise(ok=>provider.close(ok))
    await rm(root,{recursive:true,force:true})
  })
  const base = 'http://127.0.0.1:'+provider.address().port
  const configure = (roleId,model,path='') => service.call('configure',{roleId,model,baseUrl:base+path})
  const run = (id,roleIds) => service.call('run',{requestId:id,text:id,mode:roleIds.length>1?'team':'task',roleIds})
  const job = id => JSON.parse(db.prepare('SELECT value FROM jobs WHERE id=?').get(id).value)
  const settle = async condition => {
    for (let attempt=0;attempt<200 && !condition();attempt++) await pause(15)
    assert.ok(condition())
  }
  await configure('shan','gated')
  await configure('lu-mi','assigned','/old')
  await run('team-snapshot',['shan','lu-mi'])
  await settle(()=>handles.has('team-snapshot'))
  await configure('lu-mi','changed','/new')
  handles.get('team-snapshot')()
  await settle(()=>job('team-snapshot').status==='done')
  assert.equal(requests[1].model,'assigned')
  assert.equal(requests[1].path,'/old/chat/completions')
  assert.equal(job('team-snapshot').steps[1].output,'answer assigned')

  await run('user-cancel',['lu-mi','shan'])
  await settle(()=>handles.has('user-cancel'))
  assert.equal(requests.find(r=>r.task==='user-cancel').path,'/new/chat/completions')
  assert.deepEqual(await service.call('cancel',{id:'user-cancel'}),{cancelled:true})
  assert.deepEqual(job('user-cancel').steps.map(s=>s.status),['done','cancelled'])
  assert.equal(job('user-cancel').status,'cancelled')
  assert.deepEqual(await service.call('cancel',{id:'user-cancel'}),{cancelled:false})

  await run('shutdown',['shan'])
  await settle(()=>handles.has('shutdown'))
  service.dispose()
  service=createAgentWork(root)
  assert.equal(job('user-cancel').status,'cancelled')
  assert.equal(job('shutdown').status,'cancelled')
  assert.match(job('shutdown').error,/插件已停用/)

  // Abort the job write after the memory insertion to exercise a partial transaction.
  db.exec("CREATE TRIGGER refuse_step BEFORE INSERT ON jobs WHEN NEW.id='atomic' AND json_extract(NEW.value,'$.status')='done' BEGIN SELECT RAISE(ABORT,'fixture'); END")
  await run('atomic',['lu-mi'])
  await settle(()=>job('atomic').status==='failed')
  assert.equal(job('atomic').steps[0].output,'')
  assert.equal(job('atomic').steps[0].status,'failed')
  assert.match(job('atomic').error,/本机交付和记忆未能保存/)
  assert.equal(db.prepare("SELECT count(*) n FROM notes WHERE user='atomic'").get().n,0)
  const folder = id => join(root,'deliverables',createHash('sha256').update(id).digest('hex').slice(0,28))
  await assert.rejects(readdir(folder('atomic')),{code:'ENOENT'})
  db.exec('DROP TRIGGER refuse_step')

  // A blocked filesystem export leaves a durable answer that reload can publish.
  await writeFile(folder('deferred-file'),'fixture blocking export')
  await run('deferred-file',['lu-mi'])
  await settle(()=>job('deferred-file').status==='done')
  assert.equal(job('deferred-file').steps[0].pendingFile,true)
  assert.equal(db.prepare("SELECT assistant FROM notes WHERE user='deferred-file'").get().assistant,'answer changed')
  await rm(folder('deferred-file'))
  service.dispose()
  service=createAgentWork(root)
  assert.equal(await readFile(join(folder('deferred-file'),'1-lu-mi.md'),'utf8'),'answer changed\n')
  assert.equal(job('deferred-file').steps[0].pendingFile,undefined)
  assert.equal(job('deferred-file').error,undefined)

  // Recover the old release's narrow window between a completed step and its memory.
  service.dispose()
  const legacy=job('team-snapshot')
  legacy.id='legacy-restart'; legacy.text='legacy'; legacy.status='running'
  db.prepare('INSERT INTO jobs VALUES(?,?)').run(legacy.id,JSON.stringify(legacy))
  service=createAgentWork(root)
  assert.equal(job('legacy-restart').status,'done')
  assert.equal(db.prepare("SELECT count(*) n FROM notes WHERE user='legacy'").get().n,2)
})

test('contacts automatically reserve eight verified libraries in an isolated house and replay private offline notes once', async t => {
  const root = await mkdtemp(join(tmpdir(), 'luma-auto-house-'))
  const runtime = join(root,'house.json'), oldRuntime = process.env.LUMA_LOVEHOUSE_RUNTIME_FILE
  process.env.LUMA_LOVEHOUSE_RUNTIME_FILE = runtime
  const catalog = [], received = [], roles = ['jingyuniang','shan']
  let selected = 'personal', desk
  const server = createServer(async (req,res) => {
    let raw = ''
    for await (const part of req) raw += part
    const data = raw && JSON.parse(raw)
    const reply = value => { res.writeHead(200,{'content-type':'application/json'}); res.end(JSON.stringify(value)) }
    if (req.url === '/api/health') return reply({ok:true,mode:'storage',version:'0.10.7rc1',controller_instance_id:'qa',protocol_version:'v1'})
    if (req.url === '/api/libraries' && req.method === 'GET') return reply({libraries:catalog,selected_id:selected})
    if (req.url === '/api/libraries' && req.method === 'POST') {
      const library = {id:'local-'+catalog.length,name:data.name}
      selected=library.id; catalog.push(library); return reply({library})
    }
    if (req.url === '/api/library/select') { selected=data.library_id; return reply({ok:true}) }
    if (req.url === '/api/ai/record') { received.push({library:req.headers['x-nkb-library'],...data}); return reply({saved:true,id:data.request_id}) }
    res.writeHead(404); res.end()
  })
  server.listen(0,'127.0.0.1')
  await once(server,'listening')
  const profile = join(root,'desk')
  const connect = () => createAgentWork(profile,undefined,undefined,()=>roles,true)
  t.after(async () => { desk?.dispose(); server.closeAllConnections(); await new Promise(ok=>server.close(ok))
    if (oldRuntime === undefined) delete process.env.LUMA_LOVEHOUSE_RUNTIME_FILE; else process.env.LUMA_LOVEHOUSE_RUNTIME_FILE = oldRuntime
    await rm(root,{recursive:true,force:true}) })
  const turn = {roleId:'jingyuniang',topic:'test',id:'test-id',user:'测试问题',assistant:'鲸鱼记录'}
  desk=connect()
  await desk.call('record',turn)
  await desk.call('record',turn)
  assert.equal((await desk.call('state',{})).loveHouse.pending,1)
  desk.dispose()
  await writeFile(runtime,JSON.stringify({controller_port:server.address().port,controller_instance_id:'qa',service_version:'v1'}))
  desk=connect(); await desk.call('state',{})
  const until = async check => { for(let i=0;i<200;i++){if(await check())return;await pause(10)}assert.fail('house operation timed out') }
  await until(async () => (await desk.call('state',{})).loveHouse.connected && (await desk.call('state',{})).loveHouse.pending === 0)
  const quick = await desk.call('houseconnect',{})
  assert.equal(quick.status,'connected')
  assert.equal(quick.version,'0.10.7rc1')
  assert.equal(quick.protocol,'v1')
  assert.equal(quick.verified,8)
  assert.equal(catalog.length,8); assert.equal(new Set(catalog.map(row=>row.name)).size,8); assert.equal(selected,'personal')
  assert.equal(received.length,1)
  assert.equal(received[0].library,catalog.find(lib=>lib.name.includes('鲸鱼娘')).id)
  await desk.call('record',{...turn,roleId:'shan',assistant:'端木记录'})
  await until(()=>received.length === 2)
  assert.equal(received[1].library,catalog.find(lib=>lib.name.includes('端木嫣')).id)
  // A restored/replaced service may recycle a numeric ID for an unrelated library.
  catalog.find(lib=>lib.name.includes('端木嫣')).name='其他人的库'
  assert.equal((await desk.call('housestatus',{})).status,'mismatch')
  await assert.rejects(desk.call('houseconnect',{}),/已绑定记忆库不可用/)
  await desk.call('record',{...turn,roleId:'shan',id:'next',assistant:'等待恢复'})
  await until(async () => (await desk.call('state',{})).loveHouse.message.includes('待同步'))
  assert.equal(received.length,2)
})

import test from 'node:test'
import assert from 'node:assert/strict'
import { createDesktopSettings } from './bridge-settings.ts'
import { createDesktopSessions } from './bridge-sessions.mjs'

function store(initial) {
  let value = initial
  const listeners = new Set()
  return { getSnapshot: () => value, subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener) },
    publish(next) { value = next; for (const listener of listeners) listener() } }
}

test('scope shares readback with backups, respects conflicts and reloads another window’s values', async () => {
  let view = { ns: 'test', revision: 0, user: {}, effective: { home: 'assigned' }, base: {home:'assigned'}, secrets: [] }
  const received = []
  const transport = async (url, opts) => {
    assert.equal(url, '/luma-native/settings')
    const payload = JSON.parse(opts.body)
    received.push(payload)
    if (payload.action === 'describe') return Response.json({ok:true,value:{writable:true,namespaces:[view]}})
    if (payload.expectedRevision !== view.revision) return Response.json({ok:false,code:'settings-conflict',error:'已修改'}, {status:409})
    view = {...view, user:payload.section, effective:{...view.base,...payload.section}, revision:view.revision+1}
    return Response.json({ok:true,value:view})
  }
  const bridge = createDesktopSettings(transport)
  try {
    const scope = bridge.bind({namespace:'test', decode:section => section})
    await bridge.api.describe({})
    const original = scope.getSnapshot()
    assert.equal(original.value.home, 'assigned')
    assert.equal(scope.getSnapshot(), original)
    await Promise.all([scope.set('one', 1), scope.set('two', 2)])
    assert.deepEqual(scope.getSnapshot().user, {one:1,two:2})
    view = {...view, revision:view.revision+1, effective:{...view.effective, other:true}, user:{...view.user, other:true}}
    await assert.rejects(scope.set('three', 3), {code:'settings-conflict'})
    assert.equal(scope.getSnapshot().value.other, true)
    assert.equal(scope.getSnapshot().value.three, undefined)
    const restore = await bridge.api.replace({ns:'test', section:{saved:1}, expectedRevision:scope.getSnapshot().revision})
    assert.equal(restore.result.ok,true)
    await scope.unset('saved')
    assert.deepEqual(scope.getSnapshot().value, { home:'assigned' })
    assert.deepEqual(received.filter(item=>item.action==='update').map(item=>item.expectedRevision), [0,1,2,3,4])
    assert.deepEqual(received.filter(item=>item.action==='update').map(item=>item.restore), [undefined,undefined,undefined,true,undefined])
  } finally { bridge.dispose() }
})

test('desktop polls notify only changed scopes and connection transitions', async () => {
  const row = ns => ({ns, revision:0, user:{}, effective:{}, base:{}, secrets:[]})
  let online = true, writable = true
  const namespaces = [row('collection'), row('office')]
  const bridge = createDesktopSettings(async () => {
    if (!online) throw Error('disconnected')
    return Response.json({ok:true,value:{writable,namespaces}})
  })
  try {
    let changes = 0, decodes = 0
    const scope = bridge.bind({namespace:'collection', decode: value => { decodes++; return value.future ? undefined : value }})
    const stop = scope.subscribe(() => { changes++ })
    await bridge.api.describe({})
    assert.equal(scope.getSnapshot().status, 'ready')
    assert.equal(changes, 1)
    namespaces[1] = {...namespaces[1], revision:1}
    await bridge.api.describe({})
    assert.equal(changes, 1)
    assert.equal(decodes, 1)
    writable = false
    await bridge.api.describe({})
    assert.equal(scope.getSnapshot().writable, false)
    online = false
    await bridge.api.describe({})
    assert.equal(scope.getSnapshot().status, 'unavailable')
    online = true
    writable = true
    await bridge.api.describe({})
    assert.equal(scope.getSnapshot().writable, true)
    assert.equal(changes, 4)
    namespaces[0] = {...namespaces[0], revision:1, user:{future:true}, effective:{future:true}}
    await bridge.api.describe({})
    assert.equal(scope.getSnapshot().status, 'unavailable')
    assert.equal(changes, 5)
    const checked = decodes
    await bridge.api.describe({})
    assert.equal(changes, 5)
    assert.equal(decodes, checked)
    stop()
  } finally { bridge.dispose() }
})

test('desktop session bridge projects employee identity, real Chat target, permission state and session ownership', async () => {
  const list = store({ids:['general','role'], byId:{
    general:{id:'general',retainedBy:{mainView:1}}, role:{id:'role',retainedBy:{},projectionValues:{agentPreset:'luma-a'}},
  }})
  const status = store(new Map())
  const chat = store({legacy:{nodes:[{kind:'assistant',seq:1}], partial:null},timeline:{turnOrder:[],turns:new Map()}})
  const session = Object.assign(store({openState:'open',running:false}), {prompt: async (content, mode)=>({ok:true,value:{content,mode}})})
  const retained = [], released = [], native = []
  const staged = [], uploads = []
  const archivedActions=[]
  const ctx = {fileUpload:{async upload(id, blob, name, signal) {
    uploads.push(blob)
    staged.push({id, bytes:Buffer.from(await blob.arrayBuffer()), name, aborted:signal.aborted})
    return {ok:true,value:{receiptId:'receipt-fixture'}}
  }},sessions:{list,retain(id, {source}) {
    assert.equal(source,'lumaEmployee'); retained.push(id)
    return {binding:{session}, ready:Promise.resolve(), release:()=>released.push(id)}
  }},uiSession:{sessionStatus:status},uiConversation:{binding:()=>({target(key){assert.equal(key,'chat');return chat}})},
  workspaces:{list:store({archivedSessionIds:[],items:[{workspaceId:'work',sessionIds:['role']}]}),
    archiveSession:async id=>archivedActions.push(['archive',id]),unarchiveSession:async id=>archivedActions.push(['restore',id])},uiWorkspace:{openSession:id=>native.push(id)},
  remote:{session:{create:async()=>({ok:true,value:{sessionId:'role',agentPreset:'luma-a'}})}}}
  const bridge = createDesktopSessions(ctx)
  try {
    assert.equal(bridge.sessions.list.getSnapshot().current,'general')
    await bridge.workspaces.archiveSession('role');await bridge.workspaces.unarchiveSession('role')
    assert.deepEqual(archivedActions,[['archive','role'],['restore','role']])
    assert.equal(bridge.sessions.list.getSnapshot().byId.role.agentPreset,'luma-a')
    assert.equal(bridge.sessions.binding('general'),undefined)
    bridge.sessions.showTopic('role')
    await Promise.resolve()
    const face = bridge.sessions.binding('role').session
    assert.equal(await bridge.uploadSessionFile('role',{name:'sample.bin', mediaType:'application/octet-stream',data:'AAEC/w=='}),'receipt-fixture')
    assert.deepEqual(staged,[{id:'role',bytes:Buffer.from([0,1,2,255]),name:'sample.bin',aborted:false}])
    const original = new File([Buffer.alloc(5 * 1024 * 1024, 42)],'original.bin')
    assert.equal(await bridge.uploadSessionFile('role',{name:original.name,file:original}),'receipt-fixture')
    assert.equal(uploads.at(-1),original)
    assert.equal(staged.at(-1).bytes.length,original.size)
    status.publish(new Map([['role',{pendingInteraction:{kind:'approval'}}]]))
    assert.deepEqual(face.getSnapshot().pending,[{kind:'approval'}])
    assert.equal(face.getSnapshot().nodes[0].seq,1)
    assert.equal((await face.prompt([], 'queue')).value.mode,'queue')
    assert.deepEqual(native,[])
    await bridge.openNativeSession()
    assert.deepEqual(native,['role'])
    assert.equal((await bridge.api.sessions.create({agentPreset:'luma-a'})).result.value.sessionId,'role')
    status.publish(new Map())
    bridge.sessions.showTopic(undefined)
    await Promise.resolve()
    assert.deepEqual(retained,['role'])
    assert.deepEqual(released,['role'])
    assert.equal(bridge.sessions.binding('role'),undefined)
  } finally { bridge.dispose() }
})

test('employee topics register their actual home and wait for workspace membership before activating the native composer', async () => {
  const role = 'luma-bai-shuangming'
  const path = 'C:/isolated/luma/characters/bai-shuangming'
  const row = {id:'role', blank:true, cwd:path, retainedBy:{}, projectionValues:{agentPreset:role}}
  const list = store({ids:['role'], byId:{role:row}})
  const workspaces = store({phase:'ready', items:[]})
  const requests = [], revealed = [], registered = [], renamed = []
  const ctx = {sessions:{list,retain(){ return {binding:{session:Object.assign(store({running:false}),{projections:{}})},
    ready:Promise.resolve(), release(){}} }},
    uiSession:{sessionStatus:store(new Map())},uiConversation:{binding:()=>({target:()=>store(undefined)})},
    workspaces:{list:workspaces, async rename(id,title){renamed.push([id,title])}},
    uiWorkspace:{openSession(id) { assert.ok(workspaces.getSnapshot().items.some(workspace=>workspace.sessionIds.includes(id))); revealed.push(id) }},
    remote:{workspace:{async create({path:folder}){ registered.push(folder); return {ok:true,value:{
      created:registered.length===1,workspace:{workspaceId:'dedicated',path:folder,title:registered.length===1?'bai-shuangming':'我的自定义工作区'}
    }} }},session:{async create(input){requests.push(input);return {ok:true,value:{sessionId:'role',agentPreset:role}}}}}}
  const bridge = createDesktopSessions(ctx,()=>{throw Error('fresh sessions must not use the compatibility repair')})
  try {
    await bridge.api.sessions.create({cwd:path,agentPreset:role})
    assert.deepEqual(registered,[path])
    assert.deepEqual(requests,[{workspaceId:'dedicated',agentPreset:role}])
    assert.deepEqual(renamed,[['dedicated','白霜命']])
    await bridge.api.sessions.create({cwd:path,agentPreset:role})
    assert.equal(renamed.length,1,'leave a previously registered workspace title intact')
    bridge.sessions.open('role')
    const opening=bridge.openNativeSession()
    assert.deepEqual(revealed,[])
    workspaces.publish({phase:'ready',items:[{workspaceId:'dedicated',path,sessionIds:['role']}]})
    await opening
    assert.deepEqual(revealed,['role'])
  } finally { bridge.dispose() }

  workspaces.publish({phase:'ready',items:[]})
  const original = createDesktopSessions(ctx, async (url, options) => {
    assert.equal(url,'/luma-native/employee-workspace')
    assert.deepEqual(JSON.parse(options.body),{sessionId:'role',roleId:'bai-shuangming'})
    workspaces.publish({phase:'ready',items:[{workspaceId:'dedicated',path,sessionIds:['role']}]})
    return Response.json({ok:true,value:{sessionId:'role',workspaceId:'dedicated'}})
  })
  try {
    original.sessions.open('role')
    await original.openNativeSession()
    assert.deepEqual(revealed,['role','role'])
    assert.equal(requests.length,2,'opening a legacy topic must not mint another session')
  } finally { original.dispose() }
})

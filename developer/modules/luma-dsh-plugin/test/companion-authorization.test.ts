// @vitest-environment node
import { expect, it, vi } from 'vitest'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { once } from 'node:events'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { apply } from '../native-desktop/server-entry.ts'
import { COMPANION_REWARDS, LOCAL_PACKS, type LocalCollectionEvent } from '../src/shared/local-collection-domain.ts'
import { LOCAL_COLLECTION_SETTINGS_NAMESPACE } from '../src/local-collection-settings.ts'
import { getPackOdds, PACK_POOL_VERSION } from '../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/economy/domain/cardPacks.ts'
import { OFFICE_EMPLOYEE_PRESET_IDS } from '../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/office-employee-presets.ts'

it('desktop routes grant the second contact only after a persisted exchange, including reload and restore', async () => {
  const home = await mkdtemp(join(tmpdir(),'luma-entitlements-host-'))
  vi.stubEnv('LUMA_LOVEHOUSE_RUNTIME_FILE', join(home, 'fixture-lovehouse-offline.json'))
  vi.stubGlobal('__LUMA_DESKTOP_PRESETS__', {
    employees: Object.fromEntries(COMPANION_REWARDS.map((r,index) => [OFFICE_EMPLOYEE_PRESET_IDS[r.id],{name:r.name,description:r.name,order:index}])),
    plugins: [{id:'persona',name:'fixture-persona',config:{}}],
  })
  const registered = new Set<string>()
  const whale = OFFICE_EMPLOYEE_PRESET_IDS.jingyuniang, second = OFFICE_EMPLOYEE_PRESET_IDS.shan
  const routes = new Map<string, (req: IncomingMessage, res: ServerResponse) => unknown>()
  let unload: (() => void) | undefined
  const browserPeer = {}
  const host: Parameters<typeof apply>[0] = {
    profileContext:{home}, connection:{browserPeer,admit:()=>({peer:browserPeer})},
    agentPresets:{
      register:async preset=>{expect(registered.has(preset.id)).toBe(false); registered.add(preset.id); return async()=>{registered.delete(preset.id)}},
      resolve:async id=>({id, ...(registered.has(id)?{}:{broken:'unregistered'})}),
    },
    sessionQuery:{readSession:async()=>{throw Error('No session')}},
    workspaceRegistry:{archivedSessionIds:[],list:()=>[],resolveByPath:async()=>undefined,create:async()=>{throw Error('No workspace')}},
    effect:setup=>{unload=setup()},
    webServer:{register:route=>{routes.set(route.path,route.handler); return ()=>{routes.delete(route.path)}}},
  }
  const server = createServer((req,res)=>{
    const handler = routes.get(req.url ?? '') ?? routes.get('/luma-agents')
    if (handler) void handler(req,res)
    else {res.writeHead(404);res.end()}
  })
  try {
    await apply(host)
    expect(registered).toEqual(new Set([whale]))
    server.listen(0,'127.0.0.1')
    await once(server,'listening')
    const address = server.address()
    if (!address || typeof address === 'string') throw Error('No HTTP port')
    const post = (path:string, body:unknown)=>fetch(`http://127.0.0.1:${address.port}${path}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)})
    const write = (events: LocalCollectionEvent[], expectedRevision:number, restore = false) => post('/luma-native/settings',{
      action:'update', restore, ns:LOCAL_COLLECTION_SETTINGS_NAMESPACE,section:{state:{schemaVersion:1,events}},expectedRevision,
    })
    const room = () => post('/luma-agents/createroom',{requestId:'joined-cohort',name:'小组',roleIds:['jingyuniang','shan']})
    expect((await room()).status).toBe(403)
    const reward = COMPANION_REWARDS.find(row=>row.id==='shan')!, pack = LOCAL_PACKS.find(row=>row.id===reward.packId)!
    const card = reward.invitations[0]!, at = Date.now()
    const events:LocalCollectionEvent[] = [{id:'welcome-coins',type:'welcome',at},
      {id:'purchased-pack',type:'buy-pack',at,packId:pack.id,price:pack.price,poolVersion:PACK_POOL_VERSION},
      {id:'opened-edition',type:'open-pack',at,packInstanceId:'purchased-pack',poolVersion:PACK_POOL_VERSION,versionKey:card.key,rarity:card.rarity,odds:getPackOdds(pack.id,{})}]
    expect((await write(events,0)).status).toBe(200)
    expect((await room()).status).toBe(403)
    const redeemed:LocalCollectionEvent = {id:'joined-partner',type:'redeem-employee',at,cardInstanceId:'opened-edition',employeeId:'shan'}
    expect((await write([...events,redeemed],1)).status).toBe(200)
    expect((await room()).status).toBe(200)
    expect(registered).toEqual(new Set([whale,second]))
    await unload?.()
    expect(registered.size).toBe(0)
    await apply(host)
    expect(registered).toEqual(new Set([whale,second]))
    expect((await room()).status).toBe(200)
    // Restoring the earlier save must hide the existing group without deleting its history.
    expect((await write(events,2)).status).toBe(400)
    expect((await write(events,2,true)).status).toBe(200)
    expect(registered).toEqual(new Set([whale]))
    expect((await room()).status).toBe(403)
    const state = await (await post('/luma-agents/state',{})).json()
    expect(state.value.rooms).toHaveLength(0)
    expect((await write([...events,redeemed],3)).status).toBe(200)
    const restored = await (await post('/luma-agents/state',{})).json()
    expect(restored.value.rooms).toHaveLength(1)
  } finally {
    await unload?.()
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
    if (server.listening) {server.closeAllConnections(); await new Promise<void>(resolve=>server.close(()=>resolve()))}
    await rm(home,{recursive:true,force:true})
  }
})

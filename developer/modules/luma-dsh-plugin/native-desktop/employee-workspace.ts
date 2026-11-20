import { lstat, realpath } from 'node:fs/promises'
import { dirname, isAbsolute, relative } from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { isOfficeEmployeeKey, OFFICE_EMPLOYEE_FOLDER_NAMES, OFFICE_EMPLOYEE_PRESET_IDS } from '../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/office-employee-presets.ts'

type Workspace = {
  id: string; path: string; readonly sessionIds: readonly string[]
  attachSession(id:string): Promise<void>; detachSession(id:string): Promise<void>
}
export type EmployeeWorkspaceHost = {
  workspaceRegistry: {
    readonly archivedSessionIds: readonly string[]
    list(): Workspace[]
    resolveByPath(path:string): Promise<Workspace | undefined>
    create(path:string, title:string): Promise<Workspace>
  }
  sessionQuery: {
    readSession(id:string): Promise<{
      session:{id:string;cwd?:string;agentPreset?:string}
      events: readonly {type:string;data?:{agentPreset?:string}}[]
    }>
  }
}
class RepairError extends Error {}
const mismatch = () => new RepairError('无法核对该话题的员工预设和专属目录，已保留原会话。')
export function employeeWorkspaceHandler(ctx: EmployeeWorkspaceHost, homes: Record<string,string>, readUnlockedEmployees: () => readonly string[]) {
  const pending = new Map<string,{roleId:string; result:Promise<{sessionId:string;workspaceId:string}>}>()
  async function repair(roleId: keyof typeof OFFICE_EMPLOYEE_PRESET_IDS, sessionId:string) {
    const registry = ctx.workspaceRegistry
    const cwd = homes[roleId]
    if (!cwd || !isAbsolute(cwd)) throw mismatch()
    const state = await ctx.sessionQuery.readSession(sessionId)
    const header = state.session
    let preset = header.agentPreset
    for (const event of state.events) if (event.type === 'agent-preset/selected') preset = event.data?.agentPreset
    if (header.id !== sessionId || preset !== OFFICE_EMPLOYEE_PRESET_IDS[roleId] || !header.cwd || !isAbsolute(header.cwd)) throw mismatch()
    const [home, recorded, parent, directory] = await Promise.all([realpath(cwd), realpath(header.cwd), lstat(dirname(cwd)), lstat(cwd)])
    if (!parent.isDirectory() || !directory.isDirectory() || relative(home, recorded) !== '') throw mismatch()
    function assertAvailable() {
      if (registry.archivedSessionIds.includes(sessionId)) throw new RepairError('话题已归档，已保留原会话。')
      if (registry.list().some(w => w.sessionIds.includes(sessionId) && relative(home,w.path) !== ''))
        throw new RepairError('话题已归属于其他工作区，已保留原归属。')
    }
    assertAvailable()
    const workspace = await registry.resolveByPath(home) ?? await registry.create(home,OFFICE_EMPLOYEE_FOLDER_NAMES[roleId])
    assertAvailable()
    if (relative(home,workspace.path) !== '') throw mismatch()
    if (!workspace.sessionIds.includes(sessionId)) {
      await workspace.attachSession(sessionId)
      try {
        assertAvailable()
        if (!workspace.sessionIds.includes(sessionId)) throw mismatch()
      } catch (error) {
        // Restore the prior membership if an archive/move raced this explicit repair.
        if (workspace.sessionIds.includes(sessionId)) await workspace.detachSession(sessionId)
        throw error
      }
    }
    return {sessionId,workspaceId:workspace.id}
  }
  return async (req: IncomingMessage, res: ServerResponse) => {
    const send = (status:number, value:unknown) => {
      res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'})
      res.end(JSON.stringify(value))
    }
    if (req.method!=='POST') return send(405,{ok:false,error:'请使用 POST 请求。'})
    if (!/^application\/json(?:;|$)/i.test(req.headers['content-type']??'')) return send(415,{ok:false,error:'请求格式应为 JSON。'})
    let payload
    try {
      const chunks:Buffer[]=[]
      let size=0
      for await (const chunk of req) {
        size+=chunk.length
        if (size>2048) return send(413,{ok:false,error:'请求过大。'})
        chunks.push(Buffer.from(chunk))
      }
      payload=JSON.parse(Buffer.concat(chunks).toString('utf8'))
    } catch { return send(400,{ok:false,error:'话题标识无效。'}) }
    const roleId=payload?.roleId, sessionId=payload?.sessionId
    if (!isOfficeEmployeeKey(roleId) || typeof sessionId!=='string' || !/^[a-zA-Z0-9_.:-]{1,180}$/.test(sessionId))
      return send(400,{ok:false,error:'员工或话题标识无效。'})
    try {
      if (!readUnlockedEmployees().includes(roleId)) return send(403,{ok:false,error:'这位伙伴尚未入职，请先在卡牌收藏中兑换。'})
      const prior=pending.get(sessionId)
      if (prior && prior.roleId!==roleId) throw mismatch()
      const result=prior?.result ?? repair(roleId,sessionId).finally(()=>pending.delete(sessionId))
      if (!prior) pending.set(sessionId,{roleId,result})
      return send(200,{ok:true,value:await result})
    } catch (e) { return send(409,{ok:false,error:e instanceof RepairError ? e.message : '无法核对工作区归属。原会话记录仍保留，可稍后重试。'}) }
  }
}

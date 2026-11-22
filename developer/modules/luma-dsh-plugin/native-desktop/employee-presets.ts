import { DEFAULT_SCHEMA, Type, load } from 'js-yaml'
import { OFFICE_EMPLOYEE_PRESET_IDS, isOfficeEmployeeKey } from '../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/office-employee-presets.ts'

type Metadata = { name:string; description:string; order:number }
type Entry = { id:string; name?:string; group?:Entry[]; config?:Record<string,unknown> }
const conditions = new Map([["process.platform === 'win32'",true],["process.platform !== 'win32'",false],["!ctx.get('profileContext')",false]])
const presetSchema=DEFAULT_SCHEMA.extend([new Type('tag:yaml.org,2002:js',{kind:'scalar',construct(value){
  if (!conditions.has(value)) throw Error('Unsupported preset expression')
  return conditions.get(value)
}})])
type Definition = Metadata & { id:string; plugins:Entry[] }
type Dispose = () => Promise<void>
export interface DesktopPresetRegistry {
  readDocument?(id:string):Promise<{content:string}>
  register(definition:Definition):Promise<Dispose>
  resolve(id:string):Promise<{ id:string; broken?:string }>
}
declare const __LUMA_DESKTOP_PRESETS__: {employees: Record<string,Metadata>; plugins: Entry[]}

/** Keep the native New Session chooser in step with this profile's collection. */
export function createEmployeePresetRoster(registry:DesktopPresetRegistry, readUnlocked:()=>readonly string[]) {
  const mounted = new Map<string,Dispose>()
  let closed = false
  let pending:Promise<void> = Promise.resolve()
  async function standardPlugins():Promise<Entry[]> {
    try {
      const document = await registry.readDocument?.('standard')
      if (document) {
        const entries = load(document.content,{schema:presetSchema})
        if (Array.isArray(entries) && entries.every(row=>row && (typeof row.name==='string' || Array.isArray(row.group))) && entries.some(row=>row.id==='persona')) return entries
      }
    } catch { /* Hosts without a readable declaration use the bundled standard preset. */ }
    return __LUMA_DESKTOP_PRESETS__.plugins
  }
  async function refresh(verify:boolean) {
    if (closed) return
    const owned = new Set<string>(readUnlocked().filter(isOfficeEmployeeKey).map(id=>OFFICE_EMPLOYEE_PRESET_IDS[id]))
    for (const [id,remove] of mounted) if (!owned.has(id)) {
      mounted.delete(id)
      await remove()
    }
    for (const id of owned) {
      if (closed || mounted.has(id)) continue
      const meta = __LUMA_DESKTOP_PRESETS__.employees[id]!
      const entries = structuredClone(await standardPlugins())
      const persona = entries.find(row=>row.id==='persona')!
      persona.config={...persona.config, prefix:`你是 Luma 员工${meta.name}。${meta.description} 当前模型为 {{model}}。`}
      const remove = await registry.register({id,...meta,plugins:entries})
      try {
        if (closed) { await remove(); return }
        // The official registry's diagnostics may await the entire host loader.
        // Only request them after activation, never while this plugin is mounting.
        if (verify) {
          const status = await registry.resolve(id)
          if (status.broken) throw Error(`${meta.name}的 DSH 预设未能启用：${status.broken}`)
        }
        if (closed) { await remove(); return }
        mounted.set(id,remove)
      } catch (error) { await remove(); throw error }
    }
  }
  return {
    sync(verify = true) {
      const next=pending.then(()=>refresh(verify))
      pending=next.catch(()=>{})
      return next
    },
    async dispose() {
      closed=true
      const disposals=[...mounted.values()].map(remove=>remove())
      mounted.clear()
      await Promise.all([...disposals,pending])
    },
  }
}

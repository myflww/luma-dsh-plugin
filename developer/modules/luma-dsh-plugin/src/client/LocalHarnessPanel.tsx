import { useEffect, useRef, useState } from 'react'
import { Check, Circle, RefreshCw } from 'lucide-react'
import { ProviderMark } from './ProviderMark.tsx'
import { agentRequest, type AgentConfig } from './agent-desk-api.ts'
import type { ModelOption } from '../shared/role-models.ts'
import './LocalHarnessPanel.css'

interface Provider { id: string; name: string; installed: boolean; authenticated: boolean; message: string; loginCommand?: string }
interface Props {
  roleId: string; name: string; canWrite: boolean; config?: AgentConfig | undefined
  refresh(): Promise<unknown>; onSaved?(): void; onSaving?(saving:boolean):void
}
const problem = (e: unknown) => e instanceof Error ? e.message : '暂时无法连接本机客户端。'

export function LocalHarnessPanel({roleId,name,canWrite,config,refresh,onSaved,onSaving}:Props) {
  const initial = config?.source === 'local' ? config : undefined
  const [providers,setProviders]=useState<Provider[]>()
  const [provider,setProvider]=useState(initial?.provider ?? '')
  const [model,setModel]=useState(initial?.model ?? '')
  const [models,setModels]=useState<ModelOption[]>([])
  const [effort,setEffort]=useState(initial?.effort ?? '')
  const [efforts,setEfforts]=useState<ModelOption[]>([])
  const [scan,setScan]=useState(0), [saving,setSaving]=useState(false)
  const [notice,setNotice]=useState(''), [catalogError,setCatalogError]=useState(''), [modelError,setModelError]=useState('')
  const [loadingModels,setLoadingModels]=useState(false)
  const [readingEfforts,setReadingEfforts]=useState(false)
  const savingRef=useRef(false)
  const ready=providers?.find(row=>row.id===provider && row.installed && row.authenticated)
  const bound=Boolean(ready && initial?.provider===provider && initial.model===model && (initial.effort ?? '')===effort)
  useEffect(()=>{
    const abort=new AbortController()
    setProviders(undefined);setCatalogError('')
    void agentRequest<{providers:Provider[]}>('localproviders',{roleId},AbortSignal.any([abort.signal,AbortSignal.timeout(35000)]))
      .then(data=>{if(abort.signal.aborted)return
        if(!Array.isArray(data?.providers))throw Error('当前宿主未提供本机客户端列表。')
        setProviders(data.providers)
        setProvider(current=>data.providers.some(row=>row.id===current) ? current : data.providers.find(row=>row.authenticated && row.installed)?.id ?? '')
      }).catch(e=>{if(!abort.signal.aborted)setCatalogError(problem(e))})
    return ()=>abort.abort()
  },[roleId,scan])
  useEffect(()=>{
    const abort=new AbortController()
    setModels([]);setModelError('');setLoadingModels(Boolean(ready))
    if(ready) void agentRequest<{models:ModelOption[]}>('models',{roleId,source:'local',provider:ready.id},AbortSignal.any([abort.signal,AbortSignal.timeout(30000)]))
      .then(data=>{if(abort.signal.aborted)return
        if(!Array.isArray(data.models) || !data.models.length)throw Error('客户端暂未返回可用模型，请检查登录后重新检测。')
        setModels(data.models);setModel(current=>data.models.some(row=>row.id===current)?current:data.models[0]!.id)
      }).catch(e=>{if(!abort.signal.aborted)setModelError(problem(e))}).finally(()=>{if(!abort.signal.aborted)setLoadingModels(false)})
    return ()=>abort.abort()
  },[roleId,ready])
  useEffect(()=>{
    const abort=new AbortController()
    const available=Boolean(ready && models.some(row=>row.id===model))
    setEfforts([]);setReadingEfforts(available)
    if(ready && available) void agentRequest<{efforts:ModelOption[]}>('reasoning',{roleId,source:'local',provider:ready.id,model},
      AbortSignal.any([abort.signal,AbortSignal.timeout(15000)])).then(result=>{
        if(!abort.signal.aborted && Array.isArray(result.efforts)){setEfforts(result.efforts);setEffort(v=>result.efforts.some(row=>row.id===v)?v:'')}
      }).catch(()=>{if(!abort.signal.aborted)setEffort('')}).finally(()=>{if(!abort.signal.aborted)setReadingEfforts(false)})
    return ()=>abort.abort()
  },[roleId,ready,models,model])
  async function save() {
    if(savingRef.current || readingEfforts || !canWrite || !ready || !models.some(row=>row.id===model))return
    savingRef.current=true;setSaving(true);onSaving?.(true);setNotice('')
    try {
      await agentRequest('configure',{roleId,source:'local',provider,model,effort:efforts.some(i=>i.id===effort)?effort:''},AbortSignal.timeout(30000))
      await refresh();setNotice(name+'已绑定 '+ready.name+' · '+model);onSaved?.()
    } catch(e) {setNotice(problem(e))}
    finally {savingRef.current=false;setSaving(false);onSaving?.(false)}
  }
  return <section className="lumaHarnessPanel" aria-label="本机 Harness 服务">
    <header><h2>本机客户端</h2><button type="button" aria-label="重新检测" title="重新检测安装与登录" disabled={saving || (!providers && !catalogError)} onClick={()=>{setNotice('');setScan(n=>n+1)}}><RefreshCw size={15} aria-hidden="true"/></button></header>
    <p>{name}使用所选客户端当前登录账户的额度。</p>
    {!providers && !catalogError && <p role="status">正在检查安装和登录状态…</p>}
    {catalogError && <p role="alert">{catalogError}</p>}
    {providers && <ul aria-label="本机提供方">{providers.map(item=>{
      const usable=item.installed && item.authenticated, selected=usable && provider===item.id
      return <li key={item.id} data-status={usable?'available':item.installed?'unverified':'missing'}>
        <button type="button" className="lumaHarnessProvider" aria-label={'选择 '+item.name} aria-pressed={selected}
          disabled={!usable || saving} title={item.message} onClick={()=>{
            if(!selected){setProvider(item.id);setModel('');setEffort('');setNotice('')}
          }}>
          <ProviderMark kind={item.id==='codex'?'openai':item.id==='claude'?'claude':'local'} size={36}/>
          <span className="lumaHarnessProviderText"><strong>{item.name}</strong>
            <small>{item.message || (usable?'已登录':item.installed?'等待登录':'未检测到安装')}</small></span>
          {usable && <span className="lumaHarnessChoice">{selected?<Check size={15} aria-hidden="true"/>:<Circle size={13} aria-hidden="true"/>}</span>}
        </button>
        {!usable && item.installed && item.loginCommand && <small className="lumaHarnessLogin">登录后重新检测。<code>{item.loginCommand}</code></small>}
      </li>
    })}</ul>}
    {ready && <div className="lumaHarnessBinding">
      <label>本机模型<select aria-label="本机模型" value={models.some(row=>row.id===model)?model:''} disabled={saving || !models.length}
        onChange={e=>{setModel(e.target.value);setEffort('');setNotice('')}}>
        {!models.length && <option value="">{loadingModels?'正在读取模型…':'暂无可用模型'}</option>}
        {models.map(row=><option key={row.id} value={row.id}>{row.name.toLowerCase()===row.id.toLowerCase()?row.name:row.name+' · '+row.id}</option>)}</select></label>
      {readingEfforts && <small role="status">正在读取思考强度…</small>}
      {efforts.length>0 && <label>思考强度<select aria-label="本机模型思考强度" value={effort} disabled={saving} onChange={e=>setEffort(e.target.value)}>
        <option value="">客户端默认</option>{efforts.map(row=><option key={row.id} value={row.id}>{row.name}</option>)}</select></label>}
      <button className="is-primary" type="button" disabled={bound || !canWrite || !models.length || readingEfforts || saving} onClick={()=>void save()}>{saving?'正在保存…':bound?'已绑定给'+name:'绑定给'+name}</button>
    </div>}
    {modelError && <p role="alert">{modelError}</p>}{notice && <p role="status">{notice}</p>}
  </section>
}

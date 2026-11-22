import { useEffect, useRef, useState } from 'react'
import { agentRequest, type AgentConfig } from './agent-desk-api.ts'
import { customEfforts, type ModelOption, type ModelProtocol } from '../shared/role-models.ts'

const endpoints = {openai:'',anthropic:'https://api.anthropic.com/v1',gemini:'https://generativelanguage.googleapis.com/v1beta'}
const levels: Record<string,string> = {none:'关闭',minimal:'最低',low:'低',medium:'中',high:'高',xhigh:'很高',max:'最高'}
const label = (item:ModelOption)=>item.name===item.id ? item.name : item.name+' · '+item.id
const problem = (error:unknown)=>error instanceof Error ? error.message : '模型服务暂时无法连接。'
const draftSignal = (controller:AbortController)=>AbortSignal.any([controller.signal,AbortSignal.timeout(16000)])

interface Props {
  roleId:string; name:string; config?:AgentConfig | undefined; canWrite:boolean; refresh():Promise<unknown>
  close():void; onSaved?():void; forHandoff?:boolean
}
export function AgentServicePanel({roleId,name,config,canWrite,refresh,close,onSaved,forHandoff=false}:Props) {
  const [source,setSource] = useState<'dsh'|'custom'>(config?.model && config.source!=='dsh' ? 'custom' : 'dsh')
  const [providers,setProviders]=useState<ModelOption[]>([]), [provider,setProvider]=useState(config?.provider ?? '')
  const [models,setModels]=useState<ModelOption[]>([]), [nativeId,setNativeId]=useState(config?.source==='dsh' ? config.model : '')
  const [nativeEfforts,setNativeEfforts]=useState<ModelOption[]>([]), [defaultEffort,setDefaultEffort]=useState('')
  const [protocol,setProtocol]=useState<ModelProtocol>(config?.protocol ?? 'openai')
  const [url,setUrl]=useState(config?.baseUrl ?? ''), [customId,setCustomId]=useState(config?.source==='dsh' ? '' : config?.model ?? '')
  const [secret,setSecret]=useState(''), [discovered,setDiscovered]=useState<ModelOption[]>([])
  const [effort,setEffort]=useState(config?.effort ?? ''), [note,setNote]=useState(''), [catalogNote,setCatalogNote]=useState('')
  const [busy,setBusy]=useState(false), [lookup,setLookup]=useState(false)
  const discovering=useRef<AbortController|null>(null)
  const lock=useRef(false)
  const isDsh=source==='dsh'
  const model=isDsh ? nativeId : customId
  const choices=isDsh ? models : discovered
  const efforts=isDsh ? nativeEfforts : customEfforts(protocol,model).map(id=>({id,name:levels[id] ?? id}))

  useEffect(()=>{
    const abort=new AbortController()
    void agentRequest<{providers:ModelOption[]}>('providers',{roleId},draftSignal(abort)).then(data=>{
      if (abort.signal.aborted) return
      setProviders(data.providers)
      if (!data.providers.length) setCatalogNote('DSH 暂无已启用的模型服务，可在 DSH 设置中添加服务或选择自定义端点。')
      else setProvider(prev=>prev || data.providers[0]!.id)
    }).catch(error=>{if (!abort.signal.aborted) setCatalogNote(problem(error))})
    return ()=>{abort.abort();discovering.current?.abort()}
  },[roleId])
  useEffect(()=>{
    if (!isDsh || !provider) return
    const abort=new AbortController()
    setModels([]);setCatalogNote('')
    void agentRequest<{models:ModelOption[]}>('models',{roleId,provider},draftSignal(abort)).then(data=>{
      if (abort.signal.aborted) return
      setModels(data.models)
      if (!data.models.length) setCatalogNote('这个 DSH 服务没有列出模型。可检查 DSH 账户设置，或填写已知的模型标识。')
      setNativeId(prev=>prev || data.models[0]?.id || '')
    }).catch(error=>{if (!abort.signal.aborted) setCatalogNote(problem(error))})
    return ()=>abort.abort()
  },[roleId,isDsh,provider])
  useEffect(()=>{
    setNativeEfforts([]);setDefaultEffort('')
    if (!isDsh || !provider || !nativeId.trim()) return
    const abort=new AbortController()
    const timer=setTimeout(()=>{void agentRequest<{efforts:ModelOption[];defaultEffort?:string}>('reasoning',{roleId,provider,model:nativeId.trim()},draftSignal(abort))
      .then(data=>{if(!abort.signal.aborted){setNativeEfforts(data.efforts);setDefaultEffort(data.defaultEffort ?? '')}})
      .catch(error=>{if (!abort.signal.aborted) setCatalogNote(problem(error))})},180)
    return ()=>{clearTimeout(timer);abort.abort()}
  },[roleId,isDsh,provider,nativeId])

  function resetDiscovery(clearNote=true) {
    discovering.current?.abort();discovering.current=null;setLookup(false);setDiscovered([])
    if (clearNote) setNote('')
  }
  function chooseModel(id:string) {
    if (isDsh) setNativeId(id); else setCustomId(id)
    setEffort('');setNote('')
  }
  async function discover(automatic=false) {
    resetDiscovery(!automatic)
    const abort=new AbortController()
    discovering.current=abort;setLookup(true)
    try {
      const result=await agentRequest<{models:ModelOption[]}>('discover',{roleId,protocol,baseUrl:url.trim(),...(secret?{apiKey:secret}:{})},draftSignal(abort))
      if (!abort.signal.aborted) {
        setDiscovered(result.models)
        if (!customId && result.models.length) chooseModel(result.models[0]!.id)
        const message=result.models.length ? '已读取 '+result.models.length+' 个模型。' : '服务未列出模型，可手动填写模型标识。'
        setNote(previous => automatic && previous ? previous : message)
      }
    } catch(error) { if(!abort.signal.aborted) setNote(problem(error)) }
    finally {if (discovering.current===abort) setLookup(false)}
  }
  useEffect(()=>{
    if (!isDsh && !secret && config?.baseUrl && url===config.baseUrl && protocol===(config.protocol ?? 'openai')) {
      void discover(true)
      const request=discovering.current
      return ()=>request?.abort()
    }
  },[roleId,isDsh,config?.baseUrl])
  async function save(remove=false) {
    if (!canWrite || lock.current) return
    setNote('');lock.current=true;setBusy(true)
    try {
      const route=remove ? {source:'custom',baseUrl:'',model:'',apiKey:''} : isDsh
        ? {source,provider,model:model.trim(),effort} : {source,protocol,baseUrl:url.trim(),model:model.trim(),effort,...(secret?{apiKey:secret}:{})}
      await agentRequest('configure',{roleId,...route})
      setSecret('')
      if (remove) {setUrl('');setCustomId('');setEffort('')}
      await refresh();onSaved?.();setNote(remove ? '已恢复 DSH 默认会话。' : '已保存'+name+'的模型设置。')
    } catch(error) {setNote(problem(error))}
    finally {lock.current=false;setBusy(false)}
  }
  return <aside className="lumaRoleEditor" aria-label="员工 API 服务"><header><h2>{forHandoff ? name+'的 API 服务' : 'API 服务'}</h2><button type="button" onClick={close} aria-label="关闭 API 服务">×</button></header>
    <p>{name}会在私聊、单人任务和协作群中使用所选模型。</p>
    <form onSubmit={e=>{e.preventDefault();void save()}}>
      <label>模型来源<select autoFocus={forHandoff} value={source} onChange={e=>{
        resetDiscovery();setSecret('');setEffort('');setSource(e.target.value as typeof source)
      }}><option value="dsh">DSH 已配置服务</option><option value="custom">自定义 API 端点</option></select></label>
      {isDsh ? <><label>DSH 服务<select value={provider} onChange={e=>{setProvider(e.target.value);chooseModel('')}}>
        {!providers.some(p=>p.id===provider) && <option value={provider}>{provider || '请选择服务'}</option>}
        {providers.map(p=><option key={p.id} value={p.id}>{label(p)}</option>)}</select></label>
        {catalogNote && <p role="status">{catalogNote}</p>}</> : <>
        <label>服务协议<select value={protocol} onChange={e=>{
          const next=e.target.value as ModelProtocol
          resetDiscovery();setSecret('');setEffort('');setCustomId('');setProtocol(next)
          if (!url || Object.values(endpoints).includes(url)) setUrl(endpoints[next])
        }}><option value="openai">Chat Completions · DeepSeek 等兼容服务</option><option value="anthropic">Anthropic Messages · Claude</option><option value="gemini">Google Gemini</option></select></label>
        <label>服务地址<input type="url" value={url} maxLength={1000} required placeholder="https://api.example.com/v1" onChange={e=>{resetDiscovery();setUrl(e.target.value);setSecret('')}}/></label>
        <label>API 密钥<input type="password" autoComplete="new-password" value={secret} onChange={e=>{resetDiscovery();setSecret(e.target.value)}} placeholder={config?.hasKey && protocol===(config.protocol ?? 'openai') && url.trim()===config.baseUrl ? '已保存，留空沿用此服务的密钥' : '本机免密服务可留空'}/></label>
        <button type="button" disabled={!canWrite || busy || lookup || !url.trim()} onClick={()=>void discover()}>{lookup?'正在读取…':'读取端点模型'}</button>
      </>}
      {choices.length>0 && <label>可用模型<select value={choices.some(p=>p.id===model)?model:''} onChange={e=>chooseModel(e.target.value)}>
        <option value="">手动填写模型标识</option>{choices.map(p=><option key={p.id} value={p.id}>{label(p)}</option>)}</select></label>}
      <label>模型标识<input value={model} required maxLength={180} onChange={e=>chooseModel(e.target.value)} placeholder="服务提供的模型 ID"/></label>
      <label>思考强度<select value={effort} onChange={e=>setEffort(e.target.value)} disabled={!model || (!efforts.length && !effort)}>
        <option value="">{defaultEffort ? '模型默认 · '+(nativeEfforts.find(e=>e.id===defaultEffort)?.name ?? defaultEffort) : '模型默认'}</option>
        {effort && !efforts.some(e=>e.id===effort) && <option value={effort}>{effort}</option>}
        {efforts.map(item=><option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
      {!isDsh && <small>自定义端点的可用档位由模型决定，未指定时使用服务默认值。</small>}
      <button type="submit" className="is-primary" disabled={!canWrite || busy || !model.trim() || (isDsh ? !provider : !url.trim())}>保存服务</button>
      {config?.model && <button type="button" disabled={!canWrite || busy} onClick={()=>void save(true)}>恢复 DSH 默认会话</button>}
    </form>{note && <p role="status">{note}</p>}</aside>
}

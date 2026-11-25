import { useCallback, useEffect, useRef, useState } from 'react'
import { BookUser, ChevronDown, Search, SlidersHorizontal } from 'lucide-react'
import { agentRequest } from './agent-desk-api.ts'
import type { PortraitItem, PortraitView } from '../shared/role-portrait.ts'
import './RolePortraitPanel.css'

const labels = {stated:'用户明确说明', repeated:'多次提出', model:'模型归纳', corrected:'用户已更正'}
const sources = {chat:'私聊',work:'派工',history:'历史记录',manual:'手动记录'}
const problem = (e:unknown) => e instanceof Error ? e.message : '角色画像暂时无法读取。'
function readPortrait(value:PortraitView | undefined) {
  if (!value || !Array.isArray(value.items) || !value.scopeNames || typeof value.automatic!=='boolean' ||
      !value.items.every(item=>item && typeof item.text==='string' && typeof item.id==='string' && Number.isFinite(item.updatedAt))) {
    throw Error('当前员工服务未提供有效的角色画像。请检查插件版本后重新读取。')
  }
  return value
}
export function RolePortraitPanel({roleId,name,canWrite,refreshKey=0}:{roleId:string;name:string;canWrite:boolean;refreshKey?:number}) {
  const [data,setData]=useState<PortraitView>()
  const [error,setError]=useState(''), [notice,setNotice]=useState(''), [busy,setBusy]=useState(false)
  const [editing,setEditing]=useState<{item:PortraitItem;value:string}>()
  const [removing,setRemoving]=useState<PortraitItem>()
  const [limit,setLimit]=useState(8)
  const [query,setQuery]=useState(''),[scope,setScope]=useState('')
  const version=useRef(0), locked=useRef(false)
  const load=useCallback(async()=>{
    const request=++version.current
    try {
      const next=readPortrait(await agentRequest<PortraitView>('portrait',{roleId},AbortSignal.timeout(9000)))
      if (version.current===request) {setData(next);setError('')}
    } catch(e) {if (version.current===request) setError(problem(e))}
  },[roleId])
  useEffect(()=>{
    void load()
    return ()=>{++version.current}
  },[load,refreshKey])
  async function change(action:'portraitconfigure'|'portraitedit'|'portraitforget',fields:object,message:string) {
    if (locked.current || !canWrite) return
    locked.current=true;setBusy(true);setError('');setNotice('')
    const request=++version.current
    try {
      const next=readPortrait(await agentRequest<PortraitView>(action,{roleId,...fields},AbortSignal.timeout(9000)))
      if (request===version.current) {setData(next);setEditing(undefined);setRemoving(undefined);setNotice(message)}
    } catch(e) {if (request===version.current) setError(problem(e))}
    finally {locked.current=false;setBusy(false)}
  }
  const scopes=[...new Set(data?.items.map(item=>item.scope))]
  const filterScope=scopes.includes(scope)?scope:''
  const search=query.trim().toLocaleLowerCase()
  const matches=(data?.items ?? []).filter(item=>(!filterScope || item.scope===filterScope) && [item.text,item.evidence].some(value=>value?.toLocaleLowerCase().includes(search)))
  const scopeName=(id:string)=>id==='private'?'个人画像':data?.scopeNames[id] ?? '工作群'
  return <section className="lumaPortrait" aria-label={name+'的用户画像'}>
    <div className="lumaPortraitTitle"><BookUser size={19} aria-hidden="true"/><h2>{name}眼中的你</h2></div>
    <p>私聊和单人派工共用个人画像。你在群工作里明确说过的个人长期偏好，参与过的伙伴也能在相关私聊中记起。只适用于某个项目的偏好，会在提到该项目时使用。群聊记录和团队规则留在原群。删除工作后，仍可在这里更正或移除画像。</p>
    {data && <><details className="lumaPortraitOptions"><summary><SlidersHorizontal size={15} aria-hidden="true"/>整理方式 <span>{data.automatic?'自动整理已开启':'自动整理已关闭'}</span><ChevronDown size={14} aria-hidden="true"/></summary>
      <fieldset disabled={!canWrite || busy} aria-label="整理方式">
      <label><input type="checkbox" checked={data.automatic} onChange={e=>void change('portraitconfigure',{automatic:e.target.checked,modelReview:false},'整理方式已更新。')}/>自动整理用户画像</label>
      <small>直接记下明确的长期偏好；同一项工作要求出现三次后标为「多次提出」。</small>
      <label><input type="checkbox" disabled={!data.automatic || (!data.modelAvailable && !data.modelReview)} checked={data.modelReview} onChange={e=>void change('portraitconfigure',{automatic:data.automatic,modelReview:e.target.checked},'模型整理设置已更新。')}/>使用角色模型补充整理</label>
      <small>{data.modelAvailable?'开启后，每四轮新的私聊或单人派工会额外调用一次该角色模型，发送这四轮的用户文字。':'先为角色绑定模型，即可开启每四轮一次的补充整理。'}</small>
    </fieldset></details>
    {data.modelReview && data.notice && <p role="status">{data.notice}</p>}
    {data.remoteRecall==='filtered' && <p role="status">这位伙伴仅从本机记录召回。更正或删除的来源曾开始同步到爱之屋，远端摘要无法逐条过滤。爱之屋内已有的原记录可在该应用管理。</p>}
    {data.remoteRecall==='legacy' && <p role="status">这位伙伴仅从本机记录召回。旧版爱之屋库混有群记录，无法逐条区分来源。</p>}
    {data.items.length>0 && <div className="lumaPortraitFilters"><label><Search size={14} aria-hidden="true"/><input type="search" aria-label="搜索画像条目" placeholder="搜索画像或用户原话" value={query} onChange={e=>{setQuery(e.target.value);setLimit(8)}}/></label>
      <select aria-label="画像范围" value={filterScope} onChange={e=>{setScope(e.target.value);setLimit(8)}}><option value="">全部范围</option>{scopes.map(id=><option key={id} value={id}>{scopeName(id)}</option>)}</select></div>}
    {data.items.length ? <><h3 className="lumaPortraitResult">画像条目 <span>{matches.length}</span></h3><ul className="lumaPortraitItems">{matches.slice(0,limit).map(item=><li key={item.id}>
      <div className="lumaPortraitMeta"><strong>{scopeName(item.scope)}</strong>
        <span>{labels[item.kind]} · {sources[item.source]}{item.count>1?' × '+item.count:''}</span>
        <time dateTime={new Date(item.updatedAt).toISOString()}>{new Date(item.updatedAt).toLocaleDateString('zh-CN')}</time></div>
      {editing?.item.id===item.id ? <><label>更正内容<textarea maxLength={260} value={editing.value} onChange={e=>setEditing({...editing,value:e.target.value})}/></label>
        <div className="lumaPortraitActions"><button type="button" disabled={busy || !editing.value.trim() || !canWrite} onClick={()=>void change('portraitedit',{id:item.id,revision:editing.item.revision,text:editing.value},'已保存这项更正。')}>保存更正</button>
        <button type="button" disabled={busy} onClick={()=>setEditing(undefined)}>取消</button></div></> :
        <><p>{item.text}</p>
        {item.evidence && item.text!==item.evidence && <details><summary>查看用户原话</summary><p>{item.evidence}</p></details>}
        <div className="lumaPortraitActions">{removing?.id===item.id ? <>
          <span>从这份画像中移除？原会话仍可查看。</span>
          <button type="button" disabled={busy || !canWrite} onClick={()=>void change('portraitforget',{id:item.id,revision:removing.revision},'已从画像移除。')}>确认移除</button>
          <button type="button" disabled={busy} onClick={()=>setRemoving(undefined)}>取消</button></> :
          <><button type="button" disabled={!canWrite || busy} onClick={()=>{setNotice('');setRemoving(undefined);setEditing({item,value:item.text})}}>更正</button>
          <button type="button" disabled={!canWrite || busy} onClick={()=>{setNotice('');setEditing(undefined);setRemoving(item)}}>移除</button></>}</div></>}
    </li>)}</ul>{!matches.length && <p>没有符合条件的画像条目。 <button type="button" onClick={()=>{setQuery('');setScope('');setLimit(8)}}>清除筛选</button></p>}</> :
      <p className="lumaPortraitEmpty">还没有画像条目。可以在私聊里告诉{name}「我的默认格式是 Markdown」。</p>}
    {limit<matches.length && <button type="button" onClick={()=>setLimit(limit+10)}>显示更多（剩余 {matches.length-limit} 项）</button>}
    </>}
    {!data && !error && <p role="status">正在读取画像…</p>}
    {error && <p role="alert">{error} <button type="button" disabled={busy} onClick={()=>{setEditing(undefined);setRemoving(undefined);void load()}}>重新读取画像</button></p>}
    {notice && <p role="status">{notice}</p>}
  </section>
}

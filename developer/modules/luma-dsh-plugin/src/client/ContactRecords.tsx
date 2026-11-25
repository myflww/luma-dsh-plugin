import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { Archive, ArchiveRestore, ArrowRight, ChevronDown, ClipboardList, FolderClosed, History, MessageCircle, RefreshCw, Search, Trash2, X } from 'lucide-react'
import type { LifeLetter } from '../shared/companion-life.ts'
import { agentRequest, inProgress, type AgentJob, type AgentMode } from './agent-desk-api.ts'
import type { MessagesRuntime, MessagesSnapshot } from './messages-runtime.ts'
import { useDrawerFocus } from './use-drawer-focus.ts'
import './ContactRecords.css'

type Scope = {roleId:string; roomId?:never} | {roomId:string; roleId?:never}
type Selector = ({kind:'job';id:string} & Scope) | {kind:'topic';roleId:string;topic:string}
type Archived = {kind:'job'|'topic'; id?:string; topic:string; roomId?:string; roleId?:string; roleIds:string[]; title:string; archivedAt:number; count:number; mode?:AgentMode}
type Item = {target:Selector | {kind:'native';id:string}; title:string; kind:string; time?:number; count?:number; running?:boolean; jobs?:AgentJob[]; letters?:LifeLetter[]}
type Transcript={jobs:AgentJob[];letters:LifeLetter[]}
type Native={state:MessagesSnapshot; runtime:MessagesRuntime; open(id:string):Promise<void>}
export type DeletedRecordIds={jobs:string[];letters:string[]}
export type RecordFocus={kind:'job'|'topic'|'native';id:string}
type Props={scope:Scope;name:string;names:Record<string,string>;jobs:readonly AgentJob[];letters?:readonly LifeLetter[];write:boolean;available:boolean;native?:Native;initial?:RecordFocus|undefined;onTopicRemoved?(topic:string):void;forgetReplyMarks?(removed:DeletedRecordIds):unknown;refresh():Promise<unknown>;close():void}
type Operation='archive'|'restore'|'delete'
const modeName={chat:'聊天',task:'任务',team:'协作任务'}
const stamp=(time:number)=>new Date(time).toLocaleString('zh-CN',{year:'numeric',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})
const recordTitle=(text:string)=>text.trim().split(/\r?\n/,1)[0]?.slice(0,96) || '工作记录'
function key(target:Item['target']){return JSON.stringify(target)}
function jobItem(job:AgentJob,scope:Scope):Item {
  return {target:{kind:'job',id:job.id,...scope},title:recordTitle(job.text || job.attachments?.[0]?.name || ''),kind:modeName[job.mode],time:job.createdAt,running:inProgress(job.status),jobs:[job]}
}
function activeItems({scope,jobs,letters,native}:Props,archived:boolean):Item[] {
  const sessions:Item[]=(archived?native?.state.archivedTopics:native?.state.topics)?.map(item=>({target:{kind:'native',id:item.id},title:item.title,kind:'DSH 对话'})) ?? []
  if(archived)return sessions
  if(scope.roomId!==undefined)return jobs.filter(j=>j.topic===scope.roomId).sort((a,b)=>b.createdAt-a.createdAt).map(job=>jobItem(job,scope))
  const groups=new Map<string,Item>(), shared:Item[]=[]
  const group=(topic:string,title:string,time:number)=>{
    let item=groups.get(topic)
    if(!item){item={target:{kind:'topic',roleId:scope.roleId,topic},kind:'独立话题',title:recordTitle(title),time,count:0,jobs:[],letters:[]};groups.set(topic,item)}
    item.time=Math.max(item.time??0,time);item.count=(item.count??0)+1
    return item
  }
  for(const job of [...jobs].sort((a,b)=>a.createdAt-b.createdAt)){
    if(!job.roleIds.includes(scope.roleId)) continue
    if(job.roleIds.length!==1){shared.push(jobItem(job,scope));continue}
    const item=group(job.topic??'desk-'+scope.roleId,job.text.trim() || job.attachments?.[0]?.name || '工作记录',job.createdAt)
    item.jobs!.push(job);if(inProgress(job.status))item.running=true
  }
  for(const letter of letters??[]){
    if(letter.role!==scope.roleId || !letter.topic.startsWith('desk:'))continue
    group(letter.topic.slice(5),letter.text,letter.time).letters!.push(letter)
  }
  return [...groups.values(),...shared].sort((a,b)=>(b.time??0)-(a.time??0)).concat(sessions)
}
function archivedItem(row:Archived,scope:Scope):Item|undefined{
  const target:Selector|undefined=row.kind==='topic'
    ? scope.roleId!==undefined && row.roleId===scope.roleId ? {kind:'topic',roleId:scope.roleId,topic:row.topic}:undefined
    : row.id && (scope.roomId!==undefined ? row.roomId===scope.roomId : !row.roomId && row.roleIds.includes(scope.roleId!)) ? {kind:'job',id:row.id,...scope}:undefined
  if(!target)return
  return {target,title:row.title||'工作记录',kind:row.kind==='topic'?'独立话题':modeName[row.mode??'task'],time:row.archivedAt,count:row.count}
}

export function RecordsButton({open,onClick}:{open:boolean;onClick():void}){
  return <button type="button" className="lumaRecordsButton" title="记录管理" aria-label="记录管理" aria-expanded={open} onClick={onClick}><History size={18} aria-hidden="true"/></button>
}
export function ManageRecordButton({onClick,label='管理这条任务'}:{onClick():void;label?:string}){
  return <button type="button" data-record-target title={label} aria-label={label} onClick={onClick}><History size={15} aria-hidden="true"/><span>{label}</span></button>
}

export function ContactRecords(props:Props){
  const {scope,name,names,native,write,available,refresh,close}=props
  const [archived,setArchived]=useState(false),[archiveRows,setArchiveRows]=useState<Item[]>([]),[query,setQuery]=useState('')
  const [focus,setFocus]=useState(props.initial)
  const [view,setView]=useState(''),[contents,setContents]=useState<Transcript>(),[pending,setPending]=useState(false)
  const [confirm,setConfirm]=useState<Item>(),[problem,setProblem]=useState(''),[notice,setNotice]=useState('')
  const [listPending,setListPending]=useState(false),[listError,setListError]=useState(''),[revision,setRevision]=useState(0)
  const readRef=useRef<AbortController|undefined>(undefined),lock=useRef(false)
  const panel=useDrawerFocus<HTMLElement>(),dialog=useRef<HTMLDialogElement>(null),deleteTrigger=useRef<HTMLButtonElement|null>(null),uid=useId()
  const role=scope.roleId,room=scope.roomId
  useEffect(()=>{
    if(!archived || !available)return
    const abort=new AbortController()
    setListPending(true);setListError('');setArchiveRows([])
    void agentRequest<{items:Archived[]}>('archivedrecords',room!==undefined?{roomId:room}:{roleId:role},AbortSignal.any([abort.signal,AbortSignal.timeout(12000)]))
      .then(({items})=>{if(!abort.signal.aborted)setArchiveRows(items.map(row=>archivedItem(row,room!==undefined?{roomId:room}:{roleId:role!})).filter((item):item is Item=>Boolean(item)))})
      .catch(e=>{if(!abort.signal.aborted)setListError(e instanceof Error?e.message:'加载归档失败。')})
      .finally(()=>{if(!abort.signal.aborted)setListPending(false)})
    return ()=>abort.abort()
  },[archived,available,room,role,revision])
  useEffect(()=>()=>readRef.current?.abort(),[])
  useEffect(()=>{
    const node=dialog.current
    if(!confirm || !node)return
    if(typeof node.showModal==='function')node.showModal()
    else node.setAttribute('open','')
    node.querySelector<HTMLButtonElement>('[data-dismiss]')?.focus()
  },[confirm])
  const closeView=useCallback(()=>{readRef.current?.abort();setView('');setContents(undefined)},[])
  function dismissConfirm(){
    const node=dialog.current
    if(node?.open && typeof node.close==='function')node.close()
    setConfirm(undefined)
    queueMicrotask(()=>{
      const target=deleteTrigger.current?.isConnected?deleteTrigger.current:panel.current?.querySelector<HTMLButtonElement>('[data-drawer-focus]')
      target?.focus({preventScroll:true})
    })
  }
  function switchTab(next:boolean){closeView();setArchived(next);setFocus(undefined);setProblem('');setNotice('');setQuery('')}
  async function inspect(item:Item){
    const id=key(item.target);if(view===id){closeView();return}
    closeView();setProblem('');setView(id)
    if(item.target.kind==='native')return
    if(!archived){setContents({jobs:item.jobs??[],letters:item.letters??[]});return}
    const abort=new AbortController();readRef.current=abort
    try{
      const data=await agentRequest<Transcript>('readrecord',item.target,AbortSignal.any([abort.signal,AbortSignal.timeout(12000)]))
      if(!abort.signal.aborted)setContents(data)
    }catch(e){if(!abort.signal.aborted){setProblem(e instanceof Error?e.message:'无法读取记录。');setView('')}}
  }
  async function change(item:Item,action:Operation){
    if(!write || lock.current)return
    lock.current=true;setPending(true);setProblem('');setNotice('')
    try{
      if(item.target.kind==='native'){
        const sessionId=item.target.id
        const target=(action==='restore'?native?.state.archivedTopics:native?.state.topics)?.find(t=>t.id===sessionId)
        if(!native || !role || !target || action==='delete')throw Error('当前原生会话不支持该操作。')
        const ok=action==='archive'?await native.runtime.archiveTopic(target.id,role):await native.runtime.restoreTopic(target.id,role)
        if(!ok)throw Error(native.runtime.getSnapshot().problem || '原生会话操作未完成。')
      }else{
        const commands={archive:'archiverecord',restore:'restorerecord',delete:'deleterecord'} as const
        const payload=await agentRequest<{ok:boolean;removed?:DeletedRecordIds;filesPending?:boolean}>(commands[action],item.target,AbortSignal.timeout(15000))
        if(!payload.ok)throw Error('宿主未确认此操作。')
        if(item.target.kind==='topic' && action!=='restore')props.onTopicRemoved?.(item.target.topic)
        setNotice(action==='delete'&&payload.filesPending?'记录已删除，交付文件待清理。':{archive:'已移入归档。',restore:'已恢复到当前记录。',delete:'记录已永久删除。'}[action])
        if(action==='delete' && props.forgetReplyMarks){
          const removed=payload.removed ?? (item.target.kind==='job'?{jobs:[item.target.id],letters:[]}:undefined)
          if(removed)try{await props.forgetReplyMarks(removed)}catch{setProblem('记录已删除，原回复的反馈标记尚未清理。')}
        }
        await refresh()
      }
      if(item.target.kind==='native')setNotice(action==='archive'?'DSH 对话已归档。':'DSH 对话已恢复。')
      closeView();setFocus(undefined);setRevision(v=>v+1)
    }catch(e){setProblem(e instanceof Error?e.message:'记录操作未完成。')}
    finally{if(action==='delete')dismissConfirm();setPending(false);lock.current=false}
  }
  const search=query.trim().toLocaleLowerCase()
  let candidates=[...(archived&&available?archiveRows:[]),...activeItems(props,archived)]
  if(focus?.kind==='job'){
    const job=props.jobs.find(j=>j.id===focus.id && (scope.roomId!==undefined ? j.topic===scope.roomId : j.roleIds.includes(scope.roleId)))
    candidates=job?[jobItem(job,scope)]:[]
  }else if(focus)candidates=candidates.filter(item=>item.target.kind===focus.kind && ('id' in item.target?item.target.id:item.target.topic)===focus.id)
  const items=candidates.filter(item=>!search || (item.title+' '+item.kind).toLocaleLowerCase().includes(search))
  const canChange=(item:Item)=>write && !pending && !item.running && (item.target.kind==='native'
    ? !native?.state.pending && (archived ? native?.state.canRestoreNative : native?.state.archivableTopics?.some(id=>item.target.kind==='native' && id===item.target.id)) : available)
  function actions(item:Item){
    const isNative=item.target.kind==='native'
    if(isNative && archived && !native?.state.canRestoreNative)return null
    return <div className="lumaRecordActions">{!archived && <button type="button" disabled={!canChange(item)} aria-label={'归档「'+item.title+'」'} title={item.running?'进行中的记录暂不能归档':'归档'} onClick={()=>void change(item,'archive')}><Archive size={16} aria-hidden="true"/></button>}
      {archived && <button type="button" disabled={!canChange(item)} aria-label={'恢复「'+item.title+'」'} title="恢复到当前记录" onClick={()=>void change(item,'restore')}><ArchiveRestore size={16} aria-hidden="true"/></button>}
      {!isNative && <button type="button" className="danger" disabled={!canChange(item)} aria-label={'删除「'+item.title+'」'} title="删除记录" onClick={event=>{deleteTrigger.current=event.currentTarget;setProblem('');setConfirm(item)}}><Trash2 size={16} aria-hidden="true"/></button>}</div>
  }
  return <aside ref={panel} className="lumaRecordsDrawer" aria-label={name+'的记录管理'} onKeyDown={event=>{
    if(confirm)return
    if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close();return}
    if(event.key!=='Tab' || getComputedStyle(event.currentTarget).position!=='absolute')return
    const buttons=event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled)')
    const first=buttons[0],last=buttons[buttons.length-1]
    if(event.shiftKey && event.target===first){event.preventDefault();last?.focus()}
    else if(!event.shiftKey && event.target===last){event.preventDefault();first?.focus()}
  }}>
    <header><div><History size={19} aria-hidden="true"/><h2>记录管理</h2></div><button type="button" data-drawer-focus aria-label="关闭记录管理" onClick={close}><X size={17}/></button></header>
    <div className="lumaRecordsFilters"><h3>{name}</h3><div role="group" aria-label="记录范围"><button type="button" aria-pressed={!archived} onClick={()=>switchTab(false)}><ClipboardList size={15}/>当前</button><button type="button" aria-pressed={archived} onClick={()=>switchTab(true)}><Archive size={15}/>已归档</button></div>
      <label><Search size={15}/><input type="search" aria-label="搜索记录" placeholder="搜索记录" value={query} onChange={event=>setQuery(event.target.value)}/></label></div>
    {focus && <div className="lumaRecordFocus"><span>{focus.kind==='job'?'选中的记录':'选中的话题'}</span><button type="button" onClick={()=>switchTab(false)}>查看全部记录<ArrowRight size={13}/></button></div>}
    {notice && <p role="status" className="lumaRecordNotice">{notice}</p>}
    {(problem||listError) && <p role="alert" className="lumaRecordError">{problem||listError} {listError && <button type="button" onClick={()=>setRevision(v=>v+1)}><RefreshCw size={13}/>重试</button>}</p>}
    <div className="lumaRecordList" aria-busy={archived&&listPending}>
      {archived&&listPending && <p role="status">正在读取归档…</p>}
      {!available && <p>本地记录服务暂不可用。</p>}
      {!items.length && !(archived&&(listPending||listError)) && <p>{search?'没有匹配的记录。':focus?'这条记录已移出当前列表。':archived?'还没有归档记录。':'还没有聊天或任务记录。'}</p>}
      {items.map(item=>{
        const id=key(item.target),open=view===id,isNative=item.target.kind==='native'
        const Icon=isNative?MessageCircle:item.target.kind==='topic'?FolderClosed:ClipboardList
        return <article key={id} className="lumaRecordRow"><div className="lumaRecordHeading"><Icon size={17} aria-hidden="true"/><div><strong title={item.title}>{item.title}</strong><small>{item.kind}{item.count!==undefined?' · '+item.count+' 条':''}{item.time?' · '+stamp(item.time):''}{item.running?' · 进行中':''}</small></div></div>
          <div className="lumaRecordCommands">{isNative?(!archived && <button type="button" disabled={!write || native?.state.pending} onClick={()=>{if(item.target.kind==='native')void native?.open(item.target.id).catch(e=>setProblem(e instanceof Error?e.message:'打开对话失败。'))}}>打开<ArrowRight size={13}/></button>)
            :<button type="button" aria-label={(open?'收起':'查看')+'「'+item.title+'」'} aria-expanded={open} onClick={()=>void inspect(item)}>{open?'收起':'查看'}<ChevronDown size={14}/></button>}{actions(item)}</div>
          {open && !isNative && <div className="lumaRecordTranscript">{!contents ? <p role="status">正在读取…</p> : <>
            {contents.jobs.map(j=><section key={j.id}><strong>{j.text || j.attachments?.[0]?.name || '工作记录'}</strong>{j.attachments?.length ? <small>附件 · {j.attachments.map(a=>a.name).join('、')}</small>:null}
              {j.steps.filter(s=>s.output).map((s,i)=><p key={i}><b>{names[s.roleId]??s.roleId}</b>{s.output}</p>)}{j.error && <p>{j.error}</p>}
              {!archived && item.target.kind==='topic' && actions(jobItem(j,scope))}</section>)}
            {contents.letters.map(l=><section key={l.id}><b>{names[l.role]??l.role} · 来信</b><p>{l.text}</p></section>)}
            {!contents.jobs.length&&!contents.letters.length&&<p>这条记录没有可显示的正文。</p>}</>}</div>}
        </article>
      })}
    </div>
    {confirm && <dialog ref={dialog} className="lumaRecordConfirm" aria-labelledby={uid+'-confirm'} onCancel={event=>{event.preventDefault();if(!pending)dismissConfirm()}}>
      <h3 id={uid+'-confirm'}>永久删除{confirm.target.kind==='topic'?'话题':'记录'}？</h3>
      <p><strong>{name}</strong> · {confirm.kind}</p><blockquote>{confirm.title}</blockquote>
      <p>{confirm.time?stamp(confirm.time)+' · ':''}编号 {('id' in confirm.target?confirm.target.id:confirm.target.topic).slice(-12)}</p>
      <p>{confirm.target.kind==='topic'?'将删除此话题的独立记录、来信及对应交付文件。':'将删除这条记录及对应交付文件。'}角色画像会保留。删除后无法恢复。</p>
      <footer><button type="button" data-dismiss disabled={pending} onClick={dismissConfirm}>取消</button><button type="button" className="danger" disabled={pending} onClick={()=>void change(confirm,'delete')}>{pending?'正在删除…':'永久删除'}</button></footer>
    </dialog>}
  </aside>
}

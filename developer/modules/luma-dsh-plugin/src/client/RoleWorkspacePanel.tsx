import { useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { Activity, Check, Cloud, Cpu, FileDown, Files, Globe2, Monitor, PanelRightClose, RefreshCw } from 'lucide-react'
import { ProviderMark } from './ProviderMark.tsx'
import { agentRequest, inProgress, type AgentConfig, type AgentJob } from './agent-desk-api.ts'
import { EmployeeFace, exportResult } from './AgentDeskPanels.tsx'
import { CloudOfficeLauncher } from './CloudOfficePanel.tsx'
import { STUDIO_PHASE_NAMES } from '../shared/studio-workflow.ts'
import { useDrawerFocus } from './use-drawer-focus.ts'
import './RoleWorkspacePanel.css'

type WindowTarget = {id:string;label:string;app:string;title:string;browser:boolean}
type View = 'screen'|'browser'
type Preview = {targetId:string;view?:View;title:string;app:string;browser:boolean;capturedAt:number|string;image:{dataUrl:string;width:number;height:number};content?:{role:string;name:string;value?:string}[]}
type Member = {id:string;name:string;skin?:string;config?:AgentConfig}
const tabs=[{id:'screen',label:'屏幕',Icon:Monitor},{id:'browser',label:'浏览器',Icon:Globe2},{id:'data',label:'数据',Icon:Activity},{id:'files',label:'文件',Icon:Files}] as const
type Tab = typeof tabs[number]['id']
const statuses={queued:'等待执行',running:'进行中',done:'已完成',failed:'失败',cancelled:'已停止'}
const stamp=(time:number|string)=>{const date=new Date(time);return Number.isFinite(date.getTime())?date.toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit',second:'2-digit'}):''}
const describe=(e:unknown)=>e instanceof Error && e.name!=='TimeoutError'?e.message:'桌面组件未及时响应。'
const hint=(job:AgentJob)=>job.text || job.attachments?.map(a=>a.name).join('、') || '派工任务'

export function WorkspaceButton({open,onClick}:{open:boolean;onClick():void}){
  const label=open?'收起角色工作区':'打开角色工作区'
  return <button type="button" className="lumaWorkspaceButton" aria-label={label} title={label} aria-expanded={open} onClick={onClick}><Monitor size={16} aria-hidden="true"/><span className="lumaActionLabel">工作区</span></button>
}

function DesktopView({view,member,assigned,enabled,onAssign,onConfigure,active,focusWindow,dataReady}:{
  view:View;member:Member;assigned:string;enabled:boolean;active:boolean;focusWindow:number;dataReady:boolean
  onAssign:(id:string,title:string)=>void;onConfigure:()=>void
}) {
  const [targets,setTargets]=useState<WindowTarget[]>([]),[selected,select]=useState(assigned)
  const [listRevision,reloadList]=useState(0),[frameRevision,reloadFrame]=useState(0)
  const [visible,setVisible]=useState(!document.hidden),[targetsLoading,setTargetsLoading]=useState(false),[listError,setListError]=useState('')
  const [frame,setFrame]=useState<Preview>(),[frameError,setFrameError]=useState(''),[extraNodes,setExtraNodes]=useState(false)
  const abortRequests=useRef(new Set<AbortController>())
  const picker=useRef<HTMLSelectElement>(null)
  useEffect(()=>{if(focusWindow)picker.current?.focus({preventScroll:true})},[focusWindow])
  const showing=active && visible
  useEffect(()=>{
    const visibility=()=>{
      if(document.hidden){for(const request of abortRequests.current)request.abort();setFrame(undefined)}
      setVisible(!document.hidden)
    }
    document.addEventListener('visibilitychange',visibility)
    return ()=>document.removeEventListener('visibilitychange',visibility)
  },[])
  useEffect(()=>{
    if (!showing) return
    const abort=new AbortController()
    abortRequests.current.add(abort);setTargetsLoading(true);setListError('')
    void agentRequest<{targets:WindowTarget[]}>('desktoptargets',{},AbortSignal.any([abort.signal,AbortSignal.timeout(18000)])).then(result=>{
      if (!Array.isArray(result?.targets)) throw Error('桌面组件没有返回窗口列表。')
      if (!abort.signal.aborted) setTargets(result.targets.filter(t=>typeof t?.id==='string' && typeof t.label==='string'))
    }).catch(e=>{if(!abort.signal.aborted){setListError(describe(e));setTargets([])}})
      .finally(()=>{if(!abort.signal.aborted)setTargetsLoading(false);abortRequests.current.delete(abort)})
    return ()=>{abort.abort();abortRequests.current.delete(abort)}
  },[showing,listRevision])
  const options=targets.filter(t=>view==='screen' || t.browser===true)
  const target=options.find(t=>t.id===selected)
  const id=target?.id
  useEffect(()=>{
    setFrame(undefined);setFrameError('');setExtraNodes(false)
    if (!showing || !id) return
    const abort=new AbortController();abortRequests.current.add(abort)
    let timer:ReturnType<typeof setTimeout>
    async function capture(){
      if (abort.signal.aborted || document.hidden) return
      try {
        const reply=await agentRequest<Preview>('desktoppreview',{targetId:id,view},AbortSignal.any([abort.signal,AbortSignal.timeout(18000)]))
        if (abort.signal.aborted || document.hidden) return
        if (reply?.targetId!==id || !/^data:image\/(?:png|jpeg|webp);base64,/i.test(reply.image?.dataUrl ?? '')) throw Error('桌面组件返回的窗口图像无效。')
        setFrame(reply);setFrameError('')
        timer=setTimeout(()=>void capture(),2500)
      } catch(e){if(!abort.signal.aborted){setFrame(undefined);setFrameError(describe(e))}}
    }
    void capture()
    return ()=>{abort.abort();clearTimeout(timer);abortRequests.current.delete(abort)}
  },[id,view,showing,frameRevision])
  const current=showing && frame?.targetId===id ? frame:undefined
  const content=current?.content ?? []
  return <div className="lumaWorkspaceDesktop">
    <div className="lumaWorkspacePicker"><div className="lumaWorkspaceField"><label htmlFor={'workspace-window-'+member.id}>{view==='browser'?'浏览器窗口':'本机应用窗口'}</label>
      <button type="button" className="lumaWorkspaceIcon" aria-label="刷新窗口列表" title="刷新窗口列表" disabled={targetsLoading} onClick={()=>reloadList(n=>n+1)}><RefreshCw size={15}/></button></div>
    <select ref={picker} id={'workspace-window-'+member.id} value={target?.id ?? ''} onChange={event=>select(event.target.value)}>
      <option value="">{targetsLoading?'正在读取窗口…':view==='browser'?'选择浏览器窗口':'选择要预览的窗口'}</option>
      {options.map(t=><option key={t.id} value={t.id}>{t.label}</option>)}
    </select></div>
    {listError && <p role="alert">{listError}</p>}
    {!target && <div className="lumaWorkspaceStandby"><span>{view==='browser'?<Globe2 size={24}/>:<Monitor size={24}/>}</span>
      <strong>{targetsLoading?'正在读取窗口':listError?'窗口列表不可用':options.length?'等待选择'+(view==='browser'?'页面':'窗口'):'暂无可预览的'+(view==='browser'?'浏览器窗口':'应用窗口')}</strong>
      <small>{listError?'可点击刷新重新读取':!options.length && !targetsLoading?'打开窗口后刷新列表':'选择上方窗口即可查看实时画面'}</small></div>}
    {target && <figure className="lumaWorkspaceFrame">
      <div>{current?<img src={current.image.dataUrl} alt={target.label+'的实时窗口预览'}/>:
        <p role={frameError?'alert':'status'}>{frameError || '正在读取窗口画面…'}</p>}</div>
      <figcaption><span title={current?.title || target.label}>{current?.title || target.title || target.label}</span>{current && <time>{stamp(current.capturedAt)} · {current.image.width} × {current.image.height}</time>}
        {frameError && <button type="button" onClick={()=>reloadFrame(n=>n+1)}>重试预览</button>}</figcaption></figure>}
    {target && <div className="lumaWorkspaceApply">
      <button type="button" className="is-primary" disabled={!enabled || !member.config?.model || assigned===id}
        onClick={()=>onAssign(target.id,target.label)}>{assigned===id?<Check size={14}/>:<Monitor size={14}/>} {assigned===id?'已用于本次派工':'用于本次派工'}</button>
      {member.config?.model && <small>派工后，{member.name}可读取并操作这个窗口。</small>}</div>}
    {!member.config?.model && <div className="lumaWorkspaceBind"><Cpu size={15} aria-hidden="true"/><span>{dataReady?'电脑派工需要角色模型':'员工服务尚未就绪'}</span> <button type="button" disabled={!enabled || !dataReady} onClick={onConfigure}>配置角色模型</button></div>}
    {assigned && <div className="lumaWorkspaceAssignment"><span>本次窗口 · {targets.find(t=>t.id===assigned)?.label ?? (targetsLoading?'正在核对窗口':listError?'尚未核对':'窗口已不在列表中')}</span><button type="button" disabled={!enabled} onClick={()=>onAssign('','')}>解除分配</button></div>}
    {view==='browser' && current && <section className="lumaWorkspaceNodes"><div className="lumaWorkspaceField"><h3>页面可访问内容</h3><span>{content.length} 项</span></div>
      {content.length ? <><ol>{content.slice(0,extraNodes?content.length:12).map((n,i)=><li key={i}><small>{n.role}</small><span>{n.name}{n.value && n.value!==n.name && <em>{n.value}</em>}</span></li>)}</ol>
        {content.length>12 && <button type="button" onClick={()=>setExtraNodes(!extraNodes)}>{extraNodes?'收起':'查看全部 '+content.length+' 项'}</button>}</>:
        <p>这个页面没有向桌面组件公开文字或控件。</p>}</section>}
  </div>
}

export function RoleWorkspacePanel({title,members,eligibleIds,jobs,roleJobs=jobs,dataReady=true,names,assignments,canAssign,canWrite,active,onAssign,onConfigure,onClose}:{
  title:string;members:Member[];eligibleIds:string[];jobs:AgentJob[];roleJobs?:AgentJob[];dataReady?:boolean;names:Record<string,string>;assignments:Record<string,string>
  canAssign:boolean;canWrite:boolean;active:boolean;onAssign:(roleId:string,id:string,title:string)=>void
  onConfigure:(id:string)=>void;onClose:()=>void
}) {
  const [tab,setTab]=useState<Tab>('screen'),[chosen,setChosen]=useState(eligibleIds[0] ?? members[0]?.id)
  const [more,setMore]=useState(false)
  const [focusWindow,setFocusWindow]=useState(0)
  const uid=useId(),panel=useDrawerFocus<HTMLElement>()
  function selectTab(id:Tab) {
    setFocusWindow(0)
    setTab(id)
  }
  function moveTab(event:ReactKeyboardEvent<HTMLButtonElement>,index:number) {
    const next=event.key==='ArrowLeft'?(index+tabs.length-1)%tabs.length:event.key==='ArrowRight'?(index+1)%tabs.length:
      event.key==='Home'?0:event.key==='End'?tabs.length-1:undefined
    if(next===undefined)return
    event.preventDefault()
    selectTab(tabs[next].id)
    document.getElementById(uid+'-'+tabs[next].id)?.focus()
  }
  const member=members.find(m=>m.id===chosen && eligibleIds.includes(m.id)) ?? members.find(m=>eligibleIds.includes(m.id)) ?? members[0]
  const sorted=roleJobs.filter(j=>j.mode!=='chat').sort((a,b)=>b.createdAt-a.createdAt)
  const files=jobs.filter(j=>j.mode!=='chat').sort((a,b)=>b.createdAt-a.createdAt).flatMap(j=>j.steps.flatMap((s,i)=>s.status==='done' && s.output ? [{j,s,i}]:[]))
  useEffect(()=>{setMore(false)},[tab])
  useEffect(()=>{
    const escape=(event:KeyboardEvent)=>{if(event.key==='Escape' && !document.querySelector('dialog[open]')) onClose()}
    window.addEventListener('keydown',escape);return ()=>window.removeEventListener('keydown',escape)
  },[onClose])
  if (!member) return null
  return <aside ref={panel} className="lumaRoleWorkspace" aria-label="角色工作区">
    <header><div><EmployeeFace id={member.id} skin={member.skin}/><span><small>角色工作区</small><h2>{title}</h2></span></div>
      <button type="button" className="lumaWorkspaceIcon" aria-label="关闭角色工作区" title="关闭角色工作区" onClick={onClose}><PanelRightClose size={18}/></button></header>
    <div className="lumaWorkspaceTabs" role="tablist" aria-label="工作区视图">{tabs.map(({id,label,Icon},index)=>
      <button key={id} type="button" role="tab" id={uid+'-'+id} aria-selected={tab===id} aria-controls={uid+'-view-'+id}
        data-drawer-focus={id==='screen'?true:undefined} tabIndex={tab===id?0:-1} onClick={()=>selectTab(id)} onKeyDown={e=>moveTab(e,index)}><Icon size={15} aria-hidden="true"/>{label}</button>)}</div>
    <div className="lumaWorkspaceBody" role="tabpanel" id={uid+'-view-'+tab} aria-labelledby={uid+'-'+tab} tabIndex={0} key={tab}>
      {(tab==='screen' || tab==='browser') && <>
        {members.length>1 && <label className="lumaWorkspaceMember">本次操作成员<select value={member.id} onChange={e=>{setFocusWindow(0);setChosen(e.target.value)}}>{members.filter(m=>eligibleIds.includes(m.id)).map(m=><option key={m.id} value={m.id}>{m.name}</option>)}</select></label>}
        <DesktopView key={member.id+tab} view={tab} member={member} assigned={assignments[member.id] ?? ''} enabled={canAssign} active={active} focusWindow={focusWindow} dataReady={dataReady}
          onAssign={(id,label)=>onAssign(member.id,id,label)} onConfigure={()=>onConfigure(member.id)}/></>}
      {!dataReady && (tab==='files' || tab==='data') && <p role="status">员工服务尚未返回本机工作记录。</p>}
      {dataReady && tab==='data' && <section className="lumaWorkspaceData"><h3>执行数据</h3>
        <dl className="lumaWorkspaceCounts">{[[members.length===1?'角色任务':'本群任务',sorted.length],['执行中',sorted.filter(j=>inProgress(j.status)).length],['已完成',sorted.filter(j=>j.status==='done').length]].map(([key,n])=><div key={key}><dt>{key}</dt><dd>{n}</dd></div>)}</dl>
        <h3>角色与模型</h3><ul className="lumaWorkspaceBindings">{members.map(m=><li key={m.id}><ProviderMark config={m.config} size={26}/>
          <span>{m.name}</span><strong>{m.config?.model || '未绑定独立模型'}</strong></li>)}</ul>
        <h3>任务进度</h3>{!sorted.length && <p>{members.length===1?'这位角色':'本工作室'}还没有派工记录。</p>}
        {sorted.slice(0,more?sorted.length:6).map(j=><article key={j.id}><strong>{hint(j)}</strong><div><span>{statuses[j.status]}</span><span>{j.steps.filter(s=>s.status==='done').length} / {j.steps.length} 步</span></div>
          <progress max={Math.max(1,j.steps.length)} value={j.steps.filter(s=>s.status==='done').length} aria-label="步骤完成情况"/>
          {j.steps.filter(s=>s.status==='running').map((s,i)=><small key={i}>{names[s.roleId]} · {s.activity || (s.phase ? STUDIO_PHASE_NAMES[s.phase] : statuses[s.status])}</small>)}
          {j.error && <small>{j.error}</small>}</article>)}
        {sorted.length>6 && <button type="button" onClick={()=>setMore(!more)}>{more?'收起任务':'查看全部任务'}</button>}</section>}
      {dataReady && tab==='files' && <section className="lumaWorkspaceFiles"><h3>本会话交付 · {files.length}</h3>
        {files.length ? <ul>{files.map(({j,s,i})=><li key={j.id+'-'+i}><FileDown size={20}/><div><strong>{hint(j)}</strong><small>{names[s.roleId]} · {s.phase?STUDIO_PHASE_NAMES[s.phase]:'交付'} · Markdown</small></div>
          <button type="button" aria-label={'导出'+names[s.roleId]+'的第'+(i+1)+'步交付'} onClick={()=>exportResult(j.id,s.roleId+'-'+(i+1),s.output)}>导出</button></li>)}</ul>:
          <div className="lumaWorkspaceStandby"><span><Files size={24}/></span><strong>暂无交付文件</strong><small>任务步骤完成后，可在这里导出交付文件。</small></div>}</section>}
    </div>
    {tabs.filter(t=>t.id!==tab).map(t=><div key={t.id} hidden role="tabpanel" id={uid+'-view-'+t.id} aria-labelledby={uid+'-'+t.id}/>)}
    <footer className="lumaWorkspaceLocations"><h3>工作位置</h3><div className="lumaWorkspaceLocationChoices">
      <button type="button" aria-label="选择本机窗口" onClick={()=>{setTab('screen');setFocusWindow(value=>value+1)}}>
        <i className="lumaLocationIcon"><Monitor size={16} aria-hidden="true"/></i><span><strong>本机窗口</strong><small>{assignments[member.id]?'本次派工已分配':'选择操作窗口'}</small></span></button>
      <CloudOfficeLauncher key={member.id} roleId={member.id} name={member.name} disabled={!canWrite} label="云电脑">
        {connection=><><i className="lumaLocationIcon is-cloud"><Cloud size={16} aria-hidden="true"/></i><span><strong>云电脑</strong><small>{connection}</small></span></>}</CloudOfficeLauncher>
    </div></footer>
  </aside>
}

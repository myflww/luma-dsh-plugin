import { useEffect, useId, useState } from 'react'
import { AppWindow, ArrowRight, ChevronDown, CodeXml, FileSpreadsheet, FileText, FolderOpen, Globe2, Layers, Monitor, RefreshCw, ShieldCheck, SquareTerminal, Type } from 'lucide-react'
import { agentRequest } from './agent-desk-api.ts'
import { EmployeeFace } from './AgentDeskPanels.tsx'
import './StudioDesktopPicker.css'

type Target = {id:string;label:string;title?:string;app?:string;browser?:boolean}
type Status = {available:boolean;message:string;version?:string;platform?:string}
type Props = {members:{id:string;name:string;skin?:string|undefined}[];value:Record<string,string>;onChange:(values:Record<string,string>)=>void;disabled?:boolean}
const failure = (error:unknown)=>error instanceof Error && error.name!=='TimeoutError'?error.message:'桌面组件未及时响应。'

export function DesktopTargetMark({ target, assigned=false }: {target?:Target|undefined; assigned?:boolean}) {
  const app=(target?.app || '').toLowerCase().replace(/\.exe$/,'')
  const kind=!target && !assigned ? 'text' : target?.browser ? 'web'
    : ['notepad','notepad++','winword','wordpad','wps'].includes(app) ? 'document'
    : ['excel','et','scalc'].includes(app) ? 'sheet'
    : ['code','cursor','devenv'].includes(app) ? 'code'
    : ['cmd','windowsterminal','powershell','pwsh'].includes(app) ? 'terminal'
    : app==='explorer' ? 'folder' : 'window'
  const Icon={text:Type,web:Globe2,document:FileText,sheet:FileSpreadsheet,code:CodeXml,terminal:SquareTerminal,folder:FolderOpen,window:AppWindow}[kind]
  return <span className="lumaDesktopTargetMark" data-kind={kind} aria-hidden="true"><Icon size={15}/></span>
}

export function StudioDesktopPicker({members,value,onChange,disabled}:Props) {
  const [expanded,setExpanded]=useState(false), [refresh,setRefresh]=useState(0)
  const [targets,setTargets]=useState<Target[]>([]), [problem,setProblem]=useState(''), [loading,setLoading]=useState(false)
  const permissionId=useId()
  const count=members.filter(member=>value[member.id]).length
  const byWindow=new Map<string,number>()
  for(const member of members){
    const id=value[member.id]
    if(id) byWindow.set(id,(byWindow.get(id) ?? 0)+1)
  }
  useEffect(()=>{
    if (!expanded) return
    const abort=new AbortController()
    setLoading(true)
    setProblem('')
    void agentRequest<{targets:Target[]}>('desktoptargets',{},AbortSignal.any([abort.signal,AbortSignal.timeout(18000)]))
      .then(reply=>{if (!abort.signal.aborted) setTargets(reply.targets)})
      .catch(error=>{if (!abort.signal.aborted) setProblem(failure(error))})
      .finally(()=>{if (!abort.signal.aborted) setLoading(false)})
    return ()=>abort.abort()
  },[expanded,refresh])
  function assign(role:string,id:string) {
    const next={...value}
    if (id) next[role]=id
    else delete next[role]
    onChange(next)
  }
  return <details className="lumaStudioDesktopPicker" onToggle={event=>setExpanded(event.currentTarget.open)}>
    <summary aria-label={count?'本次电脑操作，'+count+' 位成员已分配窗口':'本次电脑操作'} title="为本轮任务分配窗口">
      <Monitor size={16} aria-hidden="true"/>本次电脑操作{count>0 && <span className="lumaAssignedCount">{count}</span>}<ChevronDown size={13} className="lumaPickerChevron" aria-hidden="true"/>
    </summary>
    {expanded && <div className="lumaStudioDesktopBody">
      <div className="lumaDesktopPermission"><ShieldCheck size={15} aria-hidden="true"/><p id={permissionId}>仅本轮授权。窗口的可访问内容会交给对应角色的模型。</p>
        <button type="button" title="刷新窗口" aria-label="刷新窗口" disabled={loading || disabled} onClick={()=>setRefresh(n=>n+1)}><RefreshCw size={15} aria-hidden="true"/></button></div>
      {loading && <p role="status">正在读取窗口…</p>}
      {problem && <p role="alert">{problem}</p>}
      {!loading && !problem && !targets.length && <p role="status">打开一个可操作的应用窗口，再刷新列表。</p>}
      <ul className="lumaDesktopAssignments" aria-label="成员的本轮窗口">{members.map(({id,name,skin})=>{
        const selected=value[id] || '', target=targets.find(item=>item.id===selected), shared=(byWindow.get(selected) ?? 0)>1
        return <li key={id} data-shared={shared || undefined}><label>
          <span className="lumaDesktopMember" title={name}><EmployeeFace id={id} skin={skin}/><strong>{name}</strong></span>
          <ArrowRight size={13} className="lumaDesktopRouteArrow" aria-hidden="true"/>
          <span className="lumaDesktopTarget"><DesktopTargetMark target={target} assigned={!!selected}/>
            <select aria-label={name+'本次可操作的窗口'} aria-describedby={permissionId} value={selected} title={target?.label} disabled={disabled} onChange={event=>assign(id,event.target.value)}>
              <option value="">仅处理文字任务</option>
              {selected && !target && <option value={selected} disabled>{loading?'正在核对已选窗口':'已选窗口暂不可用'}</option>}
              {targets.map(item=><option key={item.id} value={item.id}>{item.label}</option>)}
            </select><ChevronDown size={12} aria-hidden="true"/></span>
          {shared && <span className="lumaSharedTarget" title="共用此窗口的成员将依次操作"><Layers size={12} aria-hidden="true"/>依次操作</span>}
        </label></li>
      })}</ul>
    </div>}
  </details>
}

export function StudioDesktopStatus() {
  const [state,setState]=useState<Status>(), [refresh,setRefresh]=useState(0)
  useEffect(()=>{
    const abort=new AbortController()
    setState(undefined)
    void agentRequest<Status>('desktopstatus',{},AbortSignal.any([abort.signal,AbortSignal.timeout(18000)]))
      .then(reply=>{if (!abort.signal.aborted) setState(reply)})
      .catch(error=>{if (!abort.signal.aborted) setState({available:false,message:failure(error)})})
    return ()=>abort.abort()
  },[refresh])
  return <section className="lumaStudioDesktopStatus" aria-label="工作室电脑操作">
    <div><h2>本机窗口</h2><p role="status">{state?.version?'agent-desktop '+state.version+' · ':''}{state?.message ?? '正在检测 Windows 辅助功能…'}</p></div>
    <button type="button" onClick={()=>setRefresh(n=>n+1)} disabled={!state}>重新检测</button>
    <p>在「联系」派工时，可以给每位成员选择一个窗口。成员可同时查看各自的窗口。可识别的原生输入框和按钮依次操作，提交前会重新核对填写内容。</p>
  </section>
}

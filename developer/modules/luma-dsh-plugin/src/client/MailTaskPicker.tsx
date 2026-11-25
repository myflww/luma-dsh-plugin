import { useEffect, useId, useState } from 'react'
import { RefreshCw, X } from 'lucide-react'
import { agentRequest } from './agent-desk-api.ts'
import { useDrawerFocus } from './use-drawer-focus.ts'

type WindowChoice = {id:string;label:string;title:string}
const templates = {
  '汇总未读邮件':'根据这个窗口中可见的未读标记，汇总未读邮件的发件人、主题和待办事项。如果窗口未显示未读状态或完整正文，请说明。',
  '排列处理顺序':'将窗口中可见的邮件按处理优先级排序。列出主题、依据以及可见的截止时间，注明需要我确认的信息。',
  '按待办分类':'把窗口中可见的邮件或工作事项按「需要回复」「需要跟进」「仅供参考」归类，整理成一份清单。',
}

export function MailTaskPicker({name,configured,busy,onDraft,onClose,onConfigure}:{
  name:string;configured:boolean;busy:boolean;onDraft:(target:WindowChoice,text:string)=>void;onClose:()=>void;onConfigure:()=>void
}) {
  const [targets,setTargets]=useState<WindowChoice[]>([]),[selected,setSelected]=useState('')
  const [task,setTask]=useState<keyof typeof templates>('汇总未读邮件')
  const [revision,setRevision]=useState(0),[loading,setLoading]=useState(true),[error,setError]=useState('')
  const grantId=useId(), drawer=useDrawerFocus<HTMLElement>()
  useEffect(()=>{
    const abort=new AbortController()
    setLoading(true);setError('');setTargets([]);setSelected('')
    void agentRequest<{targets:WindowChoice[]}>('desktoptargets',{},AbortSignal.any([abort.signal,AbortSignal.timeout(18000)]))
      .then(reply=>{if(!abort.signal.aborted)setTargets(reply.targets.filter(t=>typeof t?.id==='string' && typeof t.title==='string' && t.title && typeof t.label==='string'))})
      .catch(reason=>{if(!abort.signal.aborted)setError(reason instanceof Error?reason.message:'暂时无法读取窗口。')})
      .finally(()=>{if(!abort.signal.aborted)setLoading(false)})
    return ()=>abort.abort()
  },[revision])
  const target=targets.find(row=>row.id===selected)
  return <aside ref={drawer} className="lumaRoleEditor lumaMailPicker" aria-label="整理邮件窗口" onKeyDown={e=>{if(e.key==='Escape')onClose()}}>
    <header><div><small>{name}</small><h2>整理邮件窗口</h2></div><button type="button" data-drawer-focus aria-label="关闭整理邮件窗口" onClick={onClose}><X size={16}/></button></header>
    <p id={grantId}>先打开收件箱或工作窗口。发送任务时，{name}的模型会读取所选窗口当时可见的文字一次。结果会出现在对话里，邮件保持原样。</p>
    <div className="lumaWorkspaceField"><strong>本次只读窗口</strong><button type="button" aria-label="刷新窗口列表" disabled={loading} onClick={()=>setRevision(n=>n+1)}><RefreshCw size={15}/></button></div>
    <select aria-label="本次只读窗口" aria-describedby={grantId} value={selected} disabled={loading || busy} onChange={e=>setSelected(e.target.value)}>
      <option value="">{loading?'正在读取窗口…':'选择邮件或工作窗口'}</option>
      {targets.map(row=><option key={row.id} value={row.id}>{row.label}</option>)}
    </select>
    {error && <p role="alert">{error}</p>}
    {!loading && !error && !targets.length && <p role="status">打开窗口后，点击刷新窗口列表。</p>}
    <label>整理方式<select value={task} onChange={e=>setTask(e.target.value as keyof typeof templates)}>
      {(Object.keys(templates) as (keyof typeof templates)[]).map(key=><option key={key}>{key}</option>)}
    </select></label>
    {configured ? <button className="is-primary" type="button" disabled={!target || busy} onClick={()=>target && onDraft(target,templates[task])}>加入任务草稿</button>
      : <button type="button" onClick={onConfigure}>配置角色模型</button>}
  </aside>
}

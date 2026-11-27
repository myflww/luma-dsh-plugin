import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { ArrowLeft, Check, ChevronDown, ChevronRight, CircleQuestionMark, GitFork, ListOrdered, MessagesSquare, Monitor, UserRound, UserRoundCheck, X } from 'lucide-react'
import { EmployeeFace } from './AgentDeskPanels.tsx'
import './RoomCapabilityMenu.css'

const capabilities = [
  { key:'@chat', group:'聊天', label:'群聊', icon:MessagesSquare, help:'把消息发到群里，成员根据话题接话。也可以在消息中 @ 想听的人。' },
  { key:'person', group:'聊天', label:'点名聊天', icon:UserRound, help:'选一位成员在群里回答。其他人能看到这段对话。' },
  { key:'@studio', group:'协作任务', label:'全员分工', icon:GitFork, help:'协调人先分配工作，成员分别处理，最后由协调人汇总交付。' },
  { key:'@relay', group:'协作任务', label:'全员接力', icon:ListOrdered, help:'成员按顺序处理同一项任务。每个人能看到前面成员的成果，再接着完成自己的部分。' },
  { key:'task', group:'协作任务', label:'点名派工', icon:UserRoundCheck, help:'选一位成员独立完成任务，结果交回群里。' },
  { key:'windows', group:'本机工具', label:'电脑操作', icon:Monitor, help:'为当前参与成员选择本轮可操作的窗口。选择后消息按任务处理，窗口的可访问内容会交给对应成员的模型。' },
] as const
type Capability = typeof capabilities[number]
type Subpage = 'person' | 'task' | 'windows'
type Member = {id:string; name:string; skin?:string | undefined}

interface Props {
  members:Member[]
  recipient:string
  choose:(value:string)=>void
  disabled:boolean
  windowCount:number
  windowPicker?:ReactNode
}

export function RoomCapabilityMenu({members,recipient,choose,disabled,windowCount,windowPicker}:Props) {
  const trigger = useRef<HTMLButtonElement>(null), dialog = useRef<HTMLDialogElement>(null)
  const title = useRef<HTMLHeadingElement>(null), uid = useId()
  const [open,setOpen] = useState(false), [page,setPage] = useState<Subpage>()
  const [help,setHelp] = useState<Capability>()
  const target = members.find(member => member.id === recipient.replace(/^@task\//,''))
  const activeKey = target ? recipient.startsWith('@task/') ? 'task' : 'person' : recipient
  const active = capabilities.find(entry=>entry.key===activeKey) ?? capabilities[0]
  const heading = page ? capabilities.find(entry=>entry.key===page)!.label : '工作室能力'
  const activeLabel = active.label + (target ? ' · '+target.name : '')
  const canAssignWindows = Boolean(windowPicker)
  function dismiss() {
    setOpen(false); setPage(undefined); setHelp(undefined)
  }
  useEffect(()=>{
    if (!open) return
    const node = dialog.current!, button = trigger.current
    if (typeof node.showModal === 'function') node.showModal()
    else node.setAttribute('open','')
    return () => {
      if (typeof node.close === 'function' && node.open) node.close()
      button?.focus()
    }
  },[open])
  useEffect(()=>{if(open) title.current?.focus()},[open,page])
  useEffect(()=>{if(disabled || page==='windows' && !canAssignWindows) dismiss()},[disabled,page,canAssignWindows])
  function pick(entry:Capability) {
    setHelp(undefined)
    if (entry.key==='person' || entry.key==='task' || entry.key==='windows') { setPage(entry.key); return }
    choose(entry.key); dismiss()
  }
  return <>
    <button ref={trigger} type="button" className="lumaRoomRecipient lumaCapabilityTrigger" disabled={disabled} aria-haspopup="dialog"
      aria-expanded={open} aria-controls={open?uid:undefined} aria-label={'工作室能力，当前'+activeLabel} onClick={()=>setOpen(true)}>
      {target ? <EmployeeFace id={target.id} skin={target.skin}/> : <active.icon size={16} aria-hidden="true"/>}
      <strong>{activeLabel}</strong>{windowCount>0 && <small>{windowCount} 个窗口</small>}<ChevronDown size={13} aria-hidden="true"/>
    </button>
    {open && <dialog ref={dialog} id={uid} className="lumaCapabilityDialog" aria-labelledby={uid+'-title'} onCancel={e=>{
      e.preventDefault(); if(help) setHelp(undefined); else dismiss()
    }} onPointerLeave={()=>{if(!document.activeElement?.classList.contains('lumaCapabilityHelp')) setHelp(undefined)}} onClick={e=>{if(e.target===e.currentTarget) {
      const r=e.currentTarget.getBoundingClientRect()
      if(e.clientX<r.left || e.clientX>r.right || e.clientY<r.top || e.clientY>r.bottom) dismiss()
    }}} onKeyDown={e=>{
      if(e.key==='Escape') { e.preventDefault(); e.stopPropagation(); if(help) setHelp(undefined); else dismiss() }
    }}>
      <header>{page && <button type="button" aria-label="返回工作室能力" onClick={()=>setPage(undefined)}><ArrowLeft size={17}/></button>}
        <h3 ref={title} tabIndex={-1} id={uid+'-title'}>{heading}</h3>
        <button type="button" aria-label="关闭工作室能力" onClick={dismiss}><X size={17}/></button></header>
      <div className="lumaCapabilityScroll">
        {!page && ['聊天','协作任务','本机工具'].map(group=><section key={group} aria-label={group}><h4>{group}</h4>
          {capabilities.filter(entry=>entry.group===group).map(entry=><div className="lumaCapabilityRow" key={entry.key}>
            <button type="button" className="lumaCapabilityChoice" disabled={entry.key==='windows' && !windowPicker} onClick={()=>pick(entry)}>
              <entry.icon size={17} aria-hidden="true"/><span>{entry.label}</span>
              {entry.key===activeKey && <Check size={15} aria-label="已选"/>}
              {['person','task','windows'].includes(entry.key) && <ChevronRight size={14} aria-hidden="true"/>}</button>
            <button type="button" className="lumaCapabilityHelp" aria-label={entry.label+'说明'}
              aria-describedby={help===entry?uid+'-help':undefined} onFocus={()=>setHelp(entry)} onBlur={()=>setHelp(undefined)}
              onPointerEnter={()=>setHelp(entry)}
              onClick={()=>setHelp(entry)}><CircleQuestionMark size={16} aria-hidden="true"/></button></div>)}</section>)}
        {(page==='person' || page==='task') && <div className="lumaCapabilityMembers">{members.map(member=><button type="button" key={member.id}
          onClick={()=>{choose(page==='task'?'@task/'+member.id:member.id);dismiss()}}>
          <EmployeeFace id={member.id} skin={member.skin}/><span>{member.name}</span>
          {target?.id===member.id && page===activeKey && <Check size={15} aria-label="已选"/>}</button>)}</div>}
        {page==='windows' && windowPicker}
      </div>
      {!page && <div className="lumaCapabilityHint" role={help?'tooltip':undefined} id={uid+'-help'}>
        {capabilities.map(entry => <span key={entry.key} aria-hidden={entry!==(help ?? active)}>
          <strong>{entry.label}</strong>{entry.help}
        </span>)}
      </div>}
    </dialog>}
  </>
}

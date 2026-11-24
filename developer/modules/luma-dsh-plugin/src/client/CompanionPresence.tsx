import { useEffect, useRef, useState } from 'react'
import { Monitor, MoonStar } from 'lucide-react'
import { createOfficeTimePolicy } from '../../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/office2d/timePolicy.ts'
import { agentRequest } from './agent-desk-api.ts'
import { MESSAGE_CHARACTERS, type MessagesRuntime } from './messages-runtime.ts'
import { projectPluginSceneEmployees } from './office-scene-employees.ts'
import type { OfficePageRuntime } from './office-runtime.ts'
import { EmployeeFace } from './AgentDeskPanels.tsx'
import type { CompanionSettings, LifeStatus, LifeLetter } from '../shared/companion-life.ts'
import './CompanionPresence.css'

export function CompanionPresence({messages,office,sceneVisible,onContact,onLetter}:{
  messages:MessagesRuntime;office:OfficePageRuntime;sceneVisible:boolean;onContact:(id:string)=>void;onLetter?:(letter:LifeLetter)=>void
}) {
  const [letter,setLetter]=useState<LifeLetter>()
  const view=useRef(sceneVisible)
  view.current=sceneVisible
  useEffect(()=>{
    let ended=false, pending=false
    const stop=new AbortController()
    async function heartbeat() {
      if(ended || pending)return
      const state=messages.getSnapshot()
      const spatial=office.getSnapshot()
      if(!state.writable || spatial.persistence!=='host') return
      const date=new Date()
      const policy=createOfficeTimePolicy({date, ...(spatial.calendar ? {calendar:spatial.calendar} : {}), ...(spatial.holidayCalendar ? {officialCalendarCache:spatial.holidayCalendar} : {})})
      const editing=document.activeElement?.closest('textarea,input[type="text"],input[type="search"],input[type="password"],[contenteditable="true"]')
      const candidates=policy.bedtime || document.hidden || !document.hasFocus() || editing || state.running || state.pending ? [] : projectPluginSceneEmployees(spatial.projection.employees,[],policy,date)
        .filter(person=>person.taskState==='idle' && person.availability==='available' && person.location!=='unknown')
        .map(person=>{
          const profile=state.preferences.profiles[person.id] ?? MESSAGE_CHARACTERS.find(role=>role.id===person.id)?.profile
          return {role:person.id,place:person.location==='office'?'office':'home',
            topic:(person.id===state.roleId ? state.sessionId : undefined) ?? state.preferences.activeTopics[person.id] ?? spatial.projection.employees.find(row=>row.employeeId===person.id)?.sessionId,
            persona:profile ? profile.name+'。'+profile.personality : undefined}
        })
      pending=true
      try {
        const result=await agentRequest<{letter?:LifeLetter;danmaku:boolean}>('companionpulse',{candidates},AbortSignal.any([stop.signal,AbortSignal.timeout(30000)]))
        if(!ended && result.letter && result.danmaku && view.current && !document.hidden) setLetter(result.letter)
      } catch { /* A missing optional companion connection leaves the room usable. */ }
      finally {pending=false}
    }
    void heartbeat()
    const timer=window.setInterval(()=>void heartbeat(),30000)
    const visible=()=>{void heartbeat()}
    const changed=()=>{setLetter(undefined);void heartbeat()}
    window.addEventListener('luma-companion-prefs',changed)
    document.addEventListener('visibilitychange',visible)
    return ()=>{ended=true;stop.abort();clearInterval(timer);window.removeEventListener('luma-companion-prefs',changed);document.removeEventListener('visibilitychange',visible)}
  },[office,messages])
  useEffect(()=>{
    if(!sceneVisible){setLetter(undefined);return}
    if(!letter)return
    const timer=setTimeout(()=>setLetter(undefined),17500)
    return ()=>clearTimeout(timer)
  },[letter,sceneVisible])
  if(!letter || !sceneVisible)return null
  const profile=messages.getSnapshot().preferences.profiles[letter.role]
  const name=profile?.name ?? MESSAGE_CHARACTERS.find(person=>person.id===letter.role)?.name
  return <div className={'lumaDanmakuTrack'+(office.getSnapshot().motionPreference==='reduce' ? ' is-reduced' : '')}><button key={letter.id} className="lumaLifeDanmaku" onClick={()=>{setLetter(undefined);if(onLetter)onLetter(letter);else onContact(letter.role)}} aria-label={'打开'+name+'的主动来信'}>
    <EmployeeFace id={letter.role} skin={messages.getSnapshot().employeeSkins?.[letter.role]}/><b>{name}</b><span>{letter.source==='model'?'给你写了一封私信，点开看看。':letter.text}</span></button></div>
}

export function CompanionSettingsPanel({ writable = true }: { writable?: boolean }) {
  const [state,setState]=useState<LifeStatus>()
  const [error,setError]=useState('')
  const [busy,setBusy]=useState(false)
  const [expanded,setExpanded]=useState(false)
  const writing=useRef(false)
  const generation=useRef(0)
  useEffect(()=>{
    let ended=false
    async function refresh(){
      if(writing.current) return
      const seq=++generation.current
      try {
        const response=await agentRequest<LifeStatus>('companionsettings',{},AbortSignal.timeout(6000))
        if(!ended && seq===generation.current){setState(response);setError('')}
      } catch {if(!ended && seq===generation.current)setError('暂时无法读取本机陪伴设置。')}
    }
    void refresh()
    const timer=setInterval(()=>void refresh(),expanded?5000:30000)
    return ()=>{ended=true;clearInterval(timer)}
  },[expanded])
  async function change(patch:Partial<CompanionSettings>){
    if(!writable || writing.current)return
    writing.current=true;generation.current++;setBusy(true);setError('')
    try {
      setState(await agentRequest<LifeStatus>('companionconfigure',patch,AbortSignal.timeout(9000)))
      window.dispatchEvent(new Event('luma-companion-prefs'))
    } catch(e){setError(e instanceof Error?e.message:'设置未保存。')}
    finally{writing.current=false;setBusy(false)}
  }
  const p=state?.settings
  return <section className="lumaLifeSettings" aria-label="日常陪伴">
    <h2><MoonStar aria-hidden="true" size={19}/>日常陪伴</h2>
    <p>伙伴在清醒、空闲时，偶尔会写来一条私信。每天最多三条，晚上八点后安静。</p>
    {p && <fieldset disabled={busy || !writable}><label><input type="checkbox" checked={p.proactive} onChange={e=>void change({proactive:e.target.checked})}/>允许伙伴主动来信</label>
      <label><input type="checkbox" checked={p.danmaku} disabled={!p.proactive} onChange={e=>void change({danmaku:e.target.checked})}/>在房间顶端飘过，点击可回复</label>
      <label><input type="checkbox" checked={p.model} disabled={!p.proactive} onChange={e=>void change({model:e.target.checked})}/>使用员工独立 API 写来信</label>
      <small>默认使用本地角色对白。开启独立 API 后，会把该员工的人设和近期私聊交给其模型，可能使用额度。模型也可以选择沉默。</small>
      {state?.modelNotice && <small role="status">{state.modelNotice}</small>}
    </fieldset>}
    <details className="lumaAppSharing" open={expanded} onToggle={e=>setExpanded(e.currentTarget.open)}>
      <summary><Monitor aria-hidden="true" size={16}/>屏幕使用情况</summary>
      {p && expanded && <fieldset disabled={busy || !writable}><p>在本机临时统计最近 15 分钟的前台应用名和使用时长。关闭后立即清空。窗口标题、网页地址、按键内容和画面均不采集。</p>
        <label><input type="checkbox" checked={p.collectApps} onChange={e=>void change({collectApps:e.target.checked})}/>开启本机应用时长预览</label>
        {p.collectApps && <><ul className="lumaUsagePreview" aria-label="实际可共享的应用摘要">{state!.apps.map(app=><li key={app.app}><span>{app.app}</span><b>{Math.floor(app.seconds/60)} 分 {app.seconds%60} 秒</b></li>)}</ul>
          {!state!.apps.length && <small role="status">{state!.sampler==='unavailable'?'当前环境无法读取 Windows 前台应用。':'等待连续两次采样，约 15 秒后显示。电脑空闲时暂停计时。'}</small>}
          <strong>允许在私聊时接收摘要的伙伴</strong><small>只有你主动发送普通私聊时才附带摘要。该伙伴当前配置的 DSH 或 API 服务可能将其保存在会话中。</small>
          {state!.roles.map(id=><label key={id}><input type="checkbox" checked={p.sharedRoles.includes(id)}
            onChange={e=>void change({sharedRoles:e.target.checked?[...p.sharedRoles,id]:p.sharedRoles.filter(v=>v!==id)})}/>{MESSAGE_CHARACTERS.find(role=>role.id===id)?.name ?? id}</label>)}</>}
      </fieldset>}
    </details>
    {error && <p role="alert">{error}</p>}
  </section>
}

import { Fragment, useEffect, useRef, useState } from 'react'
import { EmployeeFace, AgentServicePanel, exportResult } from './AgentDeskPanels.tsx'
import { CloudOfficeLauncher } from './CloudOfficePanel.tsx'
import { agentRequest, inProgress, type AgentState, type WorkRoom } from './agent-desk-api.ts'
import { MESSAGE_CHARACTERS, type MessagesSnapshot } from './messages-runtime.ts'
import './WorkRooms.css'

type Props = {
  snapshot: MessagesSnapshot
  state: AgentState
  names: Record<string, string>
  refresh(): Promise<unknown>
  close(): void
}
const statuses = { queued: '等待接手', running: '正在处理', done: '已交付', cancelled: '已停止', failed: '未完成' }

export function RoomCreator({ snapshot, names, close, onCreated, refresh, state, availableRoleIds }: Props & { availableRoleIds: readonly string[]; onCreated(room: WorkRoom): void }) {
  const [members, setMembers] = useState<string[]>([snapshot.roleId])
  const [duties,setDuties]=useState<Record<string,string>>({})
  const [title, setTitle] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const submission = useRef({ signature: '', requestId: '' }), lock = useRef(false)
  const defaultName = members.map(id => names[id]).slice(0, 2).join('、').slice(0, 48) + '协作群'
  async function create() {
    if (lock.current || members.length < 2 || !snapshot.writable || members.some(id => !availableRoleIds.includes(id))) return
    const name = title.trim() || defaultName
    const assignments=Object.fromEntries(members.filter(id=>duties[id]?.trim()).map(id=>[id,duties[id]!.trim()]))
    const signature = JSON.stringify([members, name, assignments])
    if (submission.current.signature !== signature) submission.current = { signature, requestId: crypto.randomUUID() }
    lock.current = true; setBusy(true); setError('')
    try {
      const room = await agentRequest<WorkRoom>('createroom', { name, roleIds: members, duties:assignments, requestId: submission.current.requestId }, AbortSignal.timeout(15000))
      onCreated(room)
      await refresh()
    } catch (e) { setError(e instanceof Error ? e.message : '创建失败，请重试。') }
    finally { lock.current = false; setBusy(false) }
  }
  return <section className="lumaMessagesConversation lumaRoomCreator" aria-label="新建协作群">
    <header className="lumaMessageToolbar"><h2>新建协作群</h2><button type="button" disabled={busy} onClick={close}>返回</button></header>
    <form className="lumaCreateRoomForm" onSubmit={e => { e.preventDefault(); void create() }}>
      <label>群名称<input maxLength={60} value={title} disabled={busy} placeholder={defaultName} onChange={e => setTitle(e.target.value)} /></label>
      <fieldset disabled={busy}><legend>选择群成员 <small>至少 2 人 · 已选 {members.length} 人</small></legend>
        <div className="lumaRoomPeople">{MESSAGE_CHARACTERS.filter(person => availableRoleIds.includes(person.id) && Object.hasOwn(state.roles, person.id)).map(person => {
          const selected = members.includes(person.id)
          return <label key={person.id}><input type="checkbox" checked={selected} onChange={e => {
            setMembers(current => e.target.checked ? [...current, person.id] : current.filter(id => id !== person.id))
          }} /><EmployeeFace id={person.id} skin={snapshot.employeeSkins?.[person.id]} /><span>{names[person.id]}</span></label>
        })}</div></fieldset>
      {members.length>=2 && <fieldset className="lumaRoomAssignments" disabled={busy}><legend>接力分工</legend>
        <ol>{members.map((id,index)=><li key={id}>
          <span className="lumaRoomStep">{index+1}</span><label><strong>{names[id]}</strong>
            <small>{state.roles[id]?.model || '尚未配置模型'}</small>
            <input aria-label={names[id]+'的分工'} maxLength={180} value={duties[id] ?? ''} placeholder={index===members.length-1?'汇总交付，可自定分工':index===0?'起草，可自定分工':'补充或审阅，可自定分工'} onChange={e=>setDuties({...duties,[id]:e.target.value})}/></label>
          {index>0 && <button type="button" aria-label={'提前'+names[id]+'的发言顺序'} onClick={()=>setMembers(current=>{
            const next=[...current]; [next[index-1],next[index]]=[next[index]!,next[index-1]!]; return next
          })}>上移</button>}
        </li>)}</ol></fieldset>}
      {error && <p role="alert">{error}</p>}
      <button className="is-primary" disabled={!snapshot.writable || members.length < 2 || busy}>{busy ? '创建中…' : '创建群聊'}</button>
    </form>
  </section>
}

type Draft = { text: string; target: string; requestId: string }
const emptyDraft = (): Draft => ({ text: '', target: '', requestId: '' })
function readDraft(id: string): Draft {
  try {
    const draft = JSON.parse(localStorage.getItem('luma.room.draft.' + id) ?? 'null')
    if (draft && ['text','target','requestId'].every(key => typeof draft[key] === 'string')) return draft
  } catch {}
  return emptyDraft()
}

export function RoomConversation({ room, snapshot, state, names, refresh, close }: Props & { room: WorkRoom }) {
  const [draft, setDraft] = useState(() => readDraft(room.id))
  const [service, setService] = useState(''), [error, setError] = useState(''), [sending, setSending] = useState(false)
  const lock = useRef(false), scroll = useRef<HTMLDivElement>(null), stick = useRef(true)
  const jobs = state.jobs.filter(job => job.topic === room.id)
  const running = jobs.find(job => inProgress(job.status))
  const target = room.roleIds.includes(draft.target) ? draft.target : ''
  const ids = target ? [target] : room.roleIds
  const missing = ids.filter(id => !state.roles[id]?.model)
  const canSend = snapshot.writable && !sending && !running && !missing.length && !!draft.text.trim()
  const signature = JSON.stringify(jobs.map(j => [j.id, j.status, j.steps.map(s => s.status)]))
  function saveDraft(next: Draft) {
    try { localStorage.setItem('luma.room.draft.' + room.id, JSON.stringify(next)) } catch {}
    setDraft(next)
  }
  useEffect(() => {
    if (stick.current) scroll.current?.scrollTo({ top: scroll.current.scrollHeight })
  }, [signature])
  useEffect(() => {
    if (draft.requestId && jobs.some(job => job.id === draft.requestId)) saveDraft({ ...draft, text:'', requestId:'' })
  }, [signature, draft.requestId])
  async function send() {
    if (!canSend || lock.current) return
    lock.current = true; setSending(true); setError('')
    const requestId = draft.requestId || crypto.randomUUID()
    const submitted = { ...draft, requestId }
    saveDraft(submitted)
    const profiles = Object.fromEntries(ids.map(id => {
      const {name, personality, scenario} = snapshot.preferences.profiles[id] ?? MESSAGE_CHARACTERS.find(person => person.id === id)!.profile
      return [id, { name, personality, scenario }]
    }))
    try {
      await agentRequest('run', { requestId, topic:room.id, mode: target ? 'task' : 'team', roleIds:ids, profiles, text:draft.text.trim() }, AbortSignal.timeout(15000))
      saveDraft({ ...submitted, text:'', requestId:'' })
      await refresh()
    } catch (e) { setError(e instanceof Error ? e.message : '提交未确认，草稿已保留。') }
    finally { lock.current = false; setSending(false) }
  }
  async function cancel(id: string) {
    try { await agentRequest('cancel', { id }); await refresh() }
    catch (e) { setError(e instanceof Error ? e.message : '停止任务失败。') }
  }
  return <><section className="lumaMessagesConversation lumaRoomConversation" aria-label="协作群对话">
    <header className="lumaMessageToolbar"><div><h2>{room.name}</h2><span>{room.roleIds.length} 位员工 · {room.roleIds.map(id => names[id]+(room.duties?.[id]?'（'+room.duties[id]+'）':'')).join(' → ')}</span></div>
      <button type="button" onClick={close}>返回私聊</button></header>
    <div className="lumaMessageHistory" ref={scroll} role="log" aria-label="群聊记录" aria-live="polite"
      onScroll={e => { const el = e.currentTarget; stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 90 }}>
      {!jobs.length && <div className="lumaRoomEmpty"><div>{room.roleIds.map(id => <EmployeeFace key={id} id={id} skin={snapshot.employeeSkins?.[id]} />)}</div>
        <h3>把第一项任务交给大家</h3><p>群成员共享这里的发言和交付。可以让全员接力，也可以点名一位员工继续。</p></div>}
      {jobs.map(job => <Fragment key={job.id}>
        <article className="lumaMessageBubble is-user"><div><header><strong>{snapshot.preferences.userName}</strong>
          <span>{job.roleIds.length === 1 ? '@' + names[job.roleIds[0]!] : '@全员'}</span>
          <time dateTime={new Date(job.createdAt).toISOString()}>{new Date(job.createdAt).toLocaleTimeString('zh-CN', {hour:'2-digit', minute:'2-digit'})}</time>
        </header><p>{job.text}</p></div></article>
        {job.steps.map(step => <article key={step.roleId} className="lumaMessageBubble is-assistant">
          <EmployeeFace id={step.roleId} skin={snapshot.employeeSkins?.[step.roleId]} /><div><header><strong>{names[step.roleId]}</strong>
            <span>{statuses[step.status]}{step.model?' · '+step.model:''}</span></header>{step.output && <><p>{step.output}</p>
            <footer className="lumaRoomResultActions"><button type="button" onClick={() => exportResult(job.id, step.roleId, step.output)}>导出成果</button>
              {snapshot.writable && <CloudOfficeLauncher roleId={step.roleId} name={names[step.roleId]!} initialText={step.output} />}</footer></>}</div></article>)}
        {job.error && <p className="lumaMessageNotice" role="status">{job.error}</p>}
      </Fragment>)}
    </div>
    <form className="lumaMessageComposer lumaRoomComposer" onSubmit={e => { e.preventDefault(); void send() }}>
      <label>发给 <select aria-label="群聊发言对象" disabled={sending} value={target} onChange={e => saveDraft({...draft, target:e.target.value, requestId:''})}>
        <option value="">全员接力</option>{room.roleIds.map(id => <option key={id} value={id}>{names[id]}</option>)}</select></label>
      {missing.length > 0 && <div className="lumaRoomMissing"><span>待配置的员工服务</span>{missing.map(id => <button type="button" key={id} disabled={!snapshot.writable} onClick={() => setService(id)}>{names[id]} · 配置</button>)}</div>}
      <textarea aria-label="群消息" placeholder={'发消息到「' + room.name + '」…'} maxLength={32000} value={draft.text} disabled={sending || !snapshot.writable}
        onChange={e => saveDraft({...draft, text:e.target.value, requestId:''})} onKeyDown={e => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !e.nativeEvent.isComposing) { e.preventDefault(); e.currentTarget.form?.requestSubmit() }
        }} />
      {error && <p role="alert">{error}</p>}
      <div><span>Ctrl / ⌘ + Enter 发送到群</span>{running
        ? <button type="button" disabled={!snapshot.writable} onClick={() => void cancel(running.id)}>停止本轮</button>
        : <button className="is-primary" disabled={!canSend} type="submit">发送到群</button>}</div>
    </form></section>
    {service && <AgentServicePanel key={service} forHandoff roleId={service} name={names[service]!} config={state.roles[service]} canWrite={snapshot.writable} refresh={refresh} close={() => setService('')} />}
  </>
}

import { ReplyTools, replyKey } from './ReplyTools.tsx'
import { TranscriptFrame } from './TurnNavigator.tsx'
import { readChatFiles } from './chat-file-reader.ts'
import { acceptsImagesAndTextOnly } from '../shared/chat-attachments.ts'
import { Fragment, useEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowUp, Check, ChevronDown, Crown, GitFork, List, ListOrdered, MessagesSquare, UsersRound } from 'lucide-react'
import { EmployeeFace, AgentServicePanel } from './AgentDeskPanels.tsx'
import { CloudOfficeLauncher } from './CloudOfficePanel.tsx'
import { agentRequest, inProgress, type AgentState, type WorkRoom } from './agent-desk-api.ts'
import { MESSAGE_CHARACTERS, type MessagesSnapshot } from './messages-runtime.ts'
import { AttachmentNames, ComposerActions, PendingAttachments } from './ChatAttachments.tsx'
import { StudioDesktopPicker } from './StudioDesktopPicker.tsx'
import { StudioReceiptTrail } from './StudioReceiptTrail.tsx'
import { StudioIllustration } from './StudioIllustration.tsx'
import { ProviderMark } from './ProviderMark.tsx'
import { RoleWorkspacePanel, WorkspaceButton } from './RoleWorkspacePanel.tsx'
import { ContactRecords, ManageRecordButton, RecordsButton, type DeletedRecordIds, type RecordFocus } from './ContactRecords.tsx'
import { STUDIO_PHASE_NAMES, type TeamWorkflow } from '../shared/studio-workflow.ts'
import { studioReviewers } from '../shared/studio-verification.ts'
import './WorkRooms.css'

type Props = {
  snapshot: MessagesSnapshot
  state: AgentState
  names: Record<string, string>
  refresh(): Promise<unknown>
  close(): void
}
const statuses = { queued: '等待接手', running: '正在处理', done: '已交付', cancelled: '已停止', failed: '未完成' }

function RoomFaces({ ids, skins }: { ids: readonly string[]; skins: MessagesSnapshot['employeeSkins'] }) {
  return <span className="lumaRoomFaces" aria-hidden="true" data-count={Math.min(ids.length, 4)}>
    {ids.slice(0, 4).map(id => <EmployeeFace key={id} id={id} skin={skins?.[id]}/>)}
  </span>
}

export function RoomCreator({ snapshot, names, close, onCreated, refresh, state, availableRoleIds }: Props & { availableRoleIds: readonly string[]; onCreated(room: WorkRoom): void }) {
  const [members, setMembers] = useState<string[]>([snapshot.roleId])
  const [duties,setDuties]=useState<Record<string,string>>({})
  const [workflow,setWorkflow] = useState<TeamWorkflow>('studio')
  const [title, setTitle] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const submission = useRef({ signature: '', requestId: '' }), lock = useRef(false)
  const defaultName = members.map(id => names[id]).slice(0, 2).join('、').slice(0, 48) + '工作室'
  async function create() {
    if (lock.current || members.length < 2 || !snapshot.writable || members.some(id => !availableRoleIds.includes(id))) return
    const name = title.trim() || defaultName
    const assignments=Object.fromEntries(members.filter(id=>duties[id]?.trim()).map(id=>[id,duties[id]!.trim()]))
    const signature = JSON.stringify([members, name, assignments, workflow])
    if (submission.current.signature !== signature) submission.current = { signature, requestId: crypto.randomUUID() }
    lock.current = true; setBusy(true); setError('')
    try {
      const room = await agentRequest<WorkRoom>('createroom', { name, roleIds: members, duties:assignments, workflow, requestId: submission.current.requestId }, AbortSignal.timeout(15000))
      onCreated(room)
      await refresh()
    } catch (e) { setError(e instanceof Error ? e.message : '创建失败，请重试。') }
    finally { lock.current = false; setBusy(false) }
  }
  return <section className="lumaMessagesConversation lumaRoomCreator" aria-label="新建协作工作室">
    <header className="lumaMessageToolbar"><div className="lumaEmployeeTitle">
      {members.length ? <RoomFaces ids={members} skins={snapshot.employeeSkins}/> : <UsersRound size={28} aria-hidden="true"/>}
      <div><h2>新建协作工作室</h2><span>{members.length} 位成员已加入</span></div></div>
      <button type="button" className="lumaRoomBack" disabled={busy} onClick={close} aria-label="返回" title="返回"><ArrowLeft size={18} aria-hidden="true"/></button></header>
    <form className="lumaCreateRoomForm" onSubmit={e => { e.preventDefault(); void create() }}>
      <div className="lumaRoomSetup">
      <label className="lumaRoomName">工作室名称<input maxLength={60} value={title} disabled={busy} placeholder={defaultName} onChange={e => setTitle(e.target.value)} /></label>
      <fieldset disabled={busy}><legend>选择群成员 <small>至少 2 人</small></legend>
        <div className="lumaRoomPeople">{MESSAGE_CHARACTERS.filter(person => availableRoleIds.includes(person.id) && Object.hasOwn(state.roles, person.id)).map(person => {
          const selected = members.includes(person.id)
          return <label key={person.id}><input type="checkbox" checked={selected} onChange={e => {
            const checked=e.target.checked
            setMembers(current => checked ? [...current, person.id] : current.filter(id => id !== person.id))
          }} /><EmployeeFace id={person.id} skin={snapshot.employeeSkins?.[person.id]} /><strong>{names[person.id]}</strong><span className="lumaRoomCheck" aria-hidden="true">{selected && <Check size={11} strokeWidth={3}/>}</span></label>
        })}</div></fieldset>
      <fieldset disabled={busy} className="lumaWorkflowChoices"><legend>默认协作方式</legend>
        <label><input type="radio" name="workflow" checked={workflow === 'studio'} onChange={()=>setWorkflow('studio')}/><GitFork size={19} aria-hidden="true"/><span><strong>协调人分派</strong><small>全员并行，协调人汇总</small></span></label>
        <label><input type="radio" name="workflow" checked={workflow === 'relay'} onChange={()=>setWorkflow('relay')}/><ListOrdered size={19} aria-hidden="true"/><span><strong>顺序接力</strong><small>按成员顺序传递成果</small></span></label>
      </fieldset>
      {members.length>=2 && <fieldset className="lumaRoomAssignments" disabled={busy}><legend>成员职责</legend>
        <ol>{members.map((id,index)=><li key={id}>
          <EmployeeFace id={id} skin={snapshot.employeeSkins?.[id]}/><label><strong>{names[id]}{workflow === 'studio' && index === 0 && ' · 协调人'}</strong>
            <small><ProviderMark config={state.roles[id]} size={13}/>{state.roles[id]?.model || '尚未配置模型'}</small>
            <input aria-label={names[id]+'的分工'} maxLength={180} value={duties[id] ?? ''} placeholder={workflow==='studio'?'例如查资料、设计或审核，可留空':index===members.length-1?'汇总交付，可自定分工':'起草或补充，可自定分工'} onChange={e=>setDuties({...duties,[id]:e.target.value})}/></label>
          {index>0 && <button type="button" title="提前一位" aria-label={'提前'+names[id]+'的发言顺序'} onClick={()=>setMembers(current=>{
            const next=[...current]; [next[index-1],next[index]]=[next[index]!,next[index-1]!]; return next
          })}><ArrowUp size={15} aria-hidden="true"/></button>}
        </li>)}</ol></fieldset>}
      </div><footer className="lumaCreateRoomFooter">
        {error ? <p role="alert">{error}</p> : <span>{members.length >= 2 ? names[members[0]!] + (workflow==='studio'?'担任协调人':'先接手任务') : '还需选择' + (2-members.length) + '位成员'}</span>}
        <button type="submit" className="is-primary" disabled={!snapshot.writable || members.length < 2 || busy}><MessagesSquare size={16} aria-hidden="true"/>{busy ? '创建中…' : '创建工作室'}</button></footer>
    </form>
  </section>
}

type Draft = { text: string; target: string; requestId: string; pendingWindows?:Record<string,string>; reviewerId?:string }
const emptyDraft = (): Draft => ({ text: '', target: '', requestId: '' })
function readDraft(id: string): Draft {
  try {
    const draft = JSON.parse(localStorage.getItem('luma.room.draft.' + id) ?? 'null')
    if (draft && ['text','target','requestId'].every(key => typeof draft[key] === 'string')) return draft
  } catch {}
  return emptyDraft()
}

export function RoomConversation({ room, snapshot, state, names, refresh, close, openContacts, files, changeFiles, active=true, forgetReplyMarks }: Props & { room: WorkRoom; files: File[]; active?:boolean; openContacts?():void; changeFiles(files: File[]): void; forgetReplyMarks?(removed:DeletedRecordIds):unknown }) {
  const [draft, setDraft] = useState(() => readDraft(room.id))
  const [service, setService] = useState(''), [error, setError] = useState(''), [sending, setSending] = useState(false)
  const [desktopTargets,setDesktopTargets] = useState<Record<string,string>>(()=>draft.requestId && draft.pendingWindows && typeof draft.pendingWindows==='object'
    ? Object.fromEntries(Object.entries(draft.pendingWindows).filter(([id,token])=>room.roleIds.includes(id) && typeof token==='string' && /^[a-f0-9]{64}$/.test(token))):{})
  const [workspace,setWorkspace]=useState(false)
  const [records,setRecords]=useState(false)
  const [recordFocus,setRecordFocus]=useState<RecordFocus>()
  function openRecords(id?:string){setRecordFocus(id?{kind:'job',id}:undefined);setWorkspace(false);setService('');setRecords(true)}
  const lock = useRef(false), scroll = useRef<HTMLDivElement>(null), stick = useRef(true)
  const jobs = state.jobs.filter(job => job.topic === room.id)
  const running = jobs.find(job => inProgress(job.status))
  const target = room.roleIds.includes(draft.target) ? draft.target : ''
  const workflow = draft.target === '@studio' ? 'studio' : draft.target === '@relay' ? 'relay' : (room.workflow ?? 'relay')
  const ids = target ? [target] : room.roleIds
  const {available:reviewers,suggested}=studioReviewers(ids,!target && workflow==='studio'?desktopTargets:{},room.duties)
  const reviewerId=draft.reviewerId && reviewers.includes(draft.reviewerId) ? draft.reviewerId : suggested
  const lead=room.roleIds[0]
  const dshAttachments = ids.some(id=>acceptsImagesAndTextOnly(state.roles[id]?.source))
  const missing = ids.filter(id => !state.roles[id]?.model)
  const canSend = snapshot.writable && !sending && !running && !missing.length && (!!draft.text.trim() || !!files.length)
  const signature = JSON.stringify(jobs.map(j => [j.id, j.status, j.steps.map(s => s.status)]))
  function saveDraft(next: Draft) {
    if(!next.requestId) delete next.pendingWindows
    try { localStorage.setItem('luma.room.draft.' + room.id, JSON.stringify(next)) } catch {}
    setDraft(next)
  }
  function assignWindows(values:Record<string,string>) {
    setDesktopTargets(values);saveDraft({...draft,requestId:''});setError('')
  }
  function chooseRecipient(value:string) {
    if(value===(target || '@'+workflow)) return
    const next={...draft,target:value,requestId:''}
    delete next.reviewerId
    saveDraft(next)
    setDesktopTargets({})
    setError('')
  }
  function updateFiles(next: File[]) {
    changeFiles(next)
    saveDraft({ ...draft, requestId: '' })
    setError('')
  }
  useEffect(() => {
    if (stick.current) scroll.current?.scrollTo({ top: scroll.current.scrollHeight })
  }, [signature])
  useEffect(() => {
    if (draft.requestId && jobs.some(job => job.id === draft.requestId)) {
      saveDraft({ ...draft, text:'', requestId:'' }); changeFiles([]); setDesktopTargets({})
    }
  }, [signature, draft.requestId])
  async function send() {
    if (!canSend || lock.current) return
    lock.current = true; setSending(true); setError('')
    const requestId = draft.requestId || crypto.randomUUID()
    const windows = Object.fromEntries(ids.filter(id => desktopTargets[id]).map(id => [id,desktopTargets[id]!]))
    const submitted = { ...draft, requestId, pendingWindows:windows, ...(reviewerId?{reviewerId}:{}) }
    saveDraft(submitted)
    const profiles = Object.fromEntries(ids.map(id => {
      const {name, personality, scenario} = snapshot.preferences.profiles[id] ?? MESSAGE_CHARACTERS.find(person => person.id === id)!.profile
      return [id, { name, personality, scenario }]
    }))
    try {
      const attachments = files.length ? await readChatFiles(files, dshAttachments) : []
      await agentRequest('run', { requestId, topic:room.id, mode: target ? 'task' : 'team', roleIds:ids, profiles, text:draft.text.trim(), ...(target ? {} : {workflow}), ...(Object.keys(windows).length ? {desktopTargets: windows} : {}), ...(reviewerId?{reviewerId}:{}), ...(attachments.length ? {attachments} : {}) }, files.length ? undefined : AbortSignal.timeout(15000))
      saveDraft({ ...submitted, text:'', requestId:'' })
      setDesktopTargets({})
      changeFiles([])
      await refresh()
    } catch (e) { setError(e instanceof Error ? e.message : '提交未确认，草稿已保留。') }
    finally { lock.current = false; setSending(false) }
  }
  async function cancel(id: string) {
    try { await agentRequest('cancel', { id }); await refresh() }
    catch (e) { setError(e instanceof Error ? e.message : '停止任务失败。') }
  }
  function configureMember(id:string) {
    setWorkspace(false)
    setRecords(false)
    setService(id)
  }
  return <><section className="lumaMessagesConversation lumaRoomConversation" aria-label="协作群对话">
    <header className="lumaMessageToolbar">
      {openContacts && <button type="button" className="lumaContactMobile" aria-label="联系人" title="联系人" onClick={openContacts}><List size={17} aria-hidden="true"/></button>}
      <div className="lumaEmployeeTitle"><RoomFaces ids={room.roleIds} skins={snapshot.employeeSkins}/><div><h2>{room.name}</h2><span>{room.roleIds.length} 位成员{room.workflow==='studio'?'，协调人 '+names[room.roleIds[0]!]:'，顺序接力'}</span></div></div>
      <div className="lumaContactTools" role="group" aria-label="工作室工具">
        <RecordsButton open={records} onClick={()=>records?setRecords(false):openRecords()}/>
        {lead && <button type="button" className="lumaModelShortcut" aria-label={'配置'+names[lead]+'的模型'} title={names[lead]+' · '+(state.roles[lead]?.model || '绑定模型')}
          aria-expanded={service===lead} disabled={!snapshot.writable || !!running || sending}
          onClick={()=>configureMember(service===lead?'':lead)}><ProviderMark config={state.roles[lead]} size={29}/></button>}
        <WorkspaceButton open={workspace} onClick={()=>{setService('');setRecords(false);setWorkspace(!workspace)}}/><button type="button" onClick={close} title="返回私聊" aria-label="返回私聊"><ArrowLeft size={18} aria-hidden="true"/><span className="lumaActionLabel">返回私聊</span></button></div></header>
    <details className="lumaStudioMembers"><summary><UsersRound size={15} aria-hidden="true"/>成员与分工<ChevronDown size={13} className="lumaRoomChev" aria-hidden="true"/></summary><ul>{room.roleIds.map((id,index)=><li key={id}>
      <EmployeeFace id={id} skin={snapshot.employeeSkins?.[id]}/><div><strong>{names[id]}{index===0 && room.workflow==='studio' && <Crown size={12} aria-label="协调人"/>}</strong><span>{room.duties?.[id] || (index || room.workflow!=='studio' ? '参与任务' : '协调与交付')}</span></div>
      <button type="button" disabled={!snapshot.writable || !!running || sending} onClick={()=>configureMember(id)} aria-label={'为'+names[id]+'选择模型'} title={state.roles[id]?.model || '配置模型'}><ProviderMark config={state.roles[id]} size={16}/><span>{state.roles[id]?.model || '配置模型'}</span></button>
    </li>)}</ul></details>
    {running && <div className="lumaStudioStatus" role="status"><strong>{running.workflow==='studio'?'工作室进度':'执行进度'}</strong>
      <span>{running.steps.filter(s=>s.status==='done').length} / {running.steps.length} 步已完成</span>
      <span>{running.steps.filter(s=>s.status==='running').map(s=>names[s.roleId]+(s.phase?' · '+STUDIO_PHASE_NAMES[s.phase]:'')).join('、')}</span></div>}
    <TranscriptFrame scroll={scroll} scope={room.id}><div className="lumaMessageHistory" ref={scroll} role="log" aria-label="群聊记录" aria-live="polite"
      onScroll={e => { const el = e.currentTarget; stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 90 }}>
      {!jobs.length && <div className="lumaRoomEmpty"><div className="lumaRoomDispatchArt"><StudioIllustration/>
        <div className="lumaRoomArtCast" role="group" aria-label="点名工作室成员">{room.roleIds.slice(0,4).map(id=>
          <button key={id} type="button" aria-pressed={target===id} disabled={sending || !snapshot.writable}
            title={'点名'+names[id]+'接手任务'} aria-label={'点名'+names[id]+'接手任务'} onClick={()=>chooseRecipient(id)}>
            <EmployeeFace id={id} skin={snapshot.employeeSkins?.[id]}/>
          </button>)}</div></div>
        <h3>把第一项任务交给大家</h3><p>点击头像点名，也可以把任务发给全员。</p></div>}
      {jobs.map(job => <Fragment key={job.id}>
        <article className="lumaMessageBubble is-user" data-turn-key={job.id} data-turn-title={job.text.slice(0,64)}><div><header><strong>{snapshot.preferences.userName}</strong>
          <span>{job.roleIds.length === 1 ? '@' + names[job.roleIds[0]!] : '@全员'}</span>
          <time dateTime={new Date(job.createdAt).toISOString()}>{new Date(job.createdAt).toLocaleTimeString('zh-CN', {hour:'2-digit', minute:'2-digit'})}</time>
        </header><p>{job.text}</p><AttachmentNames items={job.attachments}/></div></article>
        {job.steps.filter(step=>!step.phase || step.status!=='queued').map(step => <article key={step.roleId + (step.phase ?? '')} className="lumaMessageBubble is-assistant" data-phase={step.phase}>
          <EmployeeFace id={step.roleId} skin={snapshot.employeeSkins?.[step.roleId]} /><div><header><strong>{names[step.roleId]}</strong>
            <span>{step.phase && STUDIO_PHASE_NAMES[step.phase]+' · '}{statuses[step.status]}{step.model?' · '+step.model:''}</span></header>{step.activity && <small>{step.activity}</small>}{step.output && <><p>{step.output}</p>
            {step.handoff && <p className="lumaStudioHandoff">请 {names[step.handoff.to]} 协查 · {step.handoff.task}</p>}
            <ReplyTools id={replyKey('job',job.id,step.roleId,step.phase ?? 'relay')} author={names[step.roleId] ?? step.roleId} text={step.output} extras={<><ManageRecordButton onClick={()=>openRecords(job.id)}/>{snapshot.writable && <CloudOfficeLauncher roleId={step.roleId} name={names[step.roleId]!} initialText={step.output}/>}</>}/></>}</div></article>)}
        {job.error && <p className="lumaMessageNotice" role="status">{job.error}</p>}
        {!job.steps.some(step=>step.output) && <ManageRecordButton onClick={()=>openRecords(job.id)}/>}
        {job.reviewerId && <StudioReceiptTrail job={job} names={names}/>}
      </Fragment>)}
    </div></TranscriptFrame>
    <form className="lumaMessageComposer lumaRoomComposer" onSubmit={e => { e.preventDefault(); void send() }}>
      <div className="lumaRoomDispatch"><label className="lumaRoomRecipient">
        {target ? <EmployeeFace id={target} skin={snapshot.employeeSkins?.[target]}/> : workflow==='relay' ? <ListOrdered size={18} aria-hidden="true"/> : <RoomFaces ids={ids} skins={snapshot.employeeSkins}/>}
        <span>发给</span><select aria-label="群聊发言对象" disabled={sending || !snapshot.writable} value={target || '@'+workflow} onChange={e=>chooseRecipient(e.target.value)}>
        <option value="@studio">全员分工</option><option value="@relay">全员接力</option>{room.roleIds.map(id => <option key={id} value={id}>{names[id]}</option>)}</select><ChevronDown size={13} aria-hidden="true"/></label>
      {snapshot.writable && !sending && !running && <StudioDesktopPicker members={ids.map(id => ({id,name:names[id] ?? id,skin:snapshot.employeeSkins?.[id]}))} value={desktopTargets} onChange={assignWindows}/>}
      {!!reviewers.length && <label className="lumaWindowReviewer"><span>独立复核</span><select aria-label="本轮窗口复核人" value={reviewerId??''} disabled={!!running || sending || !snapshot.writable}
        onChange={e=>saveDraft({...draft,reviewerId:e.target.value,requestId:''})}>{!suggested && <option value="">协调人直接汇总</option>}
        {reviewers.map(id=><option key={id} value={id}>{names[id]??id}</option>)}</select></label>}</div>
      {missing.length > 0 && <div className="lumaRoomMissing"><span>待绑定</span>{missing.map(id => <button type="button" key={id} disabled={!snapshot.writable || sending || !!running}
        aria-label={names[id]+' · 配置'} title={'为'+names[id]+'绑定模型'} onClick={() => configureMember(id)}><EmployeeFace id={id} skin={snapshot.employeeSkins?.[id]}/>{names[id]}</button>)}</div>}
      {error && <p role="alert">{error}</p>}
      <PendingAttachments files={files} disabled={sending || !snapshot.writable} change={updateFiles}/>
      <div className="lumaContactSendRow lumaComposerDock">
        <ComposerActions files={files} native={dshAttachments} disabled={sending || !snapshot.writable} change={updateFiles} error={setError}/>
        <textarea aria-label="群消息" placeholder={'发消息到「' + room.name + '」…'} maxLength={32000} rows={1} value={draft.text} disabled={sending || !snapshot.writable}
        onChange={e => saveDraft({...draft, text:e.target.value, requestId:''})} onKeyDown={e => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !e.nativeEvent.isComposing) { e.preventDefault(); e.currentTarget.form?.requestSubmit() }
        }} />
        {running
        ? <button type="button" disabled={!snapshot.writable} onClick={() => void cancel(running.id)}>停止本轮</button>
        : <button className="is-primary lumaComposerSubmit" aria-label="发送到群" disabled={!canSend} title="Ctrl / ⌘ + Enter 发送到群" aria-keyshortcuts="Control+Enter Meta+Enter" type="submit"><ArrowUp size={18} aria-hidden="true"/><span className="lumaActionLabel">发送到群</span></button>}</div>
    </form></section>
    {workspace && active && !service && <RoleWorkspacePanel title={room.name} active={active} members={room.roleIds.map(id=>({id,name:names[id] ?? id,skin:snapshot.employeeSkins?.[id],config:state.roles[id]}))}
      eligibleIds={ids} jobs={jobs} names={names} assignments={desktopTargets} canAssign={snapshot.writable && !sending && !running} canWrite={snapshot.writable}
      onAssign={(role,id)=>{const next={...desktopTargets};if(id)next[role]=id;else delete next[role];assignWindows(next)}}
      onConfigure={configureMember} onClose={()=>setWorkspace(false)}/>}
    {records && active && <ContactRecords key={JSON.stringify([room.id,recordFocus])} initial={recordFocus} scope={{roomId:room.id}} name={room.name} names={names} jobs={jobs} write={snapshot.writable && !sending} available refresh={refresh} close={()=>setRecords(false)} {...(forgetReplyMarks?{forgetReplyMarks}:{})}/>}
    {service && <AgentServicePanel key={service} forHandoff roleId={service} name={names[service]!} config={state.roles[service]} canWrite={snapshot.writable} refresh={refresh} close={() => setService('')} />}
  </>
}

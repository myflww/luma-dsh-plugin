import { ReplyTools, ReplyToolsProvider, replyKey } from './ReplyTools.tsx'
import { TranscriptFrame } from './TurnNavigator.tsx'
import { readChatFiles, readSessionFiles } from './chat-file-reader.ts'
import { acceptsImagesAndTextOnly } from '../shared/chat-attachments.ts'
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { ArrowLeft, ArrowUp, BriefcaseBusiness, Check, CheckCheck, List, Mail, MessageCircle, MessagesSquare, Plus, Search, Settings2, Square, UserRoundPlus, UsersRound } from 'lucide-react'
import { MESSAGE_CHARACTERS, type MessagesRuntime } from './messages-runtime.ts'
import type { RoleProfile } from '../messages-settings.ts'
import { AgentMemoryPanel, AgentServicePanel, EmployeeFace, JobCard } from './AgentDeskPanels.tsx'
import { agentRequest, inProgress, useAgentDesk, type AgentJob, type AgentMode, type WorkRoom } from './agent-desk-api.ts'
import { RoomConversation, RoomCreator } from './WorkRooms.tsx'
import { AttachmentNames, ComposerActions, PendingAttachments, useAttachmentDrafts } from './ChatAttachments.tsx'
import './MessagesPage.css'
import './AgentDesk.css'
import './Contacts.css'
import { ContactChatSettings } from './ContactChatSettings.tsx'
import { ContactRecords, ManageRecordButton, RecordsButton, type RecordFocus } from './ContactRecords.tsx'
import { RoleWorkspacePanel, WorkspaceButton } from './RoleWorkspacePanel.tsx'
import { ProviderMark } from './ProviderMark.tsx'
import { EmployeeFigure, type ResidentId } from './OfficeBedroom.tsx'

function SentMark() {
  return <small className="lumaSentMark" title="已发送"><CheckCheck size={14} aria-hidden="true"/><span>已发送</span></small>
}

export function downloadJson(name: string, value: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json;charset=utf-8' }))
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = name; anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
export function MessagesPage({ runtime, active = true, employeeVisit, onOpenNative, unlockedEmployeeIds = MESSAGE_CHARACTERS.map(role => role.id), onOpenRewards }: { unlockedEmployeeIds?: readonly string[] | undefined; onOpenRewards?(): void; runtime: MessagesRuntime; active?: boolean; employeeVisit?: { mode: 'chat' | 'task'; topic?: string; roleId?: string; panel?: 'persona' } | undefined; onOpenNative(): void }) {
  const state = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot, runtime.getSnapshot)
  const [query, setQuery] = useState(''), [panel, setPanel] = useState<'settings' | 'persona' | 'api' | 'memory' | 'workspace' | 'records' | null>(null)
  const [windowAssignment,setWindowAssignment]=useState<{role:string;topic:string;id:string;label:string}>()
  const [recordFocus,setRecordFocus]=useState<RecordFocus>()
  function openRecords(target?:RecordFocus){setRecordFocus(target);setPanel('records')}
  async function forgetReplyMarks(removed:{jobs:string[];letters:string[]}) {
    if(await runtime.forgetReplyMarks(removed)!==true)throw Error('回复标记暂未清理。')
  }
  const [mode, setMode] = useState<AgentMode>('chat'), [team, setTeam] = useState<string[]>([])
  const [serviceTarget, setServiceTarget] = useState<{ owner: string; id: string } | null>(null)
  const [chosen, setChosen] = useState<Record<string,string>>({}), [sending, setSending] = useState(false)
  const [actionError, setActionError] = useState('')
  const submitLock = useRef(false)
  const retries = useRef(new Map<string, { signature: string; id: string; files: readonly File[] }>())
  const attachmentDrafts = useAttachmentDrafts()
  const desk = useAgentDesk(active)
  const [profile, setProfile] = useState<RoleProfile>(state.profile), [notice, setNotice] = useState('')
  const [userName, setUserName] = useState(state.preferences.userName)
  const scroll = useRef<HTMLDivElement>(null), stick = useRef(true)
  const roleId = state.roleId
  const [roomView, setRoomView] = useState<WorkRoom | 'new' | null>(null)
  const [slowLookup, setSlowLookup] = useState(false)
  useEffect(() => {
    if (!active || desk.state || desk.problem) { setSlowLookup(false); return }
    const timer = window.setTimeout(() => setSlowLookup(true), 3000)
    return () => window.clearTimeout(timer)
  }, [active, desk.state, desk.problem])
  const [rosterOpen, setRosterOpen] = useState(false)
  const partners = MESSAGE_CHARACTERS.filter(role => unlockedEmployeeIds.includes(role.id))
  const visibleRoles = new Set(partners.map(role => role.id as string))
  const rooms = (desk.state?.rooms ?? []).filter(room => room.roleIds.every(id => visibleRoles.has(id)))
  const roomSupported = Array.isArray(desk.state?.rooms)
  function showRoom(room: WorkRoom | 'new' | null) {
    setPanel(null); setRoomView(room); setRosterOpen(false);setWindowAssignment(undefined)
  }
  useEffect(() => { setRoomView(null) }, [roleId, employeeVisit])
  const names = Object.fromEntries(MESSAGE_CHARACTERS.map(role => [role.id, state.preferences.profiles[role.id]?.name ?? role.name]))
  const skins = state.employeeSkins ?? {}
  const configured = Boolean(desk.state?.roles[roleId]?.model)
  const roomIds = new Set(desk.state?.rooms?.map(room => room.id))
  const roleJobs = (desk.state?.jobs ?? []).filter(job => !roomIds.has(job.topic ?? '') && job.roleIds.includes(roleId))
  const topicFor = (job: AgentJob) => job.topic ?? ('desk-' + job.roleIds[0])
  const freshTopics=useRef(new Map<string,string>())
  if(!freshTopics.current.has(roleId))freshTopics.current.set(roleId,'desk-'+crypto.randomUUID())
  const freshTopic=freshTopics.current.get(roleId)!
  const workTopics = new Map<string,string>()
  for (const job of [...roleJobs].sort((a,b) => a.createdAt - b.createdAt)) {
    const key = topicFor(job)
    if (!workTopics.has(key)) workTopics.set(key, (job.text || job.attachments?.[0]?.name || '工作记录').slice(0, 30))
  }
  const newestJob = roleJobs.reduce<AgentJob | undefined>((latest, job) => !latest || latest.createdAt < job.createdAt ? job : latest, undefined)
  const latestLetter=(desk.state?.letters??[]).filter(l=>l.role===roleId && l.topic.startsWith('desk:')).sort((a,b)=>b.time-a.time)[0]
  const defaultTopic = configured ? (newestJob ? topicFor(newestJob) : latestLetter?.topic.slice(5) || freshTopic) : 'native'
  const preferred = chosen[roleId] ?? (desk.state ? defaultTopic : undefined)
  const nativeView = preferred === 'native'
  const topic = preferred && !nativeView ? preferred : freshTopic
  const selectedWindow=mode==='task' && !nativeView && windowAssignment?.role===roleId && windowAssignment.topic===topic ? windowAssignment:undefined
  const jobs = nativeView ? [] : roleJobs.filter(job => topicFor(job) === topic).sort((a,b) => a.createdAt - b.createdAt)
  const letters = (desk.state?.letters ?? []).filter(letter=>letter.role===roleId && (nativeView
    ? letter.topic==='native:'+state.sessionId || letter.topic==='native-inbox' && (!state.sessionId || state.sessionId===(state.preferences.activeTopics[roleId] ?? state.topics[0]?.id))
    : letter.topic==='desk:'+topic))
  const runningJob = jobs.find(job => inProgress(job.status))
  const showNative = nativeView
  const busy = state.pending || sending
  const drafting = state.preferences.drafts[roleId] ?? ''
  const optedTeam = team.filter(id => id !== roleId && visibleRoles.has(id))
  const handoff = [roleId, ...optedTeam]
  const serviceConfigs = desk.state?.roles
  const missingServices = mode === 'team' && optedTeam.length > 0 && serviceConfigs
    ? handoff.filter(id => !serviceConfigs[id]?.model) : []
  const teamReady = mode !== 'team' || (optedTeam.length > 0 && missingServices.length === 0)
  const sendViaNative = mode !== 'team' && nativeView
  const dshAttachments = sendViaNative || (mode==='team' ? handoff : [roleId]).some(id=>acceptsImagesAndTextOnly(serviceConfigs?.[id]?.source))
  const attachmentKey = JSON.stringify([roleId, nativeView ? 'native' : topic, nativeView ? state.sessionId : ''])
  const files = attachmentDrafts.filesFor(attachmentKey)
  const fileSelectionDisabled = busy || !state.writable || !preferred
  function changeFiles(next: File[]) {
    attachmentDrafts.change(attachmentKey, next)
    setActionError('')
  }
  const deskReady = Boolean(desk.state) && !desk.problem
  const serviceReady = sendViaNative ? !state.running && !state.attention
    : deskReady && (mode === 'team' ? teamReady : configured)
  const canSend = visibleRoles.has(roleId) && state.writable && !busy && (!!drafting.trim() || !!files.length) && !runningJob && serviceReady
  const serviceRole = serviceTarget?.owner === roleId ? serviceTarget.id : roleId
  const [localRefresh, setLocalRefresh] = useState(0)
  const scrollFingerprint = (letters.at(-1)?.id ?? '') + jobs.map(job => [job.id, job.status, job.steps.map(step => step.output.length).join(',')].join(':')).join('|')
  function selectLocal(key:string) {
    if (key!==topic || nativeView) setWindowAssignment(undefined)
    setChosen(old => ({ ...old, [roleId]: key }))
  }
  function chooseMode(value:AgentMode) {
    if(value!=='task') setWindowAssignment(undefined)
    setMode(value)
  }
  function assignWindow(id:string,label:string) {
    if(!id){setWindowAssignment(undefined);return}
    if(!configured || !state.writable || busy || runningJob) return
    const targetTopic=nativeView?'desk-'+crypto.randomUUID():topic
    selectLocal(targetTopic);setMode('task');setActionError('')
    setWindowAssignment({id,label,role:roleId,topic:targetTopic})
  }
  async function selectHistory(value: string) {
    if (value.startsWith('native:')) {
      const id = value.slice('native:'.length)
      if (id && id !== state.sessionId && !(await runtime.selectTopic(id as never))) return
      selectLocal('native')
    } else if (value.startsWith('desk:')) selectLocal(value.slice('desk:'.length))
  }
  const appliedVisit=useRef<typeof employeeVisit>(undefined)
  useEffect(()=>{
    if(!employeeVisit?.topic || appliedVisit.current===employeeVisit || state.pending || (employeeVisit.roleId && employeeVisit.roleId!==roleId)) return
    const key=employeeVisit.topic
    if(key.startsWith('native:') && key.slice(7)!==state.sessionId && !state.topics.some(t=>t.id===key.slice(7)))return
    appliedVisit.current=employeeVisit
    if(key.startsWith('desk:'))setChosen(old=>({...old,[roleId]:key.slice(5)}))
    else {
      setChosen(old=>({...old,[roleId]:'native'}))
      if(key.startsWith('native:') && key.slice(7)!==state.sessionId)void runtime.selectTopic(key.slice(7) as never)
    }
  },[employeeVisit,roleId,runtime,state.pending,state.sessionId,state.topics])
  async function send() {
    if (!canSend || submitLock.current) return
    setActionError('')
    if (sendViaNative && !files.length) {
      await runtime.send(mode === 'task' ? 'task' : 'chat')
      return
    }
    const roleIds = mode === 'team' ? handoff : [roleId]
    const retryKey = JSON.stringify([roleId, topic])
    const signature = JSON.stringify([roleIds, mode, drafting, topic,selectedWindow?.id ?? ''])
    const previous = retries.current.get(retryKey)
    const sameFiles = previous && previous.files.length === files.length && files.every((f, i) => previous.files[i] === f)
    const requestId = previous?.signature === signature && sameFiles ? previous.id : crypto.randomUUID()
    const profiles = Object.fromEntries(roleIds.map(id => {
      const profile = state.preferences.profiles[id] ?? MESSAGE_CHARACTERS.find(role => role.id === id)!.profile
      return [id, { name: profile.name, personality: profile.personality, scenario: profile.scenario }]
    }))
    submitLock.current = true; setSending(true)
    const timeout = files.length ? undefined : AbortSignal.timeout(15_000)
    try {
      if (sendViaNative) {
        const attachments = state.nativeFileUpload ? await readSessionFiles(files) : await readChatFiles(files, true)
        const current = runtime.getSnapshot()
        if (current.roleId !== roleId || current.sessionId !== state.sessionId || (current.preferences.drafts[roleId] ?? '') !== drafting) throw Error('会话或草稿已变化，请返回对应话题后重试。')
        const nativeMode = mode === 'task' ? 'task' : 'chat'
        const sent = await runtime.send(nativeMode, attachments)
        if (sent) attachmentDrafts.change(attachmentKey, [])
        else if (!state.sessionId && runtime.getSnapshot().roleId === roleId && runtime.getSnapshot().sessionId) {
          attachmentDrafts.change(attachmentKey, [])
          attachmentDrafts.change(JSON.stringify([roleId, 'native', runtime.getSnapshot().sessionId]), files)
        }
        return
      }
      const attachments = files.length ? await readChatFiles(files, dshAttachments) : []
      retries.current.set(retryKey, { signature, id: requestId, files })
      await agentRequest<AgentJob>('run', { requestId, roleIds, mode, text: drafting.trim(), topic, profiles,
        ...(selectedWindow ? {desktopTargets:{[roleId]:selectedWindow.id}}:{}), ...(attachments.length ? {attachments} : {}) }, timeout)
      retries.current.delete(retryKey)
      if(selectedWindow) setWindowAssignment(current=>current===selectedWindow?undefined:current)
      attachmentDrafts.change(attachmentKey, [])
      const now = runtime.getSnapshot()
      if (now.roleId === roleId && now.preferences.drafts[roleId] === drafting) runtime.setDraft('')
      selectLocal(topic); await desk.refresh(); setLocalRefresh(value => value + 1)
    } catch (error) {
      setActionError(timeout?.aborted || error instanceof TypeError ? '提交结果尚未确认，草稿已保留。连接恢复后可重试这条消息。'
        : error instanceof Error ? error.message : '发送失败，草稿已保留。')
    }
    finally { submitLock.current = false; setSending(false) }
  }
  async function cancel(id: string) {
    try { await agentRequest('cancel', { id }); await desk.refresh() }
    catch (error) { setActionError(error instanceof Error ? error.message : '取消失败。') }
  }
  const persistedProfile = JSON.stringify(state.profile)
  useEffect(() => { setProfile(JSON.parse(persistedProfile) as RoleProfile) }, [state.roleId, persistedProfile])
  useEffect(() => { setNotice(''); setActionError(''); setTeam([]); setMode('chat'); setWindowAssignment(undefined);setServiceTarget(null); setPanel(null); stick.current = true }, [state.roleId])
  const displayedVisit = useRef<typeof employeeVisit>(undefined)
  useEffect(() => {
    if (!employeeVisit || displayedVisit.current === employeeVisit || (employeeVisit.roleId && employeeVisit.roleId !== roleId)) return
    displayedVisit.current = employeeVisit
    setMode(employeeVisit.mode); setWindowAssignment(undefined); setPanel(employeeVisit.panel ?? null); setActionError('')
  }, [employeeVisit,roleId])
  useEffect(() => { if (stick.current) scroll.current?.scrollTo({ top: scroll.current.scrollHeight }) }, [state.messages, scrollFingerprint, localRefresh])
  async function importCard(file?: File) {
    if (!file) return
    try {
      if (file.size > 1_000_000) throw Error('请选择小于 1 MB 的角色 JSON。')
      const json = JSON.parse(await file.text()), data = json.data ?? json
      const next = { name: data.name, personality: data.personality ?? data.description ?? '', scenario: data.scenario ?? '', greeting: data.first_mes ?? data.greeting ?? '' }
      if (typeof next.name !== 'string' || !next.name.trim() || next.name.length > 80
        || typeof next.personality !== 'string' || next.personality.length > 12000 || typeof next.scenario !== 'string' || next.scenario.length > 8000
        || typeof next.greeting !== 'string' || next.greeting.length > 4000) throw Error('角色卡字段或长度不受支持。')
      setProfile(next); setPanel('persona'); setNotice('角色设定已读取，请检查后保存。')
    } catch (error) { setNotice(error instanceof Error ? error.message : String(error)) }
  }
  const previews = desk.state?.previews ?? {}
  const recent = partners.map(role => {
    const note = previews[role.id]
    const job = desk.state?.jobs.filter(job => !roomIds.has(job.topic ?? '') && job.roleIds[0] === role.id).at(-1)
    const activeMessage = role.id === roleId && nativeView ? state.messages.filter(message => message.role !== 'notice' && message.text).at(-1) : undefined
    const items = [note, job && { text: job.steps.at(-1)?.output || job.text, time: job.createdAt },
      activeMessage && { text: activeMessage.text, time: activeMessage.time ?? 0 }].filter(item => item !== undefined)
    const latest = items.sort((a,b) => b.time - a.time)[0]
    return { role, text: state.preferences.drafts[role.id] ? '［草稿］' + state.preferences.drafts[role.id] : latest?.text || role.profile.greeting, time: latest?.time ?? 0 }
  }).sort((a,b) => b.time - a.time)
  const clockText = (time: number) => new Date(time).toLocaleTimeString('zh-CN', {hour:'2-digit', minute:'2-digit'})
  const search = query.trim().toLocaleLowerCase()
  const matching = recent.filter(({role}) => names[role.id]?.toLocaleLowerCase().includes(search))
  const matchingRooms = rooms.filter(room => room.name.toLocaleLowerCase().includes(search))
  const showRoomCreator = () => { if (partners.length < 2) onOpenRewards?.(); else showRoom('new') }
  useEffect(() => {
    if (!active || (!panel && !rosterOpen)) return
    function close(event: KeyboardEvent) { if (event.key === 'Escape' && !document.querySelector('dialog[open]')) { setPanel(null); setRosterOpen(false) } }
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [active, panel, rosterOpen])
  return <ReplyToolsProvider scope={JSON.stringify([active,roleId,preferred,roomView && typeof roomView==='object' ? roomView.id : roomView])} reactions={state.preferences.reactions} rate={state.writable ? runtime.setReaction : undefined}><section className={'lumaMessages lumaContacts' + (rosterOpen ? ' show-roster' : '')} aria-label="联系">
    <aside className="lumaMessagesRoster">
      <header><h1><MessagesSquare size={21} aria-hidden="true"/>联系</h1><button type="button" className="lumaContactMobile" onClick={() => setRosterOpen(false)}><ArrowLeft size={15} aria-hidden="true"/>返回对话</button></header>
      <label className="lumaRosterSearch"><Search size={15} aria-hidden="true"/><input type="search" aria-label="搜索联系人或群聊" placeholder="搜索联系人或群聊" value={query} onChange={event => setQuery(event.target.value)} /></label>
      <div className="lumaMessagesCharacters" role="list" aria-label="联系人与群聊">
        {roomSupported && <div className="lumaStudioDirectory">
          <h2>协作工作室</h2><button type="button" title={partners.length < 2 ? '邀请伙伴组队' : '新建工作室'} aria-label={partners.length < 2 ? '邀请伙伴组队' : '新建工作室'} disabled={busy || !state.writable || (partners.length < 2 && !onOpenRewards)}
            onClick={showRoomCreator}><Plus size={16} aria-hidden="true"/></button>
        </div>}
        {matchingRooms.map(room => <button type="button" key={room.id} aria-pressed={typeof roomView === 'object' && roomView?.id === room.id}
          className={typeof roomView === 'object' && roomView?.id === room.id ? 'is-selected' : ''} onClick={() => showRoom(room)}>
          <span className="lumaContactGroupFaces">{room.roleIds.slice(0,2).map(id => <EmployeeFace key={id} id={id} skin={skins[id]} />)}</span>
          <span className="lumaContactPreview"><strong>{room.name}</strong><small>{desk.state?.jobs.filter(job => job.topic === room.id).at(-1)?.text || room.roleIds.map(id => names[id]).join('、')}</small></span></button>)}
        {matching.length > 0 && <h2 className="lumaRosterSection">角色联系人</h2>}
        {matching.map(({role,text,time}) => <button type="button" key={role.id}
          className={!roomView && state.roleId === role.id ? 'is-selected' : ''} aria-pressed={!roomView && state.roleId === role.id} disabled={busy}
          onClick={() => { showRoom(null); runtime.selectRole(role.id) }}>
          <EmployeeFace id={role.id} skin={skins[role.id]} /><span className="lumaContactPreview"><strong>{names[role.id]}</strong><small>{text}</small></span>
          {time > 0 && <time dateTime={new Date(time).toISOString()}>{new Date(time).toDateString() === new Date().toDateString() ? clockText(time) : new Date(time).toLocaleDateString('zh-CN',{month:'numeric',day:'numeric'})}</time>}
        </button>)}
        {!matching.length && !matchingRooms.length && <p>没有找到这个联系人或群聊</p>}
      </div>
      {onOpenRewards && partners.length < MESSAGE_CHARACTERS.length && <footer><button type="button" onClick={onOpenRewards}><UserRoundPlus size={15} aria-hidden="true"/>邀请新伙伴</button></footer>}
    </aside>
    {roomView && desk.state && (roomView === 'new' || rooms.some(room => room.id === roomView.id)) ? (roomView === 'new'
      ? <RoomCreator availableRoleIds={unlockedEmployeeIds} snapshot={state} state={desk.state} names={names} refresh={desk.refresh} close={() => showRoom(null)} onCreated={showRoom} />
      : <RoomConversation key={roomView.id} active={active} room={roomView} snapshot={state} state={desk.state} names={names} refresh={desk.refresh} close={() => showRoom(null)} openContacts={() => setRosterOpen(true)} forgetReplyMarks={forgetReplyMarks}
          files={attachmentDrafts.filesFor(roomView.id)} changeFiles={next => attachmentDrafts.change(roomView.id, next)} />)
      : <div className="lumaMessagesConversation">
      <header className="lumaMessageToolbar">
        <button type="button" className="lumaContactMobile" aria-label="联系人" title="联系人" onClick={() => setRosterOpen(true)}><List size={17} aria-hidden="true"/></button>
        <div className="lumaEmployeeTitle lumaPrivateIdentity"><EmployeeFace id={roleId} skin={skins[roleId]} /><div><h2>{state.profile.name}</h2><span data-working={Boolean(runningJob || state.running)}>{runningJob && runningJob.mode !== 'chat' ? '正在工作…' : state.running || runningJob ? '正在回复…' : '一对一聊天'}</span></div></div>
        <div className="lumaContactTools" role="group" aria-label="角色工具">
          <RecordsButton open={panel==='records'} onClick={()=>panel==='records'?setPanel(null):openRecords()}/>
          <button type="button" className="lumaModelShortcut" disabled={!desk.state || busy} aria-expanded={panel==='api'} onClick={()=>{setServiceTarget(null);setPanel(panel==='api'?null:'api')}} aria-label={desk.state?.roles[roleId]?.model || '绑定模型'} title={'模型服务 · '+(desk.state?.roles[roleId]?.model || '绑定模型')}>
            <ProviderMark config={desk.state?.roles[roleId]} size={30}/></button>
          <WorkspaceButton open={panel==='workspace'} onClick={()=>setPanel(panel==='workspace'?null:'workspace')}/>
          <button className="lumaContactSettingsButton" type="button" aria-label="聊天设置" title="聊天设置" aria-expanded={panel==='settings'} onClick={() => setPanel(panel === 'settings' ? null : 'settings')}><Settings2 size={18} aria-hidden="true"/></button>
        </div>
      </header>
      {state.problem && <div className="lumaMessageNotice" role="alert">{state.problem}<button type="button" onClick={onOpenNative}>检查模型和连接</button></div>}
      {actionError && <p className="lumaMessageNotice" role="alert">{actionError}</p>}
      {desk.problem && <div className="lumaMessageNotice" role="alert"><span>{desk.problem}</span>
        <button type="button" onClick={() => void desk.refresh()}>重试员工服务</button></div>}
      {runningJob && runningJob.mode !== 'chat' && configured && <div className="lumaMessageNotice" role="status">这项工作会继续在后台进行。
        <button type="button" disabled={!state.writable || busy} onClick={()=>{
          selectLocal('desk-'+crypto.randomUUID());setMode('chat');setActionError('')
        }}>另开私聊</button></div>}
      {!preferred && (slowLookup || desk.problem) && <div className="lumaMessageNotice" role="status"><span>{desk.problem ? '可在 DSH 会话中继续聊天或单人派工。' : '连接员工服务耗时较长，可先使用 DSH 会话。'}</span>
        <button type="button" onClick={() => selectLocal('native')}>使用 DSH 会话</button></div>}
      {preferred && !nativeView && deskReady && !configured && mode !== 'team' && <p className="lumaMessageNotice">这段工作记录使用独立服务。可在「模型服务」中配置模型，或从「历史对话」选择 DSH 会话。</p>}
      {!state.writable && !state.loading && <p className="lumaMessageNotice">当前连接为只读，仍可阅读已有对话。请在本机 DSH 中保存设定或发送消息。</p>}
      {nativeView && state.attention && <div className="lumaMessageNotice" role="status">此对话有待确认事项。<button type="button" onClick={onOpenNative}>前往原生会话处理</button></div>}
      <TranscriptFrame scroll={scroll} scope={JSON.stringify([roleId,preferred,state.sessionId])}><div className={`lumaMessageHistory is-${state.preferences.display}`} ref={scroll} role="log" aria-label="角色对话记录" aria-live="polite"
        onScroll={event => { const el = event.currentTarget; stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 90 }}>
        {showNative && state.hasMore && <button type="button" className="lumaLoadOlder" disabled={state.pending} onClick={() => { void runtime.loadOlder() }}>读取更早的消息</button>}
        {showNative && state.loading && <p role="status">正在读取对话…</p>}
        {!letters.length && !(showNative ? state.messages.length : jobs.length) && !state.loading && <article className="lumaRoleIntroduction">
          <div className="lumaIntroPortrait"><EmployeeFigure id={roleId as ResidentId} skinId={skins[roleId]}/></div>
          <div><h3>{state.profile.name}</h3><p>{state.profile.greeting}</p></div>
        </article>}
        {[...jobs.map(job => ({time:job.createdAt, node:job.mode === 'chat' ? <div key={job.id} data-turn-key={job.id} data-turn-title={job.text.slice(0,64)}>
          <article className="lumaMessageBubble is-user"><div><header><strong>{state.preferences.userName}</strong><time>{clockText(job.createdAt)}</time></header><p>{job.text}</p><AttachmentNames items={job.attachments}/><SentMark/></div></article>
          {job.steps[0]?.output ? <article className="lumaMessageBubble is-assistant"><EmployeeFace id={roleId} skin={skins[roleId]}/><div><header><strong>{names[roleId]}</strong></header><p>{job.steps[0].output}</p><ReplyTools id={replyKey("job",job.id,roleId)} text={job.steps[0].output} author={names[roleId] ?? roleId} extras={<ManageRecordButton label="管理这条记录" onClick={()=>openRecords({kind:'job',id:job.id})}/>}/></div></article>
            : <><p className="lumaMessageThinking" role="status">{inProgress(job.status) ? state.profile.name + '正在输入…' : job.error || (job.status === 'cancelled' ? '已停止回复' : '回复未完成')}</p>{!inProgress(job.status) && <ManageRecordButton label="管理这条记录" onClick={()=>openRecords({kind:'job',id:job.id})}/>}</>}
        </div> : <JobCard key={job.id} job={job} names={names} skins={skins} canWrite={state.writable} onManage={()=>openRecords({kind:'job',id:job.id})} cancel={() => void cancel(job.id)} />})),
          ...letters.map(letter=>({time:letter.time,node:<article key={'life:'+letter.id} data-turn-key={'life:'+letter.id} data-turn-title={letter.text.slice(0,64)} className="lumaMessageBubble is-assistant lumaLifeLetter">
            <EmployeeFace id={letter.role} skin={skins[letter.role]}/><div><header><strong>{names[letter.role]}</strong><time>{clockText(letter.time)}</time></header>
              <p>{letter.text}</p><small className="lumaLetterStamp" title={letter.source==='model'?'主动来信 · 独立模型':'主动来信 · 日常对白'}><Mail size={13} aria-hidden="true"/>主动来信</small><ReplyTools id={replyKey("letter",letter.id)} text={letter.text} author={names[letter.role] ?? letter.role}
                extras={letter.topic.startsWith('desk:')?<ManageRecordButton label="管理所属话题" onClick={()=>openRecords({kind:'topic',id:letter.topic.slice(5)})}/>:undefined}/></div></article>})),
          ...(showNative ? state.messages : []).map(message => ({time:message.time ?? Infinity,node:<article key={message.id} data-turn-key={message.role==="user"?message.id:undefined} data-turn-title={message.role==="user"?message.text.slice(0,64):undefined} className={`lumaMessageBubble is-${message.role}`}>
          {message.role === 'assistant' && <EmployeeFace id={roleId} skin={skins[roleId]} />}
          <div><header><strong>{message.role === 'user' ? state.preferences.userName : message.role === 'assistant' ? state.profile.name : '对话提示'}</strong>
            {message.time !== undefined && <time dateTime={new Date(message.time).toISOString()}>{new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit' }).format(message.time)}</time>}</header>
            <p>{message.text || (message.streaming ? '…' : message.attachments?.length ? '' : '此条消息没有文本内容，可在原生会话查看附件。')}</p><AttachmentNames items={message.attachments}/>{message.role === 'user' && <SentMark/>}{message.streaming && <small>正在输入…</small>}{message.role==="assistant" && !message.streaming && message.text && <ReplyTools id={replyKey("native",state.sessionId ?? roleId,message.id)} text={message.text} author={state.profile.name}
              extras={state.sessionId && <ManageRecordButton label="管理所属原生对话" onClick={()=>openRecords({kind:'native',id:state.sessionId!})}/>}/>}</div>
        </article>}))].sort((a,b)=>a.time-b.time).map(row=>row.node)}
        {showNative && state.running && !state.messages.some(message => message.streaming) && <p className="lumaMessageThinking" role="status">{state.profile.name}正在组织回复…</p>}
      </div></TranscriptFrame>
      <form className="lumaMessageComposer" onSubmit={event => { event.preventDefault(); void send() }}>
        {mode !== 'chat' && <div className="lumaContactMode"><span>{mode === 'task' ? '单人派工' : '协作交接'}</span><button type="button" disabled={busy} onClick={() => chooseMode('chat')}>返回聊天</button></div>}
        {selectedWindow && <div className="lumaWorkspaceAssignment"><span>本次操作 · {selectedWindow.label}</span><button type="button" disabled={busy} onClick={()=>setWindowAssignment(undefined)}>移除本次窗口</button></div>}
        {mode === 'team' && <fieldset className="lumaDeskTeam lumaHandoffPicker"><legend>交接顺序</legend>
          <b className="lumaHandoffMember is-lead"><EmployeeFace id={roleId} skin={skins[roleId]}/><span>{names[roleId]}</span><small aria-label="第 1 位">1</small></b>
          {partners.filter(role => role.id !== roleId).map(role => <label key={role.id} className="lumaHandoffMember"><input type="checkbox" aria-label={names[role.id]} checked={optedTeam.includes(role.id)} disabled={busy}
            onChange={e => setTeam(prev => e.target.checked ? [...prev, role.id] : prev.filter(id => id !== role.id))} />
            <EmployeeFace id={role.id} skin={skins[role.id]}/><span>{names[role.id]}</span>
            {optedTeam.includes(role.id) && <small>{optedTeam.indexOf(role.id) + 2}</small>}</label>)}
          {missingServices.length > 0 && <div className="lumaTeamServices" role="group" aria-label="待配置的协作服务">
            <span>待绑定模型</span>
            {missingServices.map(id => <button key={id} type="button" aria-label={`配置${names[id]}的 API 服务`}
              onClick={() => { setServiceTarget({ owner: roleId, id }); setPanel('api') }}><EmployeeFace id={id} skin={skins[id]}/>{names[id]}</button>)}
          </div>}</fieldset>}
        <PendingAttachments files={files} disabled={fileSelectionDisabled} change={changeFiles}/>
        <div className="lumaContactSendRow lumaComposerDock">
          <ComposerActions key={roleId} files={files} native={dshAttachments} nativeUploads={sendViaNative && state.nativeFileUpload}
            disabled={fileSelectionDisabled} change={changeFiles} error={setActionError}>
            {(['chat','task','team'] as const).map((value,index) => <button type="button" key={value} aria-pressed={mode === value} disabled={busy}
              onClick={() => { chooseMode(value); setActionError('') }}>{value==='chat'?<MessageCircle size={16} aria-hidden="true"/>:value==='task'?<BriefcaseBusiness size={16} aria-hidden="true"/>:<UsersRound size={16} aria-hidden="true"/>}{['聊天','单人派工','协作交接'][index]}{mode===value && <Check size={14} aria-hidden="true"/>}</button>)}
            {roomSupported && <button type="button" disabled={busy || !state.writable} onClick={showRoomCreator}><UserRoundPlus size={16} aria-hidden="true"/>{partners.length < 2 ? '邀请伙伴组群' : '拉群协作'}</button>}
          </ComposerActions>
          <textarea aria-label="发送给角色的消息" placeholder={mode === 'chat' ? `对${state.profile.name}说点什么…` : '描述任务和交付要求…'} value={state.preferences.drafts[state.roleId] ?? ''} maxLength={32000} rows={1}
            onChange={event => {
              if (preferred && !chosen[roleId]) selectLocal(preferred)
              runtime.setDraft(event.target.value)
            }} onKeyDown={event => { if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && !event.nativeEvent.isComposing) { event.preventDefault(); event.currentTarget.form?.requestSubmit() } }} />
          <button type="button" className="lumaRoleWorkShortcut" aria-label={mode === 'task' ? '切换到聊天' : '派发任务'} title={mode === 'task' ? '切换到聊天' : '派发任务'} aria-pressed={mode === 'task'} disabled={busy || !state.writable} onClick={() => {
            chooseMode(mode === 'task' ? 'chat' : 'task'); setPanel(null); setActionError('')
          }}>{mode === 'task' ? <MessageCircle size={18} aria-hidden="true"/> : <BriefcaseBusiness size={18} aria-hidden="true"/>}</button>
          {sendViaNative && state.running ? <button className="lumaComposerStop" type="button" aria-label="停止生成" title="停止生成" disabled={state.pending} onClick={() => { void runtime.stop() }}><Square size={15} fill="currentColor" aria-hidden="true"/></button>
            : runningJob ? <button className="lumaComposerStop" type="button" aria-label="停止任务" title="停止任务" disabled={!state.writable} onClick={() => void cancel(runningJob.id)}><Square size={15} fill="currentColor" aria-hidden="true"/></button>
            : <button className="is-primary lumaComposerSubmit" type="submit" title={mode==='chat'?'发送（Ctrl / ⌘ + Enter）':mode==='team'?'开始协作':'分配任务'} aria-label={mode==='chat'?'发送':mode==='team'?'开始协作':'分配任务'} aria-keyshortcuts="Control+Enter Meta+Enter" disabled={!canSend}><ArrowUp size={20} strokeWidth={2.6} aria-hidden="true"/></button>}</div>
      </form>
    </div>}
    {panel==='workspace' && !roomView && active && <RoleWorkspacePanel key={roleId} active={active} dataReady={deskReady} title={state.profile.name}
      members={[{id:roleId,name:state.profile.name,skin:skins[roleId],config:desk.state?.roles[roleId]}]} eligibleIds={[roleId]} jobs={jobs} roleJobs={roleJobs} names={names}
      assignments={selectedWindow?{[roleId]:selectedWindow.id}:{}} canAssign={deskReady && state.writable && !busy && !runningJob && !state.running} canWrite={state.writable}
      onConfigure={()=>{setServiceTarget(null);setPanel('api')}} onAssign={(_,id,label)=>assignWindow(id,label)} onClose={()=>setPanel(null)}/>}
    {panel==='records' && !roomView && active && <ContactRecords key={JSON.stringify([roleId,recordFocus])} initial={recordFocus} scope={{roleId}} name={state.profile.name} names={names}
      jobs={roleJobs.filter(job=>job.roleIds.every(id=>visibleRoles.has(id)))} letters={desk.state?.letters??[]} write={state.writable && !busy} available={deskReady} refresh={desk.refresh} close={()=>setPanel(null)}
      onTopicRemoved={removed=>{if(!nativeView && removed===topic){const next='desk-'+crypto.randomUUID();freshTopics.current.set(roleId,next);selectLocal(next)}}}
      forgetReplyMarks={forgetReplyMarks}
      native={{state,runtime,open:async id=>{const session=state.topics.find(t=>t.id===id);if(!session || !(await runtime.selectTopic(session.id)))throw Error(runtime.getSnapshot().problem||'无法打开原生会话。');selectLocal('native');setPanel(null)}}}/>}
    {panel === 'settings' && <ContactChatSettings key={roleId} state={state} deskReady={deskReady} onRecords={()=>openRecords()}
      config={desk.state?.roles[roleId]} model={desk.state?.roles[roleId]?.model} memoryCount={deskReady ? desk.state?.memories[roleId] ?? 0 : undefined}
      onSection={section=>{if(section==='api')setServiceTarget(null);setPanel(section)}} onClose={()=>setPanel(null)}
      onDisplay={display=>void runtime.setDisplay(display)} onNative={onOpenNative}
      canCreate={state.writable && !busy && Boolean(preferred) && !(nativeView && state.running)} onCreate={()=>{
        if (!nativeView || mode === 'team') selectLocal('desk-' + crypto.randomUUID())
        else { selectLocal('native'); void runtime.newTopic() }
      }}
      canExport={Boolean(letters.length || (nativeView ? state.messages.length : jobs.length))}
      onExport={()=>downloadJson(`Luma-${state.profile.name}-对话.json`, { ...(nativeView ? runtime.exportTranscript() : { roleId, topic, jobs }), letters })}
      history={!preferred ? '' : nativeView ? 'native:' + (state.sessionId ?? '') : 'desk:' + topic}
      historyBusy={busy} onHistory={value=>void selectHistory(value)} historyOptions={<>
            {!preferred && <option value="" disabled>选择对话服务</option>}
            <optgroup label="DSH 历史">{!state.sessionId && <option value="native:">DSH 对话</option>}{state.topics.map(t => <option value={'native:' + t.id} key={t.id}>{t.title}</option>)}</optgroup>
            <optgroup label="员工工作记录">{(configured || (preferred && !nativeView)) && !workTopics.has(topic) && <option value={'desk:' + topic}>独立服务对话</option>}{[...workTopics].map(([id,title]) => <option key={id} value={'desk:' + id}>{title}</option>)}</optgroup>
      </>}/>}
    {panel === 'api' && desk.state && visibleRoles.has(serviceRole) && <AgentServicePanel key={'api-' + serviceRole} roleId={serviceRole} name={names[serviceRole] ?? state.profile.name}
      forHandoff={serviceTarget?.owner === roleId && mode === 'team'} config={desk.state.roles[serviceRole]} onSaved={() => setChosen(old => { const next = {...old}; delete next[serviceRole]; return next })}
      canWrite={state.writable} refresh={desk.refresh} close={() => setPanel(null)} />}
    {panel === 'memory' && <AgentMemoryPanel key={'memory-' + roleId} roleId={roleId} name={state.profile.name} house={desk.state?.loveHouse} count={desk.state?.memories[roleId] ?? 0} canWrite={state.writable} refresh={desk.refresh} close={() => setPanel(null)} />}
    {panel === 'persona' && <aside className="lumaRoleEditor" aria-label="角色设定编辑">
      <header><h2>人格设定</h2><button type="button" aria-label="关闭角色设定" onClick={() => setPanel(null)}>×</button></header>
      <p>为这位角色调整性格与场景，随下一条消息生效。原有对话继续保留。</p>
      {notice && <p role="status">{notice}</p>}
      {JSON.stringify(profile) !== persistedProfile && <p role="status">有尚未保存的角色修改。</p>}
      <label>角色名称<input value={profile.name} maxLength={80} onChange={event => setProfile({ ...profile, name: event.target.value })} /></label>
      <label>性格与说话方式<textarea aria-label="性格与说话方式" value={profile.personality} maxLength={12000} onChange={event => setProfile({ ...profile, personality: event.target.value })} /></label>
      <label>对话场景<textarea aria-label="对话场景" value={profile.scenario} maxLength={8000} onChange={event => setProfile({ ...profile, scenario: event.target.value })} /></label>
      <label>角色开场白<textarea aria-label="角色开场白" value={profile.greeting} maxLength={4000} onChange={event => setProfile({ ...profile, greeting: event.target.value })} /></label>
      <div className="lumaRoleEditorActions"><button type="button" className="is-primary" disabled={!state.writable || state.pending || !profile.name.trim()} onClick={() => { void runtime.saveProfile(profile).then(saved => { if (saved) setNotice('角色设定已保存。') }) }}>保存设定</button>
        <button type="button" disabled={!state.writable || state.pending} onClick={() => { void runtime.resetProfile() }}>恢复作者设定</button></div>
      <label>导入角色设定 JSON<input type="file" accept=".json,application/json" onChange={event => { void importCard(event.target.files?.[0]); event.currentTarget.value = '' }} /></label>
      <p>导入名称、性格、场景与开场白。</p>
      <button type="button" onClick={() => downloadJson(`Luma-${profile.name}-角色卡.json`, { spec: 'chara_card_v2', spec_version: '2.0', data: { name: profile.name,
        description: profile.personality, personality: profile.personality, scenario: profile.scenario, first_mes: profile.greeting, mes_example: '', creator_notes: 'Luma 本地角色设定',
        system_prompt: '根据角色设定自然回应。情节与动作是虚构表达，不代替用户发言或编造现实执行结果。', post_history_instructions: '', alternate_greetings: [],
        tags: ['Luma'], creator: '', character_version: '1.0', character_book: { name: '角色附录', description: '', entries: [], extensions: {} }, extensions: {} } })}>导出角色卡</button>
      <details><summary>对话管理</summary><label>你的称呼<input maxLength={80} value={userName} onChange={event => setUserName(event.target.value)} /></label>
        <button type="button" disabled={!state.writable || state.pending} onClick={() => { void runtime.setUserName(userName) }}>保存称呼</button>
        <button type="button" disabled={!nativeView || !state.sessionId || state.running || state.pending} onClick={() => { if (window.confirm('将当前对话归档？DSH 中的历史记录会保留。')) void runtime.archiveTopic() }}>归档当前 DSH 对话</button></details>
    </aside>}
  </section></ReplyToolsProvider>
}

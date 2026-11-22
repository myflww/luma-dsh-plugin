import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { MESSAGE_CHARACTERS, type MessagesRuntime } from './messages-runtime.ts'
import type { RoleProfile } from '../messages-settings.ts'
import { AgentMemoryPanel, AgentServicePanel, EmployeeFace, JobCard } from './AgentDeskPanels.tsx'
import { agentRequest, inProgress, useAgentDesk, type AgentJob, type AgentMode, type WorkRoom } from './agent-desk-api.ts'
import { RoomConversation, RoomCreator } from './WorkRooms.tsx'
import './MessagesPage.css'
import './AgentDesk.css'
import './Contacts.css'
import { CloudOfficeLauncher } from './CloudOfficePanel.tsx'

export function downloadJson(name: string, value: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json;charset=utf-8' }))
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = name; anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
export function MessagesPage({ runtime, active = true, employeeVisit, onOpenNative, unlockedEmployeeIds = MESSAGE_CHARACTERS.map(role => role.id), onOpenRewards }: { unlockedEmployeeIds?: readonly string[] | undefined; onOpenRewards?(): void; runtime: MessagesRuntime; active?: boolean; employeeVisit?: { mode: 'chat' | 'task'; topic?: string; roleId?: string } | undefined; onOpenNative(): void }) {
  const state = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot, runtime.getSnapshot)
  const [query, setQuery] = useState(''), [panel, setPanel] = useState<'settings' | 'persona' | 'api' | 'memory' | null>(null)
  const [mode, setMode] = useState<AgentMode>('chat'), [team, setTeam] = useState<string[]>([])
  const [serviceTarget, setServiceTarget] = useState<{ owner: string; id: string } | null>(null)
  const [chosen, setChosen] = useState<Record<string,string>>({}), [sending, setSending] = useState(false)
  const [actionError, setActionError] = useState('')
  const submitLock = useRef(false)
  const retries = useRef(new Map<string, { signature: string; id: string }>())
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
  const [actionsOpen, setActionsOpen] = useState(false)
  const [rosterOpen, setRosterOpen] = useState(false)
  const partners = MESSAGE_CHARACTERS.filter(role => unlockedEmployeeIds.includes(role.id))
  const visibleRoles = new Set(partners.map(role => role.id as string))
  const rooms = (desk.state?.rooms ?? []).filter(room => room.roleIds.every(id => visibleRoles.has(id)))
  const roomSupported = Array.isArray(desk.state?.rooms)
  function showRoom(room: WorkRoom | 'new' | null) {
    setPanel(null); setRoomView(room); setActionsOpen(false); setRosterOpen(false)
  }
  useEffect(() => { setRoomView(null) }, [roleId, employeeVisit])
  const names = Object.fromEntries(MESSAGE_CHARACTERS.map(role => [role.id, state.preferences.profiles[role.id]?.name ?? role.name]))
  const skins = state.employeeSkins ?? {}
  const configured = Boolean(desk.state?.roles[roleId]?.model)
  const roomIds = new Set(desk.state?.rooms?.map(room => room.id))
  const roleJobs = (desk.state?.jobs ?? []).filter(job => !roomIds.has(job.topic ?? '') && job.roleIds.includes(roleId))
  const topicFor = (job: AgentJob) => job.topic ?? ('desk-' + job.roleIds[0])
  const workTopics = new Map<string,string>()
  for (const job of [...roleJobs].sort((a,b) => a.createdAt - b.createdAt)) {
    const key = topicFor(job)
    if (!workTopics.has(key)) workTopics.set(key, job.text.slice(0, 30))
  }
  const newestJob = roleJobs.reduce<AgentJob | undefined>((latest, job) => !latest || latest.createdAt < job.createdAt ? job : latest, undefined)
  const defaultTopic = configured ? (newestJob ? topicFor(newestJob) : 'desk-' + roleId) : 'native'
  const preferred = chosen[roleId] ?? (desk.state ? defaultTopic : undefined)
  const nativeView = preferred === 'native'
  const topic = preferred && !nativeView ? preferred : 'desk-' + roleId
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
  const deskReady = Boolean(desk.state) && !desk.problem
  const serviceReady = sendViaNative ? !state.running && !state.attention
    : deskReady && (mode === 'team' ? teamReady : configured)
  const canSend = visibleRoles.has(roleId) && state.writable && !busy && !!drafting.trim() && !runningJob && serviceReady
  const serviceRole = serviceTarget?.owner === roleId ? serviceTarget.id : roleId
  const [localRefresh, setLocalRefresh] = useState(0)
  const scrollFingerprint = (letters.at(-1)?.id ?? '') + jobs.map(job => [job.id, job.status, job.steps.map(step => step.output.length).join(',')].join(':')).join('|')
  const selectLocal = (key: string) => setChosen(old => ({ ...old, [roleId]: key }))
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
    if (sendViaNative) {
      await runtime.send(mode === 'task' ? 'task' : 'chat')
      return
    }
    const roleIds = mode === 'team' ? handoff : [roleId]
    const retryKey = JSON.stringify([roleId, topic])
    const signature = JSON.stringify([roleIds, mode, drafting, topic])
    const previous = retries.current.get(retryKey)
    const requestId = previous?.signature === signature ? previous.id : crypto.randomUUID()
    const profiles = Object.fromEntries(roleIds.map(id => {
      const profile = state.preferences.profiles[id] ?? MESSAGE_CHARACTERS.find(role => role.id === id)!.profile
      return [id, { name: profile.name, personality: profile.personality, scenario: profile.scenario }]
    }))
    submitLock.current = true; setSending(true)
    retries.current.set(retryKey, { signature, id: requestId })
    const timeout = AbortSignal.timeout(15_000)
    try {
      await agentRequest<AgentJob>('run', { requestId, roleIds, mode, text: drafting.trim(), topic, profiles }, timeout)
      retries.current.delete(retryKey)
      const now = runtime.getSnapshot()
      if (now.roleId === roleId && now.preferences.drafts[roleId] === drafting) runtime.setDraft('')
      selectLocal(topic); await desk.refresh(); setLocalRefresh(value => value + 1)
    } catch (error) {
      setActionError(timeout.aborted || error instanceof TypeError ? '提交结果尚未确认，草稿已保留。连接恢复后可重试这条消息。'
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
  useEffect(() => { setNotice(''); setActionError(''); setTeam([]); setMode('chat'); setServiceTarget(null); setActionsOpen(false); setPanel(null); stick.current = true }, [state.roleId])
  useEffect(() => {
    if (employeeVisit) { setMode(employeeVisit.mode); setPanel(null); setActionError('') }
  }, [employeeVisit])
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
    if (!active || (!panel && !actionsOpen && !rosterOpen)) return
    function close(event: KeyboardEvent) { if (event.key === 'Escape') { setPanel(null); setActionsOpen(false); setRosterOpen(false) } }
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [active, panel, actionsOpen, rosterOpen])
  return <section className={'lumaMessages lumaContacts' + (rosterOpen ? ' show-roster' : '')} aria-label="联系">
    <aside className="lumaMessagesRoster">
      <header><h1>联系</h1><button type="button" className="lumaContactMobile" onClick={() => setRosterOpen(false)}>返回对话</button></header>
      <input type="search" aria-label="搜索联系人或群聊" placeholder="搜索联系人或群聊" value={query} onChange={event => setQuery(event.target.value)} />
      <div className="lumaMessagesCharacters" role="list" aria-label="联系人与群聊">
        {matching.map(({role,text,time}) => <button type="button" key={role.id}
          className={!roomView && state.roleId === role.id ? 'is-selected' : ''} aria-pressed={!roomView && state.roleId === role.id} disabled={busy}
          onClick={() => { showRoom(null); runtime.selectRole(role.id) }}>
          <EmployeeFace id={role.id} skin={skins[role.id]} /><span className="lumaContactPreview"><strong>{names[role.id]}</strong><small>{text}</small></span>
          {time > 0 && <time dateTime={new Date(time).toISOString()}>{new Date(time).toDateString() === new Date().toDateString() ? clockText(time) : new Date(time).toLocaleDateString('zh-CN',{month:'numeric',day:'numeric'})}</time>}
        </button>)}
        {matchingRooms.map(room => <button type="button" key={room.id} aria-pressed={typeof roomView === 'object' && roomView?.id === room.id}
          className={typeof roomView === 'object' && roomView?.id === room.id ? 'is-selected' : ''} onClick={() => showRoom(room)}>
          <span className="lumaContactGroupFaces">{room.roleIds.slice(0,2).map(id => <EmployeeFace key={id} id={id} skin={skins[id]} />)}</span>
          <span className="lumaContactPreview"><strong>{room.name}</strong><small>{desk.state?.jobs.filter(job => job.topic === room.id).at(-1)?.text ?? room.roleIds.map(id => names[id]).join('、')}</small></span></button>)}
        {!matching.length && !matchingRooms.length && <p>没有找到这个联系人或群聊</p>}
      </div>
      {onOpenRewards && partners.length < MESSAGE_CHARACTERS.length && <footer><button type="button" onClick={onOpenRewards}>邀请新伙伴 <span aria-hidden="true">↗</span></button></footer>}
    </aside>
    {roomView && desk.state && (roomView === 'new' || rooms.some(room => room.id === roomView.id)) ? (roomView === 'new'
      ? <RoomCreator availableRoleIds={unlockedEmployeeIds} snapshot={state} state={desk.state} names={names} refresh={desk.refresh} close={() => showRoom(null)} onCreated={showRoom} />
      : <RoomConversation key={roomView.id} room={roomView} snapshot={state} state={desk.state} names={names} refresh={desk.refresh} close={() => showRoom(null)} />)
      : <div className="lumaMessagesConversation">
      <header className="lumaMessageToolbar">
        <button type="button" className="lumaContactMobile" onClick={() => setRosterOpen(true)}>联系人</button>
        <div className="lumaEmployeeTitle"><EmployeeFace id={roleId} skin={skins[roleId]} /><div><h2>{state.profile.name}</h2><span>{state.running || runningJob ? '正在回复…' : '一对一聊天'}</span></div></div>
        <button className="lumaContactSettingsButton" type="button" aria-label="聊天设置" aria-expanded={panel !== null} onClick={() => { setPanel('settings'); setActionsOpen(false) }}>•••</button>
      </header>
      {state.problem && <div className="lumaMessageNotice" role="alert">{state.problem}<button type="button" onClick={onOpenNative}>检查模型和连接</button></div>}
      {actionError && <p className="lumaMessageNotice" role="alert">{actionError}</p>}
      {desk.problem && <div className="lumaMessageNotice" role="alert"><span>{desk.problem}</span>
        <button type="button" onClick={() => void desk.refresh()}>重试员工服务</button></div>}
      {!preferred && (slowLookup || desk.problem) && <div className="lumaMessageNotice" role="status"><span>{desk.problem ? '可在 DSH 会话中继续聊天或单人派工。' : '连接员工服务耗时较长，可先使用 DSH 会话。'}</span>
        <button type="button" onClick={() => selectLocal('native')}>使用 DSH 会话</button></div>}
      {preferred && !nativeView && deskReady && !configured && mode !== 'team' && <p className="lumaMessageNotice">这段工作记录使用独立服务。可在「API 服务」中配置模型，或从「历史对话」选择 DSH 会话。</p>}
      {!state.writable && !state.loading && <p className="lumaMessageNotice">当前连接为只读，仍可阅读已有对话。请在本机 DSH 中保存设定或发送消息。</p>}
      {nativeView && state.attention && <div className="lumaMessageNotice" role="status">此对话有待确认事项。<button type="button" onClick={onOpenNative}>前往原生会话处理</button></div>}
      <div className={`lumaMessageHistory is-${state.preferences.display}`} ref={scroll} role="log" aria-label="角色对话记录" aria-live="polite"
        onScroll={event => { const el = event.currentTarget; stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 90 }}>
        {showNative && state.hasMore && <button type="button" className="lumaLoadOlder" disabled={state.pending} onClick={() => { void runtime.loadOlder() }}>读取更早的消息</button>}
        {showNative && state.loading && <p role="status">正在读取对话…</p>}
        {!letters.length && !(showNative ? state.messages.length : jobs.length) && !state.loading && <article className="lumaMessageBubble is-assistant lumaGreeting"><EmployeeFace id={roleId} skin={skins[roleId]} /><div><header><strong>{state.profile.name}</strong></header><p>{state.profile.greeting}</p></div></article>}
        {[...jobs.map(job => ({time:job.createdAt, node:job.mode === 'chat' ? <div key={job.id}>
          <article className="lumaMessageBubble is-user"><div><header><strong>{state.preferences.userName}</strong><time>{clockText(job.createdAt)}</time></header><p>{job.text}</p><small>已发送</small></div></article>
          {job.steps[0]?.output ? <article className="lumaMessageBubble is-assistant"><EmployeeFace id={roleId} skin={skins[roleId]}/><div><header><strong>{names[roleId]}</strong></header><p>{job.steps[0].output}</p></div></article>
            : <p className="lumaMessageThinking" role="status">{inProgress(job.status) ? state.profile.name + '正在输入…' : job.error || (job.status === 'cancelled' ? '已停止回复' : '回复未完成')}</p>}
        </div> : <JobCard key={job.id} job={job} names={names} skins={skins} canWrite={state.writable} cancel={() => void cancel(job.id)} />})),
          ...letters.map(letter=>({time:letter.time,node:<article key={'life:'+letter.id} className="lumaMessageBubble is-assistant lumaLifeLetter">
            <EmployeeFace id={letter.role} skin={skins[letter.role]}/><div><header><strong>{names[letter.role]}</strong><time>{clockText(letter.time)}</time></header>
              <p>{letter.text}</p><small>{letter.source==='model'?'主动来信 · 独立模型':'主动来信 · 日常对白'}</small></div></article>})),
          ...(showNative ? state.messages : []).map(message => ({time:message.time ?? Infinity,node:<article key={message.id} className={`lumaMessageBubble is-${message.role}`}>
          {message.role === 'assistant' && <EmployeeFace id={roleId} skin={skins[roleId]} />}
          <div><header><strong>{message.role === 'user' ? state.preferences.userName : message.role === 'assistant' ? state.profile.name : '对话提示'}</strong>
            {message.time !== undefined && <time dateTime={new Date(message.time).toISOString()}>{new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit' }).format(message.time)}</time>}</header>
            <p>{message.text || (message.streaming ? '…' : '此条消息没有文本内容，可在原生会话查看附件。')}</p>{message.role === 'user' && <small>已发送</small>}{message.streaming && <small>正在输入…</small>}</div>
        </article>}))].sort((a,b)=>a.time-b.time).map(row=>row.node)}
        {showNative && state.running && !state.messages.some(message => message.streaming) && <p className="lumaMessageThinking" role="status">{state.profile.name}正在组织回复…</p>}
      </div>
      <form className="lumaMessageComposer" onSubmit={event => { event.preventDefault(); void send() }}>
        {actionsOpen && <nav className="lumaDeskModes" aria-label="发送模式">{(['chat','task','team'] as const).map((value,index) => <button type="button" key={value} aria-pressed={mode === value} disabled={busy} onClick={() => { setMode(value); setActionsOpen(false); setActionError('') }}>{['聊天','单人派工','协作交接'][index]}</button>)}
          {roomSupported && <button type="button" disabled={busy || !state.writable} onClick={showRoomCreator}>{partners.length < 2 ? '邀请伙伴组群' : '拉群协作'}</button>}
        </nav>}
        {mode !== 'chat' && <div className="lumaContactMode"><span>{mode === 'task' ? '单人派工' : '协作交接'}</span><button type="button" onClick={() => { setMode('chat'); setActionsOpen(false) }}>返回聊天</button></div>}
        {mode === 'team' && <fieldset className="lumaDeskTeam"><legend>交接顺序</legend><b>1 · {names[roleId]}</b>
          {partners.filter(role => role.id !== roleId).map(role => <label key={role.id}><input type="checkbox" checked={optedTeam.includes(role.id)} disabled={busy}
            onChange={e => setTeam(prev => e.target.checked ? [...prev, role.id] : prev.filter(id => id !== role.id))} />
            {optedTeam.includes(role.id) ? (optedTeam.indexOf(role.id) + 2) + ' · ' : ''}{names[role.id]}</label>)}
          {missingServices.length > 0 && <div className="lumaTeamServices" role="group" aria-label="待配置的协作服务">
            <span>开始前，请为以下员工配置 API 服务</span>
            {missingServices.map(id => <button key={id} type="button" aria-label={`配置${names[id]}的 API 服务`}
              onClick={() => { setServiceTarget({ owner: roleId, id }); setPanel('api') }}>{names[id]} · 配置</button>)}
          </div>}</fieldset>}
        <textarea aria-label="发送给角色的消息" placeholder={`对${state.profile.name}说点什么…`} value={state.preferences.drafts[state.roleId] ?? ''} maxLength={32000}
          onChange={event => {
            if (preferred && !chosen[roleId]) selectLocal(preferred)
            runtime.setDraft(event.target.value)
          }} onKeyDown={event => { if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && !event.nativeEvent.isComposing) { event.preventDefault(); event.currentTarget.form?.requestSubmit() } }} />
        <div className="lumaContactSendRow"><button type="button" className="lumaContactAdd" aria-label="更多聊天操作" aria-expanded={actionsOpen} onClick={() => setActionsOpen(v => !v)}>＋</button>
          <span>Ctrl / ⌘ + Enter 发送</span><div>
          {sendViaNative && state.running ? <button type="button" disabled={state.pending} onClick={() => { void runtime.stop() }}>停止生成</button>
            : runningJob ? <button type="button" disabled={!state.writable} onClick={() => void cancel(runningJob.id)}>停止任务</button>
            : <button className="is-primary" type="submit" disabled={!canSend}>{mode === 'chat' ? '发送' : mode === 'team' ? '开始协作' : '分配任务'}</button>}</div></div>
      </form>
    </div>}
    {panel === 'settings' && <aside className="lumaRoleEditor lumaContactSettings" aria-label="聊天设置"><header><h2>聊天设置</h2><button type="button" aria-label="关闭聊天设置" onClick={() => setPanel(null)}>×</button></header>
      <h3>{state.profile.name}</h3>
      <button type="button" onClick={() => setPanel('persona')}>人格设定</button>
      <button type="button" disabled={!desk.state} onClick={() => {setServiceTarget(null); setPanel('api')}}>API 服务</button>
      <button type="button" onClick={() => setPanel('memory')}>记忆库</button>
      <CloudOfficeLauncher key={roleId} roleId={roleId} name={state.profile.name} disabled={!state.writable}/>
      <h3>会话管理</h3>
          <button type="button" disabled={!state.writable || busy || !preferred || (nativeView && state.running)} onClick={() => {
            if (!nativeView || mode === 'team') selectLocal('desk-' + crypto.randomUUID())
            else { selectLocal('native'); void runtime.newTopic() }
          }}>新对话</button>
          <select aria-label="历史对话" value={!preferred ? '' : nativeView ? 'native:' + (state.sessionId ?? '') : 'desk:' + topic} disabled={busy}
            onChange={event => void selectHistory(event.target.value)}>
            {!preferred && <option value="" disabled>选择对话服务</option>}
            <optgroup label="DSH 历史">{!state.sessionId && <option value="native:">DSH 对话</option>}{state.topics.map(t => <option value={'native:' + t.id} key={t.id}>{t.title}</option>)}</optgroup>
            <optgroup label="员工工作记录">{(configured || (preferred && !nativeView)) && !workTopics.has(topic) && <option value={'desk:' + topic}>独立服务对话</option>}{[...workTopics].map(([id,title]) => <option key={id} value={'desk:' + id}>{title}</option>)}</optgroup></select>
      <button type="button" onClick={() => { void runtime.setDisplay(state.preferences.display === 'bubbles' ? 'novel' : 'bubbles') }}>{state.preferences.display === 'bubbles' ? '阅读模式' : '气泡模式'}</button>
          <button type="button" disabled={!letters.length && !(nativeView ? state.messages.length : jobs.length)} onClick={() => downloadJson(`Luma-${state.profile.name}-对话.json`, { ...(nativeView ? runtime.exportTranscript() : { roleId, topic, jobs }), letters })}>导出对话</button>

      <button type="button" onClick={onOpenNative}>原生会话与模型设置 ↗</button>
    </aside>}
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
  </section>
}

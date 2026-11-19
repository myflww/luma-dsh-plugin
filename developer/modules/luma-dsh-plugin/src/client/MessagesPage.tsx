import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { MESSAGE_CHARACTERS, type MessagesRuntime } from './messages-runtime.ts'
import type { RoleProfile } from '../messages-settings.ts'
import { AgentMemoryPanel, AgentServicePanel, EmployeeFace, JobCard } from './AgentDeskPanels.tsx'
import { agentRequest, inProgress, useAgentDesk, type AgentJob, type AgentMode, type WorkRoom } from './agent-desk-api.ts'
import { RoomConversation, RoomCreator } from './WorkRooms.tsx'
import './MessagesPage.css'
import './AgentDesk.css'
import { CloudOfficeLauncher } from './CloudOfficePanel.tsx'

export function downloadJson(name: string, value: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json;charset=utf-8' }))
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = name; anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
export function MessagesPage({ runtime, active = true, employeeVisit, onOpenNative }: { runtime: MessagesRuntime; active?: boolean; employeeVisit?: { mode: 'chat' | 'task' } | undefined; onOpenNative(): void }) {
  const state = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot, runtime.getSnapshot)
  const [query, setQuery] = useState(''), [panel, setPanel] = useState<'persona' | 'api' | 'memory' | null>(null)
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
  const roomSupported = Array.isArray(desk.state?.rooms)
  function showRoom(room: WorkRoom | 'new' | null) {
    setPanel(null); setRoomView(room)
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
  const runningJob = jobs.find(job => inProgress(job.status))
  const showNative = nativeView
  const busy = state.pending || sending
  const drafting = state.preferences.drafts[roleId] ?? ''
  const optedTeam = team.filter(id => id !== roleId)
  const handoff = [roleId, ...optedTeam]
  const serviceConfigs = desk.state?.roles
  const missingServices = mode === 'team' && optedTeam.length > 0 && serviceConfigs
    ? handoff.filter(id => !serviceConfigs[id]?.model) : []
  const teamReady = mode !== 'team' || (optedTeam.length > 0 && missingServices.length === 0)
  const sendViaNative = mode !== 'team' && nativeView
  const deskReady = Boolean(desk.state) && !desk.problem
  const serviceReady = sendViaNative ? !state.running && !state.attention
    : deskReady && (mode === 'team' ? teamReady : configured)
  const canSend = state.writable && !busy && !!drafting.trim() && !runningJob && serviceReady
  const serviceRole = serviceTarget?.owner === roleId ? serviceTarget.id : roleId
  const [localRefresh, setLocalRefresh] = useState(0)
  const scrollFingerprint = jobs.map(job => [job.id, job.status, job.steps.map(step => step.output.length).join(',')].join(':')).join('|')
  const selectLocal = (key: string) => setChosen(old => ({ ...old, [roleId]: key }))
  const togglePanel = (next: NonNullable<typeof panel>) => setPanel(current => current === next ? null : next)
  async function selectHistory(value: string) {
    if (value.startsWith('native:')) {
      const id = value.slice('native:'.length)
      if (id && id !== state.sessionId && !(await runtime.selectTopic(id as never))) return
      selectLocal('native')
    } else if (value.startsWith('desk:')) selectLocal(value.slice('desk:'.length))
  }
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
  useEffect(() => { setNotice(''); setActionError(''); setTeam([]); setMode('chat'); setServiceTarget(null) }, [state.roleId])
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
  return <section className="lumaMessages" aria-label="员工工作台">
    <aside className="lumaMessagesRoster">
      <header><h1>员工工作台</h1></header>
      {roomSupported && <div className="lumaRoomNav">
        <select aria-label="打开协作群" value={roomView && roomView !== 'new' ? roomView.id : ''} onChange={e => {
          showRoom(desk.state?.rooms?.find(room => room.id === e.target.value) ?? null)
        }}><option value="">选择协作群</option>{desk.state?.rooms?.map(room => <option key={room.id} value={room.id}>{room.name}</option>)}</select>
        <button type="button" aria-label="新建协作群" title="新建协作群" disabled={!state.writable} onClick={() => showRoom('new')}>＋</button>
      </div>}
      <input aria-label="搜索员工" placeholder="搜索员工" value={query} onChange={event => setQuery(event.target.value)} />
      <div className="lumaMessagesCharacters" role="list" aria-label="虚拟角色">
        {MESSAGE_CHARACTERS.filter(role => (state.preferences.profiles[role.id]?.name ?? role.name).includes(query)).map(role => <button type="button" key={role.id}
          className={!roomView && state.roleId === role.id ? 'is-selected' : ''} aria-pressed={!roomView && state.roleId === role.id} disabled={busy}
          onClick={() => { showRoom(null); runtime.selectRole(role.id) }}>
          <EmployeeFace id={role.id} skin={skins[role.id]} /><span><strong>{names[role.id]}</strong><small>{desk.state?.jobs.some(job => job.steps.some(step => step.roleId === role.id && step.status === 'running')) ? '工作中' : desk.state?.roles[role.id]?.model ?? 'DSH 会话'}</small></span>
        </button>)}
      </div>
      <footer><button type="button" onClick={onOpenNative}>原生会话与模型设置 ↗</button></footer>
    </aside>
    {roomView && desk.state ? (roomView === 'new'
      ? <RoomCreator snapshot={state} state={desk.state} names={names} refresh={desk.refresh} close={() => showRoom(null)} onCreated={showRoom} />
      : <RoomConversation key={roomView.id} room={roomView} snapshot={state} state={desk.state} names={names} refresh={desk.refresh} close={() => showRoom(null)} />)
      : <div className="lumaMessagesConversation">
      <header className="lumaMessageToolbar"><div className="lumaEmployeeTitle"><EmployeeFace id={roleId} skin={skins[roleId]} /><div><h2>{state.profile.name}</h2><span>{!preferred ? '待选择服务' : nativeView ? 'DSH 会话' : desk.state?.roles[roleId]?.model || '工作记录'}</span></div></div>
        <div className="lumaMessageTools"><button type="button" onClick={() => togglePanel('persona')}>人格设定</button>
          <button type="button" onClick={() => {
            setPanel(panel === 'api' && serviceRole === roleId ? null : 'api')
            setServiceTarget(null)
          }}>API 服务</button><button type="button" onClick={() => togglePanel('memory')}>记忆库</button>
          <CloudOfficeLauncher key={roleId} roleId={roleId} name={state.profile.name} disabled={!state.writable}/>
          <button type="button" disabled={!state.writable || busy || !preferred || (nativeView && state.running)} onClick={() => {
            if (!nativeView || mode === 'team') selectLocal('desk-' + crypto.randomUUID())
            else { selectLocal('native'); void runtime.newTopic() }
          }}>新对话</button>
          <select aria-label="历史对话" value={!preferred ? '' : nativeView ? 'native:' + (state.sessionId ?? '') : 'desk:' + topic} disabled={busy}
            onChange={event => void selectHistory(event.target.value)}>
            {!preferred && <option value="" disabled>选择对话服务</option>}
            <optgroup label="DSH 历史">{!state.sessionId && <option value="native:">DSH 对话</option>}{state.topics.map(t => <option value={'native:' + t.id} key={t.id}>{t.title}</option>)}</optgroup>
            <optgroup label="员工工作记录">{(configured || (preferred && !nativeView)) && !workTopics.has(topic) && <option value={'desk:' + topic}>独立服务对话</option>}{[...workTopics].map(([id,title]) => <option key={id} value={'desk:' + id}>{title}</option>)}</optgroup></select>
        </div>
      </header>
      {state.problem && <div className="lumaMessageNotice" role="alert">{state.problem}<button type="button" onClick={onOpenNative}>检查模型和连接</button></div>}
      {actionError && <p className="lumaMessageNotice" role="alert">{actionError}</p>}
      {desk.problem && <div className="lumaMessageNotice" role="alert"><span>{desk.problem}</span>
        <button type="button" onClick={() => void desk.refresh()}>重试员工服务</button></div>}
      {!preferred && <div className="lumaMessageNotice" role="status"><span>{desk.problem ? '可在 DSH 会话中继续聊天或单人派工。' : '正在读取员工的服务设置…'}</span>
        <button type="button" onClick={() => selectLocal('native')}>使用 DSH 会话</button></div>}
      {preferred && !nativeView && deskReady && !configured && mode !== 'team' && <p className="lumaMessageNotice">这段工作记录使用独立服务。可在「API 服务」中配置模型，或从「历史对话」选择 DSH 会话。</p>}
      {!state.writable && !state.loading && <p className="lumaMessageNotice">当前连接为只读，仍可阅读已有对话。请在本机 DSH 中保存设定或发送消息。</p>}
      {nativeView && state.attention && <div className="lumaMessageNotice" role="status">此对话有待确认事项。<button type="button" onClick={onOpenNative}>前往原生会话处理</button></div>}
      <div className={`lumaMessageHistory is-${state.preferences.display}`} ref={scroll} role="log" aria-label="角色对话记录" aria-live="polite"
        onScroll={event => { const el = event.currentTarget; stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 90 }}>
        {showNative && state.hasMore && <button type="button" className="lumaLoadOlder" disabled={state.pending} onClick={() => { void runtime.loadOlder() }}>读取更早的消息</button>}
        {showNative && state.loading && <p role="status">正在读取对话…</p>}
        {!(showNative ? state.messages.length : jobs.length) && <div className="lumaEmployeeGreeting"><EmployeeFace id={roleId} skin={skins[roleId]} />
          <h3>{state.profile.name}</h3><p>{state.profile.greeting}</p></div>}
        {jobs.map(job => <JobCard key={job.id} job={job} names={names} skins={skins} canWrite={state.writable} cancel={() => void cancel(job.id)} />)}
        {showNative && state.messages.map(message => <article key={message.id} className={`lumaMessageBubble is-${message.role}`}>
          {message.role === 'assistant' && <EmployeeFace id={roleId} skin={skins[roleId]} />}
          <div><header><strong>{message.role === 'user' ? state.preferences.userName : message.role === 'assistant' ? state.profile.name : '对话提示'}</strong>
            {message.time !== undefined && <time dateTime={new Date(message.time).toISOString()}>{new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit' }).format(message.time)}</time>}</header>
            <p>{message.text || (message.streaming ? '…' : '此条消息没有文本内容，可在原生会话查看附件。')}</p>{message.streaming && <small>正在生成…</small>}</div>
        </article>)}
        {showNative && state.running && !state.messages.some(message => message.streaming) && <p className="lumaMessageThinking" role="status">{state.profile.name}正在组织回复…</p>}
      </div>
      <form className="lumaMessageComposer" onSubmit={event => { event.preventDefault(); void send() }}>
        <nav className="lumaDeskModes" aria-label="发送模式">{(['chat','task','team'] as const).map((value,index) => <button type="button" key={value} aria-pressed={mode === value} disabled={busy} onClick={() => { setMode(value); setActionError('') }}>{['聊天','单人派工','协作交接'][index]}</button>)}
          {roomSupported && <button type="button" disabled={busy || !state.writable} onClick={() => showRoom('new')}>拉群协作</button>}
        </nav>
        {mode === 'team' && <fieldset className="lumaDeskTeam"><legend>交接顺序</legend><b>1 · {names[roleId]}</b>
          {MESSAGE_CHARACTERS.filter(role => role.id !== roleId).map(role => <label key={role.id}><input type="checkbox" checked={optedTeam.includes(role.id)} disabled={busy}
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
        <div><span>Ctrl / ⌘ + Enter 发送 · 草稿自动保存</span><div><button type="button" onClick={() => { void runtime.setDisplay(state.preferences.display === 'bubbles' ? 'novel' : 'bubbles') }}>{state.preferences.display === 'bubbles' ? '阅读模式' : '气泡模式'}</button>
          <button type="button" disabled={!(nativeView ? state.messages.length : jobs.length)} onClick={() => downloadJson(`Luma-${state.profile.name}-对话.json`, nativeView ? runtime.exportTranscript() : { roleId, topic, jobs })}>导出对话</button>
          {sendViaNative && state.running ? <button type="button" disabled={state.pending} onClick={() => { void runtime.stop() }}>停止生成</button>
            : runningJob ? <button type="button" disabled={!state.writable} onClick={() => void cancel(runningJob.id)}>停止任务</button>
            : <button className="is-primary" type="submit" disabled={!canSend}>{mode === 'chat' ? '发送' : mode === 'team' ? '开始协作' : '分配任务'}</button>}</div></div>
      </form>
    </div>}
    {panel === 'api' && desk.state && <AgentServicePanel key={'api-' + serviceRole} roleId={serviceRole} name={names[serviceRole] ?? state.profile.name}
      forHandoff={serviceTarget?.owner === roleId && mode === 'team'} config={desk.state.roles[serviceRole]}
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

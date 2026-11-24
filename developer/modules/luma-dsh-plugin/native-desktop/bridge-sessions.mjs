import { OFFICE_EMPLOYEE_FOLDER_NAMES, OFFICE_EMPLOYEE_PRESET_IDS } from '../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/office-employee-presets.ts'
import { attachmentBytes } from '../src/shared/chat-attachments.ts'

const emptyTimeline = Object.freeze({ turnOrder: [], turns: new Map() })
const roleForPreset = preset => Object.keys(OFFICE_EMPLOYEE_PRESET_IDS).find(key => OFFICE_EMPLOYEE_PRESET_IDS[key] === preset)

/** Preserve the office's read model while Electron retains and owns each actual Session. */
export function createDesktopSessions(ctx, fetcher = fetch) {
  const controller = ctx.sessions
  const statuses = ctx.uiSession.sessionStatus
  const announced = new Map()
  const retained = new Map()
  const listeners = new Set()
  const employeeWorkspaces = new Map()
  const lifetime = new AbortController()
  let selected
  let displayed
  let disposed = false
  let list
  function notify() {
    if (disposed) return
    const source = controller.list.getSnapshot()
    const byId = {}
    for (const [id, row] of Object.entries(source.byId)) {
      const state = statuses.getSnapshot().get(id)
      const agentPreset = row.projectionValues?.agentPreset ?? announced.get(id)
      byId[id] = { ...row, agentPreset, pendingInteraction: state?.pendingInteraction?.kind,
        completed: state?.completionUnread === true }
    }
    for (const id of announced.keys()) if (!byId[id]) announced.delete(id)
    list = { ...source, byId, jobsBySession: {}, current: selected ?? Object.values(byId).find(row => row.retainedBy?.mainView)?.id }
    for (const listener of listeners) listener()
  }
  notify()
  const stops = [controller.list.subscribe(notify), statuses.subscribe(notify)]

  function prune() {
    for (const [id, record] of retained) {
      if (id === selected || id === displayed) continue
      const snapshot = record.session.getSnapshot()
      if (snapshot.running || snapshot.awaitingFirstTurn || snapshot.pending.length) continue
      retained.delete(id)
      record.release()
    }
  }
  function acquire(id) {
    if (!id || retained.has(id) || !controller.list.getSnapshot().byId[id]) return
    const lease = controller.retain(id, { source: 'lumaEmployee' })
    try {
      const binding = lease.binding
      const raw = binding.session
      const chat = ctx.uiConversation.binding(binding).target('chat')
      const local = new Set()
      let openingError
      const getSnapshot = () => {
        const state = raw.getSnapshot()
        const target = chat.getSnapshot()
        const pending = statuses.getSnapshot().get(id)?.pendingInteraction
        return { ...state, ...(openingError ? { openState: 'error', openError: openingError } : {}),
          nodes: target?.legacy.nodes ?? [], partial: target?.legacy.partial ?? null,
          pending: pending ? [pending] : [],
          chat: { timeline: target?.timeline ?? emptyTimeline } }
      }
      const changed = () => {
        for (const listener of local) listener()
        queueMicrotask(prune)
      }
      const stopChat = chat.subscribe(changed)
      const stopSession = raw.subscribe(changed)
      const stopStatus = statuses.subscribe(changed)
      const session = { getSnapshot, subscribe(listener) { local.add(listener); return () => local.delete(listener) },
        projections: raw.projections, cancel: () => raw.cancel(), loadOlder: () => raw.loadOlder(),
        prompt: (...args) => raw.prompt(...args) }
      retained.set(id, { session, release() { stopStatus(); stopSession(); stopChat(); local.clear(); lease.release() } })
      void lease.ready.catch(error => { openingError = error; changed() })
      notify()
    } catch (error) { lease.release(); throw error }
  }
  // Rendering the retained office may query every listed DSH session. Open a
  // history stream only for the employee topic the workbench actually displays.
  function showTopic(id) {
    if (displayed === id) return
    displayed = id
    selected = id
    queueMicrotask(() => {
      if (disposed || displayed !== id) return
      acquire(id)
      prune()
    })
  }
  function open(id) { selected = id; displayed = id; acquire(id); notify(); prune() }
  function noteAgentPreset(id, preset) {
    if (!controller.list.getSnapshot().byId[id] || !preset) return
    if (announced.get(id) !== preset) { announced.set(id, preset); notify() }
  }
  const sessions = { list: { getSnapshot: () => list, subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener) } },
    binding: id => retained.get(id), open, noteAgentPreset, showTopic,
    clear() { selected = undefined; displayed = undefined; notify(); prune() } }
  const sessionApi = {
    async create(input) {
      let request = input
      if (input.cwd && !input.workspaceId) {
        // Desktop's empty composer requires workspace.sessionIds membership. A
        // bare cwd creates a real Session, but leaves it permanently ungrouped.
        const registration = await ctx.remote.workspace.create({ path: input.cwd })
        if (!registration.ok) return { result: registration }
        const { created, workspace } = registration.value
        const roleId = roleForPreset(input.agentPreset)
        if (created && roleId) await ctx.workspaces.rename(workspace.workspaceId, OFFICE_EMPLOYEE_FOLDER_NAMES[roleId])
        const { cwd, ...options } = input
        request = { ...options, workspaceId: workspace.workspaceId }
      }
      const result = await ctx.remote.session.create(request)
      if (result.ok) {
        const id = result.value.sessionId
        if (request.workspaceId) employeeWorkspaces.set(id, request.workspaceId)
        if (!controller.list.getSnapshot().byId[id]) await controller.refresh()
        if (result.value.agentPreset) noteAgentPreset(id, result.value.agentPreset)
        else if (!controller.list.getSnapshot().byId[id]?.projectionValues?.agentPreset) await controller.refreshProjections(id)
      }
      return { result }
    },
    async rename(input) { return { result: await ctx.remote.session.rename(input) } },
    async selectModel(input) { return { result: await ctx.remote.session.selectModel(input) } },
  }
  const workspaces = { list: ctx.workspaces.list,
    ...(typeof ctx.workspaces.archiveSession==='function' ? {archiveSession:id=>ctx.workspaces.archiveSession(id)} : {}),
    ...(typeof ctx.workspaces.unarchiveSession==='function' ? {unarchiveSession:id=>ctx.workspaces.unarchiveSession(id)} : {}),
    connectWorkspace: (...args) => ctx.uiWorkspace.connectWorkspace(...args), startSession: (...args) => ctx.uiWorkspace.startSession(...args) }

  function membership(id) {
    return workspaces.list.getSnapshot().items.find(workspace => workspace.sessionIds.includes(id))
  }

  async function awaitMembership(id, workspaceId) {
    if (membership(id)?.workspaceId === workspaceId) return
    await new Promise((resolve, reject) => {
      const finish = error => {
        clearTimeout(timer)
        stop()
        lifetime.signal.removeEventListener('abort', aborted)
        if (error) reject(error)
        else resolve()
      }
      const aborted = () => finish(Error('插件已关闭。'))
      const check = () => { if (membership(id)?.workspaceId === workspaceId) finish() }
      const stop = workspaces.list.subscribe(check)
      const timer = setTimeout(() => finish(Error('工作区已保存，DSH 尚未同步会话列表，请稍后再打开。')), 5000)
      lifetime.signal.addEventListener('abort', aborted, {once:true})
      if (lifetime.signal.aborted) aborted()
      else check()
    })
  }

  async function openNativeSession() {
    const id = displayed
    if (!id) return
    if (!membership(id)) {
      let workspaceId = employeeWorkspaces.get(id)
      if (!workspaceId) {
        // Preserve old topic IDs and their transcripts. The Host verifies both
        // the recorded preset and the absolute employee home before attaching.
        const preset = list.byId[id]?.agentPreset
        const roleId = roleForPreset(preset)
        if (!roleId) throw Error('当前话题的员工归属未确认。')
        const response = await fetcher('/luma-native/employee-workspace', {method:'POST', credentials:'same-origin', cache:'no-store',
          redirect:'error', headers:{'content-type':'application/json'}, body:JSON.stringify({sessionId:id,roleId}), signal:lifetime.signal})
        const envelope = await response.json()
        if (!response.ok || !envelope.ok || envelope.value?.sessionId !== id || !envelope.value.workspaceId)
          throw Error(envelope.error ?? '无法将原话题关联到员工工作区。')
        workspaceId = envelope.value.workspaceId
        employeeWorkspaces.set(id, workspaceId)
      }
      await awaitMembership(id, workspaceId)
    }
    if (disposed || displayed !== id) throw Error('当前话题已切换，请从当前员工的工作台重新打开。')
    ctx.uiWorkspace.openSession(id)
  }
  async function uploadSessionFile(id, item) {
    if (disposed || !retained.has(id)) throw Error('当前 DSH 会话已关闭，草稿已保留。')
    const blob = item.file ?? new Blob([attachmentBytes(item)], {type:item.mediaType})
    const result = await ctx.fileUpload.upload(id, blob, item.name, lifetime.signal)
    if (!result.ok) throw Error('DSH 文件上传失败：' + result.error.message)
    if (!result.value.receiptId) throw Error('DSH 未返回文件凭据，请重试。')
    return result.value.receiptId
  }
  return { sessions, workspaces, uploadSessionFile, api: { sessions: sessionApi, agentPresets: {
    async select({sessionId, agentPreset}) {
      const result = await ctx.remote.agentPresets.select(sessionId, agentPreset)
      return { result: result.ok ? {ok:true, value:{agentPreset:result.value}} : result }
    },
  } }, openNativeSession,
    dispose() { disposed = true; lifetime.abort(); for (const stop of stops) stop(); listeners.clear(); for (const record of retained.values()) record.release(); retained.clear() } }
}

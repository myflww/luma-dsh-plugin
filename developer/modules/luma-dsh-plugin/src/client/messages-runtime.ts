import { ADDRESS_GUIDANCE, CHAT_PACING, contactPersona, defaultContactProfile } from '../shared/contact-profile.ts'
import { PRIVATE_MEMORY_GUIDANCE } from '../shared/role-portrait.ts'
import type { SessionFile } from './chat-file-reader.ts'
import { checkAttachmentBatch, attachmentInfo, textFileBlock, validateChatAttachments, type AttachmentInfo, type ChatAttachment, type ImageType } from '../shared/chat-attachments.ts'
import type { ClientContext, SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import { OFFICE_EMPLOYEE_DEFINITIONS } from '../../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/office-harness/OfficeRelationships.ts'
import { OFFICE_CHARACTER_CARDS } from '../../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/office-harness/OfficeCharacterCards.ts'
import { getChibiAvatar } from './employee-avatar.ts'
import { agentRequest } from './agent-desk-api.ts'
import { DEFAULT_MESSAGE_PREFERENCES, MESSAGES_NAMESPACE, MESSAGE_ROLE_IDS, decodeMessageSettings, type MessagePreferences, type MessageSettings, type RoleProfile } from '../messages-settings.ts'
import type { OfficePageRuntime } from './office-runtime.ts'

const PREFIX = '[LUMA_CHARACTER_CONTEXT_V1]\n', END = '\n[/LUMA_CHARACTER_CONTEXT_V1]\n'
function referenceMemory(value: string) {
  if (!value) return {}
  // Older hosts may return plain notes. Keep them as historical material.
  try {
    const decoded:unknown=JSON.parse(value)
    if (decoded && typeof decoded==='object' && !Array.isArray(decoded)) return decoded
  } catch {}
  return {text:value}
}
export function characterPrompt(roleId: string, profile: RoleProfile, userName: string, body: string,
  options?: { id: string; memory: string; work: boolean; attachments?: AttachmentInfo[] }): string {
  return PREFIX + JSON.stringify({ roleId, ...contactPersona(profile), userName, addressGuidance:ADDRESS_GUIDANCE,
    memoryGuidance:PRIVATE_MEMORY_GUIDANCE,
    ...(options ? { journalId: options.id, requestKind:options.work?'task':'chat', referenceMemory: referenceMemory(options.memory) } : {}),
    ...(options?.attachments?.length ? { attachments:options.attachments, messageLength:body.length } : {}),
    mode: options?.work ? '用户已将下列工作单独交给你。按当前会话的工具权限完成任务，报告实际产出和未完成事项。记忆作为参考资料。'
      : CHAT_PACING + '角色对话。情节、动作和感受属于虚构表达；不把它们当作真实执行。除非用户明确要求执行任务，否则只进行自然对话。参考记忆中 conversationPreferences.current 是用户仍有效的相处习惯，优先于旧记录和默认称呼；withdrawn 中的习惯已撤回，勿照旧执行。' }) + END + body
}
export function visibleUserMessage(text: string): string {
  if (!text.startsWith(PREFIX)) return text
  const end = text.indexOf(END, PREFIX.length)
  if (end < 0) return text
  try { const context = JSON.parse(text.slice(PREFIX.length, end)); if (!MESSAGE_ROLE_IDS.includes(context.roleId)) return text } catch { return text }
  return text.slice(end + END.length)
}
export const MESSAGE_CHARACTERS = MESSAGE_ROLE_IDS.map(id => {
  const card = OFFICE_CHARACTER_CARDS[id].companionCard.data
  const avatar = getChibiAvatar(id)
  return { id, name: card.name, description: card.description, profile: defaultContactProfile(id),
    avatar: avatar.src, avatarViewport: avatar.viewport }
})
type SessionFace = NonNullable<ReturnType<ClientContext['sessions']['binding']>>['session']
export interface RoleMessage { id: string; role: 'user' | 'assistant' | 'notice'; text: string; time?: number; streaming?: boolean; attachments?: AttachmentInfo[] }
function attachmentMessage(text: string): {text: string; attachments?: AttachmentInfo[]} {
  const body = visibleUserMessage(text)
  if (body !== text) {
    const meta = JSON.parse(text.slice(PREFIX.length, text.indexOf(END)))
    if (Array.isArray(meta.attachments) && meta.attachments.length <= 4 && meta.attachments.every((a: AttachmentInfo) =>
      a && typeof a.name === 'string' && Number.isSafeInteger(a.bytes)) && Number.isSafeInteger(meta.messageLength) && meta.messageLength >= 0 && meta.messageLength <= body.length)
      return {text:body.slice(0, meta.messageLength), attachments:meta.attachments.map(attachmentInfo)}
  }
  return {text:body}
}
export interface MessagesSnapshot {
  preferences: MessagePreferences; profile: RoleProfile; roleId: string; sessionId?: SessionId; messages: readonly RoleMessage[]
  topics: readonly { id: SessionId; title: string }[]; running: boolean; pending: boolean; writable: boolean; loading: boolean
  archivedTopics?: readonly { id: SessionId; title:string }[]
  archivableTopics?: readonly SessionId[]
  canRestoreNative?:boolean
  hasMore: boolean; attention: boolean; problem?: string; employeeSkins?: Readonly<Record<string,string>>
  nativeFileUpload?: boolean
}
export function createMessagesRuntime(ctx: ClientContext, office: OfficePageRuntime, collection?: {
  subscribe(listener: () => void): () => void
  getSnapshot(): { unlockedEmployeeIds: readonly string[] }
}) {
  const scope = ctx.settingsScope.bind<MessageSettings>({ namespace: MESSAGES_NAMESPACE, decode: decodeMessageSettings })
  const api = ctx.get('connection').api
  const nativeWorkspaces=ctx.workspaces as typeof ctx.workspaces & {unarchiveSession?(id:SessionId):Promise<unknown>}
  const {uploadSessionFile} = ctx as ClientContext & { uploadSessionFile?(id: SessionId, item: ChatAttachment | SessionFile): Promise<string> }
  const listeners = new Set<() => void>()
  let disposed = false, busy = false, problem: string | undefined, optimistic: MessagePreferences | undefined
  let draftDirty = false
  let writeQueue: Promise<void> = Promise.resolve()
  const cancelWaiters = new Set<() => void>()
  const recording = new Map<string, number>()
  const memoryRetries = new Map<string, ReturnType<typeof setTimeout>>()
  const watching = new Map<string, () => void>()
  let bound: SessionFace | undefined, stopSession = () => {}, draftTimer: ReturnType<typeof setTimeout> | undefined
  let snapshot: MessagesSnapshot
  const isUnlocked = (id: string) => !collection || collection.getSnapshot().unlockedEmployeeIds.includes(id)
  const preferences = () => {
    const stored = optimistic ?? scope.getSnapshot().value?.preferences ?? DEFAULT_MESSAGE_PREFERENCES
    return isUnlocked(stored.selectedRole) ? stored : { ...stored, selectedRole: 'jingyuniang' }
  }
  function syncMemory(session: SessionFace, roleId: string, topic: SessionId) {
    if (disposed || !isUnlocked(roleId) || !scope.getSnapshot().writable || scope.getSnapshot().mode !== 'host') return
    const nodes = session.getSnapshot()
    if (nodes.running || nodes.partial || nodes.pending.length) return
    const preset = OFFICE_EMPLOYEE_DEFINITIONS[roleId as keyof typeof OFFICE_EMPLOYEE_DEFINITIONS].agentPresetId
    if (ctx.sessions.list.getSnapshot().byId[topic]?.agentPreset !== preset) return
    let pending: { roleId: string; topic: SessionId; id: string; user: string; assistant: string; privateChat:boolean } | undefined
    function commit() {
      if (!pending?.assistant.trim() || (recording.get(pending.id) ?? 0) > Date.now()) return
      const entry = pending
      recording.set(entry.id, Infinity)
      void agentRequest('record', entry, AbortSignal.timeout(15_000)).catch(() => {
        if (disposed || memoryRetries.has(entry.id)) return
        const timer = setTimeout(() => {
          memoryRetries.delete(entry.id)
          recording.delete(entry.id)
          syncMemory(session, roleId, topic)
        }, 15_000)
        memoryRetries.set(entry.id, timer)
      })
    }
    for (const node of nodes.nodes) {
      if (node.kind === 'user' || node.kind === 'steering') {
        commit(); pending = undefined
        const text = node.content.flatMap(part => part.type === 'text' ? [part.text] : []).join('\n')
        const split = text.indexOf(END)
        if (!text.startsWith(PREFIX) || split < 0) continue
        try {
          const meta = JSON.parse(text.slice(PREFIX.length, split))
          if (meta.roleId === roleId && typeof meta.journalId === 'string' && /^[a-f0-9-]{36}$/i.test(meta.journalId)) {
            const message = attachmentMessage(text)
            pending = { roleId, topic, id: meta.journalId, user: message.text || message.attachments?.map(a => a.name).join('、') || '', assistant: '', privateChat:meta.requestKind==='chat' }
          }
        } catch { /* An unrecognized native message has no employee memory record. */ }
      } else if (pending && node.kind === 'assistant' && !node.interrupted) {
        const reply = node.blocks.flatMap(block => block.kind === 'text' ? [block.text] : []).join('\n')
        if (reply.trim()) pending.assistant = reply
      } else if (node.kind === 'turn-error') pending = undefined
    }
    commit()
  }
  function refresh() {
    if (disposed) return
    const pref = preferences(), roleId = pref.selectedRole
    const character = MESSAGE_CHARACTERS.find(character => character.id === roleId)!
    const preset = OFFICE_EMPLOYEE_DEFINITIONS[roleId as keyof typeof OFFICE_EMPLOYEE_DEFINITIONS].agentPresetId
    const list = ctx.sessions.list.getSnapshot()
    const archived = ctx.workspaces.list?.getSnapshot().archivedSessionIds ?? []
    const roleTopics = Object.values(list.byId).filter(row => row.agentPreset === preset)
    const topicLabel = (row:typeof roleTopics[number]) => ({id:row.id,title:row.title || character.name + '的对话'})
    const topics = roleTopics.filter(row => !archived.includes(row.id)).map(topicLabel)
    const archivedTopics = roleTopics.filter(row => archived.includes(row.id)).map(topicLabel)
    const archivableTopics = typeof ctx.workspaces.archiveSession === 'function' ? roleTopics.filter(row =>
      !archived.includes(row.id) && !row.running && !row.pendingInteraction).map(row => row.id) : []
    const projected = office.getSnapshot().projection.employees.find(employee => employee.employeeId === roleId)?.sessionId
    const preferred = pref.activeTopics[roleId] as SessionId | undefined
    const sessionId = topics.find(topic => topic.id === preferred)?.id ?? topics.find(topic => topic.id === projected)?.id ?? topics[0]?.id
    const sessions = ctx.sessions as typeof ctx.sessions & { showTopic?(id?: SessionId): void }
    sessions.showTopic?.(sessionId)
    const next = sessionId ? ctx.sessions.binding(sessionId)?.session : undefined
    if (next !== bound) { stopSession(); bound = next; stopSession = bound?.subscribe(refresh) ?? (() => {}) }
    const conversation = bound?.getSnapshot()
    if (bound && sessionId && !conversation?.running) syncMemory(bound, roleId, sessionId)
    const messages: RoleMessage[] = []
    for (const node of conversation?.nodes ?? []) {
      if (node.kind === 'user' || node.kind === 'steering') messages.push({ id: String(node.seq), role: 'user', time: node.time,
        ...attachmentMessage(node.content.filter(part => part.type === 'text').map(part => 'text' in part ? part.text : '').join('\n')) })
      else if (node.kind === 'assistant') messages.push({ id: String(node.seq), role: 'assistant', time: node.time,
        text: node.blocks.filter(block => block.kind === 'text').map(block => 'text' in block ? block.text : '').join('\n') })
      else if (node.kind === 'turn-error') messages.push({ id: String(node.seq), role: 'notice', text: node.message, time: node.time })
    }
    const partial = conversation?.partial
    if (partial) {
      const text = partial.blocks.filter(block => block.kind === 'text').map(block => 'text' in block ? block.text : '').join('\n')
      if (text) messages.push({ id: 'stream', role: 'assistant', text, streaming: true })
    }
    const state = scope.getSnapshot()
    snapshot = { preferences: pref, profile: pref.profiles[roleId] ?? character.profile, roleId, ...(sessionId ? { sessionId } : {}), messages,
      topics, archivedTopics, archivableTopics, canRestoreNative:typeof nativeWorkspaces.unarchiveSession==='function', nativeFileUpload:!!uploadSessionFile, running: conversation?.running ?? false, pending: busy, writable: state.status === 'ready' && state.writable && state.mode === 'host',
      loading: state.status === 'loading' || conversation?.openState === 'loading', hasMore: conversation?.hasMore ?? false,
      attention: Boolean(conversation?.pending.length), employeeSkins: office.getSnapshot().presentation?.selection.employeeSkins ?? {}, ...(problem ? { problem } : {}) }
    for (const listener of listeners) listener()
  }
  async function save(next: MessagePreferences, confirmProfiles = false) {
    if (disposed) throw Error('插件已停用。')
    const state = scope.getSnapshot()
    if (state.status !== 'ready' || !state.writable || state.mode !== 'host') throw Error('当前连接不能保存角色设置，请在本机 DSH 中操作。')
    if (!decodeMessageSettings({ preferences: next })) throw Error('角色设置格式无效。')
    const previous = optimistic
    if (!confirmProfiles) { optimistic = next; refresh() }
    try {
      const pendingWrite = writeQueue.catch(() => {}).then(async () => { assertWritable(); await scope.set('preferences', next) })
      writeQueue = pendingWrite
      await pendingWrite
      if (optimistic === next || (confirmProfiles && optimistic === previous)) { optimistic = undefined; draftDirty = false }
      else if (confirmProfiles && optimistic) optimistic = { ...optimistic, profiles: next.profiles }
      problem = undefined
    }
    catch (error) { problem = '角色设置未保存：' + String(error); throw error }
    finally { refresh() }
  }
  function flushDraftSoon() {
    clearTimeout(draftTimer)
    if (disposed || !draftDirty) return
    draftTimer = setTimeout(() => {
      if (disposed) return
      if (busy) { flushDraftSoon(); return }
      void save(preferences()).catch(() => {})
    }, 400)
  }
  function assertWritable() {
    if (disposed) throw Error('插件已停用。')
    const state = scope.getSnapshot()
    if (state.status !== 'ready' || !state.writable || state.mode !== 'host') throw Error('当前连接为只读，未执行操作。请在本机 DSH 中操作。')
  }
  async function run<T>(operation: () => Promise<T>, write = true): Promise<T | undefined> {
    if (busy || disposed) return
    busy = true; problem = undefined; refresh()
    try { if (write) assertWritable(); return await operation() } catch (error) { problem = error instanceof Error ? error.message : String(error); return }
    finally { busy = false; refresh(); flushDraftSoon() }
  }
  async function waitListed(id: SessionId) {
    if (ctx.sessions.list.getSnapshot().byId[id]) return
    await new Promise<void>((resolve, reject) => {
      let done = false
      const finish = (error?: Error) => {
        if (done) return
        done = true; clearTimeout(timeout); stop(); cancelWaiters.delete(cancel)
        if (error) reject(error); else resolve()
      }
      const cancel = () => finish(Error('插件已停用。'))
      const timeout = setTimeout(() => finish(Error('新对话暂未同步，请稍后重试。')), 15000)
      const stop = ctx.sessions.list.subscribe(() => { if (ctx.sessions.list.getSnapshot().byId[id]) finish() })
      cancelWaiters.add(cancel)
    })
  }
  async function createTopic(roleId = preferences().selectedRole) {
    assertWritable()
    if (!isUnlocked(roleId)) throw Error('这位伙伴尚未加入。')
    const id = roleId as keyof typeof OFFICE_EMPLOYEE_DEFINITIONS
    const cwd = scope.getSnapshot().value?.homes?.[id]
    if (!cwd) throw Error('角色聊天目录尚未就绪，请确认插件 Host 已启用。')
    const agentPreset = OFFICE_EMPLOYEE_DEFINITIONS[id].agentPresetId
    const response = await api.sessions.create({ cwd, agentPreset })
    if (!response.result.ok) throw Error(response.result.error.message)
    assertWritable()
    if (response.result.value.agentPreset !== undefined && response.result.value.agentPreset !== agentPreset) throw Error('Host 返回了不同角色的预设，未打开该对话。')
    const sessionId = response.result.value.sessionId
    await waitListed(sessionId)
    assertWritable()
    const listedPreset = ctx.sessions.list.getSnapshot().byId[sessionId]?.agentPreset
    if (listedPreset !== undefined && listedPreset !== agentPreset) throw Error('新对话的角色归属不一致，未打开该对话。')
    const confirmedPreset = listedPreset ?? response.result.value.agentPreset
    if (!confirmedPreset) throw Error('新对话尚未确认角色归属，未打开该对话。')
    ctx.sessions.noteAgentPreset(sessionId, confirmedPreset)
    await office.linkSession(id, sessionId)
    assertWritable()
    ctx.sessions.open(sessionId)
    await save({ ...preferences(), activeTopics: { ...preferences().activeTopics, [id]: sessionId } })
    return sessionId
  }
  refresh()
  const stopEntitlements = collection?.subscribe(refresh)
  const stopScope = scope.subscribe(refresh), stopList = ctx.sessions.list.subscribe(refresh), stopOffice = office.subscribe(refresh)
  const stopWorkspaces = ctx.workspaces.list?.subscribe(refresh) ?? (() => {})
  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener) } },
    selectRole(id: string, fromOffice = false): boolean {
      if (disposed || !isUnlocked(id) || !MESSAGE_ROLE_IDS.includes(id as never) || busy) return false
      const current = ctx.sessions.list.getSnapshot().current
      const preset = OFFICE_EMPLOYEE_DEFINITIONS[id as keyof typeof OFFICE_EMPLOYEE_DEFINITIONS].agentPresetId
      const activeTopics = fromOffice && current && ctx.sessions.list.getSnapshot().byId[current]?.agentPreset === preset
        ? { ...preferences().activeTopics, [id]: current } : preferences().activeTopics
      void run(() => save({ ...preferences(), selectedRole: id, activeTopics }))
      return true
    },
    setUserName(name: string) { return run(() => save({ ...preferences(), userName: name })) },
    setContactAlias(id: string, alias: string, previousAlias: string) {
      return run(async () => {
        if (!isUnlocked(id)) throw Error('这位伙伴尚未入职。')
        const current = preferences()
        const value = alias.trim()
        if ((current.contactAliases?.[id] ?? '') === value) return true
        if ((current.contactAliases?.[id] ?? '') !== previousAlias) throw Error('联系人备注已更新，请重新打开后编辑。')
        const contactAliases = { ...current.contactAliases }
        if (value) contactAliases[id] = value
        else delete contactAliases[id]
        const previous = optimistic
        try {
          await save({ ...current, contactAliases })
        } catch (error) {
          if (optimistic?.contactAliases === contactAliases) {
            optimistic = optimistic.drafts === current.drafts ? previous
              : { ...current, drafts: optimistic.drafts }
          }
          throw error
        }
        return true
      })
    },
    forgetReplyMarks(removed: { jobs?: string[]; topics?: string[]; letters?: string[] }) {
      return run(async () => {
        const current=preferences()
        if (!current.reactions) return true
        const prefixes=new Set([
          ...(removed.jobs ?? []).map(id=>'reply/job/'+encodeURIComponent(id)),
          ...(removed.topics ?? []).map(id=>'reply/native/'+encodeURIComponent(id)),
          ...(removed.letters ?? []).map(id=>'reply/letter/'+encodeURIComponent(id)),
        ])
        const reactions=Object.fromEntries(Object.entries(current.reactions).filter(([key])=>!prefixes.has(key.split('/').slice(0,3).join('/'))))
        if (Object.keys(reactions).length!==Object.keys(current.reactions).length) await save({...current,reactions})
        return true
      })
    },
    setReaction(key: string, rating: 'up' | 'down') {
      return run(async () => {
        const current = preferences()
        const reactions = { ...current.reactions }
        if (reactions[key] === rating) delete reactions[key]
        else reactions[key] = rating
        await save({ ...current, reactions })
        return true
      })
    },
    setDisplay(display: 'bubbles' | 'novel') { return run(() => save({ ...preferences(), display })) },
    saveProfile(profile: RoleProfile) { return run(async () => { await save({ ...preferences(), profiles: { ...preferences().profiles, [preferences().selectedRole]: profile } }, true); return true }) },
    resetProfile() { const profiles = { ...preferences().profiles }; delete profiles[preferences().selectedRole]; return run(() => save({ ...preferences(), profiles }, true)) },
    setDraft(text: string) {
      if (disposed) return
      optimistic = { ...preferences(), drafts: { ...preferences().drafts, [preferences().selectedRole]: text.slice(0, 32000) } }; refresh()
      draftDirty = true; flushDraftSoon()
    },
    newTopic() { return run(createTopic) },
    selectTopic(id: SessionId) { return run(async () => {
      if (!snapshot.topics.some(topic => topic.id === id)) throw Error('该对话不属于当前角色。')
      const roleId = snapshot.roleId
      await office.linkSession(roleId, id); assertWritable(); ctx.sessions.open(id)
      await save({ ...preferences(), activeTopics: { ...preferences().activeTopics, [roleId]: id } })
      return true
    }) },
    restoreTopic(sessionId:SessionId,roleId:string) {return run(async()=>{
      if(!nativeWorkspaces.unarchiveSession || !isUnlocked(roleId) || snapshot.roleId!==roleId ||
        !snapshot.archivedTopics?.some(item=>item.id===sessionId))throw Error('这条原生会话当前无法恢复。')
      await nativeWorkspaces.unarchiveSession(sessionId)
      return true
    })},
    send(mode: 'chat' | 'task' = 'chat', input?: readonly (ChatAttachment | SessionFile)[]) { return run(async () => {
      const submittedDraft = preferences().drafts[snapshot.roleId] ?? ''
      const body = submittedDraft.trim()
      const items = input ?? []
      checkAttachmentBatch(items)
      const attachments = items.map(item => {
        if ('file' in item) {
          if (!uploadSessionFile) throw Error('当前 DSH 会话缺少文件上传服务。')
          return item
        }
        return validateChatAttachments([item], !!uploadSessionFile)[0]!
      })
      if (!uploadSessionFile && attachments.some(a => a.mediaType === 'application/pdf')) throw Error('当前 DSH 会话缺少文件上传服务。PDF 请使用支持 PDF 的独立模型。')
      if (!body && !attachments.length) return
      const roleId = snapshot.roleId, profile = snapshot.profile, userName = preferences().userName
      const selectedSessionId = snapshot.sessionId
      await save(preferences())
      assertWritable()
      const id = selectedSessionId ?? await createTopic(roleId)
      assertWritable()
      const preset = OFFICE_EMPLOYEE_DEFINITIONS[roleId as keyof typeof OFFICE_EMPLOYEE_DEFINITIONS].agentPresetId
      if (!isUnlocked(roleId) || ctx.sessions.list.getSnapshot().byId[id]?.agentPreset !== preset) throw Error('会话角色归属发生变化，草稿已保留。')
      const session = ctx.sessions.binding(id)?.session
      if (!session) throw Error('对话尚未加载，请稍后再试。')
      if (session.getSnapshot().pending.length) throw Error('请先在原生会话中处理待确认事项。')
      const journalId = crypto.randomUUID()
      const memory = typeof window === 'undefined' ? '' : (await agentRequest<{ context: string }>('recall',
        { roleId, query: body, topic: id, journalId, privateChat:mode==='chat' }, AbortSignal.timeout(4000)).catch(() => ({ context: '' }))).context
      assertWritable()
      if (!isUnlocked(roleId) || ctx.sessions.list.getSnapshot().byId[id]?.agentPreset !== preset) throw Error('角色归属已变化，草稿已保留。')
      const prompt = characterPrompt(roleId, profile, userName, body, { id: journalId, memory, work: mode === 'task', attachments:attachments.map(attachmentInfo) })
      const parts: Parameters<typeof session.prompt>[0] = [{ type: 'text', text: prompt }]
      for (const item of attachments) {
        if ('data' in item && item.mediaType.startsWith('image/')) {
          parts.push({type:'image', name:item.name, mediaType:item.mediaType as ImageType, data:item.data})
          continue
        }
        if (uploadSessionFile) {
          const receiptId = await uploadSessionFile(id, item)
          parts.push({type:'file', receiptId} as typeof parts[number])
        }
        if ('file' in item) {
          if (item.inlineText !== undefined) parts.push({type:'text', text:'附件「' + item.name + '」\n' + item.inlineText})
        } else if (item.mediaType === 'text/plain') parts.push({type:'text', text:textFileBlock(item)})
      }
      assertWritable()
      if (!isUnlocked(roleId) || ctx.sessions.list.getSnapshot().byId[id]?.agentPreset !== preset) throw Error('会话角色归属发生变化，草稿已保留。')
      const result = await session.prompt(parts, 'queue')
      if (!result.ok) throw Error(result.error.message)
      if (!disposed && !watching.has(id)) {
        // Continue listening after the user switches to another employee.
        watching.set(id, session.subscribe(() => syncMemory(session, roleId, id)))
        syncMemory(session, roleId, id)
      }
      const latest = preferences()
      if (latest.drafts[roleId] === submittedDraft) await save({ ...latest, drafts: { ...latest.drafts, [roleId]: '' } }).catch(() => {})
      return true
    }) },
    stop() { return run(async () => { const result = await bound?.cancel(); if (result && !result.ok) throw Error(result.error.message) }) },
    loadOlder() { return run(async () => { await bound?.loadOlder() }, false) },
    archiveTopic(sessionId = snapshot.sessionId, roleId = snapshot.roleId) { return run(async () => {
      if (!sessionId || roleId !== snapshot.roleId || !isUnlocked(roleId) || !snapshot.topics.some(item=>item.id===sessionId))
        throw Error('角色或原生会话已变化，请重新选择记录。')
      const nativeState=ctx.sessions.binding(sessionId)?.session.getSnapshot()
      if (!snapshot.archivableTopics?.includes(sessionId) || nativeState?.running || nativeState?.pending.length)
        throw Error('当前原生会话无法归档，请等待生成或审批结束后重试。')
      await ctx.workspaces.archiveSession(sessionId)
      if (preferences().activeTopics[roleId]===sessionId) {
        const activeTopics = { ...preferences().activeTopics }; delete activeTopics[roleId]
        await save({ ...preferences(), activeTopics })
      }
      return true
    }) },
    exportTranscript() { return { schema: 'LumaCharacterTranscriptV1', roleId: snapshot.roleId, profile: snapshot.profile,
      sessionId: snapshot.sessionId, messages: snapshot.messages.filter(message => !message.streaming), exportedAt: new Date().toISOString() } },
    dispose() { if (disposed) return; disposed = true; clearTimeout(draftTimer); for (const timer of memoryRetries.values()) clearTimeout(timer); memoryRetries.clear(); for (const cancel of [...cancelWaiters]) cancel(); for (const stop of watching.values()) stop(); watching.clear(); stopEntitlements?.(); stopSession(); stopScope(); stopList(); stopOffice(); stopWorkspaces(); listeners.clear() },
  }
}
export type MessagesRuntime = ReturnType<typeof createMessagesRuntime>

// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ClientContext, SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import { Session } from '../../../.luma-cache/deepseek-harness-baseline/141eb6fef83422698aef7a981029e843e8161534/packages/client/runtime/src/client/sessions/session.ts'
import { messageDefinition } from '../../../.luma-cache/deepseek-harness-baseline/141eb6fef83422698aef7a981029e843e8161534/packages/client/ui-conversation/src/client/conversation-nodes/message.ts'
import { assistantDefinition } from '../../../.luma-cache/deepseek-harness-baseline/141eb6fef83422698aef7a981029e843e8161534/packages/client/ui-conversation/src/client/conversation-nodes/assistant.ts'
import { turnErrorDefinition } from '../../../.luma-cache/deepseek-harness-baseline/141eb6fef83422698aef7a981029e843e8161534/packages/client/ui-conversation/src/client/conversation-nodes/turn-error.ts'
import { chatViewDefinition } from '../../../.luma-cache/deepseek-harness-baseline/141eb6fef83422698aef7a981029e843e8161534/packages/client/ui-conversation/src/client/conversation-nodes/chat-snapshot-builder.ts'
import { ev, plainTurn } from '../../../.luma-cache/deepseek-harness-baseline/141eb6fef83422698aef7a981029e843e8161534/packages/client/runtime/tests/event-script.client.ts'
import { createMessagesRuntime, characterPrompt, visibleUserMessage, MESSAGE_CHARACTERS } from '../src/client/messages-runtime.ts'
import { DEFAULT_MESSAGE_PREFERENCES, MESSAGE_ROLE_IDS, MESSAGES_NAMESPACE, type MessagePreferences, type MessageSettings } from '../src/messages-settings.ts'
import type { OfficePageRuntime } from '../src/client/office-runtime.ts'
import { OFFICE_EMPLOYEE_DEFINITIONS } from '../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/office-harness/OfficeRelationships.ts'

function feed<T>(initial: T) {
  let value = initial
  const listeners = new Set<() => void>()
  return { getSnapshot: () => value, subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } },
    set(next: T) { value = next; for (const listener of [...listeners]) listener() }, get subscriptions() { return listeners.size } }
}
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(accept => { resolve = accept }); return { promise, resolve }
}
const ok = <T,>(value: T) => ({ rpcId: 'fixture-rpc' as never, result: { ok: true as const, value } })
const rejected = (message: string) => ({ rpcId: 'fixture-rpc' as never, result: { ok: false as const, error: { code: 'fixture-error', message } } })
const cleanups: Array<() => void> = []
afterEach(() => { while (cleanups.length) cleanups.pop()!(); vi.useRealTimers(); vi.restoreAllMocks() })

async function fixture(options: { writable?: boolean; seed?: boolean; preferences?: Partial<MessagePreferences> } = {}) {
  const preference = { ...structuredClone(DEFAULT_MESSAGE_PREFERENCES), selectedRole: 'shan', ...options.preferences }
  const settings = feed({ status: 'ready', mode: 'host', writable: options.writable ?? true, revision: 1,
    value: { homes: Object.fromEntries(MESSAGE_ROLE_IDS.map(id => [id, `C:/isolated-role-homes/${id}`])), preferences: preference } as MessageSettings })
  const set = vi.fn(async (field: string, value: unknown) => {
    const current = settings.getSnapshot(); settings.set({ ...current, revision: current.revision + 1, value: { ...current.value, [field]: value } })
  })
  const list = feed({ ids: [] as SessionId[], byId: {} as Record<string, any>, current: undefined as SessionId | undefined,
    phase: 'ready', subagentsByParent: {}, jobsBySession: {}, currentAddress: undefined })
  const officeState = feed({ projection: { employees: MESSAGE_ROLE_IDS.map(employeeId => ({ employeeId, sessionId: undefined as SessionId | undefined })) } })
  const prompt = vi.fn(async (_payload: unknown) => ok({ accepted: true as const }))
  const cancel = vi.fn(async (_payload: unknown) => ok({ accepted: true as const }))
  const create = vi.fn(async (_payload: unknown) => ok({ sessionId: 'created' as SessionId, agentPreset: 'luma-duanmu-yan' }))
  const history = vi.fn(async (_payload: unknown) => ok({ events: [] as any[], hasMore: false }))
  const api = { sessions: { prompt, cancel, create, history } }
  const sessions = new Map<string, Session>()
  const sessionHistories = new Map<string, ReturnType<typeof vi.fn>>()
  async function add(id: string, roleId: keyof typeof OFFICE_EMPLOYEE_DEFINITIONS, events: any[] = [], hasMore = false, withPreset = true) {
    const sessionId = id as SessionId
    // These are the production Session and production Chat Definitions, so
    // message/partial/error tests use real immutable ConversationSnapshots.
    const sessionHistory = vi.fn(async () => ok({ events: [] as any[], hasMore: false }))
      .mockResolvedValueOnce(ok({ events: events.map(event => ({ event })), hasMore }))
    sessionHistories.set(id, sessionHistory)
    const sessionApi = { ...api, sessions: { ...api.sessions, history: sessionHistory } }
    const session = new Session(sessionId, sessionApi as never, { commands: {} } as never, { conversation: {
      events: { entries: () => [messageDefinition, assistantDefinition, turnErrorDefinition], fallbackEntry: () => undefined },
      views: { entries: () => [chatViewDefinition] },
    } as never })
    sessions.set(id, session); await session.open()
    const current = list.getSnapshot()
    list.set({ ...current, ids: [...current.ids.filter(value => value !== sessionId), sessionId], byId: { ...current.byId,
      [id]: { id: sessionId, ...(withPreset ? { agentPreset: OFFICE_EMPLOYEE_DEFINITIONS[roleId].agentPresetId } : {}), title: `${roleId} title`,
        displayTitle: `${roleId} display title`, running: false, blank: !events.length, updatedAt: 1 } } })
    return session
  }
  const open = vi.fn(), noteAgentPreset = vi.fn(), archiveSession = vi.fn(async () => {})
  const linkSession = vi.fn(async (roleId: string, sessionId: SessionId) => {
    const state = officeState.getSnapshot(); officeState.set({ ...state, projection: { employees: state.projection.employees.map(employee =>
      employee.employeeId === roleId ? { ...employee, sessionId } : employee) } })
  })
  const ctx = { get: () => ({ api }), settingsScope: { bind: vi.fn(({ namespace }: { namespace: string }) => {
    expect(namespace).toBe(MESSAGES_NAMESPACE); return { ...settings, set }
  }) }, sessions: { list, binding: (id: SessionId) => sessions.has(id) ? { session: sessions.get(id) } : undefined,
    open, noteAgentPreset }, workspaces: { archiveSession } } as unknown as ClientContext
  if (options.seed !== false) await add('shan-own', 'shan')
  const runtime = createMessagesRuntime(ctx, { ...officeState, linkSession } as unknown as OfficePageRuntime)
  cleanups.push(() => runtime.dispose())
  return { runtime, add, sessions, sessionHistories, settings, set, list, officeState, prompt, cancel, create, history, open, noteAgentPreset, linkSession, archiveSession }
}
async function flush() { for (let i = 0; i < 8; i++) await Promise.resolve() }

describe('role messages use actual DSH sessions', () => {
  it('saves an accepted native employee turn against its original role and topic after switching staff', async () => {
    const f = await fixture({ preferences: { drafts: { shan: '复核设备清单' } } })
    const recording = vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ ok: true, value: { saved: true } }))
    await f.add('bai-own', 'bai-shuangming')
    await f.runtime.send('task')
    const prompt = (f.prompt.mock.calls[0]![0] as { content: { text: string }[] }).content[0]!.text
    expect(prompt).toContain('用户已将下列工作单独交给你')
    expect(f.runtime.selectRole('bai-shuangming')).toBe(true)
    await flush()
    const session = f.sessions.get('shan-own')!
    for (const event of plainTurn(10, 1, prompt, '设备清单已完成')) {
      session.handleMuxEnvelope('mux' as never, { type: 'session/event', sessionId: 'shan-own' as SessionId, event })
    }
    await flush()
    const records = recording.mock.calls.filter(([url]) => url === '/luma-agents/record')
    expect(records).toHaveLength(1)
    expect(JSON.parse(String(records[0]![1]!.body))).toMatchObject({
      roleId: 'shan', topic: 'shan-own', user: '复核设备清单', assistant: '设备清单已完成',
    })
  })
  it('retries a failed ordinary DSH reply journal after leaving the employee without adding another user turn', async () => {
    const f = await fixture({ preferences:{drafts:{shan:'晚安'}} })
    vi.useFakeTimers()
    const recorded: string[] = []
    vi.spyOn(globalThis,'fetch').mockImplementation(async (url, options) => {
      if (url === '/luma-agents/record') {
        recorded.push(String(options?.body))
        if (recorded.length === 1) throw Error('offline')
      }
      return Response.json({ok:true,value:{context:'',saved:true}})
    })
    await f.runtime.send()
    const body = (f.prompt.mock.calls[0]![0] as {content:{text:string}[]}).content[0]!.text
    await f.add('bai-own','bai-shuangming')
    f.runtime.selectRole('bai-shuangming')
    await flush()
    for (const event of plainTurn(20, 1, body, '明天见！')) f.sessions.get('shan-own')!.handleMuxEnvelope('mux' as never,{ type:'session/event',sessionId:'shan-own' as SessionId,event })
    await flush()
    expect(recorded).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(15001)
    expect(recorded).toEqual([recorded[0],recorded[0]])
    expect(JSON.parse(recorded[1]!)).toMatchObject({user:'晚安',assistant:'明天见！',roleId:'shan',topic:'shan-own'})
    expect(f.prompt.mock.calls).toHaveLength(1)
  })
  it('rejects an Office role switch while a prompt is pending without changing its role or topic, then accepts a retry', async () => {
    const f = await fixture({ preferences: { drafts: { shan: '仍然发送给端木嫣' }, activeTopics: { shan: 'shan-own' } } })
    await f.add('bai-own', 'bai-shuangming')
    const gate = deferred<ReturnType<typeof ok<{ accepted: true }>>>()
    f.prompt.mockImplementationOnce(() => gate.promise)
    const sending = f.runtime.send(); await flush()
    expect(f.runtime.getSnapshot().pending).toBe(true)
    f.list.set({ ...f.list.getSnapshot(), current: 'bai-own' as SessionId })

    expect(f.runtime.selectRole('bai-shuangming', true)).toBe(false)
    expect(f.runtime.getSnapshot()).toMatchObject({ roleId: 'shan', sessionId: 'shan-own' })
    expect(f.runtime.getSnapshot().preferences.activeTopics).toEqual({ shan: 'shan-own' })
    expect((f.prompt.mock.calls[0]![0] as any).sessionId).toBe('shan-own')

    gate.resolve(ok({ accepted: true })); await sending
    expect(f.runtime.selectRole('bai-shuangming', true)).toBe(true)
    await flush()
    expect(f.runtime.getSnapshot()).toMatchObject({ roleId: 'bai-shuangming', sessionId: 'bai-own' })
    expect(f.settings.getSnapshot().value.preferences?.activeTopics).toEqual({ shan: 'shan-own', 'bai-shuangming': 'bai-own' })
  })

  it('rejects invalid and disposed role switches before writing preferences', async () => {
    const f = await fixture()
    expect(f.runtime.selectRole('not-a-role', true)).toBe(false)
    f.runtime.dispose()
    expect(f.runtime.selectRole('lu-mi', true)).toBe(false)
    await flush()
    expect(f.set).not.toHaveBeenCalled()
    expect(f.runtime.getSnapshot().roleId).toBe('shan')
  })

  it('opens the exact Office report topic instead of a previously saved different topic', async () => {
    const f = await fixture({ preferences: { activeTopics: { shan: 'shan-own' } } })
    await f.add('older-report', 'shan')
    f.list.set({ ...f.list.getSnapshot(), current: 'older-report' as SessionId })
    f.runtime.selectRole('shan', true); await flush()
    expect(f.runtime.getSnapshot().sessionId).toBe('older-report')
    expect(f.settings.getSnapshot().value.preferences?.activeTopics.shan).toBe('older-report')
    await f.add('other-role', 'bai-shuangming')
    f.list.set({ ...f.list.getSnapshot(), current: 'other-role' as SessionId })
    f.runtime.selectRole('shan', true); await flush()
    expect(f.runtime.getSnapshot().sessionId).toBe('older-report')
  })
  it('keeps role ownership across saved topic, office linkage and explicit selection', async () => {
    const f = await fixture({ preferences: { activeTopics: { shan: 'bai-foreign' } } })
    await f.add('bai-foreign', 'bai-shuangming')
    expect(f.runtime.getSnapshot().sessionId).toBe('shan-own')
    expect(f.runtime.getSnapshot().topics).toEqual([{ id: 'shan-own', title: 'shan title' }])
    await f.runtime.selectTopic('bai-foreign' as SessionId)
    expect(f.runtime.getSnapshot().problem).toContain('不属于')
    expect(f.linkSession).not.toHaveBeenCalled(); expect(f.open).not.toHaveBeenCalled()
    await f.runtime.selectRole('bai-shuangming'); await flush()
    expect(f.runtime.getSnapshot().sessionId).toBe('bai-foreign')
    await f.runtime.selectTopic('bai-foreign' as SessionId)
    expect(f.linkSession).toHaveBeenCalledExactlyOnceWith('bai-shuangming', 'bai-foreign')
  })

  it('creates using the current role home/preset, waits for the list, then links and opens the real session', async () => {
    const f = await fixture({ seed: false })
    const pending = f.runtime.newTopic(); await flush()
    expect(f.create).toHaveBeenCalledExactlyOnceWith({ cwd: 'C:/isolated-role-homes/shan', agentPreset: 'luma-duanmu-yan' })
    expect(f.linkSession).not.toHaveBeenCalled(); expect(f.open).not.toHaveBeenCalled()
    expect(f.runtime.getSnapshot().pending).toBe(true)
    await f.add('created', 'shan'); await pending
    expect(f.linkSession).toHaveBeenCalledExactlyOnceWith('shan', 'created')
    expect(f.open).toHaveBeenCalledExactlyOnceWith('created')
    expect(f.settings.getSnapshot().value.preferences!.activeTopics.shan).toBe('created')
    expect(f.prompt).not.toHaveBeenCalled()
  })

  it('rejects a creation response or listed row owned by another role without rewriting its preset', async () => {
    const f = await fixture({ seed: false })
    f.create.mockImplementationOnce(async () => ok({ sessionId: 'foreign-created' as SessionId, agentPreset: 'luma-grok' }))
    await f.add('foreign-created', 'grok')
    await f.runtime.newTopic()
    expect(f.runtime.getSnapshot().problem).toBeTruthy()
    expect(f.noteAgentPreset).not.toHaveBeenCalled(); expect(f.linkSession).not.toHaveBeenCalled(); expect(f.open).not.toHaveBeenCalled()

    const pending = f.runtime.newTopic(); await flush(); await f.add('created', 'gemini'); await pending
    expect(f.noteAgentPreset).not.toHaveBeenCalled(); expect(f.linkSession).not.toHaveBeenCalled(); expect(f.open).not.toHaveBeenCalled()
  })

  it('requires role evidence from either the creation response or listed summary before annotating a session', async () => {
    const f = await fixture({ seed: false })
    f.create.mockImplementationOnce(async () => ok({ sessionId: 'created' as SessionId }) as never)
    const creating = f.runtime.newTopic(); await flush()
    await f.add('created', 'shan', [], false, false); await creating
    expect(f.runtime.getSnapshot().problem).toBeTruthy()
    expect(f.noteAgentPreset).not.toHaveBeenCalled(); expect(f.linkSession).not.toHaveBeenCalled(); expect(f.open).not.toHaveBeenCalled()
  })

  it('retains the draft on transport rejection and submits character context through Session.prompt', async () => {
    const f = await fixture({ preferences: { drafts: { shan: '保留这条消息' }, userName: '读者' } })
    f.prompt.mockImplementationOnce(async () => rejected('model unavailable') as never)
    await f.runtime.send()
    expect(f.runtime.getSnapshot().problem).toBe('model unavailable')
    expect(f.runtime.getSnapshot().preferences.drafts.shan).toBe('保留这条消息')
    expect(f.prompt).toHaveBeenCalledTimes(1)
    const payload = f.prompt.mock.calls[0]![0] as any
    expect(payload.sessionId).toBe('shan-own'); expect(payload.mode).toBe('queue')
    expect(visibleUserMessage(payload.content[0].text)).toBe('保留这条消息')
    expect(payload.content[0].text).toContain('"roleId":"shan"'); expect(payload.content[0].text).toContain('"userName":"读者"')
    // The send path first persists the outgoing draft for reload recovery.
    // A rejected RPC must preserve it and must not append a fake user row.
    expect(f.set).toHaveBeenCalled()
    for (const [, saved] of f.set.mock.calls) expect((saved as MessagePreferences).drafts.shan).toBe('保留这条消息')
    expect(f.settings.getSnapshot().value.preferences!.drafts.shan).toBe('保留这条消息')
    expect(f.runtime.getSnapshot().messages).toEqual([])
    expect(f.sessions.get('shan-own')!.getSnapshot().nodes).toEqual([])
  })

  it.each([true, false])('keeps send identity stable across an external role update during draft persistence (existing session=%s)', async seed => {
    const f = await fixture({ seed, preferences: { drafts: { shan: '只发给端木嫣' } } })
    await f.add('bai-own', 'bai-shuangming')
    f.set.mockImplementationOnce(async (_field, saved) => {
      const state = f.settings.getSnapshot()
      // A second client may publish a newer role selection before the first
      // settings write's response reaches this runtime.
      f.settings.set({ ...state, revision: state.revision + 2,
        value: { ...state.value, preferences: { ...(saved as MessagePreferences), selectedRole: 'bai-shuangming' } } })
    })
    const sending = f.runtime.send(); await flush()
    if (!seed) await f.add('created', 'shan')
    await sending
    if (!seed) expect(f.create).toHaveBeenCalledExactlyOnceWith({ cwd: 'C:/isolated-role-homes/shan', agentPreset: 'luma-duanmu-yan' })
    expect(f.prompt).toHaveBeenCalledTimes(1)
    for (const [payload] of f.prompt.mock.calls) {
      expect((payload as any).sessionId).toBe(seed ? 'shan-own' : 'created')
      expect((payload as any).content[0].text).toContain('"roleId":"shan"')
    }
  })

  it('preserves newly edited text while a successful earlier prompt is in flight', async () => {
    const f = await fixture({ preferences: { drafts: { shan: '第一条' } } })
    const gate = deferred<ReturnType<typeof ok<{ accepted: true }>>>()
    f.prompt.mockImplementationOnce(() => gate.promise)
    const sending = f.runtime.send(); await flush(); f.runtime.setDraft('正在写第二条')
    gate.resolve(ok({ accepted: true })); await sending
    expect(f.runtime.getSnapshot().preferences.drafts.shan).toBe('正在写第二条')
  })

  it('persists a new draft whose debounce elapsed while a prompt was pending', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const f = await fixture({ preferences: { drafts: { shan: '第一条' } } })
    const gate = deferred<ReturnType<typeof ok<{ accepted: true }>>>()
    f.prompt.mockImplementationOnce(() => gate.promise)
    const sending = f.runtime.send(); await flush()
    const alreadySaved = f.set.mock.calls.length
    expect(alreadySaved).toBeGreaterThan(0)
    f.runtime.setDraft('下一条草稿')
    await vi.advanceTimersByTimeAsync(500)
    expect(f.set).toHaveBeenCalledTimes(alreadySaved)
    expect(f.settings.getSnapshot().value.preferences!.drafts.shan).toBe('第一条')
    gate.resolve(ok({ accepted: true })); await sending
    await vi.advanceTimersByTimeAsync(1000)
    expect(f.settings.getSnapshot().value.preferences!.drafts.shan).toBe('下一条草稿')
  })

  it('projects durable history, current chunks and terminal failures from production ConversationSnapshots', async () => {
    const f = await fixture({ seed: false })
    const context = characterPrompt('shan', MESSAGE_CHARACTERS[0]!.profile, '你', '你好')
    const session = await f.add('history', 'shan', plainTurn(1, 1, context, '你好，今天想聊什么？'))
    await flush()
    expect(f.runtime.getSnapshot().messages.map(message => [message.role, message.text])).toEqual([
      ['user', '你好'], ['assistant', '你好，今天想聊什么？'],
    ])
    const push = (event: any) => session.handleMuxEnvelope('mux' as never, { type: 'session/event', sessionId: 'history' as SessionId, event })
    for (const event of [ev.turnStart(7, 2), ev.stepStart(8, 2), ev.chunkStart(9, 2), ev.chunkText(10, 2, '正在说的话')]) push(event)
    await flush()
    expect(f.runtime.getSnapshot().messages.at(-1)).toMatchObject({ text: '正在说的话', streaming: true })
    expect(f.runtime.exportTranscript().messages.some(message => message.streaming)).toBe(false)
    push({ seq: 11, time: 1700000000011, type: 'turn/end', data: { turn: 2,
      reason: { kind: 'error', error: { code: 'PROVIDER_ERROR', message: '模型服务暂不可用' } } } })
    await flush()
    expect(f.runtime.getSnapshot().messages.some(message => message.role === 'notice' && message.text.includes('模型服务暂不可用'))).toBe(true)
    expect(f.runtime.exportTranscript().messages.every(message => !message.streaming)).toBe(true)
  })

  it.each(['newTopic', 'send', 'selectTopic', 'archiveTopic'] as const)('rejects %s before side effects when Host settings are read-only', async operation => {
    const f = await fixture({ writable: false, preferences: { drafts: { shan: '不能发送' } } })
    await (operation === 'selectTopic' ? f.runtime.selectTopic('shan-own' as SessionId) : f.runtime[operation]())
    expect(f.runtime.getSnapshot().writable).toBe(false)
    expect(f.runtime.getSnapshot().problem).toBeTruthy()
    expect(f.create).not.toHaveBeenCalled(); expect(f.prompt).not.toHaveBeenCalled(); expect(f.linkSession).not.toHaveBeenCalled()
    expect(f.open).not.toHaveBeenCalled(); expect(f.archiveSession).not.toHaveBeenCalled(); expect(f.set).not.toHaveBeenCalled()
  })

  it('still reads an older history page from a read-only Host connection', async () => {
    const f = await fixture({ writable: false, seed: false })
    await f.add('history-page', 'shan', plainTurn(21, 4, '可以阅读历史', '可以'), true); await flush()
    expect(f.runtime.getSnapshot().hasMore).toBe(true)
    await f.runtime.loadOlder(); await flush()
    expect(f.sessionHistories.get('history-page')).toHaveBeenCalledTimes(2)
    expect(f.runtime.getSnapshot().hasMore).toBe(false)
    expect(f.runtime.getSnapshot().problem).toBeUndefined()
    expect(f.set).not.toHaveBeenCalled()
  })

  it('releases a pending list wait on disposal and performs no late link/open/settings write', async () => {
    const f = await fixture({ seed: false })
    const creating = f.runtime.newTopic(); await flush()
    expect(f.create).toHaveBeenCalledTimes(1)
    f.runtime.dispose()
    const remainingSubscriptions = f.list.subscriptions
    await f.add('created', 'shan'); await creating
    expect(remainingSubscriptions).toBe(0)
    expect(f.linkSession).not.toHaveBeenCalled(); expect(f.open).not.toHaveBeenCalled(); expect(f.set).not.toHaveBeenCalled()
    expect(f.settings.subscriptions).toBe(0); expect(f.officeState.subscriptions).toBe(0)
  })

  it('drops a create response arriving after disposal and cancels an unsaved draft timer', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const f = await fixture({ seed: false })
    const gate = deferred<ReturnType<typeof ok<{ sessionId: SessionId; agentPreset: string }>>>()
    f.create.mockImplementationOnce(() => gate.promise)
    f.runtime.setDraft('停用后不能写入')
    const creating = f.runtime.newTopic(); await flush(); f.runtime.dispose()
    await f.add('late', 'shan'); gate.resolve(ok({ sessionId: 'late' as SessionId, agentPreset: 'luma-duanmu-yan' })); await creating
    await vi.advanceTimersByTimeAsync(1000)
    expect(f.linkSession).not.toHaveBeenCalled(); expect(f.open).not.toHaveBeenCalled(); expect(f.set).not.toHaveBeenCalled()
  })

  it('does not navigate after an already started topic link finishes following disposal', async () => {
    const f = await fixture()
    const gate = deferred<void>()
    f.linkSession.mockImplementationOnce(() => gate.promise)
    const selecting = f.runtime.selectTopic('shan-own' as SessionId); await flush()
    expect(f.linkSession).toHaveBeenCalledTimes(1)
    f.runtime.dispose(); gate.resolve(); await selecting
    expect(f.open).not.toHaveBeenCalled(); expect(f.set).not.toHaveBeenCalled()
  })
})

import { describe, expect, it, vi } from 'vitest'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import { createOfficePageRuntime } from '../src/client/office-runtime.ts'
import { createDefaultOfficeRelationshipsV1 } from '../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/office-harness/OfficeRelationships.ts'
import { createSceneEvent } from '../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/office-harness/SceneProtocol.ts'
import { OFFICE_PRESENTATION_NAMESPACE, type OfficePresentationSettings } from '../src/office-presentation-settings.ts'

function feed<T>(initial: T) {
  let value = initial
  const listeners = new Set<() => void>()
  return { getSnapshot: () => value, subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } },
    set(next: T) { value = next; for (const listener of [...listeners]) listener() }, get subscriptions() { return listeners.size } }
}

function fixture(withSession = true) {
  const relationship = createDefaultOfficeRelationshipsV1()
  const settings = feed({ status: 'ready', writable: true, mode: 'host', revision: 1,
    value: { relationships: { ...relationship, employees: { ...relationship.employees,
      ...(withSession ? { shan: { activeSessionId: 'shan-session', workstationId: 'north-center' } } : {}),
    } } } })
  const presentationSettings = feed({ status: 'ready', writable: true, mode: 'host', revision: 1, value: {} as OfficePresentationSettings })
  const setPresentation = vi.fn(async (field: string, value: unknown) => { const previous = presentationSettings.getSnapshot(); presentationSettings.set({ ...previous,
    revision: previous.revision + 1, value: { ...previous.value, [field]: value } }) })
  const conversation = feed({ openState: 'open', running: false, pending: [], nodes: [],
    chat: { timeline: { turnOrder: [], turns: new Map() } }, turnTimings: new Map() })
  const blankList = { ids: [] as string[], byId: {} as Record<string, any>, current: undefined as string | undefined,
    phase: 'ready', subagentsByParent: {}, jobsBySession: {}, currentAddress: undefined }
  const list = feed({ ...blankList, ...(withSession ? { ids: ['shan-session'], current: 'shan-session', byId: {
    'shan-session': { id: 'shan-session', displayTitle: '端木嫣的任务', agentPreset: 'luma-duanmu-yan', blank: false, running: false, updatedAt: 1 },
  } } : {}) })
  const workspaces = feed({ items: [] as any[], archivedSessionIds: [], state: 'idle', phase: 'ready', error: null })
  const set = vi.fn(async (field: string, value: unknown) => { const previous = settings.getSnapshot(); settings.set({ ...previous,
    revision: previous.revision + 1, value: { ...previous.value, [field]: value } }) })
  const open = vi.fn()
  const clear = vi.fn(() => list.set({ ...list.getSnapshot(), current: undefined }))
  const select = vi.fn(async () => ({ result: { ok: true, value: {} } }))
  const prompt = vi.fn(), cancel = vi.fn(), create = vi.fn()
  const noteAgentPreset = vi.fn((sessionId: string, agentPreset: string) => {
    const previous = list.getSnapshot()
    list.set({ ...previous, byId: { ...previous.byId, [sessionId]: { ...previous.byId[sessionId], agentPreset } } })
  })
  const ctx = { get: () => ({ api: { agentPresets: { select }, sessions: { create }, llm: {} } }),
    settingsScope: { bind: ({ namespace }: { namespace: string }) => namespace === OFFICE_PRESENTATION_NAMESPACE
      ? { ...presentationSettings, set: setPresentation } : { ...settings, set, unset: vi.fn() } },
    sessions: { list, open, clear, noteAgentPreset, binding: () => ({ session: { ...conversation, prompt, cancel } }) },
    workspaces: { list: workspaces },
  } as unknown as ClientContext
  return { ctx, list, workspaces, settings, presentationSettings, setPresentation, conversation, set, open, clear, select, prompt, cancel, create, noteAgentPreset }
}

describe('DSH plugin office runtime', () => {
  it('links a real role-owned message session to its workstation and rejects a foreign role session', async () => {
    const f = fixture(), runtime = createOfficePageRuntime(f.ctx)
    const initial = f.list.getSnapshot()
    f.list.set({ ...initial, ids: [...initial.ids, 'bai-session'], byId: { ...initial.byId,
      'bai-session': { id: 'bai-session', agentPreset: 'luma-bai-shuangming', blank: false, running: false, displayTitle: '角色消息', updatedAt: 2 },
    } })
    await runtime.linkSession('bai-shuangming', 'bai-session' as never)
    expect(f.settings.getSnapshot().value.relationships.employees['bai-shuangming']).toMatchObject({ activeSessionId: 'bai-session' })
    expect(runtime.getSnapshot().projection.employees.find(row => row.employeeId === 'bai-shuangming')?.sessionId).toBe('bai-session')
    await expect(runtime.linkSession('shan', 'bai-session' as never)).rejects.toThrow('不属于')
    await expect(runtime.linkSession('shan', 'missing' as never)).rejects.toThrow('尚未载入')
    expect(f.prompt).not.toHaveBeenCalled()
    expect(f.select).not.toHaveBeenCalled()
    runtime.dispose()
  })
  it('subscribes to the dedicated theme settings without changing task/session records', async () => {
    const access = {unlockedEmployeeIds:['jingyuniang'],unlockedThemeIds:[] as string[]}
    const f = fixture(), runtime = createOfficePageRuntime(f.ctx, () => access)
    expect(f.setPresentation).not.toHaveBeenCalled()
    expect((await runtime.setTheme(null)).status).toBe('unchanged')
    expect((await runtime.setTheme('office.jingyuniang.v1')).status).toBe('rejected')
    expect((await runtime.setBedroomTheme('shan',null)).status).toBe('rejected')
    expect((await runtime.setBedroomTheme('jingyuniang','bedroom.jingyuniang.v1')).status).toBe('rejected')
    expect(f.setPresentation).not.toHaveBeenCalled()
    access.unlockedThemeIds.push('office.grok.v1')
    expect((await runtime.setTheme('office.grok.v1')).status).toBe('saved')
    expect(runtime.getSnapshot().presentation.selection.officeTheme).toBe('office.grok.v1')
    expect(f.set).not.toHaveBeenCalled()
    f.presentationSettings.set({ ...f.presentationSettings.getSnapshot(), revision: 3, value: { selection: {
      schemaVersion: 1, officeTheme: 'office.claude.v1', employeeSkins: {},
    } } })
    expect(runtime.getSnapshot().presentation.selection.officeTheme).toBe('office.claude.v1')
    runtime.dispose()
    expect(f.presentationSettings.subscriptions).toBe(0)
  })
  it('projects real running/completion facts; animation callbacks cannot settle Harness tasks', async () => {
    const f = fixture()
    const runtime = createOfficePageRuntime(f.ctx)
    expect(runtime.getSnapshot().commands).toEqual([])
    const initial = f.list.getSnapshot()
    f.list.set({ ...initial, byId: { ...initial.byId, 'shan-session': { ...initial.byId['shan-session'], running: true } } })
    expect(runtime.getSnapshot().projection.employees.find(row => row.employeeId === 'shan')?.canDrag).toBe(false)
    const start = runtime.getSnapshot().commands[0]!
    expect(start.type).toBe('start-task')
    runtime.handleSceneEvent(createSceneEvent({ ...start, type: 'animation-finished' }))
    expect(f.prompt).not.toHaveBeenCalled()
    expect(f.cancel).not.toHaveBeenCalled()
    expect(runtime.getSnapshot().projection.employees.find(row => row.employeeId === 'shan')?.taskState).toBe('running')
    await runtime.bindWorkstation('shan', 'south-right')
    expect(f.set).not.toHaveBeenCalled()
    f.list.set(initial)
    expect(runtime.getSnapshot().commands[0]?.type).toBe('stop-task')
    f.conversation.set({ ...f.conversation.getSnapshot(), nodes: [
      { kind: 'user', seq: 1, time: 100, content: [{ type: 'text', text: '完成任务' }] },
      { kind: 'assistant', seq: 2, time: 200, turn: 1, blocks: [{ kind: 'text', text: '任务完成' }] },
    ] as never[] })
    f.list.set({ ...initial, byId: { ...initial.byId, 'shan-session': { ...initial.byId['shan-session'], completed: true } } })
    expect(runtime.getSnapshot().commands[0]?.type).toBe('complete-task')
    expect(runtime.getSnapshot().projection.officeReportMarkers).toHaveLength(1)
    runtime.dispose()
    runtime.dispose()
    expect([f.list.subscriptions, f.workspaces.subscriptions, f.settings.subscriptions, f.conversation.subscriptions]).toEqual([0, 0, 0, 0])
  })

  it('exchanges two explicitly chosen desks in a single durable write while preserving an active session',async()=>{
    const f=fixture(), runtime=createOfficePageRuntime(f.ctx)
    await runtime.bindWorkstation('jingyuniang','south-right',{swap:true})
    const initial=f.list.getSnapshot()
    f.list.set({...initial,byId:{...initial.byId,'shan-session':{...initial.byId['shan-session'],running:true}}})
    f.set.mockClear()
    await runtime.bindWorkstation('shan','south-right',{swap:true})
    expect(f.set).toHaveBeenCalledTimes(1)
    const saved=f.settings.getSnapshot().value.relationships.employees
    expect(saved.shan).toMatchObject({activeSessionId:'shan-session',workstationId:'south-right'})
    expect(saved.jingyuniang?.workstationId).toBe('north-center')
    expect(runtime.getSnapshot().commands.find(c=>c.employeeId==='shan')?.workstationId).toBe('south-right')
    expect(f.cancel).not.toHaveBeenCalled()
    runtime.dispose()
    const reopened=createOfficePageRuntime(f.ctx)
    expect(reopened.getSnapshot().projection.employees.find(row=>row.employeeId==='shan')?.workstationId).toBe('south-right')
    reopened.dispose()
  })

  it('opens the saved employee conversation without replacing its composition', async () => {
    const f = fixture()
    const runtime = createOfficePageRuntime(f.ctx)
    expect(await runtime.openChat('shan')).toBe(true)
    expect(f.open).toHaveBeenCalledExactlyOnceWith('shan-session')
    expect(f.select).not.toHaveBeenCalled()
    expect(f.create).not.toHaveBeenCalled()
    expect(f.prompt).not.toHaveBeenCalled()
    expect(await runtime.openChat('unknown')).toBe(false)
    expect(f.open).toHaveBeenCalledTimes(1)
    runtime.dispose()
  })

  it('keeps the role through native DSH workspace selection and persists the real session', async () => {
    const f = fixture(false)
    const runtime = createOfficePageRuntime(f.ctx)
    expect(await runtime.openChat('shan')).toBe(true)
    expect(f.clear).toHaveBeenCalledTimes(1)
    expect(f.open).not.toHaveBeenCalled()
    f.workspaces.set({ ...f.workspaces.getSnapshot(), items: [{ workspaceId: 'project', path: '/workspace', sessionIds: ['new-session'] }] })
    f.list.set({ ...f.list.getSnapshot(), current: 'new-session', ids: ['new-session'], byId: {
      'new-session': { id: 'new-session', blank: true, running: false, updatedAt: 2, displayTitle: '新会话' },
    } })
    await vi.waitFor(() => expect(f.open).toHaveBeenCalledWith('new-session'))
    expect(f.select).toHaveBeenCalledExactlyOnceWith({ sessionId: 'new-session', agentPreset: 'luma-duanmu-yan' })
    expect(f.settings.getSnapshot().value.relationships.employees.shan).toMatchObject({ activeSessionId: 'new-session', workspaceId: 'project' })
    expect(f.prompt).not.toHaveBeenCalled()
    runtime.dispose()
  })

  it('unloading the plugin releases a pending native selection', async () => {
    const f = fixture(false)
    const runtime = createOfficePageRuntime(f.ctx)
    await runtime.openChat('shan')
    runtime.dispose()
    f.workspaces.set({ ...f.workspaces.getSnapshot(), items: [{ workspaceId: 'project', sessionIds: ['late'] }] })
    f.list.set({ ...f.list.getSnapshot(), current: 'late', ids: ['late'], byId: { late: { id: 'late', blank: true, running: false } } })
    await Promise.resolve()
    expect(f.select).not.toHaveBeenCalled()
    expect(f.open).not.toHaveBeenCalled()
  })
})

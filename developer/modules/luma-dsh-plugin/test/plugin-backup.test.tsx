import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import { createPluginBackupRuntime, createPluginPreferencesRuntime, PLUGIN_BACKUP_NAMESPACES, type PluginBackupApi } from '../src/client/plugin-backup-runtime.ts'
import { PluginSettingsPage } from '../src/client/PluginSettingsPage.tsx'
import { DEFAULT_MESSAGE_PREFERENCES, MESSAGES_NAMESPACE } from '../src/messages-settings.ts'
import { PLUGIN_PREFERENCES_NAMESPACE } from '../src/plugin-preferences-settings.ts'
import { OFFICE_PRESENTATION_NAMESPACE } from '../src/office-presentation-settings.ts'

afterEach(cleanup)
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value))
function hostFixture() {
  let writable = true
  const sections = new Map<string, any>([
    ['luma-office', { scheduledTasks: { schemaVersion: 1, tasks: [{ id: 'task1', employeeId: 'shan', title: '定时任务', prompt: 'PRIVATE SCHEDULE PROMPT',
      date: '2026-11-17', time: '10:00', recurrence: 'once', enabled: true, createdAt: 1 }] } }],
    ['luma-collection', {}], ['luma-card-library', {}],
    [OFFICE_PRESENTATION_NAMESPACE, { selection: { schemaVersion: 1, officeTheme: null, employeeSkins: {} } }],
    ['luma-dsh-local-collection', { state: { schemaVersion: 1, events: [] } }],
    [MESSAGES_NAMESPACE, { homes: { shan: '/PRIVATE/HOST/DIRECTORY' }, preferences: { ...DEFAULT_MESSAGE_PREFERENCES, drafts: { shan: 'PRIVATE UNSENT MESSAGE' } } }],
    [PLUGIN_PREFERENCES_NAMESPACE, {}],
    ['llm-private-provider', { apiKey: 'PRIVATE MODEL KEY' }],
  ])
  const revisions = new Map([...sections.keys()].map(key => [key, 1]))
  const listeners = new Map<string, Set<() => void>>()
  const view = (ns: string) => ({ ns, user: clone(sections.get(ns)), revision: revisions.get(ns)!, secrets: ns.startsWith('llm-') ? [{ path: ['apiKey'], set: true }] : [] })
  const replaceLocal = (ns: string, section: unknown) => { sections.set(ns, clone(section)); revisions.set(ns, revisions.get(ns)! + 1); for (const callback of [...(listeners.get(ns) ?? [])]) callback() }
  const api = {
    describe: vi.fn(async () => ({ result: { ok: true as const, value: { writable, namespaces: [...sections.keys()].map(view) } } })),
    replace: vi.fn(async ({ ns, section, expectedRevision }: { ns: string; section: object; expectedRevision: number }) => {
      if (expectedRevision !== revisions.get(ns)) return { result: { ok: false as const, error: { code: 'settings-conflict', message: 'conflict' } } }
      if (!writable) return { result: { ok: false as const, error: { code: 'settings-rejected', message: 'read-only' } } }
      PLUGIN_BACKUP_NAMESPACES.find(spec => spec.name === ns)!.validate(section)
      replaceLocal(ns, section)
      return { result: { ok: true as const, value: view(ns) } }
    }),
  }
  const ctx = { get: () => ({ api: { settings: api } }), settingsScope: { bind: ({ namespace, decode }: { namespace: string; decode: (value: unknown) => unknown }) => ({
    getSnapshot: () => ({ status: 'ready', writable, mode: 'host', revision: revisions.get(namespace), user: sections.get(namespace), value: decode(sections.get(namespace)) }),
    subscribe: (callback: () => void) => { if (!listeners.has(namespace)) listeners.set(namespace, new Set()); listeners.get(namespace)!.add(callback); return () => { listeners.get(namespace)?.delete(callback) } },
    set: async (field: string, value: unknown) => { await api.replace({ ns: namespace, section: { ...sections.get(namespace), [field]: value }, expectedRevision: revisions.get(namespace)! }) },
  }) } } as unknown as ClientContext
  return { api, ctx, sections, revisions, replaceLocal, setWritable: (value: boolean) => { writable = value } }
}

describe('allowlisted plugin backup and preferences', () => {
  it('exports only plugin user data and excludes model keys, Host homes, drafts and task instructions', async () => {
    const host = hostFixture(), backup = createPluginBackupRuntime(host.api)
    const document = await backup.exportBackup(), json = JSON.stringify(document)
    expect(Object.keys(document.namespaces)).toHaveLength(7)
    expect(json).not.toContain('PRIVATE')
    expect(document.namespaces['luma-office']).toEqual({})
    expect((document.namespaces[MESSAGES_NAMESPACE]!.preferences as any).drafts).toEqual({})
    expect(host.api.replace).not.toHaveBeenCalled()
    backup.dispose()
  })

  it('prevalidates all namespaces and versions before allowing any mutation', async () => {
    const host = hostFixture(), backup = createPluginBackupRuntime(host.api)
    const original = await backup.exportBackup()
    expect((await backup.previewBackup(JSON.stringify({ ...original, pluginVersion: '0.4.3' }))).pluginVersion).toBe('0.4.3')
    const foreign = { ...original, namespaces: { ...original.namespaces, 'llm-private-provider': {} } }
    await expect(backup.previewBackup(JSON.stringify(foreign))).rejects.toThrow('插件范围之外')
    await expect(backup.previewBackup(JSON.stringify({ ...original, version: 2 }))).rejects.toThrow('版本')
    const forged = clone(original) as any
    forged.namespaces['luma-dsh-local-collection'] = { state: { schemaVersion: 1, events: [
      { type: 'welcome', id: 'once', at: 1 }, { type: 'welcome', id: 'twice', at: 2 },
    ] } }
    await expect(backup.previewBackup(JSON.stringify(forged))).rejects.toThrow()
    expect(host.api.replace).not.toHaveBeenCalled()
    backup.dispose()
  })

  it('restores validated namespaces atomically while retaining excluded current data', async () => {
    const host = hostFixture(), backup = createPluginBackupRuntime(host.api), document = clone(await backup.exportBackup()) as any
    document.namespaces[OFFICE_PRESENTATION_NAMESPACE].selection.officeTheme = 'office.claude.v1'
    document.namespaces[MESSAGES_NAMESPACE].preferences.userName = '新称呼'
    const preview = await backup.previewBackup(JSON.stringify(document))
    expect(host.api.replace).not.toHaveBeenCalled()
    const result = await backup.restoreBackup(preview.token)
    expect(result.status).toBe('complete')
    expect(result.applied).toEqual([OFFICE_PRESENTATION_NAMESPACE, MESSAGES_NAMESPACE])
    expect(host.sections.get(MESSAGES_NAMESPACE)).toMatchObject({ homes: { shan: '/PRIVATE/HOST/DIRECTORY' }, preferences: {
      userName: '新称呼', drafts: { shan: 'PRIVATE UNSENT MESSAGE' },
    } })
    expect(host.sections.get('luma-office').scheduledTasks.tasks[0].prompt).toBe('PRIVATE SCHEDULE PROMPT')
    for (const [request] of host.api.replace.mock.calls) expect(request.expectedRevision).toBe(1)
    backup.dispose()
  })

  it('stops on the second namespace conflict and names the already applied range', async () => {
    const host = hostFixture(), backup = createPluginBackupRuntime(host.api), document = await backup.exportBackup()
    const selected = { ...document, namespaces: {
      [PLUGIN_PREFERENCES_NAMESPACE]: { preferences: { schemaVersion: 1, reducedMotion: 'reduce' } },
      [OFFICE_PRESENTATION_NAMESPACE]: { selection: { schemaVersion: 1, officeTheme: 'office.grok.v1', employeeSkins: {} } },
      'luma-card-library': { 'favorite_LR-01%40foil-v01-r01': { schemaVersion: 1, versionKey: 'LR-01@foil-v01-r01', favorite: true } },
    } }
    const preview = await backup.previewBackup(JSON.stringify(selected))
    const actual = host.api.replace.getMockImplementation()!
    host.api.replace.mockImplementation(async request => host.api.replace.mock.calls.length === 2
      ? { result: { ok: false, error: { code: 'settings-conflict', message: 'changed by another window' } } } : actual(request))
    const result = await backup.restoreBackup(preview.token)
    expect(result).toMatchObject({ status: 'stopped', applied: [PLUGIN_PREFERENCES_NAMESPACE], stoppedAt: OFFICE_PRESENTATION_NAMESPACE })
    expect(host.api.replace).toHaveBeenCalledTimes(2)
    expect(host.sections.get('luma-card-library')).toEqual({})
    backup.dispose()
  })

  it('refuses read-only and stale previews before the first write', async () => {
    const host = hostFixture(), backup = createPluginBackupRuntime(host.api), document = await backup.exportBackup()
    const preview = await backup.previewBackup(JSON.stringify(document))
    host.setWritable(false)
    expect((await backup.restoreBackup(preview.token)).status).toBe('stopped')
    expect(host.api.replace).not.toHaveBeenCalled()
    host.setWritable(true)
    const second = await backup.previewBackup(JSON.stringify(document))
    host.replaceLocal(PLUGIN_PREFERENCES_NAMESPACE, { preferences: { schemaVersion: 1, reducedMotion: 'reduce' } })
    expect((await backup.restoreBackup(second.token)).status).toBe('stopped')
    expect(host.api.replace).not.toHaveBeenCalled()
    backup.dispose()
  })

  it('reports an uncertain transport outcome and never continues to later namespaces', async () => {
    const host = hostFixture(), backup = createPluginBackupRuntime(host.api), document = await backup.exportBackup()
    const next = { ...document, namespaces: {
      [PLUGIN_PREFERENCES_NAMESPACE]: { preferences: { schemaVersion: 1, reducedMotion: 'reduce' } },
      [OFFICE_PRESENTATION_NAMESPACE]: { selection: { schemaVersion: 1, officeTheme: 'office.grok.v1', employeeSkins: {} } },
    } }
    const preview = await backup.previewBackup(JSON.stringify(next))
    host.api.replace.mockImplementation(async () => { throw new Error('connection lost') })
    expect(await backup.restoreBackup(preview.token)).toMatchObject({ status: 'stopped', applied: [], uncertain: PLUGIN_PREFERENCES_NAMESPACE })
    expect(host.api.replace).toHaveBeenCalledTimes(1)
    backup.dispose()
  })

  it('waits for explicit file preview and restore confirmation, and saves motion through Host settings', async () => {
    const host = hostFixture(), runtime = createPluginPreferencesRuntime(host.ctx)
    const nativeSettings = vi.fn()
    const view = render(<PluginSettingsPage runtime={runtime} onOpenNativeSettings={nativeSettings} />)
    fireEvent.change(view.getByLabelText('办公室动态'), { target: { value: 'reduce' } })
    await waitFor(() => expect(host.sections.get(PLUGIN_PREFERENCES_NAMESPACE).preferences.reducedMotion).toBe('reduce'))
    fireEvent.click(view.getByRole('button', { name: '前往 DSH 设置入口' }))
    expect(nativeSettings).toHaveBeenCalledTimes(1)
    host.api.replace.mockClear()
    const document = await runtime.exportBackup()
    const incoming = clone(document) as any
    incoming.namespaces[OFFICE_PRESENTATION_NAMESPACE].selection.officeTheme = 'office.claude.v1'
    const file = new File([JSON.stringify(incoming)], 'luma-backup.json', { type: 'application/json' })
    Object.defineProperty(file, 'text', { value: async () => JSON.stringify(incoming) })
    fireEvent.change(view.getByLabelText('选择备份文件'), { target: { files: [file] } })
    await waitFor(() => expect(view.getByLabelText('备份恢复预览')).toBeTruthy())
    expect(host.api.replace).not.toHaveBeenCalled()
    fireEvent.click(view.getByRole('button', { name: '按以上范围恢复' }))
    await waitFor(() => expect(host.sections.get(OFFICE_PRESENTATION_NAMESPACE).selection.officeTheme).toBe('office.claude.v1'))
    runtime.dispose()
  })
})

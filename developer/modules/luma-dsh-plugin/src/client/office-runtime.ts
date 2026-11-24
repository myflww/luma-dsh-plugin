import type { ConnectionHandle, SessionId } from '@deepseek-ai/dsh-api-remotes/client'
import type { ClientContext, SettingsScope } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import { createOfficeRelationshipIntegration } from '../../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/office-harness/OfficeRelationshipIntegration.ts'
import { OfficeEmployeeSessionCoordinator } from '../../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/office-harness/OfficeEmployeeSessionCoordinator.ts'
import { createHarnessOfficeExperienceAdapter } from '../../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/office-harness/createHarnessOfficeExperienceAdapter.ts'
import { OFFICE_EMPLOYEE_DEFINITIONS, OFFICE_RELATIONSHIP_SETTINGS_NAMESPACE, decodeOfficeRelationshipSettings, isOfficeEmployeeId, type OfficeRelationshipSettings } from '../../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/office-harness/OfficeRelationships.ts'
import type { HarnessOfficeProjection, OfficeEmployeeVisualState } from '../../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/office-harness/HarnessOfficeProjectionAdapter.ts'
import { createSceneCommand, SceneProtocolGuard, type SceneCommand, type SceneCommandType, type SceneEvent } from '../../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/office-harness/SceneProtocol.ts'
import { isOfficeWorkstationId } from '../../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/office2d/workstations.ts'
import { OFFICE_PRESENTATION_NAMESPACE, decodeOfficePresentationSettings, type OfficePresentationSettings } from '../office-presentation-settings.ts'
import { OfficePresentationStore, type OfficePresentationSnapshot, type RoomAccess } from './OfficePresentationStore.ts'
import { STARTER_EMPLOYEE_ID } from '../shared/local-collection-domain.ts'
import { PLUGIN_PREFERENCES_NAMESPACE, decodePluginPreferencesSettings, type PluginMotionPreference, type PluginPreferencesSettings } from '../plugin-preferences-settings.ts'

export interface OfficeRuntimeSnapshot {
  readonly projection: HarnessOfficeProjection
  readonly commands: readonly SceneCommand[]
  readonly persistence: 'host' | 'memory' | 'loading' | 'unavailable'
  readonly calendar?: NonNullable<OfficeRelationshipSettings['calendar']>
  readonly holidayCalendar?: NonNullable<OfficeRelationshipSettings['holidayCalendar']>
  readonly presentation: OfficePresentationSnapshot
  readonly motionPreference: PluginMotionPreference
  readonly problem?: string
}

function commandType(employee: OfficeEmployeeVisualState): SceneCommandType | undefined {
  switch (employee.taskState) {
    case 'running': case 'awaiting-user': return 'start-task'
    case 'completed': return 'complete-task'
    case 'stopping': case 'failed': return 'stop-task'
    default: return undefined
  }
}

/** The plugin reads real Harness work. Its scene has no prompt/cancel/completion authority. */
export function createOfficePageRuntime(ctx: ClientContext, roomAccess: () => RoomAccess = () => ({unlockedEmployeeIds:[STARTER_EMPLOYEE_ID], unlockedThemeIds:[]})) {
  const connection = ctx.get('connection') as ConnectionHandle
  const settings = ctx.settingsScope.bind<OfficeRelationshipSettings>({
    namespace: OFFICE_RELATIONSHIP_SETTINGS_NAMESPACE,
    decode: decodeOfficeRelationshipSettings,
  })
  const relationships = createOfficeRelationshipIntegration(settings)
  const listeners = new Set<() => void>()
  let problem: string | undefined
  let disposed = false
  let snapshot: OfficeRuntimeSnapshot
  const publishProblem = (message: string | undefined) => {
    problem = message
    refresh()
  }
  const sessions = new OfficeEmployeeSessionCoordinator({
    sessions: ctx.sessions,
    workspaces: ctx.workspaces,
    api: connection.api,
  }, relationships.store, { onError: error => publishProblem(error.message) })
  const adapter = createHarnessOfficeExperienceAdapter({ sessions: ctx.sessions, workspaces: ctx.workspaces }, relationships.source, sessions)
  relationships.attachProjection(adapter)
  const guard = new SceneProtocolGuard()
  let ordinal = 0
  let records = new Map<string, { signature: string; command: SceneCommand }>()
  let presentation: OfficePresentationStore
  let motionSettings: SettingsScope<PluginPreferencesSettings>
  try {
    motionSettings = ctx.settingsScope.bind<PluginPreferencesSettings>({ namespace: PLUGIN_PREFERENCES_NAMESPACE, decode: decodePluginPreferencesSettings })
    presentation = new OfficePresentationStore(ctx.settingsScope.bind<OfficePresentationSettings>({
      namespace: OFFICE_PRESENTATION_NAMESPACE, decode: decodeOfficePresentationSettings,
    }), roomAccess)
  } catch (error) { sessions.dispose(); relationships.dispose(); throw error }

  function refresh(): void {
    if (disposed) return
    const projection = adapter.getSnapshot()
    const next = new Map<string, { signature: string; command: SceneCommand }>()
    for (const employee of projection.employees) {
      if (!employee.workstationId || !isOfficeWorkstationId(employee.workstationId)) continue
      const prior = records.get(employee.employeeId)
      let type = commandType(employee)
      let taskId = employee.taskId
      if (!type && prior?.command.type === 'start-task') {
        type = 'stop-task'
        taskId = prior.command.taskId
      }
      if (!type) {
        if (prior) next.set(employee.employeeId, prior)
        continue
      }
      taskId ??= prior?.command.taskId ?? `${employee.sessionId ?? employee.employeeId}:active-task`
      const signature = JSON.stringify([type, taskId, employee.employeeId, employee.workstationId])
      if (prior?.signature === signature) { next.set(employee.employeeId, prior); continue }
      const command = createSceneCommand({ type, taskId, employeeId: employee.employeeId, workstationId: employee.workstationId,
        commandId: `luma-dsh:${employee.employeeId}:${++ordinal}:${type}` })
      const admitted = guard.admitCommand(command,prior?.command)
      if (admitted.status === 'accepted' || admitted.status === 'duplicate') next.set(employee.employeeId, { signature, command: admitted.command })
    }
    records = next
    const relationship = relationships.store.getSnapshot()
    const preferences = settings.getSnapshot().value
    snapshot = Object.freeze({ projection, commands: Object.freeze([...next.values()].map(record => record.command)),
      presentation: presentation.getSnapshot(),
      motionPreference: motionSettings.getSnapshot().value?.preferences?.reducedMotion ?? 'system',
      persistence: relationship.status === 'ready' ? relationship.persistence : relationship.status,
      ...(preferences?.calendar ? { calendar: preferences.calendar } : {}),
      ...(preferences?.holidayCalendar ? { holidayCalendar: preferences.holidayCalendar } : {}),
      ...(problem ? { problem } : {}) })
    for (const listener of listeners) listener()
  }
  refresh()
  const stopProjection = adapter.subscribe(refresh)
  const stopRelationships = relationships.store.subscribe(refresh)
  const stopPresentation = presentation.subscribe(refresh)
  const stopMotion = motionSettings.subscribe(refresh)

  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener) } },
    setTheme: (theme: string | null) => presentation.setTheme(theme),
    setBedroomTheme: (employeeId: string, theme: string | null) => presentation.setBedroomTheme(employeeId, theme),
    setPresence: (presence: string) => presentation.setPresence(presence),
    setOutfit: (employeeId: string, skinId: string | null) => presentation.setOutfit(employeeId, skinId),
    async linkSession(employeeId: string, sessionId: SessionId): Promise<void> {
      if (disposed) throw new Error('办公室连接已关闭。')
      if (!isOfficeEmployeeId(employeeId)) throw new Error('所选角色不在办公室目录中。')
      const assertOwnedSession = () => {
        if (disposed) throw new Error('办公室连接已关闭。')
        const summary = ctx.sessions.list.getSnapshot().byId[sessionId]
        if (!summary) throw new Error('角色会话尚未载入 DSH，请稍后重试。')
        const existing = relationships.store.getSnapshot().relationships.employees[employeeId]
        if (summary.agentPreset !== OFFICE_EMPLOYEE_DEFINITIONS[employeeId].agentPresetId && existing.activeSessionId !== String(sessionId)) {
          throw new Error('这段会话不属于所选角色。')
        }
      }
      assertOwnedSession()
      const assigned = await relationships.store.autoAssignWorkstation(employeeId)
      if (assigned.status === 'rejected') throw new Error(`角色工位无法保存：${assigned.reason}`)
      assertOwnedSession()
      const linked = await relationships.store.updateHarnessRelationship(employeeId, { activeSessionId: String(sessionId) })
      if (linked.status === 'rejected') throw new Error(`角色会话绑定无法保存：${linked.reason}`)
    },
    async openChat(employeeId: string, sessionId?: SessionId): Promise<boolean> {
      const result = await sessions.launchEmployee(employeeId, sessionId)
      if (disposed) return false
      if (result.status === 'rejected') { publishProblem(result.reason); return false }
      publishProblem(undefined)
      return true
    },
    async openReport(reportId: string): Promise<string | undefined> {
      const report = adapter.getSnapshot().reports.find(candidate => candidate.reportId === reportId)
      if (!report) { publishProblem('这份报告对应的会话暂不可用。'); return undefined }
      if (!await this.openChat(report.employeeId, report.sessionId)) return undefined
      adapter.acknowledgeReport(reportId)
      return report.employeeId
    },
    async bindWorkstation(employeeId: string, workstationId: string, placement?: {swap:true}): Promise<void> {
      const result = await relationships.store.bindWorkstation(employeeId, workstationId, placement)
      publishProblem(result.status === 'rejected' ? '工位未保存，请检查 DSH 设置连接后重试。' : undefined)
    },
    handleSceneEvent(event: SceneEvent): void {
      if (disposed) return
      const result = guard.admitEvent(event)
      if (result.status !== 'accepted') return
      adapter.handleSceneEvent(result.event)
      if (event.type === 'animation-finished' || event.type === 'navigation-failed') guard.retireCommand(event.commandId)
    },
    dispose(): void {
      if (disposed) return
      disposed = true
      stopProjection()
      stopRelationships()
      stopPresentation()
      stopMotion()
      presentation.dispose()
      sessions.dispose()
      relationships.dispose()
      listeners.clear()
    },
  }
}

export type OfficePageRuntime = ReturnType<typeof createOfficePageRuntime>

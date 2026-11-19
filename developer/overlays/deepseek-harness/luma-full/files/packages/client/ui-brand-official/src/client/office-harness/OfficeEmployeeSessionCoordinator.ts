import type { CharacterAIProfileClient } from '../../character-ai/client/CharacterAIProfileClient.ts'
import { readWorkFolderProfileOptions } from '../../work-folder/client/WorkFolderProfileOptions.ts'
/**
 * Production bridge from a persistent Luma employee identity to Harness'
 * workspace/session domains. Harness remains the session and task authority;
 * this coordinator only chooses a blank session's fixed employee preset,
 * persists the relationship, and navigates to it.
 */

import type {
  IApiClient,
  PromptContentPart,
  SessionId,
  WorkspaceId,
} from '@deepseek-ai/dsh-api-remotes/client'
import type {
  ISessions,
  IWorkspaces,
  SessionSummary,
} from '@deepseek-ai/dsh-client-runtime/client'
import type { HarnessConversationLaunchRequest, HarnessConversationLauncher } from './HarnessOfficeProjectionAdapter.ts'
import {
  OFFICE_EMPLOYEE_DEFINITIONS,
  OFFICE_EMPLOYEE_IDS,
  isOfficeEmployeeId,
  type OfficeEmployeeId,
} from './OfficeRelationships.ts'
import type {
  OfficeRelationshipMutationResult,
  SettingsBackedOfficeRelationshipStore,
} from './SettingsBackedOfficeRelationshipStore.ts'
import {
  DEFAULT_PORTRAIT_PERMISSIONS,
  PORTRAIT_IMAGE_MEDIA_TYPES,
  isPortraitImageMediaType,
  type PortraitComposerConfiguration,
  type PortraitComposerImage,
  type PortraitComposerOptions,
  type PortraitPermissionOption,
  type PortraitWorkspaceState,
} from './PortraitComposer.ts'

/** Public Harness services used by the employee launch policy. */
export interface OfficeEmployeeSessionRuntime {
  readonly sessions: Pick<
    ISessions,
    'list' | 'binding' | 'open' | 'clear' | 'noteAgentPreset'
  >
  readonly workspaces: Pick<
    IWorkspaces,
    'list' | 'connectWorkspace' | 'archiveSession' | 'pickDirectory' | 'create'
  >
  readonly api: Pick<IApiClient, 'agentPresets' | 'sessions' | 'llm'>
}

/**
 * Host-owned employee storage port. Two operations the public Harness wire
 * cannot express on macOS: preparing the user-visible working folder (the
 * native picker cannot create directories) and physically removing a topic's
 * persisted log (the public API only archives). Both are optional: a Host
 * without the Luma storage owner keeps the previous workspace-picker behavior.
 */
export interface OfficeEmployeeWorkspacePort {
  ensureEmployeeFolder(employeeId: OfficeEmployeeId): Promise<PortraitWorkspaceState>
  purgeEmployeeTopic(sessionId: SessionId): Promise<'removed' | 'deferred' | 'unavailable'>
}

/** Relationship mutations the launch policy is allowed to perform. */
export type OfficeEmployeeSessionRelationships = Pick<
  SettingsBackedOfficeRelationshipStore,
  'getSnapshot' | 'autoAssignWorkstation' | 'updateHarnessRelationship'
>

export type OfficeEmployeeSessionLaunchResult =
  | Readonly<{
    status: 'opened'
    employeeId: OfficeEmployeeId
    sessionId: SessionId
  }>
  | Readonly<{
    status: 'select-workspace'
    employeeId: OfficeEmployeeId
  }>
  | Readonly<{
    status: 'rejected'
    reason: string
  }>

export type OfficeEmployeeTopicActionResult =
  | Readonly<{
    status: 'accepted'
    employeeId: OfficeEmployeeId
    sessionId: SessionId
  }>
  | Readonly<{
    status: 'select-workspace'
    employeeId: OfficeEmployeeId
  }>
  | Readonly<{
    status: 'rejected'
    reason: string
  }>

/**
 * Archive outcome. `purge` reports what happened to the topic's persisted log:
 * `removed` is immediate, `deferred` means the topic was still attached to this
 * Host process and its log is queued for the next boot, `unavailable` means the
 * Host has no Luma storage owner and only the archive happened.
 */
export type OfficeEmployeeTopicArchiveResult =
  | Readonly<{
    status: 'accepted'
    employeeId: OfficeEmployeeId
    sessionId: SessionId
    purge: 'removed' | 'deferred' | 'unavailable'
  }>
  | Readonly<{
    status: 'select-workspace'
    employeeId: OfficeEmployeeId
  }>
  | Readonly<{
    status: 'rejected'
    reason: string
  }>

/** Outcome of switching one employee's working folder. */

interface PermissionProjectionOption {
  readonly value?: unknown
  readonly name?: unknown
  readonly description?: unknown
}

interface PermissionProjection {
  readonly options?: unknown
  readonly currentValue?: unknown
}

function permissionLabel(id: string, fallback?: string): string {
  if (typeof fallback === 'string' && fallback.trim() !== '') return fallback
  switch (id) {
    case 'read-only': return '只读'
    case 'workspace-write': return '工作区写入'
    case 'danger-full-access': return '完全访问'
    default: return id
  }
}

function permissionOptionsOf(value: unknown): {
  readonly options: readonly PortraitPermissionOption[]
  readonly current?: string
} {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return { options: [] }
  const projection = value as PermissionProjection
  const rows = Array.isArray(projection.options) ? projection.options : []
  const options = rows.flatMap((candidate): PortraitPermissionOption[] => {
    if (typeof candidate !== 'object' || candidate === null || Array.isArray(candidate)) return []
    const option = candidate as PermissionProjectionOption
    if (typeof option.value !== 'string' || option.value === 'custom') return []
    return [{
      id: option.value,
      label: permissionLabel(option.value, typeof option.name === 'string' ? option.name : undefined),
      ...(typeof option.description === 'string' && option.description.trim() !== ''
        ? { description: option.description }
        : {}),
      requiresConfirmation: option.value === 'danger-full-access',
    }]
  })
  return {
    options: Object.freeze(options),
    ...(typeof projection.currentValue === 'string' ? { current: projection.currentValue } : {}),
  }
}

export interface OfficeEmployeeSessionCoordinatorOptions {
  /** Diagnostic sink for deferred workspace-selection failures. */
  readonly profiles?: CharacterAIProfileClient
  readonly onError?: (error: Error) => void
  /** Upper bound while a directly created session reaches the public list. */
  readonly sessionArrivalTimeoutMs?: number
  /** Host-owned employee storage; absent hosts keep the workspace picker. */
  readonly workspacePort?: OfficeEmployeeWorkspacePort
  /** Existing Host workflow owner persists desktop-pet provenance before first send. */
  readonly markDesktopOrigin?: (employeeId: OfficeEmployeeId, sessionId: SessionId) => Promise<void>
}

/** Where a new employee topic should be created. */
type OfficeTopicTarget =
  | Readonly<{ kind: 'workspace', workspaceId: WorkspaceId }>
  | Readonly<{ kind: 'cwd', cwd: string }>

interface PendingWorkspaceSelection {
  readonly employeeId: OfficeEmployeeId
  readonly launchToken: number
}

const DEFAULT_SESSION_ARRIVAL_TIMEOUT_MS = 10_000

function errorOf(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error))
}

function mutationError(
  action: string,
  result: OfficeRelationshipMutationResult,
): Error | undefined {
  return result.status === 'rejected'
    ? new Error(`${action}: ${result.reason}`)
    : undefined
}

/**
 * Keeps each built-in employee on one fixed preset without ever recomposing a
 * nonblank conversation. A pending no-workspace launch watches Harness'
 * native New Session flow instead of reimplementing the workspace picker.
 */
export class OfficeEmployeeSessionCoordinator implements HarnessConversationLauncher {
  private readonly pendingEmployees = new Set<OfficeEmployeeId>()
  private readonly stopSessions: () => void
  private readonly stopWorkspaces: () => void
  private readonly onError: (error: Error) => void
  private readonly sessionArrivalTimeoutMs: number
  private pendingWorkspaceSelection: PendingWorkspaceSelection | undefined
  private launchToken = 0
  private disposed = false

  constructor(
    private readonly runtime: OfficeEmployeeSessionRuntime,
    private readonly relationships: OfficeEmployeeSessionRelationships,
    options: OfficeEmployeeSessionCoordinatorOptions = {},
  ) {
    this.profiles = options.profiles
    this.workspacePort = options.workspacePort
    this.markDesktopOrigin = options.markDesktopOrigin
    this.onError = options.onError ?? ((error) => {
      console.warn('Luma employee session launch failed:', error)
    })
    this.sessionArrivalTimeoutMs = options.sessionArrivalTimeoutMs
      ?? DEFAULT_SESSION_ARRIVAL_TIMEOUT_MS
    this.stopSessions = runtime.sessions.list.subscribe(() => {
      this.reconcilePendingWorkspaceSelection()
    })
    this.stopWorkspaces = runtime.workspaces.list.subscribe(() => {
      this.reconcilePendingWorkspaceSelection()
    })
  }

  private readonly profiles: CharacterAIProfileClient | undefined
  private readonly workspacePort: OfficeEmployeeWorkspacePort | undefined
  private readonly markDesktopOrigin: OfficeEmployeeSessionCoordinatorOptions['markDesktopOrigin']

  /** Stop observing the native workspace-selection flow. */
  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.launchToken += 1
    this.pendingWorkspaceSelection = undefined
    this.stopSessions()
    this.stopWorkspaces()
  }

  /** HarnessOfficeProjectionAdapter navigation port. Failures stay diagnosed, not unhandled. */
  async openConversation(request: HarnessConversationLaunchRequest): Promise<void> {
    const result = await this.launchEmployee(request.employeeId, request.sessionId)
    if (result.status === 'rejected') this.onError(new Error(result.reason))
  }

  /**
   * Open a saved employee session, connect its saved workspace, or enter the
   * native Harness workspace picker when no workspace has been configured.
   */
  async launchEmployee(
    employeeId: string,
    requestedSessionId?: SessionId,
  ): Promise<OfficeEmployeeSessionLaunchResult> {
    if (this.disposed) return { status: 'rejected', reason: 'coordinator-disposed' }
    if (!isOfficeEmployeeId(employeeId)) {
      return { status: 'rejected', reason: `unknown employee: ${employeeId}` }
    }

    const launchToken = ++this.launchToken
    this.pendingWorkspaceSelection = undefined
    try {
      // Binding is office-owned and long-lived. A full office does not block
      // opening the employee; task admission can surface the no-seat state.
      await this.relationships.autoAssignWorkstation(employeeId)
      if (!this.isCurrentLaunch(launchToken)) return this.superseded()

      const relationship = this.relationships.getSnapshot().relationships.employees[employeeId]
      const candidateId = requestedSessionId
        ?? (relationship.activeSessionId as SessionId | undefined)
      if (candidateId !== undefined) {
        const summary = this.runtime.sessions.list.getSnapshot().byId[candidateId]
        if (summary !== undefined) {
          await this.prepareExistingSession(employeeId, summary)
          if (!this.isCurrentLaunch(launchToken)) return this.superseded()
          if (relationship.activeSessionId === String(candidateId)
            && relationship.workspaceId === undefined) {
            const existingWorkspaceId = this.workspaceForSession(candidateId)
            if (existingWorkspaceId !== undefined) {
              const updated = await this.relationships.updateHarnessRelationship(employeeId, {
                workspaceId: String(existingWorkspaceId),
              })
              const failure = mutationError('persist employee workspace', updated)
              if (failure !== undefined) throw failure
            }
          }
          if (!this.isCurrentLaunch(launchToken)) return this.superseded()
          this.runtime.sessions.open(candidateId)
          return { status: 'opened', employeeId, sessionId: candidateId }
        }
        // A report explicitly naming a disappeared session must not silently
        // route to another conversation.
        if (requestedSessionId !== undefined) {
          return { status: 'rejected', reason: `session unavailable: ${String(candidateId)}` }
        }
        const cleared = await this.relationships.updateHarnessRelationship(employeeId, {
          activeSessionId: null,
        })
        const failure = mutationError('clear stale employee session', cleared)
        if (failure !== undefined) throw failure
      }

      const refreshed = this.relationships.getSnapshot().relationships.employees[employeeId]
      if (refreshed.workspaceId !== undefined) {
        const workspaceId = refreshed.workspaceId as WorkspaceId
        if (!this.workspaceExists(workspaceId)) {
          const cleared = await this.relationships.updateHarnessRelationship(employeeId, {
            workspaceId: null,
            activeSessionId: null,
          })
          const failure = mutationError('clear stale employee workspace', cleared)
          if (failure !== undefined) throw failure
        } else {
          const sessionId = await this.connectEmployeeWorkspace(employeeId, workspaceId)
          if (!this.isCurrentLaunch(launchToken)) return this.superseded()
          this.runtime.sessions.open(sessionId)
          return { status: 'opened', employeeId, sessionId }
        }
      }

      if (!this.isCurrentLaunch(launchToken)) return this.superseded()
      // A direct target (the employee's own folder) opens a dedicated topic in
      // place. Only a Host without Luma employee storage falls back to the
      // native New Session / workspace-selection surface.
      const direct = await this.resolveTopicTarget(employeeId)
      if (!this.isCurrentLaunch(launchToken)) return this.superseded()
      if (direct !== undefined) {
        const sessionId = direct.kind === 'workspace'
          ? await this.connectEmployeeWorkspace(employeeId, direct.workspaceId)
          : await this.openDedicatedTopic(employeeId, direct)
        if (!this.isCurrentLaunch(launchToken)) return this.superseded()
        this.runtime.sessions.open(sessionId)
        return { status: 'opened', employeeId, sessionId }
      }

      this.pendingWorkspaceSelection = { employeeId, launchToken }
      // `clear()` is the public route to Harness' unmodified New Session /
      // workspace-selection surface. The listener above claims the blank
      // session only after the user selects a workspace.
      this.runtime.sessions.clear()
      this.reconcilePendingWorkspaceSelection()
      return { status: 'select-workspace', employeeId }
    } catch (error) {
      return { status: 'rejected', reason: errorOf(error).message }
    }
  }

  /**
   * Create and select a fresh Harness topic for one employee.
   *
   * The employee's own folder is the default subject, so a first topic needs no
   * navigation: the portrait can pick a model, effort and permission and send
   * immediately. A user-picked Harness workspace still wins when one is bound.
   */
  async createEmployeeTopic(employeeId: string): Promise<OfficeEmployeeTopicActionResult> {
    return this.admitEmployeeMutation(employeeId, id => this.createEmployeeTopicForBinding(id))
  }

  private async createEmployeeTopicForBinding(employeeId: OfficeEmployeeId, assertCurrent?: () => void): Promise<OfficeEmployeeTopicActionResult> {
    if (this.disposed) return { status: 'rejected', reason: 'coordinator-disposed' }
    if (!isOfficeEmployeeId(employeeId)) {
      return { status: 'rejected', reason: `unknown employee: ${employeeId}` }
    }
    if (!assertCurrent) {
      await this.profiles?.refresh(employeeId)
      const profile = this.getEmployeeCharacterAIProfile(employeeId)
      if (!profile?.selection) return { status: 'rejected', reason: readWorkFolderProfileOptions(this.profiles, employeeId).reason ?? '角色模型暂不可核实，草稿已保留。' }
      const configuration = { ...profile.selection, characterAIProfileRevision: profile.revision }
      assertCurrent = () => { const reason = this.profileFailure(employeeId, configuration); if (reason) throw new Error(reason) }
    }
    if (this.employeeHasRunningTopic(employeeId)) {
      return { status: 'rejected', reason: '当前任务执行中，请先停止或等待完成' }
    }
    try { assertCurrent?.() } catch (error) { return { status: 'rejected', reason: errorOf(error).message } }
    const seat = await this.relationships.autoAssignWorkstation(employeeId)
    const seatFailure = mutationError('assign employee workstation', seat)
    if (seatFailure !== undefined) return { status: 'rejected', reason: seatFailure.message }

    const target = await this.resolveTopicTarget(employeeId)
    try { assertCurrent?.() } catch (error) { return { status: 'rejected', reason: errorOf(error).message } }
    if (target === undefined) {
      // No Host-owned folder and no bound workspace: keep Harness' own picker
      // as the last resort instead of inventing a directory.
      const launchToken = ++this.launchToken
      this.pendingWorkspaceSelection = { employeeId, launchToken }
      this.runtime.sessions.clear()
      this.reconcilePendingWorkspaceSelection()
      return { status: 'select-workspace', employeeId }
    }
    try {
      const sessionId = await this.openDedicatedTopic(employeeId, target, assertCurrent)
      assertCurrent?.()
      this.runtime.sessions.open(sessionId)
      return { status: 'accepted', employeeId, sessionId }
    } catch (error) {
      return { status: 'rejected', reason: errorOf(error).message }
    }
  }

  /**
   * Resolve where this employee's next topic belongs: always the Host-owned
   * employee folder. A role's folder is part of its identity — the AGENTS.md
   * seeded in it is the role's long-term memory — so a topic never adopts an
   * unrelated project directory, and a binding left by an earlier build is
   * cleared instead of honoured. `undefined` means the Host provides no employee
   * folder, and the caller then falls back to the workspace picker.
   */
  private async resolveTopicTarget(employeeId: OfficeEmployeeId): Promise<OfficeTopicTarget | undefined> {
    const relationship = this.relationships.getSnapshot().relationships.employees[employeeId]
    if (relationship.workspaceId !== undefined) {
      const cleared = await this.relationships.updateHarnessRelationship(employeeId, { workspaceId: null })
      const failure = mutationError('clear legacy employee workspace', cleared)
      if (failure !== undefined) throw failure
    }
    if (this.workspacePort === undefined) return undefined
    const folder = await this.workspacePort.ensureEmployeeFolder(employeeId)
    return folder.path === undefined ? undefined : { kind: 'cwd', cwd: folder.path }
  }

  /** Create a dedicated topic on the resolved target and bind the relationship. */
  private async openDedicatedTopic(
    employeeId: OfficeEmployeeId,
    target: OfficeTopicTarget,
    assertCurrent?: () => void,
  ): Promise<SessionId> {
    assertCurrent?.()
    if (target.kind === 'workspace') {
      const sessionId = await this.createDedicatedSession(employeeId, target, assertCurrent)
      assertCurrent?.()
      await this.persistHarnessRelationship(employeeId, target.workspaceId, sessionId)
      return sessionId
    }
    const sessionId = await this.createDedicatedSession(employeeId, target, assertCurrent)
    assertCurrent?.()
    await this.persistHarnessRelationship(
      employeeId,
      this.workspaceForSession(sessionId),
      sessionId,
    )
    return sessionId
  }

  /**
   * Report where this employee works right now, without creating a topic. It is
   * always the role's own folder: the portrait renders the path because it is
   * the boundary every file permission is measured against.
   */
  async loadEmployeeWorkspace(employeeId: string): Promise<PortraitWorkspaceState> {
    if (!isOfficeEmployeeId(employeeId)) return { kind: 'folder', reason: '不是内置员工' }
    if (this.workspacePort === undefined) {
      return { kind: 'folder', reason: '当前应用未提供员工工作文件夹，将使用 Harness 工作区选择器' }
    }
    return this.workspacePort.ensureEmployeeFolder(employeeId)
  }

  /** Select a real employee-attributed Harness topic without leaving the portrait surface. */
  async activateEmployeeTopic(
    employeeId: string,
    sessionId: SessionId,
  ): Promise<OfficeEmployeeTopicActionResult> {
    if (this.disposed) return { status: 'rejected', reason: 'coordinator-disposed' }
    if (!isOfficeEmployeeId(employeeId)) {
      return { status: 'rejected', reason: `unknown employee: ${employeeId}` }
    }
    const summary = this.runtime.sessions.list.getSnapshot().byId[sessionId]
    if (summary === undefined || !this.topicBelongsToEmployee(employeeId, summary)) {
      return { status: 'rejected', reason: '话题不存在或不属于该员工' }
    }
    const current = this.relationships.getSnapshot().relationships.employees[employeeId].activeSessionId
    if (current !== undefined && current !== String(sessionId)
      && this.employeeHasRunningTopic(employeeId)) {
      return { status: 'rejected', reason: '当前任务执行中，不能切换到其他话题' }
    }
    const workspaceId = this.workspaceForSession(sessionId)
    const updated = await this.relationships.updateHarnessRelationship(employeeId, {
      activeSessionId: String(sessionId),
      ...(workspaceId === undefined ? {} : { workspaceId: String(workspaceId) }),
    })
    const failure = mutationError('activate employee topic', updated)
    if (failure !== undefined) return { status: 'rejected', reason: failure.message }
    this.runtime.sessions.open(sessionId)
    return { status: 'accepted', employeeId, sessionId }
  }

  /**
   * Read the selected employee session's real model directory and permission
   * projection for the portrait composer. No model catalog is copied into
   * Luma; Harness remains the authoritative source on every open.
   */
  async loadEmployeeComposerOptions(
    employeeId: string,
    requestedSessionId?: SessionId,
  ): Promise<PortraitComposerOptions> {
    if (!isOfficeEmployeeId(employeeId)) {
      return {
        status: 'unavailable',
        models: [],
        permissions: [],
        acceptedMediaTypes: PORTRAIT_IMAGE_MEDIA_TYPES,
        reason: `unknown employee: ${employeeId}`,
      }
    }
    await this.profiles?.refresh(employeeId)
    const bound = readWorkFolderProfileOptions(this.profiles, employeeId)
    if (bound.status !== 'ready') return { ...bound, acceptedMediaTypes: PORTRAIT_IMAGE_MEDIA_TYPES }
    const relationship = this.relationships.getSnapshot().relationships.employees[employeeId]
    const sessionId = requestedSessionId ?? (relationship.activeSessionId as SessionId | undefined)
    if (sessionId === undefined) return {
      ...bound, sessionBound: false, permissions: DEFAULT_PORTRAIT_PERMISSIONS,
      acceptedMediaTypes: PORTRAIT_IMAGE_MEDIA_TYPES,
      characterAIProfileRevision: this.getEmployeeCharacterAIProfile(employeeId)!.revision,
    }
    const summary = this.runtime.sessions.list.getSnapshot().byId[sessionId]
    if (!summary || !this.topicBelongsToEmployee(employeeId, summary)) return {
      status: 'unavailable', models: [], permissions: [], acceptedMediaTypes: PORTRAIT_IMAGE_MEDIA_TYPES,
      reason: '话题不存在或不属于该员工，草稿已保留。',
    }
    const permissions = permissionOptionsOf(this.runtime.sessions.binding(sessionId)?.session.projections.faceOf('permissions').getSnapshot())
    return {
      ...bound, permissions: permissions.options, acceptedMediaTypes: PORTRAIT_IMAGE_MEDIA_TYPES,
      characterAIProfileRevision: this.getEmployeeCharacterAIProfile(employeeId)!.revision,
      ...(permissions.current === undefined ? {} : { currentPermissionId: permissions.current }),
    }
  }

  /** Read only after the shared owner has verified this role's configured route. */
  getEmployeeCharacterAIProfile(employeeId: OfficeEmployeeId) {
    return readWorkFolderProfileOptions(this.profiles, employeeId).status === 'ready'
      ? this.profiles?.getSnapshot(employeeId).state?.profile : undefined
  }

  private async admitEmployeeMutation(employeeId: string, operation: (id: OfficeEmployeeId) => Promise<OfficeEmployeeTopicActionResult>): Promise<OfficeEmployeeTopicActionResult> {
    if (this.disposed || !isOfficeEmployeeId(employeeId)) return { status: 'rejected', reason: '角色工作连接不可用，草稿已保留。' }
    if (this.pendingEmployees.has(employeeId)) return { status: 'rejected', reason: '这位角色的工作请求正在确认，请等待结果后再操作。草稿已保留。' }
    this.pendingEmployees.add(employeeId)
    try { return await operation(employeeId) }
    finally { this.pendingEmployees.delete(employeeId) }
  }

  private topicFailure(employeeId: OfficeEmployeeId, sessionId: SessionId | undefined,
    expected?: NonNullable<ReturnType<OfficeEmployeeSessionRuntime['sessions']['binding']>>['session']): string | undefined {
    if (sessionId === undefined) return undefined
    const summary = this.runtime.sessions.list.getSnapshot().byId[sessionId]
    const session = this.runtime.sessions.binding(sessionId)?.session
    if (!summary || !this.topicBelongsToEmployee(employeeId, summary)
      || this.runtime.workspaces.list.getSnapshot().archivedSessionIds.includes(sessionId)
      || !session || expected !== undefined && session !== expected) {
      return '原工作话题已失效或归属发生变化，请重新核对话题。草稿已保留。'
    }
    return undefined
  }

  private profileFailure(employeeId: OfficeEmployeeId, configuration: PortraitComposerConfiguration | undefined): string | undefined {
    if (this.disposed) return '工作连接已关闭，草稿已保留。'
    const options = readWorkFolderProfileOptions(this.profiles, employeeId)
    if (options.status !== 'ready') return options.reason ?? '无法核实角色模型，草稿已保留。'
    const profile = this.getEmployeeCharacterAIProfile(employeeId)!
    const selection = profile.selection!
    if (!configuration || configuration.characterAIProfileRevision !== profile.revision
      || configuration.provider !== selection.provider || configuration.model !== selection.model
      || configuration.reasoningEffort !== selection.reasoningEffort) {
      return '角色模型绑定已变化或请求缺少当前绑定确认，请在「设置 → 角色与 AI」核对后重新发送。草稿已保留。'
    }
    return undefined
  }

  /** Apply model, reasoning, and permission choices to one employee topic. */
  async configureEmployeeComposer(
    employeeId: string,
    requestedSessionId: SessionId | undefined,
    configuration: PortraitComposerConfiguration,
  ): Promise<OfficeEmployeeTopicActionResult> {
    return this.admitEmployeeMutation(employeeId, id => this.configureEmployeeComposerForBinding(id, requestedSessionId, configuration))
  }

  private async configureEmployeeComposerForBinding(
    employeeId: string,
    requestedSessionId: SessionId | undefined,
    configuration: PortraitComposerConfiguration,
  ): Promise<OfficeEmployeeTopicActionResult> {
    if (!isOfficeEmployeeId(employeeId)) {
      return { status: 'rejected', reason: `unknown employee: ${employeeId}` }
    }
    let target = requestedSessionId
    let expectedSession: NonNullable<ReturnType<OfficeEmployeeSessionRuntime['sessions']['binding']>>['session'] | undefined
    await this.profiles?.refresh(employeeId)
    const current = () => this.profileFailure(employeeId, configuration)
      ?? this.topicFailure(employeeId, target, expectedSession)
      ?? (this.employeeHasRunningTopic(employeeId) ? '当前任务执行中，请先停止或等待完成' : undefined)
    const invalid = current()
    if (invalid) return { status: 'rejected', reason: invalid }
    const relationship = this.relationships.getSnapshot().relationships.employees[employeeId]
    const sessionId = requestedSessionId
      ?? (relationship.activeSessionId as SessionId | undefined)
    if (sessionId === undefined) {
      return { status: 'rejected', reason: '请先创建话题，再设置模型与权限' }
    }
    target = sessionId
    const summary = this.runtime.sessions.list.getSnapshot().byId[sessionId]
    if (summary === undefined || !this.topicBelongsToEmployee(employeeId, summary)) {
      return { status: 'rejected', reason: '话题不存在或不属于该员工' }
    }
    if (this.sessionIsRunning(sessionId)) {
      return { status: 'rejected', reason: '当前任务执行中，不能修改模型或权限' }
    }
    const session = this.runtime.sessions.binding(sessionId)?.session
    if (session === undefined) return { status: 'rejected', reason: '话题尚未就绪，请稍后重试' }
    expectedSession = session
    const failure = await this.applyComposerConfiguration(sessionId, session, configuration, current)
    return failure === undefined
      ? { status: 'accepted', employeeId, sessionId }
      : { status: 'rejected', reason: failure }
  }

  /** Send configured text and image content through the public SessionFace authority. */
  async sendEmployeePrompt(
    employeeId: string,
    sessionId: SessionId | undefined,
    text: string,
    configuration?: PortraitComposerConfiguration,
    images: readonly PortraitComposerImage[] = [],
    origin?: 'desktop-pet',
  ): Promise<OfficeEmployeeTopicActionResult> {
    return this.admitEmployeeMutation(employeeId, id => this.sendEmployeePromptForBinding(id, sessionId, text, configuration, images, origin))
  }

  private async sendEmployeePromptForBinding(
    employeeId: string,
    sessionId: SessionId | undefined,
    text: string,
    configuration?: PortraitComposerConfiguration,
    images: readonly PortraitComposerImage[] = [],
    origin?: 'desktop-pet',
  ): Promise<OfficeEmployeeTopicActionResult> {
    const content = text.trim()
    if (content === '' && images.length === 0) return { status: 'rejected', reason: '请输入任务内容或添加图片' }
    if (!isOfficeEmployeeId(employeeId)) {
      return { status: 'rejected', reason: `unknown employee: ${employeeId}` }
    }
    let target = sessionId
    let expectedSession: NonNullable<ReturnType<OfficeEmployeeSessionRuntime['sessions']['binding']>>['session'] | undefined
    await this.profiles?.refresh(employeeId)
    const current = () => this.profileFailure(employeeId, configuration)
      ?? this.topicFailure(employeeId, target, expectedSession)
      ?? (this.employeeHasRunningTopic(employeeId) ? '当前任务执行中，请先停止或等待完成' : undefined)
    const assertCurrent = () => { const reason = current(); if (reason) throw new Error(reason) }
    const invalid = current()
    if (invalid) return { status: 'rejected', reason: invalid }
    if (this.employeeHasRunningTopic(employeeId)) {
      return { status: 'rejected', reason: '当前任务执行中，请先停止或等待完成' }
    }

    if (target === undefined) {
      const created = await this.createEmployeeTopicForBinding(employeeId, assertCurrent)
      if (created.status !== 'accepted') return created
      target = created.sessionId
    } else {
      const activated = await this.activateEmployeeTopic(employeeId, target)
      if (activated.status !== 'accepted') return activated
    }

    const changed = current()
    if (changed) return { status: 'rejected', reason: changed }
    const seat = await this.relationships.autoAssignWorkstation(employeeId)
    const seatFailure = mutationError('assign employee workstation', seat)
    if (seatFailure !== undefined) return { status: 'rejected', reason: seatFailure.message }
    const session = this.runtime.sessions.binding(target)?.session
    if (session === undefined) return { status: 'rejected', reason: '话题尚未就绪，请稍后重试' }
    expectedSession = session
    if (configuration !== undefined) {
      const failure = await this.applyComposerConfiguration(target, session, configuration, current)
      if (failure !== undefined) return { status: 'rejected', reason: failure }
    }
    if (images.some(image => !isPortraitImageMediaType(image.mediaType)
      || typeof image.data !== 'string' || image.data.trim() === '')) {
      return { status: 'rejected', reason: '图片格式或内容无效' }
    }
    const beforeOrigin = current()
    if (beforeOrigin) return { status: 'rejected', reason: beforeOrigin }
    if (origin === 'desktop-pet') {
      if (!this.markDesktopOrigin) return { status: 'rejected', reason: '桌宠工作来源服务不可用，草稿已保留。' }
      try { await this.markDesktopOrigin(employeeId, target) }
      catch { return { status: 'rejected', reason: '桌宠工作来源未能持久保存，草稿已保留。' } }
      const afterOrigin = current()
      if (afterOrigin) return { status: 'rejected', reason: afterOrigin }
      // A durable Harness title makes the source visible in existing topic lists.
      const renamed = await this.runtime.api.sessions.rename({
        sessionId: target,
        title: `桌宠工作 · ${OFFICE_EMPLOYEE_DEFINITIONS[employeeId].displayName}`,
      })
      if (!renamed.result.ok) return { status: 'rejected', reason: `无法标记桌宠来源：${renamed.result.error.message}` }
    }
    const imageParts: PromptContentPart[] = images.map(image => ({
      type: 'image',
      mediaType: image.mediaType,
      data: image.data,
      ...(image.name === undefined || image.name === '' ? {} : { name: image.name }),
    }))
    const promptParts: PromptContentPart[] = [
      ...imageParts,
      ...(content === '' ? [] : [{ type: 'text' as const, text: content }]),
    ]
    await this.profiles?.refresh(employeeId)
    const beforePrompt = current()
    if (beforePrompt) return { status: 'rejected', reason: beforePrompt }
    if (this.employeeHasRunningTopic(employeeId)) return { status: 'rejected', reason: '当前任务执行中，请先停止或等待完成' }
    const result = await session.prompt(promptParts, 'queue')
    if (!result.ok) {
      return { status: 'rejected', reason: `${result.error.code}: ${result.error.message}` }
    }
    return { status: 'accepted', employeeId, sessionId: target }
  }

  private async applyComposerConfiguration(
    sessionId: SessionId,
    session: NonNullable<ReturnType<OfficeEmployeeSessionRuntime['sessions']['binding']>>['session'],
    configuration: PortraitComposerConfiguration,
    current: () => string | undefined,
  ): Promise<string | undefined> {
    const invalid = current()
    if (invalid) return invalid
    if (configuration.provider.trim() === '' || configuration.model.trim() === '') {
      return '请选择有效模型'
    }
    if (configuration.reasoningEffort !== undefined
      && configuration.reasoningEffort.trim() === '') {
      return '请选择有效推理强度'
    }
    if (configuration.permissionPreset !== undefined
      && configuration.permissionPreset.trim() === '') {
      return '请选择有效执行权限'
    }
    if (configuration.permissionPreset === 'danger-full-access'
      && configuration.fullAccessAcknowledged !== true) {
      return '启用完全访问前需要明确确认风险'
    }

    const selected = await this.runtime.api.sessions.selectModel({
      sessionId,
      provider: configuration.provider,
      model: configuration.model,
      ...(configuration.reasoningEffort === undefined
        ? {}
        : { reasoningEffort: configuration.reasoningEffort }),
    })
    const changed = current()
    if (changed) return changed
    if (!selected.result.ok) {
      return `${selected.result.error.code}: ${selected.result.error.message}`
    }
    if (configuration.permissionPreset === undefined) return undefined

    const switched = await session.command(`/permission ${configuration.permissionPreset}`)
    const afterPermission = current()
    if (afterPermission) return afterPermission
    if (!switched.ok) return `${switched.error.code}: ${switched.error.message}`
    return switched.value.matched
      ? undefined
      : '当前 Harness 未提供权限切换能力'
  }

  /** Stop only the requested Harness turn; queued work remains Harness-owned. */
  async stopEmployeeTask(
    employeeId: string,
    sessionId: SessionId,
  ): Promise<OfficeEmployeeTopicActionResult> {
    if (!isOfficeEmployeeId(employeeId)) {
      return { status: 'rejected', reason: `unknown employee: ${employeeId}` }
    }
    const summary = this.runtime.sessions.list.getSnapshot().byId[sessionId]
    if (summary === undefined || !this.topicBelongsToEmployee(employeeId, summary)) {
      return { status: 'rejected', reason: '话题不存在或不属于该员工' }
    }
    const session = this.runtime.sessions.binding(sessionId)?.session
    if (session === undefined) return { status: 'rejected', reason: '话题尚未就绪' }
    const result = await session.cancel()
    if (!result.ok) {
      return { status: 'rejected', reason: `${result.error.code}: ${result.error.message}` }
    }
    return { status: 'accepted', employeeId, sessionId }
  }

  /**
   * Delete one topic: archive it out of every Luma surface, then physically
   * remove its persisted log through the Host-owned employee storage.
   *
   * The public Harness API deliberately exposes no log deletion, so the second
   * half is a Luma Host capability. When the Host has none, the topic is still
   * archived; the caller reports that distinction instead of claiming a
   * deletion that did not happen.
   */
  async archiveEmployeeTopic(
    employeeId: string,
    sessionId: SessionId,
  ): Promise<OfficeEmployeeTopicArchiveResult> {
    if (!isOfficeEmployeeId(employeeId)) {
      return { status: 'rejected', reason: `unknown employee: ${employeeId}` }
    }
    const summary = this.runtime.sessions.list.getSnapshot().byId[sessionId]
    if (summary === undefined || !this.topicBelongsToEmployee(employeeId, summary)) {
      return { status: 'rejected', reason: '话题不存在或不属于该员工' }
    }
    if (this.sessionIsRunning(sessionId)) {
      return { status: 'rejected', reason: '正在执行的话题不能删除，请先停止或等待完成' }
    }
    try {
      await this.runtime.workspaces.archiveSession(sessionId)
      const purge = this.workspacePort === undefined
        ? 'unavailable' as const
        : await this.workspacePort.purgeEmployeeTopic(sessionId)
      const relationship = this.relationships.getSnapshot().relationships.employees[employeeId]
      if (relationship.activeSessionId === String(sessionId)) {
        const archived = new Set(this.runtime.workspaces.list.getSnapshot().archivedSessionIds.map(String))
        archived.add(String(sessionId))
        const fallback = this.runtime.sessions.list.getSnapshot().ids
          .map(id => this.runtime.sessions.list.getSnapshot().byId[id])
          .filter((candidate): candidate is SessionSummary => candidate !== undefined
            && !archived.has(String(candidate.id))
            && this.topicBelongsToEmployee(employeeId, candidate))
          .sort((left, right) => right.updatedAt - left.updatedAt)[0]
        const fallbackWorkspaceId = fallback === undefined ? undefined : this.workspaceForSession(fallback.id)
        const updated = await this.relationships.updateHarnessRelationship(employeeId, {
          activeSessionId: fallback === undefined ? null : String(fallback.id),
          ...(fallbackWorkspaceId === undefined ? {} : { workspaceId: String(fallbackWorkspaceId) }),
        })
        const failure = mutationError('select fallback employee topic', updated)
        if (failure !== undefined) return { status: 'rejected', reason: failure.message }
        if (fallback !== undefined) this.runtime.sessions.open(fallback.id)
      }
      return { status: 'accepted', employeeId, sessionId, purge }
    } catch (error) {
      return { status: 'rejected', reason: errorOf(error).message }
    }
  }

  private isCurrentLaunch(token: number): boolean {
    return !this.disposed && token === this.launchToken
  }

  private superseded(): OfficeEmployeeSessionLaunchResult {
    return { status: 'rejected', reason: 'employee launch superseded' }
  }

  private workspaceExists(workspaceId: WorkspaceId): boolean {
    return this.runtime.workspaces.list.getSnapshot().items
      .some(workspace => workspace.workspaceId === workspaceId)
  }

  private workspaceForSession(sessionId: SessionId): WorkspaceId | undefined {
    return this.runtime.workspaces.list.getSnapshot().items
      .find(workspace => workspace.sessionIds.includes(sessionId))?.workspaceId
  }

  private topicBelongsToEmployee(employeeId: OfficeEmployeeId, summary: SessionSummary): boolean {
    const relationship = this.relationships.getSnapshot().relationships.employees[employeeId]
    return relationship.activeSessionId === String(summary.id)
      || summary.agentPreset === OFFICE_EMPLOYEE_DEFINITIONS[employeeId].agentPresetId
  }

  private sessionIsRunning(sessionId: SessionId): boolean {
    const list = this.runtime.sessions.list.getSnapshot()
    const summary = list.byId[sessionId]
    const conversation = this.runtime.sessions.binding(sessionId)?.session.getSnapshot()
    const jobs = list.jobsBySession[sessionId] ?? []
    return summary?.running === true || conversation?.running === true
      || jobs.some(job => job.status === 'running' || job.status === 'stopping')
  }

  private employeeHasRunningTopic(employeeId: OfficeEmployeeId): boolean {
    const archived = new Set(this.runtime.workspaces.list.getSnapshot().archivedSessionIds.map(String))
    const list = this.runtime.sessions.list.getSnapshot()
    return list.ids.some((sessionId) => {
      const summary = list.byId[sessionId]
      return summary !== undefined
        && !archived.has(String(sessionId))
        && this.topicBelongsToEmployee(employeeId, summary)
        && this.sessionIsRunning(sessionId)
    })
  }

  private sessionClaimedByAnotherEmployee(
    employeeId: OfficeEmployeeId,
    sessionId: SessionId,
  ): boolean {
    const employees = this.relationships.getSnapshot().relationships.employees
    return OFFICE_EMPLOYEE_IDS.some(candidate => (
      candidate !== employeeId
      && employees[candidate].activeSessionId === String(sessionId)
    ))
  }

  private async prepareExistingSession(
    employeeId: OfficeEmployeeId,
    summary: SessionSummary,
  ): Promise<void> {
    if (this.sessionClaimedByAnotherEmployee(employeeId, summary.id)) {
      throw new Error(`session already belongs to another employee: ${String(summary.id)}`)
    }
    // A nonblank session's composition is immutable by product contract. Even
    // a legacy relationship with another preset is opened as-is.
    if (!summary.blank) return
    await this.applyEmployeePreset(employeeId, summary)
  }

  private async connectEmployeeWorkspace(
    employeeId: OfficeEmployeeId,
    workspaceId: WorkspaceId,
  ): Promise<SessionId> {
    let sessionId = await this.runtime.workspaces.connectWorkspace(workspaceId)
    let summary = this.runtime.sessions.list.getSnapshot().byId[sessionId]
    if (summary === undefined) {
      throw new Error(`connected session unavailable: ${String(sessionId)}`)
    }
    if (this.sessionClaimedByAnotherEmployee(employeeId, sessionId)) {
      sessionId = await this.createDedicatedSession(employeeId, { kind: 'workspace', workspaceId })
      summary = this.runtime.sessions.list.getSnapshot().byId[sessionId]
      if (summary === undefined) {
        throw new Error(`created session unavailable: ${String(sessionId)}`)
      }
    } else {
      if (!summary.blank) {
        throw new Error(`workspace returned a nonblank session: ${String(sessionId)}`)
      }
      await this.applyEmployeePreset(employeeId, summary)
    }
    await this.persistHarnessRelationship(employeeId, workspaceId, sessionId)
    return sessionId
  }

  /**
   * Create one employee topic on an explicit target. A workspace accounts the
   * session to that workspace; a directory is passed as the session's own cwd,
   * which is also the boundary `workspace-write` is measured against.
   */
  private async createDedicatedSession(
    employeeId: OfficeEmployeeId,
    target: OfficeTopicTarget,
    assertCurrent?: () => void,
  ): Promise<SessionId> {
    if (!assertCurrent) {
      await this.profiles?.refresh(employeeId)
      const profile = this.getEmployeeCharacterAIProfile(employeeId)
      if (!profile?.selection) throw new Error(readWorkFolderProfileOptions(this.profiles, employeeId).reason ?? '角色模型暂不可核实，草稿已保留。')
      const configuration = { ...profile.selection, characterAIProfileRevision: profile.revision }
      assertCurrent = () => { const reason = this.profileFailure(employeeId, configuration); if (reason) throw new Error(reason) }
    }
    assertCurrent?.()
    const agentPreset = OFFICE_EMPLOYEE_DEFINITIONS[employeeId].agentPresetId
    const response = await this.runtime.api.sessions.create(target.kind === 'workspace'
      ? { workspaceId: target.workspaceId, agentPreset }
      : { cwd: target.cwd, agentPreset })
    if (!response.result.ok) {
      throw new Error(`employee session create failed: ${response.result.error.message}`)
    }
    const sessionId = response.result.value.sessionId
    await this.waitForSession(sessionId)
    this.runtime.sessions.noteAgentPreset(
      sessionId,
      response.result.value.agentPreset ?? agentPreset,
    )
    return sessionId
  }

  private async applyEmployeePreset(
    employeeId: OfficeEmployeeId,
    summary: SessionSummary,
  ): Promise<void> {
    if (!summary.blank) return
    const agentPreset = OFFICE_EMPLOYEE_DEFINITIONS[employeeId].agentPresetId
    if (summary.agentPreset === agentPreset) return
    const response = await this.runtime.api.agentPresets.select({
      sessionId: summary.id,
      agentPreset,
    })
    if (!response.result.ok) {
      throw new Error(`employee preset selection failed: ${response.result.error.message}`)
    }
    this.runtime.sessions.noteAgentPreset(summary.id, response.result.value.agentPreset)
  }

  /**
   * Persist the employee's topic pointer. A topic created in the employee's own
   * folder belongs to no workspace, so the workspace reference is only written
   * when it actually exists — an inherited or stale id is never invented here.
   */
  private async persistHarnessRelationship(
    employeeId: OfficeEmployeeId,
    workspaceId: WorkspaceId | undefined,
    sessionId: SessionId,
  ): Promise<void> {
    const result = await this.relationships.updateHarnessRelationship(employeeId, {
      ...(workspaceId === undefined ? {} : { workspaceId: String(workspaceId) }),
      activeSessionId: String(sessionId),
    })
    const failure = mutationError('persist employee Harness relationship', result)
    if (failure !== undefined) throw failure
  }

  private reconcilePendingWorkspaceSelection(): void {
    const pending = this.pendingWorkspaceSelection
    if (pending === undefined || !this.isCurrentLaunch(pending.launchToken)) return
    const sessions = this.runtime.sessions.list.getSnapshot()
    const currentId = sessions.current
    if (currentId === undefined) return
    const summary = sessions.byId[currentId]
    if (summary === undefined) return
    // Selecting an existing conversation cancels the employee claim and is
    // never used as an excuse to mutate a nonblank session's preset.
    if (!summary.blank) {
      this.pendingWorkspaceSelection = undefined
      return
    }
    const workspaceId = this.workspaceForSession(currentId)
    if (workspaceId === undefined) return

    this.pendingWorkspaceSelection = undefined
    void this.finishPendingWorkspaceSelection(
      pending.employeeId,
      workspaceId,
      summary,
      pending.launchToken,
    )
      .catch((error: unknown) => {
        if (this.runtime.sessions.list.getSnapshot().current === currentId) {
          this.runtime.sessions.clear()
        }
        this.onError(errorOf(error))
      })
  }

  private async finishPendingWorkspaceSelection(
    employeeId: OfficeEmployeeId,
    workspaceId: WorkspaceId,
    selected: SessionSummary,
    launchToken: number,
  ): Promise<void> {
    if (!this.isCurrentLaunch(launchToken)) return
    let sessionId = selected.id
    if (this.sessionClaimedByAnotherEmployee(employeeId, sessionId)) {
      sessionId = await this.createDedicatedSession(employeeId, { kind: 'workspace', workspaceId })
    } else {
      await this.applyEmployeePreset(employeeId, selected)
    }
    if (!this.isCurrentLaunch(launchToken)) return
    await this.persistHarnessRelationship(employeeId, workspaceId, sessionId)
    if (this.isCurrentLaunch(launchToken)) this.runtime.sessions.open(sessionId)
  }

  private waitForSession(sessionId: SessionId): Promise<void> {
    if (this.runtime.sessions.list.getSnapshot().byId[sessionId] !== undefined) {
      return Promise.resolve()
    }
    return new Promise((resolve, reject) => {
      let settled = false
      const stop = this.runtime.sessions.list.subscribe(() => {
        if (settled || this.runtime.sessions.list.getSnapshot().byId[sessionId] === undefined) return
        settled = true
        clearTimeout(timeout)
        stop()
        resolve()
      })
      const timeout = setTimeout(() => {
        if (settled) return
        settled = true
        stop()
        reject(new Error(`created session did not reach Harness list: ${String(sessionId)}`))
      }, this.sessionArrivalTimeoutMs)
    })
  }
}

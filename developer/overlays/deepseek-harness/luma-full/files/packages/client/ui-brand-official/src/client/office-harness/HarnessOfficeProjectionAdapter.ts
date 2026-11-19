/**
 * Read-only boundary between Harness' durable session domain and the Luma
 * office presentation. The office consumes facts through this file; it never
 * receives a prompt/cancel/approval/task-completion verb.
 */
import type {
  ConversationNode,
  ConversationSnapshot,
  ISessions,
  IWorkspaces,
  JobView,
  SessionId,
  SessionListState,
  SessionSummary,
} from '@deepseek-ai/dsh-client-runtime/client'
import type { SceneEvent } from './SceneProtocol.ts'

/** A character-to-Harness relationship owned by the office integration. */
export interface OfficeEmployeeAssignment {
  employeeId: string
  displayName: string
  /** Fixed Harness preset used to attribute every durable topic to this employee. */
  agentPresetId?: string
  sessionId?: SessionId
  workstationId?: string
}

/** Snapshot of the small office-owned relationship domain. */
export interface OfficeRelationshipSnapshot {
  employees: readonly OfficeEmployeeAssignment[]
}

/** Observable relationship source; persistence policy stays outside the adapter. */
export interface OfficeRelationshipSource {
  getSnapshot(): OfficeRelationshipSnapshot
  subscribe?(listener: () => void): () => void
}

/** Harness facts needed by the pure projection. */
export interface HarnessOfficeSourceSnapshot {
  sessions: SessionListState
  conversations: Readonly<Record<string, ConversationSnapshot | undefined>>
  /** Harness' registry-global archive set. Archived topics stay durable but leave the office drawer. */
  archivedSessionIds?: readonly SessionId[]
}

/** Observable read port over Harness. It deliberately has no mutation verbs. */
export interface HarnessOfficeProjectionSource {
  getSnapshot(): HarnessOfficeSourceSnapshot
  subscribe(listener: () => void): () => void
}

export type OfficeTaskVisualState =
  | 'idle'
  | 'running'
  | 'awaiting-user'
  | 'stopping'
  | 'completed'
  | 'failed'

export type OfficeSceneActivity = 'idle' | 'working'

export type OfficeAttentionKind = 'approval' | 'question' | 'plan-review'

/** Terminal state observed from the real Harness conversation timeline. */
export type OfficeReportTaskStatus = 'completed' | 'stopped' | 'failed' | 'max-tokens'

/** One completed Harness exchange retained as a durable office-facing report. */
export interface OfficeReportVisualState {
  reportId: string
  employeeId: string
  sessionId: SessionId
  title: string
  artifactPaths: readonly string[]
  /** Time of the latest user request, when its source event is in the loaded window. */
  createdAt?: number
  /** Matching turn/start time, when Harness retained that timing in the loaded window. */
  startedAt?: number
  /** Terminal assistant/turn event time. Never substituted with session recency. */
  completedAt?: number
  /** Terminal result derived from an observed assistant/error/cap event. */
  taskStatus?: OfficeReportTaskStatus
  /** Complete latest user request represented by this Harness completion. */
  promptText?: string
  /** Complete latest assistant prose represented by this Harness completion. */
  responseText?: string
  /** Stable model identity when Harness published provenance. */
  model?: string
  workstationId?: string
  /** Host workflow provenance; absent means the ordinary app/office path. */
  origin?: 'desktop'
}

/** Presentation facts for one employee. */
export interface OfficeEmployeeVisualState {
  employeeId: string
  displayName: string
  taskState: OfficeTaskVisualState
  sceneActivity: OfficeSceneActivity
  attention: OfficeAttentionKind | null
  canDrag: boolean
  report: OfficeReportVisualState | null
  activeJobCount: number
  artifactCount: number
  /** Stable Harness-owned task identity for the current conversation turn. */
  taskId?: string
  sessionId?: SessionId
  workstationId?: string
}

export interface OfficeTopicMessageVisualState {
  messageId: string
  role: 'user' | 'assistant'
  text: string
}

/** One real Harness session projected as an employee topic. */
export interface OfficeTopicVisualState {
  employeeId: string
  sessionId: SessionId
  title: string
  excerpt: string
  updatedAt: number
  taskState: OfficeTaskVisualState
  unreadCompletion: boolean
  answerCount: number
  artifactCount: number
  messages: readonly OfficeTopicMessageVisualState[]
  /** Missing/cold/loading/error bindings cannot establish an empty history. */
  contentState?: 'loaded' | 'unloaded'
}

/** Complete read model consumed by the office scene and its surrounding UI. */
export interface HarnessOfficeProjection {
  selectedSessionId: SessionId | undefined
  employees: readonly OfficeEmployeeVisualState[]
  /** Completed reports retained for Results and portrait history. */
  reports: readonly OfficeReportVisualState[]
  /** Unread report files currently visible on office desks. */
  officeReportMarkers: readonly OfficeReportVisualState[]
  /** All non-archived employee-attributed Harness sessions, newest first. */
  topics?: readonly OfficeTopicVisualState[]
}

/** Request emitted when a character is clicked. */
export interface HarnessConversationLaunchRequest {
  employeeId: string
  displayName: string
  sessionId?: SessionId
  workstationId?: string
}

/**
 * Navigation port owned by the Harness shell. An existing-session
 * implementation should call `ctx.sessions.open(sessionId)`; a future
 * employee without a session can be routed through Harness' own New Session
 * flow without changing the office adapter.
 */
export interface HarnessConversationLauncher {
  openConversation(request: HarnessConversationLaunchRequest): void | Promise<void>
}

/** Scene callbacks are observations only, never task lifecycle authority. */
export type OfficeSceneEvent = SceneEvent

/** Optional sink for animation telemetry or office-only state. */
export interface OfficeSceneObservationPort {
  observeSceneEvent(event: OfficeSceneEvent): void
}

export interface OfficeSceneEventDisposition {
  authority: 'visual-only'
  taskMutation: 'forbidden'
  forwarded: boolean
}

export type EmployeeLaunchResult = 'opened' | 'unknown-employee'
export type ReportLaunchResult = 'opened' | 'unknown-report'

/** Narrow structural view of the optional `deliverables` turn-data value. */
interface DeliverablesValue {
  produced: readonly unknown[]
}

interface ProducedPathValue {
  path: string
}

function isProducedPathValue(value: unknown): value is ProducedPathValue {
  return typeof value === 'object' && value !== null
    && typeof (value as { path?: unknown }).path === 'string'
}

function isDeliverablesValue(value: unknown): value is DeliverablesValue {
  return typeof value === 'object' && value !== null
    && Array.isArray((value as { produced?: unknown }).produced)
}

function observedTimestamp(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

/**
 * Read produced-file paths from the public, merge-extensible Conversation
 * timeline. The `deliverables` capability is optional: absent or malformed
 * values degrade to an empty list rather than inventing artifacts.
 */
export function producedArtifactPaths(snapshot: ConversationSnapshot | undefined): readonly string[] {
  if (snapshot === undefined) return []
  const result: string[] = []
  const seen = new Set<string>()
  for (const turnNumber of snapshot.chat.timeline.turnOrder) {
    const turn = snapshot.chat.timeline.turns.get(turnNumber)
    if (turn === undefined || turn.status !== 'closed') continue
    const data = turn.data as unknown as { get(key: string): unknown }
    const value = data.get('deliverables')
    if (!isDeliverablesValue(value)) continue
    for (const produced of value.produced) {
      if (!isProducedPathValue(produced) || seen.has(produced.path)) continue
      seen.add(produced.path)
      result.push(produced.path)
    }
  }
  return result
}

function conversationOf(
  source: HarnessOfficeSourceSnapshot,
  sessionId: SessionId,
): ConversationSnapshot | undefined {
  return source.conversations[String(sessionId)]
}

function conversationNodesOf(
  snapshot: ConversationSnapshot | undefined,
): readonly ConversationNode[] {
  const nodes: unknown = snapshot?.nodes
  return Array.isArray(nodes) ? nodes as readonly ConversationNode[] : []
}

function attentionOf(
  summary: SessionSummary,
  conversation: ConversationSnapshot | undefined,
): OfficeAttentionKind | null {
  if (summary.pendingInteraction !== undefined) return summary.pendingInteraction
  const pending = conversation?.pending[0]
  return pending?.kind ?? null
}

function jobRecency(job: JobView): number {
  return job.finishedAt ?? job.startedAt
}

function latestJob(jobs: readonly JobView[]): JobView | undefined {
  let latest: JobView | undefined
  for (const job of jobs) {
    if (latest === undefined || jobRecency(job) > jobRecency(latest)) latest = job
  }
  return latest
}

/**
 * The latest user/steering node is the stable identity of one Harness turn.
 * Streaming assistant updates do not change it, so scene callbacks cannot be
 * accidentally admitted as a different task while an answer is in flight.
 */
function taskIdentityOf(input: {
  sessionId: SessionId
  summary: SessionSummary
  conversation: ConversationSnapshot | undefined
  jobs: readonly JobView[]
}): string {
  const { sessionId, summary, conversation, jobs } = input
  const promptNode = [...conversationNodesOf(conversation)]
    .filter(node => node.kind === 'user' || node.kind === 'steering')
    .sort((left, right) => right.seq - left.seq)[0]
  if (promptNode !== undefined) {
    return `harness:${String(sessionId)}:turn:${promptNode.seq}`
  }
  const job = latestJob(jobs)
  if (job !== undefined) {
    return `harness:${String(sessionId)}:job:${String(job.id)}:${job.startedAt}`
  }
  return `harness:${String(sessionId)}:session:${summary.updatedAt}`
}

function taskStateOf(input: {
  summary: SessionSummary
  conversation: ConversationSnapshot | undefined
  jobs: readonly JobView[]
  attention: OfficeAttentionKind | null
}): OfficeTaskVisualState {
  const { summary, conversation, jobs, attention } = input
  if (attention !== null) return 'awaiting-user'
  if (jobs.some(job => job.status === 'stopping')) return 'stopping'
  if (summary.running || conversation?.running === true
    || jobs.some(job => job.status === 'running')) return 'running'
  if (summary.completed === true) return 'completed'
  if (latestJob(jobs)?.status === 'failed') return 'failed'
  return 'idle'
}

function sessionIsRunning(
  source: HarnessOfficeSourceSnapshot,
  sessionId: SessionId,
): boolean {
  const summary = source.sessions.byId[sessionId]
  if (summary === undefined) return false
  const conversation = conversationOf(source, sessionId)
  const jobs = source.sessions.jobsBySession[sessionId] ?? []
  return summary.running || conversation?.running === true
    || jobs.some(job => job.status === 'running' || job.status === 'stopping')
}

function makeReport(input: {
  employee: OfficeEmployeeAssignment
  sessionId: SessionId
  summary: SessionSummary
  artifacts: readonly string[]
  conversation: ConversationSnapshot | undefined
}): OfficeReportVisualState | null {
  const { employee, sessionId, summary, artifacts, conversation } = input
  const exchange = latestConversationExchange(conversation)
  // The Harness completion reminder is armed by any running -> idle edge. It
  // therefore cannot distinguish a successful answer from stop, failure,
  // max-token or an incompletely loaded timeline. Reports require an explicit
  // normal assistant terminal so the office never presents partial work as a
  // completed deliverable.
  if (exchange.taskStatus !== 'completed') return null
  return {
    reportId: `harness:${String(sessionId)}:turn:${exchange.terminalSequence ?? summary.updatedAt}`,
    employeeId: employee.employeeId,
    sessionId,
    title: summary.displayTitle,
    artifactPaths: artifacts,
    ...(exchange.createdAt === undefined ? {} : { createdAt: exchange.createdAt }),
    ...(exchange.startedAt === undefined ? {} : { startedAt: exchange.startedAt }),
    ...(exchange.completedAt === undefined ? {} : { completedAt: exchange.completedAt }),
    ...(exchange.taskStatus === undefined ? {} : { taskStatus: exchange.taskStatus }),
    ...(exchange.promptText === undefined ? {} : { promptText: exchange.promptText }),
    ...(exchange.responseText === undefined ? {} : { responseText: exchange.responseText }),
    ...(exchange.model === undefined ? {} : { model: exchange.model }),
    ...(employee.workstationId === undefined ? {} : { workstationId: employee.workstationId }),
  }
}

function projectEmployeeReports(
  source: HarnessOfficeSourceSnapshot,
  relationships: OfficeRelationshipSnapshot,
): readonly OfficeReportVisualState[] {
  const archived = new Set((source.archivedSessionIds ?? []).map(String))
  const reports: OfficeReportVisualState[] = []
  for (const sessionId of source.sessions.ids) {
    if (archived.has(String(sessionId))) continue
    const summary = source.sessions.byId[sessionId]
    if (summary === undefined || summary.origin === 'subagent') continue
    const employee = employeeForSession(relationships, summary)
    if (employee === undefined) continue
    const conversation = conversationOf(source, sessionId)
    const report = makeReport({
      employee,
      sessionId,
      summary,
      artifacts: producedArtifactPaths(conversation),
      conversation,
    })
    if (report !== null) reports.push(report)
  }
  return reports.sort((left, right) => (
    (left.completedAt ?? left.startedAt ?? left.createdAt ?? 0)
    - (right.completedAt ?? right.startedAt ?? right.createdAt ?? 0)
  ))
}

export function latestConversationExchange(snapshot: ConversationSnapshot | undefined): Readonly<{
  promptText?: string
  responseText?: string
  model?: string
  createdAt?: number
  startedAt?: number
  completedAt?: number
  taskStatus?: OfficeReportTaskStatus
  terminalSequence?: number
  promptSequence?: number
  turn?: number
}> {
  const ordered = [...conversationNodesOf(snapshot)]
    .sort((left, right) => left.seq - right.seq)
  const terminal = [...ordered].reverse().find(node => (
    node.kind === 'assistant' || node.kind === 'turn-error' || node.kind === 'turn-max-tokens'
  ))
  const terminalSeq = terminal?.seq
  const user = terminalSeq === undefined ? undefined : [...ordered].reverse().find(node => (
    node.seq < terminalSeq && (node.kind === 'user' || node.kind === 'steering')
  ))
  const assistantNodes = ordered.filter(node => node.kind === 'assistant')
  const assistant = terminalSeq === undefined ? undefined : [...assistantNodes].reverse().find(node => (
    node.seq <= terminalSeq
    && (user === undefined || node.seq > user.seq)
  ))
  const promptText = user !== undefined && (user.kind === 'user' || user.kind === 'steering')
    ? user.content.flatMap(block => block.type === 'text' ? [block.text] : []).join('\n').trim()
    : ''
  const responseText = assistant?.blocks
    .flatMap(block => block.kind === 'text' ? [block.text] : [])
    .join('\n')
    .trim() ?? ''
  const model = assistant?.provenance?.model ?? assistant?.requestConfig?.model
  const turn = terminal !== undefined && (
    terminal.kind === 'assistant'
    || terminal.kind === 'turn-error'
    || terminal.kind === 'turn-max-tokens'
  ) ? terminal.turn : undefined
  const turnTiming = turn === undefined ? undefined : snapshot?.turnTimings?.get(turn)
  const createdAt = observedTimestamp(user?.time)
  const startedAt = observedTimestamp(turnTiming?.startTime)
  let completedAt: number | undefined
  let taskStatus: OfficeReportTaskStatus | undefined
  if (terminal?.kind === 'assistant') {
    completedAt = observedTimestamp(
      terminal.timing?.completedTime ?? turnTiming?.endTime ?? terminal.time,
    )
    taskStatus = terminal.interrupted === true ? 'stopped' : 'completed'
  } else if (terminal?.kind === 'turn-error') {
    completedAt = observedTimestamp(terminal.time)
    taskStatus = 'failed'
  } else if (terminal?.kind === 'turn-max-tokens') {
    completedAt = observedTimestamp(terminal.time)
    taskStatus = 'max-tokens'
  }
  return {
    ...(promptText === '' ? {} : { promptText }),
    ...(responseText === '' ? {} : { responseText }),
    ...(model === undefined ? {} : { model }),
    ...(createdAt === undefined ? {} : { createdAt }),
    ...(startedAt === undefined ? {} : { startedAt }),
    ...(completedAt === undefined ? {} : { completedAt }),
    ...(taskStatus === undefined ? {} : { taskStatus }),
    ...(terminalSeq === undefined ? {} : { terminalSequence: terminalSeq }),
    ...(user === undefined ? {} : { promptSequence: user.seq }),
    ...(turn === undefined ? {} : { turn }),
  }
}

function textOfConversationNode(node: ConversationNode): string {
  if (node.kind === 'user' || node.kind === 'steering') {
    return node.content.flatMap(block => block.type === 'text' ? [block.text] : []).join('\n').trim()
  }
  if (node.kind === 'assistant') {
    return node.blocks.flatMap(block => block.kind === 'text' ? [block.text] : []).join('\n').trim()
  }
  return ''
}

function topicMessagesOf(snapshot: ConversationSnapshot | undefined): readonly OfficeTopicMessageVisualState[] {
  return [...conversationNodesOf(snapshot)]
    .sort((left, right) => left.seq - right.seq)
    .flatMap((node): OfficeTopicMessageVisualState[] => {
      if (node.kind !== 'user' && node.kind !== 'steering' && node.kind !== 'assistant') return []
      const text = textOfConversationNode(node)
      if (text === '') return []
      return [{
        messageId: `${node.kind}:${node.seq}`,
        role: node.kind === 'assistant' ? 'assistant' : 'user',
        text,
      }]
    })
}

function employeeForSession(
  relationships: OfficeRelationshipSnapshot,
  summary: SessionSummary,
): OfficeEmployeeAssignment | undefined {
  const active = relationships.employees.find(employee => employee.sessionId === summary.id)
  if (active !== undefined) return active
  if (summary.agentPreset === undefined) return undefined
  return relationships.employees.find(employee => employee.agentPresetId === summary.agentPreset)
}

function projectEmployeeTopics(
  source: HarnessOfficeSourceSnapshot,
  relationships: OfficeRelationshipSnapshot,
): readonly OfficeTopicVisualState[] {
  const archived = new Set((source.archivedSessionIds ?? []).map(String))
  const topics: OfficeTopicVisualState[] = []
  for (const sessionId of source.sessions.ids) {
    if (archived.has(String(sessionId))) continue
    const summary = source.sessions.byId[sessionId]
    if (summary === undefined || summary.origin === 'subagent') continue
    const employee = employeeForSession(relationships, summary)
    if (employee === undefined) continue
    const conversation = conversationOf(source, sessionId)
    const jobs = source.sessions.jobsBySession[sessionId] ?? []
    const attention = attentionOf(summary, conversation)
    const contentLoaded = conversation?.openState === 'open'
    const messages = topicMessagesOf(conversation)
    const artifacts = producedArtifactPaths(conversation)
    const latestMessage = messages[messages.length - 1]
    topics.push({
      employeeId: employee.employeeId,
      sessionId,
      title: summary.blank ? '新话题' : summary.displayTitle,
      excerpt: !contentLoaded ? '历史内容尚未载入'
        : latestMessage?.text ?? (summary.blank ? '尚未开始对话' : '暂无可显示的对话内容'),
      updatedAt: summary.updatedAt,
      taskState: taskStateOf({ summary, conversation, jobs, attention }),
      unreadCompletion: summary.completed === true,
      answerCount: messages.filter(message => message.role === 'assistant').length,
      artifactCount: artifacts.length,
      messages,
      contentState: contentLoaded ? 'loaded' : 'unloaded',
    })
  }
  return topics.sort((left, right) => right.updatedAt - left.updatedAt)
}

function unassignedEmployee(employee: OfficeEmployeeAssignment): OfficeEmployeeVisualState {
  return {
    employeeId: employee.employeeId,
    displayName: employee.displayName,
    taskState: 'idle',
    sceneActivity: 'idle',
    attention: null,
    canDrag: true,
    report: null,
    activeJobCount: 0,
    artifactCount: 0,
    ...(employee.workstationId === undefined ? {} : { workstationId: employee.workstationId }),
  }
}

/** Pure Harness facts -> office presentation reducer. */
export function projectHarnessOffice(
  source: HarnessOfficeSourceSnapshot,
  relationships: OfficeRelationshipSnapshot,
): HarnessOfficeProjection {
  const reports = projectEmployeeReports(source, relationships)
  const officeReportMarkers = reports.filter((report) => (
    source.sessions.byId[report.sessionId]?.completed === true
  ))
  const employees = relationships.employees.map((employee): OfficeEmployeeVisualState => {
    if (employee.sessionId === undefined) return unassignedEmployee(employee)
    const summary = source.sessions.byId[employee.sessionId]
    if (summary === undefined) {
      return {
        ...unassignedEmployee(employee),
        sessionId: employee.sessionId,
      }
    }
    const conversation = conversationOf(source, employee.sessionId)
    const jobs = source.sessions.jobsBySession[employee.sessionId] ?? []
    const attention = attentionOf(summary, conversation)
    const taskState = taskStateOf({ summary, conversation, jobs, attention })
    const artifacts = producedArtifactPaths(conversation)
    const employeeMarkers = officeReportMarkers.filter(report => report.employeeId === employee.employeeId)
    const report = employeeMarkers[employeeMarkers.length - 1] ?? null
    const taskLocked = taskState === 'running'
      || taskState === 'awaiting-user'
      || taskState === 'stopping'
    return {
      employeeId: employee.employeeId,
      displayName: employee.displayName,
      sessionId: employee.sessionId,
      taskState,
      sceneActivity: taskLocked ? 'working' : 'idle',
      attention,
      canDrag: !taskLocked,
      report,
      activeJobCount: jobs.filter(job => job.status === 'running' || job.status === 'stopping').length,
      artifactCount: artifacts.length,
      ...(taskState === 'idle' ? {} : {
        taskId: taskIdentityOf({
          sessionId: employee.sessionId,
          summary,
          conversation,
          jobs,
        }),
      }),
      ...(employee.workstationId === undefined ? {} : { workstationId: employee.workstationId }),
    }
  })
  return {
    selectedSessionId: source.sessions.current,
    employees,
    reports,
    officeReportMarkers,
    topics: projectEmployeeTopics(source, relationships),
  }
}

/**
 * Bridge the documented `ISessions.list` and `ISessions.binding()` read faces
 * into the explicit source port. Every subscription is torn down with its
 * consumer; newly listed sessions are reconciled without polling.
 */
export function createHarnessOfficeProjectionSource(
  sessions: Pick<ISessions, 'list' | 'binding'>,
  workspaces?: Pick<IWorkspaces, 'list'>,
): HarnessOfficeProjectionSource {
  const snapshot = (): HarnessOfficeSourceSnapshot => {
    const list = sessions.list.getSnapshot()
    const conversations: Record<string, ConversationSnapshot | undefined> = {}
    for (const id of Object.keys(list.byId)) {
      const sessionId = id as SessionId
      conversations[id] = sessions.binding(sessionId)?.session.getSnapshot()
    }
    return {
      sessions: list,
      conversations,
      ...(workspaces === undefined
        ? {}
        : { archivedSessionIds: workspaces.list.getSnapshot().archivedSessionIds }),
    }
  }

  return {
    getSnapshot: snapshot,
    subscribe(listener) {
      const conversationStops = new Map<string, () => void>()
      const reconcile = (): void => {
        const list = sessions.list.getSnapshot()
        const ids = new Set(Object.keys(list.byId))
        for (const [id, stop] of conversationStops) {
          if (ids.has(id)) continue
          stop()
          conversationStops.delete(id)
        }
        for (const id of ids) {
          if (conversationStops.has(id)) continue
          const session = sessions.binding(id as SessionId)?.session
          if (session !== undefined) conversationStops.set(id, session.subscribe(listener))
        }
      }
      reconcile()
      const stopList = sessions.list.subscribe(() => {
        reconcile()
        listener()
      })
      const stopWorkspaces = workspaces?.list.subscribe(listener)
      return () => {
        stopList()
        stopWorkspaces?.()
        for (const stop of conversationStops.values()) stop()
        conversationStops.clear()
      }
    },
  }
}

/**
 * Observable adapter used by React (or Pixi) without importing Harness stores
 * into the scene. Its only outward behavior is navigation; scene events can
 * reach an office-only observer but cannot settle, cancel, or approve work.
 */
export class HarnessOfficeProjectionAdapter {
  private readonly lastRunning = new Map<string, boolean>()
  private readonly edgeReports = new Map<string, OfficeReportVisualState>()
  private readonly knownReports = new Map<string, OfficeReportVisualState>()
  private readonly acknowledgedReportIds = new Set<string>()
  private readonly presentationListeners = new Set<() => void>()

  constructor(
    private readonly source: HarnessOfficeProjectionSource,
    private readonly relationships: OfficeRelationshipSource,
    private readonly launcher: HarnessConversationLauncher,
    private readonly sceneObserver?: OfficeSceneObservationPort,
  ) {}

  getSnapshot(): HarnessOfficeProjection {
    const source = this.source.getSnapshot()
    const relationships = this.relationships.getSnapshot()
    this.captureCompletionEdges(source, relationships)
    const projection = this.withTransientReports(projectHarnessOffice(source, relationships))
    for (const report of [...projection.reports, ...projection.officeReportMarkers]) {
      this.knownReports.set(report.reportId, report)
    }
    return projection
  }

  subscribe(listener: () => void): () => void {
    // Seed edge history before subscribing. A pre-existing idle session is
    // not a newly completed office task; only a later true -> false Harness
    // edge creates the current-session report the sidebar's non-selected-only
    // `completed` marker intentionally omits.
    this.captureCompletionEdges(this.source.getSnapshot(), this.relationships.getSnapshot())
    this.presentationListeners.add(listener)
    const publish = (): void => {
      this.captureCompletionEdges(this.source.getSnapshot(), this.relationships.getSnapshot())
      listener()
    }
    const stopSource = this.source.subscribe(publish)
    const stopRelationships = this.relationships.subscribe?.(publish)
    return () => {
      this.presentationListeners.delete(listener)
      stopRelationships?.()
      stopSource()
    }
  }

  async launchEmployee(employeeId: string): Promise<EmployeeLaunchResult> {
    const employee = this.relationships.getSnapshot().employees
      .find(candidate => candidate.employeeId === employeeId)
    if (employee === undefined) return 'unknown-employee'
    await this.launcher.openConversation({
      employeeId: employee.employeeId,
      displayName: employee.displayName,
      ...(employee.sessionId === undefined ? {} : { sessionId: employee.sessionId }),
      ...(employee.workstationId === undefined ? {} : { workstationId: employee.workstationId }),
    })
    return 'opened'
  }

  async launchReport(reportId: string): Promise<ReportLaunchResult> {
    const snapshot = this.getSnapshot()
    const report = snapshot.reports.find(candidate => candidate.reportId === reportId)
      ?? this.knownReports.get(reportId)
    if (report === undefined) return 'unknown-report'
    const employee = this.relationships.getSnapshot().employees
      .find(candidate => candidate.employeeId === report.employeeId)
    if (employee === undefined) return 'unknown-report'
    await this.launcher.openConversation({
      employeeId: employee.employeeId,
      displayName: employee.displayName,
      sessionId: report.sessionId,
      ...(employee.workstationId === undefined ? {} : { workstationId: employee.workstationId }),
    })
    this.acknowledgeReport(report.reportId)
    return 'opened'
  }

  /**
   * Remove a report marker from office presentation without navigating away.
   * The Harness conversation, response and produced artifacts remain intact.
   */
  acknowledgeReport(reportId: string): ReportLaunchResult {
    const snapshot = this.getSnapshot()
    const report = snapshot.reports.find(candidate => candidate.reportId === reportId)
      ?? this.knownReports.get(reportId)
    if (report === undefined) return 'unknown-report'
    if (this.acknowledgedReportIds.has(report.reportId)) return 'opened'
    this.acknowledgedReportIds.add(report.reportId)
    this.edgeReports.delete(report.reportId)
    for (const listener of this.presentationListeners) listener()
    return 'opened'
  }

  handleSceneEvent(event: OfficeSceneEvent): OfficeSceneEventDisposition {
    this.sceneObserver?.observeSceneEvent(event)
    return {
      authority: 'visual-only',
      taskMutation: 'forbidden',
      forwarded: this.sceneObserver !== undefined,
    }
  }

  private captureCompletionEdges(
    source: HarnessOfficeSourceSnapshot,
    relationships: OfficeRelationshipSnapshot,
  ): void {
    const retainedSessions = new Set<string>()
    const archived = new Set((source.archivedSessionIds ?? []).map(String))
    for (const sessionId of source.sessions.ids) {
      const key = String(sessionId)
      if (archived.has(key)) continue
      const summary = source.sessions.byId[sessionId]
      if (summary === undefined || summary.origin === 'subagent') continue
      const employee = employeeForSession(relationships, summary)
      if (employee === undefined) continue
      retainedSessions.add(key)
      const running = sessionIsRunning(source, sessionId)
      const previous = this.lastRunning.get(key)
      this.lastRunning.set(key, running)
      if (previous !== true || running) continue
      const report = makeReport({
        employee,
        sessionId,
        summary,
        artifacts: producedArtifactPaths(conversationOf(source, sessionId)),
        conversation: conversationOf(source, sessionId),
      })
      // A running -> idle edge also occurs after cancellation, failure and a
      // max-token stop. Only a terminal assistant completion is deliverable as
      // a report; the other terminal states remain visible in Harness itself.
      if (report?.taskStatus === 'completed' && !this.acknowledgedReportIds.has(report.reportId)) {
        this.edgeReports.set(report.reportId, report)
      }
    }
    for (const key of this.lastRunning.keys()) {
      if (!retainedSessions.has(key)) this.lastRunning.delete(key)
    }
  }

  private withTransientReports(projection: HarnessOfficeProjection): HarnessOfficeProjection {
    const markersById = new Map<string, OfficeReportVisualState>()
    for (const report of [...projection.officeReportMarkers, ...this.edgeReports.values()]) {
      if (!this.acknowledgedReportIds.has(report.reportId)) markersById.set(report.reportId, report)
    }
    const officeReportMarkers = [...markersById.values()].sort((left, right) => (
      (left.completedAt ?? left.startedAt ?? left.createdAt ?? 0)
      - (right.completedAt ?? right.startedAt ?? right.createdAt ?? 0)
    ))
    const employees = projection.employees.map((employee): OfficeEmployeeVisualState => {
      const ownReports = officeReportMarkers.filter(report => report.employeeId === employee.employeeId)
      const latest = ownReports[ownReports.length - 1] ?? null
      if (latest === employee.report) return employee
      const activeMarkerWasAcknowledged = employee.sessionId !== undefined
        && projection.officeReportMarkers.some(report => (
          report.sessionId === employee.sessionId
          && this.acknowledgedReportIds.has(report.reportId)
        ))
      if (activeMarkerWasAcknowledged && employee.taskState === 'completed') {
        const idleEmployee = { ...employee, taskState: 'idle' as const, report: latest }
        delete idleEmployee.taskId
        return idleEmployee
      }
      return { ...employee, report: latest }
    })
    const topics = projection.topics?.map((topic) => {
      const report = projection.reports.find(candidate => candidate.sessionId === topic.sessionId)
      return report !== undefined
        && this.acknowledgedReportIds.has(report.reportId)
        && topic.unreadCompletion
        ? { ...topic, unreadCompletion: false }
        : topic
    })
    return { ...projection, employees, officeReportMarkers, ...(topics === undefined ? {} : { topics }) }
  }
}

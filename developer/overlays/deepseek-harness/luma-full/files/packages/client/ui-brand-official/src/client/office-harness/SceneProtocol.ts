import {
  isOfficeEmployeeId,
  type OfficeEmployeeId,
} from './OfficeRelationships.ts'
import { isOfficeWorkstationId } from '../office2d/workstations.ts'
import type { OfficeWorkstationId } from '../office2d/workstationSeating.ts'

declare const sceneCommandIdBrand: unique symbol
declare const officeTaskIdBrand: unique symbol

/** Opaque identity of one office presentation command. */
export type SceneCommandId = string & { readonly [sceneCommandIdBrand]: true }

/** Opaque Harness task identity projected into the office. */
export type OfficeTaskId = string & { readonly [officeTaskIdBrand]: true }

export const SCENE_COMMAND_TYPES = Object.freeze([
  'start-task',
  'complete-task',
  'stop-task',
] as const)

export type SceneCommandType = typeof SCENE_COMMAND_TYPES[number]

export const SCENE_EVENT_TYPES = Object.freeze([
  'command-accepted',
  'workstation-arrived',
  'work-animation-ready',
  'animation-finished',
  'navigation-failed',
] as const)

export type SceneEventType = typeof SCENE_EVENT_TYPES[number]

interface SceneIdentity {
  readonly commandId: SceneCommandId
  readonly taskId: OfficeTaskId
  readonly employeeId: OfficeEmployeeId
  readonly workstationId: OfficeWorkstationId
}

export type SceneCommand =
  | (SceneIdentity & { readonly type: 'start-task' })
  | (SceneIdentity & { readonly type: 'complete-task' })
  | (SceneIdentity & { readonly type: 'stop-task' })

export type SceneEvent =
  | (SceneIdentity & { readonly type: 'command-accepted' })
  | (SceneIdentity & { readonly type: 'workstation-arrived' })
  | (SceneIdentity & { readonly type: 'work-animation-ready' })
  | (SceneIdentity & { readonly type: 'animation-finished' })
  | (SceneIdentity & { readonly type: 'navigation-failed'; readonly reason: string })

/** Office-only drag request; it cannot be mistaken for a Harness task event. */
export interface WorkstationDropRequest {
  readonly type: 'workstation-drop-requested'
  readonly employeeId: OfficeEmployeeId
  readonly workstationId: OfficeWorkstationId
}

export type SceneCommandAdmission =
  | Readonly<{ status: 'accepted' | 'duplicate'; command: SceneCommand }>
  | Readonly<{ status: 'conflict'; reason: 'command-id-reused' | 'task-identity-reused' }>
  | Readonly<{ status: 'invalid' }>

export type SceneEventAdmission =
  | Readonly<{
      status: 'accepted'
      authority: 'visual-only'
      taskMutation: 'forbidden'
      event: SceneEvent
    }>
  | Readonly<{ status: 'duplicate'; event: SceneEvent }>
  | Readonly<{ status: 'stale-command' | 'identity-mismatch' | 'invalid' }>

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== ''
}

function includes<T extends string>(values: readonly T[], value: unknown): value is T {
  return typeof value === 'string' && values.some(candidate => candidate === value)
}

function hasSceneIdentity(value: Readonly<Record<string, unknown>>): boolean {
  return isNonEmptyString(value.commandId)
    && isNonEmptyString(value.taskId)
    && isOfficeEmployeeId(value.employeeId)
    && typeof value.workstationId === 'string'
    && isOfficeWorkstationId(value.workstationId)
}

/**
 * @param value - candidate command crossing the scene integration boundary.
 * @returns whether it is a complete task command carrying all four identities.
 */
export function isSceneCommand(value: unknown): value is SceneCommand {
  return isRecord(value)
    && includes(SCENE_COMMAND_TYPES, value.type)
    && hasSceneIdentity(value)
}

/**
 * @param value - candidate event crossing the scene integration boundary.
 * @returns whether it is a complete visual event carrying all four identities.
 */
export function isSceneEvent(value: unknown): value is SceneEvent {
  if (!isRecord(value)
    || !includes(SCENE_EVENT_TYPES, value.type)
    || !hasSceneIdentity(value)) return false
  return value.type !== 'navigation-failed' || isNonEmptyString(value.reason)
}

/**
 * @param input - unbranded command fields from the Harness projection adapter.
 * @returns a validated scene command.
 */
export function createSceneCommand(input: Readonly<{
  type: SceneCommandType
  commandId: string
  taskId: string
  employeeId: string
  workstationId: string
}>): SceneCommand {
  if (!isSceneCommand(input)) throw new Error('Invalid office scene command identity')
  return Object.freeze({ ...input }) as SceneCommand
}

/**
 * @param input - unbranded event fields emitted by the office scene.
 * @returns a validated scene event.
 */
export function createSceneEvent(input: Readonly<{
  type: SceneEventType
  commandId: string
  taskId: string
  employeeId: string
  workstationId: string
  reason?: string
}>): SceneEvent {
  if (!isSceneEvent(input)) throw new Error('Invalid office scene event identity')
  return Object.freeze({ ...input }) as SceneEvent
}

function sameTaskIdentity(left: SceneIdentity, right: SceneIdentity): boolean {
  return left.taskId === right.taskId
    && left.employeeId === right.employeeId
    && left.workstationId === right.workstationId
}

function sameCommand(left: SceneCommand, right: SceneCommand): boolean {
  return left.commandId === right.commandId
    && left.type === right.type
    && sameTaskIdentity(left, right)
}

function eventFingerprint(event: SceneEvent): string {
  return [
    event.type,
    event.commandId,
    event.taskId,
    event.employeeId,
    event.workstationId,
  ].join('\u0000')
}

/**
 * Idempotency and stale-callback guard between Harness task projections and
 * visual scene lifecycles. Accepted events never mutate Harness task state.
 */
export class SceneProtocolGuard {
  private readonly commands = new Map<SceneCommandId, SceneCommand>()
  private readonly taskIdentities = new Map<OfficeTaskId, SceneCommand>()
  private readonly activeCommandByEmployee = new Map<OfficeEmployeeId, SceneCommandId>()
  private readonly seenEvents = new Set<string>()

  /**
   * @param value - candidate command from the projection adapter.
   * @returns admission result; repeated identical commands are idempotent.
   */
  admitCommand(value: unknown, previousPlacement?: SceneCommand): SceneCommandAdmission {
    if (!isSceneCommand(value)) return Object.freeze({ status: 'invalid' as const })
    const command = value
    const existing = this.commands.get(command.commandId)
    if (existing !== undefined) {
      return sameCommand(existing, command)
        ? Object.freeze({ status: 'duplicate' as const, command: existing })
        : Object.freeze({ status: 'conflict' as const, reason: 'command-id-reused' as const })
    }

    const taskIdentity = this.taskIdentities.get(command.taskId)
    if (taskIdentity !== undefined && !sameTaskIdentity(taskIdentity, command)) {
      // The plugin may move the seat of this same active employee/task. Only the
      // exact preceding identity can authorize the transition. Superseded
      // callbacks still fail the ordinary active-command check below.
      const relocated = previousPlacement && sameCommand(taskIdentity, previousPlacement)
        && previousPlacement.taskId === command.taskId && previousPlacement.employeeId === command.employeeId
        && previousPlacement.workstationId !== command.workstationId
      if (!relocated) return Object.freeze({ status: 'conflict' as const, reason: 'task-identity-reused' as const })
    }
    this.commands.set(command.commandId, command)
    this.taskIdentities.set(command.taskId, command)
    this.activeCommandByEmployee.set(command.employeeId, command.commandId)
    return Object.freeze({ status: 'accepted' as const, command })
  }

  /**
   * @param value - candidate callback from the scene.
   * @returns visual-only admission after exact four-identity and duplicate checks.
   */
  admitEvent(value: unknown): SceneEventAdmission {
    if (!isSceneEvent(value)) return Object.freeze({ status: 'invalid' as const })
    const event = value
    const command = this.commands.get(event.commandId)
    if (command === undefined
      || this.activeCommandByEmployee.get(event.employeeId) !== event.commandId) {
      return Object.freeze({ status: 'stale-command' as const })
    }
    if (!sameTaskIdentity(command, event)) {
      return Object.freeze({ status: 'identity-mismatch' as const })
    }

    const fingerprint = eventFingerprint(event)
    if (this.seenEvents.has(fingerprint)) {
      return Object.freeze({ status: 'duplicate' as const, event })
    }
    this.seenEvents.add(fingerprint)
    return Object.freeze({
      status: 'accepted' as const,
      authority: 'visual-only' as const,
      taskMutation: 'forbidden' as const,
      event,
    })
  }

  /**
   * Forget the active pointer after the presentation lifecycle settles. Kept
   * command identities continue rejecting duplicate or conflicting replays.
   * @param commandId - completed visual command.
   */
  retireCommand(commandId: SceneCommandId): void {
    const command = this.commands.get(commandId)
    if (command === undefined) return
    if (this.activeCommandByEmployee.get(command.employeeId) === commandId) {
      this.activeCommandByEmployee.delete(command.employeeId)
    }
  }
}

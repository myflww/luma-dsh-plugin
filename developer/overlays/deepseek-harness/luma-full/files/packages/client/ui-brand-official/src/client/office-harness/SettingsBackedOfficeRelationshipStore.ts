import {
  OFFICE_EMPLOYEE_IDS,
  OFFICE_RELATIONSHIP_SETTINGS_FIELD,
  createDefaultOfficeRelationshipsV1,
  decodeOfficeRelationshipsV1,
  findAutoAssignableWorkstation,
  findEmployeeBoundToWorkstation,
  isOfficeEmployeeId,
  officeRelationshipsEqual,
  replaceEmployeeRelationships,
  type OfficeEmployeeId,
  type OfficeEmployeeRelationshipV1,
  type OfficeRelationshipSettings,
  type OfficeRelationshipsV1,
} from './OfficeRelationships.ts'
import { isOfficeWorkstationId } from '../office2d/workstations.ts'
import type { OfficeWorkstationId } from '../office2d/workstationSeating.ts'

/** Narrow structural view of Harness' public per-namespace settings scope. */
export interface OfficeSettingsScope {
  getSnapshot(): Readonly<{
    status: 'loading' | 'ready' | 'unavailable'
    value: OfficeRelationshipSettings | undefined
    revision: number | undefined
    writable: boolean
    mode: 'host' | 'memory'
  }>
  subscribe(listener: () => void): () => void
  set(field: string, value: unknown): Promise<void>
  unset(field: string): Promise<void>
}

/** Authoritative work lock consulted before changing a workstation binding. */
export interface OfficeBindingLockSource {
  isBindingLocked(employeeId: OfficeEmployeeId): boolean
}

/** Observable relationship state derived from one settings scope. */
export interface OfficeRelationshipStoreSnapshot {
  readonly status: 'loading' | 'ready' | 'unavailable'
  readonly persistence: 'host' | 'memory'
  readonly durable: boolean
  readonly writable: boolean
  readonly sourceRevision?: number
  readonly relationships: OfficeRelationshipsV1
}

export type OfficeRelationshipMutationReason =
  | 'unknown-employee'
  | 'unknown-workstation'
  | 'employee-working'
  | 'occupant-working'
  | 'no-available-workstation'
  | 'invalid-harness-reference'
  | 'session-in-use'
  | 'persistence-unavailable'
  | 'persistence-conflict'
  | 'disposed'

export interface OfficeRelationshipMutationAccepted {
  readonly status: 'changed' | 'unchanged'
  readonly employeeId: OfficeEmployeeId
  readonly persistence: 'host' | 'memory'
  readonly relationships: OfficeRelationshipsV1
  readonly workstationId?: OfficeWorkstationId
  readonly displacedEmployeeId?: OfficeEmployeeId
}

export interface OfficeRelationshipMutationRejected {
  readonly status: 'rejected'
  readonly reason: OfficeRelationshipMutationReason
  readonly relationships: OfficeRelationshipsV1
}

/** Result of a relationship mutation admission and persistence attempt. */
export type OfficeRelationshipMutationResult =
  | OfficeRelationshipMutationAccepted
  | OfficeRelationshipMutationRejected

/** Harness context patch; null clears a reference and undefined leaves it unchanged. */
export interface OfficeHarnessRelationshipPatch {
  readonly workspaceId?: string | null
  readonly activeSessionId?: string | null
}

function freezeSnapshot(
  input: Omit<OfficeRelationshipStoreSnapshot, 'sourceRevision'>
    & { readonly sourceRevision?: number },
): OfficeRelationshipStoreSnapshot {
  return Object.freeze({ ...input })
}

function referencesAreValid(patch: OfficeHarnessRelationshipPatch): boolean {
  return [patch.workspaceId, patch.activeSessionId].every(
    value => value === undefined || value === null
      || (typeof value === 'string' && value.trim() !== ''),
  )
}

function snapshotsEqual(
  left: OfficeRelationshipStoreSnapshot,
  right: OfficeRelationshipStoreSnapshot,
): boolean {
  return left.status === right.status
    && left.persistence === right.persistence
    && left.durable === right.durable
    && left.writable === right.writable
    && left.sourceRevision === right.sourceRevision
    && officeRelationshipsEqual(left.relationships, right.relationships)
}

/**
 * Durable relationship owner over Harness settings, with an explicit
 * process-local fallback for remote browsers where Host settings are disabled.
 */
export class SettingsBackedOfficeRelationshipStore {
  private readonly listeners = new Set<() => void>()
  private readonly unsubscribeScope: () => void
  private localRelationships = createDefaultOfficeRelationshipsV1()
  private snapshot: OfficeRelationshipStoreSnapshot
  private writeTail: Promise<void> = Promise.resolve()
  private disposed = false

  /**
   * @param scope - scope returned by `ctx.settingsScope.bind` for `luma-office`.
   * @param bindingLocks - live Harness task locks for every employee.
   */
  constructor(
    private readonly scope: OfficeSettingsScope,
    private readonly bindingLocks: OfficeBindingLockSource,
  ) {
    this.snapshot = this.deriveSnapshot()
    this.unsubscribeScope = scope.subscribe(() => { this.refreshFromScope() })
  }

  /** @returns the stable current snapshot. */
  getSnapshot(): OfficeRelationshipStoreSnapshot {
    return this.snapshot
  }

  /**
   * @param listener - callback invoked after a snapshot replacement.
   * @returns disposer removing the listener.
   */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  /** Stop listening to Harness settings and reject later mutations. */
  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.unsubscribeScope()
    this.listeners.clear()
  }

  /**
   * Bind an employee globally. An occupied workstation atomically evicts its
   * previous employee unless either employee is executing work.
   * @param employeeId - employee being moved.
   * @param workstationId - calibrated workstation receiving the employee.
   * @returns mutation outcome after settings settlement.
   */
  bindWorkstation(
    employeeId: string,
    workstationId: string,
  ): Promise<OfficeRelationshipMutationResult> {
    return this.enqueue(async () => {
      if (!isOfficeEmployeeId(employeeId)) return this.reject('unknown-employee')
      if (!isOfficeWorkstationId(workstationId)) return this.reject('unknown-workstation')
      const lockFailure = this.bindingFailure(employeeId, workstationId)
      if (lockFailure !== undefined) return this.reject(lockFailure)

      const current = this.snapshot.relationships
      const displacedEmployeeId = findEmployeeBoundToWorkstation(current, workstationId)
      if (current.employees[employeeId].workstationId === workstationId) {
        return this.accepted('unchanged', employeeId, current, workstationId)
      }

      const replacements: Partial<Record<OfficeEmployeeId, OfficeEmployeeRelationshipV1>> = {
        [employeeId]: {
          ...current.employees[employeeId],
          workstationId,
        },
      }
      if (displacedEmployeeId !== undefined && displacedEmployeeId !== employeeId) {
        const {
          workstationId: _displacedWorkstation,
          ...unboundRelationship
        } = current.employees[displacedEmployeeId]
        replacements[displacedEmployeeId] = unboundRelationship
      }
      const next = replaceEmployeeRelationships(current, replacements)
      return this.commit(next, {
        employeeId,
        workstationId,
        ...(displacedEmployeeId === undefined || displacedEmployeeId === employeeId
          ? {}
          : { displacedEmployeeId }),
      })
    })
  }

  /**
   * @param employeeId - employee whose global workstation binding is cleared.
   * @returns mutation outcome after settings settlement.
   */
  unbindWorkstation(employeeId: string): Promise<OfficeRelationshipMutationResult> {
    return this.enqueue(async () => {
      if (!isOfficeEmployeeId(employeeId)) return this.reject('unknown-employee')
      if (this.bindingLocks.isBindingLocked(employeeId)) return this.reject('employee-working')
      const current = this.snapshot.relationships
      if (current.employees[employeeId].workstationId === undefined) {
        return this.accepted('unchanged', employeeId, current)
      }
      const { workstationId: _workstationId, ...unbound } = current.employees[employeeId]
      return this.commit(
        replaceEmployeeRelationships(current, { [employeeId]: unbound }),
        { employeeId },
      )
    })
  }

  /**
   * Preserve an existing binding or claim the highest-priority free workstation.
   * @param employeeId - employee entering work without a binding.
   * @returns mutation outcome after settings settlement.
   */
  autoAssignWorkstation(employeeId: string): Promise<OfficeRelationshipMutationResult> {
    return this.enqueue(async () => {
      if (!isOfficeEmployeeId(employeeId)) return this.reject('unknown-employee')
      if (this.bindingLocks.isBindingLocked(employeeId)) return this.reject('employee-working')
      const current = this.snapshot.relationships
      const existing = current.employees[employeeId].workstationId
      if (existing !== undefined) {
        return this.accepted('unchanged', employeeId, current, existing)
      }
      const workstationId = findAutoAssignableWorkstation(current)
      if (workstationId === undefined) return this.reject('no-available-workstation')
      const next = replaceEmployeeRelationships(current, {
        [employeeId]: { ...current.employees[employeeId], workstationId },
      })
      return this.commit(next, { employeeId, workstationId })
    })
  }

  /**
   * Update the employee's Harness workspace/session references. Active
   * sessions are exclusive so two employees never project one conversation.
   * @param employeeId - employee whose Harness relationship changes.
   * @param patch - values to replace or clear.
   * @returns mutation outcome after settings settlement.
   */
  updateHarnessRelationship(
    employeeId: string,
    patch: OfficeHarnessRelationshipPatch,
  ): Promise<OfficeRelationshipMutationResult> {
    return this.enqueue(async () => {
      if (!isOfficeEmployeeId(employeeId)) return this.reject('unknown-employee')
      if (!referencesAreValid(patch)) return this.reject('invalid-harness-reference')

      const current = this.snapshot.relationships
      const nextActiveSessionId = patch.activeSessionId === undefined
        ? current.employees[employeeId].activeSessionId
        : patch.activeSessionId ?? undefined
      if (nextActiveSessionId !== undefined && OFFICE_EMPLOYEE_IDS.some(candidate => (
        candidate !== employeeId
        && current.employees[candidate].activeSessionId === nextActiveSessionId
      ))) return this.reject('session-in-use')

      const relationship = { ...current.employees[employeeId] }
      if (patch.workspaceId !== undefined) {
        if (patch.workspaceId === null) delete relationship.workspaceId
        else relationship.workspaceId = patch.workspaceId
      }
      if (patch.activeSessionId !== undefined) {
        if (patch.activeSessionId === null) delete relationship.activeSessionId
        else relationship.activeSessionId = patch.activeSessionId
      }
      const next = replaceEmployeeRelationships(current, { [employeeId]: relationship })
      if (officeRelationshipsEqual(current, next)) {
        return this.accepted('unchanged', employeeId, current, relationship.workstationId)
      }
      return this.commit(next, {
        employeeId,
        ...(relationship.workstationId === undefined
          ? {}
          : { workstationId: relationship.workstationId }),
      })
    })
  }

  private bindingFailure(
    employeeId: OfficeEmployeeId,
    workstationId: OfficeWorkstationId,
  ): 'employee-working' | 'occupant-working' | undefined {
    if (this.bindingLocks.isBindingLocked(employeeId)) return 'employee-working'
    const occupant = findEmployeeBoundToWorkstation(this.snapshot.relationships, workstationId)
    return occupant !== undefined && occupant !== employeeId
      && this.bindingLocks.isBindingLocked(occupant)
      ? 'occupant-working'
      : undefined
  }

  private enqueue(
    operation: () => Promise<OfficeRelationshipMutationResult>,
  ): Promise<OfficeRelationshipMutationResult> {
    const guardedOperation = (): Promise<OfficeRelationshipMutationResult> => this.disposed
      ? Promise.resolve(this.reject('disposed'))
      : operation()
    const task = this.writeTail.then(guardedOperation, guardedOperation)
    this.writeTail = task.then(() => {}, () => {})
    return task
  }

  private async commit(
    next: OfficeRelationshipsV1,
    metadata: Readonly<{
      employeeId: OfficeEmployeeId
      workstationId?: OfficeWorkstationId
      displacedEmployeeId?: OfficeEmployeeId
    }>,
  ): Promise<OfficeRelationshipMutationResult> {
    if (this.disposed) return this.reject('disposed')
    const source = this.scope.getSnapshot()
    if (source.mode === 'memory') {
      this.localRelationships = next
      this.publish(this.deriveSnapshot())
      return this.accepted('changed', metadata.employeeId, next, metadata.workstationId,
        metadata.displacedEmployeeId)
    }
    if (source.status !== 'ready' || !source.writable) {
      return this.reject('persistence-unavailable')
    }

    try {
      await this.scope.set(OFFICE_RELATIONSHIP_SETTINGS_FIELD, next)
    } catch {
      // The settings snapshot is the durable truth; a transport failure is
      // reported as a persistence conflict without publishing the candidate.
      this.refreshFromScope()
      return this.reject('persistence-conflict')
    }
    if (this.disposed) return this.reject('disposed')
    this.refreshFromScope()
    if (!officeRelationshipsEqual(this.snapshot.relationships, next)) {
      return this.reject('persistence-conflict')
    }
    return this.accepted('changed', metadata.employeeId, next, metadata.workstationId,
      metadata.displacedEmployeeId)
  }

  private reject(reason: OfficeRelationshipMutationReason): OfficeRelationshipMutationRejected {
    return Object.freeze({
      status: 'rejected' as const,
      reason,
      relationships: this.snapshot.relationships,
    })
  }

  private accepted(
    status: 'changed' | 'unchanged',
    employeeId: OfficeEmployeeId,
    relationships: OfficeRelationshipsV1,
    workstationId?: OfficeWorkstationId,
    displacedEmployeeId?: OfficeEmployeeId,
  ): OfficeRelationshipMutationAccepted {
    return Object.freeze({
      status,
      employeeId,
      persistence: this.snapshot.persistence,
      relationships,
      ...(workstationId === undefined ? {} : { workstationId }),
      ...(displacedEmployeeId === undefined ? {} : { displacedEmployeeId }),
    })
  }

  private refreshFromScope(): void {
    if (!this.disposed) this.publish(this.deriveSnapshot())
  }

  private deriveSnapshot(): OfficeRelationshipStoreSnapshot {
    const source = this.scope.getSnapshot()
    if (source.mode === 'memory') {
      return freezeSnapshot({
        status: 'ready',
        persistence: 'memory',
        durable: false,
        writable: true,
        relationships: this.localRelationships,
      })
    }

    const decoded = source.value?.relationships === undefined
      ? createDefaultOfficeRelationshipsV1()
      : decodeOfficeRelationshipsV1(source.value.relationships)
    const status = source.status === 'ready' && decoded !== undefined
      ? 'ready'
      : source.status === 'loading' ? 'loading' : 'unavailable'
    return freezeSnapshot({
      status,
      persistence: 'host',
      durable: status === 'ready' && source.writable,
      writable: source.writable,
      ...(source.revision === undefined ? {} : { sourceRevision: source.revision }),
      relationships: decoded ?? this.snapshot?.relationships ?? createDefaultOfficeRelationshipsV1(),
    })
  }

  private publish(next: OfficeRelationshipStoreSnapshot): void {
    if (snapshotsEqual(this.snapshot, next)) return
    this.snapshot = next
    for (const listener of this.listeners) listener()
  }
}

/** Browser integration between Harness settings, office projection, and work locks. */

import type { SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import {
  OFFICE_EMPLOYEE_DEFINITIONS,
  OFFICE_EMPLOYEE_IDS,
} from './OfficeRelationships.ts'
import {
  SettingsBackedOfficeRelationshipStore,
  type OfficeBindingLockSource,
  type OfficeSettingsScope,
} from './SettingsBackedOfficeRelationshipStore.ts'
import type {
  HarnessOfficeProjection,
  OfficeRelationshipSource,
} from './HarnessOfficeProjectionAdapter.ts'

/** Projection face used to enforce the "working characters cannot move" rule. */
export type OfficeProjectionLockSource = Pick<
  { getSnapshot(): HarnessOfficeProjection },
  'getSnapshot'
>

class ProjectionBindingLocks implements OfficeBindingLockSource {
  private projection: OfficeProjectionLockSource | undefined

  attach(projection: OfficeProjectionLockSource): void {
    this.projection = projection
  }

  isBindingLocked(employeeId: typeof OFFICE_EMPLOYEE_IDS[number]): boolean {
    const employee = this.projection?.getSnapshot().employees
      .find(candidate => candidate.employeeId === employeeId)
    return employee?.canDrag === false
  }
}

/** Convert the durable relationship store into the adapter's read-only assignment port. */
export function createOfficeRelationshipSource(
  store: Pick<SettingsBackedOfficeRelationshipStore, 'getSnapshot' | 'subscribe'>,
): OfficeRelationshipSource {
  return {
    getSnapshot() {
      const relationships = store.getSnapshot().relationships
      return Object.freeze({
        employees: Object.freeze(OFFICE_EMPLOYEE_IDS.map((employeeId) => {
          const definition = OFFICE_EMPLOYEE_DEFINITIONS[employeeId]
          const relationship = relationships.employees[employeeId]
          return Object.freeze({
            employeeId,
            displayName: definition.displayName,
            agentPresetId: definition.agentPresetId,
            ...(relationship.activeSessionId === undefined
              ? {}
              : { sessionId: relationship.activeSessionId as SessionId }),
            ...(relationship.workstationId === undefined
              ? {}
              : { workstationId: relationship.workstationId }),
          })
        })),
      })
    },
    subscribe(listener) {
      return store.subscribe(listener)
    },
  }
}

/** Settings-backed relationship state plus the adapter source consuming it. */
export interface OfficeRelationshipIntegration {
  readonly store: SettingsBackedOfficeRelationshipStore
  readonly source: OfficeRelationshipSource
  attachProjection(projection: OfficeProjectionLockSource): void
  dispose(): void
}

/**
 * Build one relationship owner for the plugin fiber. The projection is
 * attached immediately after adapter construction so store mutations consult
 * live Harness task locks without introducing a dependency cycle.
 */
export function createOfficeRelationshipIntegration(
  settingsScope: OfficeSettingsScope,
): OfficeRelationshipIntegration {
  const bindingLocks = new ProjectionBindingLocks()
  const store = new SettingsBackedOfficeRelationshipStore(settingsScope, bindingLocks)
  const source = createOfficeRelationshipSource(store)
  return Object.freeze({
    store,
    source,
    attachProjection(projection: OfficeProjectionLockSource) {
      bindingLocks.attach(projection)
    },
    dispose() {
      store.dispose()
    },
  })
}

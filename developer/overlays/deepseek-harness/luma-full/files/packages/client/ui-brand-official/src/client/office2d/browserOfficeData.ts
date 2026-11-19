import { withBrowserIndependentActors } from './browserIndependentActorBindings.ts'
import type { IndependentOfficeSpace } from './generatedIndependentSpaceTypes.ts'

function freezeTree(value: unknown): void {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return
  for (const child of Object.values(value)) freezeTree(child)
  Object.freeze(value)
}

/** Isolate the published room from mutable catalog references after applying its reviewed geometry. */
export function createBrowserOffice(space: IndependentOfficeSpace): IndependentOfficeSpace {
  const room = structuredClone(withBrowserIndependentActors(space))
  freezeTree(room)
  return room
}

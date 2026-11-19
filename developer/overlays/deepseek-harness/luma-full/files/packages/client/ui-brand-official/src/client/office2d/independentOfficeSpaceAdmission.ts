import type { IndependentOfficeSpace, IndependentRenderBinding } from './generatedIndependentSpaceTypes.ts'
import type { IndependentIntegratedChair } from './independentChairOwnership.ts'

/** Generated layouts share office/bedroom chair types; this canvas admits only
 * the real office branch. Keep the original object, arrays, geometry and order. */
export type AdmittedIndependentOfficeSpace = IndependentOfficeSpace & Readonly<{
  layout: IndependentOfficeSpace['layout'] & Readonly<{
    renderBindings: readonly (IndependentRenderBinding & Readonly<{ integratedChair?: IndependentIntegratedChair }>)[]
  }>
}>

/** This selects the branch only. Per-phase source/plate/geometry validation
 * remains in independentChairForBinding when a binding is actually selected. */
export function assertIndependentOfficeSpaceBindings(space: IndependentOfficeSpace): asserts space is AdmittedIndependentOfficeSpace {
  for (const binding of space.layout.renderBindings) {
    const chair = binding.integratedChair
    if (chair !== undefined && (chair.officeTheme !== space.layout.theme
      || chair.stationId !== binding.stationId
      || chair.sceneKind !== undefined || chair.sceneTheme !== undefined || chair.interactionId !== undefined)) {
      throw new Error('办公室坐姿资源与当前场景或工位不匹配，请重新选择场景。')
    }
  }
}

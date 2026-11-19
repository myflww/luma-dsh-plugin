/** Host-only availability, never task state, source admission or a renderer fallback. */
export interface FinalPoseEmployee {
  readonly id: string
  readonly name: string
  readonly visible: boolean
  readonly skinId?: string
  readonly workstationId?: string
  readonly state: string
  readonly sleeping?: boolean
  readonly computerActive?: boolean
  readonly manualAction?: unknown
}
export interface FinalPoseSnapshot {
  readonly presentationActive: boolean
  readonly scene?: 'bedroom'
  readonly phase: string
  readonly officeTheme?: string
  readonly bedroomTheme?: string
  readonly selectedEmployeeId?: string
  readonly employees: readonly FinalPoseEmployee[]
}
interface FinalPoseSpace {
  readonly phases: Readonly<Record<string, Readonly<{ sha256: string }>>>
  readonly layout: Readonly<{
    kind: 'office' | 'bedroom'; theme: string
    stations?: readonly Readonly<{ id: string }>[]
    computer?: Readonly<{ id: string }>
    bed?: Readonly<{ id?: string; head?: readonly number[] }>
    renderBindings: readonly Readonly<{
      employeeId: string; skinId: string; stationId: string; visualReviewed: boolean
      sourceSha256: string
      integratedChair?: Readonly<{
        employeeId: string; skinId: string; phase: string
        officeTheme?: string; sceneTheme?: string; stationId?: string; interactionId?: string
        actorSourceSha256: string; originalBackgroundSha256: string
      }>
    }>[]
    finalStateBindings?: readonly Readonly<{
      employeeId: string; skinId: string; actionId: string; interactionId: string; visualReviewed: boolean
    }>[]
    sleepReviewedByEmployeeAndSkin?: Readonly<Record<string, boolean>>
  }>
}
export interface MissingFinalPose {
  readonly employeeId: string
  readonly name: string
  readonly skinId: string
  readonly theme: string
  readonly phase: string
  readonly interactionId: string
  readonly actionId: 'seated' | 'sleep'
  readonly reason: 'point-unavailable' | 'phase-unavailable' | 'pose-unavailable'
}

/** Match the normal Native final-state selection without broadening roster or skin gates.
 * Source loading/geometry failures still belong to the existing engine error path.
 * Legacy authored rooms do not use this independent-scene contract.
 */
export function missingIndependentFinalPoses(
  spaces: Readonly<Record<string, FinalPoseSpace>>, snapshot: FinalPoseSnapshot,
): readonly MissingFinalPose[] {
  if (!snapshot.presentationActive) return []
  const bedroom = snapshot.scene === 'bedroom'
  const theme = (bedroom ? snapshot.bedroomTheme : snapshot.officeTheme) ?? ''
  const space = spaces[theme]
  if (!space || space.layout.theme !== theme || space.layout.kind !== (bedroom ? 'bedroom' : 'office')) return []
  const { layout } = space
  const notices: MissingFinalPose[] = []
  for (const employee of snapshot.employees) {
    if (!employee.visible || employee.manualAction !== undefined
      || (bedroom && employee.id !== snapshot.selectedEmployeeId)) continue
    const skinId = employee.skinId ?? ''
    const sleeping = bedroom && employee.sleeping === true && employee.state === 'idle' && !employee.computerActive
    const interactionId = sleeping ? layout.bed?.id ?? 'bed' : bedroom ? layout.computer?.id ?? 'bedroom-computer' : employee.workstationId ?? ''
    if (!interactionId) continue // Unbound actors are legitimately standing/walking.
    const notice = (reason: MissingFinalPose['reason']) => notices.push({
      employeeId: employee.id, name: employee.name, skinId, theme, phase: snapshot.phase,
      interactionId, actionId: sleeping ? 'sleep' : 'seated', reason,
    })
    if (sleeping ? !layout.bed : bedroom ? !layout.computer : !layout.stations?.some(slot => slot.id === interactionId)) {
      notice('point-unavailable'); continue
    }
    const background = space.phases[snapshot.phase]
    if (!background) { notice('phase-unavailable'); continue }
    if (sleeping) {
      const exact = (layout.finalStateBindings ?? []).filter(binding => binding.employeeId === employee.id
        && binding.skinId === skinId && binding.actionId === 'sleep' && binding.interactionId === interactionId)
      // An explicit unreviewed pose cannot fall back through an old reviewed flag.
      const ready = exact.length ? exact.length === 1 && exact[0]!.visualReviewed
        : layout.sleepReviewedByEmployeeAndSkin?.[`${employee.id}:${skinId}`] === true
      if (!ready) notice('pose-unavailable')
      continue
    }
    const exact = layout.renderBindings.filter(binding => binding.visualReviewed && binding.employeeId === employee.id
      && binding.skinId === skinId && binding.stationId === interactionId)
    const joint = exact.filter(binding => binding.integratedChair !== undefined)
    if (!joint.length) { if (!exact.length) notice('pose-unavailable'); continue }
    // Once an exact family owns its chair, another phase or a legacy row cannot substitute.
    const selected = joint.filter(binding => {
      const chair = binding.integratedChair!
      return (bedroom ? chair.sceneTheme : chair.officeTheme) === theme && chair.phase === snapshot.phase
    })
    const selectedBinding = selected[0], chair = selectedBinding?.integratedChair
    if (selected.length !== 1 || !chair || chair.employeeId !== employee.id || chair.skinId !== skinId
      || (bedroom ? chair.interactionId : chair.stationId) !== interactionId
      || chair.actorSourceSha256 !== selectedBinding!.sourceSha256
      || chair.originalBackgroundSha256 !== background.sha256) notice('pose-unavailable')
  }
  return notices
}

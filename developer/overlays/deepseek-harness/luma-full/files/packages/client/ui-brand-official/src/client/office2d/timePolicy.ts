import { createOfficeClockPolicy, type OfficeClockPolicy, type OfficeTimePhase } from '../../office-time/domain/timePolicy.ts'

// Preserve existing UI imports while sharing one calendar and attendance implementation.
export * from '../../office-time/domain/timePolicy.ts'

export interface OfficeLightingPreset {
  readonly preset: string
  readonly interiorLightsOn: boolean
  readonly tint: number
  readonly overlay: number
  readonly overlayAlpha: number
  readonly brightness: number
}

export const OFFICE_LIGHTING_PRESETS = Object.freeze({
  morning: Object.freeze({ preset: 'morning-daylight', interiorLightsOn: false, tint: 0xfff4dd, overlay: 0xffd79e, overlayAlpha: 0.08, brightness: 1.04 }),
  noon: Object.freeze({ preset: 'noon-daylight', interiorLightsOn: false, tint: 0xffffff, overlay: 0xfff9e8, overlayAlpha: 0.03, brightness: 1.06 }),
  afternoon: Object.freeze({ preset: 'afternoon-daylight', interiorLightsOn: false, tint: 0xfff0d5, overlay: 0xffd7a8, overlayAlpha: 0.07, brightness: 1.01 }),
  dusk: Object.freeze({ preset: 'dusk-warm', interiorLightsOn: true, tint: 0xffd6aa, overlay: 0xe88f58, overlayAlpha: 0.16, brightness: 0.9 }),
  night: Object.freeze({ preset: 'night-lit', interiorLightsOn: true, tint: 0xc8d9ff, overlay: 0x42618d, overlayAlpha: 0.24, brightness: 0.76 }),
  closed: Object.freeze({ preset: 'closed-dark', interiorLightsOn: false, tint: 0x73839a, overlay: 0x172236, overlayAlpha: 0.52, brightness: 0.46 }),
} satisfies Readonly<Record<OfficeTimePhase, OfficeLightingPreset>>)

export interface OfficeAutonomyPolicy {
  readonly mode: 'workstation-biased' | 'free-time' | 'absent'
  readonly preferredActivity: 'seated-workstation' | 'roam-or-idle' | 'absent'
  readonly preferBoundWorkstation: boolean
  readonly allowRoaming: boolean
  readonly returnToBoundWorkstation: boolean
  readonly seatedWeight: number
  readonly roamWeight: number
  readonly pauseWeight: number
  readonly roamIntervalMs: readonly [number, number] | null
  readonly roamDurationMs: readonly [number, number] | null
}

const WORK_AUTONOMY: OfficeAutonomyPolicy = Object.freeze({
  mode: 'workstation-biased', preferredActivity: 'seated-workstation',
  preferBoundWorkstation: true, allowRoaming: true, returnToBoundWorkstation: true,
  seatedWeight: 0.88, roamWeight: 0.07, pauseWeight: 0.05,
  roamIntervalMs: Object.freeze([240_000, 420_000] as const),
  roamDurationMs: Object.freeze([12_000, 30_000] as const),
})

// Lunch is a quiet break at the office, not a new free-roaming shift. An idle
// employee retains her usual seat and only takes the same short, optional walk.
// Being seated never starts a Harness task or a taskless typing animation.
const LUNCH_AUTONOMY: OfficeAutonomyPolicy = Object.freeze({ ...WORK_AUTONOMY })

/** The four-to-seven minute work interval belongs to someone at a desk. A
 * colleague already on the floor pauses briefly between visits. */
export function floorPauseRange(policy:OfficeTimePolicy):readonly [number,number] {
  return policy.attendancePeriod==='lunch' ? [18_000,38_000] : [9_000,24_000]
}

const CLOSED_AUTONOMY: OfficeAutonomyPolicy = Object.freeze({
  mode: 'absent', preferredActivity: 'absent',
  preferBoundWorkstation: false, allowRoaming: false, returnToBoundWorkstation: false,
  seatedWeight: 0, roamWeight: 0, pauseWeight: 0,
  roamIntervalMs: null, roamDurationMs: null,
})

/** Local 24-hour clock text (`HH:MM`) for the office header. */
export function formatOfficeClock(date: Date): string {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    throw new TypeError('Office clock requires a valid Date')
  }
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${hours}:${minutes}`
}

export interface OfficeTimePolicy extends Omit<OfficeClockPolicy, 'isWorkingDate' | 'bedtime'> {
  /** Absent only on legacy callers constructing the prior presentation DTO. */
  readonly isWorkingDate?: boolean
  /** Closed-night subset only; actual idle evidence is still required to sleep. */
  readonly bedtime?: boolean
  readonly lighting: OfficeLightingPreset
  readonly monitors: Readonly<{
    mode: 'all-off' | 'bound-workstations' | 'active-tasks-only'
    forceAllOff: boolean
    boundWorkstationsOn: boolean
    activeTaskWorkstationsOn: boolean
  }>
  readonly autonomy: OfficeAutonomyPolicy
}

/** Add scene presentation to the shared clock without changing its attendance facts. */
export function createOfficeTimePolicy(options: Parameters<typeof createOfficeClockPolicy>[0] = {}): OfficeTimePolicy {
  const clock = createOfficeClockPolicy(options)
  const { phase, charactersPresent, isWorkPeriod } = clock
  return Object.freeze({
    ...clock,
    lighting: OFFICE_LIGHTING_PRESETS[phase],
    monitors: Object.freeze({
      mode: !charactersPresent ? 'all-off' : isWorkPeriod ? 'bound-workstations' : 'active-tasks-only',
      forceAllOff: !charactersPresent,
      boundWorkstationsOn: charactersPresent && isWorkPeriod,
      activeTaskWorkstationsOn: charactersPresent,
    }),
    autonomy: charactersPresent ? isWorkPeriod ? WORK_AUTONOMY : LUNCH_AUTONOMY : CLOSED_AUTONOMY,
  })
}

import type { OfficeTimePolicy } from '../../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/office2d/timePolicy.ts'
import { DEFAULT_OFFICE_PRESENCE, type OfficePresencePreference } from '../office-presentation-settings.ts'

/** Changes scene visibility and ambient leisure only, retaining the real clock and attendance facts. */
export function withOfficePresence(policy: OfficeTimePolicy, preference: OfficePresencePreference = DEFAULT_OFFICE_PRESENCE): OfficeTimePolicy {
  // Both views follow the same working day. The ensemble option only extends
  // presence to times when the schedule would send idle employees home.
  if (preference === 'schedule' || policy.charactersPresent) return policy
  return Object.freeze({
    ...policy,
    charactersPresent: true,
    bedtime: false,
    monitors: Object.freeze({ ...policy.monitors,
      mode: policy.isWorkPeriod ? 'bound-workstations' as const : 'active-tasks-only' as const,
      forceAllOff: false, boundWorkstationsOn: policy.isWorkPeriod, activeTaskWorkstationsOn: true,
    }),
    autonomy: Object.freeze({ mode: 'free-time' as const, preferredActivity: 'roam-or-idle' as const,
      preferBoundWorkstation: false, allowRoaming: true, returnToBoundWorkstation: true,
      seatedWeight: 0.4, roamWeight: 0.45, pauseWeight: 0.15,
      roamIntervalMs: Object.freeze([12_000, 32_000] as const),
      roamDurationMs: Object.freeze([8_000, 18_000] as const),
    }),
  })
}

import type {
  ReactNode
} from 'react'
import type {
  SceneCommand,
  SceneCommandId,
  SceneEvent
} from './office-harness/SceneProtocol.ts'
import type { OfficeActorYieldPlan } from './office2d/actorYield.ts'
import type {
  OfficeWalkDirection
} from './office2d/employeeCatalog.ts'
import type {
  OfficeRoute
} from './office2d/navigation.ts'
import type {
  OfficeTimePolicy
} from './office2d/timePolicy.ts'
import type { OfficeWorkstationId } from './office2d/workstationSeating.ts'
import type { OfficeAssetId } from './office2d/assets.ts'
export interface OfficeSceneEmployee {
  readonly id: string
  readonly name: string
  readonly activity: string
  readonly availability: 'available' | 'working'
  readonly sceneActivity: 'idle' | 'working'
  readonly workstationId?: string
  /** A temporary presentation-only desk for sorting notes between real tasks. */
  readonly ambientDesk?: boolean
  /** The real job retains its seat and monitor while awaiting input or stopping. */
  readonly deskOnHold?: boolean
  readonly canDrag: boolean
}

export interface OfficeSceneReport {
  readonly reportId: string
  readonly title: string
  readonly workstationId?: string
}

export interface OfficeSceneSurfaceProps {
  readonly employees: readonly OfficeSceneEmployee[]
  readonly reports: readonly OfficeSceneReport[]
  readonly commands?: readonly SceneCommand[]
  readonly onSceneEvent?: (event: SceneEvent) => void
  readonly onCharacterClick?: (employeeId: string) => void
  readonly paperPlanePick?: ((id: string, point: {x:number; y:number}) => void) | undefined
  readonly employeeDestination?: import('./office2d/actorPortraitActivation.ts').OfficeEmployeeDestination
  readonly onReportClick?: (reportId: string) => void
  readonly onDesktopPet?: import('./office2d/scenePlacement.ts').DesktopPetDrop | undefined
  readonly onBindWorkstation?: (employeeId: string, workstationId: OfficeWorkstationId) => void | Promise<unknown>
  /** Deterministic clock seam for tests and host-controlled previews. */
  readonly timePolicy?: OfficeTimePolicy
  readonly officeTheme?: string
  readonly employeeSkins?: Readonly<Record<string, string>>
  /** Known missing optional art. Keep the same actor's admitted walk frame for a rest pose. */
  readonly unavailableAssetIds?: readonly OfficeAssetId[]
  readonly renderActorOverlay?: (employeeId: string) => ReactNode
  /** Furniture/decorations in the 1672×941 world, moving with the scene. */
  readonly decorations?: ReactNode
  /** Actual stationary scene candidates; does not mutate Harness attendance. */
  readonly onAmbientEligibleChange?: (employeeIds: readonly string[]) => void
  /** Keep the world alive under other surfaces; this never stops Harness work. */
  readonly presentationActive?: boolean
  readonly reduceMotion?: boolean
  /** Isolated visual fixture only; the Harness application never sets this. */
  readonly seatReview?: Readonly<{
    employeeId: string
    workstationId: OfficeWorkstationId
    mode: 'seated-idle' | 'working'
    frameIndex: number | null
  }>
}

export type ActorMode = 'idle' | 'ambient' | 'desk-break' | 'task' | 'working' | 'report' | 'drag'

export interface Point { readonly x: number; readonly y: number }

export interface ActorRuntime {
  readonly employeeId: string
  readonly position: Point
  readonly direction: OfficeWalkDirection
  readonly mode: ActorMode
  readonly route: OfficeRoute | null
  readonly waypointIndex: number
  readonly targetWorkstationId: OfficeWorkstationId | null
  readonly placedUntil?: number
  readonly nextAmbientAt: number
  readonly roamOrdinal: number
  readonly waitStreak: number
  readonly activeCommandId: SceneCommandId | null
  /** Executing start identity, retained independently of the next host command. */
  readonly activeTaskCommand?: SceneCommand | null
  /** A delivered work result may walk to the entrance without running work. */
  readonly activeReportCommand?: SceneCommand | null
  readonly reportReplans?: number
  readonly trafficYield?: OfficeActorYieldPlan | null
  /** Normalized gait phase from accepted route distance; never wall time. */
  readonly walkPhase?: number
}


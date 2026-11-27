import { gestureSequenceFor, type IdleGestureSequence } from './office2d/idleGestures.ts'
import { drawActorLook, getActorLookAtlas, type ActorLookAtlas } from './office2d/actorLookAtlas.ts'
import { usePostDropLook } from './usePostDropLook.ts'
import { getActorGestureAtlas } from './office2d/actorGestureAtlas.ts'
import { LANDING_MS, landingStartForRelease, motionPhase, sampleGripLag, type ActorMotion } from './office2d/actorMotion.ts'
import { getActorPoseAtlas } from './office2d/actorPoseAtlas.ts'
import { useEffect, useMemo, useRef, useState } from 'react'
import { OfficeScenePreview } from './OfficeScenePreview.tsx'
import { seatMatte, seatedBodyLayer } from './office2d/sceneChairMatte.ts'
import { officeDeskFrame, officeDeskPlacement, officeDeskShell, type OfficeDeskDrawing } from './office2d/officeDeskPlacement.ts'
import { drawOfficeDeskFrame } from './office2d/drawOfficeDeskFrame.ts'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { independentDropFloor } from './office2d/independentDropFloor.ts'
import { desktopDropPoint, nearestFloorPoint, uncrowdedFloorPoint } from './office2d/scenePlacement.ts'
import type { OfficeSceneSurfaceProps, OfficeSceneEmployee } from './OfficeSceneSurface.types.ts'
import { useIndependentOfficeSpace } from './office2d/useIndependentOfficeSpace.ts'
import { assertIndependentOfficeSpaceBindings, type AdmittedIndependentOfficeSpace } from './office2d/independentOfficeSpaceAdmission.ts'
import { SceneBitmapBatch } from './office2d/SceneBitmapBatch.ts'
import { getOfficeAsset, resolveOfficeAssetUrl, type OfficeAssetId, type OfficeFrameStrip } from './office2d/assets.ts'
import { getEmployeeCatalogWithSkin, getEmployeeSkinWalkProfile } from './office2d/employeeSkins.ts'
import { getIndependentOfficeWalkBodyProfile, independentFrameRect as officeFrameRect } from './office2d/independentMovementPresentation.ts'
import { advanceOfficeActorPortraitTap, officeEmployeeAction, type OfficeActorPortraitTap } from './office2d/actorPortraitActivation.ts'
import { OfficeActionMenu, type OfficeActionMenuTarget } from './OfficeActionMenu.tsx'
import { OfficeSkinSelectionNotices } from './OfficeSkinSelectionNotices.tsx'
import { missingIndependentFinalPoses } from './office2d/independentFinalPoseAvailability.ts'
import { resolveOfficeManualAction, type OfficeManualAction } from './office2d/manualActions.ts'
import { createSceneEvent } from './office-harness/SceneProtocol.ts'
import { independentFloorRoute, approachProjectedWorkstation, advanceIndependentTaskArrival, createIndependentArrivalState, interruptIndependentTaskArrival, independentArrivalFrame, independentArrivalAssetDependencies, markIndependentArrivalPainted, validateIndependentFloorGraph, type IndependentArrivalEvent, type IndependentArrivalState, type IndependentFloorGraph } from './office2d/independentTaskArrival.ts'
import { createOfficeTimePolicy } from './office2d/timePolicy.ts'
import type { OfficeWorkstationId } from './office2d/workstationSeating.ts'
import { independentChairForBinding, independentNeedsAnimation, paintIndependentChairUnderlay, selectIndependentWholeBinding, type IndependentIntegratedChair } from './office2d/independentChairOwnership.ts'
import { independentFurnitureForSlot, paintIndependentFurnitureDetail, type IndependentFurnitureDetail } from './office2d/independentFurnitureDetail.ts'
import { independentSceneActorDepth, independentSceneDepthLayers, independentSceneOccluderCovers, paintIndependentSceneOccluder, selectIndependentSceneOccluders, type IndependentSceneOccluder, type IndependentSelectedSceneOccluder } from './office2d/independentSceneOccluders.ts'
import { advanceIndependentAmbient, independentFloorLanePosition, independentTrafficMayAdvance, initialIndependentAmbient, type IndependentAmbientState } from './office2d/independentAmbient.ts'
import type { BrowserIndependentFloorGraph } from './office2d/browserOfficeNavigation.ts'
import { OFFICE_MONITOR_PANELS } from './office2d/officeMonitorPanels.ts'
import { fittedDeskPose, floorSpriteProfile, officeBodyHit, officeFigureCenter, standingFigureHeight } from './office2d/officeFigureScale.ts'
import { sampleDeskRhythm } from './office2d/deskRhythm.ts'
import { deskFrameRegistration } from './office2d/deskFrameRegistration.ts'
import { getWalkAtlas, sampleWalkAtlas, drawWalkAtlas } from './office2d/walkAtlas.ts'
import { createOfficeFrameTimeline } from './office2d/frameTimeline.ts'
import { OfficeSeatFeedback, useOfficeSeatFeedback, type SeatPreview } from './OfficeSeatFeedback.tsx'

type Point = readonly [number, number]
type Slot = { id: string; seat: Point; keyboard?: Point; facing?:string; approach: Point; height: number; dropPolygon: readonly Point[]; foregroundPolygons: readonly (readonly Point[])[]; furnitureDetail?: IndependentFurnitureDetail }
type Binding = { anatomicalSourcePixels?: { hand: Point }; employeeId: string; skinId: string; stationId: string; browserSrc: string; sourceSha256: string; frameSize: Point; frameCount: number; frameOrder: readonly number[]; frameDurationsMs: readonly number[]; restFrame: number; origin: Point; uniformScale: number; visualReviewed: boolean; integratedChair?: IndependentIntegratedChair; sourceForegroundPolygons?: readonly (readonly Point[])[]; sourceForegroundOccluderPolygons?: readonly (readonly Point[])[]; sourceForegroundSemantics?: { coordinateSpace: string; sourceSHA256: string; kind: string }; actorFurnitureOwnership?: { actor: string; sourceHasChair: boolean } }
type Space = { layout: { kind: 'office'; theme: string; size: Point; stations: readonly Slot[]; renderBindings: readonly Binding[]; navigation: { entry: Point; floorGraph?: unknown }; sceneOccluders?: readonly IndependentSceneOccluder[] }; phases: Record<string, { src: string; sha256: string; authoredPhase?: string }> }
type WalkPaint = { atlas: NonNullable<ReturnType<typeof getWalkAtlas>>; bitmap: ImageBitmap; rect: ReturnType<typeof sampleWalkAtlas>['rect'] }
type Paint = { gesture?: string; desk?: OfficeDeskDrawing; still?: boolean; motion?: ActorMotion; bodyHeight?: number; gait?: WalkPaint | undefined; employee: OfficeSceneEmployee; image: ImageBitmap; bodyLayer?: HTMLCanvasElement | undefined; frame: number; sourceOrigin: Point; size: Point; origin: Point; scale: number; station: Slot | undefined; depthY: number; roaming: boolean; manual: boolean; chair?: IndependentIntegratedChair | undefined; animated?: boolean; arrivalKey?: string; arrivalPaint?: 'binding' | 'floor' | 'report-finished'; sourceForegroundPolygons?: readonly (readonly Point[])[] | undefined; sourceForegroundOccluderPolygons?: readonly (readonly Point[])[] | undefined; maskOrigin?: Point; foot?: Point; reportNote?: readonly [x: number, y: number, height: number]; reportComplete?: boolean }

export function independentPointInPolygon(point: Point, polygon: readonly Point[]): boolean {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]!, b = polygon[j]!
    if ((a[1] > point[1]) !== (b[1] > point[1]) && point[0] < (b[0] - a[0]) * (point[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside
  }
  return inside
}
function deskDropTarget(stations:readonly Slot[], point:Point) {
  const within=stations.filter(station=>independentPointInPolygon(point,station.dropPolygon)
    || Math.hypot((point[0]-station.seat[0])/40,(point[1]-station.seat[1])/32)<=1)
  return within.sort((a,b)=>Math.hypot(a.seat[0]-point[0],a.seat[1]-point[1])-Math.hypot(b.seat[0]-point[0],b.seat[1]-point[1]))[0]
}
function polygonArea(polygon: readonly Point[]): number {
  const origin = polygon[0]!
  let area = 0
  for (let index = 1; index < polygon.length - 1; index++) {
    const a = polygon[index]!, b = polygon[index + 1]!
    area += (a[0] - origin[0]) * (b[1] - origin[1]) - (b[0] - origin[0]) * (a[1] - origin[1])
  }
  return area / 2
}
function sourceForegroundSelector(binding: Binding, size: Point): void {
  if (binding.sourceForegroundOccluderPolygons === undefined) return
  const polygonsFit = (value: readonly (readonly Point[])[] | undefined, bounds: Point) => Array.isArray(value) && value.length > 0 && value.every(polygon => Array.isArray(polygon) && polygon.length >= 3
    && polygon.every(point => Array.isArray(point) && point.length === 2 && point.every((n, index) => Number.isFinite(n) && n >= 0 && n <= bounds[index]!)) && Math.abs(polygonArea(polygon)) > 0)
  if (binding.integratedChair || binding.actorFurnitureOwnership?.actor !== 'complete-chair-free-person' || binding.actorFurnitureOwnership.sourceHasChair !== false
    || binding.sourceForegroundSemantics?.coordinateSpace !== 'source-frame-pixels' || binding.sourceForegroundSemantics.sourceSHA256 !== binding.sourceSha256 || !/^[a-f0-9]{64}$/.test(binding.sourceSha256)
    || typeof binding.sourceForegroundSemantics.kind !== 'string' || !binding.sourceForegroundSemantics.kind
    || !polygonsFit(binding.sourceForegroundPolygons, binding.frameSize) || !polygonsFit(binding.sourceForegroundOccluderPolygons, size)) throw Error('人物与工位的遮挡资源不匹配，已保留原工位。')
}
export function independentWholeBinding(space: Space, employeeId: string, skinId: string | undefined, stationId: string | undefined, phase?: string) {
  // The Host reports an exact missing outfit/point. Keep this actor on its own
  // available floor pose rather than failing every other actor's resource load.
  // The strict selector still validates any selected chair/phase combination.
  if (skinId && !space.layout.renderBindings.some(binding => binding.visualReviewed && binding.employeeId === employeeId
    && binding.skinId === skinId && binding.stationId === stationId)) return undefined
  return selectIndependentWholeBinding(space.layout.renderBindings, employeeId, skinId, stationId,
    phase ? { officeTheme: space.layout.theme, phase, backgroundSha256: space.phases[phase]?.sha256 ?? '', size: space.layout.size } : undefined)
}
function physicalFrame(elapsed: number, durations: readonly number[], order: readonly number[], loop = true) {
  const total = durations.reduce((sum, value) => sum + value, 0)
  let remaining = loop ? elapsed % total : Math.min(elapsed, total - 1)
  for (let index = 0; index < durations.length; index++) { if (remaining < durations[index]!) return order[index] ?? index; remaining -= durations[index]! }
  return order.at(-1) ?? 0
}
const bitmapHashes = new WeakMap<ImageBitmap, string>()
// These particular report sheets depict the full-height portrait proportions.
// Keep the scene's compact figure during handoff; matching outfit strips animate normally.
const portraitReportAssets = new Set<OfficeAssetId>([
  'employee.duanmu-yan.report-handoff.v1', 'employee.bai-shuangming.skin.v1.report-handoff',
  'employee.jingyuniang.report-handoff.v1', 'employee.jingyuniang.skin.v1.report-handoff',
  'employee.longmama.report-handoff.v1', 'employee.longmama.skin.v1.report-handoff',
  'employee.claude.report-handoff.v1', 'employee.claude.skin.v1.report-handoff',
  'employee.gemini.skin.v1.report-handoff', 'employee.grok.skin.v1.report-handoff',
])
function registeredDeskOrigin(binding: Binding, frame: number, origin: Point, scale: number) {
  const shift = deskFrameRegistration(binding.sourceSha256, frame)
  return { maskOrigin: origin, origin: shift ? [origin[0] + shift[0] * scale, origin[1] + shift[1] * scale] as Point : origin }
}

function reportPaint(catalog: NonNullable<ReturnType<typeof getEmployeeCatalogWithSkin>>, images: Map<string, ImageBitmap>,
  foot: Point, height: number, elapsed: number, reduceMotion: boolean) {
  // Some original outfits have no report strip. Keep their own floor figure
  // present and show the document beside it until a complete handoff is painted.
  const handoff = catalog.reportHandoff
  const note = handoff.mode === 'portrait-transition' || !!handoff.asset && portraitReportAssets.has(handoff.asset)
  const asset = note ? catalog.walk.down : handoff.asset
  const count = note ? 1 : handoff.frameCount
  if (!asset || !count) return undefined
  const record = getOfficeAsset(asset), image = images.get(resolveOfficeAssetUrl(asset))
  if (!image) return undefined
  const strip = record.frameStrip, size: Point = strip ? [strip.frameWidth, strip.frameHeight] : [record.dimensions.width / count, record.dimensions.height]
  const profile = floorSpriteProfile(record.sha256, size[1], { coreHeightPx: size[1] * .85, anchor: strip?.anchor ?? { x: .5, y: .94 } })
  const scale = height / profile.coreHeightPx
  const frame = note ? 0 : reduceMotion ? count - 1 : Math.min(count - 1, Math.floor(elapsed / 180))
  const rect = strip ? officeFrameRect(strip, frame) : [frame * size[0], 0]
  const duration = note ? 900 : count * 180
  const settled = reduceMotion ? 1 : Math.min(1, elapsed / 220)
  return { image, size, frame, sourceOrigin: [rect[0]!, rect[1]!] as Point, scale, foot,
    origin: [foot[0] - profile.anchor.x * size[0] * scale, foot[1] - profile.anchor.y * size[1] * scale] as Point,
    ...(note ? { reportNote: [foot[0] + height * .21, foot[1] - height * (.68 + .04 * settled), height * .155] as const } : {}),
    reportComplete: reduceMotion || elapsed >= duration }
}

function drawReportNote(context: CanvasRenderingContext2D, [x, y, h]: NonNullable<Paint['reportNote']>) {
  context.save()
  context.fillStyle = '#5a5460'; context.fillRect(x, y, h * .77, h)
  context.fillStyle = '#fff4d9'; context.fillRect(x + h * .06, y + h * .06, h * .65, h * .88)
  context.fillStyle = '#8c7771'; context.fillRect(x + h * .17, y + h * .28, h * .44, h * .06)
  context.fillRect(x + h * .17, y + h * .46, h * .34, h * .06)
  context.fillStyle = '#c98472'; context.fillRect(x + h * .48, y + h * .66, h * .14, h * .13)
  context.restore()
}

function deskFrame(binding: Binding, employee: OfficeSceneEmployee, elapsed: number) {
  if (employee.deskOnHold) return binding.restFrame
  const duration = binding.frameDurationsMs.reduce((total, ms) => total + ms, 0)
  const rhythm = sampleDeskRhythm(employee.id, elapsed, duration, employee.ambientDesk === true)
  return rhythm.reading ? binding.restFrame : physicalFrame(rhythm.stripElapsedMs, binding.frameDurationsMs, binding.frameOrder)
}
async function verifiedImage(src: string, expected: string, signal: AbortSignal): Promise<ImageBitmap> {
  const response = await fetch(src, { signal }); if (!response.ok) throw Error('对应的主题或完整坐姿资源暂不可用。')
  const buffer = await response.arrayBuffer()
  const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', buffer))).map(value => value.toString(16).padStart(2, '0')).join('')
  if (digest !== expected) throw Error('主题或完整坐姿资源校验失败，已保留原工位。')
  const image = await createImageBitmap(new Blob([buffer], { type: 'image/png' }))
  if (signal.aborted) { image.close(); throw Error('主题资源读取已取消。') }
  bitmapHashes.set(image, expected)
  return image
}
/** Complete authored architecture, its own nine physical stations, and exact own whole poses. */
export function IndependentOfficeSceneSurface(props: OfficeSceneSurfaceProps) {
  const [attempt,setAttempt] = useState(0)
  return <IndependentOfficeSceneContent key={attempt} {...props} retry={()=>setAttempt(n=>n+1)}/>
}

function IndependentOfficeSceneContent(props: OfficeSceneSurfaceProps & {retry():void}) {
  const look=usePostDropLook()
  const priorSkins=useRef(new Map<string,string|undefined>())
  useEffect(()=>{
    const next=new Map(props.employees.map(actor=>[actor.id,props.employeeSkins?.[actor.id]]))
    for(const [id,skin] of priorSkins.current){
      if(!next.has(id) || next.get(id)!==skin)look.cancel(id)
    }
    priorSkins.current=next
  },[look,props.employees,props.employeeSkins])
  useEffect(()=>()=>look.cancel(),[look,props.officeTheme])
  useEffect(()=>{if(props.presentationActive===false || props.reduceMotion)look.cancel()},[look,props.presentationActive,props.reduceMotion])
  const spaceRead = useIndependentOfficeSpace(props.officeTheme, props.presentationActive !== false)
  const loadedSpace = spaceRead.status === 'ready' ? spaceRead.space : undefined
  const spaceAdmission = useMemo<Readonly<{ space: AdmittedIndependentOfficeSpace | undefined; error: string | undefined }>>(() => {
    if (loadedSpace === undefined) return { space: undefined, error: undefined }
    try {
      assertIndependentOfficeSpaceBindings(loadedSpace)
      return { space: loadedSpace, error: undefined }
    } catch (reason) {
      return { space: undefined, error: reason instanceof Error ? reason.message : '办公室坐姿资源暂时无法核验，请重新选择场景。' }
    }
  }, [loadedSpace])
  const space = spaceAdmission.space
  const spaces = space === undefined ? {} : { [space.layout.theme]: space }
  const canvas = useRef<HTMLCanvasElement>(null)
  const live = useRef(props); live.current = props
  const images = useRef(new Map<string, ImageBitmap>())
  // Pending reads belong to an effect; committed pixels remain owned by this
  // mounted canvas until a replacement is installed or the canvas is released.
  const bitmapBatches = useRef(new Set<SceneBitmapBatch<ImageBitmap>>())
  const publishImages = (next: Map<string, ImageBitmap>, owners: readonly SceneBitmapBatch<ImageBitmap>[]) => {
    const previous = bitmapBatches.current
    bitmapBatches.current = new Set(owners)
    images.current = next
    for (const batch of previous) if (!bitmapBatches.current.has(batch)) batch.release()
  }
  const painted = useRef<Paint[]>([])
  const sceneOccluders = useRef<readonly IndependentSelectedSceneOccluder[]>([])
  const paintedSceneOccluders = useRef<readonly IndependentSelectedSceneOccluder[]>([])
  const requestPaint = useRef<() => void>(() => {})
  const cancelPaint = useRef<() => void>(() => {})
  // Full multi-frame strips load on demand. Compact redrawn costumes are
  // already available when the scene presents its first frame.
  const lookComposite=useRef<{canvas:HTMLCanvasElement;src:string;head:number;eye:number}|null>(null)
  const walkingImages = useRef(new Map<string,SceneBitmapBatch<ImageBitmap>>())
  const floorBitmap = (atlas: {src: string; sha256: string}) => {
    const prepared = images.current.get(atlas.src)
    if (prepared) return prepared
    const cache = walkingImages.current
    const cached = cache.get(atlas.src)
    if (cached) {
      cache.delete(atlas.src); cache.set(atlas.src,cached)
      return cached.images.get(atlas.src)
    }
    if (cache.size >= 16) {
      const oldest = cache.keys().next().value!
      cache.get(oldest)?.release()
      cache.delete(oldest)
    }
    const batch = new SceneBitmapBatch(verifiedImage)
    cache.set(atlas.src,batch)
    void batch.load(new Map([[atlas.src,atlas.sha256]])).then(() => {
      if (cache.get(atlas.src)===batch) requestPaint.current()
    }).catch(() => { /* The complete painted source remains available. */ })
    return undefined
  }
  const walkPaint = (id: OfficeAssetId, strip: OfficeFrameStrip, time: number, loop = true): WalkPaint | undefined => {
    const atlas = getWalkAtlas(id)
    const bitmap = atlas && floorBitmap(atlas)
    return atlas && bitmap ? { atlas, bitmap, rect: sampleWalkAtlas(atlas, strip, time, loop).rect } : undefined
  }
  const stillWalkPaint = (id: OfficeAssetId, strip: OfficeFrameStrip) =>
    getWalkAtlas(id)?.frameDurationsMs ? walkPaint(id, strip, 0) : undefined
  useEffect(() => () => {
    for(const batch of walkingImages.current.values()) batch.release()
    walkingImages.current.clear()
    lookComposite.current=null
  }, [space?.layout.theme])
  const landed = useRef(new Map<string,{start:number; pose:number|undefined}>())
  const gestureSequences=useRef(new Map<string,IdleGestureSequence>())
  const idleStarted = useRef(new Map<string,number>())
  const clock = useRef(0)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')
  const [target, setTarget] = useState<OfficeActionMenuTarget | null>(null)
  const [seatPreview,setSeatPreview]=useState<SeatPreview|null>(null)
  const seatFeedback=useOfficeSeatFeedback(props.employees,props.onBindWorkstation,props.officeTheme,props.presentationActive!==false)
  const dragRevision=useRef(0)
  const [manual, setManual] = useState<Record<string, OfficeManualAction>>({})
  const manualRevision = useRef(0)
  const manualRef = useRef(manual); manualRef.current = manual
  const gesture = useRef<{ id: string; pointerId: number; start: Point; origin: Point; startClient: Point; liftedAt?: number; lag?: ReturnType<typeof sampleGripLag>; pose?:number; pressedAt: number; latest: Point; moved: boolean; dragging: boolean; cancelled: boolean; arrivalKey: string; arrivalBefore: IndependentArrivalState | undefined } | null>(null)
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingTap = useRef<OfficeActorPortraitTap | null>(null)
  const clearHold = () => { if (holdTimer.current !== null) clearTimeout(holdTimer.current); holdTimer.current = null }
  const cancelGesture = () => {
    setSeatPreview(null)
    clearHold(); const value = gesture.current; gesture.current = null; pendingTap.current = null
    if (value?.arrivalBefore && arrivals.current.get(value.arrivalKey)?.lastCommandId === value.arrivalBefore.lastCommandId) arrivals.current.set(value.arrivalKey, value.arrivalBefore)
    if (value && canvas.current?.hasPointerCapture?.(value.pointerId)) canvas.current.releasePointerCapture(value.pointerId)
    requestPaint.current()
  }
  useEffect(() => {
    const blur = () => cancelGesture(), key = (event: KeyboardEvent) => { if (event.key === 'Escape') cancelGesture() }
    const visibility = () => { if (document.hidden) cancelGesture() }
    const move = (event: PointerEvent) => {
      const value = gesture.current
      if (value && !value.dragging && value.pointerId === event.pointerId
        && live.current.employeeDestination !== 'contact' && Math.hypot(event.clientX - value.startClient[0], event.clientY - value.startClient[1]) > 8) { clearHold(); value.cancelled = true; pendingTap.current = null }
    }
    const release = (event: PointerEvent) => { if (gesture.current && !gesture.current.dragging && gesture.current.pointerId === event.pointerId) cancelGesture() }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', release); window.addEventListener('pointercancel', release)
    window.addEventListener('blur', blur); window.addEventListener('keydown', key); document.addEventListener('visibilitychange', visibility)
    return () => { cancelGesture(); window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', release); window.removeEventListener('pointercancel', release); window.removeEventListener('blur', blur); window.removeEventListener('keydown', key); document.removeEventListener('visibilitychange', visibility) }
  }, [])
  useEffect(() => { if (props.presentationActive === false) cancelGesture() }, [props.presentationActive])
  const policy = props.timePolicy ?? createOfficeTimePolicy({ date: new Date() })
  const phase = space?.phases[policy.phase]
  const commandEvents = useRef(new Set<string>())
  const commandStarted = useRef(new Map<string, number>())
  const workingStarted = useRef(new Map<string, number>())
  const manualStarted = useRef(new Map<string, number>())
  const arrivals = useRef(new Map<string, IndependentArrivalState>())
  const ambientStates = useRef(new Map<string, IndependentAmbientState>())
  // Activity, availability and freshly allocated props do not select different pixels.
  const resourceKey = JSON.stringify(props.employees.map(employee => [employee.id,
    props.employeeSkins?.[employee.id] ?? '', employee.workstationId ?? '',
    resolveOfficeManualAction(employee.id, manual[employee.id], props.employeeSkins?.[employee.id])?.asset ?? ''])
    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))))
  const resourceGeneration = JSON.stringify([space?.layout.theme, policy.phase, phase?.src, phase?.sha256, resourceKey])
  const requiredResourceGeneration = useRef(resourceGeneration); requiredResourceGeneration.current = resourceGeneration
  const loadedResourceGeneration = useRef<string | undefined>(undefined)
  const committedResourceGeneration = useRef<string | undefined>(undefined)
  const composition = useMemo(() => ({ space, resourceKey }), [space, resourceKey])
  const lastCompletePaint = useRef<typeof composition | undefined>(undefined)
  const restoreOriginal = () => {
    if (canvas.current) delete canvas.current.dataset.officeActors
    lastCompletePaint.current = undefined
    const context = canvas.current?.getContext('2d'), background = phase && images.current.get(phase.src)
    if (context && space) { context.clearRect(0, 0, ...space.layout.size); if (background) context.drawImage(background, 0, 0) }
    painted.current = []
    sceneOccluders.current = []; paintedSceneOccluders.current = []
  }
  useEffect(() => {
    if (!space || !phase) { committedResourceGeneration.current = undefined; lastCompletePaint.current = undefined; publishImages(new Map(), []); painted.current = []; return }
    if (props.presentationActive === false) return
    const generation = resourceGeneration
    if (committedResourceGeneration.current === generation) {
      loadedResourceGeneration.current = generation
      setReady(true); requestPaint.current(); return
    }
    const releaseFailure = (count: number) => { try { console.warn('[Luma] Scene bitmap release failed', count) } catch {} }
    const backgroundBatch = new SceneBitmapBatch(verifiedImage, releaseFailure)
    const resourceBatch = new SceneBitmapBatch(verifiedImage, releaseFailure)
    const gaitBatch = new SceneBitmapBatch(verifiedImage, releaseFailure)
    let disposed = false; loadedResourceGeneration.current = undefined; committedResourceGeneration.current = undefined; setReady(false); setError('')
    cancelGesture()
    // A change of daylight replaces the same scene. Canvas pixels survive the
    // bitmap release, so keep the complete frame visible while the next one loads.
    const keepFrame = lastCompletePaint.current === composition
    if (keepFrame) painted.current = []
    else restoreOriginal()
    const releasePending = () => {
      for (const batch of [backgroundBatch, resourceBatch, gaitBatch]) if (!bitmapBatches.current.has(batch)) batch.release()
    }
    void (async () => {
      await backgroundBatch.load(new Map([[phase.src, phase.sha256]]))
      const background = backgroundBatch.images.get(phase.src)!
      if (disposed || requiredResourceGeneration.current !== generation) { releasePending(); return }
      publishImages(new Map(backgroundBatch.images), [backgroundBatch])
      if (!keepFrame) restoreOriginal()
      const occluders = selectIndependentSceneOccluders(space.layout, space.phases, policy.phase)
      if (occluders.length && (background.width !== space.layout.size[0] || background.height !== space.layout.size[1])) throw Error('场景前景的原始背景尺寸不匹配，已保留原场景。')
      const sources = new Map<string, string>(), chairs: IndependentIntegratedChair[] = [], furnitureDetails: IndependentFurnitureDetail[] = []
      const redrawnGaits = new Map<string, string>()
      const addSource = (src: string, hash: string) => {
        if (src === phase.src || (sources.has(src) && sources.get(src) !== hash)) throw Error('不同角色或场景资源的引用发生冲突，已保留原工位。')
        sources.set(src, hash)
      }
      if (OFFICE_MONITOR_PANELS[space.layout.theme]) {
        for (const screens of [space.phases.noon, space.phases.closed]) {
          if (screens && screens.src !== phase.src) addSource(screens.src, screens.sha256)
        }
      }
      for (const slot of space.layout.stations) {
        const detail = independentFurnitureForSlot(slot, { theme: space.layout.theme, size: space.layout.size, phase: policy.phase, backgroundSha256: phase.sha256 })
        if (detail) { furnitureDetails.push(detail); addSource(detail.browserSrc, detail.sourceSha256) }
      }
      for (const employee of props.employees) {
        const binding = independentWholeBinding(space, employee.id, props.employeeSkins?.[employee.id], employee.workstationId, policy.phase)
        const slot=space.layout.stations.find(s=>s.id===employee.workstationId)
        const drawing=slot && officeDeskPlacement(space.layout.theme,slot,employee.id,props.employeeSkins?.[employee.id])
        if (drawing) addSource(drawing.src,drawing.sha256)
        else if (binding) {
          sourceForegroundSelector(binding, space.layout.size)
          addSource(binding.browserSrc, binding.sourceSha256)
          const matte=seatMatte(binding)
          if(matte)addSource(matte.path,matte.sha256)
          const chair = independentChairForBinding(binding, { officeTheme: space.layout.theme, phase: policy.phase, backgroundSha256: phase.sha256, size: space.layout.size })
          if (chair) { chairs.push(chair); addSource(chair.cleanPlate.browserSrc, chair.cleanPlate.sha256) }
        }
        const catalog = getEmployeeCatalogWithSkin(employee.id, props.employeeSkins?.[employee.id])
        if (catalog) {
          for (const id of Object.values(catalog.walk)) {
            const gait = getWalkAtlas(id)
            if (gait?.frameDurationsMs) redrawnGaits.set(gait.src, gait.sha256)
          }
          // Accepted parent layouts have no reviewed navigation graph. Keep their
          // original walk/report inputs; do not activate a new rest profile.
          const dependencies = space.layout.navigation.floorGraph === undefined
            ? [...Object.values(catalog.walk), catalog.reportHandoff.asset].filter((id): id is OfficeAssetId => id !== undefined)
            : independentArrivalAssetDependencies(catalog)
          for (const id of dependencies) {
            if (portraitReportAssets.has(id)) continue
            const record = getOfficeAsset(id); addSource(resolveOfficeAssetUrl(id), record.sha256)
          }
        }
        const action = resolveOfficeManualAction(employee.id, manual[employee.id], props.employeeSkins?.[employee.id])
        if (action) { const record = getOfficeAsset(action.asset); addSource(resolveOfficeAssetUrl(action.asset), record.sha256) }
      }
      const [entries, gaits] = await Promise.all([
        resourceBatch.load(sources),
        gaitBatch.load(redrawnGaits).catch(() => [] as const),
      ])
      if (disposed || requiredResourceGeneration.current !== generation) { releasePending(); return }
      const next = new Map(entries); next.set(phase.src, background)
      for (const [src, image] of gaits) next.set(src, image)
      for (const chair of chairs) { const plate = next.get(chair.cleanPlate.browserSrc)!, expectedDimensions = chair.cleanPlate.region?.sourceSize ?? space.layout.size; if (plate.width !== expectedDimensions[0] || plate.height !== expectedDimensions[1]) throw Error('完整坐姿椅子的场景清底尺寸不匹配。') }
      for (const detail of furnitureDetails) { const image = next.get(detail.browserSrc)!; if (image.width !== detail.sourceSize[0] || image.height !== detail.sourceSize[1]) throw Error('椅子表面资源尺寸不匹配，已保留原场景。') }
      publishImages(next, [backgroundBatch, resourceBatch, gaitBatch]); sceneOccluders.current = occluders; loadedResourceGeneration.current = generation; committedResourceGeneration.current = generation; setReady(true); requestPaint.current()
    })().catch(reason => {
      resourceBatch.release()
      if (!disposed && requiredResourceGeneration.current === generation) {
        if (bitmapBatches.current.has(backgroundBatch)) publishImages(new Map(backgroundBatch.images), [backgroundBatch])
        loadedResourceGeneration.current = undefined; restoreOriginal(); setError(reason instanceof Error ? reason.message : String(reason))
      }
      releasePending()
    })
    return () => { disposed = true; releasePending(); if (loadedResourceGeneration.current === generation) loadedResourceGeneration.current = undefined }
  }, [space, phase, policy.phase, composition, resourceGeneration, props.presentationActive])
  useEffect(() => {
    if (!ready || !space || !phase) return
    let frame = 0, previous = performance.now()
    const paint = (now: number) => {
      frame = 0
      try {
      // A prior ready RAF can see new live props before their async preload commits.
      // Do not consume that command until the exact current resource generation is installed.
      if (loadedResourceGeneration.current !== resourceGeneration || requiredResourceGeneration.current !== resourceGeneration) return
      const current = live.current, context = canvas.current?.getContext('2d'), background = images.current.get(phase.src)
      if (!context || !background) return
      const active = current.presentationActive !== false && !document.hidden
      const deltaMs = active && !current.reduceMotion ? Math.min(50, Math.max(0, now - previous)) : 0
      clock.current += deltaMs; previous = now
      context.clearRect(0, 0, ...space.layout.size); context.drawImage(background, 0, 0)
      const rows: Paint[] = [], workingKeys = new Set<string>(), arrivalEvents: IndependentArrivalEvent[] = []
      const manualKeys = new Set<string>()
      const manualElapsedFor = (employee: OfficeSceneEmployee, action: NonNullable<ReturnType<typeof resolveOfficeManualAction>>) => {
        const key = JSON.stringify([space.layout.theme, employee.id, current.employeeSkins?.[employee.id] ?? '',
          employee.workstationId ?? '', action.asset, action.id, action.mode, action.revision])
        manualKeys.add(key)
        if (!manualStarted.current.has(key)) manualStarted.current.set(key, clock.current)
        return Math.max(0, clock.current - manualStarted.current.get(key)!)
      }
      let floorGraph: IndependentFloorGraph | undefined, graphError: string | undefined
      const visibleIds = new Set(current.employees.filter(employee=>policy.charactersPresent||employee.availability==='working').map(employee=>employee.id))
      const visibleArrivals = () => [...arrivals.current.entries()].filter(([key])=>{const [theme,id]=JSON.parse(key) as [string,string];return theme===space.layout.theme&&visibleIds.has(id)})
      const legacyLayout = space.layout.navigation.floorGraph === undefined
      if (!legacyLayout) {
        try { floorGraph = validateIndependentFloorGraph(space.layout.navigation.floorGraph, space.layout.size, space.layout.stations) }
        catch (reason) { graphError = reason instanceof Error ? reason.message : String(reason) }
      }
      for (const [employeeIndex, employee] of current.employees.entries()) {
        if (!policy.charactersPresent && employee.availability !== 'working') continue
        const skin = current.employeeSkins?.[employee.id], binding = independentWholeBinding(space, employee.id, skin, employee.workstationId, policy.phase)
        const station = space.layout.stations.find(slot => slot.id === employee.workstationId)
        const command = current.commands?.find(value => value.employeeId === employee.id && value.workstationId === employee.workstationId)
        const drawing=station && officeDeskPlacement(space.layout.theme,station,employee.id,skin)
        const deskImage=drawing && images.current.get(drawing.src)
        const paintDesk=(working:boolean,arrivalKey?:string)=>{
          if(!drawing || !deskImage || !station)return false
          const key=JSON.stringify([employee.id,skin??'',station.id,space.layout.theme,drawing.sha256])
          if(working){workingKeys.add(key);if(!workingStarted.current.has(key))workingStarted.current.set(key,clock.current)}
          const frame=officeDeskFrame(drawing,employee.id,clock.current-(workingStarted.current.get(key)??clock.current),working&&active&&!current.reduceMotion,employee.ambientDesk===true)
          rows.push({employee,image:deskImage,desk:drawing,frame,sourceOrigin:[frame*drawing.cell[0],drawing.bank*drawing.cell[1]],
            size:drawing.cell,origin:drawing.origin,scale:drawing.scale,station,depthY:station.seat[1],roaming:false,manual:false,
            animated:working, ...(arrivalKey?{arrivalKey,arrivalPaint:'binding' as const}:{})})
          return true
        }
        if (legacyLayout) {
          // Exact accepted R23 static composition. This confirms a complete
          // painted pose, without inferring a walk or inventing a floor graph.
          if (command?.type === 'complete-task' && !commandEvents.current.has(`${command.commandId}:animation-finished`)) {
            const catalog = getEmployeeCatalogWithSkin(employee.id, skin)
            if (!catalog) continue
            if (!commandStarted.current.has(command.commandId)) commandStarted.current.set(command.commandId, clock.current)
            const position = station?.approach ?? space.layout.navigation.entry
            const pose = reportPaint(catalog, images.current, position, (station?.height ?? 240) * .48, clock.current - commandStarted.current.get(command.commandId)!, !!current.reduceMotion)
            if (pose) rows.push({ employee, ...pose, station, depthY: station?.seat[1] ?? position[1], roaming: !station, manual: true, animated: true })
            continue
          }
          const action = resolveOfficeManualAction(employee.id, manualRef.current[employee.id], skin)
          const dragged = gesture.current?.id === employee.id && gesture.current.dragging
          if(!action && !dragged && paintDesk((employee.sceneActivity==='working'||employee.ambientDesk===true)&&command?.type!=='stop-task'))continue
          if (action || dragged || !binding) {
            const catalog = getEmployeeCatalogWithSkin(employee.id, skin), assetId = action?.asset ?? catalog?.walk.down
            if (!assetId) continue
            const record = getOfficeAsset(assetId), strip = record.frameStrip, image = images.current.get(resolveOfficeAssetUrl(assetId))
            if (!strip || !image) continue
            const profile = getEmployeeSkinWalkProfile(employee.id, action?.direction ?? 'down', skin)
            const scale = (station?.height ?? 240) * .48 / (profile?.coreHeightPx ?? strip.frameHeight * .88)
            const anchor = profile?.anchor ?? strip.anchor, position = dragged ? gesture.current!.latest : station?.approach ?? space.layout.navigation.entry
            const order = strip.frameOrder ?? Array.from({ length: strip.frameCount }, (_, i) => i), durations = strip.frameDurationsMs ?? order.map(() => 1000 / strip.fps)
            const manualElapsed = action ? manualElapsedFor(employee, action) : 0
            const exposure = !action || action.id === 'stand-front' || action.mode === 'hold' || !active || current.reduceMotion ? action?.holdFrame ?? order.at(-1)! : physicalFrame(manualElapsed, durations, order, action.mode === 'loop')
            const animated = !!action && action.id !== 'stand-front' && action.mode !== 'hold' && strip.frameCount > 1 && (action.mode === 'loop' || manualElapsed < durations.reduce((sum, value) => sum + value, 0))
            const rect = officeFrameRect(strip, exposure)
            const gait = action && action.id !== 'stand-front' && action.mode !== 'hold' && active && !current.reduceMotion
              ? walkPaint(assetId, strip, manualElapsed, action.mode === 'loop') : stillWalkPaint(assetId,strip)
            rows.push({ employee, image, gait, frame: exposure, sourceOrigin: [rect[0], rect[1]], size: [strip.frameWidth, strip.frameHeight], origin: [position[0] - anchor.x * strip.frameWidth * scale, position[1] - anchor.y * strip.frameHeight * scale], scale, foot:position, bodyHeight:(station?.height ?? 240)*.48, station: dragged ? undefined : station, depthY: dragged ? space.layout.size[1]+1 : station?.seat[1] ?? position[1], roaming: !!dragged || !station, manual: true, still: !action || action.id==='stand-front', animated })
          } else {
            const image = images.current.get(binding.browserSrc); if (!image) continue
            const working = employee.sceneActivity === 'working' && command?.type !== 'stop-task'
            const workingKey = JSON.stringify([employee.id, skin ?? '', employee.workstationId ?? '', space.layout.theme, binding.sourceSha256])
            if (working) { workingKeys.add(workingKey); if (!workingStarted.current.has(workingKey)) workingStarted.current.set(workingKey, clock.current) }
            const exposure = working && active && !current.reduceMotion ? deskFrame(binding, employee, clock.current - workingStarted.current.get(workingKey)!) : binding.restFrame
            const chair = independentChairForBinding(binding, { officeTheme: space.layout.theme, phase: policy.phase, backgroundSha256: phase.sha256, size: space.layout.size })
            const behindMonitor = space.layout.theme === 'office.jingyuniang.v1' && station?.id === 'reception'
          rows.push({ employee, image, bodyLayer:seatedBodyLayer(image,images.current.get(seatMatte(binding)?.path??'')), frame: exposure, sourceOrigin: [exposure * binding.frameSize[0], 0], size: binding.frameSize, ...registeredDeskOrigin(binding, exposure, binding.origin, binding.uniformScale), scale: binding.uniformScale, station, depthY: station?.seat[1] ?? binding.origin[1], roaming: !station, manual: false, chair, sourceForegroundPolygons: behindMonitor ? undefined : binding.sourceForegroundPolygons, sourceForegroundOccluderPolygons: binding.sourceForegroundOccluderPolygons, animated: binding.frameCount > 1 && working })
          }
          continue
        }
        const arrivalKey = JSON.stringify([space.layout.theme, employee.id])
        const catalog = getEmployeeCatalogWithSkin(employee.id, skin)
        let arrival = arrivals.current.get(arrivalKey)
        if (!arrival) {
          const restoredStationId = command?.type !== 'start-task' && (employee.sceneActivity !== 'working' || current.reduceMotion) && (deskImage || binding) ? station?.id : undefined
          const spawnNode = (floorGraph as BrowserIndependentFloorGraph | undefined)?.spawnNodes?.[employeeIndex % 8]
          const entry = floorGraph?.nodes[restoredStationId ? floorGraph.targets[restoredStationId]?.approachNode ?? floorGraph.entryNode : spawnNode ?? floorGraph.entryNode]
          // A no-command restored whole pose stays seated. A newly introduced task starts on this room's entry.
          arrival = createIndependentArrivalState(entry?.point ?? (restoredStationId ? station!.approach : space.layout.navigation.entry), entry?.bodyCoreHeightPx ?? (station?.height ?? 260) * .48, restoredStationId)
        }
        const dragged = gesture.current?.id === employee.id && gesture.current.dragging
        if (dragged) arrival = interruptIndependentTaskArrival(arrival, gesture.current!.latest)
        const requestedAction = resolveOfficeManualAction(employee.id, manualRef.current[employee.id], skin)
        const projectedWork = !command && employee.sceneActivity === 'working' && station !== undefined
        const ownsTask = projectedWork || command?.type==='start-task'||!!command&&command.commandId!==arrival.lastCommandId||['approaching','seat-pending','leaving','report'].includes(arrival.mode)
        if(requestedAction&&!ownsTask){
          const exit=arrival.seatedStationId&&floorGraph?.targets[arrival.seatedStationId]
          const position=exit?floorGraph!.nodes[exit.exitNode]!.point:arrival.position
          arrival=interruptIndependentTaskArrival(arrival,position)
        }
        const motionAvailable = !!catalog && Object.entries(catalog.walk).every(([direction, id]) => {
          const record = getOfficeAsset(id)
          return !!record.frameStrip && images.current.has(resolveOfficeAssetUrl(id))
            && !!getIndependentOfficeWalkBodyProfile(employee.id, direction as 'left' | 'right' | 'up' | 'down', id, skin)
        })
        if (floorGraph && projectedWork && station && !dragged) {
          arrival = approachProjectedWorkstation(arrival, floorGraph, station.id)
        } else if (floorGraph) {
          const autonomy = advanceIndependentAmbient(ambientStates.current.get(arrivalKey) ?? initialIndependentAmbient(employee.id,clock.current,arrival.mode === 'seated',policy), arrival, {
            employeeId:employee.id, graph:floorGraph, now:clock.current, policy, ambientDesk: employee.ambientDesk === true,
            ...(employee.workstationId ? {boundStationId:employee.workstationId}:{}), ...(command?{command}:{}),
            active:active&&!dragged, reduceMotion:!!current.reduceMotion, manual:!!manualRef.current[employee.id],
            otherFootpoints:visibleArrivals().filter(([key])=>key!==arrivalKey).map(([,value])=>value.position),
            occupiedTargets:visibleArrivals().filter(([key])=>key!==arrivalKey).map(([,value])=>value.route.at(-1)?.point??value.position),
          })
          ambientStates.current.set(arrivalKey,autonomy.ambient); arrival=autonomy.actor
        }
        const peers = visibleArrivals().filter(([key])=>key!==arrivalKey).map(([key,actor])=>({id:JSON.parse(key)[1] as string,actor}))
        const allowed = independentTrafficMayAdvance(employee.id,arrival,peers)
        const transition = advanceIndependentTaskArrival(arrival, { ...(floorGraph ? { graph: floorGraph } : {}), ...(graphError ? { graphError } : {}), ...(!dragged && command ? { command } : {}), bindingAvailable: !!deskImage || !!binding && images.current.has(binding.browserSrc), motionAvailable, deltaMs:allowed?deltaMs:0, active: active && !dragged, reduceMotion: !!current.reduceMotion,
          speedFactorForDirection:direction=>{const strip=catalog&&getOfficeAsset(catalog.walk[direction]).frameStrip;return strip?.frameCount? .75*1000/createOfficeFrameTimeline(strip).cycleMs*(command?.type==='start-task'?1.3:1):1.25},
        })
        arrival = transition.state; arrivals.current.set(arrivalKey, arrival); arrivalEvents.push(...transition.events)
        const controlled = !!floorGraph || arrival.owned || !!command || arrival.mode === 'approaching' || arrival.mode === 'leaving'
        const action = ownsTask ? undefined : requestedAction
        if (controlled && !action && arrival.mode === 'report') {
          if (!catalog) continue
          const pose = reportPaint(catalog, images.current, arrival.position, arrival.bodyCoreHeightPx, arrival.reportElapsedMs, !!current.reduceMotion)
          if (pose) rows.push({ employee, ...pose, station: undefined, depthY: arrival.position[1], roaming: true, manual: true, animated: true, arrivalKey, ...(pose.reportComplete ? { arrivalPaint: 'report-finished' as const } : {}) })
          continue
        }
        if (controlled && !action && ((arrival.mode !== 'seated' && arrival.mode !== 'seat-pending') || arrival.seatedStationId !== station?.id)) {
          if (!catalog) continue
          const direction = arrival.direction, walkId = catalog.walk[direction], walk = getOfficeAsset(walkId).frameStrip
          const profile = getIndependentOfficeWalkBodyProfile(employee.id, direction, walkId, skin)
          const moving = !arrival.failure && allowed && (arrival.mode === 'approaching' || arrival.mode === 'leaving' || arrival.mode === 'roaming' || arrival.mode === 'returning')
          if (!walk) continue
          const gaitTime = (arrival.walkPhase ?? 0) * createOfficeFrameTimeline(walk).cycleMs
          const selection = independentArrivalFrame(catalog, direction, moving, gaitTime, walk), id = selection.asset
          const record = getOfficeAsset(id), strip = record.frameStrip, image = images.current.get(resolveOfficeAssetUrl(id))
          if (!walk || !profile || !strip || !image) continue
          // Independent whole neutrals use the catalog's explicit rest choice, never an assumed final walk cell.
          const rest = selection.explicitRest?catalog.walkRest?.[direction]:undefined
          const ownProfile = rest?.coreHeightPx!==undefined?{coreHeightPx:rest.coreHeightPx,anchor:rest.anchor??profile.anchor}:profile
          if(!Number.isFinite(ownProfile.coreHeightPx)||ownProfile.coreHeightPx<=0||ownProfile.coreHeightPx>strip.frameHeight)throw Error('同向站姿的身体标定不匹配。')
          const measured = floorSpriteProfile(record.sha256, strip.frameHeight, ownProfile)
          const scale = arrival.bodyCoreHeightPx / measured.coreHeightPx * selection.scale
          const exposure = selection.frame
          const rect = officeFrameRect(strip, exposure)
          const gait = moving && !current.reduceMotion ? walkPaint(walkId, walk, gaitTime) : stillWalkPaint(id,strip)
          const position = floorGraph?independentFloorLanePosition(arrival,floorGraph,{id:employee.id,peers}):arrival.position
          rows.push({ employee, image, gait, frame: exposure, sourceOrigin: [rect[0], rect[1]], size: [strip.frameWidth, strip.frameHeight], origin: [position[0] - measured.anchor.x * strip.frameWidth * scale, position[1] - measured.anchor.y * strip.frameHeight * scale - selection.liftPercent / 100 * strip.frameHeight * scale], scale, station: undefined, depthY: dragged ? space.layout.size[1]+1 : position[1], foot: position, bodyHeight:arrival.bodyCoreHeightPx, roaming: true, manual: true, still: !moving, animated: moving, arrivalKey, arrivalPaint: 'floor' })
          continue
        }
        if(!action&&!dragged&&paintDesk(!arrival.failure&&(employee.sceneActivity==='working'||employee.ambientDesk===true)&&command?.type!=='stop-task',controlled?arrivalKey:undefined))continue
        if (action || dragged || !binding) {
          const catalog = getEmployeeCatalogWithSkin(employee.id, skin)
          const assetId = action?.asset ?? catalog?.walk.down
          if (!assetId) continue
          const record = getOfficeAsset(assetId), strip = record.frameStrip, image = images.current.get(resolveOfficeAssetUrl(assetId))
          if (!strip || !image) continue
          const profile = getIndependentOfficeWalkBodyProfile(employee.id, action?.direction ?? 'down', assetId, skin)
          if (!profile) continue
          const measured = floorSpriteProfile(record.sha256, strip.frameHeight, profile)
          const scale = standingFigureHeight(dragged ? gesture.current!.latest[1] : arrival.position[1]) / measured.coreHeightPx
          const anchor = measured.anchor, position = dragged ? gesture.current!.latest : controlled ? arrival.position : station?.approach ?? space.layout.navigation.entry
          const order = strip.frameOrder ?? Array.from({ length: strip.frameCount }, (_, i) => i), durations = strip.frameDurationsMs ?? order.map(() => 1000 / strip.fps)
          const manualElapsed = action ? manualElapsedFor(employee, action) : 0
          const exposure = !action || action.id === 'stand-front' || action.mode === 'hold' || !active || current.reduceMotion ? action?.holdFrame ?? order.at(-1)! : physicalFrame(manualElapsed, durations, order, action.mode === 'loop')
          const animated = !!action && action.id !== 'stand-front' && action.mode !== 'hold' && strip.frameCount > 1 && (action.mode === 'loop' || manualElapsed < durations.reduce((sum, value) => sum + value, 0))
          const rect = officeFrameRect(strip, exposure)
          const gait = action && action.id !== 'stand-front' && action.mode !== 'hold' && active && !current.reduceMotion
            ? walkPaint(assetId, strip, manualElapsed, action.mode === 'loop') : stillWalkPaint(assetId,strip)
          rows.push({ employee, image, gait, frame: exposure, sourceOrigin: [rect[0], rect[1]], size: [strip.frameWidth, strip.frameHeight], origin: [position[0] - anchor.x * strip.frameWidth * scale, position[1] - anchor.y * strip.frameHeight * scale], scale, foot:position, bodyHeight:scale*measured.coreHeightPx, station: controlled ? undefined : station, depthY: independentSceneActorDepth(controlled ? undefined : station, position, !!dragged), roaming: controlled || !!dragged || !station, manual: true, still: !action || action.id==='stand-front', animated, ...(controlled ? { arrivalKey } : {}) })
        } else {
          const image = images.current.get(binding.browserSrc); if (!image) continue
          const working = !arrival.failure && (employee.sceneActivity === 'working' || employee.ambientDesk === true) && command?.type !== 'stop-task'
          const workingKey = JSON.stringify([employee.id, skin ?? '', employee.workstationId ?? '', space.layout.theme, binding.sourceSha256])
          if (working) { workingKeys.add(workingKey); if (!workingStarted.current.has(workingKey)) workingStarted.current.set(workingKey, clock.current) }
          const exposure = working && active && !current.reduceMotion ? deskFrame(binding, employee, clock.current - workingStarted.current.get(workingKey)!) : binding.restFrame
          const chair = independentChairForBinding(binding, { officeTheme: space.layout.theme, phase: policy.phase, backgroundSha256: phase.sha256, size: space.layout.size })
          const pose = station ? fittedDeskPose(binding, station, space.layout.theme) : { origin: binding.origin, scale: binding.uniformScale }
          const behindMonitor = space.layout.theme === 'office.jingyuniang.v1' && station?.id === 'reception'
          rows.push({ employee, image, bodyLayer:seatedBodyLayer(image,images.current.get(seatMatte(binding)?.path??'')), frame: exposure, sourceOrigin: [exposure * binding.frameSize[0], 0], size: binding.frameSize, ...registeredDeskOrigin(binding, exposure, pose.origin, pose.scale), scale: pose.scale, station, depthY: independentSceneActorDepth(station, binding.origin), roaming: !station, manual: false, chair, ...(controlled ? { arrivalKey, arrivalPaint: 'binding' as const } : {}), sourceForegroundPolygons: behindMonitor ? undefined : binding.sourceForegroundPolygons, sourceForegroundOccluderPolygons: binding.sourceForegroundOccluderPolygons, animated: binding.frameCount > 1 && working })
        }
      }
      for (const key of workingStarted.current.keys()) if (!workingKeys.has(key)) workingStarted.current.delete(key)
      for (const key of manualStarted.current.keys()) if (!manualKeys.has(key)) manualStarted.current.delete(key)
      for (const [key,drop] of landed.current) if(current.reduceMotion || clock.current-drop.start>=LANDING_MS) landed.current.delete(key)
      const idleKeys = new Set<string>()
      const looks=new Map<string,{eyes:number;bitmap:ImageBitmap|undefined;art:ActorLookAtlas}>()
      for (const row of rows) {
        if (!row.foot || !row.bodyHeight) {look.cancel(row.employee.id);continue}
        const hold = gesture.current?.id === row.employee.id && gesture.current.dragging ? gesture.current : undefined
        const landing = landed.current.get(JSON.stringify([space.layout.theme, row.employee.id]))
        const motion = hold ? 'held' : landing !== undefined && row.roaming ? 'landing' : row.still ? 'idle' : undefined
        if (!motion) {look.cancel(row.employee.id);continue}
        row.motion = motion
        const atlas = getActorPoseAtlas(row.employee.id, current.employeeSkins?.[row.employee.id])
        const bitmap = atlas && floorBitmap(atlas)
        if (!atlas || !bitmap) continue
        const idleKey=JSON.stringify([space.layout.theme,row.employee.id,atlas.src])
        if(motion==='idle'){
          idleKeys.add(idleKey)
          if(current.reduceMotion || !idleStarted.current.has(idleKey))idleStarted.current.set(idleKey,clock.current)
        }
        const elapsed = clock.current - (hold?.liftedAt ?? landing?.start ?? idleStarted.current.get(idleKey) ?? clock.current)
        if (hold) hold.lag = sampleGripLag(hold.lag,row.foot[0],row.foot[1],clock.current,row.bodyHeight)
        const extras=motion==='idle' && !current.reduceMotion && active
          ? getActorGestureAtlas(row.employee.id,current.employeeSkins?.[row.employee.id]) : undefined
        const extraBitmap=extras && floorBitmap(extras)
        const lookArt=look.has(row.employee.id) && getActorLookAtlas(row.employee.id,current.employeeSkins?.[row.employee.id])
        const headBitmap=lookArt && floorBitmap(lookArt)
        let headFrame:number|undefined
        if(lookArt && headBitmap && active && !current.reduceMotion && motion==='idle'){
          const box=canvas.current!.getBoundingClientRect(), scale=row.bodyHeight/lookArt.figureHeight
          const sx=box.width/space.layout.size[0], sy=box.height/space.layout.size[1]
          const x=box.left+(row.foot[0]+(lookArt.eyeCenter[0]-lookArt.foot[0])*scale)*sx
          const y=box.top+(row.foot[1]+(lookArt.eyeCenter[1]-lookArt.foot[1])*scale)*sy
          const gaze=look.sample(row.employee.id,now,x,y,row.bodyHeight*sy)
          if(gaze){
            headFrame=gaze.head
            const eyes=floorBitmap({src:lookArt.eyesSrc,sha256:lookArt.eyesSha256})
            looks.set(row.employee.id,{eyes:eyes?gaze.eyes:gaze.head,art:lookArt,bitmap:eyes})
            idleStarted.current.set(idleKey,clock.current)
          }
        }
        const sequence=gestureSequenceFor(gestureSequences.current,idleKey)
        const exposure=headFrame!==undefined ? {frame:headFrame,gesture:undefined} : sequence.sample(motion,elapsed,motionPhase(row.employee.id),hold?.lag,
          !active || !!current.reduceMotion,atlas.idleDurationsMs,extraBitmap ? extras?.actions : undefined,landing?.pose)
        const art=headFrame!==undefined && lookArt ? lookArt : exposure.gesture && extras ? extras : atlas
        if(hold) hold.pose=exposure.frame
        if(exposure.gesture)row.gesture=exposure.gesture
        row.frame = exposure.frame
        row.image = headFrame!==undefined && headBitmap ? headBitmap : exposure.gesture && extraBitmap ? extraBitmap : bitmap
        row.gait = undefined
        row.scale = row.bodyHeight / art.figureHeight
        row.size = [art.cell[0], art.cell[1]]
        row.sourceOrigin = [(row.frame % art.columns) * row.size[0], Math.floor(row.frame / art.columns) * row.size[1]]
        row.origin = [row.foot[0] - art.foot[0] * row.scale, row.foot[1] - art.foot[1] * row.scale]
      }
      for (const key of idleStarted.current.keys()) if (!idleKeys.has(key)) {
        idleStarted.current.delete(key)
        gestureSequences.current.get(key)?.interrupt()
      }
      rows.sort((a, b) => a.depthY - b.depthY)
      const occluders = sceneOccluders.current, drawn: Paint[] = []
      const actorLight = policy.phase === 'closed' || policy.phase === 'night'
        ? 'brightness(.84) saturate(.94) contrast(1.015)' : policy.phase === 'dusk'
          ? 'brightness(.9) saturate(1.015) sepia(.065)' : 'saturate(1.025)'
      const drawActor = (row: Paint) => {
        if (!row.manual || row.arrivalKey || row.motion) {
          context.save()
          try {
            const actor = row.arrivalKey && arrivals.current.get(row.arrivalKey)
            if (actor && row.roaming && typeof context.ellipse === 'function') {
              context.fillStyle = 'rgba(36,31,49,.16)'
              context.beginPath()
              const foot = row.foot ?? actor.position
              context.ellipse(foot[0], foot[1], actor.bodyCoreHeightPx * .15, actor.bodyCoreHeightPx * .032, 0, 0, Math.PI * 2)
              context.fill()
            }
            context.filter = actorLight
            // Whole illustrated poses need area filtering when reduced to office size.
            context.imageSmoothingEnabled = true
            context.imageSmoothingQuality = 'high'
            const patch=looks.get(row.employee.id)
            if(patch?.bitmap && patch.eyes!==row.frame){
              const layer=lookComposite.current??(lookComposite.current={canvas:document.createElement('canvas'),src:'',head:-1,eye:-1})
              const [w,h]=patch.art.cell
              if(layer.src!==patch.art.src || layer.head!==row.frame || layer.eye!==patch.eyes){
                if(layer.canvas.width!==w || layer.canvas.height!==h){layer.canvas.width=w;layer.canvas.height=h}
                const nativeSize=layer.canvas.getContext('2d')
                if(nativeSize){
                  drawActorLook(nativeSize,patch.art,row.image,row.frame,patch.bitmap,patch.eyes)
                  layer.src=patch.art.src;layer.head=row.frame;layer.eye=patch.eyes
                }
              }
              if(layer.src===patch.art.src && layer.head===row.frame && layer.eye===patch.eyes)
                context.drawImage(layer.canvas,...row.origin,w*row.scale,h*row.scale)
              else context.drawImage(row.image,...row.sourceOrigin,...row.size,...row.origin,w*row.scale,h*row.scale)
            }else if (row.desk) drawOfficeDeskFrame(context, row.image, row.desk, row.frame, row.origin[0], row.origin[1], row.scale)
            else if (row.gait) drawWalkAtlas(context, row.gait.bitmap, row.gait.atlas, row.gait.rect, row.origin[0], row.origin[1], row.scale)
            else context.drawImage(row.bodyLayer??row.image, ...row.sourceOrigin, ...row.size, ...row.origin, row.size[0] * row.scale, row.size[1] * row.scale)
          } finally { context.restore() }
        } else context.drawImage(row.bodyLayer??row.image, ...row.sourceOrigin, ...row.size, ...row.origin, row.size[0] * row.scale, row.size[1] * row.scale)
        if (row.reportNote) drawReportNote(context, row.reportNote)
        drawn.push(row)
      }
      const litScreenArt = space.phases.noon && images.current.get(space.phases.noon.src)
      const sleepingScreenArt = space.phases.closed && images.current.get(space.phases.closed.src)
      const drawStation = (slot: Slot) => {
        const occupants = rows.filter(value => value.station?.id === slot.id && (!occluders.length || !value.roaming)), joint = occupants.filter(value => value.chair)
        if (joint.length > 1) throw Error('同一工位不能同时显示两套人物与椅子组合。')
        const chair = joint[0]?.chair
        if (chair) {
          const plate = images.current.get(chair.cleanPlate.browserSrc)
          if (!plate) throw Error('完整坐姿椅子的场景清底尚不可用。')
          paintIndependentChairUnderlay(context, plate, chair)
        }
        const panel = OFFICE_MONITOR_PANELS[space.layout.theme]?.[slot.id]
        const screenInUse = panel && occupants.some(row => !row.roaming && (row.employee.sceneActivity === 'working' || policy.monitors?.boundWorkstationsOn))
        const screenArt = screenInUse ? litScreenArt : sleepingScreenArt
        if (panel && screenArt && screenArt !== background) {
          context.save()
          context.beginPath()
          panel.forEach(([x, y], i) => i ? context.lineTo(x, y) : context.moveTo(x, y))
          context.closePath(); context.clip()
          context.globalAlpha = screenInUse ? .88 : .96
          context.drawImage(screenArt, 0, 0)
          context.restore()
        }
        for (const row of occupants) drawActor(row)
        const shell=occupants.some(row=>row.desk)?officeDeskShell(space.layout.theme,slot.id):undefined
        for (const polygon of shell ?? chair?.foregroundPolygons ?? slot.foregroundPolygons) {
          context.save(); context.beginPath(); polygon.forEach((point, index) => index ? context.lineTo(...point) : context.moveTo(...point)); context.closePath(); context.clip(); context.drawImage(background, 0, 0); context.restore()
        }
        if (!shell && !chair && slot.furnitureDetail) {
          const surface = images.current.get(slot.furnitureDetail.browserSrc)
          if (!surface) throw Error('椅子表面资源暂不可用，已保留原场景。')
          paintIndependentFurnitureDetail(context, surface, slot, policy.phase)
        }
        // A source-authored near hair/dress region can lie in front of its own
        // opaque furniture. Repaint the exact same complete frame only at that
        // depth intersection; never replace pixels, limbs or the source alpha.
        for (const row of occupants) {
          if (row.desk || row.manual || row.chair || !row.sourceForegroundPolygons?.length) continue
          context.save()
          try {
            context.beginPath()
            for (const polygon of slot.foregroundPolygons) {
              polygon.forEach((point, index) => index ? context.lineTo(...point) : context.moveTo(...point)); context.closePath()
            }
            context.clip()
            if (row.sourceForegroundOccluderPolygons !== undefined) {
              context.beginPath()
              for (const polygon of row.sourceForegroundOccluderPolygons) {
                // Each selector is a union, including overlaps of opposite input winding.
                const points = polygonArea(polygon) < 0 ? [...polygon].reverse() : polygon
                points.forEach((point, index) => index ? context.lineTo(...point) : context.moveTo(...point)); context.closePath()
              }
              context.clip()
            }
            context.beginPath()
            for (const polygon of row.sourceForegroundPolygons) {
              polygon.forEach((point, index) => {
                const origin = row.maskOrigin ?? row.origin
                const x = origin[0] + point[0] * row.scale, y = origin[1] + point[1] * row.scale
                if (index) context.lineTo(x, y); else context.moveTo(x, y)
              }); context.closePath()
            }
            context.clip()
            context.filter = actorLight
            context.imageSmoothingEnabled = true; context.imageSmoothingQuality = 'high'
            context.drawImage(row.bodyLayer??row.image, ...row.sourceOrigin, ...row.size, ...row.origin, row.size[0] * row.scale, row.size[1] * row.scale)
          } finally { context.restore() }
        }
      }
      if (occluders.length || rows.some(row => row.arrivalKey && row.roaming)) {
        for (const layer of independentSceneDepthLayers(space.layout.stations, rows.filter(row => row.roaming), occluders)) {
          if (layer.kind === 'occluder') paintIndependentSceneOccluder(context, background, layer.occluder)
          else if (layer.kind === 'actor') drawActor(layer.actor)
          else drawStation(layer.slot)
        }
      } else {
        // Keep legacy station/hair passes and the final unbound pass in their exact order.
        for (const slot of [...space.layout.stations].sort((a, b) => a.seat[1] - b.seat[1])) drawStation(slot)
        for (const row of rows.filter(value => !value.station)) drawActor(row)
      }
      const held = gesture.current
      if (held?.dragging && held.moved && current.employeeDestination === 'contact') {
        context.save()
        const cursor:Point=[held.start[0]+held.latest[0]-held.origin[0],held.start[1]+held.latest[1]-held.origin[1]]
        const candidate=deskDropTarget(space.layout.stations,cursor)
        for (const station of space.layout.stations) {
          const selected=station===candidate
          context.beginPath()
          station.dropPolygon.forEach((p,i)=>i?context.lineTo(...p):context.moveTo(...p))
          context.closePath()
          context.fillStyle=selected?'rgba(87,194,255,.32)':'rgba(116,180,235,.06)'
          context.strokeStyle=selected?'#e7faff':'rgba(222,243,255,.6)'
          context.lineWidth=selected?3:1.2
          context.fill();context.stroke()
        }
        context.restore()
      }
      painted.current = occluders.length || rows.some(row => row.arrivalKey && row.roaming) ? drawn : rows
      lastCompletePaint.current = composition
      if(canvas.current) canvas.current.dataset.officeActors = JSON.stringify(painted.current.map(row=>{
        const actor=row.arrivalKey?arrivals.current.get(row.arrivalKey):undefined
        return {id:row.employee.id,mode:actor?.mode??(row.roaming?'floor':'seated'),position:actor?.position??row.origin,direction:actor?.direction,frame:row.frame,motion:row.motion,idleGesture:row.gesture,lookEyes:looks.get(row.employee.id)?.eyes,moving:row.roaming&&!!row.animated,station:row.station?.id,activity:row.station && row.employee.ambientDesk ? 'desk-practice' : row.employee.sceneActivity,source:row.image.width,deskView:row.desk?.facing,deskSource:row.desk?.src}
      }))
      paintedSceneOccluders.current = occluders
      // No arrival event is inferred from a timer or a selected binding: confirm its actual complete paint.
      const ownsPaint = () => loadedResourceGeneration.current === resourceGeneration && requiredResourceGeneration.current === resourceGeneration
        && live.current.presentationActive !== false && !document.hidden
      if (active) {
        if (legacyLayout) for (const command of current.commands ?? []) {
          const row = drawn.find(value => value.employee.id === command.employeeId && value.station?.id === command.workstationId)
          if (!row || (command.type === 'start-task' && row.manual)) continue
          if (!commandStarted.current.has(command.commandId)) commandStarted.current.set(command.commandId, clock.current)
          const elapsed = clock.current - commandStarted.current.get(command.commandId)!
          const completionPainted = command.type === 'stop-task' ? !row.manual && (current.reduceMotion || elapsed > 0) : row.reportComplete
          const types = command.type === 'start-task' ? ['command-accepted', 'workstation-arrived', 'work-animation-ready'] as const : completionPainted ? ['command-accepted', 'animation-finished'] as const : ['command-accepted'] as const
          for (const type of types) {
            if (!ownsPaint() || !live.current.commands?.some(value => value.commandId === command.commandId && value.taskId === command.taskId && value.employeeId === command.employeeId && value.workstationId === command.workstationId && value.type === command.type)) return
            const key = `${command.commandId}:${type}`; if (commandEvents.current.has(key)) continue
            commandEvents.current.add(key); current.onSceneEvent?.(createSceneEvent({ ...command, type }))
            if (!ownsPaint()) return
          }
        }
        for (const row of drawn) if (row.arrivalKey && row.arrivalPaint) {
          const value = arrivals.current.get(row.arrivalKey)
          if (value) { const result = markIndependentArrivalPainted(value, row.arrivalPaint); arrivals.current.set(row.arrivalKey, result.state); arrivalEvents.push(...result.events) }
        }
        for (const event of arrivalEvents) {
          const key = `${event.command.commandId}:${event.type}`
          if (!ownsPaint() || !live.current.commands?.some(value => value.commandId === event.command.commandId && value.taskId === event.command.taskId && value.employeeId === event.command.employeeId && value.workstationId === event.command.workstationId && value.type === event.command.type)) return
          if (!commandEvents.current.has(key)) { commandEvents.current.add(key); current.onSceneEvent?.(createSceneEvent({ ...event.command, type: event.type, ...(event.reason ? { reason: event.reason } : {}) })); if (!ownsPaint()) return }
        }
      }
      const legacyUnfinishedCommand = legacyLayout && (current.commands ?? []).some(command => {
        if (command.type === 'start-task' || commandEvents.current.has(`${command.commandId}:animation-finished`)) return false
        const row = drawn.find(value => value.employee.id === command.employeeId && value.station?.id === command.workstationId)
        return !!row && (command.type === 'stop-task' ? !row.manual : row.reportComplete !== undefined)
      })
      const unfinishedCommand = legacyUnfinishedCommand || rows.some(row => !!row.arrivalKey && (row.animated || arrivals.current.get(row.arrivalKey)?.mode === 'seat-pending'))
      if (independentNeedsAnimation(active, !!current.reduceMotion, rows.map(row => !!row.animated || !!row.motion), unfinishedCommand)
        || !!floorGraph&&active&&!current.reduceMotion&&policy.charactersPresent&&policy.autonomy.allowRoaming&&current.employees.length>0) requestPaint.current()
      } catch (reason) { restoreOriginal(); setReady(false); setError(reason instanceof Error ? reason.message : String(reason)) }
    }
    requestPaint.current = () => { if (!frame && !document.hidden && live.current.presentationActive !== false) frame = requestAnimationFrame(paint) }
    cancelPaint.current = () => { cancelAnimationFrame(frame); frame = 0 }
    requestPaint.current()
    // Keep the last complete paint until its replacement; resource changes restore above.
    return () => { cancelPaint.current(); cancelPaint.current = () => {}; requestPaint.current = () => {} }
  }, [ready, space, phase, policy.phase, policy.charactersPresent, props.employees, props.employeeSkins, props.commands, props.presentationActive, props.reduceMotion, manual, composition, resourceGeneration])
  useEffect(() => {
    const repaint = () => {
      if (document.hidden || live.current.presentationActive === false) {
        cancelPaint.current()
        idleStarted.current.clear()
        for(const sequence of gestureSequences.current.values())sequence.interrupt()
      } else requestPaint.current()
    }
    document.addEventListener('visibilitychange', repaint)
    return () => { document.removeEventListener('visibilitychange', repaint); images.current.clear(); for (const batch of bitmapBatches.current) batch.release(); bitmapBatches.current.clear() }
  }, [])
  const pointFor = (event: ReactPointerEvent<HTMLCanvasElement>): Point => { const rect = event.currentTarget.getBoundingClientRect(); return [(event.clientX - rect.left) * space!.layout.size[0] / rect.width, (event.clientY - rect.top) * space!.layout.size[1] / rect.height] }
  const hit = (point: Point, assist = false) => {
    const pixel = document.createElement('canvas'); pixel.width = pixel.height = 1
    let context = pixel.getContext('2d', { willReadFrequently: true })
    const rect = canvas.current?.getBoundingClientRect()
    const margin = assist && rect?.width ? 5 * space!.layout.size[0] / rect.width : 0
    let nearest: OfficeSceneEmployee | undefined
    let ambiguous = false
    for (const row of [...painted.current].reverse()) {
      const local: Point = [(point[0] - row.origin[0]) / row.scale, (point[1] - row.origin[1]) / row.scale]
      const pad = margin / row.scale
      if (local[0] < -pad || local[1] < -pad || local[0] >= row.size[0] + pad || local[1] >= row.size[1] + pad) continue
      const shins=row.desk?.hiddenShins
      if(shins && local[0]>=shins[0] && local[0]<shins[1] && local[1]>=shins[2])continue
      if (independentSceneOccluderCovers(paintedSceneOccluders.current, row.depthY, point)) continue
      const depthY = paintedSceneOccluders.current.length || row.arrivalKey ? row.depthY : row.station?.seat[1] ?? 0
      const blockers = space!.layout.stations.filter(slot => slot.seat[1] >= depthY
        && ((painted.current.some(value=>value.station?.id===slot.id&&value.desk)?officeDeskShell(space!.layout.theme,slot.id):undefined) ?? painted.current.find(value => value.station?.id === slot.id && value.chair)?.chair?.foregroundPolygons ?? slot.foregroundPolygons).some(polygon => independentPointInPolygon(point, polygon))
        && (slot.id !== row.station?.id || row.manual || row.chair || !row.sourceForegroundPolygons?.some(polygon => independentPointInPolygon(local, polygon))
          || (row.sourceForegroundOccluderPolygons !== undefined && !row.sourceForegroundOccluderPolygons.some(polygon => independentPointInPolygon(point, polygon)))))
      // A seated employee's own chair can cover the centre of the visible figure.
      // It may select its occupant, but never an employee behind someone else's desk.
      if (blockers.length && (!assist || row.roaming || row.manual || blockers.some(slot => slot.id !== row.station?.id))) continue
      const withinFrame = local[0] >= 0 && local[1] >= 0 && local[0] < row.size[0] && local[1] < row.size[1]
      if (!blockers.length && withinFrame && context) {
        try {
          context.clearRect(0, 0, 1, 1)
          if (row.gait) {
            const {atlas,bitmap,rect} = row.gait, [x,y,w,h] = atlas.bounds
            const u = (local[0]-x!)/w!, v = (local[1]-y!)/h!
            if (u>=0 && v>=0 && u<1 && v<1) context.drawImage(bitmap,
              rect[0]+Math.floor(u*rect[2]),rect[1]+Math.floor(v*rect[3]),1,1,0,0,1,1)
          } else context.drawImage(row.bodyLayer??row.image, row.sourceOrigin[0] + (row.desk?.mirror?row.size[0]-1-Math.floor(local[0]):local[0]), row.sourceOrigin[1] + local[1], 1, 1, 0, 0, 1, 1)
          if (context.getImageData(0, 0, 1, 1).data[3]! > 30) return row.employee
        } catch { context = null }
      }
      if (assist && officeBodyHit(local, row.size, bitmapHashes.get(row.image), pad)) {
        if (nearest && nearest.id !== row.employee.id) ambiguous = true
        else nearest = row.employee
      }
    }
    return ambiguous ? undefined : nearest
  }
  const failed=spaceAdmission.error!==undefined || spaceRead.status==='error' || !!error
  const detail=spaceAdmission.error || error
  const retryNotice=<div className="lumaOfficeLightingUnavailable" role="status">
    <span>{detail && /[\u3400-\u9fff]/u.test(detail) ? detail : '办公室画面暂时未能加载。'}</span>
    <button type="button" onClick={props.retry}>重新加载</button>
  </div>
  if (!space || !phase) return <div className="lumaIndependentOffice lumaIndependentOfficePending" data-office-theme={props.officeTheme}>
    <OfficeScenePreview theme={props.officeTheme} phase={policy.phase} waiting={!failed}/>
    {failed && retryNotice}
  </div>
  const sampleDrag = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const value = gesture.current
    if (!value || value.cancelled || value.pointerId !== event.pointerId) return
    if (!value.dragging) {
      if (Math.hypot(event.clientX - value.startClient[0], event.clientY - value.startClient[1]) <= 8) return
      clearHold(); pendingTap.current = null
      if (props.employeeDestination !== 'contact') { value.cancelled = true; return }
      value.liftedAt=clock.current
      value.dragging = true
      look.cancel(value.id)
    }
    const employee = live.current.employees.find(item => item.id === value.id)
    if (!employee || props.employeeDestination !== 'contact' && (!employee.canDrag || employee.availability === 'working' || employee.sceneActivity === 'working')) { cancelGesture(); return }
    const point = pointFor(event)
    value.latest = [value.origin[0] + point[0] - value.start[0], value.origin[1] + point[1] - value.start[1]]
    value.moved ||= Math.hypot(point[0] - value.start[0], point[1] - value.start[1]) > 5
    if(value.moved && props.employeeDestination==='contact'){
      const workstationId=(deskDropTarget(space.layout.stations,point)?.id ?? null) as OfficeWorkstationId|null
      setSeatPreview(previous=>previous?.employeeId===value.id && previous.workstationId===workstationId?previous:{employeeId:value.id,workstationId})
    }
    requestPaint.current()
  }
  const missingFinalPoses = missingIndependentFinalPoses(spaces, {
    presentationActive: props.presentationActive !== false, officeTheme: space.layout.theme, phase: policy.phase,
    employees: props.employees.filter(employee => !!props.employeeSkins?.[employee.id]).map(employee => ({
      id: employee.id, name: employee.name, visible: policy.charactersPresent || employee.availability === 'working',
      skinId: props.employeeSkins![employee.id]!, state: employee.availability === 'working' ? 'running' : 'idle',
      ...(employee.workstationId === undefined ? {} : { workstationId: employee.workstationId }),
      ...(resolveOfficeManualAction(employee.id, manual[employee.id], props.employeeSkins?.[employee.id]) === undefined ? {} : { manualAction: manual[employee.id] }),
    })),
  })
  return <div className="lumaIndependentOffice" data-office-theme={props.officeTheme} style={{ position: 'relative' }}>
    <canvas ref={canvas} width={space.layout.size[0]} height={space.layout.size[1]} aria-label="主题办公室" style={{ display: 'block', width: '100%', height: 'auto', touchAction: 'none' }}
      onPointerDown={event => {
        if (props.presentationActive === false || event.button !== 0 || event.isPrimary === false) return
        const point = pointFor(event), employee = hit(point, props.employeeDestination === 'workbench' || props.employeeDestination === 'contact')
        if (!employee) return
        const pose = getActorPoseAtlas(employee.id,props.employeeSkins?.[employee.id])
        if (pose) floorBitmap(pose)
        const lookArt=!props.reduceMotion && getActorLookAtlas(employee.id,props.employeeSkins?.[employee.id])
        if(lookArt){floorBitmap(lookArt);floorBitmap({src:lookArt.eyesSrc,sha256:lookArt.eyesSha256})}
        dragRevision.current++
        // A character press belongs to the actor, even in a pannable scene.
        event.stopPropagation()
        clearHold()
        const arrival = arrivals.current.get(JSON.stringify([space.layout.theme, employee.id]))
        const origin = arrival?.position ?? point
        const value: NonNullable<typeof gesture.current> = { id: employee.id, pointerId: event.pointerId, start: point, origin,
          startClient: [event.clientX, event.clientY] as Point, pressedAt: performance.now(), latest: origin, moved: false, dragging: false, cancelled: false,
          arrivalKey: JSON.stringify([space.layout.theme, employee.id]), arrivalBefore: arrival }
        gesture.current = value
        if (props.employeeDestination === 'contact') {
          try { event.currentTarget.setPointerCapture(event.pointerId) } catch { cancelGesture(); return }
        }
        if (props.employeeDestination === 'contact' || employee.canDrag && employee.availability !== 'working' && employee.sceneActivity !== 'working' && !manual[employee.id]) {
          holdTimer.current = setTimeout(() => {
            holdTimer.current = null
            const current = live.current.employees.find(item => item.id === value.id)
            if (gesture.current !== value || value.cancelled || live.current.presentationActive === false || !current || (live.current.employeeDestination !== 'contact' && (!current.canDrag
              || current.availability === 'working' || current.sceneActivity === 'working'))) return
            const captureTarget = canvas.current
            if (!captureTarget?.isConnected) { value.cancelled = true; return }
            try { captureTarget.setPointerCapture(value.pointerId) }
            catch { value.cancelled = true; return }
            value.liftedAt=clock.current; value.dragging = true; look.cancel(value.id);pendingTap.current = null; requestPaint.current()
          }, 500)
        }
      }}
      onPointerMove={sampleDrag}
      onPointerUp={event => {
        sampleDrag(event)
        const value = gesture.current; if (!value || value.pointerId !== event.pointerId) return
        clearHold(); gesture.current = null; setSeatPreview(null)
        if (value?.arrivalBefore && arrivals.current.get(value.arrivalKey)?.lastCommandId === value.arrivalBefore.lastCommandId) arrivals.current.set(value.arrivalKey, value.arrivalBefore)
        requestPaint.current()
        if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
        if (value.cancelled) return
        if (!value.dragging && performance.now() - value.pressedAt < 500) {
          if(props.paperPlanePick){pendingTap.current=null;props.paperPlanePick(value.id,{x:event.clientX,y:event.clientY});return}
          const tap = advanceOfficeActorPortraitTap(pendingTap.current, { employeeId: value.id, at: performance.now(), clientX: event.clientX, clientY: event.clientY }, props.employeeDestination)
          pendingTap.current = tap.pendingTap
          if (tap.activate) props.onCharacterClick?.(value.id)
        } else if (value.moved) {
          const employee = live.current.employees.find(item => item.id === value.id)
          if (!employee || props.employeeDestination !== 'contact' && (!employee.canDrag || employee.availability === 'working' || employee.sceneActivity === 'working')) return
          const desktop = props.onDesktopPet && desktopDropPoint(event)
          if (desktop) { props.onDesktopPet?.(value.id,desktop); return }
          const point = pointFor(event)
          if (point[0]<0 || point[1]<0 || point[0]>space.layout.size[0] || point[1]>space.layout.size[1]) return
          const station = props.employeeDestination === 'contact' ? deskDropTarget(space.layout.stations,point)
            : space.layout.stations.find(slot => independentPointInPolygon(value.latest,slot.dropPolygon))
          if (station && (props.employeeDestination === 'contact' || !props.employees.some(other => other.id !== value.id && other.workstationId === station.id))) {
            const prior=arrivals.current.get(value.arrivalKey), graph=space.layout.navigation.floorGraph as IndependentFloorGraph|undefined
            const approach=graph && graph.nodes[graph.targets[station.id]!.approachNode]
            if(prior && approach){
              arrivals.current.set(value.arrivalKey,{...interruptIndependentTaskArrival(prior,approach.point),bodyCoreHeightPx:approach.bodyCoreHeightPx})
              ambientStates.current.set(value.arrivalKey,{...initialIndependentAmbient(value.id,clock.current),nextAt:clock.current})
            }
            landed.current.set(value.arrivalKey,{start:landingStartForRelease(clock.current,value.liftedAt),pose:value.pose})
            const revision=dragRevision.current
            void seatFeedback.bind(value.id,station.id as OfficeWorkstationId).then(ok=>{
              if(!ok && prior && revision===dragRevision.current && arrivals.current.get(value.arrivalKey)?.lastCommandId===prior.lastCommandId){
                arrivals.current.set(value.arrivalKey,prior)
                requestPaint.current()
              }
            })
          } else if (props.employeeDestination === 'contact' && space.layout.navigation.floorGraph) {
            const graph = space.layout.navigation.floorGraph as IndependentFloorGraph
            const edges=graph.edges.map(([a,b])=>[graph.nodes[a]!.point,graph.nodes[b]!.point] as const)
            const peers=props.employees.filter(row=>row.id!==value.id).flatMap(row=>{
              const other=arrivals.current.get(JSON.stringify([space.layout.theme,row.id]))
              return other && !other.seatedStationId ? [other.position] : []
            })
            const releasedFoot:Point=[value.origin[0]+point[0]-value.start[0],value.origin[1]+point[1]-value.start[1]]
            const position=uncrowdedFloorPoint(releasedFoot,peers,p=>independentDropFloor(graph,p)?.point ?? nearestFloorPoint(p,edges))
            const prior=value.arrivalBefore ?? arrivals.current.get(value.arrivalKey)
            if (prior && position) {
              const relocated=interruptIndependentTaskArrival(prior,position)
              relocated.bodyCoreHeightPx=standingFigureHeight(position[1])
              // Preserve the active work command and walk back to its assigned desk after release.
              if (prior.command?.type === 'start-task') {
                relocated.mode='approaching'; relocated.command=prior.command
                relocated.route=independentFloorRoute(graph,position,graph.targets[prior.command.workstationId]!.approachNode)
              }
              landed.current.set(value.arrivalKey,{start:landingStartForRelease(clock.current,value.liftedAt),pose:value.pose})
              if(!props.reduceMotion && relocated.mode!=='approaching' && event.pointerType==='mouse'){
                const remaining=LANDING_MS+landingStartForRelease(clock.current,value.liftedAt)-clock.current
                look.begin(value.id,event.clientX,event.clientY,performance.now()+remaining)
              }
              arrivals.current.set(value.arrivalKey,relocated)
              const state=initialIndependentAmbient(value.id,clock.current)
              ambientStates.current.set(value.arrivalKey,{...state,nextAt:clock.current+9000})
              setManual(actions=>{ if (!actions[value.id]) return actions; const next={...actions}; delete next[value.id]; return next })
              requestPaint.current()
            }
            seatFeedback.floor(value.id,!!prior && !!position)
          }
        }
      }}
      onPointerCancel={cancelGesture}
      onLostPointerCapture={() => { if (gesture.current) cancelGesture() }}
      onContextMenu={event => { pendingTap.current = null; event.preventDefault(); const rect = event.currentTarget.getBoundingClientRect(), employee = hit([(event.clientX - rect.left) * space.layout.size[0] / rect.width, (event.clientY - rect.top) * space.layout.size[1] / rect.height]); if (employee && employee.availability !== 'working' && employee.sceneActivity !== 'working') setTarget({ employeeId: employee.id, name: employee.name, x: event.clientX, y: event.clientY }) }} />
    {props.employeeDestination === 'contact' && <OfficeScenePreview theme={props.officeTheme} phase={policy.phase} waiting={!failed}/>}
    {props.employeeDestination==='contact' && <OfficeSeatFeedback roster={props.employees} preview={seatPreview} receipt={seatFeedback.receipt}/>}
    <div className="lumaOfficeActorAccessibility" aria-label="办公室角色">
      {props.employees.filter(employee => policy.charactersPresent || employee.availability === 'working').map(employee =>
        <button key={employee.id} type="button" tabIndex={props.presentationActive === false ? -1 : 0}
          onClick={() => {
            if(!props.paperPlanePick){props.onCharacterClick?.(employee.id);return}
            const box=canvas.current?.getBoundingClientRect(), row=painted.current.find(value=>value.employee.id===employee.id)
            if(!box || !row) return
            const center=officeFigureCenter(row.size,bitmapHashes.get(row.image))
            const x=row.origin[0]+center[0]*row.scale, y=row.origin[1]+center[1]*row.scale
            props.paperPlanePick(employee.id,{x:box.left+x*box.width/space.layout.size[0],y:box.top+y*box.height/space.layout.size[1]})
          }}>{officeEmployeeAction(employee.name, props.employeeDestination, employee.canDrag, !!props.paperPlanePick)['aria-label']}</button>)}
    </div>
    <OfficeSkinSelectionNotices active={props.presentationActive !== false} employees={props.employees}
      employeeSkins={props.employeeSkins} missingFinalPoses={missingFinalPoses} />
    {error && retryNotice}
    {props.reports.map(report => <button key={report.reportId} type="button" onClick={() => props.onReportClick?.(report.reportId)}>{report.title}</button>)}
    {target && <OfficeActionMenu target={target} skinId={props.employeeSkins?.[target.employeeId]} onClose={() => setTarget(null)}
      contact={props.employeeDestination==='contact'?{activity:props.employees.find(e=>e.id===target.employeeId)?.activity,open:()=>props.onCharacterClick?.(target.employeeId)}:undefined}
      onRestore={() => { setManual(value => { const next = { ...value }; delete next[target.employeeId]; return next }); setTarget(null) }} onAction={(id, mode) => { const revision = ++manualRevision.current; setManual(value => ({ ...value, [target.employeeId]: { id, mode, revision } })); setTarget(null) }} />}
  </div>
}

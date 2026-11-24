import { officeEmployeeAction } from './office2d/actorPortraitActivation.ts'
import type {
  CSSProperties,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent
} from 'react'
import { useEffect, useRef, useState } from 'react'
import type { OfficeSceneEmployee, OfficeSceneSurfaceProps } from './OfficeSceneSurface.types.ts'
import {
  type SceneCommand
} from './office-harness/SceneProtocol.ts'
import {
  getOfficeAsset,
  officeFrameRect,
  resolveOfficeAssetUrl,
  type OfficeAssetId,
} from './office2d/assets.ts'
import { getBrowserOfficeDefaultSkinId, getEmployeeCatalogWithSkin, getEmployeeSkinPack, getEmployeeTypingProfileWithSkin } from './office2d/employeeSkins.ts'
import { OFFICE_WORKSTATION_KEYBOARD_BOUNDS } from './office2d/workstationProps.ts'
import { createOfficeFrameTimeline } from './office2d/frameTimeline.ts'
import {
  OFFICE_NAV_HEIGHT,
  OFFICE_NAV_WIDTH
} from './office2d/navigation.ts'
import type { OfficeWorkstationId } from './office2d/workstationSeating.ts'
import {
  getOfficeWorkstation
} from './office2d/workstations.ts'
import { seatedFigureScale } from './office2d/officeFigureScale.ts'
import { getWalkAtlas, sampleWalkAtlas, drawWalkAtlas } from './office2d/walkAtlas.ts'
import { sampleDeskRhythm } from './office2d/deskRhythm.ts'
import { compileOfficeEmployeeOcclusionPolygons, compileOfficeEmployeeVisibleClipPath, getWorkstationTypingFrameAnchor } from './officeSceneGeometry.ts'

// Midpoint between the original rear-view hands, in the 512 × 860 typing cell.
const originalBackHands: Readonly<Record<string, readonly [number, number]>> = {
  shan: [256, 446], 'bai-shuangming': [254, 564], 'lu-mi': [256, 387],
  jingyuniang: [250, 548], longmama: [268, 644], claude: [236, 552],
}

export function SpriteStripCanvas({
  assetId,
  className,
  onFrame,
  resolveOcclusionPolygons,
  paused = false,
  playbackRate = 1,
  deskRhythm,
  fixedFrameIndex,
  loopOverride,
  walkElapsedMs,
  alphaMaskUrls,
}: Readonly<{
  assetId: OfficeAssetId
  className: string
  onFrame?: (frameIndex: number) => void
  resolveOcclusionPolygons?: (frameIndex: number) => readonly (readonly (readonly [number, number])[])[]
  paused?: boolean
  playbackRate?: number
  deskRhythm?: { employeeId: string; routine: boolean; restFrame: number }
  fixedFrameIndex?: number | null
  walkElapsedMs?: number
  loopOverride?: boolean
  alphaMaskUrls?: readonly string[]
}>) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const controlsRef = useRef({ assetId, onFrame, resolveOcclusionPolygons, paused, playbackRate, fixedFrameIndex, deskRhythm, walkElapsedMs })
  controlsRef.current = { assetId, onFrame, resolveOcclusionPolygons, paused, playbackRate, fixedFrameIndex, deskRhythm, walkElapsedMs }
  const synchronizeRef = useRef<(() => void) | null>(null)
  const loopPhaseRef = useRef<number | null>(null)
  const asset = getOfficeAsset(assetId)
  const strip = asset.frameStrip
  const alphaMaskKey = (alphaMaskUrls ?? []).join('\0')
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !strip) return
    const loop = loopOverride ?? strip.loop
    const context = canvas.getContext('2d')
    if (!context) return
    const image = new Image()
    const maskImages: HTMLImageElement[] = []
    const maskLoads = (alphaMaskUrls ?? []).map(src => new Promise<void>((resolve, reject) => {
      const mask = new Image(); maskImages.push(mask)
      mask.onload = () => resolve(); mask.onerror = () => reject(new Error('Actor alpha mask unavailable'))
      mask.src = src
      if (mask.complete && mask.naturalWidth > 0) resolve()
    }))
    const masksReady = Promise.all(maskLoads)
    void masksReady.catch(() => {})
    const maskCanvas = document.createElement('canvas')
    maskCanvas.width = strip.frameWidth; maskCanvas.height = strip.frameHeight
    const buffer = document.createElement('canvas')
    buffer.width = strip.frameWidth
    buffer.height = strip.frameHeight
    const bufferContext = buffer.getContext('2d')
    if (!bufferContext) return
    canvas.dataset.spriteReady = 'false'
    canvas.dataset.assetId = assetId
    // Keep the old bitmap and dimensions until the replacement has decoded.
    // displayedAssetId/frameIndex describe the visible frame during that wait.
    const media = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    let timer: number | null = null
    let timerAt = 0
    let decodeTimer: number | null = null
    let disposed = false
    let ready = false
    let failed = false
    let decoding = false
    let playing = false
    let previousRate = 0
    const timeline = createOfficeFrameTimeline(strip)
    const cycleDurationMs = timeline.cycleMs
    // A route can change direction mid-step. Keep the gait phase across atlas
    // swaps so the feet do not jump back to frame zero at every turn.
    let elapsedMs = loopPhaseRef.current === null ? 0 : loopPhaseRef.current * cycleDurationMs
    let lastClock = performance.now()
    const walkAtlas = getWalkAtlas(assetId)
    const walkImage = walkAtlas ? new Image() : undefined
    let paintedGait = -1
    let paintedFrame = -1
    let paintedPolygons = ''
    const clearPlaybackTimer = () => {
      if (timer !== null) window.clearTimeout(timer)
      timer = null
    }
    const fail = () => {
      if (disposed || failed) return
      failed = true
      clearPlaybackTimer()
      if (decodeTimer !== null) window.clearTimeout(decodeTimer)
      decodeTimer = null
      canvas.dataset.spriteReady = 'error'
    }
    const paint = (frameIndex: number) => {
      const occlusionPolygons = controlsRef.current.resolveOcclusionPolygons?.(frameIndex) ?? []
      const signature = JSON.stringify(occlusionPolygons)
      const gaitTime = controlsRef.current.walkElapsedMs
      const gait = walkAtlas && walkImage?.complete && walkImage.naturalWidth && gaitTime !== undefined && !media?.matches
        ? sampleWalkAtlas(walkAtlas, strip, gaitTime) : undefined
      if (paintedFrame === frameIndex && paintedPolygons === signature && paintedGait === (gait?.index ?? -1)) return
      // Compose the entire frame offscreen first. A failed preparation never
      // clears the previously visible complete character.
      bufferContext.clearRect(0, 0, strip.frameWidth, strip.frameHeight)
      if (gait && walkImage && walkAtlas) drawWalkAtlas(bufferContext, walkImage, walkAtlas, gait.rect, 0, 0, 1)
      else bufferContext.drawImage(image, ...officeFrameRect(strip, frameIndex), 0, 0, strip.frameWidth, strip.frameHeight)
      paintedGait = gait?.index ?? -1
      canvas.dataset.gaitFrame = String(paintedGait)
      if (occlusionPolygons.length > 0) {
        bufferContext.save()
        bufferContext.globalCompositeOperation = 'destination-out'
        bufferContext.fillStyle = '#000'
        occlusionPolygons.forEach(points => {
          const first = points[0]
          if (!first) return
          bufferContext.beginPath()
          bufferContext.moveTo(first[0], first[1])
          points.slice(1).forEach(([x, y]) => { bufferContext.lineTo(x, y) })
          bufferContext.closePath()
          bufferContext.fill()
        })
        bufferContext.restore()
      }
      if (maskImages.length) {
        const masks = maskCanvas.getContext('2d')
        if (!masks) return
        masks.clearRect(0, 0, maskCanvas.width, maskCanvas.height)
        maskImages.forEach(mask => masks.drawImage(mask, 0, 0, maskCanvas.width, maskCanvas.height))
        bufferContext.save(); bufferContext.globalCompositeOperation = 'destination-in'
        bufferContext.drawImage(maskCanvas, 0, 0); bufferContext.restore()
      }
      if (canvas.width !== strip.frameWidth) canvas.width = strip.frameWidth
      if (canvas.height !== strip.frameHeight) canvas.height = strip.frameHeight
      context.save()
      context.globalCompositeOperation = 'copy'
      context.drawImage(buffer, 0, 0)
      context.restore()
      const changed = paintedFrame !== frameIndex
      paintedFrame = frameIndex
      paintedPolygons = signature
      if (changed) controlsRef.current.onFrame?.(frameIndex)
      canvas.dataset.frameIndex = String(frameIndex)
      canvas.dataset.displayedAssetId = assetId
      canvas.dataset.spriteReady = 'true'
    }
    const synchronize = () => {
      if (disposed || failed) return
      // A render can replace the asset before its outgoing effect is cleaned up.
      // Keep that complete bitmap until the new asset decodes its own controls.
      if (controlsRef.current.assetId !== assetId) { clearPlaybackTimer(); return }
      const now = performance.now()
      if (playing) elapsedMs += Math.max(0, now - lastClock) * previousRate
      lastClock = now
      const controls = controlsRef.current
      const rate = controls.playbackRate
      const fixed = controls.fixedFrameIndex
      const held = controls.paused || media?.matches || document.visibilityState === 'hidden'
      const fixedFrame = fixed != null && Number.isFinite(fixed)
        ? Math.max(0, Math.min(strip.frameCount - 1, Math.trunc(fixed))) : null
      if (fixedFrame !== null) elapsedMs = timeline.starts[Math.max(0, timeline.order.indexOf(fixedFrame))]!
      else if (held) elapsedMs = timeline.starts[timeline.order.length - 1]!
      if (held || fixed != null) loopPhaseRef.current = null
      if (!loop) elapsedMs = Math.min(elapsedMs, cycleDurationMs)
      playing = ready && !held && fixed == null && Number.isFinite(rate) && rate > 0 && timeline.order.length > 1
        && (loop || elapsedMs < cycleDurationMs)
      if (playing && loop) loopPhaseRef.current = (elapsedMs % cycleDurationMs) / cycleDurationMs
      previousRate = Number.isFinite(rate) ? rate : 0
      const rhythm = playing && loop && controls.deskRhythm
        ? sampleDeskRhythm(controls.deskRhythm.employeeId, elapsedMs, cycleDurationMs, controls.deskRhythm.routine) : undefined
      const stripTime = rhythm?.stripElapsedMs ?? elapsedMs
      if (ready) {
        try { paint(fixedFrame ?? (held ? timeline.order[timeline.order.length - 1]! : rhythm?.reading ? controls.deskRhythm!.restFrame : timeline.frameAt(stripTime, loop))) } catch { fail(); return }
      }
      if (!playing) { clearPlaybackTimer(); return }
      const frameDelay = timeline.nextDelayMs(stripTime, loop)
      const delayMs = rhythm && frameDelay !== null
        ? rhythm.reading ? rhythm.untilChangeMs : Math.min(rhythm.untilChangeMs, frameDelay / rhythm.rate)
        : frameDelay
      if (delayMs === null) { clearPlaybackTimer(); return }
      const nextAt = now + delayMs / rate
      if (timer !== null && Math.abs(timerAt - nextAt) < .5) return
      clearPlaybackTimer()
      timerAt = nextAt
      timer = window.setTimeout(() => { timer = null; synchronize() }, Math.max(1, Math.ceil(nextAt - now)))
    }
    synchronizeRef.current = synchronize
    const loaded = () => {
      if (disposed || failed || decoding) return
      decoding = true
      const accept = () => {
        if (disposed || failed) return
        if (decodeTimer !== null) window.clearTimeout(decodeTimer)
        decodeTimer = null
        ready = true
        lastClock = performance.now()
        synchronize()
      }
      try {
        if (typeof image.decode === 'function') void Promise.all([image.decode(), masksReady]).then(accept, fail)
        else if (maskImages.length) void masksReady.then(accept, fail)
        else accept()
      } catch { fail() }
    }
    // Cold-start image preparation can exceed the diagnostic deadline. Keep
    // accepting this asset's load/decode so a seated actor appears without a
    // drag/remount; only an actual image/decode error is terminal.
    decodeTimer = window.setTimeout(() => {
      decodeTimer = null
      if (!disposed && !failed && !ready) canvas.dataset.spriteReady = 'delayed'
    }, 6_000)
    image.addEventListener('load', loaded)
    image.addEventListener('error', fail)
    media?.addEventListener?.('change', synchronize)
    document.addEventListener('visibilitychange', synchronize)
    if (walkAtlas && walkImage) { walkImage.onload = synchronize; walkImage.src = walkAtlas.src }
    image.src = resolveOfficeAssetUrl(assetId)
    if (image.complete && image.naturalWidth > 0) loaded()
    return () => {
      disposed = true
      if (walkImage) walkImage.onload = null
      if (playing && loop) {
        elapsedMs += Math.max(0, performance.now() - lastClock) * previousRate
        loopPhaseRef.current = (elapsedMs % cycleDurationMs) / cycleDurationMs
      }
      clearPlaybackTimer()
      if (decodeTimer !== null) window.clearTimeout(decodeTimer)
      image.removeEventListener('load', loaded)
      image.removeEventListener('error', fail)
      media?.removeEventListener?.('change', synchronize)
      document.removeEventListener('visibilitychange', synchronize)
      if (synchronizeRef.current === synchronize) synchronizeRef.current = null
    }
  }, [assetId, strip, loopOverride, alphaMaskKey])
  // Host rerenders update masks/callbacks without restarting or decoding a clip.
  useEffect(() => { synchronizeRef.current?.() })
  if (!strip) return null
  return <canvas ref={canvasRef} className={className} style={{ aspectRatio: `${strip.frameWidth} / ${strip.frameHeight}` }} aria-hidden="true" />
}

/** Reception uses its calibrated counter placement, not a chair-contact anchor. */
export function SeatedActor({ employee, workstationId, command, onClick, onContextMenu, onPointerDown, onPointerMove, onPointerUp, onPointerCancel, paused = false, review, skinId, employeeDestination, paperPlane = false }: Readonly<{
  paperPlane?: boolean
  employeeDestination?: OfficeSceneSurfaceProps['employeeDestination']
  skinId?: string | undefined
  employee: OfficeSceneEmployee
  workstationId: OfficeWorkstationId
  command?: SceneCommand
  onClick: (event: ReactMouseEvent<HTMLButtonElement>) => void
  onContextMenu?: (event: ReactMouseEvent<HTMLButtonElement>) => void
  paused?: boolean
  review?: OfficeSceneSurfaceProps['seatReview']
  onPointerDown?: (event: ReactPointerEvent<HTMLButtonElement>) => void
  onPointerMove?: (event: ReactPointerEvent<HTMLButtonElement>) => void
  onPointerUp?: (event: ReactPointerEvent<HTMLButtonElement>) => void
  onPointerCancel?: (event: ReactPointerEvent<HTMLButtonElement>) => void
}>) {
  const catalog = getEmployeeCatalogWithSkin(employee.id, skinId)
  const workstation = getOfficeWorkstation(workstationId)
  const [frameIndex, setFrameIndex] = useState(review?.frameIndex ?? (paused || !command ? 3 : 0))
  if (!catalog || !workstation) return null
  const profile = getEmployeeTypingProfileWithSkin(employee.id, workstation.typingFacing, skinId)
  if (!profile) return null
  const assetId = catalog.typing[workstation.typingFacing]
  const sourceSha = getOfficeAsset(assetId).sha256
  // Side rooms put the keyboard left of the empty chair. Seat the whole rear
  // pose at the keys, including its own chair, so the hands reach the desk.
  const keys = workstation.zone === 'private-office' ? OFFICE_WORKSTATION_KEYBOARD_BOUNDS[workstation.id] : undefined
  const pack = keys && getEmployeeSkinPack(employee.id, skinId ?? getBrowserOfficeDefaultSkinId(employee.id))
  const pixels = originalBackHands[employee.id]
  const hand = pack ? pack.typingProfiles.back.landmarks.hand : pixels ? { x: pixels[0] / 512, y: pixels[1] / 860 } : undefined
  const contactProfile = keys && hand ? { ...profile, seatAnchor: hand } : profile
  const anchor = getWorkstationTypingFrameAnchor(contactProfile, workstation, frameIndex, sourceSha)
  const depth = Math.max(.77, Math.min(1.11, .74 + workstation.y * .38))
  const rectWidth = workstation.rect.width * OFFICE_NAV_WIDTH
  const rectHeight = workstation.rect.height * OFFICE_NAV_HEIGHT
  const originalScale = Math.min(
    164 * depth / 860,
    rectHeight * .93 / 860,
    rectWidth * .84 / 512,
  ) * workstation.employee.scale * profile.scaleMultiplier
  const spriteScale = seatedFigureScale(sourceSha, workstation.y * OFFICE_NAV_HEIGHT, originalScale)
  const ambientTyping = !command && employee.ambientDesk === true
  const sessionWorking = Boolean(command || employee.sceneActivity === 'working')
  const animateTyping = !employee.deskOnHold && Boolean(sessionWorking || ambientTyping || review?.mode === 'working')
  const base = keys && hand ? { x: (keys.left + keys.right) / 2, y: (keys.top + keys.bottom) / 2 } : workstation.seatPoint
    ? { x: workstation.seatPoint[0], y: workstation.seatPoint[1] }
    : {
        x: (workstation.rect.x + workstation.rect.width * workstation.employee.x) * OFFICE_NAV_WIDTH,
        y: (workstation.rect.y + workstation.rect.height * workstation.employee.y) * OFFICE_NAV_HEIGHT,
      }
  const receptionArmMask = workstation.id === 'reception' ? profile.receptionCountertopArmMask : undefined
  const receptionForearmMask = workstation.id === 'reception' ? profile.receptionCountertopForearmMask : undefined
  const receptionMaskUrls = [receptionArmMask ? resolveOfficeAssetUrl(receptionArmMask) : undefined, receptionForearmMask?.replace(/^url\(["']?|["']?\)$/gu, '')].filter((value): value is string => !!value)
  const sceneOccluderPolygons = [
    ...workstation.chairOccluderPolygons,
    ...(profile.useRearChairOcclusion ? workstation.rearChairOccluderPolygons : []),
  ]
  const employeeClipPath = workstation.employeeVisiblePolygon === null
    ? undefined
    : compileOfficeEmployeeVisibleClipPath({
        polygon: workstation.employeeVisiblePolygon,
        base,
        width: 512 * spriteScale,
        height: 860 * spriteScale,
        anchor,
        rotation: workstation.employee.rotation,
      })
  return (
    <button
      type="button"
      className="lumaOfficeEmployee lumaOfficeEmployeeWorking"
      onClick={onClick}
      onContextMenu={onContextMenu}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      {...officeEmployeeAction(employee.name, employeeDestination, employee.canDrag && !sessionWorking, paperPlane)}
      style={{
        left: `${base.x / OFFICE_NAV_WIDTH * 100}%`,
        top: `${base.y / OFFICE_NAV_HEIGHT * 100}%`,
        width: `${512 * spriteScale / OFFICE_NAV_WIDTH * 100}%`,
        height: `${860 * spriteScale / OFFICE_NAV_HEIGHT * 100}%`,
        zIndex: Math.max(1, Math.round(workstation.y * OFFICE_NAV_HEIGHT)),
        transform: `translate(${-anchor.x * 100}%, ${-anchor.y * 100}%) rotate(${workstation.employee.rotation}rad)`,
        // Rotate around the anatomical seat, matching the occlusion transform.
        // The walking button's foot-bottom origin would shift a seated body.
        transformOrigin: `${anchor.x * 100}% ${anchor.y * 100}%`,
      } satisfies CSSProperties}
      data-employee-id={employee.id}
      data-skin-id={skinId}
      data-workstation-id={workstationId}
      data-typing-facing={workstation.typingFacing}
      data-scene-activity={sessionWorking ? 'task' : ambientTyping ? 'desk-practice' : 'desk-break'}
      data-presence-label={sessionWorking ? '工作中' : ambientTyping ? '整理资料' : '在席待命'}
      {...command
        ? {
            'data-scene-command-id': command.commandId,
            'data-task-id': command.taskId,
          }
        : {}}
      data-employee-visible-clip={employeeClipPath === undefined ? 'none' : 'workstation'}
    >
      <span
        className="lumaOfficeEmployeeTypingClip"
        style={employeeClipPath === undefined ? undefined : { clipPath: employeeClipPath }}
      >
        <SpriteStripCanvas
          key={skinId ?? 'default'}
          assetId={assetId}
          className="lumaOfficeEmployeeTypingCanvas"
          onFrame={setFrameIndex}
          {...!review && animateTyping ? { deskRhythm: { employeeId: employee.id, routine: ambientTyping, restFrame: profile.reducedMotionFrame } } : {}}
          paused={paused || !animateTyping}
          {...review?.frameIndex === undefined
            ? !animateTyping ? { fixedFrameIndex: profile.reducedMotionFrame } : {}
            : { fixedFrameIndex: review.frameIndex }}
          {...sceneOccluderPolygons.length === 0
            ? {}
            : { resolveOcclusionPolygons: (nextFrameIndex: number) => compileOfficeEmployeeOcclusionPolygons({
                polygons: sceneOccluderPolygons,
                base,
                width: 512 * spriteScale,
                height: 860 * spriteScale,
                anchor: getWorkstationTypingFrameAnchor(contactProfile, workstation, nextFrameIndex, sourceSha),
                rotation: workstation.employee.rotation,
                frameWidth: 512,
                frameHeight: 860,
              }) }}
        />
      </span>
      {receptionMaskUrls.length > 0 && (
        <span className="lumaOfficeReceptionCountertopArm" aria-hidden="true"
          data-countertop-arm-mask={receptionArmMask ?? `${employee.id}-whole-frame-stencil`}>
          <SpriteStripCanvas assetId={assetId} className="lumaOfficeEmployeeTypingCanvas"
            alphaMaskUrls={receptionMaskUrls} fixedFrameIndex={frameIndex} paused />
        </span>
      )}
    </button>
  )
}


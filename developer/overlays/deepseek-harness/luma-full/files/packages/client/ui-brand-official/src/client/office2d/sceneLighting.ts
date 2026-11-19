import {
  getOfficeChairForegroundAssetForPhase,
  getOfficeWorkstationPropsAssetForPhase,
  getOfficeWorldAssetForPhase,
} from './timeSceneAssets.ts'
import { OFFICE_TIME_PHASES, type OfficeTimePhase } from './timePolicy.ts'
import { normalizeOfficeTheme, type OfficeThemeId } from './sceneThemeAssets.ts'

export const OFFICE_LIGHTING_TRANSITION_MS = 900
export const OFFICE_CLOSED_LAMP_MIX = 0.45

export interface OfficeLightingLayer {
  readonly phase: OfficeTimePhase
  readonly worldUrl: string
  readonly foregroundUrl: string
  readonly propsUrl: string
  readonly opacity: number
}

export interface OfficeLightingComposition {
  readonly phase: OfficeTimePhase
  readonly theme?: OfficeThemeId
  readonly layers: readonly OfficeLightingLayer[]
}

/** Existing, registered image pairs only. The closed base retains a little of
 * the real night artwork's lamps/strip lights, never invented CSS light pools.
 * The same source-over recipe is applied to the background, each independent
 * workstation prop, and the near-side armrests. */
export function createOfficeLightingComposition(phase: OfficeTimePhase, themeId?: string): OfficeLightingComposition {
  if (!Object.values(OFFICE_TIME_PHASES).includes(phase)) throw new RangeError('Unknown office lighting phase')
  const theme = normalizeOfficeTheme(themeId)
  const layer = (sourcePhase: OfficeTimePhase, opacity: number): OfficeLightingLayer => Object.freeze({
    phase: sourcePhase,
    worldUrl: getOfficeWorldAssetForPhase(sourcePhase, undefined, theme),
    foregroundUrl: getOfficeChairForegroundAssetForPhase(sourcePhase, undefined, theme),
    propsUrl: getOfficeWorkstationPropsAssetForPhase(sourcePhase, undefined, theme),
    opacity,
  })
  return Object.freeze({
    phase,
    ...(theme ? { theme } : {}),
    layers: Object.freeze(phase === OFFICE_TIME_PHASES.CLOSED
      ? [layer(phase, 1), layer(OFFICE_TIME_PHASES.NIGHT, OFFICE_CLOSED_LAMP_MIX)]
      : [layer(phase, 1)]),
  })
}

export const OFFICE_LIGHTING_INITIAL_RETRY_MS = 1_000

export type OfficeLightingFailureReason = 'load' | 'decode' | 'timeout' | 'dimensions' | 'cancelled' | 'unknown'

/** Stable classifications only: never retain a resource URL or underlying
 * browser exception in renderer state or diagnostics. */
export class OfficeLightingImageError extends Error {
  constructor(readonly reason: Exclude<OfficeLightingFailureReason, 'unknown'>, message: string) {
    super(message)
    this.name = 'OfficeLightingImageError'
  }
}

function classifyOfficeLightingFailure(problem: unknown): OfficeLightingFailureReason {
  if (problem instanceof OfficeLightingImageError) {
    switch (problem.reason) {
      case 'load': case 'decode': case 'timeout': case 'dimensions': case 'cancelled': return problem.reason
    }
  }
  return 'unknown'
}

export interface OfficeLightingFailure {
  readonly reason: OfficeLightingFailureReason
  readonly attempt: 1 | 2
  readonly retryPending: boolean
}

export interface OfficeLightingDiagnostic {
  readonly event: 'failed' | 'retry' | 'ready'
  readonly attempt: 1 | 2
  readonly reason?: OfficeLightingFailureReason
}

export interface OfficeLightingSnapshot {
  readonly current: OfficeLightingComposition | null
  readonly previous: OfficeLightingComposition | null
  readonly status: 'loading' | 'ready' | 'error'
  readonly transitionId: number
  readonly failure?: OfficeLightingFailure
}

export const EMPTY_OFFICE_LIGHTING: OfficeLightingSnapshot = Object.freeze({
  current: null, previous: null, status: 'loading', transitionId: 0,
})

/** No canvas writes, API calls or browser storage. A decoded image is kept
 * alive by the promise cache while its URL is in use, so a ready composition
 * cannot briefly swap to still-undecoded props on a slow connection. */
export function loadOfficeLightingImage(url: string, signal?: AbortSignal): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new OfficeLightingImageError('cancelled', 'Office lighting load was cancelled')); return }
    const image = new Image()
    let settled = false
    const finish = (error?: Error) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      signal?.removeEventListener('abort', abort)
      image.onload = null
      image.onerror = null
      if (error) reject(error)
      else resolve(image)
    }
    const abort = () => finish(new OfficeLightingImageError('cancelled', 'Office lighting load was cancelled'))
    const timeout = setTimeout(() => finish(new OfficeLightingImageError('timeout', 'Office lighting image timed out')), 15_000)
    signal?.addEventListener('abort', abort, { once: true })
    image.decoding = 'async'
    image.onload = () => {
      if (image.naturalWidth !== 1672 || image.naturalHeight !== 941) {
        finish(new OfficeLightingImageError('dimensions', 'Office lighting dimensions do not match the calibrated world'))
        return
      }
      if (typeof image.decode !== 'function') finish()
      else image.decode().then(() => finish(), () => finish(new OfficeLightingImageError('decode', 'Office lighting image could not be decoded')))
    }
    image.onerror = () => finish(new OfficeLightingImageError('load', 'Office lighting image could not be loaded'))
    image.src = url
  })
}

/** One asynchronous resource gate for the world and prop atlas. The prop URL
 * also supplies the near-side chair pixels, so three paint planes need only
 * two decoded images. Rendering owns the fade; this controller publishes
 * complete compositions and retires the old one
 * afterwards. Late loads, obsolete fade timers and disposal cannot repaint. */
export function createOfficeLightingController({
  onChange,
  loadImage = loadOfficeLightingImage,
  schedule = (callback: () => void, delay: number) => setTimeout(callback, delay),
  cancel = (handle: ReturnType<typeof setTimeout>) => clearTimeout(handle),
}: Readonly<{
  onChange: (snapshot: OfficeLightingSnapshot) => void
  loadImage?: (url: string, signal?: AbortSignal) => Promise<unknown>
  schedule?: (callback: () => void, delay: number) => ReturnType<typeof setTimeout>
  cancel?: (handle: ReturnType<typeof setTimeout>) => void
}>) {
  let snapshot = EMPTY_OFFICE_LIGHTING
  let requestId = 0
  let pendingKey: string | null = null
  let pendingImmediate = false
  let queuedComposition: OfficeLightingComposition | null = null
  let motionAllowed = true
  let disposed = false
  let fadeTimer: ReturnType<typeof setTimeout> | null = null
  let retryTimer: ReturnType<typeof setTimeout> | null = null
  const diagnostics: OfficeLightingDiagnostic[] = []
  const diagnosticStarted = performance.now()
  let diagnosticPhase: OfficeTimePhase = OFFICE_TIME_PHASES.MORNING
  const record = (entry: OfficeLightingDiagnostic) => {
    // Fixed enums/numbers only. No URL, account, theme, task, exception text or
    // headers cross this optional Main diagnostic observation boundary.
    const safe = { ...entry, phase: diagnosticPhase, durationMs: Math.max(0, performance.now() - diagnosticStarted) }
    try { console.debug('LUMA_OFFICE_IMAGE_DIAGNOSTIC_V1 ' + JSON.stringify(safe)) } catch {}
    diagnostics.push(Object.freeze(entry))
    if (diagnostics.length > 16) diagnostics.shift()
  }
  const clearRetry = () => {
    if (retryTimer !== null) cancel(retryTimer)
    retryTimer = null
  }
  const withoutFailure = () => {
    const { failure: _failure, ...state } = snapshot
    return state
  }
  const resources = new Map<string, Promise<unknown>>()
  const abortController = new AbortController()
  const publish = (next: OfficeLightingSnapshot) => {
    snapshot = Object.freeze(next)
    if (!disposed) onChange(snapshot)
  }
  const clearFade = () => {
    if (fadeTimer !== null) cancel(fadeTimer)
    fadeTimer = null
  }
  const commit = (composition: OfficeLightingComposition) => {
    clearFade()
    pendingKey = null
    queuedComposition = null
    const previous = motionAllowed && !pendingImmediate ? snapshot.current : null
    publish({ current: composition, previous, status: 'ready', transitionId: snapshot.transitionId + 1 })
    if (previous) {
      const transitionId = snapshot.transitionId
      fadeTimer = schedule(() => {
        if (!disposed && snapshot.transitionId === transitionId) finishTransition()
      }, OFFICE_LIGHTING_TRANSITION_MS)
    }
  }
  const finishTransition = () => {
    clearFade()
    if (queuedComposition) commit(queuedComposition)
    else if (snapshot.previous) publish({ ...snapshot, previous: null })
  }
  const ensureImage = (url: string): Promise<unknown> => {
    let resource = resources.get(url)
    if (!resource) {
      resource = Promise.resolve().then(() => loadImage(url, abortController.signal))
      resources.set(url, resource)
      resource.catch(() => { if (resources.get(url) === resource) resources.delete(url) })
    }
    return resource
  }
  return {
    get snapshot() { return snapshot },
    get diagnostics(): readonly OfficeLightingDiagnostic[] { return Object.freeze([...diagnostics]) },
    setMotionAllowed(allowed: boolean) {
      if (disposed) return
      motionAllowed = allowed
      if (!allowed) {
        // A load started in view but completed after hiding must not replay a
        // delayed sunset when the office is shown again.
        pendingImmediate = true
        finishTransition()
      }
    },
    request(phase: OfficeTimePhase, { immediate = false, theme }: Readonly<{ immediate?: boolean; theme?: string }> = {}) {
      if (disposed) return
      const composition = createOfficeLightingComposition(phase, theme)
      const key = `${phase}:${composition.theme ?? ''}`
      if (pendingKey === key) {
        pendingImmediate ||= immediate || !motionAllowed
        if (pendingImmediate) finishTransition()
        return
      }
      const id = ++requestId
      clearRetry()
      pendingKey = null
      queuedComposition = null
      if (snapshot.current?.phase === phase && snapshot.current.theme === composition.theme) {
        if (immediate || !motionAllowed) finishTransition()
        if (snapshot.status !== 'ready') publish({ ...withoutFailure(), status: 'ready' })
        return
      }
      pendingKey = key
      diagnosticPhase = phase
      pendingImmediate = immediate || !motionAllowed
      publish({ ...withoutFailure(), status: 'loading' })
      const urls = [...new Set(composition.layers.flatMap(layer => [layer.worldUrl, layer.foregroundUrl, layer.propsUrl]).filter(Boolean))]
      let terminalReason: OfficeLightingFailureReason | null = null
      const observeImage = (url: string) => ensureImage(url).catch((problem: unknown) => {
        if (!disposed && id === requestId) {
          const reason = classifyOfficeLightingFailure(problem)
          if (terminalReason === null && reason !== 'load' && reason !== 'decode' && reason !== 'timeout') {
            terminalReason = reason
            // Promise.all may already have rejected for another plane. A later
            // terminal failure must still cancel its scheduled initial retry.
            if (retryTimer !== null) {
              clearRetry()
              pendingKey = null
              record({ event: 'failed', attempt: 1, reason })
              publish({ ...snapshot, status: 'error', failure: Object.freeze({ reason, attempt: 1, retryPending: false }) })
            }
          }
        }
        throw problem
      })
      const load = (attempt: 1 | 2) => {
        Promise.all(urls.map(observeImage)).then(() => {
          if (disposed || id !== requestId) return
          record({ event: 'ready', attempt })
          // The incoming layer is still translucent until its fade completes.
          // Promoting it to the next opaque base now would drop the visible mix.
          // Keep only the latest complete target; hiding/immediate requests may
          // bypass this queue because they deliberately do not animate.
          if (snapshot.previous && motionAllowed && !pendingImmediate) queuedComposition = composition
          else commit(composition)
        }, (problem: unknown) => {
          if (disposed || id !== requestId) return
          const reason = terminalReason ?? classifyOfficeLightingFailure(problem)
          record({ event: 'failed', attempt, reason })
          // Only the initial scene gets one bounded recovery attempt. Each real
          // Image keeps its original 15-second deadline; successful or still
          // pending URLs are reused. Same-key requests cannot reset this budget.
          const retryPending = snapshot.current === null && attempt === 1
            && (reason === 'load' || reason === 'decode' || reason === 'timeout')
          const failure = Object.freeze({ reason, attempt, retryPending })
          if (retryPending) {
            retryTimer = schedule(() => {
              retryTimer = null
              if (disposed || id !== requestId) return
              record({ event: 'retry', attempt: 2, reason })
              load(2)
            }, OFFICE_LIGHTING_INITIAL_RETRY_MS)
            publish({ ...snapshot, status: 'loading', failure })
          } else {
            pendingKey = null
            // Keep the last complete scene, not a mixture of two different hours.
            publish({ ...snapshot, status: 'error', failure })
          }
        })
      }
      load(1)
    },
    dispose() {
      disposed = true
      requestId += 1
      pendingKey = null
      queuedComposition = null
      clearRetry()
      clearFade()
      abortController.abort()
      diagnostics.length = 0
      resources.clear()
    },
  }
}

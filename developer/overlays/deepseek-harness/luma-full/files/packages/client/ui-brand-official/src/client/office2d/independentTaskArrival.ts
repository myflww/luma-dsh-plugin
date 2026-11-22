import type { SceneCommand, SceneEventType } from '../office-harness/SceneProtocol.ts'
import type { OfficeWalkDirection } from './employeeCatalog.ts'
import type { OfficeFrameStrip } from './assets.ts'
import { createOfficeFrameTimeline, workstationArrivalStep } from './frameTimeline.ts'

type Point = readonly [number, number]
export type IndependentFloorNode = { readonly point: Point; readonly bodyCoreHeightPx: number }
export type IndependentFloorGraph = {
  readonly schemaVersion: 1; readonly visualReviewed: true; readonly sourceSize: Point; readonly entryNode: string
  readonly nodes: Readonly<Record<string, IndependentFloorNode>>
  readonly edges: readonly (readonly [string, string])[]
  readonly targets: Readonly<Record<string, { readonly approachNode: string; readonly exitNode: string }>>
}
type Waypoint = IndependentFloorNode & { readonly id: string }
export type IndependentArrivalEvent = { readonly command: SceneCommand; readonly type: SceneEventType; readonly reason?: string }
export type IndependentArrivalState = {
  position: Point; bodyCoreHeightPx: number; direction: OfficeWalkDirection
  mode: 'floor' | 'approaching' | 'seat-pending' | 'seated' | 'leaving' | 'report' | 'roaming' | 'returning'
  ambientStationId?: string | undefined
  seatedStationId?: string | undefined; command?: SceneCommand | undefined; lastCommandId?: string | undefined
  route: readonly Waypoint[]; waypointIndex: number; walkElapsedMs: number; reportElapsedMs: number
  owned: boolean; failure?: string | undefined; emitted: ReadonlySet<string>; seen: ReadonlySet<string>
}
const close = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1]) < .01
const validPoint = (p: unknown, size: Point): p is Point => Array.isArray(p) && p.length === 2 && p.every((n, i) => Number.isFinite(n) && n >= 0 && n <= size[i]!)
function fail(reason: string): never { throw new Error(reason) }

/** The producer owns visual review and physical paths. Never substitute the classic room graph. */
export function validateIndependentFloorGraph(raw: unknown, size: Point, stations: readonly { id: string; approach: Point }[] = []): IndependentFloorGraph {
  const g = raw as IndependentFloorGraph | undefined
  if (!g || g.schemaVersion !== 1 || g.visualReviewed !== true || !Array.isArray(g.sourceSize) || g.sourceSize.length !== 2
    || g.sourceSize.some((n, i) => n !== size[i]) || !g.nodes || !g.targets || !Array.isArray(g.edges)) fail('reviewed-floor-graph-unavailable')
  const ids = Object.keys(g.nodes)
  if (!ids.length || !g.nodes[g.entryNode]) fail('floor-entry-unavailable')
  for (const n of Object.values(g.nodes)) if (!validPoint(n.point, size) || !Number.isFinite(n.bodyCoreHeightPx) || n.bodyCoreHeightPx <= 0 || n.bodyCoreHeightPx > size[1]) fail('invalid-floor-node')
  const seen = new Set<string>()
  for (const e of g.edges) {
    if (!Array.isArray(e) || e.length !== 2 || !g.nodes[e[0]] || !g.nodes[e[1]] || e[0] === e[1] || close(g.nodes[e[0]]!.point, g.nodes[e[1]]!.point)) fail('invalid-floor-edge')
    const key = [...e].sort().join('\u0000'); if (seen.has(key)) fail('duplicate-floor-edge'); seen.add(key)
  }
  for (const [id, t] of Object.entries(g.targets)) {
    if (!t || !g.nodes[t.approachNode] || !g.nodes[t.exitNode]) fail('invalid-floor-target')
    const slot = stations.find(s => s.id === id)
    if (stations.length && (!slot || !close(g.nodes[t.approachNode]!.point, slot.approach))) fail('floor-target-approach-mismatch')
  }
  return g
}

/** Start only on a reviewed node/edge. An arbitrary dragged position is not teleported to a nearby path. */
export function independentFloorRoute(g: IndependentFloorGraph, from: Point, goal: string): readonly Waypoint[] {
  if (!g.nodes[goal]) fail('floor-target-unavailable')
  const dist = new Map<string, number>(), previous = new Map<string, string>(), pending = new Set(Object.keys(g.nodes))
  for (const [id, n] of Object.entries(g.nodes)) if (close(from, n.point)) dist.set(id, 0)
  if (!dist.size) for (const [a, b] of g.edges) {
    const p = g.nodes[a]!.point, q = g.nodes[b]!.point, dx = q[0] - p[0], dy = q[1] - p[1]
    const t = ((from[0] - p[0]) * dx + (from[1] - p[1]) * dy) / (dx * dx + dy * dy)
    if (t < 0 || t > 1 || Math.hypot(from[0] - p[0] - t * dx, from[1] - p[1] - t * dy) > .01) continue
    for (const id of [a, b]) dist.set(id, Math.min(dist.get(id) ?? Infinity, Math.hypot(from[0] - g.nodes[id]!.point[0], from[1] - g.nodes[id]!.point[1])))
  }
  if (!dist.size) fail('actor-off-reviewed-floor-path')
  while (pending.size) {
    let at: string | undefined, best = Infinity
    for (const id of pending) if ((dist.get(id) ?? Infinity) < best) { at = id; best = dist.get(id)! }
    if (at === undefined) break
    pending.delete(at); if (at === goal) break
    for (const [a, b] of g.edges) {
      const next = a === at ? b : b === at ? a : undefined; if (!next || !pending.has(next)) continue
      const p = g.nodes[at]!.point, q = g.nodes[next]!.point, value = best + Math.hypot(q[0] - p[0], q[1] - p[1])
      if (value < (dist.get(next) ?? Infinity)) { dist.set(next, value); previous.set(next, at) }
    }
  }
  if (!dist.has(goal)) fail('floor-route-unavailable')
  const ids = [goal]; while (previous.has(ids[0]!)) ids.unshift(previous.get(ids[0]!)!)
  return ids.map(id => ({ id, ...g.nodes[id]! })).filter((n, i) => i > 0 || !close(from, n.point))
}
export function createIndependentArrivalState(position: Point, bodyCoreHeightPx: number, restoredStationId?: string): IndependentArrivalState {
  return { position, bodyCoreHeightPx, direction: 'down', mode: restoredStationId ? 'seated' : 'floor', ...(restoredStationId ? { seatedStationId: restoredStationId } : {}), route: [], waypointIndex: 0, walkElapsedMs: 0, reportElapsedMs: 0, owned: false, emitted: new Set(), seen: new Set() }
}
function emit(s: IndependentArrivalState, events: IndependentArrivalEvent[], type: SceneEventType, reason?: string) {
  if (!s.command) return
  const key = `${s.command.commandId}:${type}`; if (s.emitted.has(key)) return
  s.emitted = new Set([...s.emitted, key]); events.push({ command: s.command, type, ...(reason ? { reason } : {}) })
}
function unseat(s: IndependentArrivalState, g: IndependentFloorGraph) {
  if (!s.seatedStationId) return
  const target = g.targets[s.seatedStationId]; if (!target) fail('floor-exit-unavailable')
  const n = g.nodes[target.exitNode]!
  s.position = n.point; s.bodyCoreHeightPx = n.bodyCoreHeightPx; s.seatedStationId = undefined
}
function begin(s: IndependentArrivalState, g: IndependentFloorGraph, goal: string, mode: 'approaching' | 'leaving') {
  const route = independentFloorRoute(g, s.position, goal)
  s.route = route; s.waypointIndex = 0; s.mode = mode; s.walkElapsedMs = 0; s.failure = undefined
}
function arrive(s: IndependentArrivalState) {
  if (s.mode === 'approaching') { s.mode = 'seat-pending'; s.seatedStationId = s.command!.workstationId }
  else if (s.mode === 'leaving') { s.mode = s.command?.type === 'complete-task' ? 'report' : 'floor'; s.reportElapsedMs = 0 }
  else if (s.mode === 'returning') { s.mode = 'seated'; s.seatedStationId = s.ambientStationId; s.ambientStationId = undefined }
  else if (s.mode === 'roaming') s.mode = 'floor'
  s.route = []; s.waypointIndex = 0
}
/** One source-time tick, default speed mirrors Native body*1.25; it is not a calibrated stride. */
export function advanceIndependentTaskArrival(previous: IndependentArrivalState, input: {
  graph?: IndependentFloorGraph; graphError?: string; command?: SceneCommand; bindingAvailable: boolean
  deltaMs: number; active: boolean; reduceMotion: boolean; motionAvailable?: boolean
  speedFactorForDirection?: (direction: OfficeWalkDirection) => number
}): { state: IndependentArrivalState; events: IndependentArrivalEvent[] } {
  const s = { ...previous }, events: IndependentArrivalEvent[] = [], g = input.graph, command = input.command
  if (!input.active) return { state: s, events }
  const changed = command ? command.commandId !== s.lastCommandId : s.command !== undefined
  if (changed) {
    // A retired identity cannot return an actor to an old seat after cancellation/reassignment.
    if (command && s.seen.has(command.commandId)) return { state: s, events }
    const safe = { ...s }
    s.command = command; s.lastCommandId = command?.commandId; s.owned = true
    if (command) s.seen = new Set([...s.seen, command.commandId])
    try {
      if (!g) fail(input.graphError ?? 'reviewed-floor-graph-unavailable')
      if (input.motionAvailable === false) fail('whole-walk-resource-unavailable')
      s.failure = undefined
      if (command?.type === 'start-task') {
        const target = g.targets[command.workstationId]; if (!target) fail('floor-target-unavailable')
        if (!input.bindingAvailable) fail('complete-work-binding-unavailable')
        if (s.mode === 'seated' && s.seatedStationId === command.workstationId) { s.mode = 'seat-pending'; s.route = [] }
        else { unseat(s, g); begin(s, g, target.approachNode, 'approaching') }
      } else { unseat(s, g); begin(s, g, g.entryNode, 'leaving') }
      emit(s, events, 'command-accepted')
    } catch (e) {
      // Preserve a valid previous whole pose and floor point on failure, never fabricate arrival.
      Object.assign(s, safe, { command, lastCommandId: command?.commandId, seen: s.seen, owned: true, failure: e instanceof Error ? e.message : String(e), route: [], waypointIndex: 0 })
      if (s.mode !== 'seated') { s.mode = 'floor'; s.seatedStationId = undefined }
      emit(s, events, 'navigation-failed', s.failure)
    }
  }
  if (!s.failure && (s.mode === 'approaching' || s.mode === 'seat-pending') && !input.bindingAvailable) {
    s.failure = 'complete-work-binding-unavailable'; s.mode = 'floor'; s.seatedStationId = undefined; s.route = []; emit(s, events, 'navigation-failed', s.failure)
  }
  if (!s.failure && (s.mode === 'approaching' || s.mode === 'leaving' || s.mode === 'roaming' || s.mode === 'returning') && input.motionAvailable === false) {
    s.failure = 'whole-walk-resource-unavailable'; s.mode = 'floor'; s.route = []; emit(s, events, 'navigation-failed', s.failure)
  }
  if (s.failure || !input.active) return { state: s, events }
  if (s.mode === 'approaching' || s.mode === 'leaving' || s.mode === 'roaming' || s.mode === 'returning') {
    if (!g) { s.failure = input.graphError ?? 'reviewed-floor-graph-unavailable'; emit(s, events, 'navigation-failed', s.failure); return { state: s, events } }
    let remaining = Math.max(0, Math.min(100, input.deltaMs))
    while (s.waypointIndex < s.route.length) {
      const to = s.route[s.waypointIndex]!, dx = to.point[0] - s.position[0], dy = to.point[1] - s.position[1], distance = Math.hypot(dx, dy)
      if (distance < .01) { s.position = to.point; s.bodyCoreHeightPx = to.bodyCoreHeightPx; s.waypointIndex++; continue }
      if (remaining <= 0 && !input.reduceMotion) break
      s.direction = Math.abs(dx) >= Math.abs(dy) ? dx >= 0 ? 'right' : 'left' : dy >= 0 ? 'down' : 'up'
      const speedFactor = input.speedFactorForDirection?.(s.direction) ?? 1.25
      // Solve dH/dt along this edge so perspective height is smooth and independent of RAF subdivision.
      const h = s.bodyCoreHeightPx, k = (to.bodyCoreHeightPx - h) / distance
      const cruiseMs = (Math.abs(k)<1e-9 ? distance/h : Math.log1p(k*distance/h)/k) / speedFactor*1000
      const toSeat = (s.mode==='returning' || s.mode==='approaching') && s.waypointIndex===s.route.length-1 && !input.reduceMotion
      const time = toSeat ? workstationArrivalStep(cruiseMs,remaining) : {travelMs:Math.min(remaining,cruiseMs),usedMs:Math.min(remaining,cruiseMs)}
      const seconds=time.travelMs/1000
      const possible = Math.abs(k) < 1e-9 ? h * speedFactor * seconds : h * Math.expm1(speedFactor * k * seconds) / k
      const amount = input.reduceMotion ? distance : Math.min(distance, possible), ratio = amount / distance
      s.position = [s.position[0] + dx * ratio, s.position[1] + dy * ratio]; s.bodyCoreHeightPx = h + (to.bodyCoreHeightPx - h) * ratio
      s.walkElapsedMs += input.reduceMotion ? 0 : time.travelMs; remaining -= time.usedMs
      if (amount >= distance - .01) { s.position = to.point; s.bodyCoreHeightPx = to.bodyCoreHeightPx; s.waypointIndex++ } else break
    }
    if (s.waypointIndex >= s.route.length) arrive(s)
  } else if (s.mode === 'report') s.reportElapsedMs += Math.max(0, input.deltaMs)
  return { state: s, events }
}
export function approachProjectedWorkstation(actor: IndependentArrivalState, graph: IndependentFloorGraph, stationId: string): IndependentArrivalState {
  if (actor.command || actor.seatedStationId === stationId || (actor.mode === 'returning' && actor.ambientStationId === stationId)) return actor
  const target = graph.targets[stationId]
  if (!target) return actor
  const next = { ...actor }
  try {
    unseat(next, graph)
    const route = independentFloorRoute(graph, next.position, target.approachNode)
    return { ...next, mode:'returning', route, waypointIndex:0, ambientStationId:stationId, owned:true, walkElapsedMs:0, failure:undefined }
  } catch { return actor }
}

/** Call only after the corresponding complete source was actually drawn. */
export function markIndependentArrivalPainted(previous: IndependentArrivalState, kind: 'binding' | 'floor' | 'report-finished') {
  const state = { ...previous }, events: IndependentArrivalEvent[] = []
  if (!state.failure && kind === 'binding' && (state.mode === 'seat-pending' || state.mode === 'seated') && state.command?.type === 'start-task') {
    state.mode = 'seated'; emit(state, events, 'workstation-arrived'); emit(state, events, 'work-animation-ready')
  } else if (!state.failure && ((kind === 'floor' && state.mode === 'floor' && state.command?.type === 'stop-task') || (kind === 'report-finished' && state.mode === 'report'))) {
    emit(state, events, 'animation-finished'); state.mode = 'floor'
  }
  return { state, events }
}
export function interruptIndependentTaskArrival(previous: IndependentArrivalState, position: Point): IndependentArrivalState {
  return { ...previous, position, mode: 'floor', route: [], waypointIndex: 0, seatedStationId: undefined, command: undefined, owned: true, failure: undefined }
}

/** Authored rest selection takes precedence; absent an explicit rest, hold the last actual source phase. */
export function independentArrivalFrame<A extends string>(catalog: { walk: Readonly<Record<OfficeWalkDirection, A>>; walkRest?: Readonly<Partial<Record<OfficeWalkDirection, { asset: A; frameIndex: number; scale?: number; liftPercent?: number }>>> }, direction: OfficeWalkDirection, moving: boolean, elapsedMs: number, walk: OfficeFrameStrip) {
  const rest = moving ? undefined : catalog.walkRest?.[direction]
  return { asset: rest?.asset ?? catalog.walk[direction], frame: rest?.frameIndex ?? createOfficeFrameTimeline(walk).frameAt(elapsedMs, true), scale: rest?.scale ?? 1, liftPercent: rest?.liftPercent ?? 0, explicitRest: !!rest }
}

/** Exact automatic playback dependencies, including neutral PNGs independent from walk strips. */
export function independentArrivalAssetDependencies<A extends string>(catalog: { walk: Readonly<Record<OfficeWalkDirection, A>>; walkRest?: Readonly<Partial<Record<OfficeWalkDirection, { asset: A }>>>; reportHandoff: { asset?: A } }): readonly A[] {
  return [...new Set([...Object.values(catalog.walk), ...Object.values(catalog.walkRest ?? {}).map(rest => rest.asset), ...(catalog.reportHandoff.asset ? [catalog.reportHandoff.asset] : [])])]
}

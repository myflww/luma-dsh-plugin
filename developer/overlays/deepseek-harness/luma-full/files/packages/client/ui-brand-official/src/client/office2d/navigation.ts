import type { OfficeWorkstationId } from './workstationSeating.ts'
import { calculateOfficeActorSweptOverlap, type OfficeActorState } from './actorAvoidance.ts'

export const OFFICE_NAV_WIDTH = 1672
export const OFFICE_NAV_HEIGHT = 941
export const OFFICE_NAV_FOOTPRINT = Object.freeze({ radiusX: 10, radiusY: 5 })

export type OfficePointTuple = readonly [number, number]
export type OfficePointInput = OfficePointTuple | Readonly<{ x: number; y: number }>
export type OfficeNavNodeKind = 'ambient' | 'work'

export interface OfficeNavNode {
  readonly id: string
  readonly x: number
  readonly y: number
  readonly kind: OfficeNavNodeKind
}

export interface OfficeNavEdge {
  readonly id: string
  readonly from: string
  readonly to: string
  readonly kind: OfficeNavNodeKind
  readonly cost: number
}

export interface OfficePolygon {
  readonly id: string
  readonly points: readonly OfficePointTuple[]
}

export interface OfficeRoute {
  readonly nodeIds: readonly string[]
  readonly points: readonly OfficePointTuple[]
  readonly distance: number
}

const freezePoint = (x: number, y: number): OfficePointTuple => Object.freeze([x, y])
const node = (id: string, x: number, y: number, kind: OfficeNavNodeKind = 'ambient') =>
  Object.freeze({ id, x, y, kind })

export const OFFICE_NAV_NODES = Object.freeze({
  entrance: node('entrance', 385, 884),
  'entry-hall': node('entry-hall', 408, 748),
  'west-lower': node('west-lower', 450, 655),
  'west-mid': node('west-mid', 460, 520),
  'west-gap': node('west-gap', 520, 440),
  'upper-front-west': node('upper-front-west', 625, 445),
  'lounge-gap-lower': node('lounge-gap-lower', 644, 348),
  'lounge-gap-upper': node('lounge-gap-upper', 670, 245),
  'top-west': node('top-west', 740, 210),
  'top-center': node('top-center', 840, 205),
  'top-east': node('top-east', 1030, 220),
  'south-west': node('south-west', 560, 665),
  'south-center': node('south-center', 850, 665),
  'south-east': node('south-east', 1090, 665),
  // Calibrated second lane between the seated south row and reception.
  // The y=665 lane alone is cut in both directions when the middle and
  // right approaches are occupied. Keep the original actor/furniture
  // clearance and let work-bound routes use this real floor space instead.
  'south-aisle-west': node('south-aisle-west', 676, 680, 'work'),
  'south-aisle-center': node('south-aisle-center', 850, 680, 'work'),
  'south-aisle-east': node('south-aisle-east', 1030, 680, 'work'),
  // A short upper entry lets an actor caught between reception and the
  // south-right seat reach the left side without circling both desk banks.
  'south-row-inner': node('south-row-inner', 850, 648, 'work'),
  // The occupied north-right approach blocks the straight work strip.
  // Follow the actual sloped gap above the lower desk bank; do not shortcut
  // these bends or move the seated actor's conservative collision anchor.
  'north-aisle-inner': node('north-aisle-inner', 980, 458, 'work'),
  'north-aisle-corner': node('north-aisle-corner', 1014, 475.3, 'work'),
  'north-aisle-clearance': node('north-aisle-clearance', 1022, 478.7, 'work'),
  'north-aisle-east': node('north-aisle-east', 1046, 487, 'work'),
  'east-lower': node('east-lower', 1170, 610),
  'east-mid': node('east-mid', 1170, 475),
  'upper-front-east': node('upper-front-east', 1140, 445),
  'private-upper-door': node('private-upper-door', 350, 500, 'work'),
  'private-lower-door': node('private-lower-door', 370, 700, 'work'),
  'approach-private-upper': node('approach-private-upper', 275, 520, 'work'),
  'approach-private-lower': node('approach-private-lower', 320, 720, 'work'),
  'approach-north-private': node('approach-north-private', 809, 445, 'work'),
  'approach-north-center': node('approach-north-center', 927, 450, 'work'),
  'approach-west-studio': node('approach-west-studio', 1048, 458, 'work'),
  'approach-south-left': node('approach-south-left', 676, 642, 'work'),
  'approach-south-focus': node('approach-south-focus', 800, 646, 'work'),
  'approach-south-right': node('approach-south-right', 930, 651, 'work'),
  'approach-reception': node('approach-reception', 840, 680, 'work'),
} satisfies Readonly<Record<string, OfficeNavNode>>)

type OfficeNavNodeId = keyof typeof OFFICE_NAV_NODES

const getNode = (nodeId: string): OfficeNavNode => {
  const result = OFFICE_NAV_NODES[nodeId as OfficeNavNodeId]
  if (!result) throw new Error(`Unknown office navigation node: ${nodeId}`)
  return result
}

const edge = (
  from: OfficeNavNodeId,
  to: OfficeNavNodeId,
  kind: OfficeNavNodeKind = 'ambient',
): OfficeNavEdge => {
  const fromNode = getNode(from)
  const toNode = getNode(to)
  return Object.freeze({
    id: `${from}--${to}`,
    from,
    to,
    kind,
    cost: Math.hypot(toNode.x - fromNode.x, toNode.y - fromNode.y),
  })
}

export const OFFICE_NAV_EDGES = Object.freeze([
  edge('entrance', 'entry-hall'),
  edge('entry-hall', 'west-lower'),
  edge('west-lower', 'west-mid'),
  edge('west-mid', 'west-gap'),
  edge('west-gap', 'upper-front-west'),
  edge('upper-front-west', 'lounge-gap-lower'),
  edge('lounge-gap-lower', 'lounge-gap-upper'),
  edge('lounge-gap-upper', 'top-west'),
  edge('top-west', 'top-center'),
  edge('top-center', 'top-east'),
  edge('west-lower', 'south-west'),
  edge('south-west', 'south-center'),
  edge('south-center', 'south-east'),
  edge('south-east', 'east-lower'),
  edge('east-lower', 'east-mid'),
  edge('east-mid', 'upper-front-east'),
  edge('west-mid', 'private-upper-door', 'work'),
  edge('private-upper-door', 'approach-private-upper', 'work'),
  edge('west-lower', 'private-lower-door', 'work'),
  edge('private-lower-door', 'approach-private-lower', 'work'),
  edge('upper-front-west', 'approach-north-private', 'work'),
  edge('approach-north-private', 'approach-north-center', 'work'),
  edge('approach-north-center', 'approach-west-studio', 'work'),
  edge('approach-west-studio', 'upper-front-east', 'work'),
  edge('approach-north-center', 'north-aisle-inner', 'work'),
  edge('north-aisle-inner', 'north-aisle-corner', 'work'),
  edge('north-aisle-corner', 'north-aisle-clearance', 'work'),
  edge('north-aisle-clearance', 'north-aisle-east', 'work'),
  edge('north-aisle-east', 'east-mid', 'work'),
  edge('south-west', 'approach-south-left', 'work'),
  edge('approach-south-left', 'approach-south-focus', 'work'),
  edge('approach-south-focus', 'approach-south-right', 'work'),
  edge('approach-south-focus', 'south-row-inner', 'work'),
  edge('south-row-inner', 'approach-south-right', 'work'),
  edge('approach-south-right', 'south-east', 'work'),
  edge('approach-south-left', 'south-aisle-west', 'work'),
  edge('south-west', 'south-aisle-west', 'work'),
  edge('south-aisle-west', 'south-aisle-center', 'work'),
  edge('south-center', 'south-aisle-center', 'work'),
  edge('south-aisle-center', 'approach-south-focus', 'work'),
  edge('south-aisle-center', 'south-aisle-east', 'work'),
  edge('south-aisle-east', 'approach-south-right', 'work'),
  edge('south-aisle-east', 'south-east', 'work'),
  edge('south-center', 'approach-reception', 'work'),
])

const polygon = (id: string, points: readonly OfficePointTuple[]): OfficePolygon =>
  Object.freeze({ id, points: Object.freeze(points.map(([x, y]) => freezePoint(x, y))) })

export const OFFICE_NAV_WALKABLE_FLOOR = polygon('walkable-office-floor', [
  [330, 178], [1055, 178], [1215, 315], [1225, 690], [1145, 735],
  [1145, 820], [1050, 905], [330, 915], [300, 790], [245, 745],
  [235, 500], [285, 425],
])

/** Air-wall polygons include furniture, rooms, bar, plants and the exterior. */
export const OFFICE_NAV_OBSTACLES = Object.freeze([
  polygon('lounge-furniture', [[45, 55], [650, 55], [675, 150], [650, 245], [620, 405], [270, 405], [45, 340]]),
  polygon('upper-desk-bank', [[680, 260], [1050, 260], [1150, 325], [1150, 385], [1085, 445], [700, 420], [650, 370]]),
  polygon('lower-desk-bank', [[600, 475], [975, 465], [1065, 505], [1070, 555], [1000, 605], [610, 590], [550, 535]]),
  polygon('reception-counter', [[670, 705], [1000, 705], [1025, 780], [985, 850], [700, 850], [660, 780]]),
  polygon('meeting-room', [[1090, 40], [1560, 40], [1560, 320], [1190, 320], [1090, 250]]),
  polygon('bar-and-stools', [[1250, 325], [1645, 325], [1645, 570], [1360, 570], [1230, 500]]),
  polygon('right-plant-border', [[1380, 540], [1671, 540], [1671, 940], [1160, 940], [1160, 820], [1370, 780]]),
  polygon('private-upper-desk', [[50, 385], [240, 385], [260, 470], [240, 545], [55, 545]]),
  polygon('private-lower-desk', [[70, 585], [285, 585], [310, 675], [295, 755], [80, 755]]),
  polygon('entrance-plant-island', [[470, 680], [625, 680], [650, 850], [570, 895], [475, 850]]),
])

export interface OfficeActionPoint {
  readonly id: string
  readonly nodeId: OfficeNavNodeId
  readonly x: number
  readonly y: number
  readonly activity: 'pause' | 'idle' | 'look'
  readonly facing: 'up' | 'down' | 'left' | 'right'
}

const actionPoint = (
  id: string,
  nodeId: OfficeNavNodeId,
  activity: OfficeActionPoint['activity'],
  facing: OfficeActionPoint['facing'],
): OfficeActionPoint => {
  const navNode = getNode(nodeId)
  return Object.freeze({ id, nodeId, x: navNode.x, y: navNode.y, activity, facing })
}

export const OFFICE_NAV_ACTION_POINTS = Object.freeze([
  actionPoint('arrival-pause', 'entry-hall', 'pause', 'up'),
  actionPoint('west-aisle', 'west-mid', 'idle', 'right'),
  actionPoint('sunlit-gap', 'upper-front-west', 'look', 'up'),
  actionPoint('window-center', 'top-center', 'look', 'up'),
  actionPoint('window-east', 'top-east', 'idle', 'left'),
  actionPoint('east-aisle', 'east-mid', 'idle', 'left'),
  actionPoint('east-lower', 'east-lower', 'pause', 'down'),
  actionPoint('south-east', 'south-east', 'idle', 'left'),
  actionPoint('south-center', 'south-center', 'pause', 'up'),
  actionPoint('south-west', 'south-west', 'idle', 'right'),
])

export interface OfficeWorkstationApproach {
  readonly workstationId: OfficeWorkstationId
  readonly nodeId: OfficeNavNodeId
  readonly point: OfficePointTuple
  readonly facing: string
  readonly seatTransition: string
}

const workstationApproach = (
  workstationId: OfficeWorkstationId,
  nodeId: OfficeNavNodeId,
  facing: string,
  seatTransition: string,
): OfficeWorkstationApproach => {
  const navNode = getNode(nodeId)
  return Object.freeze({
    workstationId,
    nodeId,
    point: freezePoint(navNode.x, navNode.y),
    facing,
    seatTransition,
  })
}

export const OFFICE_WORKSTATION_APPROACHES = Object.freeze({
  'north-private': workstationApproach('north-private', 'approach-north-private', 'up', 'seat-back'),
  'north-center': workstationApproach('north-center', 'approach-north-center', 'up', 'seat-back'),
  'west-studio': workstationApproach('west-studio', 'approach-west-studio', 'up-left', 'seat-back-left'),
  'south-left': workstationApproach('south-left', 'approach-south-left', 'up-right', 'seat-back-right'),
  'south-focus': workstationApproach('south-focus', 'approach-south-focus', 'up', 'seat-back'),
  'south-right': workstationApproach('south-right', 'approach-south-right', 'up-left', 'seat-back-left'),
  'private-upper': workstationApproach('private-upper', 'approach-private-upper', 'left', 'seat-front-right'),
  'private-lower': workstationApproach('private-lower', 'approach-private-lower', 'left', 'seat-front-right'),
  reception: workstationApproach('reception', 'approach-reception', 'down', 'counter-front'),
} satisfies Readonly<Record<OfficeWorkstationId, OfficeWorkstationApproach>>)

const pointFrom = (value: OfficePointInput): { x: number; y: number } =>
  Array.isArray(value)
    ? { x: Number(value[0]), y: Number(value[1]) }
    : { x: Number((value as { x: number }).x), y: Number((value as { y: number }).y) }

const isFinitePoint = ({ x, y }: Readonly<{ x: number; y: number }>) =>
  Number.isFinite(x) && Number.isFinite(y)

const distance = (a: OfficePointInput, b: OfficePointInput): number => {
  const left = pointFrom(a)
  const right = pointFrom(b)
  return Math.hypot(right.x - left.x, right.y - left.y)
}

const pointOnSegment = (
  point: Readonly<{ x: number; y: number }>,
  a: Readonly<{ x: number; y: number }>,
  b: Readonly<{ x: number; y: number }>,
  epsilon = 1e-6,
): boolean => {
  const cross = (point.y - a.y) * (b.x - a.x) - (point.x - a.x) * (b.y - a.y)
  if (Math.abs(cross) > epsilon) return false
  const dot = (point.x - a.x) * (b.x - a.x) + (point.y - a.y) * (b.y - a.y)
  if (dot < -epsilon) return false
  const lengthSquared = (b.x - a.x) ** 2 + (b.y - a.y) ** 2
  return dot <= lengthSquared + epsilon
}

export function pointInOfficePolygon(
  pointValue: OfficePointInput,
  polygonValue: OfficePolygon | readonly OfficePointTuple[],
): boolean {
  const point = pointFrom(pointValue)
  const points = 'points' in polygonValue ? polygonValue.points : polygonValue
  if (!isFinitePoint(point) || points.length < 3) {
    throw new TypeError('Office polygon needs at least three finite points')
  }

  let inside = false
  for (let index = 0, previous = points.length - 1; index < points.length; previous = index, index += 1) {
    const previousValue = points[previous]
    const currentValue = points[index]
    if (!previousValue || !currentValue) continue
    const a = pointFrom(previousValue)
    const b = pointFrom(currentValue)
    if (pointOnSegment(point, a, b)) return true
    const crosses = a.y > point.y !== b.y > point.y
      && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x
    if (crosses) inside = !inside
  }
  return inside
}

export function isOfficePointBlocked(pointValue: OfficePointInput): boolean {
  const point = pointFrom(pointValue)
  if (!isFinitePoint(point)) return true
  if (point.x < 0 || point.x >= OFFICE_NAV_WIDTH || point.y < 0 || point.y >= OFFICE_NAV_HEIGHT) return true
  if (!pointInOfficePolygon(point, OFFICE_NAV_WALKABLE_FLOOR.points)) return true
  return OFFICE_NAV_OBSTACLES.some(obstacle => pointInOfficePolygon(point, obstacle.points))
}

export function isOfficeFootAnchorBlocked(
  pointValue: OfficePointInput,
  {
    radiusX = OFFICE_NAV_FOOTPRINT.radiusX,
    radiusY = OFFICE_NAV_FOOTPRINT.radiusY,
    angularSamples = 16,
  }: Readonly<{ radiusX?: number; radiusY?: number; angularSamples?: number }> = {},
): boolean {
  const point = pointFrom(pointValue)
  if (!isFinitePoint(point) || isOfficePointBlocked(point)) return true
  if (radiusX < 0 || radiusY < 0 || !Number.isInteger(angularSamples) || angularSamples < 8) {
    throw new TypeError('Office foot-anchor clearance options are invalid')
  }
  for (let index = 0; index < angularSamples; index += 1) {
    const angle = index / angularSamples * Math.PI * 2
    if (isOfficePointBlocked({
      x: point.x + Math.cos(angle) * radiusX,
      y: point.y + Math.sin(angle) * radiusY,
    })) return true
  }
  return false
}

export function isOfficeFootSegmentWalkable(
  fromValue: OfficePointInput,
  toValue: OfficePointInput,
  sampleStep = 4,
  footprintOptions: Readonly<{ radiusX?: number; radiusY?: number; angularSamples?: number }> = {},
): boolean {
  const from = pointFrom(fromValue)
  const to = pointFrom(toValue)
  if (!isFinitePoint(from) || !isFinitePoint(to)) return false
  if (!Number.isFinite(sampleStep) || sampleStep <= 0) {
    throw new TypeError('Office foot segment sampleStep must be positive')
  }
  const samples = Math.max(1, Math.ceil(distance(from, to) / sampleStep))
  for (let index = 0; index <= samples; index += 1) {
    const t = index / samples
    if (isOfficeFootAnchorBlocked({
      x: from.x + (to.x - from.x) * t,
      y: from.y + (to.y - from.y) * t,
    }, footprintOptions)) return false
  }
  return true
}

type Adjacency = Map<string, { id: string; cost: number }[]>
const adjacencyCache = new Map<string, Adjacency>()

export interface OfficeRouteOptions {
  readonly allowWorkOnly?: boolean
  readonly actorObstacles?: readonly OfficeActorState[]
}

const clearsActorObstacles = (fromValue: OfficePointInput, toValue: OfficePointInput, actors: readonly OfficeActorState[]): boolean => {
  const from = pointFrom(fromValue), to = pointFrom(toValue)
  return actors.every(actor => actor.present === false || !calculateOfficeActorSweptOverlap(
    { footAnchor: from }, actor, { leftTo: to },
  ).overlapping)
}

const adjacencyFor = (allowWorkOnly: boolean): Adjacency => {
  const cacheKey = allowWorkOnly ? 'all' : 'ambient'
  const cached = adjacencyCache.get(cacheKey)
  if (cached) return cached
  const adjacency: Adjacency = new Map(Object.keys(OFFICE_NAV_NODES).map(id => [id, []]))
  for (const navEdge of OFFICE_NAV_EDGES) {
    if (!allowWorkOnly && navEdge.kind === 'work') continue
    if (!isOfficeFootSegmentWalkable(getNode(navEdge.from), getNode(navEdge.to))) continue
    adjacency.get(navEdge.from)?.push({ id: navEdge.to, cost: navEdge.cost })
    adjacency.get(navEdge.to)?.push({ id: navEdge.from, cost: navEdge.cost })
  }
  adjacencyCache.set(cacheKey, adjacency)
  return adjacency
}

export function findOfficeRoute(
  startNodeId: string,
  goalNodeId: string,
  { allowWorkOnly = false, actorObstacles = [] }: OfficeRouteOptions = {},
): OfficeRoute {
  const start = getNode(startNodeId)
  const goal = getNode(goalNodeId)
  if (!allowWorkOnly && (start.kind === 'work' || goal.kind === 'work')) {
    throw new Error('Workstation approach routes require allowWorkOnly: true')
  }

  const adjacency = adjacencyFor(allowWorkOnly)
  const open = new Set([startNodeId])
  const cameFrom = new Map<string, string>()
  const gScore = new Map<string, number>([[startNodeId, 0]])
  const fScore = new Map<string, number>([[startNodeId, distance(start, goal)]])

  while (open.size > 0) {
    const current = [...open].sort((left, right) =>
      (fScore.get(left) ?? Number.POSITIVE_INFINITY) - (fScore.get(right) ?? Number.POSITIVE_INFINITY)
      || left.localeCompare(right))[0]
    if (!current) break
    if (current === goalNodeId) {
      const nodeIds = [goalNodeId]
      let cursor = goalNodeId
      while (cursor !== startNodeId) {
        const previous = cameFrom.get(cursor)
        if (!previous) throw new Error(`Broken office navigation route: ${startNodeId} -> ${goalNodeId}`)
        cursor = previous
        nodeIds.push(cursor)
      }
      nodeIds.reverse()
      return Object.freeze({
        nodeIds: Object.freeze(nodeIds),
        points: Object.freeze(nodeIds.map(id => {
          const navNode = getNode(id)
          return freezePoint(navNode.x, navNode.y)
        })),
        distance: gScore.get(goalNodeId) ?? 0,
      })
    }

    open.delete(current)
    for (const neighbor of adjacency.get(current) ?? []) {
      if (!clearsActorObstacles(getNode(current), getNode(neighbor.id), actorObstacles)) continue
      const tentative = (gScore.get(current) ?? Number.POSITIVE_INFINITY) + neighbor.cost
      if (tentative >= (gScore.get(neighbor.id) ?? Number.POSITIVE_INFINITY)) continue
      cameFrom.set(neighbor.id, current)
      gScore.set(neighbor.id, tentative)
      fScore.set(neighbor.id, tentative + distance(getNode(neighbor.id), goal))
      open.add(neighbor.id)
    }
  }

  throw new Error(`No office navigation route: ${startNodeId} -> ${goalNodeId}`)
}

export function findWorkstationRoute(startNodeId: string, workstationId: OfficeWorkstationId): OfficeRoute {
  return findOfficeRoute(startNodeId, OFFICE_WORKSTATION_APPROACHES[workstationId].nodeId, {
    allowWorkOnly: true,
  })
}

const hashSeed = (seed: unknown): number => {
  const text = String(seed)
  let hash = 2166136261
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

export function getOfficeAmbientDelayMs(
  seed: unknown,
  { fast = false, initial = false }: Readonly<{ fast?: boolean; initial?: boolean }> = {},
): number {
  const minimum = fast ? 650 : initial ? 1_200 : 3_500
  const span = fast ? 550 : initial ? 1_200 : 4_500
  return minimum + hashSeed(`ambient-delay:${String(seed)}`) % span
}

export function selectDeterministicRoamTarget(
  seed: unknown,
  {
    fromNodeId = null,
    excludeNodeIds = [],
  }: Readonly<{ fromNodeId?: string | null; excludeNodeIds?: readonly string[] }> = {},
): OfficeActionPoint {
  const excluded = new Set(excludeNodeIds)
  if (fromNodeId) excluded.add(fromNodeId)
  const candidates = OFFICE_NAV_ACTION_POINTS.filter(action => !excluded.has(action.nodeId))
  if (candidates.length === 0) throw new Error('No office roam target remains after exclusions')
  const result = candidates[hashSeed(seed) % candidates.length]
  if (!result) throw new Error('Office roam target selection failed')
  return result
}

const projectPointToSegment = (
  point: Readonly<{ x: number; y: number }>,
  from: Readonly<{ x: number; y: number }>,
  to: Readonly<{ x: number; y: number }>,
) => {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const lengthSquared = dx * dx + dy * dy
  const raw = lengthSquared === 0 ? 0 : ((point.x - from.x) * dx + (point.y - from.y) * dy) / lengthSquared
  const t = Math.max(0, Math.min(1, raw))
  return { x: from.x + dx * t, y: from.y + dy * t, t }
}

function* walkableProjections(
  pointValue: OfficePointInput,
  { allowWorkOnly = false }: Readonly<{ allowWorkOnly?: boolean }> = {},
) {
  const point = pointFrom(pointValue)
  if (!isFinitePoint(point)) throw new TypeError('Office point coordinates must be finite')
  const sourceFootIsWalkable = !isOfficeFootAnchorBlocked(point)
  const candidates = OFFICE_NAV_EDGES
    .filter(navEdge => allowWorkOnly || navEdge.kind !== 'work')
    .map(navEdge => {
      const projected = projectPointToSegment(point, getNode(navEdge.from), getNode(navEdge.to))
      return {
        ...projected,
        distance: distance(point, projected),
        edgeId: navEdge.id,
        from: navEdge.from,
        to: navEdge.to,
      }
    })
    .sort((left, right) => left.distance - right.distance || left.edgeId.localeCompare(right.edgeId))

  for (const candidate of candidates) {
    if (!isOfficeFootAnchorBlocked(candidate)
      && (!sourceFootIsWalkable || isOfficeFootSegmentWalkable(point, candidate))) {
      yield Object.freeze(candidate)
    }
  }
}

export function projectToWalkable(
  pointValue: OfficePointInput,
  { allowWorkOnly = false }: Readonly<{ allowWorkOnly?: boolean }> = {},
) {
  const nearest = walkableProjections(pointValue, { allowWorkOnly }).next().value
  if (!nearest) throw new Error('Office navigation graph has no walkable edges')
  return nearest
}

const appendUniquePoint = (points: OfficePointTuple[], pointValue: OfficePointInput): void => {
  const point = pointFrom(pointValue)
  const previous = points.at(-1)
  if (previous && Math.abs(previous[0] - point.x) <= 1e-6 && Math.abs(previous[1] - point.y) <= 1e-6) return
  points.push(freezePoint(point.x, point.y))
}

export function findOfficeRouteFromPoint(
  startPointValue: OfficePointInput,
  goalNodeId: string,
  { allowWorkOnly = false, actorObstacles = [] }: OfficeRouteOptions = {},
): OfficeRoute {
  const startPoint = pointFrom(startPointValue)
  if (!isFinitePoint(startPoint) || isOfficeFootAnchorBlocked(startPoint)) {
    throw new Error('Office route start foot anchor must be on walkable floor')
  }
  let best: { route: OfficeRoute; projected: ReturnType<typeof projectToWalkable>; cost: number; nodeId: string } | undefined
  let nearestEntry = true
  for (const projected of walkableProjections(startPoint, { allowWorkOnly })) {
    const isNearestEntry = nearestEntry
    nearestEntry = false
    // Preserve a working nearest entry. Only when it is blocked compare the
    // total route cost of other authored entries, avoiding a whole-office
    // detour when a slightly farther entry gives a short local recovery.
    if (best && projected.distance >= best.cost) break
    if (!clearsActorObstacles(startPoint, projected, actorObstacles)) continue
    const selected = [projected.from, projected.to]
      .flatMap(nodeId => {
        // One projection endpoint may be behind an occupied desk approach. Try
        // the other endpoint before concluding that the whole office is blocked.
        if (!isOfficeFootSegmentWalkable(projected, getNode(nodeId))
          || !clearsActorObstacles(projected, getNode(nodeId), actorObstacles)) return []
        try {
          const route = findOfficeRoute(nodeId, goalNodeId, { allowWorkOnly, actorObstacles })
          return [{ route,
            cost: distance(startPoint, projected) + distance(projected, getNode(nodeId)) + route.distance,
            nodeId }]
        } catch {
          return []
        }
      })
      .sort((left, right) => left.cost - right.cost || left.nodeId.localeCompare(right.nodeId))[0]
    if (!selected) continue
    if (!best || selected.cost < best.cost) best = { ...selected, projected }
    if (isNearestEntry) break
  }
  if (!best) throw new Error(`No office route endpoint for: ${goalNodeId}`)

  const points: OfficePointTuple[] = []
  appendUniquePoint(points, startPoint)
  appendUniquePoint(points, best.projected)
  best.route.points.forEach(routePoint => appendUniquePoint(points, routePoint))
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1]
    const current = points[index]
    if (previous && current && !isOfficeFootSegmentWalkable(previous, current)) {
      throw new Error(`Unsafe office route connector: ${previous.join(',')} -> ${current.join(',')}`)
    }
  }
  return Object.freeze({
    nodeIds: best.route.nodeIds,
    points: Object.freeze(points),
    distance: points.slice(1).reduce((total, routePoint, index) => {
      const previous = points[index]
      return previous ? total + distance(previous, routePoint) : total
    }, 0),
  })
}

export function findWorkstationRouteFromPoint(
  startPointValue: OfficePointInput,
  workstationId: OfficeWorkstationId,
  { actorObstacles = [] }: Pick<OfficeRouteOptions, 'actorObstacles'> = {},
): OfficeRoute {
  return findOfficeRouteFromPoint(
    startPointValue,
    OFFICE_WORKSTATION_APPROACHES[workstationId].nodeId,
    { allowWorkOnly: true, actorObstacles },
  )
}

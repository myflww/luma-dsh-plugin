import { standingFigureHeight } from './officeFigureScale.ts'
import type { IndependentOfficeSpace, IndependentStation } from './generatedIndependentSpaceTypes.ts'
import type { IndependentFloorGraph } from './independentTaskArrival.ts'

type Point = readonly [number, number]
type Plan = { points: Readonly<Record<string, Point>>; edges: readonly (readonly [string, string])[]; seats: readonly string[]; approaches?: Readonly<Record<string, Point>> }
// Browser-only floor measurements of the five actual 1672x941 backgrounds.
// These are corridors around the desks, not straight entry-to-chair shortcuts.
export const BROWSER_OFFICE_FLOOR_PLANS: Readonly<Record<string, Plan>> = {
  'office.jingyuniang.v1': {
    points: { entry:[835,815], gate:[835,730], south:[835,680], bend:[760,630], mid:[680,570], west:[620,520], westTop:[590,430], top:[620,360], topMid:[830,350], topEast:[1040,370], east:[1080,470], eastInner:[1060,535], eastGap:[1160,550], eastLow:[1190,650], right:[1330,680], leftGap:[550,560], left:[520,600] },
    edges: [['entry','gate'],['gate','south'],['south','bend'],['bend','mid'],['mid','west'],['west','westTop'],['westTop','top'],['top','topMid'],['topMid','topEast'],['topEast','east'],['east','eastInner'],['eastInner','eastGap'],['eastGap','eastLow'],['eastLow','right'],['west','leftGap'],['leftGap','left']],
    seats: ['topMid','topMid','left','left','mid','south','eastLow','right','left'],
    approaches: { 'north-private':[750,350], 'north-center':[920,350], 'west-studio':[389,590] },
  },
  'office.claude.v1': {
    points: { entry:[835,815], gate:[835,735], south:[820,690], mid:[820,590], center:[815,490], upper:[820,400], top:[820,315], westTop:[740,435], west:[730,660], westLow:[440,710], east:[920,650], eastLow:[1250,690] },
    edges: [['entry','gate'],['gate','south'],['south','mid'],['mid','center'],['center','upper'],['upper','top'],['upper','westTop'],['south','west'],['west','westLow'],['south','east'],['east','eastLow']],
    seats: ['westTop','westTop','westTop','westLow','west','west','east','east','eastLow'],
  },
  'office.longmama.v1': {
    points: { entry:[835,815], gate:[835,715], south:[835,640], center:[835,515], top:[835,430], topWest:[700,430], topEast:[965,430], west:[620,590], westLow:[600,640], westBelow:[380,655], farWest:[180,490], westMiddle:[340,560], east:[1050,590], eastLow:[1070,640], eastBelow:[1290,655], eastMiddle:[1330,560], farEast:[1480,490] },
    edges: [['entry','gate'],['gate','south'],['south','center'],['center','top'],['top','topWest'],['top','topEast'],['center','west'],['west','westLow'],['westLow','westBelow'],['westBelow','westMiddle'],['westMiddle','farWest'],['center','east'],['east','eastLow'],['eastLow','eastBelow'],['eastBelow','eastMiddle'],['eastMiddle','farEast']],
    seats: ['topWest','top','topEast','farWest','farEast','westMiddle','westBelow','eastMiddle','eastBelow'],
  },
  'office.gemini.v1': {
    points: { entry:[835,815], gate:[835,735], gateLeft:[745,710], passLeft:[725,685], lowLeft:[585,685], left:[460,665], leftMid:[410,560], leftTop:[420,455], upperLeft:[510,345], top:[835,355], upperRight:[1160,345], rightTop:[1250,455], rightMid:[1260,560], right:[1210,665], lowRight:[1085,685], passRight:[945,685], gateRight:[925,710], center:[835,470], centerLeft:[735,495], centerRight:[935,495] },
    edges: [['entry','gate'],['gate','gateLeft'],['gateLeft','passLeft'],['passLeft','lowLeft'],['lowLeft','left'],['left','leftMid'],['leftMid','leftTop'],['leftTop','upperLeft'],['upperLeft','top'],['top','upperRight'],['upperRight','rightTop'],['rightTop','rightMid'],['rightMid','right'],['right','lowRight'],['lowRight','passRight'],['passRight','gateRight'],['gateRight','gate'],['top','center'],['center','centerLeft'],['center','centerRight']],
    seats: ['upperLeft','upperRight','centerLeft','centerLeft','centerRight','centerRight','lowLeft','gate','lowRight'],
    approaches: { 'north-private':[637,342], 'north-center':[1035,342], 'private-upper':[710,685], 'reception':[960,685] },
  },
  'office.grok.v1': {
    points: { entry:[835,815], gate:[835,765], lowLeft:[690,725], leftGate:[635,675], left:[520,650], leftMid:[520,590], leftTop:[570,550], center:[835,490], top:[835,350], rightTop:[1110,555], rightMid:[1150,600], right:[1150,640], rightGate:[1045,660], lowRight:[980,725], farLeft:[320,570], farRight:[1360,570] },
    edges: [['entry','gate'],['gate','lowLeft'],['lowLeft','leftGate'],['leftGate','left'],['left','leftMid'],['leftMid','leftTop'],['leftTop','center'],['center','top'],['center','rightTop'],['rightTop','rightMid'],['rightMid','right'],['right','rightGate'],['rightGate','lowRight'],['lowRight','gate'],['leftMid','farLeft'],['rightMid','farRight']],
    seats: ['farLeft','leftMid','leftTop','rightTop','rightMid','farRight','lowLeft','gate','lowRight'],
  },
}

export type BrowserIndependentFloorGraph = IndependentFloorGraph & { readonly spawnNodes: readonly string[]; readonly ambientNodes: readonly string[] }
export function withBrowserOfficeNavigation(space: IndependentOfficeSpace): IndependentOfficeSpace {
  const plan = BROWSER_OFFICE_FLOOR_PLANS[space.layout.theme]
  if (!plan) return space
  const relocate = (slot:IndependentStation):IndependentStation => {
    const approach = plan.approaches?.[slot.id]
    return approach ? { ...slot, approach, dropPolygon: [[approach[0]-38,approach[1]-24],[approach[0]+38,approach[1]-24],[approach[0]+38,approach[1]+24],[approach[0]-38,approach[1]+24]] } : slot
  }
  const original = space.layout.stations
  const stations:typeof original = [relocate(original[0]),relocate(original[1]),relocate(original[2]),relocate(original[3]),relocate(original[4]),relocate(original[5]),relocate(original[6]),relocate(original[7]),relocate(original[8])]
  const nodes: Record<string, { point: Point; bodyCoreHeightPx: number }> = Object.fromEntries(Object.entries(plan.points).map(([id,point]) => [id,{ point, bodyCoreHeightPx: standingFigureHeight(point[1]) }]))
  const edges = [...plan.edges], targets: Record<string,{approachNode:string;exitNode:string}> = {}
  stations.forEach((slot,index) => {
    const id = 'seat-' + slot.id, approach = slot.approach as Point
    nodes[id] = { point: approach, bodyCoreHeightPx: standingFigureHeight(approach[1]) }
    edges.push([plan.seats[index]!, id]); targets[slot.id] = { approachNode:id, exitNode:id }
  })
  const ambientNodes = Object.keys(plan.points).filter(id => id !== 'entry')
  const graph: BrowserIndependentFloorGraph = { schemaVersion:1, visualReviewed:true, sourceSize:[1672,941], entryNode:'entry', nodes, edges, targets,
    placementTheme:space.layout.theme, ambientNodes, spawnNodes: ambientNodes.filter(id => !['gate','top'].includes(id)).slice(0,8) }
  return { ...space, layout: { ...space.layout, stations, navigation: { ...space.layout.navigation, floorGraph:graph } } }
}

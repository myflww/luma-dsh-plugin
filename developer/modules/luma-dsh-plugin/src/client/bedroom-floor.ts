import { PERSONAL_BEDROOMS } from './bedroom-personal-layouts.ts'
import { mapShopBedrooms } from './bedroom-shop-layouts.ts'
import type { ShopBedroomId } from '../shared/shop-bedrooms.ts'
import type { Point, ResidentId } from './bedroom-routine.ts'

export type BedroomRoom = ResidentId | 'classic' | ShopBedroomId

// Sole-clearance silhouettes, traced in the shipped backgrounds' own pixel
// coordinates. Indents follow the bed frame, chair casters, planters and sofa.
const classicFloor: readonly Point[] = [
  [295,626], [318,612], [485,652], [645,566], [658,573], [651,635],
  [663,658], [665,684], [700,703], [742,703], [777,686], [791,652],
  [798,642], [870,661], [883,684], [911,686], [965,654], [979,633],
  [1076,661], [1099,695], [1136,703], [1178,696], [1203,673], [1261,677],
  [956,839],
]

const jingyuniangFloor: readonly Point[] = [
  [319,617], [401,610], [498,619], [605,582], [652,556], [657,519],
  [638,490], [598,462], [605,437], [678,415], [704,432], [776,446],
  [817,441], [844,424], [887,418], [927,397], [953,376], [1007,380],
  [1056,408], [1079,450], [1107,485], [1138,502], [1176,505], [1217,486],
  [1243,467], [1302,490], [1366,500], [1398,530], [1366,549], [1293,535],
  [1169,539], [1089,556], [1034,582], [993,627], [971,678], [962,709],
  [908,730], [887,772], [793,784], [688,795], [671,756], [657,697],
  [619,659], [535,636], [471,638], [406,645],
]

const longmamaFloor: readonly Point[] = [
  [256,662], [308,647], [413,648], [516,613], [575,568], [589,530],
  [568,498], [549,476], [596,451], [607,424], [685,396], [742,415],
  [847,417], [931,394], [995,401], [1028,448], [1074,457], [1108,497],
  [1140,525], [1199,530], [1236,502], [1279,532], [1269,568], [1222,573],
  [1176,554], [1128,546], [1082,556], [1034,596], [1002,629], [988,676],
  [983,706], [929,723], [899,744], [889,842], [688,842], [678,755],
  [640,723], [591,722], [540,711], [491,690], [441,685], [380,697],
  [336,692],
]

const claudeFloor: readonly Point[] = [
  [183,629], [256,615], [329,654], [436,685], [465,709], [551,709],
  [620,692], [701,662], [715,640], [706,601], [678,575], [615,533],
  [554,500], [594,483], [648,460], [701,451], [732,425], [777,436],
  [819,444], [880,467], [948,491], [1028,526], [1075,542], [1077,615],
  [1098,654], [1171,668], [1201,661], [1213,678], [1243,695], [1300,692],
  [1325,678], [1361,688], [1297,732], [1154,790], [1138,824], [997,873],
  [817,810], [784,776], [741,769], [730,819], [587,866],
]

const geminiFloor: readonly Point[] = [
  [202,600], [256,598], [324,600], [387,612], [460,622], [544,594],
  [622,549], [659,521], [652,485], [601,467], [573,450], [612,439],
  [673,443], [702,457], [756,464], [821,462], [866,446], [934,446],
  [992,460], [1039,464], [1051,502], [1077,530], [1117,530], [1129,570],
  [1156,598], [1206,601], [1248,584], [1281,572], [1319,589], [1309,620],
  [1264,647], [1234,674], [1168,680], [1112,697], [1060,718], [1009,711],
  [971,706], [960,779], [617,781], [610,708], [565,706], [526,718],
  [471,695], [415,692], [366,669], [308,648], [265,629],
]

const grokFloor: readonly Point[] = [
  [190,636], [253,622], [347,643], [418,664], [488,655], [631,610],
  [692,586], [688,533], [652,495], [633,478], [669,460], [720,453],
  [774,457], [840,457], [906,460], [985,479], [1049,483], [1068,518],
  [1086,540], [1133,561], [1182,554], [1213,539], [1305,566], [1339,593],
  [1319,613], [1286,626], [1227,615], [1176,605], [1147,587], [1098,580],
  [1053,575], [1006,587], [983,607], [962,603], [938,613], [908,641],
  [891,685], [889,723], [927,755], [924,796], [857,824], [622,810],
  [608,753], [589,722], [530,701], [439,692], [326,678], [253,666],
]

export const BEDROOM_WALKABLE: Record<BedroomRoom, readonly Point[]> = {
  ...mapShopBedrooms(layout=>layout.walkable),
  classic:classicFloor, shan:PERSONAL_BEDROOMS['shan'].walkable, 'bai-shuangming':PERSONAL_BEDROOMS['bai-shuangming'].walkable, 'lu-mi':PERSONAL_BEDROOMS['lu-mi'].walkable,
  jingyuniang:jingyuniangFloor, longmama:longmamaFloor, claude:claudeFloor, gemini:geminiFloor, grok:grokFloor,
}
const cross=(a:Point,b:Point)=>a[0]*b[1]-a[1]*b[0]
const sub=(a:Point,b:Point):Point=>[a[0]-b[0],a[1]-b[1]]
export const floorDistance=(a:Point,b:Point)=>Math.hypot(a[0]-b[0],a[1]-b[1])
export const floorMix=(a:Point,b:Point,t:number):Point=>[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t]
function edgeFoot(p:Point,a:Point,b:Point) {
  const dx=b[0]-a[0],dy=b[1]-a[1]
  const t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(dx*dx+dy*dy || 1)))
  return floorMix(a,b,t)
}
export function bedroomFloorContains(polygon:readonly Point[],p:Point) {
  let inside=false
  for(let i=0,j=polygon.length-1;i<polygon.length;j=i++) {
    const a=polygon[j]!,b=polygon[i]!
    if(floorDistance(edgeFoot(p,a,b),p)<1e-5) return true
    if((a[1]>p[1])!==(b[1]>p[1]) && p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0]) inside=!inside
  }
  return inside
}
export function placeOnBedroomFloor(room:BedroomRoom,point:Point):Point {
  const polygon=BEDROOM_WALKABLE[room]
  if(bedroomFloorContains(polygon,point)) return point
  let best=polygon[0]!,distance=Infinity
  for(let i=0;i<polygon.length;i++){
    const candidate=edgeFoot(point,polygon[i]!,polygon[(i+1)%polygon.length]!)
    const d=floorDistance(point,candidate)
    if(d<distance){distance=d;best=candidate}
  }
  return best
}

/** The midpoint of each boundary-delimited interval must lie inside. This also
 * admits travel along a polygon edge and through a concave vertex. */
function visible(polygon:readonly Point[],from:Point,to:Point) {
  const travel=sub(to,from), lengthSquared=travel[0]**2+travel[1]**2
  if(lengthSquared<1e-12) return true
  const cuts=[0,1]
  for(let i=0;i<polygon.length;i++){
    const a=polygon[i]!, edge=sub(polygon[(i+1)%polygon.length]!,a), delta=sub(a,from)
    const determinant=cross(travel,edge)
    if(Math.abs(determinant)>1e-8){
      const t=cross(delta,edge)/determinant,u=cross(delta,travel)/determinant
      if(t>0 && t<1 && u>=-1e-7 && u<=1+1e-7) cuts.push(t)
    } else if(Math.abs(cross(delta,travel))<1e-6) {
      const t=(delta[0]*travel[0]+delta[1]*travel[1])/lengthSquared
      if(t>0 && t<1) cuts.push(t)
    }
  }
  cuts.sort((a,b)=>a-b)
  for(let i=1;i<cuts.length;i++){
    if(cuts[i]!-cuts[i-1]!>1e-8 && !bedroomFloorContains(polygon,floorMix(from,to,(cuts[i]!+cuts[i-1]!)/2))) return false
  }
  return true
}
type Link = { to:number; length:number }
const graphs=new WeakMap<readonly Point[], Link[][]>()
function graphFor(polygon:readonly Point[]) {
  const cached=graphs.get(polygon)
  if(cached) return cached
  const graph:Link[][]=polygon.map(()=>[])
  for(let a=0;a<polygon.length;a++)for(let b=0;b<a;b++){
    if(!visible(polygon,polygon[a]!,polygon[b]!)) continue
    const length=floorDistance(polygon[a]!,polygon[b]!)
    graph[a]!.push({to:b,length});graph[b]!.push({to:a,length})
  }
  graphs.set(polygon,graph)
  return graph
}
export function bedroomFloorRoute(room:BedroomRoom,start:Point,end:Point):Point[] {
  const polygon=BEDROOM_WALKABLE[room]
  if(visible(polygon,start,end)) return [start,end]
  const graph=graphFor(polygon), cost=polygon.map(p=>visible(polygon,start,p)?floorDistance(start,p):Infinity)
  const previous=polygon.map(()=>-1), seen=new Set<number>()
  let best=Infinity, last=-1
  while(seen.size<polygon.length){
    let nearest=-1, length=Infinity
    for(let i=0;i<cost.length;i++) if(!seen.has(i) && cost[i]!<length){nearest=i;length=cost[i]!}
    if(nearest<0 || length>=best) break
    seen.add(nearest)
    const p=polygon[nearest]!, total=length+floorDistance(p,end)
    if(total<best && visible(polygon,p,end)){best=total;last=nearest}
    for(const link of graph[nearest]!){
      const next=length+link.length
      if(next<cost[link.to]!){cost[link.to]=next;previous[link.to]=nearest}
    }
  }
  if(last<0) throw Error('卧室行走区域未连通')
  const reverse:Point[]=[end]
  for(let i=last;i>=0;i=previous[i]!) reverse.push(polygon[i]!)
  return [start,...reverse.reverse()]
}

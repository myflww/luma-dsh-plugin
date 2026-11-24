import type { IndependentFloorGraph } from './independentTaskArrival.ts'
import { nearestFloorPoint, type ScenePoint as Point } from './scenePlacement.ts'

// Open-floor fans measured on the five 1672 × 941 illustrations. Each named
// node sees the whole patch; its connector never crosses the desk islands.
const floors:Record<string,Record<string,readonly Point[]>>={
  'office.jingyuniang.v1':{
    gate:[[702,726],[740,651],[855,619],[959,651],[958,703],[903,768],[900,824],[744,824]],
    westTop:[[472,402],[552,359],[696,372],[694,400],[634,469],[571,493],[513,459]],
    eastInner:[[1014,443],[1083,419],[1131,432],[1105,489],[1093,565],[1040,592],[1003,553]],
    mid:[[611,504],[662,477],[725,508],[794,568],[872,604],[810,631],[682,601]],
  },
  'office.claude.v1':{
    center:[[762,390],[843,353],[919,352],[913,419],[880,467],[890,537],[940,587],[852,600],[733,539],[715,482]],
    south:[[690,560],[819,571],[972,602],[1060,636],[1081,697],[945,700],[911,820],[715,820],[713,704],[640,648]],
    eastLow:[[1004,611],[1139,624],[1247,624],[1354,653],[1327,686],[1147,700],[1030,671]],
    top:[[791,294],[892,286],[942,308],[908,354],[847,386],[801,392]],
  },
  'office.longmama.v1':{
    center:[[686,415],[790,391],[900,394],[1020,423],[1080,456],[1076,510],[1020,571],[957,604],[721,605],[634,556],[630,483]],
    gate:[[724,575],[946,575],[1012,625],[967,674],[924,695],[921,831],[744,831],[741,703],[648,670],[657,623]],
    farWest:[[132,412],[224,390],[272,432],[281,513],[314,558],[269,616],[208,585],[147,535]],
    farEast:[[1386,412],[1477,392],[1533,429],[1521,534],[1456,589],[1393,583],[1364,531]],
  },
  'office.gemini.v1':{
    center:[[741,404],[803,362],[873,368],[960,408],[1005,460],[1000,510],[948,541],[795,536],[702,507],[659,469]],
    leftMid:[[292,441],[405,424],[458,445],[434,503],[475,558],[553,619],[533,658],[423,643],[318,588],[275,523]],
    rightMid:[[1222,440],[1302,427],[1393,441],[1394,535],[1354,605],[1268,648],[1135,652],[1123,616],[1204,552]],
    gate:[[749,689],[785,670],[887,670],[931,699],[912,811],[749,811]],
  },
  'office.grok.v1':{
    center:[[755,363],[816,345],[902,358],[949,395],[943,463],[920,529],[875,545],[765,538],[726,475],[720,409]],
    leftTop:[[451,510],[532,496],[643,506],[690,549],[626,604],[559,654],[493,653],[457,606]],
    rightTop:[[1038,512],[1154,499],[1253,512],[1251,584],[1184,642],[1095,653],[1063,608],[1003,560]],
    gate:[[725,711],[782,700],[891,700],[951,712],[933,824],[739,824]],
  },
}
export function independentDropFloor(graph:IndependentFloorGraph, requested:Point) {
  const patches=floors[graph.placementTheme ?? '']
  if(!patches) return undefined
  let best:{point:Point;anchor:Point;height:number}|undefined
  let distance=Infinity
  const consider=(point:Point,anchor:Point,height:number)=>{
    const d=Math.hypot(requested[0]-point[0],requested[1]-point[1])
    if(d<distance){best={point,anchor,height};distance=d}
  }
  for(const [id,perimeter] of Object.entries(patches)){
    const node=graph.nodes[id]; if(!node) continue
    for(let i=0;i<perimeter.length;i++){
      const triangle=[node.point,perimeter[i]!,perimeter[(i+1)%perimeter.length]!] as const
      const [a,b,c]=triangle
      if(Math.abs((b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]))<.001) continue
      const sides=triangle.map((a,j)=>[a,triangle[(j+1)%3]!] as const)
      const turns=sides.map(([a,b])=>(b[0]-a[0])*(requested[1]-a[1])-(b[1]-a[1])*(requested[0]-a[0]))
      if(turns.every(x=>x>=-.001)||turns.every(x=>x<=.001)) return {point:requested,anchor:node.point,height:node.bodyCoreHeightPx}
      consider(nearestFloorPoint(requested,sides)!,node.point,node.bodyCoreHeightPx)
    }
  }
  for(const [a,b] of graph.edges){
    const n=graph.nodes[a]!,m=graph.nodes[b]!
    const anchor=nearestFloorPoint(requested,[[n.point,m.point]])!
    const dx=requested[0]-anchor[0],dy=requested[1]-anchor[1],length=Math.hypot(dx,dy)
    const width=a.startsWith('seat-')||b.startsWith('seat-')?9:19
    const amount=length>width?width/length:1
    const along=Math.hypot(anchor[0]-n.point[0],anchor[1]-n.point[1])/Math.hypot(m.point[0]-n.point[0],m.point[1]-n.point[1])
    consider([anchor[0]+dx*amount,anchor[1]+dy*amount],anchor,n.bodyCoreHeightPx+(m.bodyCoreHeightPx-n.bodyCoreHeightPx)*along)
  }
  return best
}

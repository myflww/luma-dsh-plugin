import sources from './roomSeated.generated.json'

export type RoomSeatAngle='rear'|'shallowLeft'|'shallowRight'|'sideLeft'|'sideRight'|'quarterLeft'|'quarterRight'|'front'
type Point=readonly [number,number]
export interface RoomSeatedDrawing {
  src:string
  sha256:string
  sourceSrc:string
  sourceSha256:string
  cell:Point
  count:number
  figureHeight:number
  crownWidth:number
  head:Point
  hip:Point
  hand:Point
  foot:Point
}

const wardrobe=sources as unknown as Readonly<Record<string,Readonly<Record<RoomSeatAngle,RoomSeatedDrawing>>>>
export function getRoomSeatedDrawing(role:string,skinId:string|undefined,angle:RoomSeatAngle){
  if(skinId && skinId!=='skin.'+role+'.v1')return undefined
  const outfit=skinId || role==='gemini' || role==='grok'?'v1':'base'
  return wardrobe[role+'-'+outfit]?.[angle]
}

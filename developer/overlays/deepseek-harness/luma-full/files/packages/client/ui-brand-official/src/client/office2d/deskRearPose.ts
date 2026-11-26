import poses from './deskRearPoses.generated.json'

type Point=readonly [number,number]
export interface DeskView {
  readonly hip:Point
  readonly head:Point
  readonly palms:readonly [Point,Point]
  readonly ankleLine:number
  readonly headHeight:number
  readonly knee:Point
  readonly sole:Point
  readonly soleY:number
}
interface DeskRearPose {
  readonly src:string
  readonly sha256:string
  readonly cell:readonly [number,number]
  readonly count:number
  readonly preferOblique:boolean
  readonly rear:DeskView
  readonly oblique:DeskView
}

/** The outfit's two complete, painted seated views share one skull scale. */
export function getDeskRearPose(role:string,skinId?:string):DeskRearPose|undefined {
  if(skinId && skinId!=='skin.'+role+'.v1') return undefined
  const variant=skinId || role==='gemini' || role==='grok'?'v1':'base'
  return (poses as unknown as Readonly<Record<string,DeskRearPose>>)[role+'-'+variant]
}

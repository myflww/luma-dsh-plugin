import poses from './deskRearPoses.generated.json'

type Point=readonly [number,number]
export interface DeskView {
  readonly hip:Point
  readonly head:Point
  /** Projected keyboard contacts. A straight rear view can completely hide the wrists. */
  readonly palms:readonly [Point,Point]
  readonly wristsOccluded?:boolean
  readonly forearm:string
  readonly nearElbow:Point
  readonly cuffRadius:number
  readonly ankleLine:number
  readonly headHeight:number
  readonly knee:Point
  readonly sole:Point
  readonly soleY:number
}
export interface JointDeskView extends DeskView {
  readonly src:string
  readonly cell:readonly [number,number]
  readonly hands:readonly [number,number,number,number]
  readonly imageSize:readonly [number,number]
  readonly nightTint:readonly [number,number,number]
  readonly castors:readonly Point[]
  readonly rail:Point
}
interface DeskRearPose {
  readonly joints?:Readonly<Record<string,JointDeskView>>
  readonly src:string
  readonly sha256:string
  readonly cell:readonly [number,number]
  readonly count:number
  readonly preferOblique:boolean
  readonly rear:DeskView
  readonly highOblique?:DeskView & {readonly src:string;readonly sha256:string}
  readonly shallow?:DeskView
  readonly oblique:DeskView
}

/** The outfit's two complete, painted seated views share one skull scale. */
export function getDeskRearPose(role:string,skinId?:string):DeskRearPose|undefined {
  if(skinId && skinId!=='skin.'+role+'.v1') return undefined
  const variant=skinId || role==='gemini' || role==='grok'?'v1':'base'
  return (poses as unknown as Readonly<Record<string,DeskRearPose>>)[role+'-'+variant]
}

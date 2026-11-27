import looks from './actorLookAtlas.generated.json'

export interface ActorLookAtlas {
  readonly src: string
  readonly sha256: string
  readonly cell: readonly [number, number]
  readonly columns: number
  readonly count: number
  readonly figureHeight: number
  readonly foot: readonly [number, number]
  readonly grip: readonly [number, number]
  readonly eyeCenter: readonly [number, number]
  readonly neutralIndex: number
  // The small second sheet has one row per head orientation and one column
  // per independent gaze. Draw the patch at eyesOrigin in the full cel.
  readonly eyesSrc: string
  readonly eyesSha256: string
  readonly eyesCell: readonly [number, number]
  readonly eyesOrigin: readonly [number, number]
}

export function getActorLookAtlas(role: string, skinId?: string): ActorLookAtlas | undefined {
  if (skinId && skinId !== 'skin.' + role + '.v1') return undefined
  const variant = skinId || role === 'gemini' || role === 'grok' ? 'v1' : 'base'
  return (looks as unknown as Readonly<Record<string, ActorLookAtlas>>)[role + '-' + variant]
}

export {actorLookFrame} from './postDropLook.ts'

// The transparent patch replaces individual source pixels. Assemble it at 1:1
// before a scene transform, so the original iris is filtered only once.
export function drawActorLook(context:CanvasRenderingContext2D,art:ActorLookAtlas,
  headImage:CanvasImageSource,head:number,eyesImage:CanvasImageSource|undefined,eyes:number) {
  const [w,h]=art.cell
  context.clearRect(0,0,w,h)
  context.drawImage(headImage,head%art.columns*w,Math.floor(head/art.columns)*h,w,h,0,0,w,h)
  if(eyesImage && eyes!==head){
    const [ew,eh]=art.eyesCell
    context.drawImage(eyesImage,eyes*ew,head*eh,ew,eh,...art.eyesOrigin,ew,eh)
  }
}

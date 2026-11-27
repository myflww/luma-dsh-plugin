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

// Both axes refer to the source drawing. Positive values look right and down.
// Mirror x before lookup when the caller has horizontally mirrored the drawing.
export function actorLookFrame(x: number, y: number): number {
  const step = (n: number) => Number.isFinite(n) ? Math.round((Math.min(1, Math.max(-1, n)) + 1) * 2) : 2
  return step(y) * 5 + step(x)
}

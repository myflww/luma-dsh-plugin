import gestures from './actorGestureAtlas.generated.json'

export interface ActorGesture {
  readonly id: string
  readonly frames: readonly number[]
  readonly durationsMs: readonly number[]
}

export interface ActorGestureAtlas {
  readonly src: string
  readonly sha256: string
  readonly cell: readonly [number, number]
  readonly columns: number
  readonly count: number
  readonly figureHeight: number
  readonly foot: readonly [number, number]
  readonly grip: readonly [number, number]
  readonly actions: readonly ActorGesture[]
}

export function getActorGestureAtlas(role: string, skinId?: string): ActorGestureAtlas | undefined {
  if (skinId && skinId !== 'skin.' + role + '.v1') return undefined
  const variant = skinId || role === 'gemini' || role === 'grok' ? 'v1' : 'base'
  return (gestures as unknown as Readonly<Record<string, ActorGestureAtlas>>)[role + '-' + variant]
}

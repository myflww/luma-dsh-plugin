import poses from './actorPoseAtlas.generated.json'

export interface ActorPoseAtlas {
  readonly src: string
  readonly sha256: string
  readonly cell: readonly [number, number]
  readonly columns: number
  readonly count: number
  readonly figureHeight: number
  readonly foot: readonly [number, number]
  readonly grip: readonly [number, number]
  readonly eyes: readonly (readonly [number, number, number, number])[]
  readonly faceOffsets?: readonly (readonly [number, number])[]
  readonly idleEyes?: readonly (readonly (readonly [number, number, number, number])[])[]
  readonly idleDurationsMs: readonly number[]
}

export function getActorPoseAtlas(role: string, skinId?: string): ActorPoseAtlas | undefined {
  if (skinId && skinId !== 'skin.' + role + '.v1') return undefined
  const variant = skinId || role === 'gemini' || role === 'grok' ? 'v1' : 'base'
  return (poses as unknown as Readonly<Record<string, ActorPoseAtlas>>)[role + '-' + variant]
}

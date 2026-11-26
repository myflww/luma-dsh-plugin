import poses from './deskRearPoses.generated.json'

interface DeskRearPose {
  readonly src: string
  readonly sha256: string
  readonly cell: readonly [number, number]
  readonly count: number
  readonly hip: readonly [number, number]
  readonly hand: readonly [number, number]
  readonly head: readonly [number, number]
  readonly bodyHeight: number
}

/** Back-facing typing art with no chair or keyboard, in the selected outfit. */
export function getDeskRearPose(role: string, skinId?: string): DeskRearPose | undefined {
  if (skinId && skinId !== 'skin.' + role + '.v1') return undefined
  const variant = skinId || role === 'gemini' || role === 'grok' ? 'v1' : 'base'
  return (poses as unknown as Readonly<Record<string, DeskRearPose>>)[role + '-' + variant]
}

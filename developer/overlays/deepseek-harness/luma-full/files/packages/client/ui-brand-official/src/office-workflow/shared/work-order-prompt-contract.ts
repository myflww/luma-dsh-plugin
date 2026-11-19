/** Shared prompt data accepted by the existing Host work-order boundary. */
/** Image formats accepted by Harness' public prompt contract. */
export const PORTRAIT_IMAGE_MEDIA_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
] as const

export type PortraitImageMediaType = typeof PORTRAIT_IMAGE_MEDIA_TYPES[number]

export interface PortraitComposerConfiguration {
  readonly provider: string
  readonly model: string
  readonly reasoningEffort?: string
  /** Saved role binding confirmed by the composer; stale and legacy requests fail closed. */
  readonly characterAIProfileRevision?: number
  readonly permissionPreset?: string
  /** Explicit acknowledgement required before Full access can cross the UI boundary. */
  readonly fullAccessAcknowledged?: boolean
}

/** Browser-owned image bytes encoded for Harness' public prompt contract. */
export interface PortraitComposerImage {
  readonly mediaType: PortraitImageMediaType
  readonly data: string
  readonly name?: string
}


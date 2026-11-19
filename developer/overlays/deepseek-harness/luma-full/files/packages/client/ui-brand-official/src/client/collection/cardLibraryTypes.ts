/** A completed artwork edition. Personal selections belong to its immutable workId@revision key. */
export interface CardEditionDefinition {
  readonly key: string
  readonly workId: string
  readonly revision: string
  readonly name: string
  readonly alt: string
  readonly character: string
  readonly characterId?: string
  readonly skin: string
  readonly series: string
  readonly seriesId?: string
  readonly edition: 'standard' | 'errata'
  /** Reviewed collecting tier; existing acquired instances retain their original tier snapshot. */
  readonly rarity?: 'N' | 'R' | 'SR' | 'SSR'
  /** Retained same-artwork edition excluded from new sales; never silently reclassifies it as errata. */
  readonly duplicateOf?: string
  readonly versionLabel: string
  readonly width: number
  readonly height: number
  readonly frontUrl: string
  readonly backUrl?: string
  readonly backWidth?: number
  readonly backHeight?: number
  readonly frontSha256?: string
  readonly backSha256?: string
  readonly createdAt: string
  /** Retained immutable artwork revision; still reachable through versions and personal collections. */
  readonly historicalRevision?: boolean
  /** Exact prior drawing provenance; does not hide, reclassify or redirect ownership of the old edition. */
  readonly supersedesEditionKey?: string
  readonly supersedesFrontSha256?: string
  /** Exact same-artwork revision supplying completed backs and synchronized craft; does not transfer ownership. */
  readonly presentationKey?: string
  /** Describes an existing artifact; does not award or request a new craft. */
  readonly craftLabel?: string
  readonly legacyViewerUrl?: string
  /** Exact locally packaged frozen craft document, bound to the edition key. */
  readonly viewerUrl?: string
  readonly viewerKind?: 'craft' | 'print'
  /** Producer-verified missing-craft supplement; ready must authenticate both original scene and supplement. */
  readonly craftSupplement?: Readonly<{ version: 'regional-foil-v1' | 'surface-relief-v1'; capabilityUrl: string; capabilitySha256: string }>
  /** Authored same-canvas background and transparent whole-character art. */
  readonly layers?: Readonly<{ background: string; subject: string }>
}

export interface CardPersonalSettings {
  readonly favorite: boolean
  readonly rating: number | null
  readonly note: string
}

export interface CardLibraryAlbum {
  readonly id: string
  readonly name: string
  readonly versionKeys: readonly string[]
}

export type CardLibraryRejectionReason = 'disposed' | 'persistence-unavailable' | 'persistence-conflict'
  | 'future-data' | 'invalid-data' | 'unknown-card' | 'invalid-input'

export type CardLibraryResult = Readonly<{ status: 'saved' | 'unchanged' }>
  | Readonly<{ status: 'rejected'; reason: CardLibraryRejectionReason; message: string }>

export interface CardLibrarySnapshot {
  readonly status: 'loading' | 'ready' | 'unavailable'
  readonly persistence: 'host' | 'memory'
  readonly durable: boolean
  readonly writable: boolean
  readonly preferences: Readonly<Record<string, CardPersonalSettings>>
  readonly albums: readonly CardLibraryAlbum[]
  readonly pendingCount: number
  readonly sourceRevision?: number
  readonly issue?: Readonly<{ reason: CardLibraryRejectionReason; message: string }>
}

export interface CardLibraryActions {
  setFavorite(key: string, favorite: boolean): Promise<CardLibraryResult>
  setRating(key: string, rating: number | null): Promise<CardLibraryResult>
  setNote(key: string, note: string): Promise<CardLibraryResult>
  saveAlbum(album: CardLibraryAlbum): Promise<CardLibraryResult>
  removeAlbum(id: string): Promise<CardLibraryResult>
  /** Re-read the scope's current Host snapshot and clear a recoverable operation issue. */
  load(): void
}

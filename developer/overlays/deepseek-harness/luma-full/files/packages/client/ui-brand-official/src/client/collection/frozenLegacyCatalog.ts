/** Historical compatibility facts, not a live release catalog or new reward policy. */
export const LEGACY_COLLECTION_BASELINE = 'legacy-20260908'
export const LEGACY_COLLECTION_SERIES_ID = 'legacy-rose-night'

export interface FrozenLegacyCard {
  readonly designId: string
  readonly printedNumber: string
  readonly requiredAcceptedReports: number
  readonly seriesId: typeof LEGACY_COLLECTION_SERIES_ID
  readonly releaseVersion: typeof LEGACY_COLLECTION_BASELINE
  readonly artworkRef: Readonly<{ artworkId: string; artworkRevision: 1 }>
  /** A source locator, not a claim that the runtime asset URL is immutable storage. */
  readonly sourceAssetUrl: string
}

// Deliberately independent of catalog.ts: a future catalog edit must not rewrite history.
const rows = [
  ['lumi-prologue', 'RN-001', 0, 'lumi-title-scene'],
  ['lumi-base', 'RN-002', 1, 'lumi-original'],
  ['lumi-silver', 'RN-003', 3, 'lumi-standing'],
  ['orlan-portrait', 'RN-004', 5, 'orlan'],
  ['liya-portrait', 'RN-005', 7, 'liya'],
  ['moonlit-portico', 'RN-006', 10, 'portico'],
  ['luna-portrait', 'RN-007', 14, 'luna'],
  ['ayan-portrait', 'RN-008', 18, 'ayan'],
  ['lumi-gold', 'RN-009', 22, 'lumi-fox-mask'],
  ['deep-rift', 'RN-010', 26, 'deep-rift'],
  ['rift-maw', 'RN-011', 30, 'rift-maw'],
  ['night-warden', 'RN-012', 35, 'night-warden'],
  ['memory-dust', 'RN-013', 40, 'memory-dust'],
  ['rift-guard', 'RN-014', 45, 'rift-guard'],
  ['rift-archon', 'RN-015', 50, 'rift-archon'],
  ['eclipse-sanctum', 'RN-016', 60, 'sanctum'],
  ['gatekeeper', 'RN-017', 75, 'gatekeeper'],
  ['lumi-ruic-atelier', 'RN-018', 12, 'lumi-atelier-front'],
  ['lumi-chibi', 'RN-019', 2, 'lumi-chibi'],
  ['duanmu-original', 'RN-020', 4, 'duanmu-original'],
  ['duanmu-chibi', 'RN-021', 6, 'duanmu-chibi'],
  ['duanmu-gothic', 'RN-022', 16, 'duanmu-gothic'],
  ['bai-chibi', 'RN-023', 8, 'bai-chibi'],
  ['bai-butterfly-chibi', 'RN-024', 11, 'bai-butterfly-chibi'],
  ['bai-butterfly', 'RN-025', 20, 'bai-butterfly'],
  ['bai-bridal', 'RN-026', 24, 'bai-bridal'],
] as const

/** All twenty-six existing identities; none of the three new Lumi cards is issued here. */
export const FROZEN_LEGACY_CATALOG: readonly FrozenLegacyCard[] = Object.freeze(rows.map(
  ([designId, printedNumber, requiredAcceptedReports, file]) => Object.freeze({
    designId, printedNumber, requiredAcceptedReports,
    seriesId: LEGACY_COLLECTION_SERIES_ID,
    releaseVersion: LEGACY_COLLECTION_BASELINE,
    artworkRef: Object.freeze({ artworkId: `${LEGACY_COLLECTION_BASELINE}/${designId}`, artworkRevision: 1 as const }),
    sourceAssetUrl: `/luma-collection/${file}.png`,
  }),
))

/** Local collection milestones derived from explicit acceptance of real Harness reports. */

/** Dedicated collection settings namespace; never shares an office relationship document. */
export const COLLECTION_SETTINGS_NAMESPACE = 'luma-collection'
/** Scalar field for the selected workbench card. */
export const COLLECTION_DISPLAY_FIELD = 'display'
/** Prefix for canonical, independently patched report receipt fields. */
export const COLLECTION_RECEIPT_PREFIX = 'receipt_'

/** A catalog entry owns presentation assets, never task content or a random reward table. */
export interface CollectionCardDefinition {
  readonly id: string
  readonly title: string
  readonly artUrl: string
  readonly requiredAcceptedReports: number
}

/** Immutable evidence that a user accepted one normal Harness assistant terminal. */
export interface CollectionReceiptV1 {
  readonly schemaVersion: 1
  readonly reportId: string
  readonly employeeId: string
  readonly sessionId: string
  readonly terminalSequence: number
  readonly acceptedAt: number
  readonly completedAt?: number
}

/** Optional display choice, kept separate from independent immutable receipt fields. */
export interface CollectionDisplayV1 {
  readonly schemaVersion: 1
  readonly featuredCardId?: string
}

/** Every report is a separate namespace field so one write cannot replace another receipt. */
export type CollectionSettings = Readonly<Record<string, CollectionReceiptV1 | CollectionDisplayV1>>

/** Minimum report facts needed by the collection; prompts, answers and file paths are excluded. */
export interface CollectionReportEvidence {
  readonly reportId: string
  readonly employeeId: string
  readonly sessionId: string
  readonly taskStatus?: string
  readonly completedAt?: number
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
}

function identifier(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.trim() === value
    && !/[\u0000-\u001f\u007f]/u.test(value)
    && !/[\uD800-\uDFFF]/u.test(value)
}

function timestamp(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

/** Encode the entire report id as one path segment; encoding is injective, not a lossy slug.
 * @param reportId - stable Harness session/terminal identity.
 * @returns the scalar namespace field used for this receipt.
 */
export function collectionReceiptField(reportId: string): string {
  return `${COLLECTION_RECEIPT_PREFIX}${encodeURIComponent(reportId)}`
}

/** Validate an actual successful terminal, not the office's unread-completion marker.
 * @param report - facts obtained from the current Harness report projection.
 * @returns the observed terminal sequence, or undefined when no accepted evidence exists.
 */
export function collectionTerminalSequence(report: CollectionReportEvidence): number | undefined {
  if (report.taskStatus !== 'completed' || !identifier(report.employeeId)
    || !identifier(report.sessionId) || !identifier(report.reportId)) return undefined
  const prefix = `harness:${report.sessionId}:turn:`
  if (!report.reportId.startsWith(prefix)) return undefined
  const suffix = report.reportId.slice(prefix.length)
  if (!/^(0|[1-9]\d*)$/u.test(suffix)) return undefined
  const sequence = Number(suffix)
  return Number.isSafeInteger(sequence) ? sequence : undefined
}

/** Decode one immutable receipt, refusing future versions and unrelated/private fields.
 * @param value - untrusted settings value.
 * @returns a frozen receipt, or undefined when it cannot be trusted by this version.
 */
export function decodeCollectionReceipt(value: unknown): CollectionReceiptV1 | undefined {
  if (!record(value) || value.schemaVersion !== 1
    || !identifier(value.reportId) || !identifier(value.employeeId) || !identifier(value.sessionId)
    || !timestamp(value.terminalSequence) || !timestamp(value.acceptedAt)
    || (value.completedAt !== undefined && !timestamp(value.completedAt))) return undefined
  if (Object.keys(value).some(key => ![
    'schemaVersion', 'reportId', 'employeeId', 'sessionId', 'terminalSequence', 'acceptedAt', 'completedAt',
  ].includes(key))) return undefined
  if (collectionTerminalSequence({
    reportId: value.reportId, employeeId: value.employeeId, sessionId: value.sessionId,
    taskStatus: 'completed',
  }) !== value.terminalSequence) return undefined
  return Object.freeze({
    schemaVersion: 1,
    reportId: value.reportId,
    employeeId: value.employeeId,
    sessionId: value.sessionId,
    terminalSequence: value.terminalSequence,
    acceptedAt: value.acceptedAt,
    ...(value.completedAt === undefined ? {} : { completedAt: value.completedAt }),
  })
}

/** Decode the entire namespace; unknown fields/versions block writes instead of resetting data.
 * @param value - untrusted Host section.
 * @returns the validated immutable section, including an empty new collection.
 */
export function decodeCollectionSettings(value: unknown): CollectionSettings | undefined {
  if (!record(value)) return undefined
  const decoded: Record<string, CollectionReceiptV1 | CollectionDisplayV1> = {}
  for (const [field, item] of Object.entries(value)) {
    if (field === COLLECTION_DISPLAY_FIELD) {
      if (!record(item) || item.schemaVersion !== 1
        || (item.featuredCardId !== undefined && !identifier(item.featuredCardId))
        || Object.keys(item).some(key => key !== 'schemaVersion' && key !== 'featuredCardId')) return undefined
      decoded[field] = Object.freeze({
        schemaVersion: 1,
        ...(item.featuredCardId === undefined ? {} : { featuredCardId: item.featuredCardId }),
      })
    } else {
      const receipt = decodeCollectionReceipt(item)
      if (receipt === undefined || field !== collectionReceiptField(receipt.reportId)) return undefined
      decoded[field] = receipt
    }
  }
  return Object.freeze(decoded)
}

/** Extract durable receipts without storing or counting office animation events.
 * @param settings - validated namespace section.
 * @returns stable acceptance order; each report occurs in exactly one canonical field.
 */
export function collectionReceipts(settings: CollectionSettings): readonly CollectionReceiptV1[] {
  return Object.freeze(Object.entries(settings)
    .filter((entry): entry is [string, CollectionReceiptV1] => 'reportId' in entry[1])
    .map(([, receipt]) => receipt)
    .sort((left, right) => left.acceptedAt - right.acceptedAt || left.reportId.localeCompare(right.reportId)))
}

/** Derive fixed milestone unlocks without currency, randomness or persisted inventory duplication.
 * @param catalog - immutable card catalog in presentation order.
 * @param acceptedReportCount - number of unique durable acceptances.
 * @returns ids of the cards earned at this count, including zero-cost welcome cards.
 */
export function unlockedCollectionCardIds(
  catalog: readonly CollectionCardDefinition[], acceptedReportCount: number,
): readonly string[] {
  return Object.freeze(catalog.filter(card => card.requiredAcceptedReports <= acceptedReportCount).map(card => card.id))
}

/** Validate catalog mistakes when the feature is composed, before receipts can be written.
 * @param catalog - approved local card catalog.
 * @returns a frozen copy with unique ids and non-negative integer milestones.
 */
export function validateCollectionCatalog(catalog: readonly CollectionCardDefinition[]): readonly CollectionCardDefinition[] {
  const ids = new Set<string>()
  for (const card of catalog) {
    if (!identifier(card.id) || !identifier(card.title) || !identifier(card.artUrl)
      || !timestamp(card.requiredAcceptedReports) || ids.has(card.id)) {
      throw new Error('收藏卡目录存在重复标识或无效里程碑')
    }
    ids.add(card.id)
  }
  return Object.freeze(catalog.map(card => Object.freeze({ ...card })))
}

/** Host-safe, serializable schema for independent collection receipts and a display preference. */
import z from '@deepseek-ai/schemastery'

/** This namespace must stay independent from office relationships and schedules. */
export const COLLECTION_SETTINGS_NAMESPACE = 'luma-collection'

const ReceiptSchema = z.object({
  schemaVersion: z.const(1).required(),
  reportId: z.string().min(1).required(),
  employeeId: z.string().min(1).required(),
  sessionId: z.string().min(1).required(),
  terminalSequence: z.natural().max(Number.MAX_SAFE_INTEGER).required(),
  acceptedAt: z.natural().max(Number.MAX_SAFE_INTEGER).required(),
  completedAt: z.natural().max(Number.MAX_SAFE_INTEGER).required(false),
}).required()

const DisplaySchema = z.object({
  schemaVersion: z.const(1).required(),
  featuredCardId: z.string().min(1).required(false),
}).required()

/** Wire schema stays callback-free so Harness settings.describe can serialize and rehydrate it. */
export const CollectionSettingsSchema = z.dict(
  z.union([ReceiptSchema, DisplaySchema]).required(),
  z.string().pattern(/^(?:display|receipt_[A-Za-z0-9_.!~*'()%\-]+)$/u),
).default({})

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
}

function isId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.trim() === value
    && !/[\u0000-\u001f\u007f\uD800-\uDFFF]/u.test(value)
}

/** Validate semantics that serializable Schemastery objects cannot express, including unknown fields.
 * Register with `settings.register(namespace, CollectionSettingsSchema, { validate: validateCollectionSettingsWire })`.
 * @param value - complete schema-resolved namespace candidate before Host persistence.
 */
export function validateCollectionSettingsWire(value: unknown): void {
  const reject = (): never => { throw new Error('收藏凭据或展示设置无效，请保留原数据并更新 Luma') }
  if (!isRecord(value)) reject()
  for (const [field, item] of Object.entries(value as Record<string, unknown>)) {
    if (!isRecord(item) || item.schemaVersion !== 1) reject()
    const entry = item as Record<string, unknown>
    if (field === 'display') {
      if (Object.keys(entry).some(key => key !== 'schemaVersion' && key !== 'featuredCardId')
        || (entry.featuredCardId !== undefined && !isId(entry.featuredCardId))) reject()
      continue
    }
    if (!isId(entry.reportId) || !isId(entry.employeeId) || !isId(entry.sessionId)) reject()
    const reportId = entry.reportId as string
    const sessionId = entry.sessionId as string
    if (field !== `receipt_${encodeURIComponent(reportId)}`
      || Object.keys(entry).some(key => ![
        'schemaVersion', 'reportId', 'employeeId', 'sessionId', 'terminalSequence', 'acceptedAt', 'completedAt',
      ].includes(key))) reject()
    for (const key of ['terminalSequence', 'acceptedAt', 'completedAt']) {
      if (key === 'completedAt' && entry[key] === undefined) continue
      if (typeof entry[key] !== 'number' || !Number.isSafeInteger(entry[key]) || entry[key] < 0) reject()
    }
    const prefix = `harness:${sessionId}:turn:`
    const sequence = reportId.slice(prefix.length)
    if (!reportId.startsWith(prefix) || !/^(0|[1-9]\d*)$/u.test(sequence)
      || Number(sequence) !== entry.terminalSequence) reject()
  }
}

/** Personal card-library preferences are independent from report receipts and reward issuance. */
import z from '@deepseek-ai/schemastery'

export const CARD_LIBRARY_SETTINGS_NAMESPACE = 'luma-card-library'
const header = { schemaVersion: z.const(1).required(), versionKey: z.string().min(1).required() }
const FavoriteSchema = z.object({ ...header, favorite: z.boolean().required() }).required()
// Schemastery's required() treats null as absent; the semantic validator requires the rating key.
const RatingSchema = z.object({ ...header, rating: z.union([z.natural().min(1).max(5), z.const(null)]) }).required()
const NoteSchema = z.object({ ...header, note: z.string().max(2000).required() }).required()
const AlbumSchema = z.object({
  schemaVersion: z.const(1).required(), id: z.string().min(1).required(),
  name: z.string().min(1).max(80).required(),
  versionKeys: z.array(z.string().min(1).required()).max(1000).required(),
  deleted: z.boolean().required(),
}).required()

/** Callback-free wire shape; register the semantic validator separately on the Host. */
export const CardLibrarySettingsSchema = z.dict(
  z.union([FavoriteSchema, RatingSchema, NoteSchema, AlbumSchema]).required(),
  z.string().pattern(/^(?:favorite|rating|note|album)_[A-Za-z0-9_.!~*'()%\-]+$/u),
).default({})

export type CardLibrarySettingV1 = Readonly<{ schemaVersion: 1; versionKey: string; favorite: boolean }>
  | Readonly<{ schemaVersion: 1; versionKey: string; rating: number | null }>
  | Readonly<{ schemaVersion: 1; versionKey: string; note: string }>
  | Readonly<{ schemaVersion: 1; id: string; name: string; versionKeys: readonly string[]; deleted: boolean }>
export type CardLibrarySettings = Readonly<Record<string, CardLibrarySettingV1>>

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
}

function identifier(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 500 && value.trim() === value
    && !/[\u0000-\u001f\u007f\uD800-\uDFFF]/u.test(value)
}

/** Canonical work@revision identity keeps old errata and the new edition's preferences separate. */
export function isCardVersionKey(value: unknown): value is string {
  return identifier(value) && /^[^@]+@[^@]+$/u.test(value)
}

export function cardLibraryField(kind: 'favorite' | 'rating' | 'note' | 'album', id: string): string {
  return `${kind}_${encodeURIComponent(id)}`
}

/** Refuse ambiguous, mismatched, future and private fields instead of silently normalizing them. */
export function validateCardLibrarySettingsWire(value: unknown): void {
  const reject = (): never => { throw new Error('卡牌收藏设置格式不受支持，请保留原数据并更新 Luma') }
  if (!record(value)) reject()
  for (const [field, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!record(raw) || raw.schemaVersion !== 1) reject()
    const entry = raw as Record<string, unknown>
    if (field.startsWith('album_')) {
      if (!identifier(entry.id) || field !== cardLibraryField('album', entry.id as string)
        || Object.keys(entry).some(key => !['schemaVersion', 'id', 'name', 'versionKeys', 'deleted'].includes(key))
        || typeof entry.name !== 'string' || entry.name.trim() !== entry.name || entry.name.length < 1
        || entry.name.length > 80 || /[\u0000-\u001f\u007f]/u.test(entry.name)
        || !Array.isArray(entry.versionKeys) || entry.versionKeys.length > 1000
        || !entry.versionKeys.every(isCardVersionKey)
        || new Set(entry.versionKeys).size !== entry.versionKeys.length || typeof entry.deleted !== 'boolean') reject()
      continue
    }
    const kind = field.startsWith('favorite_') ? 'favorite' : field.startsWith('rating_') ? 'rating'
      : field.startsWith('note_') ? 'note' : undefined
    if (kind === undefined || !isCardVersionKey(entry.versionKey)
      || field !== cardLibraryField(kind, entry.versionKey as string)
      || Object.keys(entry).length !== 3 || Object.keys(entry).some(key => !['schemaVersion', 'versionKey', kind].includes(key))) reject()
    if (kind === 'favorite' && typeof entry.favorite !== 'boolean') reject()
    if (kind === 'rating' && entry.rating !== null
      && (typeof entry.rating !== 'number' || !Number.isInteger(entry.rating) || entry.rating < 1 || entry.rating > 5)) reject()
    if (kind === 'note' && (typeof entry.note !== 'string' || entry.note.length > 2000 || entry.note.includes('\u0000'))) reject()
  }
}

export function hasFutureCardLibrarySettings(value: unknown): boolean {
  return record(value) && Object.values(value).some(item => record(item)
    && typeof item.schemaVersion === 'number' && item.schemaVersion > 1)
}

/** Frozen trusted settings; no migration or persistence occurs while reading. */
export function decodeCardLibrarySettings(value: unknown): CardLibrarySettings | undefined {
  try { validateCardLibrarySettingsWire(value) } catch { return undefined }
  return Object.freeze(Object.fromEntries(Object.entries(value as CardLibrarySettings).map(([field, entry]) => [
    field, Object.freeze({ ...entry, ...('versionKeys' in entry ? { versionKeys: Object.freeze([...entry.versionKeys]) } : {}) }),
  ]))) as CardLibrarySettings
}

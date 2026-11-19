/** Audited annual data. Official source metadata is provenance, not feed authentication. */
export type OfficeHoliday = 'new-year' | 'spring-festival' | 'qingming' | 'labour-day' | 'dragon-boat' | 'mid-autumn' | 'national-day' | 'national-mid-autumn'
export interface OfficialOfficeHolidayYearV1 {
  readonly schemaVersion: 1
  readonly region: 'CN'
  readonly year: number
  readonly revision: number
  readonly sourceUrl: string
  readonly sourcePublishedAt: string
  readonly holidays: readonly Readonly<{ holiday: OfficeHoliday; start: string; end: string }>[]
  readonly makeupWorkDates: readonly string[]
}
export interface OfficialOfficeHolidayCacheV1 {
  readonly schemaVersion: 1
  readonly years: readonly OfficialOfficeHolidayYearV1[]
  readonly lastCheckedAt?: number
  readonly updateStatus?: 'ok' | 'offline' | 'pending' | 'invalid' | 'unavailable'
}

const HOLIDAY_KEYS = new Set<OfficeHoliday>(['new-year', 'spring-festival', 'qingming', 'labour-day', 'dragon-boat', 'mid-autumn', 'national-day', 'national-mid-autumn'])
const UPDATE_STATUSES = new Set(['ok', 'offline', 'pending', 'invalid', 'unavailable'])
function object(value: unknown, keys: readonly string[], error: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).some(key => !keys.includes(key))) throw new TypeError(error)
  return value as Record<string, unknown>
}
function dayKey(value: unknown, year?: number): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) throw new TypeError('Invalid official holiday date')
  const [y, m, d] = value.split('-').map(Number) as [number, number, number]
  const checked = new Date(Date.UTC(y, m - 1, d))
  if (y < 1000 || checked.getUTCFullYear() !== y || checked.getUTCMonth() !== m - 1
    || checked.getUTCDate() !== d || (year !== undefined && y !== year)) throw new TypeError('Invalid official holiday date')
  return value
}
function officialSource(value: unknown): string {
  if (typeof value !== 'string' || value.length > 2048 || /[\s\\\u0000-\u001f\u007f]/u.test(value)) throw new TypeError('Invalid official holiday source')
  let url: URL
  try { url = new URL(value) } catch { throw new TypeError('Invalid official holiday source') }
  const authority = /^[a-z]+:\/\/([^/?#]+)/iu.exec(value)?.[1] ?? ''
  if (value !== value.trim() || /[@:]/u.test(authority) || value.includes('?') || value.includes('#')
    || url.protocol !== 'https:' || url.username || url.password || url.port || url.search || url.hash
    || !(url.hostname === 'gov.cn' || url.hostname.endsWith('.gov.cn'))) throw new TypeError('Invalid official holiday source')
  return url.href
}

/** Reject the whole annual package on invalid, ambiguous or excessive dates. */
export function normalizeOfficialOfficeHolidayYear(value: unknown): OfficialOfficeHolidayYearV1 {
  const candidate = object(value, ['schemaVersion', 'region', 'year', 'revision', 'sourceUrl', 'sourcePublishedAt', 'holidays', 'makeupWorkDates'], 'Invalid official holiday year')
  const year = candidate.year
  if (candidate.schemaVersion !== 1 || candidate.region !== 'CN' || typeof year !== 'number'
    || !Number.isInteger(year) || year < 2000 || year > 9999 || typeof candidate.revision !== 'number'
    || !Number.isSafeInteger(candidate.revision) || candidate.revision < 1 || candidate.revision > 1_000_000
    || !Array.isArray(candidate.holidays) || candidate.holidays.length === 0 || candidate.holidays.length > 32
    || !Array.isArray(candidate.makeupWorkDates) || candidate.makeupWorkDates.length > 32) throw new TypeError('Invalid official holiday year')
  const sourceUrl = officialSource(candidate.sourceUrl)
  const sourcePublishedAt = dayKey(candidate.sourcePublishedAt)
  const restDays = new Set<string>()
  const holidays = candidate.holidays.map(raw => {
    const range = object(raw, ['holiday', 'start', 'end'], 'Invalid official holiday range')
    if (typeof range.holiday !== 'string' || !HOLIDAY_KEYS.has(range.holiday as OfficeHoliday)) throw new TypeError('Invalid official holiday name')
    const start = dayKey(range.start, year)
    const end = dayKey(range.end, year)
    if (start > end || (Date.parse(`${end}T00:00:00.000Z`) - Date.parse(`${start}T00:00:00.000Z`)) / 86_400_000 + 1 > 31) throw new TypeError('Invalid official holiday range')
    for (const cursor = new Date(`${start}T00:00:00.000Z`), finish = new Date(`${end}T00:00:00.000Z`).getTime(); cursor.getTime() <= finish; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
      const day = cursor.toISOString().slice(0, 10)
      if (restDays.has(day) || restDays.size >= 90) throw new TypeError('Invalid official holiday overlap or size')
      restDays.add(day)
    }
    return Object.freeze({ holiday: range.holiday as OfficeHoliday, start, end })
  }).sort((a, b) => a.start.localeCompare(b.start) || a.holiday.localeCompare(b.holiday))
  const concepts = new Set<string>()
  for (const range of holidays) {
    if (range.holiday === 'national-mid-autumn') { concepts.add('national-day'); concepts.add('mid-autumn') }
    else concepts.add(range.holiday)
  }
  if (['new-year', 'spring-festival', 'qingming', 'labour-day', 'dragon-boat', 'mid-autumn', 'national-day'].some(holiday => !concepts.has(holiday))) throw new TypeError('Incomplete official holiday year')
  const makeupDates = new Set<string>()
  for (const raw of candidate.makeupWorkDates) {
    const day = dayKey(raw, year)
    if (makeupDates.has(day) || restDays.has(day)) throw new TypeError('Invalid official holiday make-up date')
    makeupDates.add(day)
  }
  return Object.freeze({ schemaVersion: 1, region: 'CN', year, revision: candidate.revision, sourceUrl,
    sourcePublishedAt, holidays: Object.freeze(holidays), makeupWorkDates: Object.freeze([...makeupDates].sort()) })
}

/** Offline baseline, 国办发明电〔2025〕7号, published 2025-11-04. */
export const BUILTIN_OFFICE_HOLIDAY_CACHE: OfficialOfficeHolidayCacheV1 = Object.freeze({
  schemaVersion: 1,
  years: Object.freeze([normalizeOfficialOfficeHolidayYear({
    schemaVersion: 1, region: 'CN', year: 2026, revision: 1,
    sourceUrl: 'https://www.gov.cn/zhengce/zhengceku/202511/content_7047091.htm', sourcePublishedAt: '2025-11-04',
    holidays: [
      { holiday: 'new-year', start: '2026-01-01', end: '2026-01-03' },
      { holiday: 'spring-festival', start: '2026-02-15', end: '2026-02-23' },
      { holiday: 'qingming', start: '2026-04-04', end: '2026-04-06' },
      { holiday: 'labour-day', start: '2026-05-01', end: '2026-05-05' },
      { holiday: 'dragon-boat', start: '2026-06-19', end: '2026-06-21' },
      { holiday: 'mid-autumn', start: '2026-09-25', end: '2026-09-27' },
      { holiday: 'national-day', start: '2026-10-01', end: '2026-10-07' },
    ], makeupWorkDates: ['2026-01-04', '2026-02-14', '2026-02-28', '2026-05-09', '2026-09-20', '2026-10-10'],
  })]),
})

export function normalizeOfficialOfficeHolidayCache(value?: unknown): OfficialOfficeHolidayCacheV1 {
  if (value === undefined) return BUILTIN_OFFICE_HOLIDAY_CACHE
  const candidate = object(value, ['schemaVersion', 'years', 'lastCheckedAt', 'updateStatus'], 'Invalid official holiday cache')
  if (candidate.schemaVersion !== 1 || !Array.isArray(candidate.years) || candidate.years.length > 16
    || (candidate.lastCheckedAt !== undefined && (typeof candidate.lastCheckedAt !== 'number' || !Number.isSafeInteger(candidate.lastCheckedAt)
      || candidate.lastCheckedAt < 0 || candidate.lastCheckedAt > 8_640_000_000_000_000))
    || (candidate.updateStatus !== undefined && (typeof candidate.updateStatus !== 'string' || !UPDATE_STATUSES.has(candidate.updateStatus)))) throw new TypeError('Invalid official holiday cache')
  const years = candidate.years.map(normalizeOfficialOfficeHolidayYear).sort((a, b) => a.year - b.year)
  if (new Set(years.map(entry => entry.year)).size !== years.length) throw new TypeError('Duplicate official holiday year')
  return Object.freeze({ schemaVersion: 1, years: Object.freeze(years),
    ...(candidate.lastCheckedAt === undefined ? {} : { lastCheckedAt: candidate.lastCheckedAt as number }),
    ...(candidate.updateStatus === undefined ? {} : { updateStatus: candidate.updateStatus as NonNullable<OfficialOfficeHolidayCacheV1['updateStatus']> }) })
}

/** A correction must increase the revision; failure never mutates last-good data. */
export function mergeOfficialOfficeHolidayYear(cache: unknown, value: unknown): OfficialOfficeHolidayCacheV1 {
  const normalized = normalizeOfficialOfficeHolidayCache(cache)
  const year = normalizeOfficialOfficeHolidayYear(value)
  const previous = normalized.years.find(entry => entry.year === year.year)
  if (previous && (year.revision < previous.revision
    || (year.revision === previous.revision && JSON.stringify(year) !== JSON.stringify(previous)))) throw new TypeError('Official holiday revision conflict')
  if (previous?.revision === year.revision) return normalized
  const years = [...normalized.years.filter(entry => entry.year !== year.year), year].sort((a, b) => a.year - b.year)
  const retained = years.slice(-16)
  if (!retained.includes(year)) throw new TypeError('Official holiday year is outside retained cache')
  return normalizeOfficialOfficeHolidayCache({ ...normalized, years: retained })
}

/** Select only the local candidate year; no lunar-date or prior-year inference. */
export function getOfficeCalendarCoverage(date: Date, cache?: OfficialOfficeHolidayCacheV1): OfficialOfficeHolidayYearV1 | null {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) throw new TypeError('Office clock requires a valid Date')
  return normalizeOfficialOfficeHolidayCache(cache).years.find(entry => entry.year === date.getFullYear()) ?? null
}

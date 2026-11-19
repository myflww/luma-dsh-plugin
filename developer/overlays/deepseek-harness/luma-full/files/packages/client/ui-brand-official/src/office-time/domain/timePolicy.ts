/** Pure office time, work calendar and attendance rules shared by Host and UI. */
import { getOfficeCalendarCoverage, type OfficeHoliday, type OfficialOfficeHolidayCacheV1 } from '../../office-holiday-calendar.ts'
export type { OfficeHoliday, OfficialOfficeHolidayCacheV1 } from '../../office-holiday-calendar.ts'

const MINUTES_PER_HOUR = 60
const MINUTES_PER_DAY = 24 * MINUTES_PER_HOUR

export const OFFICE_OPEN_MINUTE = 6 * MINUTES_PER_HOUR
export const OFFICE_WORK_START_MINUTE = 9 * MINUTES_PER_HOUR
export const OFFICE_WORK_END_MINUTE = 18 * MINUTES_PER_HOUR
/** Local-clock attendance defaults; independent from visual day/night phases. */
export const OFFICE_WORK_PERIODS = Object.freeze([
  Object.freeze({ start: OFFICE_WORK_START_MINUTE, end: 12 * MINUTES_PER_HOUR }),
  Object.freeze({ start: 13 * MINUTES_PER_HOUR, end: OFFICE_WORK_END_MINUTE }),
])
export const OFFICE_CLOSE_MINUTE = 20 * MINUTES_PER_HOUR

/** Independent user rest dates; official annual data has its own validated cache. */
export interface OfficeWorkCalendar {
  readonly schemaVersion: 1
  readonly restDates: readonly string[]
}
export const DEFAULT_OFFICE_WORK_CALENDAR: OfficeWorkCalendar = Object.freeze({
  schemaVersion: 1, restDates: Object.freeze([]),
})

export function normalizeOfficeWorkCalendar(value: unknown): OfficeWorkCalendar {
  if (value === undefined) return DEFAULT_OFFICE_WORK_CALENDAR
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('Invalid office calendar')
  const candidate = value as { schemaVersion?: unknown; restDates?: unknown }
  if (candidate.schemaVersion !== 1 || !Array.isArray(candidate.restDates) || candidate.restDates.length > 512
    || Object.keys(candidate).some(key => !['schemaVersion', 'restDates'].includes(key))) throw new TypeError('Invalid office calendar')
  const restDates: string[] = []
  for (const day of candidate.restDates) {
    if (typeof day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(day)) throw new TypeError('Invalid office rest date')
    const [year, month, date] = day.split('-').map(Number) as [number, number, number]
    const checked = new Date(Date.UTC(year, month - 1, date))
    if (year < 1000 || checked.getUTCFullYear() !== year || checked.getUTCMonth() !== month - 1
      || checked.getUTCDate() !== date || restDates.includes(day)) throw new TypeError('Invalid office rest date')
    restDates.push(day)
  }
  return Object.freeze({ schemaVersion: 1, restDates: Object.freeze(restDates.sort()) })
}

export function officeLocalDateKey(date: Date): string {
  getLocalDecimalHour(date) // Validate without deriving a server-owned crystal day.
  return `${String(date.getFullYear()).padStart(4, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export type OfficeRestDayReason = OfficeHoliday | 'weekend' | 'rest-day'

/** One rest reason for Host admission and renderer copy, using the local date. */
export function getOfficeRestDayReason(date: Date, calendar: OfficeWorkCalendar = DEFAULT_OFFICE_WORK_CALENDAR, officialCalendarCache?: OfficialOfficeHolidayCacheV1): OfficeRestDayReason | null {
  const day = officeLocalDateKey(date)
  const normalized = normalizeOfficeWorkCalendar(calendar)
  const official = getOfficeCalendarCoverage(date, officialCalendarCache)
  const holiday = official?.holidays.find(range => day >= range.start && day <= range.end)?.holiday
  if (holiday) return holiday
  // Extra user rest days can override an official make-up work day.
  if (normalized.restDates.includes(day)) return 'rest-day'
  if (official?.makeupWorkDates.includes(day)) return null
  return date.getDay() === 0 || date.getDay() === 6 ? 'weekend' : null
}

export function isOfficeWorkingDate(date: Date, calendar: OfficeWorkCalendar = DEFAULT_OFFICE_WORK_CALENDAR, officialCalendarCache?: OfficialOfficeHolidayCacheV1): boolean {
  return getOfficeRestDayReason(date, calendar, officialCalendarCache) === null
}

export const OFFICE_TIME_PHASES = Object.freeze({
  MORNING: 'morning',
  NOON: 'noon',
  AFTERNOON: 'afternoon',
  DUSK: 'dusk',
  NIGHT: 'night',
  CLOSED: 'closed',
} as const)

export type OfficeTimePhase = typeof OFFICE_TIME_PHASES[keyof typeof OFFICE_TIME_PHASES]
export type OfficeAttendancePeriod = 'working' | 'lunch' | 'off-duty'

const PHASE_BOUNDARIES = Object.freeze([
  Object.freeze({ phase: OFFICE_TIME_PHASES.MORNING, start: 6 * 60, end: 11 * 60 }),
  Object.freeze({ phase: OFFICE_TIME_PHASES.NOON, start: 11 * 60, end: 13 * 60 }),
  Object.freeze({ phase: OFFICE_TIME_PHASES.AFTERNOON, start: 13 * 60, end: 17 * 60 }),
  Object.freeze({ phase: OFFICE_TIME_PHASES.DUSK, start: 17 * 60, end: 19 * 60 }),
  Object.freeze({ phase: OFFICE_TIME_PHASES.NIGHT, start: 19 * 60, end: 20 * 60 }),
])

const normalizeHourToMinute = (value: number): number => {
  if (!Number.isFinite(value)) throw new TypeError('Office time must be a finite hour value')
  if (value < 0 || value >= 24) throw new RangeError('Office time must fall within one local day')
  return Math.min(MINUTES_PER_DAY - 1, Math.floor(value * MINUTES_PER_HOUR))
}

const phaseFromMinute = (minuteOfDay: number): OfficeTimePhase =>
  PHASE_BOUNDARIES.find(({ start, end }) => minuteOfDay >= start && minuteOfDay < end)?.phase
  ?? OFFICE_TIME_PHASES.CLOSED

export function getLocalDecimalHour(date = new Date()): number {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    throw new TypeError('Office clock requires a valid Date')
  }
  return date.getHours() + date.getMinutes() / 60 + date.getSeconds() / 3600
}

export function getOfficeTimePhase(hour: number): OfficeTimePhase {
  return phaseFromMinute(normalizeHourToMinute(hour))
}

export function isOfficeWorkPeriod(hour: number): boolean {
  const minute = normalizeHourToMinute(hour)
  return OFFICE_WORK_PERIODS.some(period => minute >= period.start && minute < period.end)
}

/** Attendance is independent of sunset and of the building's opening hours. */
export function getOfficeAttendancePeriod(hour: number): OfficeAttendancePeriod {
  const minute = normalizeHourToMinute(hour)
  if (minute < OFFICE_WORK_START_MINUTE || minute >= OFFICE_WORK_END_MINUTE) return 'off-duty'
  return isOfficeWorkPeriod(hour) ? 'working' : 'lunch'
}

export type OfficeAttendanceLabel = 'before-work' | 'working' | 'lunch' | 'off-duty' | OfficeRestDayReason

/**
 * Stable label key for the current attendance period so the header can render it
 * through the locale dictionaries instead of freezing copy into the component.
 * Before 09:00 and after 18:00 share the `off-duty` attendance period but must
 * read differently to the user.
 */
export function getOfficeAttendanceLabel(hour: number, date?: Date, calendar?: OfficeWorkCalendar, officialCalendarCache?: OfficialOfficeHolidayCacheV1): OfficeAttendanceLabel {
  const restReason = date ? getOfficeRestDayReason(date, calendar, officialCalendarCache) : null
  if (restReason) return restReason
  const period = getOfficeAttendancePeriod(hour)
  if (period === 'working' || period === 'lunch') return period
  return normalizeHourToMinute(hour) < OFFICE_WORK_START_MINUTE ? 'before-work' : 'off-duty'
}

/** Shared local clock and attendance facts, independent of scene rendering. */
export interface OfficeClockPolicy {
  readonly hour: number
  readonly minuteOfDay: number
  readonly phase: OfficeTimePhase
  readonly attendancePeriod: OfficeAttendancePeriod
  readonly isWorkPeriod: boolean
  readonly charactersPresent: boolean
  readonly officeOpen: boolean
  readonly isWorkingDate: boolean
  readonly bedtime: boolean
}

/**
 * Browser-independent office clock. Tests may pass an explicit hour; runtime
 * passes a Date. No prototype query-string/QA override is carried into Luma.
 */
export function createOfficeClockPolicy(options: Readonly<{ date?: Date; hour?: number; calendar?: OfficeWorkCalendar; officialCalendarCache?: OfficialOfficeHolidayCacheV1 }> = {}): OfficeClockPolicy {
  const date = options.date ?? new Date()
  const hour = options.hour ?? getLocalDecimalHour(date)
  // Explicit hour-only probes retain the pure daily clock contract. Real
  // runtime calls supply a Date and therefore apply weekends and rest dates.
  const workingDate = options.date === undefined && options.hour !== undefined
    ? true : isOfficeWorkingDate(date, options.calendar, options.officialCalendarCache)
  const minuteOfDay = normalizeHourToMinute(hour)
  const phase = phaseFromMinute(minuteOfDay)
  const attendancePeriod = workingDate ? getOfficeAttendancePeriod(hour) : 'off-duty'
  const isWorkPeriod = attendancePeriod === 'working'
  const charactersPresent = attendancePeriod !== 'off-duty'
  return Object.freeze({
    hour,
    minuteOfDay,
    phase,
    attendancePeriod,
    isWorkPeriod,
    charactersPresent,
    officeOpen: minuteOfDay >= OFFICE_OPEN_MINUTE && minuteOfDay < OFFICE_CLOSE_MINUTE,
    isWorkingDate: workingDate,
    bedtime: phase === OFFICE_TIME_PHASES.CLOSED,
  })
}

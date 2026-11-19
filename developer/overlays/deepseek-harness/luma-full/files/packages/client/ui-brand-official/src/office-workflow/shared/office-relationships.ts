import { OFFICE_WORKSTATION_AUTO_ASSIGN_PRIORITY, isOfficeWorkstationId, type OfficeWorkstationId } from './office-workstations.ts'
import { OFFICE_EMPLOYEE_KEYS, isOfficeEmployeeKey, type OfficeEmployeePresetKey } from '../../office-employee-presets.ts'
import { normalizeOfficeWorkCalendar, type OfficeWorkCalendar } from '../../office-time/domain/timePolicy.ts'
import { normalizeOfficialOfficeHolidayCache, type OfficialOfficeHolidayCacheV1 } from '../../office-holiday-calendar.ts'
export { OFFICE_RELATIONSHIP_SETTINGS_FIELD, OFFICE_RELATIONSHIP_SETTINGS_NAMESPACE, OFFICE_SCHEDULE_SETTINGS_FIELD } from '../../office-relationship-settings.ts'
import type { OfficeScheduledTaskSettingsV1, OfficeScheduledTasksSettingsV1 } from '../../office-relationship-settings.ts'

/** Fixed employee identities available in the Luma office. */
export const OFFICE_EMPLOYEE_IDS = OFFICE_EMPLOYEE_KEYS

/** Stable identity of one built-in Luma employee. */
export type OfficeEmployeeId = OfficeEmployeePresetKey

/** Durable Harness and workstation relationships for one employee. */
export interface OfficeEmployeeRelationshipV1 {
  readonly workstationId?: OfficeWorkstationId
  readonly workspaceId?: string
  readonly activeSessionId?: string
}

/** Versioned, global relationship document for all built-in employees. */
export interface OfficeRelationshipsV1 {
  readonly schemaVersion: 1
  readonly employees: Readonly<Record<OfficeEmployeeId, OfficeEmployeeRelationshipV1>>
}

/** Settings section consumed by the browser settings scope. */
export interface OfficeRelationshipSettings {
  readonly relationships?: OfficeRelationshipsV1
  readonly scheduledTasks?: OfficeScheduledTasksSettingsV1
  readonly calendar?: OfficeWorkCalendar
  readonly holidayCalendar?: OfficialOfficeHolidayCacheV1
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function optionalNonEmptyString(value: unknown): string | undefined | false {
  if (value === undefined) return undefined
  if (typeof value !== 'string' || value.trim() === '') return false
  return value
}

const OFFICE_DATE = /^\d{4}-\d{2}-\d{2}$/u
const OFFICE_TIME = /^(?:[01]\d|2[0-3]):[0-5]\d$/u

function isCalendarDate(value: string): boolean {
  if (!OFFICE_DATE.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const parsed = new Date(Date.UTC(year!, month! - 1, day!))
  return parsed.getUTCFullYear() === year
    && parsed.getUTCMonth() === month! - 1
    && parsed.getUTCDate() === day
}

function decodeScheduledTask(value: unknown): OfficeScheduledTaskSettingsV1 | undefined {
  if (!isRecord(value)
    || typeof value.id !== 'string' || value.id.trim() === ''
    || !isOfficeEmployeeId(value.employeeId)
    || typeof value.title !== 'string' || value.title.trim() === ''
    || typeof value.prompt !== 'string' || value.prompt.trim() === ''
    || typeof value.date !== 'string' || !isCalendarDate(value.date)
    || typeof value.time !== 'string' || !OFFICE_TIME.test(value.time)
    || (value.recurrence !== 'once' && value.recurrence !== 'daily')
    || typeof value.enabled !== 'boolean'
    || typeof value.createdAt !== 'number' || !Number.isFinite(value.createdAt)) {
    return undefined
  }
  const lastTriggeredKey = optionalNonEmptyString(value.lastTriggeredKey)
  const lastSessionId = optionalNonEmptyString(value.lastSessionId)
  if (lastTriggeredKey === false || lastSessionId === false
    || (value.lastTriggeredAt !== undefined
      && (typeof value.lastTriggeredAt !== 'number' || !Number.isFinite(value.lastTriggeredAt)))) {
    return undefined
  }
  return Object.freeze({
    id: value.id.trim(),
    employeeId: value.employeeId,
    title: value.title.trim(),
    prompt: value.prompt.trim(),
    date: value.date,
    time: value.time,
    recurrence: value.recurrence,
    enabled: value.enabled,
    createdAt: value.createdAt,
    ...(lastTriggeredKey === undefined ? {} : { lastTriggeredKey }),
    ...(lastSessionId === undefined ? {} : { lastSessionId }),
    ...(value.lastTriggeredAt === undefined ? {} : { lastTriggeredAt: value.lastTriggeredAt }),
  })
}

/** Decode the durable daily/one-time task collection and reject duplicate ids. */
export function decodeOfficeScheduledTasksV1(
  value: unknown,
): OfficeScheduledTasksSettingsV1 | undefined {
  if (!isRecord(value) || value.schemaVersion !== 1 || !Array.isArray(value.tasks)) {
    return undefined
  }
  const seen = new Set<string>()
  const tasks: OfficeScheduledTaskSettingsV1[] = []
  for (const candidate of value.tasks) {
    const task = decodeScheduledTask(candidate)
    if (task === undefined || seen.has(task.id)) return undefined
    seen.add(task.id)
    tasks.push(task)
  }
  return Object.freeze({ schemaVersion: 1, tasks: Object.freeze(tasks) })
}

/**
 * @param value - candidate identity crossing a persisted or scene boundary.
 * @returns whether the value names a built-in employee.
 */
export function isOfficeEmployeeId(value: unknown): value is OfficeEmployeeId {
  return isOfficeEmployeeKey(value)
}

function freezeRelationship(
  relationship: OfficeEmployeeRelationshipV1,
): OfficeEmployeeRelationshipV1 {
  return Object.freeze({ ...relationship })
}

function freezeRelationships(
  employees: Record<OfficeEmployeeId, OfficeEmployeeRelationshipV1>,
): OfficeRelationshipsV1 {
  return Object.freeze({
    schemaVersion: 1 as const,
    employees: Object.freeze({
      shan: freezeRelationship(employees.shan),
      'bai-shuangming': freezeRelationship(employees['bai-shuangming']),
      'lu-mi': freezeRelationship(employees['lu-mi']),
      jingyuniang: freezeRelationship(employees.jingyuniang),
      longmama: freezeRelationship(employees.longmama),
      claude: freezeRelationship(employees.claude),
      gemini: freezeRelationship(employees.gemini),
      grok: freezeRelationship(employees.grok),
    }),
  })
}

/** @returns an unbound relationship document containing all employees. */
export function createDefaultOfficeRelationshipsV1(): OfficeRelationshipsV1 {
  return freezeRelationships({
    shan: {},
    'bai-shuangming': {},
    'lu-mi': {},
    jingyuniang: {},
    longmama: {},
    claude: {},
    gemini: {},
    grok: {},
  })
}

function decodeEmployeeRelationship(
  value: unknown,
): OfficeEmployeeRelationshipV1 | undefined {
  if (value === undefined) return {}
  if (!isRecord(value)) return undefined

  const workspaceId = optionalNonEmptyString(value.workspaceId)
  const activeSessionId = optionalNonEmptyString(value.activeSessionId)
  if (workspaceId === false || activeSessionId === false) return undefined
  if (value.workstationId !== undefined
    && (typeof value.workstationId !== 'string' || !isOfficeWorkstationId(value.workstationId))) {
    return undefined
  }

  return {
    ...(value.workstationId === undefined
      ? {}
      : { workstationId: value.workstationId as OfficeWorkstationId }),
    ...(workspaceId === undefined ? {} : { workspaceId }),
    ...(activeSessionId === undefined ? {} : { activeSessionId }),
  }
}

/**
 * Decode durable relationships and repair duplicate workstation/session
 * bindings by retaining the first employee in the fixed catalog order.
 * @param value - untrusted settings field.
 * @returns a complete V1 document, or undefined for an unsupported/malformed value.
 */
export function decodeOfficeRelationshipsV1(value: unknown): OfficeRelationshipsV1 | undefined {
  if (!isRecord(value) || value.schemaVersion !== 1 || !isRecord(value.employees)) {
    return undefined
  }

  const occupied = new Set<OfficeWorkstationId>()
  const activeSessions = new Set<string>()
  const employees = {} as Record<OfficeEmployeeId, OfficeEmployeeRelationshipV1>
  for (const employeeId of OFFICE_EMPLOYEE_IDS) {
    const decoded = decodeEmployeeRelationship(value.employees[employeeId])
    if (decoded === undefined) return undefined
    const relationship = { ...decoded }
    if (relationship.workstationId !== undefined) {
      if (occupied.has(relationship.workstationId)) delete relationship.workstationId
      else occupied.add(relationship.workstationId)
    }
    if (relationship.activeSessionId !== undefined) {
      if (activeSessions.has(relationship.activeSessionId)) delete relationship.activeSessionId
      else activeSessions.add(relationship.activeSessionId)
    }
    employees[employeeId] = relationship
  }
  return freezeRelationships(employees)
}

/**
 * Decoder supplied to `ctx.settingsScope.bind` when the office namespace is wired.
 * @param section - namespace section received from Harness settings.
 * @returns the narrowed settings section, or undefined when malformed.
 */
export function decodeOfficeRelationshipSettings(
  section: unknown,
): OfficeRelationshipSettings | undefined {
  if (!isRecord(section)) return undefined
  const relationships = section.relationships === undefined
    ? undefined
    : decodeOfficeRelationshipsV1(section.relationships)
  if (section.relationships !== undefined && relationships === undefined) return undefined

  const scheduledTasks = section.scheduledTasks === undefined
    ? undefined
    : decodeOfficeScheduledTasksV1(section.scheduledTasks)
  if (section.scheduledTasks !== undefined && scheduledTasks === undefined) return undefined
  let calendar: OfficeWorkCalendar | undefined
  try { if (section.calendar !== undefined) calendar = normalizeOfficeWorkCalendar(section.calendar as OfficeWorkCalendar) }
  catch { return undefined }
  let holidayCalendar: OfficialOfficeHolidayCacheV1 | undefined
  try { if (section.holidayCalendar !== undefined) holidayCalendar = normalizeOfficialOfficeHolidayCache(section.holidayCalendar) }
  catch { return undefined }
  return Object.freeze({
    ...(relationships === undefined ? {} : { relationships }),
    ...(scheduledTasks === undefined ? {} : { scheduledTasks }),
    ...(calendar === undefined ? {} : { calendar }),
    ...(holidayCalendar === undefined ? {} : { holidayCalendar }),
  })
}

/**
 * @param relationships - complete relationship document.
 * @param workstationId - workstation whose occupant should be found.
 * @returns the bound employee, or undefined when the workstation is free.
 */
export function findEmployeeBoundToWorkstation(
  relationships: OfficeRelationshipsV1,
  workstationId: OfficeWorkstationId,
): OfficeEmployeeId | undefined {
  return OFFICE_EMPLOYEE_IDS.find(
    employeeId => relationships.employees[employeeId].workstationId === workstationId,
  )
}

/**
 * @param relationships - complete relationship document.
 * @returns the first free workstation in the calibrated office priority order.
 */
export function findAutoAssignableWorkstation(
  relationships: OfficeRelationshipsV1,
): OfficeWorkstationId | undefined {
  const occupied = new Set(
    OFFICE_EMPLOYEE_IDS.flatMap((employeeId) => {
      const workstationId = relationships.employees[employeeId].workstationId
      return workstationId === undefined ? [] : [workstationId]
    }),
  )
  return OFFICE_WORKSTATION_AUTO_ASSIGN_PRIORITY.find(id => !occupied.has(id))
}

/**
 * @param relationships - candidate relationship document.
 * @returns whether every bound workstation has exactly one employee.
 */
export function hasUniqueWorkstationBindings(
  relationships: OfficeRelationshipsV1,
): boolean {
  const bound = OFFICE_EMPLOYEE_IDS.flatMap((employeeId) => {
    const workstationId = relationships.employees[employeeId].workstationId
    return workstationId === undefined ? [] : [workstationId]
  })
  return new Set(bound).size === bound.length
}

/**
 * @param relationships - source document.
 * @param employees - replacement employee records.
 * @returns a frozen relationship document.
 */
export function replaceEmployeeRelationships(
  relationships: OfficeRelationshipsV1,
  employees: Partial<Record<OfficeEmployeeId, OfficeEmployeeRelationshipV1>>,
): OfficeRelationshipsV1 {
  return freezeRelationships({
    shan: employees.shan ?? relationships.employees.shan,
    'bai-shuangming': employees['bai-shuangming']
      ?? relationships.employees['bai-shuangming'],
    'lu-mi': employees['lu-mi'] ?? relationships.employees['lu-mi'],
    jingyuniang: employees.jingyuniang ?? relationships.employees.jingyuniang,
    longmama: employees.longmama ?? relationships.employees.longmama,
    claude: employees.claude ?? relationships.employees.claude,
    gemini: employees.gemini ?? relationships.employees.gemini,
    grok: employees.grok ?? relationships.employees.grok,
  })
}

/**
 * @param left - first relationship document.
 * @param right - second relationship document.
 * @returns whether both documents carry the same durable relationships.
 */
export function officeRelationshipsEqual(
  left: OfficeRelationshipsV1,
  right: OfficeRelationshipsV1,
): boolean {
  return OFFICE_EMPLOYEE_IDS.every((employeeId) => {
    const a = left.employees[employeeId]
    const b = right.employees[employeeId]
    return a.workstationId === b.workstationId
      && a.workspaceId === b.workspaceId
      && a.activeSessionId === b.activeSessionId
  })
}

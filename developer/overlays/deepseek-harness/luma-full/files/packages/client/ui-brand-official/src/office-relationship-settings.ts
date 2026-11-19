/** Host-safe settings contract for durable Luma office relationships. */

import z from '@deepseek-ai/schemastery'
import { normalizeOfficeWorkCalendar, DEFAULT_OFFICE_WORK_CALENDAR, type OfficeWorkCalendar } from './office-time/domain/timePolicy.ts'
import { normalizeOfficialOfficeHolidayCache, BUILTIN_OFFICE_HOLIDAY_CACHE, type OfficialOfficeHolidayCacheV1 } from './office-holiday-calendar.ts'

/** Namespace owning all durable office identity and workstation relationships. */
export const OFFICE_RELATIONSHIP_SETTINGS_NAMESPACE = 'luma-office'

/** Atomic field carrying the complete, versioned relationship document. */
export const OFFICE_RELATIONSHIP_SETTINGS_FIELD = 'relationships'

/** Atomic field carrying user-authored office AI schedules. */
export const OFFICE_SCHEDULE_SETTINGS_FIELD = 'scheduledTasks'
export const OFFICE_CALENDAR_SETTINGS_FIELD = 'calendar'
export const OFFICE_HOLIDAY_CALENDAR_SETTINGS_FIELD = 'holidayCalendar'

/** Fixed employee keys accepted by the Host settings schema. */
export const OFFICE_SETTINGS_EMPLOYEE_IDS = [
  'shan',
  'bai-shuangming',
  'lu-mi',
  'jingyuniang',
  'longmama',
  'claude',
  'gemini',
  'grok',
] as const

/** Calibrated office workstation keys accepted by the Host settings schema. */
export const OFFICE_SETTINGS_WORKSTATION_IDS = [
  'north-private',
  'north-center',
  'west-studio',
  'south-left',
  'south-focus',
  'south-right',
  'private-upper',
  'private-lower',
  'reception',
] as const

export type OfficeSettingsEmployeeId = typeof OFFICE_SETTINGS_EMPLOYEE_IDS[number]
export type OfficeSettingsWorkstationId = typeof OFFICE_SETTINGS_WORKSTATION_IDS[number]
/** Work fields shared by the existing scheduled form and message confirmation. */
export interface OfficeWorkTaskFields { readonly employeeId: string; readonly title: string; readonly prompt: string }

/** JSON-shaped relationship for one fixed employee. */
export interface OfficeEmployeeRelationshipSettingsV1 {
  workstationId?: OfficeSettingsWorkstationId
  workspaceId?: string
  activeSessionId?: string
}

/** Atomic versioned document persisted below the namespace field. */
export interface OfficeRelationshipsSettingsV1 {
  schemaVersion: 1
  employees: Readonly<Record<OfficeSettingsEmployeeId, OfficeEmployeeRelationshipSettingsV1>>
}

/** Namespace section exposed to the browser settings scope. */
export interface OfficeRelationshipSettingsWire {
  relationships?: OfficeRelationshipsSettingsV1
  scheduledTasks?: OfficeScheduledTasksSettingsV1
  calendar?: OfficeWorkCalendar
  holidayCalendar?: OfficialOfficeHolidayCacheV1
}

export type OfficeScheduleRecurrenceSettings = 'once' | 'daily'

/** One real Harness-backed task scheduled from the office employee drawer. */
export interface OfficeScheduledTaskSettingsV1 extends OfficeWorkTaskFields {
  id: string
  employeeId: OfficeSettingsEmployeeId
  title: string
  prompt: string
  date: string
  time: string
  recurrence: OfficeScheduleRecurrenceSettings
  enabled: boolean
  createdAt: number
  lastTriggeredKey?: string
  lastSessionId?: string
  lastTriggeredAt?: number
}

/** Versioned schedule collection stored beside, not inside, relationships. */
export interface OfficeScheduledTasksSettingsV1 {
  schemaVersion: 1
  tasks: readonly OfficeScheduledTaskSettingsV1[]
}

const EmployeeRelationshipSettingsSchema: z<OfficeEmployeeRelationshipSettingsV1> = z.object({
  workstationId: z.union([...OFFICE_SETTINGS_WORKSTATION_IDS]).required(false),
  workspaceId: z.string().min(1).required(false),
  activeSessionId: z.string().min(1).required(false),
})

const EMPTY_EMPLOYEES = Object.freeze({
  shan: Object.freeze({}),
  'bai-shuangming': Object.freeze({}),
  'lu-mi': Object.freeze({}),
  jingyuniang: Object.freeze({}),
  longmama: Object.freeze({}),
  claude: Object.freeze({}),
  gemini: Object.freeze({}),
  grok: Object.freeze({}),
}) satisfies Readonly<Record<OfficeSettingsEmployeeId, OfficeEmployeeRelationshipSettingsV1>>

/** Versioned relationship payload; defaults make older partial V1 values safe to read. */
export const OfficeRelationshipsSettingsV1Schema: z<OfficeRelationshipsSettingsV1> = z.object({
  schemaVersion: z.const(1).default(1),
  employees: z.object({
    shan: EmployeeRelationshipSettingsSchema.default({}),
    'bai-shuangming': EmployeeRelationshipSettingsSchema.default({}),
    'lu-mi': EmployeeRelationshipSettingsSchema.default({}),
    jingyuniang: EmployeeRelationshipSettingsSchema.default({}),
    longmama: EmployeeRelationshipSettingsSchema.default({}),
    claude: EmployeeRelationshipSettingsSchema.default({}),
    gemini: EmployeeRelationshipSettingsSchema.default({}),
    grok: EmployeeRelationshipSettingsSchema.default({}),
  }).default(EMPTY_EMPLOYEES),
})

const OfficeScheduledTaskSettingsV1Schema: z<OfficeScheduledTaskSettingsV1> = z.object({
  id: z.string().min(1),
  employeeId: z.union([...OFFICE_SETTINGS_EMPLOYEE_IDS]),
  title: z.string().min(1),
  prompt: z.string().min(1),
  date: z.string().min(1),
  time: z.string().min(1),
  recurrence: z.union(['once', 'daily']),
  enabled: z.boolean(),
  createdAt: z.number(),
  lastTriggeredKey: z.string().min(1).required(false),
  lastSessionId: z.string().min(1).required(false),
  lastTriggeredAt: z.number().required(false),
})

// Schemastery's array input is mutable even though the decoded settings value
// is exposed read-only to clients; the runtime shape is identical.
export const OfficeScheduledTasksSettingsV1Schema = z.object({
  schemaVersion: z.const(1).default(1),
  tasks: z.array(OfficeScheduledTaskSettingsV1Schema).default([]),
}) as unknown as z<OfficeScheduledTasksSettingsV1>

/** Host schema registered for `luma-office`; it resolves an empty complete employee document. */
export const OfficeRelationshipSettingsSchema = z.object({
  [OFFICE_RELATIONSHIP_SETTINGS_FIELD]: OfficeRelationshipsSettingsV1Schema.required(false),
  [OFFICE_SCHEDULE_SETTINGS_FIELD]: OfficeScheduledTasksSettingsV1Schema.required(false),
  [OFFICE_CALENDAR_SETTINGS_FIELD]: z.any().default(DEFAULT_OFFICE_WORK_CALENDAR),
  [OFFICE_HOLIDAY_CALENDAR_SETTINGS_FIELD]: z.any().default(BUILTIN_OFFICE_HOLIDAY_CACHE),
}) as unknown as z<OfficeRelationshipSettingsWire>

/** Semantic validation runs on the Host before the atomic namespace commit. */
export function validateOfficeRelationshipSettingsWire(value: unknown): void {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw Error('办公室设置无效')
  const calendar = (value as OfficeRelationshipSettingsWire).calendar
  if (calendar !== undefined) normalizeOfficeWorkCalendar(calendar)
  const holidayCalendar = (value as OfficeRelationshipSettingsWire).holidayCalendar
  if (holidayCalendar !== undefined) normalizeOfficialOfficeHolidayCache(holidayCalendar)
}

/**
 * The fixed Luma employee Agent presets.
 *
 * This module is the single authored source for the employee preset ids. The
 * office definitions, the Host-side topic guard and the workbench sidebar's
 * employee grouping all read it, so a preset id can never drift between the
 * surfaces that must agree on which sessions belong to an office employee.
 *
 * It stays dependency-free (no client, DOM or settings import) because the
 * Host-side owner loads it inside the Harness process.
 */
export const OFFICE_EMPLOYEE_PRESET_IDS = Object.freeze({
  shan: 'luma-duanmu-yan',
  'bai-shuangming': 'luma-bai-shuangming',
  'lu-mi': 'luma-lu-mi',
  jingyuniang: 'luma-jingyuniang',
  longmama: 'luma-longmama',
  claude: 'luma-claude',
  gemini: 'luma-gemini',
  grok: 'luma-grok',
} as const)

/** Employee identity keys, mirrored from the authored preset map. */
export type OfficeEmployeePresetKey = keyof typeof OFFICE_EMPLOYEE_PRESET_IDS

/** Stable IDs accepted across Host protocols and persisted settings. */
export const OFFICE_EMPLOYEE_KEYS = Object.freeze(Object.keys(OFFICE_EMPLOYEE_PRESET_IDS) as OfficeEmployeePresetKey[])
export function isOfficeEmployeeKey(value: unknown): value is OfficeEmployeePresetKey {
  return typeof value === 'string' && Object.hasOwn(OFFICE_EMPLOYEE_PRESET_IDS, value)
}

/** Every employee preset id, in catalog order. */
export const OFFICE_EMPLOYEE_PRESET_LIST: readonly string[] = Object.freeze(
  Object.values(OFFICE_EMPLOYEE_PRESET_IDS),
)

/**
 * Folder name each employee owns beneath the Main-provided root.
 *
 * Authored here rather than read from the visual catalog because the Host owner
 * must not import client presentation modules: this module is the only shared
 * leaf the Host side loads. The office's own catalog is the naming authority and
 * `luma-employee-scope-guard` fails if the two ever disagree.
 */
export const OFFICE_EMPLOYEE_FOLDER_NAMES: Readonly<Record<OfficeEmployeePresetKey, string>> = Object.freeze({
  shan: '端木嫣',
  'bai-shuangming': '白霜命',
  'lu-mi': '陆弥',
  jingyuniang: '鲸鱼娘',
  longmama: '龙妈妈',
  claude: '克劳德',
  gemini: '吉米',
  grok: '绯洛',
})

/** Whether one Harness session's preset attributes it to a built-in employee. */
export function isOfficeEmployeePreset(value: unknown): value is string {
  return typeof value === 'string' && OFFICE_EMPLOYEE_PRESET_LIST.includes(value)
}

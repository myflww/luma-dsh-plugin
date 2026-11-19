import { EMPLOYEE_CATALOG } from '../office2d/employeeCatalog.ts'
import { OFFICE_EMPLOYEE_PRESET_IDS, OFFICE_EMPLOYEE_FOLDER_NAMES } from '../../office-employee-presets.ts'
import type { OfficeEmployeeId } from '../../office-workflow/shared/office-relationships.ts'
export * from '../../office-workflow/shared/office-relationships.ts'

/** Static employee metadata; durable settings store only user-owned relationships. */
export interface EmployeeDefinition {
  readonly id: OfficeEmployeeId
  readonly displayName: string
  readonly agentPresetId: string
  readonly visualAssetNamespace: string
}

/** Independent employees with fixed Harness presets and visual identities. */
export const OFFICE_EMPLOYEE_DEFINITIONS = Object.freeze({
  shan: Object.freeze({
    id: 'shan',
    displayName: EMPLOYEE_CATALOG.shan.name,
    agentPresetId: OFFICE_EMPLOYEE_PRESET_IDS.shan,
    visualAssetNamespace: 'employee.duanmu-yan',
  }),
  'bai-shuangming': Object.freeze({
    id: 'bai-shuangming',
    displayName: EMPLOYEE_CATALOG['bai-shuangming'].name,
    agentPresetId: OFFICE_EMPLOYEE_PRESET_IDS['bai-shuangming'],
    visualAssetNamespace: 'employee.bai-shuangming',
  }),
  'lu-mi': Object.freeze({
    id: 'lu-mi',
    displayName: EMPLOYEE_CATALOG['lu-mi'].name,
    agentPresetId: OFFICE_EMPLOYEE_PRESET_IDS['lu-mi'],
    visualAssetNamespace: 'employee.lu-mi',
  }),
  jingyuniang: Object.freeze({ id: 'jingyuniang', displayName: EMPLOYEE_CATALOG.jingyuniang.name, agentPresetId: OFFICE_EMPLOYEE_PRESET_IDS.jingyuniang, visualAssetNamespace: 'employee.jingyuniang' }),
  longmama: Object.freeze({ id: 'longmama', displayName: EMPLOYEE_CATALOG.longmama.name, agentPresetId: OFFICE_EMPLOYEE_PRESET_IDS.longmama, visualAssetNamespace: 'employee.longmama' }),
  claude: Object.freeze({ id: 'claude', displayName: EMPLOYEE_CATALOG.claude.name, agentPresetId: OFFICE_EMPLOYEE_PRESET_IDS.claude, visualAssetNamespace: 'employee.claude' }),
  gemini: Object.freeze({ id: 'gemini', displayName: OFFICE_EMPLOYEE_FOLDER_NAMES.gemini, agentPresetId: OFFICE_EMPLOYEE_PRESET_IDS.gemini, visualAssetNamespace: 'employee.gemini' }),
  grok: Object.freeze({ id: 'grok', displayName: OFFICE_EMPLOYEE_FOLDER_NAMES.grok, agentPresetId: OFFICE_EMPLOYEE_PRESET_IDS.grok, visualAssetNamespace: 'employee.grok' }),
} satisfies Readonly<Record<OfficeEmployeeId, EmployeeDefinition>>)


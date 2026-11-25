import z from '@deepseek-ai/schemastery'
import { OFFICE_EMPLOYEE_KEYS, isOfficeEmployeeKey } from '../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/office-employee-presets.ts'

export const MESSAGES_NAMESPACE = 'luma-dsh-messages'
export interface RoleProfile { name: string; personality: string; scenario: string; greeting: string }
export interface MessagePreferences {
  schemaVersion: 1; selectedRole: string; userName: string; display: 'bubbles' | 'novel'
  reactions?: Record<string, 'up' | 'down'>
  contactAliases?: Record<string, string>
  profiles: Record<string, RoleProfile>; drafts: Record<string, string>; activeTopics: Record<string, string>
}
export interface MessageSettings { homes?: Record<string, string>; preferences?: MessagePreferences }
export const DEFAULT_MESSAGE_PREFERENCES: MessagePreferences = {
  schemaVersion: 1, selectedRole: 'jingyuniang', userName: '你', display: 'bubbles', profiles: {}, drafts: {}, activeTopics: {},
}
const object = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v)
export function contactDisplayName(preferences: MessagePreferences, roleId: string, originalName: string) {
  return preferences.contactAliases?.[roleId] || preferences.profiles[roleId]?.name || originalName
}
const text = (v: unknown, max: number) => typeof v === 'string' && v.length <= max && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(v)
export function decodeMessageSettings(value: unknown): MessageSettings | undefined {
  if (!object(value) || Object.keys(value).some(key => !['homes', 'preferences'].includes(key))) return
  if (value.homes !== undefined && (!object(value.homes) || Object.entries(value.homes).some(([id, path]) => !isOfficeEmployeeKey(id) || !text(path, 4000)))) return
  const p = value.preferences
  if (p !== undefined && (!object(p) || p.schemaVersion !== 1 || !isOfficeEmployeeKey(p.selectedRole) || !text(p.userName, 80)
    || !['bubbles', 'novel'].includes(p.display as string) || Object.keys(p).filter(key => key !== 'reactions' && key !== 'contactAliases').sort().join(',') !== 'activeTopics,display,drafts,profiles,schemaVersion,selectedRole,userName'
    || (p.contactAliases !== undefined && (!object(p.contactAliases) || Object.entries(p.contactAliases).some(([id, alias]) =>
      !isOfficeEmployeeKey(id) || typeof alias !== 'string' || !alias.trim() || alias.trim() !== alias || !text(alias, 60) || /[\r\n\t]/.test(alias))))
    || (p.reactions !== undefined && (!object(p.reactions) || Object.entries(p.reactions).some(([key, value]) =>
      !/^reply\/[\w.%:~/-]{1,700}$/.test(key) || (value !== 'up' && value !== 'down'))))
    || !object(p.profiles) || !object(p.drafts) || !object(p.activeTopics)
    || Object.entries(p.drafts).some(([id, draft]) => !isOfficeEmployeeKey(id) || !text(draft, 32000))
    || Object.entries(p.activeTopics).some(([id, topic]) => !isOfficeEmployeeKey(id) || !text(topic, 200) || !topic)
    || Object.entries(p.profiles).some(([id, card]) => !isOfficeEmployeeKey(id) || !object(card)
      || Object.keys(card).sort().join(',') !== 'greeting,name,personality,scenario' || !text(card.name, 80) || !card.name
      || !text(card.personality, 12000) || !text(card.scenario, 8000) || !text(card.greeting, 4000)))) return
  return value as MessageSettings
}
export function createMessageSettingsSchema(homes: Record<string, string> = {}) {
  return z.object({ homes: z.dict(z.string()).default(homes), preferences: z.any() }).default({ homes, preferences: undefined })
}
export function validateMessageSettings(value: unknown) {
  if (!decodeMessageSettings(value)) throw Error('角色消息设置格式不受支持，原记录已保留。')
}
export const MESSAGE_ROLE_IDS = OFFICE_EMPLOYEE_KEYS

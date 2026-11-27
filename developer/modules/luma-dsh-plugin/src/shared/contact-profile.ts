import { OFFICE_CHARACTER_CARDS } from '../../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/office-harness/OfficeCharacterCards.ts'
import type { OfficeEmployeePresetKey } from '../../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/office-employee-presets.ts'
import { dialogueStyle } from './companion-life.ts'

export interface RoleProfile {
  name: string
  personality: string
  scenario: string
  addressImpression: string
  /** Retained only to round-trip imported and previously saved character cards. */
  greeting?: string
}

export const CHAT_PACING = '像回消息一样接对方刚说的话，一件事说清就停。需要细讲或对方想要完整内容时，按意思分段写全。'
export const ADDRESS_GUIDANCE = 'addressImpression 是这位角色对用户的称呼或印象，自然影响称呼和语气，无需逐条叫名字或复述印象。以用户本轮要求和现行相处偏好为先，已撤回的偏好不从历史恢复。'

export function defaultContactProfile(id: OfficeEmployeePresetKey): RoleProfile {
  return {
    name: OFFICE_CHARACTER_CARDS[id].companionCard.data.name,
    personality: dialogueStyle(id),
    scenario: '你和对方通过手机互发消息，各自在自己的地方。',
    addressImpression: '把对方当作熟悉的工作伙伴，平常直接说事，偶尔叫一声老板。',
  }
}

/** Fields shared with a model; legacy greetings stay in exported cards. */
export function contactPersona({name, personality, scenario, addressImpression}: RoleProfile) {
  return {name, personality, scenario, addressImpression}
}

/** Older saves copied the entire author card even when only its name changed. */
export function decodeRoleProfile(id: OfficeEmployeePresetKey, value: unknown): RoleProfile | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return
  const fields = value as Record<string, unknown>
  if (Object.keys(fields).some(key => !['name','personality','scenario','addressImpression','greeting'].includes(key))) return
  const text = (v: unknown, max: number): v is string => typeof v === 'string' && v.length <= max && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(v)
  const {name, personality, scenario, addressImpression, greeting} = fields
  if (!text(name,80) || !name.trim() || !text(personality,12000) || !text(scenario,8000)
    || (greeting !== undefined && !text(greeting,4000))) return
  if (addressImpression !== undefined) {
    if (!text(addressImpression,4000)) return
    return { name, personality, scenario, addressImpression, ...(greeting !== undefined ? {greeting} : {}) }
  }
  if (greeting === undefined) return
  const original = OFFICE_CHARACTER_CARDS[id].companionCard.data
  const current = defaultContactProfile(id)
  return {name, personality: personality === original.personality ? current.personality : personality,
    scenario: scenario === original.scenario ? current.scenario : scenario, addressImpression: current.addressImpression, greeting}
}

export function importContactCard(id: OfficeEmployeePresetKey, json: unknown): RoleProfile {
  const record = (v: unknown): Record<string, unknown> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string,unknown> : {}
  const root = record(json), data = record(root.data ?? root)
  const ext = record(record(data.extensions).luma)
  const addressImpression = ext.addressImpression ?? data.addressImpression
  const profile = decodeRoleProfile(id, {name:data.name, personality:data.personality ?? data.description ?? '',
    scenario:data.scenario ?? defaultContactProfile(id).scenario, greeting:data.first_mes ?? data.greeting ?? '',
    ...(addressImpression !== undefined ? {addressImpression} : {})})
  if (!profile) throw Error('角色卡字段或长度不受支持。')
  return profile
}

export function exportContactCard(profile: RoleProfile) {
  return { spec:'chara_card_v2', spec_version:'2.0', data:{
    name:profile.name, description:'', personality:profile.personality, scenario:profile.scenario,
    first_mes:profile.greeting ?? '', mes_example:'', creator_notes:'Luma 本地角色设定',
    system_prompt:'', post_history_instructions:'', alternate_greetings:[], tags:['Luma'], creator:'', character_version:'2.0',
    extensions:{luma:{addressImpression:profile.addressImpression}},
  } }
}

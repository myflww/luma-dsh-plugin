import { COMPANION_BOSS_RELATIONSHIP, COMPANION_DISPATCH_RELATIONSHIP, COMPANION_FICTION, COMPANION_FICTION_REVISION, COMPANION_RELATIONSHIP_PROMPT, COMPANION_TOWN_LORE, COMPANION_VOICE_EXAMPLE_INPUT } from './companion-fiction.ts'
import { COMPANION_SPEECH_PROFILES, companionSpeechStyleRevision, renderCompanionSpeechStyle } from './companion-speech-style.ts'
import { COMPANION_DIALOGUE_POLICY_REVISION, renderNaturalDialoguePolicy } from './companion-dialogue-policy.ts'

export type CompanionEmployeeId = keyof typeof COMPANION_FICTION

/** Both forms use one approved rule source; brief is reserved for bounded
 * proactive speech, while the complete card keeps the detailed chat policy. */
export function renderCompanionCharacterSystemPrompt(employeeId: CompanionEmployeeId, detail: 'full' | 'brief' = 'full'): string {
  return `${COMPANION_RELATIONSHIP_PROMPT}\n${renderCompanionSpeechStyle(employeeId, detail)}${detail === 'full' ? `\n${renderNaturalDialoguePolicy('private', detail)}` : ''}`
}

/** Private chat needs one light voice reference, rather than replaying a whole
 * gallery of corrections every turn. Exported Tavern cards retain their full
 * examples. The sample remains setting data, never an actual assistant turn. */
export function renderCompanionChatVoiceExample(employeeId: CompanionEmployeeId): string {
  if (!Object.hasOwn(COMPANION_SPEECH_PROFILES, employeeId)) throw new TypeError('Unknown employee')
  const example = COMPANION_SPEECH_PROFILES[employeeId].situations.find(item => item.situation === 'daily')!.example
  return `<START>\n{{char}}: ${example}`
}

/** Matches the existing Wanxiang / SillyTavern TavernCardV2 import contract.
 * This is a projection of the official source, never a second editable store.
 */
export interface CompanionCharacterBook {
  readonly name: string
  readonly description: string
  readonly entries: readonly {
    readonly id: number
    readonly keys: readonly string[]
    readonly secondary_keys: readonly string[]
    readonly comment: string
    readonly content: string
    readonly constant: boolean
    readonly selective: false
    readonly insertion_order: number
    readonly enabled: true
    readonly position: 'before_char'
    readonly extensions: Readonly<Record<string, never>>
  }[]
  readonly extensions: Readonly<{ luma: Readonly<{ revision: string }> }>
}

export interface CompanionTavernCardV2 {
  readonly spec: 'chara_card_v2'
  readonly spec_version: '2.0'
  readonly data: Readonly<{
    name: string
    description: string
    personality: string
    scenario: string
    first_mes: string
    mes_example: string
    creator_notes: string
    system_prompt: string
    post_history_instructions: string
    alternate_greetings: readonly string[]
    tags: readonly string[]
    creator: string
    character_version: string
    character_book: CompanionCharacterBook
    extensions: Readonly<{ luma: Readonly<{ employeeId: CompanionEmployeeId; sourceRevision: string }> }>
  }>
}

/** Uses official constant/key activation fields; no parallel worldbook format. */
export function projectCompanionWorldbook(employeeId: CompanionEmployeeId): CompanionCharacterBook {
  if (!Object.hasOwn(COMPANION_FICTION, employeeId)) throw new TypeError('Unknown employee')
  const lore = [...COMPANION_TOWN_LORE, ...COMPANION_FICTION[employeeId].lore]
  return Object.freeze({
    name: 'Luma · 独立角色背景与日常',
    description: '按相关话题带出本角色的身份、气质和生活偏好；没有共同主线或自动剧情。',
    entries: Object.freeze(lore.map(entry => Object.freeze({
      id: entry.id, keys: entry.keys, secondary_keys: Object.freeze([]), comment: entry.title, content: entry.content,
      constant: entry.constant, selective: false as const, insertion_order: entry.priority,
      enabled: true as const, position: 'before_char' as const, extensions: Object.freeze({}),
    }))),
    extensions: Object.freeze({ luma: Object.freeze({ revision: COMPANION_FICTION_REVISION }) }),
  })
}

export function projectCompanionCardFromSource(employeeId: CompanionEmployeeId, source: {
  readonly name: string; readonly appearance: readonly string[]; readonly revision: string
}): CompanionTavernCardV2 {
  if (!Object.hasOwn(COMPANION_FICTION, employeeId)) throw new TypeError('Unknown employee')
  const fiction = COMPANION_FICTION[employeeId]
  const worldbook = projectCompanionWorldbook(employeeId)
  return Object.freeze({
    spec: 'chara_card_v2', spec_version: '2.0',
    data: Object.freeze({
      name: source.name,
      description: [`${source.name}，${fiction.age} 岁，${fiction.occupation}。`, ...source.appearance.slice(0, 1), ...fiction.background].join('\n'),
      // Retain the approved identity and all canonical voice traits. This one
      // legacy rigid teaching order conflicts with natural conversation; the
      // current speech policy gives reasoning structure only when useful.
      personality: [...fiction.personality.filter(line => employeeId !== 'claude'
        || !line.startsWith('先说判断，再给依据，最后才说建议，顺序从不颠倒。')),
        ...fiction.voice, fiction.emotion, fiction.relationship].join('\n'),
      scenario: `${worldbook.entries[0]!.content}\n${COMPANION_BOSS_RELATIONSHIP}\n${COMPANION_DISPATCH_RELATIONSHIP}`,
      first_mes: fiction.greeting,
      mes_example: fiction.examples.map((line, index) => `<START>\n${index === 0 ? `{{user}}: ${COMPANION_VOICE_EXAMPLE_INPUT}\n` : ''}{{char}}: ${line}`).join('\n'),
      creator_notes: `从 Luma 唯一角色源实时投影。形象来源：${fiction.origin.source}。修改人设请编辑该源；不另存一套角色卡。`,
      system_prompt: renderCompanionCharacterSystemPrompt(employeeId),
      post_history_instructions: '承接老板当前的话，以自己的节奏和措辞回应，不套用其他同事的口吻。旧回复若与当前身份、性格或场景不符，按当前角色卡纠正，不延续旧口吻。示例只示范口吻，不是已发生的事。不替用户说话或决定感受，不编造现实工作结果。',
      alternate_greetings: Object.freeze([]),
      tags: Object.freeze(['Luma', fiction.origin.kind === 'luma-original' ? 'Luma 原创' : '网络形象适配']), creator: 'Luma', character_version: COMPANION_FICTION_REVISION,
      character_book: worldbook,
      extensions: Object.freeze({ luma: Object.freeze({ employeeId, sourceRevision: `${source.revision}+${COMPANION_FICTION_REVISION}+${COMPANION_DIALOGUE_POLICY_REVISION}+${companionSpeechStyleRevision(employeeId)}` }) }),
    }),
  })
}

/** Replacement body for the employee work presets. Keep their IDs and
 * complete Harness plugin rosters; only the persona body changes. This function
 * cannot accept a card, relationship, chat transcript or arbitrary extra text.
 */
export function renderNeutralCompanionWorkPersona(employeeId: CompanionEmployeeId): string {
  if (!Object.hasOwn(COMPANION_FICTION, employeeId)) throw new TypeError('Unknown employee')
  return [
    'You are an AI task assistant powered by the {{model}} model. Your working directory is {{cwd}}.',
    'Carry out the current authorized request using the standard Harness tools when useful. Preserve user-owned work and respect workspace, approval and permission boundaries.',
    'Distinguish evidence, inference and uncertainty. Verify consequential outcomes with proportionate checks and report only work actually performed.',
    'Use the language requested by the user. Explain results clearly and directly.',
  ].join('\n\n')
}

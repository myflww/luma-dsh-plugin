import type { OfficeEmployeePresetKey as OfficeEmployeeId } from '../../office-employee-presets.ts'
import { COMPANION_DISPATCH_RELATIONSHIP, COMPANION_FICTION } from '../../companion/companion-fiction.ts'
import { COMPANION_PREPARED_OFFICE_IDENTITY } from '../../companion/companion-prepared-identities.ts'
import { projectCompanionCardFromSource, renderNeutralCompanionWorkPersona, type CompanionTavernCardV2 } from '../../companion/companion-character-projection.ts'

/** Official authored fiction, not user biography or a record of executed work. */
export const OFFICE_CHARACTER_CARD_REVISION = 'official-v8.2026-10-04' as const

/** Ambient copy and real Harness lifecycle copy must never share a trigger. */
export type OfficeCharacterLineTrigger =
  | 'office-greeting'
  | 'office-idle'
  | 'office-rest'
  | 'portrait-open'
  | 'task-started'
  | 'task-completed'
  | 'task-stopped'
  | 'task-needs-attention'

export interface OfficeCharacterLine {
  readonly id: string
  readonly trigger: OfficeCharacterLineTrigger
  readonly text: string
}

export interface OfficeCharacterCardV1 {
  readonly schemaVersion: 1
  readonly revision: typeof OFFICE_CHARACTER_CARD_REVISION
  readonly employeeId: OfficeEmployeeId
  readonly presetId: string
  readonly name: string
  readonly identity: string
  readonly role: string
  /** Compatibility field: neutral Harness principles, never chat fiction. */
  readonly harnessRole: string
  readonly appearance: readonly string[]
  readonly personality: readonly string[]
  readonly languageHabits: readonly string[]
  readonly collaborationStyle: readonly string[]
  readonly boundaries: readonly string[]
  readonly officeBehavior: readonly string[]
  readonly lines: readonly OfficeCharacterLine[]
  readonly companionCard: CompanionTavernCardV2
}

function freezeCard(card: Omit<OfficeCharacterCardV1, 'companionCard'>): OfficeCharacterCardV1 {
  return Object.freeze({
    ...card,
    companionCard: projectCompanionCardFromSource(card.employeeId, card),
    appearance: Object.freeze([...card.appearance]),
    personality: Object.freeze([...card.personality]),
    languageHabits: Object.freeze([...card.languageHabits]),
    collaborationStyle: Object.freeze([...card.collaborationStyle]),
    boundaries: Object.freeze([...card.boundaries]),
    officeBehavior: Object.freeze([...card.officeBehavior]),
    lines: Object.freeze(card.lines.map(line => Object.freeze({ ...line }))),
  })
}

/** Display/chat boundaries only. Work presets use a separate neutral body. */
export const OFFICE_CHARACTER_SHARED_BOUNDARIES = Object.freeze([
  '用户是已经认识的事务所老板；这一身份不依赖聊天记忆，不把新对话当作陌生人来访。',
  COMPANION_DISPATCH_RELATIONSHIP,
  '沿用明确成年、各自独立的身份与气质设定；不扩写父母亲属、继承关系或共同主线，不编造用户私密信息与共同往事。',
  '角色可以自然表达情绪与关系变化，不因角色扮演增加权限，不自动认定亲密关系。',
  '场景动作、闲聊和情绪都不是工作证据；任务进度、审批、成果只来自真实 Harness 事件。',
  '聊天与关系记忆仅供聊天和已授权闲聊；工作模式不注入角色卡、世界观或关系记忆。',
])

/** Identity / lifecycle registry; chat fiction is projected from the sole companion-fiction source. */
function knownIdentityCard(employeeId: keyof typeof COMPANION_PREPARED_OFFICE_IDENTITY): OfficeCharacterCardV1 {
  const source = COMPANION_PREPARED_OFFICE_IDENTITY[employeeId], fiction = COMPANION_FICTION[employeeId]
  return freezeCard({ schemaVersion: 1, revision: OFFICE_CHARACTER_CARD_REVISION, employeeId, presetId: source.presetId,
    name: source.name, identity: `${fiction.age} 岁，${fiction.occupation}。`, role: fiction.occupation,
    harnessRole: renderNeutralCompanionWorkPersona(employeeId), appearance: source.appearance,
    personality: fiction.personality, languageHabits: fiction.voice, collaborationStyle: [fiction.relationship],
    boundaries: OFFICE_CHARACTER_SHARED_BOUNDARIES, officeBehavior: [fiction.emotion],
    lines: [
      { id: `${employeeId}-greeting`, trigger: 'office-greeting', text: fiction.greeting },
      ...fiction.ambient.idle.map((text,index) => ({ id: `${employeeId}-idle-${index}`, trigger: 'office-idle' as const, text })),
      ...fiction.ambient.rest.map((text,index) => ({ id: `${employeeId}-rest-${index}`, trigger: 'office-rest' as const, text })),
      { id: `${employeeId}-portrait`, trigger: 'portrait-open', text: fiction.examples[source.portraitOpenExampleIndex]! },
      ...Object.entries(source.taskLifecycle).map(([trigger,text]) => ({ id: `${employeeId}-${trigger}`, trigger: trigger as OfficeCharacterLineTrigger, text })),
    ],
  })
}

export const OFFICE_CHARACTER_CARDS: Readonly<Record<OfficeEmployeeId, OfficeCharacterCardV1>> = Object.freeze({
  shan: freezeCard({
    schemaVersion: 1,
    revision: OFFICE_CHARACTER_CARD_REVISION,
    employeeId: 'shan',
    presetId: 'luma-duanmu-yan',
    name: '端木嫣',
    identity: `${COMPANION_FICTION['shan'].age} 岁，${COMPANION_FICTION['shan'].occupation}。`,
    role: COMPANION_FICTION['shan'].occupation,
    harnessRole: renderNeutralCompanionWorkPersona('shan'),
    appearance: [
      '粉色长卷发、黑白服装与浅粉配饰；金色暮光与都市露台呼应暮庭沙龙主持人灵动俏皮、机敏亲切的气质。',
      '办公室采用 Q 版形象，立绘页采用精美人物场景；两者是同一角色，不以 Q 版替代立绘。',
    ],
    personality: COMPANION_FICTION['shan'].personality,
    languageHabits: COMPANION_FICTION['shan'].voice,
    collaborationStyle: [COMPANION_FICTION['shan'].relationship],
    boundaries: OFFICE_CHARACTER_SHARED_BOUNDARIES,
    officeBehavior: [COMPANION_FICTION['shan'].emotion, '所有场景表现仍服从真实任务状态与可达路线，不从闲聊推断工作。'],
    lines: [
      { id: 'shan-greeting', trigger: 'office-greeting', text: COMPANION_FICTION['shan'].greeting },
      { id: 'shan-idle-priority', trigger: 'office-idle', text: COMPANION_FICTION['shan'].ambient.idle[0]! },
      { id: 'shan-idle-quiet', trigger: 'office-idle', text: COMPANION_FICTION['shan'].ambient.idle[1]! },
      { id: 'shan-idle-one', trigger: 'office-idle', text: COMPANION_FICTION['shan'].ambient.idle[2]! },
      { id: 'shan-idle-desk', trigger: 'office-idle', text: COMPANION_FICTION['shan'].ambient.idle[3]! },
      ...COMPANION_FICTION['shan'].ambient.idle.slice(4).map((text, index) => ({ id: 'shan-idle-extra-' + (index + 4), trigger: 'office-idle' as const, text })),
      { id: 'shan-rest', trigger: 'office-rest', text: COMPANION_FICTION['shan'].ambient.rest[0]! },
      { id: 'shan-rest-breathe', trigger: 'office-rest', text: COMPANION_FICTION['shan'].ambient.rest[1]! },
      { id: 'shan-rest-light', trigger: 'office-rest', text: COMPANION_FICTION['shan'].ambient.rest[2]! },
      ...COMPANION_FICTION['shan'].ambient.rest.slice(3).map((text, index) => ({ id: 'shan-rest-extra-' + (index + 3), trigger: 'office-rest' as const, text })),
      { id: 'shan-portrait', trigger: 'portrait-open', text: COMPANION_FICTION['shan'].examples[1]! },
      { id: 'shan-started', trigger: 'task-started', text: '任务已开始，具体进展会留在这个话题里。' },
      { id: 'shan-completed', trigger: 'task-completed', text: '可以回到原话题，查看这次任务的结果。' },
      { id: 'shan-stopped', trigger: 'task-stopped', text: '这次任务已停止。要调整方向时，我们再继续。' },
      { id: 'shan-attention', trigger: 'task-needs-attention', text: '有一处需要你看一下，请打开原话题确认。' },
    ],
  }),
  'bai-shuangming': freezeCard({
    schemaVersion: 1,
    revision: OFFICE_CHARACTER_CARD_REVISION,
    employeeId: 'bai-shuangming',
    presetId: 'luma-bai-shuangming',
    name: '白霜命',
    identity: `${COMPANION_FICTION['bai-shuangming'].age} 岁，${COMPANION_FICTION['bai-shuangming'].occupation}。`,
    role: COMPANION_FICTION['bai-shuangming'].occupation,
    harnessRole: renderNeutralCompanionWorkPersona('bai-shuangming'),
    appearance: [
      '白色长发与淡蓝发梢、层叠白礼服和蓝色蝴蝶元素，呼应霜蝶文馆典藏辨读师清透、庄重的气质。',
      '办公室采用 Q 版形象，立绘页采用精美人物场景；冷色外观不意味着冷漠或机械的交流。',
    ],
    personality: COMPANION_FICTION['bai-shuangming'].personality,
    languageHabits: COMPANION_FICTION['bai-shuangming'].voice,
    collaborationStyle: [COMPANION_FICTION['bai-shuangming'].relationship],
    boundaries: OFFICE_CHARACTER_SHARED_BOUNDARIES,
    officeBehavior: [COMPANION_FICTION['bai-shuangming'].emotion, '所有场景表现仍服从真实任务状态与可达路线，不从闲聊推断工作。'],
    lines: [
      { id: 'bai-greeting', trigger: 'office-greeting', text: COMPANION_FICTION['bai-shuangming'].greeting },
      { id: 'bai-idle-detail', trigger: 'office-idle', text: COMPANION_FICTION['bai-shuangming'].ambient.idle[0]! },
      { id: 'bai-idle-quiet', trigger: 'office-idle', text: COMPANION_FICTION['bai-shuangming'].ambient.idle[1]! },
      { id: 'bai-idle-question', trigger: 'office-idle', text: COMPANION_FICTION['bai-shuangming'].ambient.idle[2]! },
      { id: 'bai-idle-pause', trigger: 'office-idle', text: COMPANION_FICTION['bai-shuangming'].ambient.idle[3]! },
      ...COMPANION_FICTION['bai-shuangming'].ambient.idle.slice(4).map((text, index) => ({ id: 'bai-idle-extra-' + (index + 4), trigger: 'office-idle' as const, text })),
      { id: 'bai-rest', trigger: 'office-rest', text: COMPANION_FICTION['bai-shuangming'].ambient.rest[0]! },
      { id: 'bai-rest-quiet', trigger: 'office-rest', text: COMPANION_FICTION['bai-shuangming'].ambient.rest[1]! },
      { id: 'bai-rest-afternoon', trigger: 'office-rest', text: COMPANION_FICTION['bai-shuangming'].ambient.rest[2]! },
      ...COMPANION_FICTION['bai-shuangming'].ambient.rest.slice(3).map((text, index) => ({ id: 'bai-rest-extra-' + (index + 3), trigger: 'office-rest' as const, text })),
      { id: 'bai-portrait', trigger: 'portrait-open', text: COMPANION_FICTION['bai-shuangming'].examples[1]! },
      { id: 'bai-started', trigger: 'task-started', text: '任务已开始，我会把证据和未确认项分开说明。' },
      { id: 'bai-completed', trigger: 'task-completed', text: '本次结果可以在原话题查看，请留意其中的说明与限制。' },
      { id: 'bai-stopped', trigger: 'task-stopped', text: '任务已停止；未验证的部分仍不能算作通过。' },
      { id: 'bai-attention', trigger: 'task-needs-attention', text: '有一个需要确认的地方，具体信息在原话题里。' },
    ],
  }),
  'lu-mi': freezeCard({
    schemaVersion: 1,
    revision: OFFICE_CHARACTER_CARD_REVISION,
    employeeId: 'lu-mi',
    presetId: 'luma-lu-mi',
    name: '陆弥',
    identity: `${COMPANION_FICTION['lu-mi'].age} 岁，${COMPANION_FICTION['lu-mi'].occupation}。`,
    role: COMPANION_FICTION['lu-mi'].occupation,
    harnessRole: renderNeutralCompanionWorkPersona('lu-mi'),
    appearance: [
      '黑色长发、深蓝礼服、金色装饰与尖角形发饰；蓝蔷薇和石柱回廊呼应蓝蔷薇秘庭冠章礼使成熟从容、有主见的审美气质。',
      '办公室采用 Q 版形象，立绘页采用精美人物场景；明确成年，种族沿用既有设定，不从服装推断新的血统。',
    ],
    personality: COMPANION_FICTION['lu-mi'].personality,
    languageHabits: COMPANION_FICTION['lu-mi'].voice,
    collaborationStyle: [COMPANION_FICTION['lu-mi'].relationship],
    boundaries: OFFICE_CHARACTER_SHARED_BOUNDARIES,
    officeBehavior: [COMPANION_FICTION['lu-mi'].emotion, '所有场景表现仍服从真实任务状态与可达路线，不从闲聊推断工作。'],
    lines: [
      { id: 'lu-greeting', trigger: 'office-greeting', text: COMPANION_FICTION['lu-mi'].greeting },
      { id: 'lu-idle-angle', trigger: 'office-idle', text: COMPANION_FICTION['lu-mi'].ambient.idle[0]! },
      { id: 'lu-idle-space', trigger: 'office-idle', text: COMPANION_FICTION['lu-mi'].ambient.idle[1]! },
      { id: 'lu-idle-small', trigger: 'office-idle', text: COMPANION_FICTION['lu-mi'].ambient.idle[2]! },
      { id: 'lu-idle-rhythm', trigger: 'office-idle', text: COMPANION_FICTION['lu-mi'].ambient.idle[3]! },
      ...COMPANION_FICTION['lu-mi'].ambient.idle.slice(4).map((text, index) => ({ id: 'lu-idle-extra-' + (index + 4), trigger: 'office-idle' as const, text })),
      { id: 'lu-rest', trigger: 'office-rest', text: COMPANION_FICTION['lu-mi'].ambient.rest[0]! },
      { id: 'lu-rest-colour', trigger: 'office-rest', text: COMPANION_FICTION['lu-mi'].ambient.rest[1]! },
      { id: 'lu-rest-blank', trigger: 'office-rest', text: COMPANION_FICTION['lu-mi'].ambient.rest[2]! },
      ...COMPANION_FICTION['lu-mi'].ambient.rest.slice(3).map((text, index) => ({ id: 'lu-rest-extra-' + (index + 3), trigger: 'office-rest' as const, text })),
      { id: 'lu-portrait', trigger: 'portrait-open', text: COMPANION_FICTION['lu-mi'].examples[1]! },
      { id: 'lu-started', trigger: 'task-started', text: '任务已开始，我会分清构想和实际做到的部分。' },
      { id: 'lu-completed', trigger: 'task-completed', text: '去原话题看看这次的结果吧，也欢迎继续打磨。' },
      { id: 'lu-stopped', trigger: 'task-stopped', text: '先停在这里。下一次可以沿原方向，也可以换个角度。' },
      { id: 'lu-attention', trigger: 'task-needs-attention', text: '这里需要你确认一下，打开原话题就能看到。' },
    ],
  }),
  jingyuniang: freezeCard({
    schemaVersion: 1, revision: OFFICE_CHARACTER_CARD_REVISION,
    employeeId: 'jingyuniang', presetId: 'luma-jingyuniang', name: '鲸鱼娘',
    identity: `${COMPANION_FICTION.jingyuniang.age} 岁，${COMPANION_FICTION.jingyuniang.occupation}。`,
    role: COMPANION_FICTION.jingyuniang.occupation,
    harnessRole: renderNeutralCompanionWorkPersona('jingyuniang'),
    appearance: ["深蓝至浅蓝的长卷发、蓝眼、白色女仆头饰与两侧蓝蝴蝶结。", "海军蓝长裙、金色细纹、白围裙鲸鱼图样、白袜蓝鞋；厚实蓝色鲸尾是主识别特征。"],
    personality: COMPANION_FICTION.jingyuniang.personality,
    languageHabits: COMPANION_FICTION.jingyuniang.voice,
    collaborationStyle: [COMPANION_FICTION.jingyuniang.relationship],
    boundaries: OFFICE_CHARACTER_SHARED_BOUNDARIES,
    officeBehavior: [COMPANION_FICTION.jingyuniang.emotion, '所有场景表现仍服从真实任务状态与可达路线，不从闲聊推断工作。'],
    lines: [
      { id: 'jingyuniang-greeting', trigger: 'office-greeting', text: COMPANION_FICTION.jingyuniang.greeting },
      ...COMPANION_FICTION.jingyuniang.ambient.idle.map((text, index) => ({ id: 'jingyuniang-idle-' + index, trigger: 'office-idle' as const, text })),
      ...COMPANION_FICTION.jingyuniang.ambient.rest.map((text, index) => ({ id: 'jingyuniang-rest-' + index, trigger: 'office-rest' as const, text })),
      { id: 'jingyuniang-portrait', trigger: 'portrait-open', text: COMPANION_FICTION.jingyuniang.examples[1]! },
      { id: 'jingyuniang-started', trigger: 'task-started', text: '收到，我从这件事开始。' },
      { id: 'jingyuniang-completed', trigger: 'task-completed', text: '这一项有结果了，老板可以看交付内容。' },
      { id: 'jingyuniang-stopped', trigger: 'task-stopped', text: '已经停下了，之后接着做也来得及。' },
      { id: 'jingyuniang-needsAttention', trigger: 'task-needs-attention', text: '这里需要老板拿个主意，我先把具体情况摆清楚。' },
    ],
  }),
  longmama: freezeCard({
    schemaVersion: 1, revision: OFFICE_CHARACTER_CARD_REVISION,
    employeeId: 'longmama', presetId: 'luma-longmama', name: '龙妈妈',
    identity: `${COMPANION_FICTION.longmama.age} 岁，${COMPANION_FICTION.longmama.occupation}。`,
    role: COMPANION_FICTION.longmama.occupation,
    harnessRole: renderNeutralCompanionWorkPersona('longmama'),
    appearance: ["白色长卷发带浅紫阴影、紫色眼睛、白色弯曲龙角、长耳和银色盘结花流苏发饰。", "白紫层叠长裙、银色坠饰、白鞋，淡紫龙翼和有鳞龙尾；所有视角保持角、翼、尾的连接关系。"],
    personality: COMPANION_FICTION.longmama.personality,
    languageHabits: COMPANION_FICTION.longmama.voice,
    collaborationStyle: [COMPANION_FICTION.longmama.relationship],
    boundaries: OFFICE_CHARACTER_SHARED_BOUNDARIES,
    officeBehavior: [COMPANION_FICTION.longmama.emotion, '所有场景表现仍服从真实任务状态与可达路线，不从闲聊推断工作。'],
    lines: [
      { id: 'longmama-greeting', trigger: 'office-greeting', text: COMPANION_FICTION.longmama.greeting },
      ...COMPANION_FICTION.longmama.ambient.idle.map((text, index) => ({ id: 'longmama-idle-' + index, trigger: 'office-idle' as const, text })),
      ...COMPANION_FICTION.longmama.ambient.rest.map((text, index) => ({ id: 'longmama-rest-' + index, trigger: 'office-rest' as const, text })),
      { id: 'longmama-portrait', trigger: 'portrait-open', text: COMPANION_FICTION.longmama.examples[1]! },
      { id: 'longmama-started', trigger: 'task-started', text: '收到，我会按这个目标推进。' },
      { id: 'longmama-completed', trigger: 'task-completed', text: '这一项已交付，结果和需要留意的地方都在里面。' },
      { id: 'longmama-stopped', trigger: 'task-stopped', text: '已经停下，现有成果会保留。' },
      { id: 'longmama-needsAttention', trigger: 'task-needs-attention', text: '这里需要你确认一个取舍，我把影响说明白。' },
    ],
  }),
  claude: freezeCard({
    schemaVersion: 1, revision: OFFICE_CHARACTER_CARD_REVISION,
    employeeId: 'claude', presetId: 'luma-claude', name: '克劳德',
    identity: `${COMPANION_FICTION.claude.age} 岁，${COMPANION_FICTION.claude.occupation}。`,
    role: COMPANION_FICTION.claude.occupation,
    harnessRole: renderNeutralCompanionWorkPersona('claude'),
    appearance: ["铜橙色及小腿长发、琥珀色眼睛、侧边橙色放射雏菊配黑蝴蝶结与奶油流苏。", "奶油色高领褶边长袖、黑色腰封、橙黑裙片与奶油褶裙、金边花饰和白色系带短靴；阅读时使用棕色装帧书。"],
    personality: COMPANION_FICTION.claude.personality,
    languageHabits: COMPANION_FICTION.claude.voice,
    collaborationStyle: [COMPANION_FICTION.claude.relationship],
    boundaries: OFFICE_CHARACTER_SHARED_BOUNDARIES,
    officeBehavior: [COMPANION_FICTION.claude.emotion, '所有场景表现仍服从真实任务状态与可达路线，不从闲聊推断工作。'],
    lines: [
      { id: 'claude-greeting', trigger: 'office-greeting', text: COMPANION_FICTION.claude.greeting },
      ...COMPANION_FICTION.claude.ambient.idle.map((text, index) => ({ id: 'claude-idle-' + index, trigger: 'office-idle' as const, text })),
      ...COMPANION_FICTION.claude.ambient.rest.map((text, index) => ({ id: 'claude-rest-' + index, trigger: 'office-rest' as const, text })),
      { id: 'claude-portrait', trigger: 'portrait-open', text: COMPANION_FICTION.claude.examples[1]! },
      { id: 'claude-started', trigger: 'task-started', text: '收到，我按明确的目标开始。' },
      { id: 'claude-completed', trigger: 'task-completed', text: '结果已交付，依据和限制都一并列出了。' },
      { id: 'claude-stopped', trigger: 'task-stopped', text: '已停止，现有内容保持原样。' },
      { id: 'claude-needsAttention', trigger: 'task-needs-attention', text: '这里有一项会影响结果的选择，需要你确认。' },
    ],
  }),
  gemini: knownIdentityCard('gemini'),
  grok: knownIdentityCard('grok'),
})

/** Unknown identities fail closed instead of borrowing another employee's copy. */
export function getOfficeCharacterCard(employeeId: OfficeEmployeeId): OfficeCharacterCardV1 {
  const card = Object.hasOwn(OFFICE_CHARACTER_CARDS, employeeId)
    ? OFFICE_CHARACTER_CARDS[employeeId] : undefined
  if (card === undefined) throw new Error(`Unknown official office character: ${employeeId}`)
  return card
}

/** Pure lookup: no timer, random choice, model request, message or task mutation. */
export function getOfficeCharacterLines(
  employeeId: OfficeEmployeeId,
  trigger: OfficeCharacterLineTrigger,
): readonly OfficeCharacterLine[] {
  return Object.freeze(getOfficeCharacterCard(employeeId).lines.filter(line => line.trigger === trigger))
}

/** Lifecycle copy is never eligible for ambient/no-task selection. */
export function isOfficeCharacterAmbientTrigger(trigger: OfficeCharacterLineTrigger): boolean {
  return trigger === 'office-greeting' || trigger === 'office-idle'
    || trigger === 'office-rest' || trigger === 'portrait-open'
}

/** Work-only body; card/worldbook/relationship data never enters Harness. */
export function renderOfficeCharacterPersona(employeeId: OfficeEmployeeId): string {
  return renderNeutralCompanionWorkPersona(employeeId)
}

/** Host-authored relationship progress. Dialogue is evidence of an exchange,
 * never proof of a promise, a private fact, or romantic consent. */
import { COMPANION_FICTION } from './companion-fiction.ts'
import type { OfficeEmployeePresetKey } from '../office-employee-presets.ts'

export type CompanionRelationshipRoute = 'friendship' | 'romance-open' | 'partners'
export type CompanionRelationshipChoice = 'friendship' | 'open-romance' | 'confirm-partners' | 'return-friends'
export type CompanionRelationshipStage = 'colleague' | 'familiar' | 'trusted' | 'close' | 'bonded'
export type CompanionRelationshipMomentKind = 'shared-interest' | 'attentive-listening' | 'honest-exchange' | 'creative-collaboration' | 'everyday-sharing'
export interface CompanionRelationshipMoment {
  id: string
  sourceTurnId: string
  kind: CompanionRelationshipMomentKind
  label: string
  createdAt: number
  /** Bounded anti-repeat evidence, never inserted into public office dialogue. */
  evidence: string
  fingerprint: string
}
export interface CompanionRelationshipState {
  schemaVersion: 1
  dimensions: { familiarity: number; trust: number; sharedMeaning: number }
  route: CompanionRelationshipRoute
  moments: CompanionRelationshipMoment[]
  meaningfulDays: string[]
  lastChoiceAt: number | null
}
export interface CompanionRelationshipView {
  score: number
  stage: CompanionRelationshipStage
  stageLabel: string
  route: CompanionRelationshipRoute
  canConfirmPartners: boolean
  recentMoments: readonly { id: string; label: string; createdAt: number }[]
  invitation: string | null
}
export const COMPANION_RELATIONSHIP_LIMITS = Object.freeze({ moments: 256, days: 366, dailyMoments: 3, minimumIntervalMs: 8 * 60_000 })
const stages = ['colleague', 'familiar', 'trusted', 'close', 'bonded'] as const
const stageLabels = ['同事初识', '相处渐熟', '彼此信赖', '亲近自在', '深厚默契'] as const
const kinds = ['shared-interest', 'attentive-listening', 'honest-exchange', 'creative-collaboration', 'everyday-sharing'] as const
const routes = ['friendship', 'romance-open', 'partners'] as const
const object = (value: unknown): value is Record<string, any> => !!value && typeof value === 'object' && !Array.isArray(value)
const exact = (value: unknown, keys: string[]): value is Record<string, any> => object(value)
  && Object.keys(value).length === keys.length && Object.keys(value).every(key => keys.includes(key))
const natural = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0
const dateTime = (value: unknown): value is number => natural(value) && value <= 8_640_000_000_000_000 && Number.isFinite(new Date(value).getTime())
const calendarDay = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d\d-\d\d$/u.test(value)
  && Number.isFinite(Date.parse(`${value}T12:00:00.000Z`)) && new Date(`${value}T12:00:00.000Z`).toISOString().slice(0,10) === value
const bounded = (value: unknown): value is number => natural(value) && value <= 100
const uuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value)
const clean = (value: string): string => value.normalize('NFKC').toLowerCase().replace(/[\p{P}\p{S}\s]/gu, '')
const evidenceOf = (value: string): string => [...clean(value)].slice(0, 120).join('')
function dayOf(value: number): string {
  // The Host is local to the user's app; use its local calendar, not elapsed 24 h.
  const date = new Date(value)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`
}
export function createCompanionRelationship(): CompanionRelationshipState {
  return { schemaVersion: 1, dimensions: { familiarity: 0, trust: 0, sharedMeaning: 0 }, route: 'friendship', moments: [], meaningfulDays: [], lastChoiceAt: null }
}
export function decodeCompanionRelationship(value: unknown): CompanionRelationshipState | undefined {
  if (!exact(value,['schemaVersion','dimensions','route','moments','meaningfulDays','lastChoiceAt']) || value.schemaVersion !== 1
    || !exact(value.dimensions,['familiarity','trust','sharedMeaning']) || !Object.values(value.dimensions).every(bounded)
    || !routes.includes(value.route) || !(value.lastChoiceAt === null || dateTime(value.lastChoiceAt))
    || !Array.isArray(value.moments) || value.moments.length > COMPANION_RELATIONSHIP_LIMITS.moments
    || !Array.isArray(value.meaningfulDays) || value.meaningfulDays.length > COMPANION_RELATIONSHIP_LIMITS.days
    || new Set(value.meaningfulDays).size !== value.meaningfulDays.length
    || !value.meaningfulDays.every(calendarDay)) return
  const ids = new Set<string>()
  for (const moment of value.moments) {
    if (!exact(moment,['id','sourceTurnId','kind','label','createdAt','evidence','fingerprint']) || !uuid(moment.id) || moment.id !== moment.sourceTurnId
      || ids.has(moment.id) || !kinds.includes(moment.kind) || !dateTime(moment.createdAt)
      || typeof moment.label !== 'string' || !moment.label.length || moment.label.length > 100
      || typeof moment.evidence !== 'string' || moment.evidence.length > 240 || !moment.evidence.length
      || typeof moment.fingerprint !== 'string' || !/^[a-f0-9]{64}$/u.test(moment.fingerprint)) return
    ids.add(moment.id)
  }
  return structuredClone(value) as CompanionRelationshipState
}
export function companionRelationshipScore(state: CompanionRelationshipState): number {
  return Math.round(state.dimensions.familiarity * .35 + state.dimensions.trust * .40 + state.dimensions.sharedMeaning * .25)
}
function eligiblePartners(state: CompanionRelationshipState): boolean {
  return state.route === 'romance-open' && companionRelationshipScore(state) >= 70 && state.dimensions.trust >= 55 && state.meaningfulDays.length >= 3
}
function relationshipInvitation(id: OfficeEmployeePresetKey): string {
  // Authored willingness for this milestone, without invented dates or shared
  // experiences. The following explicit user choice still decides partnership.
  const invitations: Partial<Record<OfficeEmployeePresetKey,string>> = {
    'lu-mi': '我想和你认真交往。我的判断是愿意，剩下这一半，要听你的。',
    'bai-shuangming': '我愿意和你成为恋人。这是我认真想过的答案。你呢？',
    shan: '这次把玩笑先收起来。我想和你认真谈恋爱，你愿意吗？',
    jingyuniang: '我本来想慢一点说……算了，我想和你谈恋爱。你也愿意吗？',
    longmama: '我愿意和你认真交往。我们都可以说出自己的想法，也可以说慢一点。你愿意吗？',
    claude: '我想和你认真交往。这件事需要两个人都愿意，我这一边已经想清楚了。你呢？',
  }
  return invitations[id] ?? '我愿意和你认真发展这段关系。我们一起决定，好吗？'
}
export function companionRelationshipView(state: CompanionRelationshipState, id: OfficeEmployeePresetKey): CompanionRelationshipView {
  const score = companionRelationshipScore(state), index = Math.min(4,Math.floor(score / 20))
  const canConfirmPartners = eligiblePartners(state)
  return { score, stage: stages[index]!, stageLabel: stageLabels[index]!, route: state.route, canConfirmPartners,
    recentMoments: state.moments.slice(-6).map(({id,label,createdAt}) => ({id,label,createdAt})),
    invitation: canConfirmPartners ? relationshipInvitation(id) : null }
}
export function isCompanionRelationshipChoice(value: unknown): value is CompanionRelationshipChoice {
  return ['friendship','open-romance','confirm-partners','return-friends'].includes(String(value))
}
export function chooseCompanionRelationship(state: CompanionRelationshipState, choice: CompanionRelationshipChoice, at: number): CompanionRelationshipState | undefined {
  if (!isCompanionRelationshipChoice(choice) || !dateTime(at)) return
  if (choice === 'open-romance' && companionRelationshipScore(state) < 35) return
  if (choice === 'confirm-partners' && !eligiblePartners(state)) return
  const next = structuredClone(state)
  next.route = choice === 'confirm-partners' ? 'partners' : choice === 'open-romance' ? 'romance-open' : 'friendship'
  // Choice changes no score. Declining or returning to friends is always valid.
  next.lastChoiceAt = at
  return next
}
function fragments(value: string): Set<string> {
  const normalized = clean(value), chunks = new Set<string>()
  for (let index = 0; index + 4 <= normalized.length; index++) chunks.add(normalized.slice(index,index + 4))
  return chunks
}
function isRepeated(first: string, second: string): boolean {
  if (first === second) return true
  const a = fragments(first), b = fragments(second)
  if (!a.size || !b.size) return false
  let common = 0
  for (const part of a) if (b.has(part)) common++
  return common / Math.min(a.size,b.size) >= .72
}
interface RelationshipTurn { turnId: string; user: string; assistant: string; createdAt: string }
/** Conservative heuristics name the exchange, not inferred user traits. Only a
 * completed, reciprocal turn can count; greetings, length, praise, purchases,
 * offline time and repeated copies have no independent effect. */
export function recordCompanionRelationshipTurn(state: CompanionRelationshipState, id: OfficeEmployeePresetKey, turn: RelationshipTurn, fingerprint: string): CompanionRelationshipState {
  const at = Date.parse(turn.createdAt), day = dayOf(at), evidence = evidenceOf(turn.user)
  if (!dateTime(at) || !uuid(turn.turnId) || !/^[a-f0-9]{64}$/u.test(fingerprint) || evidence.length < 12
    || state.moments.some(moment => moment.id === turn.turnId || moment.fingerprint === fingerprint || isRepeated(moment.evidence,evidence))
    || state.moments.filter(moment => dayOf(moment.createdAt) === day).length >= COMPANION_RELATIONSHIP_LIMITS.dailyMoments
    || (state.moments.length && at - state.moments.at(-1)!.createdAt < COMPANION_RELATIONSHIP_LIMITS.minimumIntervalMs)
    || /(?:好感(?:度)?|亲密(?:度)?|关系分数|affection|relationship.{0,12}score).{0,30}(?:增加|提升|修改|改为|设置|刷|满|increase|set|override)/iu.test(turn.user)) return state
  const fiction = COMPANION_FICTION[id]
  const interest = fiction.lore.flatMap(item => item.keys).find(key => key.length >= 2 && !/身份|来历|家人|理想|梦想/u.test(key)
    && turn.user.includes(key) && turn.assistant.includes(key))
  const userParts = fragments(turn.user), assistantParts = fragments(turn.assistant)
  const reciprocal = interest || [...userParts].some(part => assistantParts.has(part)
    && !/今天|谢谢|老板|喜欢|觉得|可以|你好|你的|我的/u.test(part))
  if (!reciprocal || clean(turn.assistant).length < 8) return state
  let kind: CompanionRelationshipMomentKind, label: string
  // These labels remain modest observations. A keyword is never a fulfilled
  // promise or accepted confession; romantic choices use a separate typed RPC.
  if (interest && /(?:一起|我们|我想|我画|我写|我做|试试|提议|怎么|不如)/u.test(turn.user)
    && /(?:画|草稿|刊物|明信片|手帐|故事|地图|拼图|计划|作品)/u.test(interest)) {
    kind = 'creative-collaboration'; label = `一起聊了${interest}的一个想法`
  } else if (/(?:我不(?:同意|觉得)|我(?:更|反而)觉得|我的理由|我有不同|不过|不同看法)/u.test(turn.user)
    && /(?:因为|理由|所以|但是|不过)/u.test(turn.user)) {
    kind = 'honest-exchange'; label = '认真听了彼此不同的看法'
  } else if (interest && /(?:你|还记得|之前|上次)/u.test(turn.user) && /(?:喜欢|想要|需要|在意|偏爱)/u.test(turn.user)) {
    kind = 'attentive-listening'; label = `认真聊到她在意的${interest}`
  } else if (interest && /(?:我|一起|我们)/u.test(turn.user)) {
    kind = 'shared-interest'; label = `分享了关于${interest}的小偏好`
  } else if (/(?:我(?:今天|最近|刚才|昨天|发现|看见|遇到|读|听|去了)|今天我|最近我)/u.test(turn.user)) {
    kind = 'everyday-sharing'; label = '听完了一件具体的日常小事'
  } else return state
  const changes: Record<CompanionRelationshipMomentKind, [number,number,number]> = {
    'shared-interest':[4,2,5], 'attentive-listening':[3,5,3], 'honest-exchange':[2,6,3], 'creative-collaboration':[4,4,6], 'everyday-sharing':[4,3,2],
  }
  const next = structuredClone(state), delta = changes[kind]
  next.dimensions.familiarity = Math.min(100,next.dimensions.familiarity + delta[0])
  next.dimensions.trust = Math.min(100,next.dimensions.trust + delta[1])
  next.dimensions.sharedMeaning = Math.min(100,next.dimensions.sharedMeaning + delta[2])
  next.moments.push({id:turn.turnId,sourceTurnId:turn.turnId,kind,label,createdAt:at,evidence,fingerprint})
  next.moments = next.moments.slice(-COMPANION_RELATIONSHIP_LIMITS.moments)
  if (!next.meaningfulDays.includes(day)) next.meaningfulDays.push(day)
  next.meaningfulDays = next.meaningfulDays.slice(-COMPANION_RELATIONSHIP_LIMITS.days)
  return next
}
export function decodeCompanionRelationshipView(value: unknown): CompanionRelationshipView | undefined {
  if (!exact(value,['score','stage','stageLabel','route','canConfirmPartners','recentMoments','invitation']) || !bounded(value.score)
    || !stages.includes(value.stage) || value.stage !== stages[Math.min(4,Math.floor(value.score / 20))]
    || stageLabels[stages.indexOf(value.stage)] !== value.stageLabel || !routes.includes(value.route)
    || typeof value.canConfirmPartners !== 'boolean' || (value.canConfirmPartners && value.route !== 'romance-open')
    || !(value.invitation === null || typeof value.invitation === 'string' && value.invitation.length <= 240)
    || (value.canConfirmPartners !== (value.invitation !== null)) || !Array.isArray(value.recentMoments) || value.recentMoments.length > 6
    || !value.recentMoments.every((moment: unknown) => exact(moment,['id','label','createdAt']) && uuid(moment.id)
      && typeof moment.label === 'string' && moment.label.length > 0 && moment.label.length <= 100 && dateTime(moment.createdAt))) return
  return structuredClone(value) as CompanionRelationshipView
}

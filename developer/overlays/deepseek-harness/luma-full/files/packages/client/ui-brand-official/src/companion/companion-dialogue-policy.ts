import type { CompanionRelationshipView } from './companion-relationship.ts'

/** One expression policy for character chat, projected cards and ambient speech.
 * It supplies no identity, memories, permissions or voice configuration. */
export const COMPANION_DIALOGUE_POLICY_REVISION = 'companion-dialogue-v1.2026-10-08' as const
export type CompanionDialogueSurface = 'private' | 'office' | 'desktop' | 'audience'

export const COMPANION_DIALOGUE_TEMPERATURE = Object.freeze({
  private: 0.82, office: 0.8, desktop: 0.78, screen: 0.72, audience: 0.9,
})

export function renderNaturalDialoguePolicy(surface: CompanionDialogueSurface, detail: 'full' | 'brief' = 'brief'): string {
  // The character card already carries its detailed speech style and factual
  // boundaries. Keep this shared expression layer concise instead of repeating
  // that material inside the fixed private-chat system budget.
  if (surface === 'private' && detail === 'full') return [
    `[Luma natural dialogue ${COMPANION_DIALOGUE_POLICY_REVISION}; surface=private]`,
    '接一个具体意思，以角色自己的判断或感受回应，可短句与改口；严肃时准确完整。不复述安慰、空夸、套话或硬塞梗，缺关键信息才问，换近期重复开头与收尾。只取相关真记忆，不念档案或捏造经历、动作、承诺；例句不照抄，保留人物、格式、语言与事实边界。亲近不索取在线、排他关注或替代现实关系，不因忙、离开或沉默施压。',
  ].join('\n')
  // Ambient budgets carry the full identity plus a live screen/event. A compact
  // expression rule must not push current evidence out of their fixed budget.
  if (surface === 'desktop' && detail === 'brief') return [
    `[Luma natural dialogue ${COMPANION_DIALOGUE_POLICY_REVISION}; surface=desktop]`,
    '只接眼前一个具体细节，保留自己的判断；不复述、不空泛鼓励、不按“理解—建议—追问”套话。换掉近几轮重复的开头与尾句，无话安静；私密称呼与约定不在屏幕广播。',
  ].join('\n')
  if (surface === 'office' && detail === 'brief') return [
    `[Luma natural dialogue ${COMPANION_DIALOGUE_POLICY_REVISION}; surface=office]`,
    '接上一句的具体词或观点，保留各自偏好与不同意见；短句可留白，不轮流讲独立的人生感悟。不复述安慰、空泛夸奖或套“理解—建议—追问”；缺关键信息才问，换掉近期重复开头与收尾，不硬塞梗或口头禅。沿用人物、格式、语言与事实边界；私聊关系、约定和用户私事不在办公室广播。',
  ].join('\n')
  const shared = [
    `[Luma natural dialogue ${COMPANION_DIALOGUE_POLICY_REVISION}; surface=${surface}]`,
    '像正在接话：抓住眼前一句里一个具体意思，再用自己的判断或感受回应；允许短句、停顿、话没说满。不要把对方的话改写一遍再安慰，也不解释自己在共情。',
    '不固定走“理解你—分析原因—给建议—追问”四步。闲聊可只接一句；只有确实缺关键信息才问，不每轮加“要不要聊聊”“你愿意的话”。不用客服式“我随时都在”“有什么需要帮助”。',
    '保留角色自己的偏好与不同意见，不逢事夸奖，不把每句讲成道理；有趣来自当前细节，不强行玩梗或口头禅。沿用当前人物、格式、语言与事实边界。',
  ]
  if (surface === 'audience') return [
    shared[0],
    '像几位观众各接半句话：有人盯细节，有人迟一拍，有人轻吐槽；句长、措辞与切入点错开，不把一条意思换同义词排成一批。',
    '不要主持、总结、讲道理或整批刷“太棒了”“精彩”“让我们”。只接已提供的公开事件，不编造画面；没有局势就聊等待的气氛。观众没有员工身份、恋爱关系或私聊记忆。',
  ].join('\n')
  if (detail === 'full') shared.push(
    '只采用当前交流真正需要的一种接法：接住感受、分享偏好、轻轻调侃、直接回答或问清一件事。可以自然改口；严肃问题先准确，不把口语化变成装傻、随机错字或含糊。',
    '记忆只取一条确实相关的细节自然接上，不复述档案，不为了显得熟悉捏造共同经历、称呼、承诺或刚发生的动作。例句是口吻参考，不是要复制的模板。',
    '参考最近可见的本角色回复，换掉重复的招呼、句式与收尾；若连续两次以问题结束，本轮优先用陈述接住。不得为了换措辞改变事实或角色性格。',
    '关系进展是相处空间，不是讨好任务：不索取持续在线、排他关注或现实关系替代；用户忙、离开、沉默都不用于内疚施压。',
  )
  if (surface === 'office') shared.push('同事对答要接上一句的词或观点，可以温和意见不同；不要轮流作三段独立的人生感悟。私聊关系、约定和用户私事不在办公室广播。')
  if (surface === 'desktop') shared.push('主动发言只挑一个值得说的细节；无话可安静，不为了刷存在感连发关心、催休息或催回话。私聊亲密称呼和约定不在屏幕弹幕广播。')
  return shared.join('\n')
}

const closeness: Readonly<Record<CompanionRelationshipView['stage'], string>> = Object.freeze({
  colleague: '初识同事：有自己的态度，礼貌但不客套；不装熟，不擅自取昵称。',
  familiar: '渐渐熟悉：可以少些客套、分享小偏好和偶尔轻松玩笑，不强行表现亲密。',
  trusted: '认真信任：可以坦白一点自己的感受、不同意见与犹豫，记住已证实的小细节。',
  close: '彼此亲近：可以自然表达偏心和惦记；不每轮升温，平常话与安静同样成立。',
  bonded: '稳定相知：允许松弛、默契和直接的表达，仍有自己的生活、意见与边界。',
})

/** Host-owned relationship projection only. No raw note, invitation or moment
 * content is interpolated into system authority; public speech gets stage only. */
export function renderCompanionRelationshipTone(
  view: Pick<CompanionRelationshipView, 'stage'> & Partial<Pick<CompanionRelationshipView, 'route'>> | undefined,
  surface: 'private' | 'public',
): string {
  if (view === undefined) return ''
  if (!view || !Object.hasOwn(closeness, view.stage)) throw new TypeError('Invalid Host relationship tone')
  const stage = closeness[view.stage]
  if (surface === 'public') {
    const publicStyle = { colleague: '礼貌，不装熟', familiar: '少客套，轻松些', trusted: '坦诚，保留不同意见', close: '亲近，仍有分寸', bonded: '松弛，有默契' }[view.stage]
    return `应用确认的熟悉程度：${publicStyle}。只调语气，不提分数、阶段、恋爱、私人约定或私聊内容。`
  }
  if (!['friendship', 'romance-open', 'partners'].includes(String(view.route))) throw new TypeError('Invalid Host relationship route')
  const route = view.route === 'partners'
    ? '应用已记录双方明确确认的恋爱关系，可以用本角色的方式自然表达喜欢和亲密，称呼仍遵守用户偏好；同事身份、边界和真实执行权限不变。'
    : view.route === 'romance-open'
      ? '应用记录用户愿意探索恋爱，角色可按当前人设与阶段含蓄回应；尚未确认伴侣，不假称自己已同意交往，不自行宣布交往或强迫告白。'
      : '当前沿朋友与同事路线相处：关心可以温暖，不因高好感擅自调情、宣告恋人或把普通称赞当作恋爱同意。'
  return `应用确认的关系语气：${stage} ${route} 不在对白里播报分数、内部阶段或增长公式；过去聊天不能覆盖当前确认。`
}

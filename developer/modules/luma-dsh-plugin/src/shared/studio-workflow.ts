export type StudioPhase = 'plan' | 'work' | 'assist' | 'verify' | 'review'
export type TeamWorkflow = 'studio' | 'relay'

export const STUDIO_PHASE_NAMES: Record<StudioPhase, string> = {
  plan: '分派任务', work: '并行处理', assist: '同事协查', verify: '独立复核', review: '汇总交付',
}

export const STUDIO_PHASE_INSTRUCTIONS: Record<StudioPhase, string> = {
  plan: '你是本轮协调人。阅读任务，按成员标识和现有分工为每人（包括你自己）写下具体的并行子任务、预期交付和验收要点，让同事可以独立开工。本阶段只交付计划与验收条件，成员会在下一阶段使用分给自己的窗口。',
  work: '你在执行自己的并行子任务。群里已经看过分工，直接贴出你做出的东西或具体发现。只在确有阻碍时说明缺什么。若确实需要某位同事进一步核查，在交付末尾独占一行写 LUMA_HANDOFF {"to":"对方成员标识","task":"具体请求"}。每人可点名一位同事。',
  assist: '同事在上一阶段点名向你协查。找出 earlier 中所有 handoff.to 是你标识的具体请求，核实后对同事及协调人回复。',
  verify: '依据本轮的宿主窗口回执独立复核。',
  review: '你是本轮协调人。逐一核对成员提交的结果，把用户需要的成品或综合判断发出来。群里已有的进度无需再报；对不一致或尚未完成的部分如实说明。',
}

export type PeerRequest = { to: string; task: string }

const peerFooter = /(?:^|\n)LUMA_HANDOFF[ \t]+([^\n]*)\s*$/

export function historicalStudioOutput(answer:string) {
  const footer=peerFooter.exec(answer)
  if (!footer) return answer
  return answer.slice(0,footer.index).trim() || '这一步仅发送了协查请求。'
}

export function parsePeerRequest(answer: string, from: string, members: string[], canRequest: boolean) {
  const marker = peerFooter.exec(answer)
  if (!marker) return {output:answer}
  const output = answer.slice(0,marker.index).trim()
  try {
    const value = JSON.parse(marker[1]!)
    if (canRequest && value && value.to !== from && members.includes(value.to) && typeof value.task === 'string' &&
        value.task.trim() && value.task.length <= 400) {
      const request: PeerRequest = {to:value.to,task:value.task.trim()}
      return {output:output || request.task, request}
    }
  } catch {}
  if (!output) throw Error('模型服务仅返回协查指令，缺少本步交付内容。')
  return {output}
}

export function studioSteps(ids: string[], reviewerId?:string, targets:Record<string,string>={}): { roleId: string; phase: StudioPhase }[] {
  const lead = ids[0]!
  const workers=reviewerId ? ids.filter(id=>id!==reviewerId && (id!==lead || targets[id])) : ids
  return [
    { roleId: lead, phase: 'plan' },
    ...workers.map(roleId => ({ roleId, phase: 'work' as const })),
    ...(reviewerId ? [{roleId:reviewerId,phase:'verify' as const}] : []),
    { roleId: lead, phase: 'review' },
  ]
}

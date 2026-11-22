export type ModelProtocol = 'openai' | 'anthropic' | 'gemini'
export type ModelOption = { id: string; name: string }

const budget = {low:1024, medium:4096, high:8192}
export function legacyClaude(model: string) {
  return /claude-(?:3|(?:haiku|sonnet|opus)-4(?:[-.](?:[1-5](?:-|$)|20\d{6}$)|$))/.test(model)
}
export function customEfforts(protocol: ModelProtocol, model: string): string[] {
  if (protocol === 'anthropic') return legacyClaude(model) ? Object.keys(budget) : ['low','medium','high','xhigh','max']
  if (protocol === 'gemini') {
    if (/gemini-2\.5/.test(model)) return Object.keys(budget)
    if (/gemini-3-pro/.test(model)) return ['low','high']
    return ['minimal','low','medium','high']
  }
  if (/deepseek/i.test(model)) return ['none','low','high','max']
  return ['none','minimal','low','medium','high','xhigh','max']
}
export function customThinking(protocol: ModelProtocol, model: string, effort?: string): object {
  if (!effort) return {}
  if (!customEfforts(protocol, model).includes(effort)) throw Error('请选择该模型支持的思考强度。')
  const tokens = budget[effort as keyof typeof budget]
  if (protocol === 'anthropic') return legacyClaude(model)
    ? {thinking:{type:'enabled', budget_tokens:tokens}, max_tokens:tokens+4096}
    : {thinking:{type:'adaptive'}, output_config:{effort}}
  if (protocol === 'gemini') return {generationConfig:{thinkingConfig:/gemini-2\.5/.test(model)
    ? {thinkingBudget:tokens} : {thinkingLevel:effort.toUpperCase()}}}
  if (/deepseek/i.test(model)) return effort === 'none' ? {thinking:{type:'disabled'}} : {thinking:{type:'enabled'}, reasoning_effort:effort}
  return {reasoning_effort:effort}
}

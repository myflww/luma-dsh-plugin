const codex = {id:'codex', name:'Codex · ChatGPT', capability:'subscription', loginCommand:'codex login'} as const
const claude = {id:'claude', name:'Claude Code', capability:'subscription', loginCommand:'claude auth login'} as const

const kimi = {id:'kimi', name:'Kimi Code CLI', capability:'subscription', loginCommand:'kimi login'} as const
const antigravity = {id:'antigravity', name:'Antigravity CLI', capability:'subscription', loginCommand:'agy'} as const

export const subscriptionClients = {codex, claude, kimi, antigravity}
export const localClientCatalog = [
  codex, claude, kimi, antigravity,
  {id:'copilot', name:'GitHub Copilot CLI', capability:'discovery'},
  {id:'cursor', name:'Cursor Agent CLI', capability:'discovery'},
  {id:'opencode', name:'OpenCode CLI', capability:'discovery'},
  {id:'qwen', name:'Qwen Code', capability:'discovery'},
] as const

export type HarnessId = keyof typeof subscriptionClients
export type DiscoveryClientId = Extract<(typeof localClientCatalog)[number], {capability:'discovery'}>['id']

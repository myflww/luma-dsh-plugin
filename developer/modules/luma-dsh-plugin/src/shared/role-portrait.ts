export type PortraitSource = 'chat' | 'work' | 'manual' | 'history'
export type PortraitKind = 'stated' | 'repeated' | 'model' | 'corrected'
export const PRIVATE_MEMORY_GUIDANCE =
  'ownPosition 是你自己先前的看法，spoken 是你说过的话，reflection 是你从 evidence 那段经历中私下形成的想法。后者没有发给对方。眼前有新理由时可以改口，只在相关时提起。' +
  'userPortrait 中的条目是你在本角色视角内留存、与本轮相关的长期认识。source=work 来自你亲自参与的工作，chat 来自你与用户的私聊，manual 由用户保存或更正，history 来自早先的记录。' +
  '日常聊天和派工都可用这些来源。用户问到有依据的偏好、约定或具体取值时，自然答出记录里的内容；工作原文已删或本话题刚开启时，这些已保留的约定仍然有效。' +
  '以用户本轮表达及本轮有效画像为准。历史片段只说明当时聊过什么，一次性要求只在当时适用。对缺少依据的细节说明未知，不把同事或别的群的经历算作自己的。'
export interface PortraitItem {
  id: string
  scope: string
  kind: PortraitKind
  source: PortraitSource
  text: string
  evidence: string
  count: number
  updatedAt: number
  revision: number
}
export interface PortraitView {
  items: PortraitItem[]
  automatic: boolean
  modelReview: boolean
  modelAvailable: boolean
  remoteRecall?: 'filtered' | 'legacy' | 'bound' | 'unbound'
  notice?: string
  scopeNames: Record<string,string>
}

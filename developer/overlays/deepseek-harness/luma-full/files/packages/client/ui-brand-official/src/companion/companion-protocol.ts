import { type CompanionId } from './companion-identity.ts'
export { type CompanionId, isCompanionId } from './companion-identity.ts'
/** Separate chat wire: no task/session/workspace IDs, tool handles or paths accepted. */
export const COMPANION_CHANNEL = '/luma-companion-chat'

import { decodeCompanionRelationshipView, type CompanionRelationshipView } from './companion-relationship.ts'
import {decodeCharacterAIProfileState,type CharacterAIProfile}from './character-ai-profile.ts'


export type CompanionMode = 'chat' | 'work'
export interface CompanionChatState {
  employeeId: CompanionId
  revision: number
  privacy: { acknowledged: boolean; path: string; policyVersion: string }
  turns: readonly { id: string; user: string; assistant: string; createdAt: number }[]
  summary: string
  usage: { diskBytes: number; activeBytes: number; archiveBytes: number; estimatedTokens: number; contextLimitTokens: number }
  archives: readonly { id: string; createdAt: number; reason: string }[]
  models: readonly { provider: string; model: string; label: string; supportsImages?: boolean }[]
  relationship?: CompanionRelationshipView
  /** Present for formal Host-owned binding; null selection is explicitly unbound. */
  characterAIProfile?:CharacterAIProfile
  pendingChats?: readonly { requestId: string; queuedAt: number; dueAt: number; source: 'host'; status?: 'waiting-model' | 'needs-review' }[]
}
export interface CompanionRpc {
  call(endpoint: 'read' | 'acknowledge' | 'send' | 'cancel' | 'compact' | 'reset' | 'rollback' | 'call' | 'call-progress' | 'call-cancel' | 'relationship' | 'conversation-preferences-read' | 'conversation-preferences-write', payload: unknown): Promise<unknown>
}

const obj = (value: unknown): value is Record<string, any> => !!value && typeof value === 'object' && !Array.isArray(value)
const string = (value: unknown, max: number): value is string => typeof value === 'string' && value.length <= max
const natural = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0
export function decodeCompanionState(value: unknown, employeeId: CompanionId): CompanionChatState | undefined {
  if (!obj(value) || value.employeeId !== employeeId || !natural(value.revision)
    || !obj(value.privacy) || typeof value.privacy.acknowledged !== 'boolean'
    || !string(value.privacy.path,8192) || !string(value.privacy.policyVersion,80)
    || !string(value.summary,8192) || !obj(value.usage)
    || !['diskBytes','activeBytes','archiveBytes','estimatedTokens','contextLimitTokens'].every(key => natural(value.usage[key]))
    || !Array.isArray(value.turns) || value.turns.length > 100
    || !value.turns.every(turn => obj(turn) && string(turn.id,160) && string(turn.user,8192) && string(turn.assistant,8192) && natural(turn.createdAt))
    || !Array.isArray(value.archives) || value.archives.length > 100
    || !value.archives.every(archive => obj(archive) && string(archive.id,160) && natural(archive.createdAt) && string(archive.reason,160))
    || !Array.isArray(value.models) || value.models.length > 256
    || !value.models.every(model => obj(model) && string(model.provider,160) && string(model.model,160) && string(model.label,320) && (model.supportsImages === undefined || typeof model.supportsImages === 'boolean'))) return
  if (value.pendingChats !== undefined && (!Array.isArray(value.pendingChats) || value.pendingChats.length > 32
    || new Set(value.pendingChats.map((row: unknown) => obj(row) ? row.requestId : undefined)).size !== value.pendingChats.length
    || !value.pendingChats.every((row: unknown) => obj(row) && (Object.keys(row).sort().join(',') === 'dueAt,queuedAt,requestId,source'
      || (Object.keys(row).sort().join(',') === 'dueAt,queuedAt,requestId,source,status' && (row.status === 'waiting-model' || row.status === 'needs-review')))
      && string(row.requestId,160) && row.requestId.length > 0 && natural(row.queuedAt) && natural(row.dueAt)
      && row.dueAt >= row.queuedAt && row.source === 'host'))) return
  if (value.relationship !== undefined && !decodeCompanionRelationshipView(value.relationship)) return
  if (value.characterAIProfile !== undefined && !decodeCharacterAIProfileState(value.characterAIProfile,employeeId)) return
  return structuredClone(value) as CompanionChatState
}
export function companionRpcValue(value: unknown): unknown {
  if (!obj(value) || value.ok !== true || !('value' in value)) throw new Error('companion-unavailable')
  return value.value
}

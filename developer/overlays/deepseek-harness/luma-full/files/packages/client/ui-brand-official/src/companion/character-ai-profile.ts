import { isCompanionId, type CompanionId } from './companion-identity.ts'

/** References configured routes only. Credentials remain with the existing registry. */
export const CHARACTER_AI_PROFILE_CHANNEL = '/luma-character-ai-profile'
export interface CharacterAISelection { provider: string; model: string; reasoningEffort?: string }
export interface CharacterAIProfile { schemaVersion: 1; employeeId: CompanionId; revision: number; selection: CharacterAISelection | null }
export interface CharacterAIModelOption {
  provider: string; model: string; label: string; supportsImages?: boolean
  reasoning?: { efforts: readonly { id: string; name: string }[]; defaultEffort?: string }
}
export interface CharacterAIProfileReceipt { profile: CharacterAIProfile; models: readonly CharacterAIModelOption[] }
export interface CharacterAIProfilePort {
  subscribe?(listener: (profile: CharacterAIProfile) => void): () => void
  ready(): Promise<void>
  read(id: CompanionId): Promise<CharacterAIProfile>
  set(id: CompanionId, input: { expectedRevision: number; selection: CharacterAISelection | null }): Promise<CharacterAIProfile>
  /** Only legacy callers with an explicit selection may supply fallback. A broken binding never falls back. */
  resolve(id: CompanionId, fallback?: CharacterAISelection): Promise<CharacterAISelection>
  listModels(): Promise<readonly CharacterAIModelOption[]>
}
export type CharacterAIProfileErrorCode = 'invalid-request' | 'conflict' | 'unconfigured' | 'unsupported-reasoning' | 'unbound' | 'unavailable' | 'invalid-store'
export class CharacterAIProfileError extends Error {
  readonly code: CharacterAIProfileErrorCode
  constructor(code: CharacterAIProfileErrorCode) { super(code); this.code = code; this.name = 'CharacterAIProfileError' }
}
export const characterAIRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
export const characterAIIdentifier = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 160
  && value.trim() === value && !/[\p{Cc}\p{Cf}\p{Cs}]/u.test(value)
export function decodeCharacterAISelection(value: unknown): CharacterAISelection | undefined {
  if (!characterAIRecord(value) || Object.keys(value).some(key => !['provider','model','reasoningEffort'].includes(key))
    || !characterAIIdentifier(value.provider) || !characterAIIdentifier(value.model)
    || value.reasoningEffort !== undefined && !characterAIIdentifier(value.reasoningEffort)) return
  return { provider: value.provider, model: value.model, ...(value.reasoningEffort === undefined ? {} : { reasoningEffort: value.reasoningEffort }) }
}
export function decodeCharacterAIProfileState(value: unknown, id: CompanionId): CharacterAIProfile | undefined {
  if (!characterAIRecord(value) || Object.keys(value).sort().join(',') !== 'employeeId,revision,schemaVersion,selection'
    || value.schemaVersion !== 1 || !isCompanionId(id) || value.employeeId !== id || !Number.isSafeInteger(value.revision) || Number(value.revision) < 0) return
  const selection = value.selection === null ? null : decodeCharacterAISelection(value.selection)
  return selection === undefined ? undefined : { schemaVersion: 1, employeeId: id, revision: Number(value.revision), selection }
}
export function decodeCharacterAIProfileReceipt(value: unknown, id: CompanionId): CharacterAIProfileReceipt | undefined {
  if (!characterAIRecord(value) || Object.keys(value).sort().join(',') !== 'models,profile' || !Array.isArray(value.models) || value.models.length > 256) return
  const profile = decodeCharacterAIProfileState(value.profile, id)
  if (!profile) return
  const models: CharacterAIModelOption[] = [], seen = new Set<string>()
  for (const row of value.models) {
    if (!characterAIRecord(row) || Object.keys(row).some(key => !['provider','model','label','supportsImages','reasoning'].includes(key))
      || !characterAIIdentifier(row.provider) || !characterAIIdentifier(row.model) || typeof row.label !== 'string' || row.label.length > 320
      || row.supportsImages !== undefined && typeof row.supportsImages !== 'boolean') return
    const key = JSON.stringify([row.provider,row.model]); if (seen.has(key)) return; seen.add(key)
    if (row.reasoning !== undefined) {
      if (!characterAIRecord(row.reasoning) || Object.keys(row.reasoning).some(key => !['efforts','defaultEffort'].includes(key))
        || !Array.isArray(row.reasoning.efforts) || !row.reasoning.efforts.length || row.reasoning.efforts.length > 32) return
      const efforts = new Set<string>()
      for (const effort of row.reasoning.efforts) {
        if (!characterAIRecord(effort) || Object.keys(effort).sort().join(',') !== 'id,name' || !characterAIIdentifier(effort.id)
          || typeof effort.name !== 'string' || !effort.name.length || effort.name.length > 256 || efforts.has(effort.id)) return
        efforts.add(effort.id)
      }
      if (row.reasoning.defaultEffort !== undefined && !efforts.has(String(row.reasoning.defaultEffort))) return
    }
    models.push(structuredClone(row) as unknown as CharacterAIModelOption)
  }
  return { profile, models }
}
export function characterAIProfileRpcValue(value: unknown): unknown {
  if (!characterAIRecord(value) || value.ok !== true || !Object.hasOwn(value,'value')) {
    const error = characterAIRecord(value) && characterAIRecord(value.error) ? value.error : undefined
    const code = error && characterAIRecord(error.details) ? error.details.characterAIProfileCode : error?.code
    throw new CharacterAIProfileError(['invalid-request','conflict','unconfigured','unsupported-reasoning','unbound','unavailable','invalid-store'].includes(String(code))
      ? code as CharacterAIProfileErrorCode : 'unavailable')
  }
  return value.value
}

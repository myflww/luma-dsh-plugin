import type { CardEditionDefinition } from '../../collection/cardLibraryTypes.ts'
import type { CharacterId, DemoState } from './types.ts'
import { getCardCollectionKey, getPackCard, getPackPool, ownedCardsFor } from './cardPacks.ts'

export const CHARACTER_NAMES: Readonly<Record<CharacterId, string>> = { shan: '端木嫣', 'lu-mi': '陆弥', 'bai-shuangming': '白霜命', jingyuniang: '鲸鱼娘', longmama: '龙妈妈', claude: '克劳德', gemini: '吉米', grok: '绯洛' }
export const LEGACY_DEFAULT_CHARACTERS: readonly CharacterId[] = ['shan', 'lu-mi', 'bai-shuangming']
export const CHARACTER_PROVIDERS: Partial<Record<CharacterId, string>> = { jingyuniang: 'deepseek', longmama: 'openai', claude: 'anthropic', gemini: 'google', grok: 'xai' }
export const CHARACTER_PACKS: Readonly<Record<CharacterId, string>> = { shan: 'dawn-prelude', 'lu-mi': 'blue-rose-echo', 'bai-shuangming': 'moon-collection',
  jingyuniang: 'first-meeting-journey', longmama: 'first-meeting-journey', claude: 'first-meeting-journey', gemini: 'first-meeting-journey', grok: 'first-meeting-journey' }
export const THEME_COLLECTION_CHARACTERS: readonly CharacterId[] = Object.freeze(Object.keys(CHARACTER_PACKS) as CharacterId[])
export const characterIdForCard = (key: string): CharacterId | undefined => {
  const name = getPackCard(key)?.character
  return (Object.keys(CHARACTER_NAMES) as CharacterId[]).find(id => CHARACTER_NAMES[id] === name)
}
/** Explicit current standard-card entry points; C06 standards retain their existing eligibility. */
export const CHARACTER_REDEMPTION_WORKS: Readonly<Partial<Record<CharacterId, readonly string[]>>> = Object.freeze({
  jingyuniang: Object.freeze(['JYN-C06', 'JYN-X05']), longmama: Object.freeze(['LMM-C06', 'LMM-X05']),
  claude: Object.freeze(['CLD-C06', 'CLD-X05']), gemini: Object.freeze(['GMI-C06', 'GMI-X04']), grok: Object.freeze(['GRK-C06', 'GRK-X04']),
})
/** Previously issued identities keep their acquisition right after an aesthetic errata correction.
 * Only these exact source keys, characters, works and front bytes qualify; no general errata exception.
 */
const LEGACY_CHARACTER_REDEMPTIONS: Readonly<Record<string, { readonly characterId: CharacterId; readonly workId: string; readonly frontSha256: string }>> = Object.freeze({
  'DMY-S03@image-v01-r01': { characterId: 'shan', workId: 'DMY-S03', frontSha256: 'eb788e96066ccfd5bc9c59ba5e8cbaddd472e11b37e85733c594d7ca14ebc92d' },
  'DMY-O@image-v01-r01': { characterId: 'shan', workId: 'DMY-O', frontSha256: 'c64555ab29eca7be57a5490c282275f37ce46f9c9f6e0b018e754addaf56e595' },
  'RH-02@foil-v01-r01': { characterId: 'lu-mi', workId: 'RH-02', frontSha256: 'ff6c1afa8a7e7beab32d9e12a65116c396b78c0d4c3b532a4244fe098e34c98a' },
  'LM-S01@image-v01-r01': { characterId: 'lu-mi', workId: 'LM-S01', frontSha256: '3ecc89f14c05e228fc26dd5b62ab2ae8571cd66b2f5658d4f19d01e2e9173043' },
  'BSM-O@image-v01-r01': { characterId: 'bai-shuangming', workId: 'BSM-O', frontSha256: 'efe4c22e15d769f1484d01171162e9dde50b75d66d291d650c3bdc71b867f961' },
  'JYN-C06@art-v01': { characterId: 'jingyuniang', workId: 'JYN-C06', frontSha256: 'd161937e4bdff88198914258590b983bc46de7b217ef6f14bf6306765e85eadf' },
  'LMM-C06@art-v01': { characterId: 'longmama', workId: 'LMM-C06', frontSha256: 'e129407e85c84665cd2d157938da9291942e43682e9f2f826a751fa4a867cdef' },
  'CLD-C06@art-v01': { characterId: 'claude', workId: 'CLD-C06', frontSha256: '656c940b402859cd8584ddbaa8744e24ff574de46352bfc601189eb8ae46d2e6' },
  'GMI-C06@source-foil-0d0acb1545-aad24e11f2': { characterId: 'gemini', workId: 'GMI-C06', frontSha256: '0d0acb1545b38947296261faa4e891446dd60c7af4f8e8fc0c7ebceeb8ad36df' },
  'GRK-C06@source-foil-92f19b65d5-40b96431e4': { characterId: 'grok', workId: 'GRK-C06', frontSha256: '92f19b65d5e09dd3d28e7be350faea80a90bf157d7e95263b79281f5b54c9d76' },
})
export function hasLegacyCharacterRedemption(card: Pick<CardEditionDefinition, 'key' | 'workId' | 'characterId' | 'character' | 'frontSha256'>): boolean {
  const legacy = LEGACY_CHARACTER_REDEMPTIONS[card.key]
  return Boolean(legacy && card.workId === legacy.workId && card.characterId === legacy.characterId
    && card.character === CHARACTER_NAMES[legacy.characterId] && card.frontSha256 === legacy.frontSha256)
}
export const canRedeemCard = (key: string): boolean => {
  const card = getPackCard(key), characterId = characterIdForCard(key)
  if (!card || !characterId) return false
  return hasLegacyCharacterRedemption(card) || card.edition === 'standard' && (LEGACY_DEFAULT_CHARACTERS.includes(characterId)
    || Boolean(CHARACTER_REDEMPTION_WORKS[characterId]?.includes(card.workId)))
}
export function characterUnlocked(state: DemoState, userId: string | null, characterId: CharacterId): boolean {
  return Boolean(userId && state.characterUnlocks[userId]?.some(item => item.characterId === characterId))
}
/** Current standard holdings award themes; historical draws never substitute for holdings. */
export function awardThemes(state: DemoState, userId: string, at: number): void {
  const held = new Set(ownedCardsFor(state, userId).map(instance => getCardCollectionKey(instance.cardKey)))
  const unlocks = state.themeUnlocks[userId] ??= []
  for (const characterId of THEME_COLLECTION_CHARACTERS) {
    const targets = getPackPool(CHARACTER_PACKS[characterId]).filter(card => card.edition === 'standard'
      && card.character === CHARACTER_NAMES[characterId] && (card.characterId === undefined || card.characterId === characterId))
    if (!targets.length || !targets.every(card => held.has(card.key))) continue
    const slug = characterId === 'shan' ? 'duanmu-yan' : characterId
    for (const kind of ['office', 'bedroom'] as const) {
      const id = `${kind}.${slug}.v1`
      if (!unlocks.some(item => item.id === id)) unlocks.push({ id, characterId, kind, at })
    }
  }
}
export function demoEntitlementsFor(state: DemoState, userId: string | null = state.currentUserId) {
  return { source: 'local-demo' as const, characters: userId ? state.characterUnlocks[userId] ?? [] : [], themes: userId ? state.themeUnlocks[userId] ?? [] : [] }
}

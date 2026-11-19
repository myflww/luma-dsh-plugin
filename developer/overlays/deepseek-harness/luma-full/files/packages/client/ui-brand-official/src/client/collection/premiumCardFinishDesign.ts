import type { CardEditionDefinition } from './cardLibraryTypes.ts'

export type PremiumCardMotif = 'rose' | 'petal' | 'snow' | 'tide' | 'moon' | 'leaf' | 'prism' | 'flame'
export type CollectionFrameLayout = 'balanced' | 'open-top' | 'open-left' | 'open-right' | 'low-crest'
export type HolographicPattern = 'rain' | 'petal' | 'constellation' | 'wave' | 'leaf' | 'snow' | 'wing' | 'prism'
export interface CollectionFrameBinding {
  readonly characterId: string
  readonly rarity: 'SR' | 'SSR'
  readonly layout: CollectionFrameLayout
  readonly cornerScale: number
  readonly foil: 'satin' | 'luminous'
  readonly finish: { readonly mode: 'regional-holographic'; readonly pattern: HolographicPattern; readonly strength: number }
  /** Ratios of the displayed card width; physical planes stay raised even with reduced motion. */
  readonly depth: { readonly cardThickness: number; readonly reliefLift: number }
  /** A reviewed edge prop can cross the inner rail without losing its contact silhouette. */
  readonly clearance?: { readonly edge: 'right'; readonly start: number; readonly end: number }
}
export interface PremiumCardFinishDefinition {
  readonly tier: 'SR' | 'SSR'
  readonly motif: PremiumCardMotif
  readonly light: string
  readonly mid: string
  readonly deep: string
  readonly enamel: string
  readonly gem: string
  readonly frame?: CollectionFrameBinding & { readonly id: 'heirloom-20261015-v2' }
}

type BindingTuple = readonly [characterId: string, rarity: 'SR' | 'SSR', layout: CollectionFrameLayout, cornerScale: number, foil: 'satin' | 'luminous', pattern: HolographicPattern, strength: number, cardThickness: number, reliefLift: number]
const rows: Readonly<Record<string, BindingTuple>> = {
  'DMY-X01': ['shan', 'SR', 'open-left', .78, 'luminous', 'rain', 0.6, 0.018, 0.011],
  'DMY-X02': ['shan', 'SR', 'open-right', .9, 'satin', 'petal', 0.55, 0.018, 0.01],
  'DMY-X03': ['shan', 'SR', 'low-crest', .78, 'satin', 'rain', 0.52, 0.017, 0.01],
  'DMY-X04': ['shan', 'SR', 'balanced', .9, 'luminous', 'constellation', 0.68, 0.019, 0.012],
  'DMY-X05': ['shan', 'SR', 'open-left', .84, 'satin', 'leaf', 0.57, 0.018, 0.011],
  'DMY-X06': ['shan', 'SSR', 'open-top', .95, 'luminous', 'wave', 0.72, 0.026, 0.018],
  'LM-X01': ['lu-mi', 'SR', 'open-top', .9, 'luminous', 'constellation', 0.68, 0.019, 0.012],
  'LM-X02': ['lu-mi', 'SR', 'open-right', .78, 'satin', 'rain', 0.63, 0.018, 0.011],
  'LM-X03': ['lu-mi', 'SR', 'open-left', .84, 'satin', 'petal', 0.57, 0.018, 0.011],
  'LM-X04': ['lu-mi', 'SR', 'open-right', .88, 'luminous', 'wave', 0.65, 0.019, 0.012],
  'LM-X05': ['lu-mi', 'SSR', 'open-top', .92, 'luminous', 'leaf', 0.74, 0.026, 0.018],
  'BSM-X01': ['bai-shuangming', 'SR', 'open-right', .82, 'luminous', 'wing', 0.64, 0.018, 0.011],
  'BSM-X02': ['bai-shuangming', 'SR', 'low-crest', .82, 'satin', 'snow', 0.6, 0.018, 0.011],
  'BSM-X03': ['bai-shuangming', 'SR', 'open-top', .78, 'luminous', 'constellation', 0.67, 0.019, 0.012],
  'BSM-X04': ['bai-shuangming', 'SR', 'open-left', .88, 'satin', 'wing', 0.61, 0.018, 0.011],
  'BSM-X05': ['bai-shuangming', 'SR', 'open-right', .84, 'satin', 'constellation', 0.64, 0.019, 0.012],
  'BSM-X06': ['bai-shuangming', 'SSR', 'balanced', .96, 'luminous', 'prism', 0.74, 0.026, 0.018],
  'JYN-X01': ['jingyuniang', 'SR', 'open-left', .82, 'satin', 'wave', 0.59, 0.018, 0.011],
  'JYN-X02': ['jingyuniang', 'SR', 'open-left', .82, 'luminous', 'wave', 0.68, 0.019, 0.012],
  'JYN-X03': ['jingyuniang', 'SR', 'open-right', .84, 'satin', 'wing', 0.62, 0.018, 0.011],
  'JYN-X04': ['jingyuniang', 'SSR', 'open-left', .94, 'luminous', 'wave', 0.75, 0.026, 0.018],
  'LMM-X01': ['longmama', 'SR', 'low-crest', .86, 'satin', 'petal', 0.59, 0.018, 0.011],
  'LMM-X02': ['longmama', 'SR', 'open-left', .84, 'satin', 'snow', 0.62, 0.019, 0.012],
  'LMM-X03': ['longmama', 'SR', 'open-left', .82, 'luminous', 'constellation', 0.67, 0.019, 0.012],
  'LMM-X04': ['longmama', 'SSR', 'balanced', 1, 'luminous', 'petal', 0.74, 0.026, 0.018],
  'CLD-X01': ['claude', 'SR', 'open-top', .84, 'satin', 'rain', 0.6, 0.018, 0.011],
  'CLD-X02': ['claude', 'SR', 'open-left', .86, 'satin', 'leaf', 0.58, 0.018, 0.011],
  'CLD-X03': ['claude', 'SR', 'open-left', .82, 'satin', 'snow', 0.62, 0.019, 0.012],
  'CLD-X04': ['claude', 'SSR', 'open-left', .96, 'luminous', 'constellation', 0.76, 0.027, 0.019],
  'GMI-X01': ['gemini', 'SR', 'open-top', .82, 'luminous', 'prism', 0.67, 0.019, 0.012],
  'GMI-X02': ['gemini', 'SR', 'open-right', .82, 'satin', 'wave', 0.64, 0.019, 0.012],
  'GMI-X03': ['gemini', 'SSR', 'open-top', .94, 'luminous', 'prism', 0.76, 0.027, 0.019],
  'GRK-X01': ['grok', 'SR', 'open-left', .88, 'satin', 'snow', 0.64, 0.019, 0.012],
  'GRK-X02': ['grok', 'SR', 'open-top', .84, 'satin', 'petal', 0.6, 0.018, 0.011],
  'GRK-X03': ['grok', 'SSR', 'open-left', .96, 'luminous', 'constellation', 0.76, 0.027, 0.019],

  // Curated replacement scenes: layouts are checked against final source art before release.
  'DMY-X07': ['shan', 'SR', 'open-top', .74, 'satin', 'wave', .55, .018, .010],
  'DMY-X08': ['shan', 'SSR', 'open-left', .90, 'luminous', 'petal', .73, .026, .018],
  'LM-X06': ['lu-mi', 'SR', 'open-top', .78, 'luminous', 'wave', .61, .019, .011],
  'LM-X07': ['lu-mi', 'SSR', 'open-top', .90, 'luminous', 'constellation', .75, .027, .019],
  'BSM-X07': ['bai-shuangming', 'SSR', 'open-top', .86, 'satin', 'snow', .69, .026, .017],
  'JYN-X05': ['jingyuniang', 'SR', 'open-top', .76, 'satin', 'wave', .61, .018, .010],
  'JYN-X06': ['jingyuniang', 'SR', 'open-right', .80, 'luminous', 'wave', .62, .019, .011],
  'JYN-X07': ['jingyuniang', 'SSR', 'open-left', .92, 'luminous', 'prism', .75, .027, .018],
  'LMM-X05': ['longmama', 'SR', 'open-top', .78, 'satin', 'petal', .57, .018, .011],
  'LMM-X06': ['longmama', 'SR', 'balanced', .86, 'luminous', 'wing', .63, .019, .012],
  'LMM-X07': ['longmama', 'SSR', 'open-right', .94, 'luminous', 'prism', .75, .027, .019],
  'CLD-X05': ['claude', 'SR', 'open-top', .74, 'satin', 'leaf', .55, .018, .010],
  'CLD-X06': ['claude', 'SR', 'open-top', .78, 'satin', 'snow', .59, .019, .011],
  'CLD-X07': ['claude', 'SSR', 'open-top', .92, 'luminous', 'leaf', .75, .027, .019],
  'GMI-X04': ['gemini', 'SR', 'open-right', .80, 'luminous', 'prism', .65, .019, .012],
  'GMI-X05': ['gemini', 'SR', 'open-top', .82, 'luminous', 'constellation', .67, .019, .012],
  'GMI-X06': ['gemini', 'SR', 'open-top', .76, 'satin', 'leaf', .59, .018, .011],
  'GMI-X07': ['gemini', 'SSR', 'open-top', .92, 'luminous', 'prism', .76, .027, .019],
  'GRK-X04': ['grok', 'SR', 'open-top', .80, 'satin', 'prism', .60, .019, .011],
  'GRK-X05': ['grok', 'SR', 'open-right', .78, 'satin', 'wing', .59, .019, .011],
  'GRK-X06': ['grok', 'SSR', 'balanced', .92, 'luminous', 'constellation', .75, .027, .019],
}

const clearances: Readonly<Record<string, NonNullable<CollectionFrameBinding['clearance']>>> = {
  'JYN-X06': Object.freeze({ edge: 'right', start: .145, end: .275 }),
}

/** Exact planned work-to-character binding; neither prefixes nor a character's unrelated cards opt in. */
export const COLLECTION_FRAME_BINDINGS: Readonly<Record<string, CollectionFrameBinding>> = Object.freeze(Object.fromEntries(
  Object.entries(rows).map(([workId, [characterId, rarity, layout, cornerScale, foil, pattern, strength, cardThickness, reliefLift]]) => [workId, Object.freeze({ characterId, rarity, layout, cornerScale, foil,
    finish: Object.freeze({ mode: 'regional-holographic' as const, pattern, strength }), depth: Object.freeze({ cardThickness, reliefLift }),
    ...(clearances[workId] ? { clearance: clearances[workId] } : {}) })]),
))

const themes: Record<string, Omit<PremiumCardFinishDefinition, 'tier' | 'frame'>> = {
  'lu-mi': { motif: 'rose', light: '#edf6ff', mid: '#9aafd0', deep: '#354963', enamel: '#102443', gem: '#3c6cb6' },
  shan: { motif: 'petal', light: '#fff2d1', mid: '#d1ad77', deep: '#695037', enamel: '#563744', gem: '#e2b5c3' },
  'bai-shuangming': { motif: 'snow', light: '#f4ffff', mid: '#b4cfdf', deep: '#526d8c', enamel: '#213e59', gem: '#9fdded' },
  jingyuniang: { motif: 'tide', light: '#f0fff4', mid: '#b7ccb0', deep: '#497378', enamel: '#153b47', gem: '#78c7cb' },
  longmama: { motif: 'moon', light: '#faf1ff', mid: '#c3abde', deep: '#665581', enamel: '#2e2048', gem: '#a684da' },
  claude: { motif: 'leaf', light: '#fff3c7', mid: '#cfa760', deep: '#6d4b27', enamel: '#42301e', gem: '#df9a38' },
  gemini: { motif: 'prism', light: '#f3fdff', mid: '#b7c9db', deep: '#697b9d', enamel: '#24384d', gem: '#b0d2f2' },
  grok: { motif: 'flame', light: '#fff0c6', mid: '#c9a35c', deep: '#6d4b2a', enamel: '#231b27', gem: '#a32f57' },
}
const defaultTheme = { motif: 'moon' as const, light: '#fff3d7', mid: '#d9c091', deep: '#685a79', enamel: '#302b40', gem: '#bfa4de' }

type FinishCard = Pick<CardEditionDefinition, 'rarity' | 'characterId'> & Partial<Pick<CardEditionDefinition, 'workId' | 'viewerKind'>>
/** Physical craft and immutable artwork stay intact; this is a reversible, exact-work presentation. */
export function resolvePremiumCardFinish(card: FinishCard): PremiumCardFinishDefinition | null {
  if (card.rarity !== 'SR' && card.rarity !== 'SSR' || card.viewerKind === 'craft') return null
  const binding = card.workId ? COLLECTION_FRAME_BINDINGS[card.workId] : undefined
  if (binding && (binding.characterId !== card.characterId || binding.rarity !== card.rarity)) return null
  return { tier: card.rarity, ...(themes[card.characterId ?? ''] ?? defaultTheme), ...(binding ? { frame: { ...binding, id: 'heirloom-20261015-v2' as const } } : {}) }
}

/** Existing authored craft wins. Plain print viewers receive the same premium fallback as original art. */
export function needsPremiumCardFallback(card: Pick<CardEditionDefinition, 'rarity' | 'viewerUrl' | 'viewerKind'>): boolean {
  return (card.rarity === 'SR' || card.rarity === 'SSR') && (!card.viewerUrl || card.viewerKind !== 'craft')
}

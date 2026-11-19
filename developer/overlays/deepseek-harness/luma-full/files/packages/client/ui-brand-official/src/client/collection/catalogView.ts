export const GRADE_LABELS = { standard: '普卡', fine: '精装', prestige: '典藏', gallery: '画廊特卡' } as const
export const STYLE_LABELS = { illustration: '角色立绘', chibi: 'Q 版', scene: '场景' } as const
export type CollectionGrade = keyof typeof GRADE_LABELS
export type CollectionArtStyle = keyof typeof STYLE_LABELS
export interface BrowsableCard {
  id: string; title: string; subtitle: string; orientation: 'landscape' | 'portrait'; unlockAt: number
  characterId?: string; cardNumber?: string; variantLabel?: string; skinLabel?: string
  grade?: CollectionGrade; artStyle?: CollectionArtStyle
  rarity?: 'base' | 'foil' | 'illustration' | 'special'
}
export function collectionGrade(card: BrowsableCard): CollectionGrade {
  return card.grade ?? (card.orientation === 'landscape' ? 'gallery' : card.rarity === 'base' || !card.rarity ? 'standard' : card.rarity === 'special' ? 'prestige' : 'fine')
}
export function collectionStyle(card: BrowsableCard): CollectionArtStyle { return card.artStyle ?? 'illustration' }
export interface AlbumFilter { character: string; grade: string; style: string; search: string }
export const EMPTY_ALBUM_FILTER: AlbumFilter = Object.freeze({ character: '', grade: '', style: '', search: '' })
export function filterCollection<T extends BrowsableCard>(cards: readonly T[], filter: AlbumFilter): T[] {
  const query = filter.search.trim().toLocaleLowerCase()
  return cards.filter(card => (!filter.character || (card.characterId ?? card.id) === filter.character)
    && (!filter.grade || collectionGrade(card) === filter.grade)
    && (!filter.style || collectionStyle(card) === filter.style)
    && (!query || [card.title, card.subtitle, card.skinLabel, card.variantLabel, card.cardNumber].join(' ').toLocaleLowerCase().includes(query)))
}
export type AlbumGrouping = 'catalog' | 'character' | 'grade'
export function groupCollection<T extends BrowsableCard>(cards: readonly T[], by: AlbumGrouping): { id: string; label: string; cards: T[] }[] {
  const groups = new Map<string, { id: string; label: string; cards: T[] }>()
  for (const card of cards) {
    const id = by === 'character' ? card.characterId ?? card.id : by === 'grade' ? collectionGrade(card) : 'catalog'
    const label = by === 'character' ? card.title : by === 'grade' ? GRADE_LABELS[collectionGrade(card)] : '全部卡面'
    const group = groups.get(id) ?? { id, label, cards: [] }
    group.cards.push(card)
    groups.set(id, group)
  }
  return [...groups.values()].sort((a, b) => by === 'grade' ? Object.keys(GRADE_LABELS).indexOf(a.id) - Object.keys(GRADE_LABELS).indexOf(b.id) : 0)
}

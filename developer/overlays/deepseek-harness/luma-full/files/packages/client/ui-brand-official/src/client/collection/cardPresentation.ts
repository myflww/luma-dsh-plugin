import type { CardEditionDefinition } from './cardLibraryTypes.ts'

/** Upgrade only the presentation of an exact source artwork. Ownership and personal settings keep their original key. */
export function resolveCardPresentation(card: CardEditionDefinition, catalog: readonly CardEditionDefinition[]): CardEditionDefinition {
  if (!card.presentationKey || !card.frontSha256) return card
  const target = catalog.find(row => row.key === card.presentationKey)
  return target && target.key !== card.key && !target.presentationKey && target.workId === card.workId
    && target.character === card.character && target.characterId === card.characterId && target.edition === card.edition
    && target.frontSha256 === card.frontSha256 && target.width === card.width && target.height === card.height
    && !!target.backUrl ? target : card
}

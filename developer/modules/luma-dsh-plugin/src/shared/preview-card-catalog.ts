import { LUMA_COLLECTION_CARDS } from '../../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/collection/catalog.ts'
import { FROZEN_LEGACY_CATALOG } from '../../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/collection/frozenLegacyCatalog.ts'
import { PRODUCTION_CARD_CATALOG } from '../../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/collection/productionCardCatalog.ts'
import type { CardEditionDefinition } from '../../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/collection/cardLibraryTypes.ts'

/** Original snapshot SHA and native canvas, including retained reference-layout works.
 * This display-only metadata grants no edition, ownership, reward, or sale eligibility.
 */
const legacyArtwork = {
  "lumi-prologue": {
    "frontSha256": "c8d36b7bbf85dd23aa32085516b287c6cfbc52cbf1f01cf9910fa834babd0f05",
    "width": 1664,
    "height": 936
  },
  "lumi-base": {
    "frontSha256": "057d21dc90cf15d975f8d58c1cb7873e5d0b0125870b48b53705d39c76343eb5",
    "width": 1366,
    "height": 1402
  },
  "lumi-silver": {
    "frontSha256": "5949a9d21523a13661ce6aabbe8cffd50834a8a7dc18703d2a47a152c0d69fbf",
    "width": 2112,
    "height": 2176
  },
  "orlan-portrait": {
    "frontSha256": "3b876dc38b44298993f54aa5520ca9054c8ed029914f59d923ae08a367e4a050",
    "width": 2048,
    "height": 3072
  },
  "liya-portrait": {
    "frontSha256": "318f270265464c52e66b76ad3a70a6ceb60ba8f0e922250ae334285e3c1d158a",
    "width": 2048,
    "height": 3072
  },
  "moonlit-portico": {
    "frontSha256": "b8cd60368397623350433623b84effc65bb1a11a2112caa50291df83e08ed190",
    "width": 1672,
    "height": 941
  },
  "luna-portrait": {
    "frontSha256": "c235ad72dbcfd77fea8f57a126c540b7e2781973ec5c58c71b6ac928c870dafa",
    "width": 1024,
    "height": 1536
  },
  "ayan-portrait": {
    "frontSha256": "0c27926edc04085992e28285d890cdfbeed97dbeb89389f8c59818c5be2d2962",
    "width": 1024,
    "height": 1535
  },
  "lumi-gold": {
    "frontSha256": "e958b58ff7f776e7e4d6c128aaaf699d38b23bc66b1cd8c7f45a30df7bc1cb6f",
    "width": 2112,
    "height": 2176
  },
  "deep-rift": {
    "frontSha256": "8176cb7f4643fecbba6506396acc3fa6d44aee5f44da57defeeca16f98880515",
    "width": 1672,
    "height": 941
  },
  "rift-maw": {
    "frontSha256": "57b125b898580b681b76fa0903b0d3a74e2256c0b9b01885ea0d9097ec442709",
    "width": 2048,
    "height": 3072
  },
  "night-warden": {
    "frontSha256": "cda0339d817ec57a951852f4211e8e366ae0dbdd1399d73f7904677d29182c15",
    "width": 2048,
    "height": 3072
  },
  "memory-dust": {
    "frontSha256": "3c1430b208e8d432308283cba0311c617200f7b81ca0ac012f644c35bf9ddd29",
    "width": 2048,
    "height": 3072
  },
  "rift-guard": {
    "frontSha256": "362c05b6eaa0aa7de2f8e687c12aa400aa0bf17d22f3f760cf48d69f565c741a",
    "width": 2048,
    "height": 3072
  },
  "rift-archon": {
    "frontSha256": "337068ebdd0b23fcd0f0762cace0ce2df76b0f292551a62c954ab2f52b0faf90",
    "width": 2048,
    "height": 3072
  },
  "eclipse-sanctum": {
    "frontSha256": "4b0e412456e29a35e745266bacc42c00ee30ce2692bb847d913faa66befbdf36",
    "width": 1672,
    "height": 941
  },
  "gatekeeper": {
    "frontSha256": "a7724d0d9388fd336fd747a817c1ac584089f3b50dbbb216d4207d86d84cd75a",
    "width": 1145,
    "height": 1374
  },
  "lumi-ruic-atelier": {
    "frontSha256": "74cabae000231de329f65bfe1027f51877d808f2f806aaa6b2faa319a7c4956a",
    "width": 2048,
    "height": 3072
  },
  "lumi-chibi": {
    "frontSha256": "7af5fe258a0b096955a3a97a8cac267409c409ced57d4e741354577bb2220e1b",
    "width": 804,
    "height": 1454
  },
  "duanmu-original": {
    "frontSha256": "4f271b8cd7f12af4c06ee07f42ca1add195de3af419e49341aa2f2018805ff7c",
    "width": 1600,
    "height": 2464
  },
  "duanmu-chibi": {
    "frontSha256": "2b6ffdec4e4c36eb88c1040d861386e65f5814bb61c412341b538d5a0c846ea2",
    "width": 1010,
    "height": 1436
  },
  "duanmu-gothic": {
    "frontSha256": "567902d1304f8a0836088f3cc84ae46d2d6d3a742cb7a16a57b9e8a49f7dcf24",
    "width": 1600,
    "height": 2464
  },
  "bai-chibi": {
    "frontSha256": "e6cdea616de76928df7721a17cdefcc1bd33f8e5b019872de16ea06c19a6204e",
    "width": 914,
    "height": 1418
  },
  "bai-butterfly-chibi": {
    "frontSha256": "b8bb64b9278a12fa193ba4bcf60fc2e07568dacb744d262b3fc6198008e5142e",
    "width": 1664,
    "height": 2496
  },
  "bai-butterfly": {
    "frontSha256": "0bbe1416b0875de6278b2e07f35744daf380e5e72ddca01d7dae4665b689c59b",
    "width": 1696,
    "height": 2560
  },
  "bai-bridal": {
    "frontSha256": "8163099285af23fe5bbaf1380dc5a102101f9d7b5d0cce54736d05bb065c3a63",
    "width": 1696,
    "height": 2560
  }
} as const

/** All 26 frozen historical designs, displayed as their original static artwork.
 * Their release baseline identifies a historical collection, not a new publication.
 * No unverified viewer, synthetic back, or invented craft is attached to these works.
 */
export const LEGACY_PREVIEW_CARDS: readonly CardEditionDefinition[] = Object.freeze(FROZEN_LEGACY_CATALOG.map(source => {
  const card = LUMA_COLLECTION_CARDS.find(entry => entry.id === source.designId)
  const artwork = legacyArtwork[source.designId as keyof typeof legacyArtwork]
  if (!card || !artwork || card.artUrl !== source.sourceAssetUrl) throw new Error('Historical preview source mismatch: ' + source.designId)
  const workId = source.artworkRef.artworkId
  return Object.freeze({
    key: `${workId}@r1`, workId, revision: 'r1',
    name: `${card.title} · ${card.subtitle}`, alt: card.description,
    character: card.title, characterId: card.characterId, skin: card.skinLabel,
    series: '蔷薇夜章 · 历史原作', seriesId: source.seriesId,
    edition: 'standard' as const, versionLabel: `${card.cardNumber} · 历史原作`,
    ...artwork, frontUrl: source.sourceAssetUrl,
    createdAt: '2026-09-08', historicalRevision: true,
  })
}))

/** Presentation inventory only; the production catalog and transaction pools remain authoritative. */
export const PREVIEW_CARD_CATALOG: readonly CardEditionDefinition[] = Object.freeze([
  ...PRODUCTION_CARD_CATALOG, ...LEGACY_PREVIEW_CARDS,
])

import { type PackDefinition } from './packDefinition.ts'
export { type PackDefinition } from './packDefinition.ts'
import { PRODUCTION_CARD_CATALOG } from '../../collection/productionCardCatalog.ts';
import type { CardEditionDefinition } from '../../collection/cardLibraryTypes.ts';
import { resolveCardPresentation } from '../../collection/cardPresentation.ts';
import type { DemoState, OwnedCardInstance, OwnedCardPack, PackEditionChannelOdds, PackRarity, PackSlotKind, PackSlotOdds } from './types';
import { isCanonicalUniversalCardProduct, UNIVERSAL_CARD_PRODUCT_ID, UNIVERSAL_CARD_PRICE_CNY, UNIVERSAL_CARD_PACK, UNIVERSAL_CARD_PACK_ID, UNIVERSAL_CARD_RARITY, UNIVERSAL_CARD_POOL_POLICY_VERSION } from './universalCardProduct';

export type PackPoolCard = CardEditionDefinition & { readonly rarity: PackRarity };

/** Content admission does not publish a priced pack or grant acquisition eligibility.
 * A future character needs an explicit identity/route here and a separately declared
 * PackDefinition below. Employee activation and a new catalog row are not publication.
 */
export const PACK_PUBLICATION_ADMISSIONS = Object.freeze([
  { characterId: 'shan', character: '端木嫣', packId: 'dawn-prelude' },
  { characterId: 'lu-mi', character: '陆弥', packId: 'blue-rose-echo' },
  { characterId: 'bai-shuangming', character: '白霜命', packId: 'moon-collection' },
  { characterId: 'jingyuniang', character: '鲸鱼娘', packId: 'first-meeting-journey' },
  { characterId: 'longmama', character: '龙妈妈', packId: 'first-meeting-journey' },
  { characterId: 'claude', character: '克劳德', packId: 'first-meeting-journey' },
  { characterId: 'gemini', character: '吉米', packId: 'first-meeting-journey' },
  { characterId: 'grok', character: '绯洛', packId: 'first-meeting-journey' },
].map(row => Object.freeze(row)));
const RESERVED_EGG_WORK_IDS: readonly string[] = Object.freeze(['LR-01', 'RH-05', 'MOON-ASTROLABE']);
type PackRoutingCard = Pick<CardEditionDefinition, 'character'> & Partial<Pick<CardEditionDefinition, 'characterId' | 'workId'>>;
function publicationForCard(card: PackRoutingCard) {
  const character = card.character.trim();
  return PACK_PUBLICATION_ADMISSIONS.find(row => row.character === character
    && (card.characterId === undefined || card.characterId === row.characterId));
}
function publicationAdmitted(card: PackRoutingCard): boolean {
  // Preserve the historical reserved metadata pool; drawEgg remains disabled.
  return Boolean(card.workId && RESERVED_EGG_WORK_IDS.includes(card.workId) || publicationForCard(card));
}
export const PACK_RARITIES: readonly PackRarity[] = ['N', 'R', 'SR', 'SSR'];
export const PACK_RARITY_LABELS: Readonly<Record<PackRarity, string>> = { N: '普通', R: '稀有', SR: '超稀有', SSR: '典藏' };
/** These are demo collecting tiers; they do not change the source edition or award copyright. */
function rarityOf(card: CardEditionDefinition): PackRarity {
  if (card.rarity && PACK_RARITIES.includes(card.rarity)) return card.rarity;
  if (!card.viewerUrl) return 'N';
  if (card.viewerKind === 'print') return 'R';
  return /分层/.test(card.craftLabel ?? '') && /镭射/.test(card.craftLabel ?? '') ? 'SSR' : 'SR';
}
/** Keep every admitted edition available to historical holdings and metadata lookup. */
function retainedCardCatalog(cards: readonly CardEditionDefinition[]): readonly PackPoolCard[] { return Object.freeze(cards
  .filter(card => card.key === `${card.workId}@${card.revision}` && /^[a-f0-9]{64}$/.test(card.frontSha256 ?? '')
    && card.frontUrl === `/luma-card-library/assets/${card.frontSha256}.png`
    && (!card.viewerUrl || /^\/luma-card-viewers\/[A-Za-z0-9-]+\/[A-Za-z0-9-]+\/index\.html\?embed=1$/.test(card.viewerUrl)))
  .map(card => Object.freeze({ ...card, rarity: rarityOf(card) }))); }
function issuanceCardPool(retained: readonly PackPoolCard[], includeDuplicates = false): readonly PackPoolCard[] {
  const presentationKeys = new Set(retained.flatMap(source => {
    const target = resolveCardPresentation(source, retained);
    return target.key === source.key ? [] : [target.key];
  }));
  return Object.freeze(retained.filter(card => !card.historicalRevision && (includeDuplicates || !card.duplicateOf) && !presentationKeys.has(card.key) && publicationAdmitted(card)));
}
/** A validated presentation upgrade changes visuals, never card quotas or set requirements. */
export function createCardPackPool(cards: readonly CardEditionDefinition[]): readonly PackPoolCard[] {
  return issuanceCardPool(retainedCardCatalog(cards));
}
const RETAINED_CARD_CATALOG = retainedCardCatalog(PRODUCTION_CARD_CATALOG);
// The retained catalog and its rows are immutable. Preserve Array.find's
// first-match identity without rescanning it for every quota comparison.
const RETAINED_CARD_BY_KEY: ReadonlyMap<string, PackPoolCard> = (() => {
  const index = new Map<string, PackPoolCard>();
  for (const card of RETAINED_CARD_CATALOG) {
    if (!index.has(card.key)) index.set(card.key, card);
  }
  return index;
})();
/** Exact content validation plus explicit publication admission; never the entire artwork catalog. */
export const CARD_PACK_POOL: readonly PackPoolCard[] = issuanceCardPool(RETAINED_CARD_CATALOG);
export const PACK_SLOT_WEIGHTS: Readonly<Record<PackSlotKind, Readonly<Record<PackRarity, number>>>> = {
  standard: { N: 7000, R: 2000, SR: 800, SSR: 200 },
  rare: { N: 0, R: 8000, SR: 1800, SSR: 200 },
  superRare: { N: 0, R: 0, SR: 9000, SSR: 1000 },
};
/** Independent configuration: changing the easter-egg tiers never changes regular rarity odds. */
export const ERRATA_SLOT_WEIGHTS: Readonly<Record<PackSlotKind, Readonly<Record<PackRarity, number>>>> = {
  standard: { N: 4000, R: 3000, SR: 2000, SSR: 1000 },
  rare: { N: 0, R: 8000, SR: 1800, SSR: 200 },
  superRare: { N: 0, R: 0, SR: 9000, SSR: 1000 },
};
export const PACK_EDITION_CHANNEL_WEIGHTS = Object.freeze({ regular: 99, errata: 1 });
export type PackDrawOptions = { readonly deliveryPolicy?: 'easteregg-v1' | 'legacy-uniform' };
const SLOT_LABELS: Record<PackSlotKind, string> = { standard: '单张抽取', rare: 'R 或以上保底槽', superRare: 'SR 或以上保底槽' };
const singleSlot = Object.freeze([Object.freeze({ kind: 'standard' as const, count: 1 })]);
export const FIRST_MEETING_PACK_ID = 'first-meeting-journey';
export const MAX_CARD_DRAWS = 3;
/** Display the actual cumulative issuance policy; current holdings never reset it. */
export const CARD_DRAW_LIMIT_RULE = `每个账号在当前卡池中，同一卡面版本最多累计抽到 ${MAX_CARD_DRAWS} 张；抽满后不会再抽到，兑换或转售也不恢复额度。`;
/** Preserve the disclosed delivery rights of packs purchased before the pool review. */
export const RETAINED_CARD_DRAW_LIMIT_RULE = `此旧卡包保留购入时的原卡池额度：每个版本最多累计抽到 ${MAX_CARD_DRAWS} 张，与当前在售卡池分别计数；兑换或转售不恢复额度。`;
export const EGG_CHANNEL = Object.freeze({ enabled: false, probability: null, maxDraws: MAX_CARD_DRAWS, workIds: RESERVED_EGG_WORK_IDS });
/** Reserved independent channel: no probability or asset issuance until explicitly enabled. */
export function drawEgg(): undefined { return undefined; }
const BASE_PACKS: readonly PackDefinition[] = Object.freeze([
  { id: FIRST_MEETING_PACK_ID, name: '初见与远行', description: '鲸鱼娘、龙妈妈、克劳德、吉米与绯洛的旅途收藏。每日可免费领取一包，额外每包 10 水晶。集齐各角色的正版卡面，解锁专属主题。', series: [], priceCny: 0, allowCny: false, priceCrystals: 10, cardCount: 1, artworkUrl: '', slots: singleSlot },
  { id: 'dawn-prelude', name: '晨光序章', character: '端木嫣', description: '端木嫣的跨系列收藏，每包一张。集齐此角色全部不同正版卡可解锁主题。', series: [], priceCny: 6, priceCrystals: 60, cardCount: 1, artworkUrl: '/luma-economy/packs/dawn-v1.png', slots: singleSlot },
  { id: 'blue-rose-echo', name: '蓝蔷薇回响', character: '陆弥', description: '陆弥的跨系列收藏，每包一张。集齐此角色全部不同正版卡可解锁主题。', series: [], priceCny: 6, priceCrystals: 60, cardCount: 1, artworkUrl: '/luma-economy/packs/blue-rose-v1.png', slots: singleSlot },
  { id: 'moon-collection', name: '月相典藏', character: '白霜命', description: '白霜命的跨系列收藏，每包一张。集齐此角色全部不同正版卡可解锁主题。', series: [], priceCny: 6, priceCrystals: 60, cardCount: 1, artworkUrl: '/luma-economy/packs/moon-v1.png', slots: singleSlot },
].map(pack => Object.freeze({ ...pack, series: Object.freeze(pack.series) })));
/** Grandfathered purchases keep their original nine edition slots and per-key draw quota. */
export const LEGACY_PACK_CATALOG: readonly PackDefinition[] = Object.freeze([
  { id: 'gemini-prism', name: '折光未来', character: '吉米', description: '已停售。已持有的卡包仍可开启，开封时展示当前旧包概率。', series: [], priceCny: 6, priceCrystals: 60, cardCount: 1, artworkUrl: '/luma-economy/packs/gemini-v1.png', slots: singleSlot, retired: true },
  { id: 'grok-golden-stage', name: '金幕序曲', character: '绯洛', description: '已停售。已持有的卡包仍可开启，开封时展示当前旧包概率。', series: [], priceCny: 6, priceCrystals: 60, cardCount: 1, artworkUrl: '/luma-economy/packs/grok-v1.png', slots: singleSlot, retired: true },
].map(pack => Object.freeze({ ...pack, series: Object.freeze(pack.series) })));
/** Role is the routing key; protected role-page cards and eggs never enter a sale pool. */
export function getPackIdForCard(card: PackRoutingCard): string {
  if (card.workId && EGG_CHANNEL.workIds.includes(card.workId)) return 'egg-channel';
  if (/^(JYN|LMM|CLD|GMI|GRK)-C0[12]$/.test(card.workId ?? '')) return 'role-page';
  return publicationForCard(card)?.packId ?? 'catalog-only';
}
/** Prices and pack publication come only from explicit definitions, never inferred art names. */
export function createPackCatalog(_cards: readonly CardEditionDefinition[]): readonly PackDefinition[] {
  return BASE_PACKS;
}
export const PACK_CATALOG = createPackCatalog(CARD_PACK_POOL);
const RETAINED_BLUE_ROSE_DELIVERY_ID = 'blue-rose-echo:retained-v3';
/** Purchased packs retain their disclosed work slots when the current character album expands. */
const RETAINED_BLUE_ROSE_WORK_IDS: readonly string[] = Object.freeze(['RH-02', 'RH-04', 'LM-B', 'LM-S01', 'LM-C', 'LM-F']);
const LEGACY_CHARACTER_WORK_IDS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  'gemini-prism': Object.freeze(['GMI-C03', 'GMI-C04', 'GMI-C05', 'GMI-C06', 'GMI-C07', 'GMI-C08']),
  'grok-golden-stage': Object.freeze(['GRK-C03', 'GRK-C04', 'GRK-C05', 'GRK-C06', 'GRK-C07', 'GRK-C08']),
});
/** Old blue-rose purchases retain ten edition slots. New purchases use the current published pool. */
export function getPackDeliveryId(pack: Pick<OwnedCardPack, 'packId' | 'deliveryPolicy'>): string {
  return pack.packId === 'blue-rose-echo' && pack.deliveryPolicy === undefined ? RETAINED_BLUE_ROSE_DELIVERY_ID : pack.packId;
}
function retainedDelivery(packId: string): boolean {
  return packId === RETAINED_BLUE_ROSE_DELIVERY_ID || LEGACY_PACK_CATALOG.some(pack => pack.id === packId);
}
function deliveryDefinition(packId: string): PackDefinition | undefined {
  return getPackDefinition(packId === RETAINED_BLUE_ROSE_DELIVERY_ID ? 'blue-rose-echo' : packId);
}
export function getPackPool(packId: string, cards: readonly PackPoolCard[] = CARD_PACK_POOL): readonly PackPoolCard[] {
  if (packId === UNIVERSAL_CARD_PACK_ID) return Object.freeze(cards.filter(card => card.edition === 'standard' && card.rarity === UNIVERSAL_CARD_RARITY
    && !card.historicalRevision && !card.duplicateOf && getCardCollectionKey(card.key) === card.key
    && publicationAdmitted(card) && PACK_CATALOG.some(pack => pack.id === getPackIdForCard(card))));
  if (packId === RETAINED_BLUE_ROSE_DELIVERY_ID) {
    const retained = cards === CARD_PACK_POOL ? RETAINED_CARD_CATALOG : cards;
    return Object.freeze(issuanceCardPool(retained, true).filter(card => getPackIdForCard(card) === 'blue-rose-echo' && RETAINED_BLUE_ROSE_WORK_IDS.includes(card.workId)));
  }
  const legacy = LEGACY_PACK_CATALOG.find(pack => pack.id === packId);
  if (legacy) {
    const retained = cards === CARD_PACK_POOL ? RETAINED_CARD_CATALOG : cards;
    return Object.freeze(retained.filter(card => !card.historicalRevision && publicationAdmitted(card)
      && card.character === legacy.character && (LEGACY_CHARACTER_WORK_IDS[packId] ?? []).includes(card.workId)));
  }
  return Object.freeze(cards.filter(card => publicationAdmitted(card) && getPackIdForCard(card) === packId));
}
export type DrawCounts = Readonly<Record<string, number>>;
/** Prepaid retired packs have a delivery quota separate from later mixed-pack draws. Global history is never rewritten. */
export function packDrawCountsFor(state: Pick<DemoState, 'currentUserId' | 'drawCounts' | 'packOpenings' | 'ownedPacks'>,
  packId: string, userId: string | null = state.currentUserId): DrawCounts {
  if (!userId) return {};
  if (!retainedDelivery(packId)) return state.drawCounts[userId] ?? {};
  const counts: Record<string, number> = {};
  for (const opening of state.packOpenings) if (opening.ownerId === userId
    && (packId === RETAINED_BLUE_ROSE_DELIVERY_ID
      ? opening.packId === 'blue-rose-echo' && state.ownedPacks.some(pack => pack.id === opening.packInstanceId && getPackDeliveryId(pack) === packId)
      : opening.packId === packId))
    for (const result of opening.results) counts[result.cardKey] = (counts[result.cardKey] ?? 0) + 1;
  return counts;
}
/** Only an audited same-role, same-work, same-edition, byte-identical front can count as one card. */
export function getCardCollectionKey(cardKey: string): string {
  const card = getPackCard(cardKey), target = card?.duplicateOf ? getPackCard(card.duplicateOf) : undefined;
  return card && target && target.key !== card.key && !target.duplicateOf && card.workId === target.workId
    && card.character === target.character && card.characterId === target.characterId && card.edition === target.edition
    && !!card.frontSha256 && card.frontSha256 === target.frontSha256 ? target.key : cardKey;
}
/** New issuance counts retired same-artwork keys against the shared limit; legacy sealed packs keep prepaid quotas. */
export function drawCountForCard(cardKey: string, counts: DrawCounts = {}, packId?: string): number {
  if (packId !== undefined && retainedDelivery(packId)) return counts[cardKey] ?? 0;
  const key = getCardCollectionKey(cardKey);
  return Object.entries(counts).reduce((sum, [storedKey, count]) => sum + (getCardCollectionKey(storedKey) === key ? count : 0), 0);
}
function legacyDrawPolicy(packId: string, options: PackDrawOptions): boolean {
  return options.deliveryPolicy === 'legacy-uniform' || options.deliveryPolicy === undefined && retainedDelivery(packId);
}
/** New sales reserve only regular quota. Older sealed purchases retain their full original delivery capacity. */
export function remainingPackDraws(packId: string, counts: DrawCounts = {}, options: PackDrawOptions = {}): number {
  return getPackPool(packId).filter(card => legacyDrawPolicy(packId, options) || card.edition !== 'errata')
    .reduce((sum, card) => sum + Math.max(0, MAX_CARD_DRAWS - drawCountForCard(card.key, counts, packId)), 0);
}
export function availablePackPurchases(state: DemoState, packId: string, userId: string | null = state.currentUserId): number {
  if (!userId) return 0;
  const reserved = state.ownedPacks.filter(pack => pack.ownerId === userId && pack.status === 'sealed'
    && (pack.packId === packId || packId === FIRST_MEETING_PACK_ID && LEGACY_PACK_CATALOG.some(legacy => legacy.id === pack.packId))).length;
  return Math.max(0, remainingPackDraws(packId, packDrawCountsFor(state, packId, userId)) - reserved);
}
/** A new highest-tier purchase cannot consume the last capacity reserved by an existing sealed character pack. */
export function universalCardDrawCountsFor(state: DemoState, userId: string | null = state.currentUserId): DrawCounts {
  const counts: Record<string, number> = { ...(userId ? state.drawCounts[userId] : {}) };
  for (const pack of PACK_CATALOG) if (!userId || availablePackPurchases(state, pack.id, userId) === 0) {
    for (const card of getPackPool(pack.id)) if (card.rarity === UNIVERSAL_CARD_RARITY) counts[card.key] = MAX_CARD_DRAWS;
  }
  return counts;
}
export function getUniversalCardOffer(state: DemoState, userId: string | null = state.currentUserId) {
  const counts = universalCardDrawCountsFor(state, userId);
  const cards = getPackPool(UNIVERSAL_CARD_PACK_ID).filter(card => drawCountForCard(card.key, counts) < MAX_CARD_DRAWS);
  return { available: !!userId && cards.length > 0, rarity: UNIVERSAL_CARD_RARITY,
    priceCny: UNIVERSAL_CARD_PACK.priceCny, eligibleCardCount: cards.length,
    remainingDraws: PACK_CATALOG.reduce((sum, pack) => {
      const tierCapacity = cards.filter(card => getPackIdForCard(card) === pack.id)
        .reduce((total, card) => total + MAX_CARD_DRAWS - drawCountForCard(card.key, counts), 0);
      return sum + Math.min(tierCapacity, availablePackPurchases(state, pack.id, userId));
    }, 0),
    poolVersion: UNIVERSAL_CARD_POOL_VERSION,
    odds: getPackOdds(UNIVERSAL_CARD_PACK_ID, counts) };
}
/** Shared display/action admission for the single CNY offer; does not enable cloud payments. */
export function universalCardPurchaseAvailability(state: DemoState, userId: string | null = state.currentUserId) {
  const offer = getUniversalCardOffer(state, userId), user = state.users.find(entry => entry.id === userId);
  const product = state.products.find(entry => entry.id === UNIVERSAL_CARD_PRODUCT_ID);
  const reason = !user ? '请先登录后查看可抽卡池。' : user.id === 'official' ? '不能购买自己的官方商品。'
    : !product || !isCanonicalUniversalCardProduct(product) ? '万能卡包商品记录暂未就绪，请稍后重试。'
      : product.status !== 'published' ? '万能卡包当前未上架。'
        : !offer.available ? '当前没有可抽取的 SSR 典藏版本；未开封卡包的额度已保留。'
          : user.cnyCents < UNIVERSAL_CARD_PRICE_CNY * 100 ? '演示人民币余额不足。' : '';
  return { ...offer, available: !reason, canPurchase: !reason, reason, maxDrawsPerVersion: MAX_CARD_DRAWS,
    probabilityDescription: offer.eligibleCardCount > 0
      ? `SSR 典藏品质保证；在当前 ${offer.eligibleCardCount} 个可抽正版卡面版本中等概率随机获得一张（不含错版）。每版本累计最多 ${MAX_CARD_DRAWS} 张，转售或兑换不恢复额度。`
      : 'SSR 典藏品质保证，不会降为其他品质；没有合法可抽版本时不会扣款。',
    localOnly: true as const };
}
export function getPackDefinition(packId: string): PackDefinition | undefined { return packId === UNIVERSAL_CARD_PACK_ID ? UNIVERSAL_CARD_PACK : [...PACK_CATALOG, ...LEGACY_PACK_CATALOG].find(pack => pack.id === packId); }
export function getPackCard(cardKey: string): PackPoolCard | undefined { return RETAINED_CARD_BY_KEY.get(cardKey); }
/** Probabilities are fractions, not percentages. An empty tier is excluded and the remaining weights normalize. */
export function getPackOdds(packId: string, counts: DrawCounts = {}, options: PackDrawOptions = {}): PackSlotOdds[] {
  // This independent offer guarantees a standard SSR; ordinary packs retain their channel-first 99:1 policy.
  if (packId === UNIVERSAL_CARD_PACK_ID) {
    const cardCount = getPackPool(packId).filter(card => drawCountForCard(card.key, counts, packId) < MAX_CARD_DRAWS).length;
    return [{ kind: 'standard', label: 'SSR 典藏必得', count: 1, available: cardCount > 0,
      rarities: PACK_RARITIES.map(rarity => ({ rarity, weight: rarity === UNIVERSAL_CARD_RARITY && cardCount > 0 ? 10000 : 0,
        probability: rarity === UNIVERSAL_CARD_RARITY && cardCount > 0 ? 1 : 0, cardCount: rarity === UNIVERSAL_CARD_RARITY ? cardCount : 0,
        perCardProbability: rarity === UNIVERSAL_CARD_RARITY && cardCount > 0 ? 1 / cardCount : 0 })) }];
  }
  const pool = getPackPool(packId).filter(card => drawCountForCard(card.key, counts, packId) < MAX_CARD_DRAWS);
  return (deliveryDefinition(packId)?.slots ?? []).map(slot => {
    const counts = Object.fromEntries(PACK_RARITIES.map(rarity => [rarity, pool.filter(card => card.rarity === rarity).length])) as Record<PackRarity, number>;
    const total = PACK_RARITIES.reduce((sum, rarity) => sum + (counts[rarity] > 0 ? PACK_SLOT_WEIGHTS[slot.kind][rarity] : 0), 0);
    const legacy: PackSlotOdds = { kind: slot.kind, label: SLOT_LABELS[slot.kind], count: slot.count, available: total > 0,
      rarities: PACK_RARITIES.map(rarity => {
        const weight = counts[rarity] > 0 ? PACK_SLOT_WEIGHTS[slot.kind][rarity] : 0;
        const probability = total > 0 ? weight / total : 0;
        return { rarity, weight, probability, cardCount: counts[rarity], perCardProbability: counts[rarity] > 0 ? probability / counts[rarity] : 0 };
      }) };
    if (legacyDrawPolicy(packId, options)) return legacy;
    const channelRows = (['regular', 'errata'] as const).map(edition => {
      const cards = pool.filter(card => (card.edition === 'errata' ? 'errata' : 'regular') === edition);
      const weights = edition === 'regular' ? PACK_SLOT_WEIGHTS[slot.kind] : ERRATA_SLOT_WEIGHTS[slot.kind];
      const rarities = PACK_RARITIES.map(rarity => {
        const cardCount = cards.filter(card => card.rarity === rarity).length;
        return { rarity, cardCount, weight: cardCount > 0 ? weights[rarity] : 0 };
      });
      return { edition, cardCount: cards.length, rarities, rarityWeight: rarities.reduce((sum, tier) => sum + tier.weight, 0) };
    });
    // There is no errata-only tail for new packs. An exhausted regular channel stops new issuance.
    const regularAvailable = channelRows[0]!.rarityWeight > 0;
    const channelWeights = channelRows.map(row => regularAvailable && row.rarityWeight > 0 ? PACK_EDITION_CHANNEL_WEIGHTS[row.edition] : 0);
    const channelTotal = channelWeights.reduce<number>((sum, weight) => sum + weight, 0);
    const editionChannels: PackEditionChannelOdds[] = channelRows.map((row, index) => {
      const weight = channelWeights[index]!, probability = channelTotal > 0 ? weight / channelTotal : 0;
      return { edition: row.edition, weight, probability, cardCount: row.cardCount, rarities: row.rarities.map(tier => {
        const conditionalProbability = row.rarityWeight > 0 ? tier.weight / row.rarityWeight : 0;
        const joint = probability * conditionalProbability;
        return { ...tier, conditionalProbability, probability: joint, perCardProbability: tier.cardCount > 0 ? joint / tier.cardCount : 0 };
      }) };
    });
    const regularTotal = channelRows[0]!.rarityWeight || 1, errataTotal = channelRows[1]!.rarityWeight || 1;
    return { kind: slot.kind, label: SLOT_LABELS[slot.kind], count: slot.count, available: regularAvailable, editionChannels,
      rarities: PACK_RARITIES.map(rarity => {
        const regular = editionChannels[0]!.rarities.find(tier => tier.rarity === rarity)!, errata = editionChannels[1]!.rarities.find(tier => tier.rarity === rarity)!;
        const weight = channelWeights[0]! * regular.weight * errataTotal + channelWeights[1]! * errata.weight * regularTotal;
        const probability = regular.probability + errata.probability, cardCount = regular.cardCount + errata.cardCount;
        return { rarity, weight, probability, cardCount, perCardProbability: cardCount > 0 ? probability / cardCount : 0,
          editionGroups: editionChannels.map(channel => {
            const tier = channel.rarities.find(tier => tier.rarity === rarity)!;
            return { edition: channel.edition, cardCount: tier.cardCount, probability: tier.probability, perCardProbability: tier.perCardProbability };
          }) };
      }) };
  });
}
export function ownedPacksFor(state: DemoState, userId: string | null = state.currentUserId): OwnedCardPack[] { return state.ownedPacks.filter(pack => pack.ownerId === userId); }
export function ownedCardsFor(state: DemoState, userId: string | null = state.currentUserId): OwnedCardInstance[] { return state.cardInstances.filter(card => card.ownerId === userId && card.redeemedAt === undefined); }
/** Rejection sampling avoids modulo bias. Randomness is local, never represented as server-verifiable fairness. */
function randomBelow(upperExclusive: number): number {
  if (!Number.isSafeInteger(upperExclusive) || upperExclusive < 1 || upperExclusive > 0xffffffff) throw new Error('当前卡池无法抽取。');
  if (!globalThis.crypto?.getRandomValues) throw new Error('此环境不支持安全随机抽取，卡包保持未开启。');
  const limit = 0x100000000 - 0x100000000 % upperExclusive;
  const bytes = new Uint32Array(1);
  do { globalThis.crypto.getRandomValues(bytes); } while (bytes[0]! >= limit);
  return bytes[0]! % upperExclusive;
}
export function newPackEntityId(prefix: string): string {
  if (!globalThis.crypto?.getRandomValues) throw new Error('此环境不支持安全生成卡包编号。');
  const bytes = new Uint8Array(16); globalThis.crypto.getRandomValues(bytes);
  return `${prefix}-${Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')}`;
}
function poolVersion(): string {
  let fingerprint = 2166136261;
  const policy = JSON.stringify({ regular: PACK_SLOT_WEIGHTS, errata: ERRATA_SLOT_WEIGHTS, channels: PACK_EDITION_CHANNEL_WEIGHTS });
  for (const letter of CARD_PACK_POOL.map(card => `${card.key}:${card.rarity}:${card.edition}:${card.frontSha256}:${getPackIdForCard(card)}`).sort().join('|') + '|channel-first-v1:normal-capacity:legacy-uniform:same-front-cumulative3:legacy-sealed9:retained-blue10|' + policy) { fingerprint ^= letter.charCodeAt(0); fingerprint = Math.imul(fingerprint, 16777619); }
  return `production-easteregg-v1-${(fingerprint >>> 0).toString(16)}`;
}
export const PACK_POOL_VERSION = poolVersion();
/** A separate fingerprint never claims the ordinary easter-egg snapshot contract. */
export const UNIVERSAL_CARD_POOL_VERSION = (() => {
  let fingerprint = 2166136261;
  const policy = `${UNIVERSAL_CARD_POOL_POLICY_VERSION}:standard-only:equal-card:shared-canonical-cap${MAX_CARD_DRAWS}:sealed-reservations`;
  for (const letter of getPackPool(UNIVERSAL_CARD_PACK_ID).map(card => `${card.key}:${card.rarity}:${card.edition}:${card.frontSha256}:${getPackIdForCard(card)}`).sort().join('|') + '|' + policy) {
    fingerprint ^= letter.charCodeAt(0); fingerprint = Math.imul(fingerprint, 16777619);
  }
  return `universal-standard-ssr-v1-${(fingerprint >>> 0).toString(16).padStart(8, '0')}`;
})();
export function drawPack(packId: string, counts: DrawCounts = {}, options: PackDrawOptions = {}): { poolVersion: string; oddsSnapshot: PackSlotOdds[]; cards: Array<{ card: PackPoolCard; slotKind: PackSlotKind }> } {
  const definition = deliveryDefinition(packId);
  if (!definition) throw new Error('卡包不存在。');
  const oddsSnapshot = getPackOdds(packId, counts, options);
  if (oddsSnapshot.some(slot => !slot.available)) throw new Error('当前卡池没有符合保底条件的版本，卡包保持未开启。');
  if (definition.cardCount !== 1 || oddsSnapshot.length !== 1 || oddsSnapshot[0]!.count !== 1) throw new Error('每个卡包只允许抽取一张卡。');
  const pool = getPackPool(packId).filter(card => drawCountForCard(card.key, counts, packId) < MAX_CARD_DRAWS);
  const cards: Array<{ card: PackPoolCard; slotKind: PackSlotKind }> = [];
  for (const slot of oddsSnapshot) for (let i = 0; i < slot.count; i++) {
    let channel: PackEditionChannelOdds | undefined;
    if (slot.editionChannels) {
      let channelTicket = randomBelow(slot.editionChannels.reduce((sum, channel) => sum + channel.weight, 0));
      channel = slot.editionChannels.find(candidate => { channelTicket -= candidate.weight; return channelTicket < 0; });
      if (!channel) throw new Error('卡包彩蛋概率配置无效，未消耗卡包。');
    }
    const rarities = channel?.rarities ?? slot.rarities;
    let ticket = randomBelow(rarities.reduce((sum, tier) => sum + tier.weight, 0));
    const tier = rarities.find(candidate => { ticket -= candidate.weight; return ticket < 0; });
    if (!tier) throw new Error('卡包概率配置无效，未消耗卡包。');
    const candidates = pool.filter(card => card.rarity === tier.rarity && (!channel || (card.edition === 'errata' ? 'errata' : 'regular') === channel.edition));
    const card = candidates[randomBelow(candidates.length)];
    if (!card) throw new Error('卡包版本不可用，未消耗卡包。');
    cards.push({ card, slotKind: slot.kind });
  }
  return { poolVersion: packId === UNIVERSAL_CARD_PACK_ID ? UNIVERSAL_CARD_POOL_VERSION : legacyDrawPolicy(packId, options) ? PACK_POOL_VERSION.replace('production-easteregg-v1-', 'production-legacy-uniform-') : PACK_POOL_VERSION, oddsSnapshot, cards };
}

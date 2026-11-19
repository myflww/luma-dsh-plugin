import type { DemoProduct, DemoState } from './types';
import type { PackDefinition } from './packDefinition';

/** A new issuance SKU keeps every historical single-instance order on its original product ID. */
export const UNIVERSAL_CARD_PRODUCT_ID = 'official-universal-card-pack';
export const UNIVERSAL_CARD_PACK_ID = 'universal-highest-card';
export const UNIVERSAL_CARD_PRICE_CNY = 68;
export const UNIVERSAL_CARD_RARITY = 'SSR' as const;
export const UNIVERSAL_CARD_TITLE = '万能卡包';
export const UNIVERSAL_CARD_DESCRIPTION = '每次人民币 68 元，随机获得当前合法在售卡池中的一张 SSR 典藏卡。每个版本累计抽取上限与普通卡包共用；无可抽版本时不会扣款。本机交易仅为演示，不产生云端支付或正式资产。';
export const UNIVERSAL_CARD_POOL_POLICY_VERSION = 'highest-ssr-v1';
/** Kept out of the disjoint character-pack shelves; available for delivery and historical lookup. */
export const UNIVERSAL_CARD_PACK: PackDefinition = Object.freeze({
  id: UNIVERSAL_CARD_PACK_ID, name: UNIVERSAL_CARD_TITLE, description: UNIVERSAL_CARD_DESCRIPTION,
  priceCny: UNIVERSAL_CARD_PRICE_CNY, priceCrystals: 0, allowCny: true, cardCount: 1,
  artworkUrl: '', series: Object.freeze([]), slots: Object.freeze([Object.freeze({ kind: 'standard' as const, count: 1 })]),
});

export function createUniversalCardProduct(createdAt: number): DemoProduct {
  return { id: UNIVERSAL_CARD_PRODUCT_ID, title: UNIVERSAL_CARD_TITLE, description: UNIVERSAL_CARD_DESCRIPTION,
    kind: 'card', sellerId: 'official', official: true, currency: 'cny', price: UNIVERSAL_CARD_PRICE_CNY,
    license: 'unlimited', supply: 1, soldCount: 0, status: 'published', version: 1, createdAt,
    everLicensed: false, disputed: false };
}

export function isUniversalCardProduct(product: Pick<DemoProduct, 'id'>): boolean {
  return product.id === UNIVERSAL_CARD_PRODUCT_ID;
}

export function isCanonicalUniversalCardProduct(product: DemoProduct): boolean {
  return isUniversalCardProduct(product) && product.title === UNIVERSAL_CARD_TITLE && product.description === UNIVERSAL_CARD_DESCRIPTION
    && product.kind === 'card' && product.sellerId === 'official' && product.official && product.currency === 'cny'
    && product.price === UNIVERSAL_CARD_PRICE_CNY && product.license === 'unlimited' && product.version === 1
    && product.supply === 1 && product.ownerId === undefined && !product.sourceOrderId && !product.sourceProductId
    && !product.sourceCardInstanceId && !product.artifactRef && !product.localOnly && !product.attachments?.length;
}

const LEGACY_PLACEHOLDER_ID = 'official-rose-card';
const LEGACY_SEED_KEYS = new Set(['id', 'title', 'description', 'kind', 'price', 'official', 'license', 'sellerId',
  'currency', 'supply', 'soldCount', 'status', 'version', 'createdAt', 'everLicensed', 'disputed', 'ownerId']);
function untouchedPlaceholder(product: DemoProduct, state: DemoState): boolean {
  return product.id === LEGACY_PLACEHOLDER_ID && product.title === '蓝蔷薇 · 星夜典藏卡'
    && product.description === '蓝蔷薇系列官方商品实例。仅用于本地演示。' && product.kind === 'card'
    && product.sellerId === 'official' && product.official && product.currency === 'cny' && product.price === 6
    && product.license === 'instance' && product.ownerId === 'official' && product.supply === 1 && product.soldCount === 0
    && product.status === 'published' && product.version === 1 && !product.everLicensed && !product.disputed
    && Object.keys(product).every(key => LEGACY_SEED_KEYS.has(key))
    && !state.orders.some(order => order.productId === product.id)
    && !state.products.some(entry => entry.sourceProductId === product.id)
    && !state.posts.some(post => post.gameId === product.id);
}

/** Add the new official SKU without rewriting orders, edits, sold instances or third-party products. */
export function migrateUniversalCardProduct(state: DemoState): void {
  if (!Array.isArray(state.products) || !Array.isArray(state.users) || !Array.isArray(state.orders) || !Array.isArray(state.posts)
    || state.products.some(product => product.id === UNIVERSAL_CARD_PRODUCT_ID)
    || !state.users.some(user => user.id === 'official' && user.role === 'official')) return;
  const index = state.products.findIndex(product => untouchedPlaceholder(product, state));
  if (index >= 0) state.products[index] = createUniversalCardProduct(state.products[index]!.createdAt);
  else state.products.push(createUniversalCardProduct(state.updatedAt));
}

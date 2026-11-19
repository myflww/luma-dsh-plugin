/** Isolated local demonstrations only. Values are not accounts, money or entitlements. */
export type Currency = 'cny' | 'crystal';
export type ProductKind = 'card' | 'character' | 'workflow' | 'game' | 'skin';
export type LicenseMode = 'instance' | 'unlimited' | 'limited' | 'exclusive';
export type ProductStatus = 'draft' | 'pending' | 'published' | 'unlisted' | 'review' | 'sold';
export type DemoUser = {
  id: string;
  name: string;
  role: 'member' | 'official';
  inviteCode: string;
  identityVerified: boolean;
  depositCents: number;
  depositPaidAt?: number | null;
  cnyCents: number;
  bannedUntil: number | null;
  linkedGroup?: string;
  listingHistory: number[];
  lastListedAt: number | null;
  penaltyAppeal?: string;
};
export const CRYSTAL_EVENT_KINDS = ['issue', 'tip', 'sale', 'consume', 'freeze', 'unfreeze'] as const;
export type CrystalEvent = {
  id: string;
  at: number;
  kind: typeof CRYSTAL_EVENT_KINDS[number];
  from?: string;
  to?: string;
  reference?: string;
};
export type Crystal = {
  id: string;
  origin: 'online' | 'official' | 'review';
  issuedAt: number;
  ownerId: string | null;
  creatorIncome: boolean;
  status: 'available' | 'spent';
  history: CrystalEvent[];
};
export type ChargeState = {
  elapsedMs: number;
  lastHeartbeatAt: number | null;
  dayKey: number;
  claimedToday: number;
  legacyCarryMs: number;
};
export type DemoProduct = {
  id: string;
  title: string;
  description: string;
  kind: ProductKind;
  sellerId: string;
  official: boolean;
  currency: Currency;
  price: number;
  license: LicenseMode;
  supply: number;
  soldCount: number;
  status: ProductStatus;
  version: number;
  createdAt: number;
  sourceProductId?: string;
  sourceOrderId?: string;
  ownerId?: string;
  everLicensed: boolean;
  disputed: boolean;
  localOnly?: boolean;
  artifactRef?: string;
  reviewForUpdate?: boolean;
  sourceCardInstanceId?: string;
  attachments?: DemoAttachment[];
};
export type DemoOrder = {
  id: string;
  productId: string;
  buyerId: string;
  sellerId: string;
  title: string;
  kind: ProductKind;
  version: number;
  license: LicenseMode;
  currency: Currency;
  paid: number;
  fee: number;
  sellerReceives: number;
  at: number;
  status: 'complete' | 'disputed';
  ownershipTransferred: boolean;
  sourceOrderId?: string;
  cardInstanceId?: string;
  cardDelivery?: { packPurchaseId: string; packOpeningId: string; poolVersion: string; rarity: 'SSR'; localOnly: true };
  attachments?: DemoAttachment[];
};
export type PackRarity = 'N' | 'R' | 'SR' | 'SSR';
export type PackSlotKind = 'standard' | 'rare' | 'superRare';
export type PackEditionGroupOdds = { edition: 'regular' | 'errata'; cardCount: number; probability: number; perCardProbability: number };
export type PackEditionChannelOdds = {
  edition: 'regular' | 'errata'; weight: number; probability: number; cardCount: number;
  rarities: Array<{ rarity: PackRarity; weight: number; conditionalProbability: number; probability: number; cardCount: number; perCardProbability: number }>;
};
export type PackSlotOdds = { kind: PackSlotKind; label: string; count: number; available: boolean; rarities: Array<{
  rarity: PackRarity; weight: number; probability: number; cardCount: number;
  /** Historical uniform odds, or a compatibility average. For grouped draws use editionGroups instead. */
  perCardProbability: number;
  /** Joint slot probabilities, derived from the independent edition channels. */
  editionGroups?: PackEditionGroupOdds[];
}>; editionChannels?: PackEditionChannelOdds[] };
export type OwnedCardPack = { id: string; packId: string; ownerId: string; purchaseId: string; purchasedAt: number; status: 'sealed' | 'opened'; openingId?: string; deliveryPolicy?: 'canonical-v1' | 'easteregg-v1' };
export type PackPurchase = { id: string; userId: string; packId: string; quantity: number; currency: Currency | 'free'; paid: number; dayKey?: number; requestId: string; packInstanceIds: string[]; at: number };
export type OwnedCardInstance = { id: string; cardKey: string; rarity: PackRarity; ownerId: string; createdAt: number; packInstanceId: string; openingId: string; redeemedAt?: number; history: Array<{ at: number; kind: 'opened' | 'sale' | 'redeemed'; from?: string; to: string; orderId?: string }> };
export type PackOpening = { id: string; packInstanceId: string; packId: string; ownerId: string; requestId: string; openedAt: number; cardInstanceIds: string[]; results: Array<{ instanceId: string; cardKey: string; rarity: PackRarity; slotKind: PackSlotKind }>; poolVersion: string; oddsSnapshot: PackSlotOdds[] };
export type DemoAttachment = { id: string; kind: 'card' | 'package' | 'image' | 'workflow'; name: string; bytes: number; mime: string; sha256: string; storage: 'indexeddb' | 'catalog'; cardKey?: string; instanceId?: string; version?: string; platform?: string; license?: string; notes?: string };
export type DemoPost = {
  id: string;
  authorId: string;
  title: string;
  body: string;
  likes: string[];
  bookmarks: string[];
  createdAt: number;
  gameId?: string;
  attachments?: DemoAttachment[];
  resourceStatus?: 'pending' | 'published' | 'rejected';
  reviewReason?: string;
};
export type DemoTip = {
  id: string;
  fromId: string;
  toId: string;
  targetKind: 'post' | 'game';
  targetId: string;
  amount: number;
  at: number;
};
export type ReviewSubmission = {
  userId: string;
  reason: string;
  at: number;
  accepted: boolean;
  position?: 'support' | 'oppose';
};
export type ReviewCase = {
  id: string;
  gameId: string;
  issueKey: string;
  status: 'reports' | 'official_queue' | 'cleared' | 'removed';
  reports: ReviewSubmission[];
  votes: ReviewSubmission[];
  appeal: string;
  expedited: boolean;
  rewardedUserIds: string[];
  rewardedTotal: number;
  officialReason: string;
  createdAt: number;
};
export type LegacyCashOut = {
  id: string;
  userId: string;
  crystalIds: string[];
  amount: number;
  cnyCents: number;
  status: 'pending' | 'succeeded' | 'failed';
  month: string;
  createdAt: number;
  requestId: string;
};
export type RiskFlag = {
  id: string;
  at: number;
  kind: 'linked_accounts' | 'concentrated_inflow' | 'circular_transfer';
  userIds: string[];
  reference: string;
  note: string;
  resolution: 'pending' | 'cleared' | 'confirmed';
  resolutionReason?: string;
  resolvedAt?: number;
  resolvedBy?: string;
  reviewHistory?: Array<{ at: number; by: string; cleared: boolean; reason: string }>;
};
export type DemoState = {
  schema: 1;
  packSchema: 1;
  economySchema: 2;
  chargeSchema: 2;
  legacyChargeFacts: Record<string, { elapsedMs: number; lastHeartbeatAt: number | null }>;
  incomeSchema: 1;
  creatorIncome: CreatorIncomeEntry[];
  creatorSettlements: CreatorSettlement[];
  settlementPolicy: CreatorSettlementPolicy | null;
  drawCounts: Record<string, Record<string, number>>;
  characterUnlocks: Record<string, CharacterUnlock[]>;
  themeUnlocks: Record<string, ThemeUnlock[]>;
  redemptions: CardRedemption[];
  dailyFreeClaims: DailyFreeClaim[];
  legacyHistory: { cashOuts: LegacyCashOut[]; crystalFacts: Record<string, unknown>[] };
  revision: number;
  currentUserId: string | null;
  users: DemoUser[];
  crystals: Crystal[];
  charges: Record<string, ChargeState>;
  products: DemoProduct[];
  orders: DemoOrder[];
  posts: DemoPost[];
  tips: DemoTip[];
  cases: ReviewCase[];
  riskFlags: RiskFlag[];
  packPurchases: PackPurchase[];
  ownedPacks: OwnedCardPack[];
  cardInstances: OwnedCardInstance[];
  packOpenings: PackOpening[];
  clockOffsetMs: number;
  updatedAt: number;
  lastMessage: string;
};
export type ProductInput = Pick<DemoProduct, 'title' | 'description' | 'kind' | 'currency' | 'price' | 'license' | 'supply'> & {
  artifactRef?: string;
  localOnly?: boolean;
  attachments?: DemoAttachment[];
};
export type DemoAction = {
  type: 'purchaseCosmetic';
  cosmeticId: string;
  currency: Currency;
  requestId: string;
} | {
  type: 'login';
  userId: string;
} | {
  type: 'register';
  name: string;
} | {
  type: 'logout';
} | {
  type: 'claim';
} | {
  type: 'fastForward';
  hours: number;
} | {
  type: 'advanceCalendar';
  days: number;
} | {
  type: 'verifyIdentity';
} | {
  type: 'configureCreatorSettlement';
  cycleDays: number;
  minimumCents: number;
} | {
  type: 'requestCreatorSettlement';
  requestId: string;
} | {
  type: 'cancelCreatorSettlement';
  settlementId: string;
} | {
  type: 'completeCreatorSettlement';
  settlementId: string;
  reason: string;
} | {
  type: 'payDeposit';
} | {
  type: 'refundDeposit';
} | {
  type: 'createProduct';
  product: ProductInput;
} | {
  type: 'editProduct';
  productId: string;
  changes: Partial<ProductInput>;
  critical?: boolean;
} | {
  type: 'publishProduct';
  productId: string;
} | {
  type: 'approveProduct';
  productId: string;
  approved: boolean;
} | {
  type: 'unlistProduct';
  productId: string;
} | {
  type: 'buy';
  productId: string;
  currency?: Currency;
  requestId: string;
} | {
  type: 'resell';
  orderId: string;
  currency: Currency;
  price: number;
} | {
  type: 'setDispute';
  orderId: string;
  disputed: boolean;
} | {
  type: 'buyPack';
  packId: string;
  currency: Currency;
  quantity?: number;
  requestId: string;
} | {
  type: 'freePack';
  requestId: string;
} | {
  type: 'redeem';
  instanceId: string;
} | {
  type: 'unlockConfiguredCharacter';
  characterId: CharacterId;
} | {
  type: 'openPack';
  packInstanceId: string;
  requestId: string;
} | {
  type: 'listCardInstance';
  instanceId: string;
  currency: Currency;
  price: number;
} | {
  type: 'createPost';
  title: string;
  body: string;
  gameId?: string;
  attachments?: DemoAttachment[];
} | {
  type: 'reviewPost';
  postId: string;
  approved: boolean;
  reason: string;
} | {
  type: 'withdrawPost';
  postId: string;
} | {
  type: 'resubmitPost';
  postId: string;
  title?: string;
  body?: string;
  attachments?: DemoAttachment[];
} | {
  type: 'like' | 'bookmark';
  postId: string;
} | {
  type: 'tip';
  targetKind: 'post' | 'game';
  targetId: string;
  amount: 1 | 2;
} | {
  type: 'reportGame';
  gameId: string;
  reason: string;
  issueKey?: string;
} | {
  type: 'appealCase';
  caseId: string;
  text: string;
} | {
  type: 'voteCase';
  caseId: string;
  position: 'support' | 'oppose';
  reason: string;
} | {
  type: 'resolveCase';
  caseId: string;
  outcome: 'cleared' | 'removed';
  reason: string;
  rewardUserIds: string[];
  maliciousUserIds?: string[];
} | {
  type: 'resolveRisk';
  riskId: string;
  cleared: boolean;
  reason: string;
} | {
  type: 'appealPenalty';
  text: string;
};
export type ActionResult = {
  ok: boolean;
  message: string;
  id?: string;
};
export type DemoWallet = {
  available: number;
  earned: number;
  creator: number;
  cnyCents: number;
};
export interface DemoServiceLike {
  getSnapshot(): DemoState;
  subscribe(listener: () => void): () => void;
  execute(action: DemoAction): Promise<ActionResult>;
}

export type CharacterId = 'shan' | 'lu-mi' | 'bai-shuangming' | 'jingyuniang' | 'longmama' | 'claude' | 'gemini' | 'grok';
export type CharacterUnlock = { characterId: CharacterId; at: number; source: 'legacy' | 'redemption' | 'provider' };
export type ThemeUnlock = { id: string; characterId: CharacterId; kind: 'office' | 'bedroom'; at: number };
export type CardRedemption = { id: string; userId: string; characterId: CharacterId; instanceId: string; at: number };
export type DailyFreeClaim = { userId: string; dayKey: number; purchaseId: string; requestId: string };
/** Local demo receipts in integer CNY cents; never crystal conversion or a bank payment. */
export type CreatorIncomeEntry = { id: string; userId: string; orderId: string; productId: string; grossCents: number; feeCents: number; netCents: number; at: number; source: 'order' | 'legacy-order' };
export type CreatorSettlementPolicy = { cycleDays: number; minimumCents: number; configuredAt: number; configuredBy: string };
export type CreatorSettlement = { id: string; userId: string; requestId: string; amountCents: number; allocations: Array<{ incomeId: string; amountCents: number }>; policy: CreatorSettlementPolicy; at: number; status: 'pending' | 'canceled' | 'simulated_complete'; resolvedAt?: number; resolvedBy?: string; reason?: string; source: 'local-demo' };

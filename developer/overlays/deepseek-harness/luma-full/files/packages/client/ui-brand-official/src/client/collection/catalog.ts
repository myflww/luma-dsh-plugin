import type { CollectionCardDefinition } from './domain.ts'
import type { CollectionGrade, CollectionArtStyle } from './catalogView.ts'

export interface LumaCollectionCard extends CollectionCardDefinition {
  readonly characterId: string
  readonly subtitle: string
  readonly series: string
  readonly orientation: 'landscape' | 'portrait'
  readonly unlockAt: number
  readonly description: string
  readonly cardNumber: string
  readonly variantLabel: string
  readonly rarity: 'base' | 'foil' | 'illustration' | 'special'
  readonly finish: 'matte' | 'silver' | 'gold' | 'etched'
  readonly editionLabel: string
  readonly grade: CollectionGrade
  readonly artStyle: CollectionArtStyle
  readonly skinLabel: string
  readonly composition: 'portrait' | 'moonlit' | 'ruic-relief' | 'panorama' | 'chibi'
  readonly designStage: 'reference-layout' | 'authored-card'
  readonly layers?: { readonly background: string; readonly subject: string; readonly effects?: string; readonly typography?: string }
}

type Seed = readonly [id: string, characterId: string, title: string, subtitle: string, file: string,
  orientation: 'landscape' | 'portrait', unlock: number, rarity: LumaCollectionCard['rarity'],
  finish: LumaCollectionCard['finish'], variant: string, description: string]
const seeds: readonly Seed[] = [
  ['lumi-prologue', 'lu-mi', '陆弥', '月下初见', 'lumi-title-scene.png', 'landscape', 0, 'special', 'etched', '序章横版纪念', '第一张纪念，留给愿意开始的人。原始回廊画面完整保留；这是本地卡册的创立纪念，并非全球限量发行。'],
  ['lumi-base', 'lu-mi', '陆弥', '蓝夜蔷薇', 'lumi-original.png', 'portrait', 1, 'base', 'matte', '标准普卡', '黑色长发、蓝夜礼裙与一朵蔷薇。你的第一份确认成果，为这张角色普卡留下获得记录。'],
  ['lumi-silver', 'lu-mi', '陆弥', '流光来信', 'lumi-standing.png', 'portrait', 3, 'illustration', 'silver', '月银异画', '原型目录中的另一幅立绘，以完整站姿、流光衣袖与月银精装重新呈现。保留原文件背景与来源标识。'],
  ['orlan-portrait', 'orlan', '奥兰', '守望之约', 'orlan.png', 'portrait', 5, 'illustration', 'gold', '全幅人物卡', '银白长发与守护纹章。曾经的冒险角色，如今成为认真完成工作的收藏纪念。'],
  ['liya-portrait', 'liya', '莉雅', '晨星祈歌', 'liya.png', 'portrait', 7, 'illustration', 'silver', '全幅人物卡', '留一点温柔，给每一份被完成的工作。'],
  ['moonlit-portico', 'scene-portico', '月辉门廊', '今夜的起点', 'portico.png', 'landscape', 10, 'special', 'gold', '风景横版特卡', '将一处月光收藏在桌边。横向构图保留建筑、远景与光的方向。'],
  ['luna-portrait', 'luna', '露娜', '月影同行', 'luna.png', 'portrait', 14, 'illustration', 'silver', '全幅人物卡', '不需要与谁竞速。自己的作品，也值得慢慢积累。'],
  ['ayan-portrait', 'ayan', '阿焰', '余烬未熄', 'ayan.png', 'portrait', 18, 'illustration', 'gold', '全幅人物卡', '把一次有始有终的努力，留成一簇不会熄灭的火。'],
  ['lumi-gold', 'lu-mi', '陆弥', '狐火夜语', 'lumi-fox-mask.png', 'portrait', 22, 'illustration', 'gold', '狐面异画', '狐妖面具造型：面具、蓝焰与轻纱构成独立皮肤卡面。沿用原卡的编号与解锁门槛。当前为精装异画，金色工艺不直接代表典藏品质。'],
  ['deep-rift', 'scene-rift', '裂隙深层', '幽蓝回声', 'deep-rift.png', 'landscape', 26, 'special', 'etched', '风景横版特卡', '这段回廊不再通向战斗，而是通向自己的工作记忆。'],
  ['rift-maw', 'rift-maw', '裂隙噬兽', '回廊档案 I', 'rift-maw.png', 'portrait', 30, 'base', 'matte', '生灵档案卡', '旧世界中的生灵，被保留在独立档案里。没有攻击力、生命值或强度排名。'],
  ['night-warden', 'night-warden', '夜幕守卫', '回廊档案 II', 'night-warden.png', 'portrait', 35, 'illustration', 'silver', '生灵档案卡', '安静的铠甲与夜色，纪念持续推进的耐心。'],
  ['memory-dust', 'memory-dust', '失名影尘', '回廊档案 III', 'memory-dust.png', 'portrait', 40, 'base', 'matte', '生灵档案卡', '那些微小的完成，也会积成有形的记忆。'],
  ['rift-guard', 'rift-guard', '裂隙守卫', '回廊档案 IV', 'rift-guard.png', 'portrait', 45, 'illustration', 'gold', '生灵档案卡', '把边界守好，把事情做好。'],
  ['rift-archon', 'rift-archon', '裂隙统御者', '回廊档案 V', 'rift-archon.png', 'portrait', 50, 'illustration', 'etched', '生灵档案卡', '保留旧作的形象，让它拥有新的用途。'],
  ['eclipse-sanctum', 'scene-sanctum', '蚀月圣所', '长路留光', 'sanctum.png', 'landscape', 60, 'special', 'etched', '风景横版特卡', '不是每日打卡的倒计时，而是累积作品后慢慢打开的风景。'],
  ['gatekeeper', 'gatekeeper', '蚀月守门者', '蔷薇夜章终页', 'gatekeeper.png', 'portrait', 75, 'special', 'gold', '系列纪念卡', '这一册的终页，仍为下一段创造留着位置。'],
  ['lumi-ruic-atelier', 'lu-mi', '陆弥', '蓝夜蔷薇', 'lumi-atelier-front.png', 'portrait', 12, 'special', 'gold', '蔷薇浮雕典藏', '收藏最初那张独立样卡：拱廊、透明立绘、花瓣与原始题字分层呈现。RN-018 是本卡册设计编号；原画中的 I · 001 是样卡标记，不代表全球限量。'],
  ['lumi-chibi', 'lu-mi', '陆弥', '小小夜蔷薇', 'lumi-chibi.png', 'portrait', 2, 'base', 'matte', 'Q 版手账', '原型 Q 版单人主视图，完整保留双角、长发与蓝夜礼裙。小小的陪伴，也值得收藏。'],
  ['duanmu-original', 'shan', '端木嫣', '今日来信', 'duanmu-original.png', 'portrait', 4, 'base', 'matte', '原型人物卡', '来自端木嫣原型目录的完整立绘。每一次认真交付，都留下属于自己的记录。'],
  ['duanmu-chibi', 'shan', '端木嫣', '桌边陪伴', 'duanmu-chibi.png', 'portrait', 6, 'base', 'matte', 'Q 版手账', '以原型单人主视图制作的 Q 版收藏。画风与品质独立分类，不影响工作能力。'],
  ['duanmu-gothic', 'shan', '端木嫣', '夜幕礼笺', 'duanmu-gothic.png', 'portrait', 16, 'illustration', 'silver', '哥特皮肤卡', '哥特装的独立立绘。当前是皮肤素材版；专属动作与场景叙事完成后，再评审是否晋级。'],
  ['bai-chibi', 'bai-shuangming', '白霜命', '一页晴光', 'bai-chibi.png', 'portrait', 8, 'base', 'matte', 'Q 版手账', '原型 Q 版单人形象，收进柔和纸面与细小星饰中。'],
  ['bai-butterfly-chibi', 'bai-shuangming', '白霜命', '小小蝶影', 'bai-butterfly-chibi.png', 'portrait', 11, 'illustration', 'silver', 'Q 版精装', '蝴蝶装的 Q 版版本。与同皮肤立绘共用角色与皮肤分类，保留独立的卡面编号。'],
  ['bai-butterfly', 'bai-shuangming', '白霜命', '蝶翼留光', 'bai-butterfly.png', 'portrait', 20, 'illustration', 'silver', '蝴蝶精装', '完整保留蝴蝶装立绘与原有配色，以月银边和纤细装饰承接人物。'],
  ['bai-bridal', 'bai-shuangming', '白霜命', '白纱纪事', 'bai-bridal.png', 'portrait', 24, 'illustration', 'silver', '白纱皮肤卡', '婚纱装的坐姿立绘，独立成卡。服装本身不决定稀有程度；当前为皮肤素材版，等待专属卡面创作。'],
]

/** Printed identifiers are permanent; changing gallery order must never renumber a design. */
const catalogNumbers: Readonly<Record<string, string>> = Object.freeze({
  'lumi-prologue': 'RN-001', 'lumi-base': 'RN-002', 'lumi-silver': 'RN-003',
  'orlan-portrait': 'RN-004', 'liya-portrait': 'RN-005', 'moonlit-portico': 'RN-006',
  'luna-portrait': 'RN-007', 'ayan-portrait': 'RN-008', 'lumi-gold': 'RN-009',
  'deep-rift': 'RN-010', 'rift-maw': 'RN-011', 'night-warden': 'RN-012',
  'memory-dust': 'RN-013', 'rift-guard': 'RN-014', 'rift-archon': 'RN-015',
  'eclipse-sanctum': 'RN-016', 'gatekeeper': 'RN-017',
  'lumi-ruic-atelier': 'RN-018', 'lumi-chibi': 'RN-019',
  'duanmu-original': 'RN-020', 'duanmu-chibi': 'RN-021', 'duanmu-gothic': 'RN-022',
  'bai-chibi': 'RN-023', 'bai-butterfly-chibi': 'RN-024', 'bai-butterfly': 'RN-025', 'bai-bridal': 'RN-026',
})

const skins: Readonly<Record<string, string>> = {
  'lumi-prologue': '原型', 'lumi-base': '原型', 'lumi-silver': '原型', 'lumi-gold': '狐妖面具造型',
  'lumi-ruic-atelier': '原型', 'lumi-chibi': '原型', 'duanmu-original': '原型', 'duanmu-chibi': '原型',
  'duanmu-gothic': '哥特装', 'bai-chibi': '原型', 'bai-butterfly-chibi': '蝴蝶装', 'bai-butterfly': '蝴蝶装', 'bai-bridal': '婚纱装',
}
const chibiIds = new Set(['lumi-chibi', 'duanmu-chibi', 'bai-chibi', 'bai-butterfly-chibi'])
/** Editorial assessment, deliberately independent of finish, unlock cost, format and costume. */
const designGrades: Readonly<Record<string, CollectionGrade>> = Object.freeze({
  'lumi-prologue': 'gallery', 'lumi-base': 'standard', 'lumi-silver': 'fine', 'lumi-gold': 'fine',
  'orlan-portrait': 'fine', 'liya-portrait': 'fine', 'luna-portrait': 'fine', 'ayan-portrait': 'fine',
  'moonlit-portico': 'gallery', 'deep-rift': 'gallery', 'eclipse-sanctum': 'gallery',
  'rift-maw': 'standard', 'night-warden': 'fine', 'memory-dust': 'standard', 'rift-guard': 'fine', 'rift-archon': 'fine', 'gatekeeper': 'fine',
  'lumi-ruic-atelier': 'prestige', 'lumi-chibi': 'standard', 'duanmu-original': 'standard', 'duanmu-chibi': 'standard',
  'duanmu-gothic': 'fine', 'bai-chibi': 'standard', 'bai-butterfly-chibi': 'fine', 'bai-butterfly': 'fine', 'bai-bridal': 'fine',
})

/** Catalog numbers identify designs, not copies or a worldwide print run. */
export const LUMA_COLLECTION_CARDS: readonly LumaCollectionCard[] = Object.freeze(seeds.map((seed) => {
  const [id, characterId, title, subtitle, file, orientation, unlockAt, rarity, finish, variantLabel, description] = seed
  const cardNumber = catalogNumbers[id]
  if (cardNumber === undefined) throw new Error(`Card design requires a permanent catalog number: ${id}`)
  const grade = designGrades[id]
  if (grade === undefined) throw new Error(`Card requires an explicit visual quality assessment: ${id}`)
  const artStyle: CollectionArtStyle = chibiIds.has(id) ? 'chibi' : characterId.startsWith('scene-') ? 'scene' : 'illustration'
  const composition = orientation === 'landscape' ? 'panorama' : artStyle === 'chibi' ? 'chibi' : id === 'lumi-ruic-atelier' ? 'ruic-relief' : grade === 'fine' ? 'moonlit' : 'portrait'
  return Object.freeze({ id, characterId, title, subtitle, artUrl: `/luma-collection/${file}`,
    orientation, unlockAt, requiredAcceptedReports: unlockAt, rarity, finish, variantLabel, description,
    series: '蔷薇夜章', cardNumber,
    grade, artStyle, composition, skinLabel: skins[id] ?? (artStyle === 'scene' ? '回廊风景' : '原型'),
    designStage: id === 'lumi-ruic-atelier' || orientation === 'landscape' ? 'authored-card' : 'reference-layout',
    ...(id === 'lumi-ruic-atelier' ? { layers: Object.freeze({ background: '/luma-collection/lumi-atelier-background.png', subject: '/luma-collection/lumi-atelier-subject.png', effects: '/luma-collection/lumi-atelier-effects.png', typography: '/luma-collection/lumi-atelier-typography.png' }) } : {}),
    editionLabel: id === 'lumi-prologue' ? '创立纪念 · 本地收藏' : '第一辑 · 累计成果解锁',
  })
}))

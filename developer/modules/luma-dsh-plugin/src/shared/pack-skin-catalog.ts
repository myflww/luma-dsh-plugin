/** Presentation skins only. Selecting one never changes a pack pool or grants ownership. */
export interface PackSkin {
  readonly id: string
  readonly name: string
  readonly packId: string
  readonly artworkUrl: string
  /** Derived transparent display artwork; the pinned original stays above. */
  readonly openingArtworkUrl?: string
  readonly kind: 'pouch' | 'artwork' | 'card-back'
  readonly width: number
  readonly height: number
  readonly theme: 'dawn' | 'rose' | 'moon' | 'journey' | 'egg'
  readonly sha256: string
  readonly source: string
}

const snapshot = 'installed-s37'
const pouch = (id: string, name: string, packId: string, theme: PackSkin['theme'], sha256: string): PackSkin => Object.freeze({
  id, name, packId, theme, kind: 'pouch', artworkUrl: `/luma-economy/packs/${id}.png`,
  ...(/^(?:dawn|blue-rose|moon)-v1$/u.test(id) ? { openingArtworkUrl: `/luma-economy/packs/${id.replace('-v1', '')}-cutout-r1.png` } : {}),
  width: 1024, height: 1536, sha256, source: `${snapshot}/overlays/deepseek-harness/luma-full/files/apps/web/public/luma-economy/packs/${id}.png`,
})
const artwork = (id: string, name: string, packId: string, theme: PackSkin['theme'], sha256: string): PackSkin => Object.freeze({
  id, name, packId, theme, kind: 'artwork', artworkUrl: `/luma-economy/packs/${id}.png`,
  width: 1024, height: 1536, sha256, source: `${snapshot}/overlays/deepseek-harness/luma-full/files/apps/web/public/luma-economy/packs/${id}.png`,
})
const back = (id: string, name: string, packId: string, theme: PackSkin['theme'], sha256: string): PackSkin => Object.freeze({
  id, name, packId, theme, kind: 'card-back', artworkUrl: `/luma-card-library/assets/${sha256}.png`,
  width: 1024, height: 1536, sha256, source: `${snapshot}/art-lab/lumi-collection-trio/pack-backs-imagegen-20261015/registry.json#${packId}`,
})

/** All 13 retained sources: five foil pouches, three flat V2 design plates and
 * five card-back families. Flat plates and card backs are material references,
 * never substitutes for the physical pouch in an opening animation.
 * These are source artwork variations, not different prices, odds, or entitlements.
 * Gemini/Grok wrappers remain visual alternatives for their existing shared journey pool.
 * The independent back is retained art, not a newly published sale or draw channel.
 */
export const PACK_SKINS: readonly PackSkin[] = Object.freeze([
  pouch('dawn-v1', '晨光序章 · 包装 01', 'dawn-prelude', 'dawn', '96d07703dfb8ff0d94364632cc273f7887cf0c1a1587e8414be4b4ce21e8985b'),
  artwork('dawn-v2', '晨光序章 · 金属图案', 'dawn-prelude', 'dawn', 'b3fdce756dc30c44aae58d28ef49d358f43ba0ce189a234ff2761a7c435b591d'),
  pouch('blue-rose-v1', '蓝蔷薇回响 · 包装 01', 'blue-rose-echo', 'rose', '7151b52c4df134196efb6a46624e75fea6898062d05942e754de0a45ae1ef592'),
  artwork('blue-rose-v2', '蓝蔷薇回响 · 金属图案', 'blue-rose-echo', 'rose', '12538172a47d000d1be4c60d8ceed7a6e55ca1356193fcb42b2b6a939ae024c6'),
  pouch('moon-v1', '月相典藏 · 包装 01', 'moon-collection', 'moon', '1044ccb90991384951041769694dd92179ba2c782b52cb21abe149ec8351c0b1'),
  artwork('moon-v2', '月相典藏 · 金属图案', 'moon-collection', 'moon', '84e9d391900c1273450dbc3559dc7e5dc02ea5759af4fea30d96d07a8631f492'),
  pouch('gemini-v1', '吉米 · 原包装', 'first-meeting-journey', 'journey', 'ea245dc2027aa13318f077e1b4122a755b486fe0ed28ea4bd122e25df42360b6'),
  pouch('grok-v1', '绯洛 · 原包装', 'first-meeting-journey', 'journey', '33dd3543424a18542f3243a1788a23f87f1d044a7204ad78933d289ccb91d5f6'),
  back('journey-back', '初见与远行 · 卡背', 'first-meeting-journey', 'journey', 'c8b53612044b47c3b6aa2bae87210c262517458849fa25bc861ebbefe895667f'),
  back('dawn-back', '晨光序章 · 卡背', 'dawn-prelude', 'dawn', '51059ccebe395e219d188be63ac884fe39474c9bb11635417eaf2751e184d676'),
  back('blue-rose-back', '蓝蔷薇回响 · 卡背', 'blue-rose-echo', 'rose', '3662a2ea53d40a137d38b138be1019e08662501ef05c967d3d8b83241f72e3c8'),
  back('moon-back', '月相典藏 · 卡背', 'moon-collection', 'moon', 'aea70e8043bed0d4b2df250c54f9723c003d7369ea0a3f55c9e61a53b30baddf'),
  back('independent-back', '独立典藏 · 卡背', 'egg-channel', 'egg', '26eee5498842518222210b1616ae7aba3f6f45b8d08ef5c23ed81a953e692bb2'),
])

/** Only actual sealed bags may be chosen for the opening scene. */
export const OPENABLE_PACK_SKINS: readonly PackSkin[] = Object.freeze(PACK_SKINS.filter(skin => skin.kind === 'pouch'))
/** Original plates and card backs remain visible as source material. */
export const PACK_REFERENCE_SKINS: readonly PackSkin[] = Object.freeze(PACK_SKINS.filter(skin => skin.kind !== 'pouch'))

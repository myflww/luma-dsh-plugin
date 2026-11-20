import { describe, expect, it } from 'vitest'
import { OPENABLE_PACK_SKINS, PACK_REFERENCE_SKINS, PACK_SKINS } from '../src/shared/pack-skin-catalog.ts'
import { PACK_CATALOG } from '../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/economy/domain/cardPacks.ts'

describe('retained pack skin coverage', () => {
  it('retains five foil bags, three flat design plates and the five back families', () => {
    expect(OPENABLE_PACK_SKINS.map(skin => skin.id).sort()).toEqual([
      'blue-rose-v1', 'dawn-v1', 'gemini-v1', 'grok-v1', 'moon-v1',
    ])
    expect(PACK_REFERENCE_SKINS.filter(skin => skin.kind === 'artwork').map(skin => skin.id).sort()).toEqual(['blue-rose-v2', 'dawn-v2', 'moon-v2'])
    expect(PACK_REFERENCE_SKINS.filter(skin => skin.kind === 'card-back').map(skin => skin.theme).sort()).toEqual(['dawn', 'egg', 'journey', 'moon', 'rose'])
    expect(new Set([...OPENABLE_PACK_SKINS, ...PACK_REFERENCE_SKINS])).toEqual(new Set(PACK_SKINS))
    expect(new Set(PACK_SKINS.map(skin => skin.id)).size).toBe(PACK_SKINS.length)
    expect(new Set(PACK_SKINS.map(skin => skin.artworkUrl)).size).toBe(PACK_SKINS.length)
    for (const skin of PACK_SKINS) {
      expect(skin.sha256).toMatch(/^[a-f0-9]{64}$/u)
      expect(skin.artworkUrl).toMatch(/^\/luma-(?:economy\/packs\/[a-z0-9-]+|card-library\/assets\/[a-f0-9]{64})\.png$/u)
      expect(skin.width).toBeGreaterThan(0); expect(skin.height).toBeGreaterThan(0)
      expect(skin.source).toContain('installed-s37/')
    }
  })

  it('retains the independent back as art without publishing another sale or draw pool', () => {
    const independent = PACK_SKINS.find(skin => skin.id === 'independent-back')!
    expect(independent.kind).toBe('card-back')
    expect(PACK_CATALOG.some(pack => pack.id === independent.packId)).toBe(false)
    for (const wrapper of PACK_SKINS.filter(skin => skin.kind === 'pouch')) {
      expect(PACK_CATALOG.some(pack => pack.id === wrapper.packId)).toBe(true)
    }
  })
})

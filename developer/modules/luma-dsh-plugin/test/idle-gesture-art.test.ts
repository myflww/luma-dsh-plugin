import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { getActorGestureAtlas } from '../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/office2d/actorGestureAtlas.ts'
import { getActorPoseAtlas } from '../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/office2d/actorPoseAtlas.ts'

it('ships two complete grounded gestures alongside every selectable standing drawing', () => {
  const actionIds = new Set<string>()
  const sources = new Set<string>()
  for (const id of ['shan','bai-shuangming','lu-mi','jingyuniang','longmama','claude','gemini','grok']) {
    const skins = id === 'gemini' || id === 'grok' ? [undefined] : [undefined, 'skin.' + id + '.v1']
    for (const skin of skins) {
      const pose = getActorPoseAtlas(id, skin)!
      const art = getActorGestureAtlas(id, skin)!
      expect(art.foot).toEqual(pose.foot)
      expect(art.figureHeight).toBe(pose.figureHeight)
      expect(art.cell).toEqual(pose.cell)
      const bytes = readFileSync(new URL('../art/release-assets' + art.src, import.meta.url))
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(art.sha256)
      expect(bytes.readUInt32BE(16)).toBe(art.columns * art.cell[0])
      expect(bytes.readUInt32BE(20)).toBe(art.count / art.columns * art.cell[1])
      expect(art.actions).toHaveLength(2)
      sources.add(art.src)
      for (const action of art.actions) {
        actionIds.add(action.id)
        expect(action.frames).toHaveLength(action.durationsMs.length)
        expect(action.durationsMs.every(ms => Number.isFinite(ms) && ms > 0)).toBe(true)
        expect(action.frames.every(n => Number.isInteger(n) && n >= 0 && n < art.count)).toBe(true)
      }
    }
    expect(getActorGestureAtlas(id, 'unavailable')).toBeUndefined()
  }
  expect(sources.size).toBe(14)
  expect(actionIds.size).toBe(28)
})

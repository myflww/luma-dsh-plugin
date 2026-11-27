import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { actorLookFrame, getActorLookAtlas } from '../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/office2d/actorLookAtlas.ts'
import { getActorPoseAtlas } from '../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/office2d/actorPoseAtlas.ts'

function verifyImage(src: string, digest: string, width: number, height: number) {
  const bytes = readFileSync(new URL('../art/release-assets' + src, import.meta.url))
  expect(createHash('sha256').update(bytes).digest('hex')).toBe(digest)
  expect(bytes.readUInt32BE(16)).toBe(width)
  expect(bytes.readUInt32BE(20)).toBe(height)
}

it('indexes rightward and downward directions consistently on both sheets', () => {
  const steps = [-1, -.5, 0, .5, 1]
  expect(steps.flatMap(y => steps.map(x => actorLookFrame(x, y)))).toEqual(Array.from({ length: 25 }, (_, i) => i))
  expect(actorLookFrame(-6, 9)).toBe(20)
  expect(actorLookFrame(NaN, Infinity)).toBe(12)
})

it('ships a ground-registered head and independently steerable iris sheet for every outfit', () => {
  const sources = new Set<string>()
  for (const role of ['shan', 'bai-shuangming', 'lu-mi', 'jingyuniang', 'longmama', 'claude', 'gemini', 'grok']) {
    const skins = role === 'gemini' || role === 'grok' ? [undefined] : [undefined, 'skin.' + role + '.v1']
    for (const skin of skins) {
      const look = getActorLookAtlas(role, skin)!
      const pose = getActorPoseAtlas(role, skin)!
      expect(look.cell).toEqual(pose.cell)
      expect(look.foot).toEqual(pose.foot)
      expect(look.grip).toEqual(pose.grip)
      expect(look.figureHeight).toBe(pose.figureHeight)
      expect(look.neutralIndex).toBe(actorLookFrame(0, 0))
      expect(look.columns).toBe(5)
      expect(look.count).toBe(25)
      const [w, h] = look.cell
      const [x, y] = look.eyesOrigin
      const [pw, ph] = look.eyesCell
      expect(x).toBeLessThan(look.eyeCenter[0])
      expect(y).toBeLessThan(look.eyeCenter[1])
      expect(x + pw).toBeGreaterThan(look.eyeCenter[0])
      expect(y + ph).toBeGreaterThan(look.eyeCenter[1])
      expect(x + pw).toBeLessThan(w)
      expect(y + ph).toBeLessThan(h)
      verifyImage(look.src, look.sha256, 5 * w, 5 * h)
      verifyImage(look.eyesSrc, look.eyesSha256, 25 * pw, 25 * ph)
      sources.add(look.src)
      sources.add(look.eyesSrc)
    }
    expect(getActorLookAtlas(role, 'unavailable')).toBeUndefined()
  }
  expect(sources.size).toBe(28)
})

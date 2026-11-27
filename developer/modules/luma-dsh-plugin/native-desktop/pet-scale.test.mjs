import { test } from 'node:test'
import { execFileSync } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { compileCheck, native } from './tests/compile-check.mjs'

test('both Lu Mi outfits share the desktop scale of installed companions', { skip: process.platform !== 'win32' }, async t => {
  const temp = await mkdtemp(join(tmpdir(), 'luma-pet-scale-'))
  t.after(() => rm(temp, { recursive: true, force: true }))
  const meta = resolve(native, '../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/office2d')
  const [poses, gestures] = await Promise.all(['actorPoseAtlas', 'actorGestureAtlas']
    .map(async name => JSON.parse(await readFile(join(meta, name + '.generated.json'), 'utf8'))))
  const keys = ['jingyuniang-base', 'bai-shuangming-base', 'shan-base', 'lu-mi-base', 'lu-mi-v1']
  const asset = record => ({ ...record, path: resolve(native, '../art/release-assets', record.src.slice(1)) })
  const config = Object.fromEntries(keys.map(key => {
    const file = group => join(native, 'pet-art', group, key + '.png')
    return [key, { roleId: key.slice(0, key.lastIndexOf('-')), skinId: key.endsWith('-v1') ? 'skin.lu-mi.v1' : null,
      strips: {}, poses: { ...asset(poses[key]), gestures: asset(gestures[key]) },
      peek: file(''), bottomPeek: file('bottom'), greet: file('greet'), ledge: file('ledge'),
      sleepyPose: file('drowsy'), lunchPose: file('lunch'), performance: file('performance') }]
  }))
  const spec = join(temp, 'poses.json')
  await writeFile(spec, JSON.stringify(config))
  const result = execFileSync(await compileCheck('PetScaleCheck', temp), [spec], { windowsHide: true, encoding: 'utf8' })
  t.diagnostic(result.trim())
})

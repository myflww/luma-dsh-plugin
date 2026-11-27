import { test } from 'node:test'
import { execFileSync } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { compileCheck, native } from './tests/compile-check.mjs'

test('a resting pet stays where placed, walks rarely, and respects manual activities', { skip: process.platform !== 'win32' }, async t => {
  const temp = await mkdtemp(join(tmpdir(), 'luma-activity-'))
  t.after(() => rm(temp, { recursive: true, force: true }))
  const metadata = resolve(native, '../../../overlays/deepseek-harness/luma-full/files/packages/client/ui-brand-official/src/client/office2d')
  const [poses, gestures, look, gait] = await Promise.all(
    ['actorPoseAtlas', 'actorGestureAtlas', 'actorLookAtlas', 'walkAtlas']
      .map(async name => JSON.parse(await readFile(join(metadata, name + '.generated.json'), 'utf8'))))
  const key = 'lu-mi-base'
  const asset = src => resolve(native, '../art/release-assets', src.slice(1))
  const portrait = folder => join(native, 'pet-art', folder, key + '.png')
  const strips = {}
  for (const [id, strip] of Object.entries(gait)) {
    if (!id.startsWith('employee.lu-mi.walk.')) continue
    strips[id.split('.')[3]] = { ...strip, path: asset(strip.src), gaitPath: asset(strip.src),
      frameCount: strip.count, frameWidth: strip.cell[0], frameHeight: strip.cell[1],
      durations: strip.frameDurationsMs.map(Math.round), frameDurationsMs: strip.frameDurationsMs.map(Math.round) }
  }
  const spec = join(temp, 'pet.json')
  await writeFile(spec, JSON.stringify({
    roleId: 'lu-mi', strips, peek: portrait(''), ledge: portrait('ledge'), greet: portrait('greet'),
    sleepyPose: portrait('drowsy'), bottomPeek: portrait('bottom'), lunchPose: portrait('lunch'),
    poses: { ...poses[key], path: asset(poses[key].src),
      gestures: { ...gestures[key], path: asset(gestures[key].src) },
      look: { ...look[key], path: asset(look[key].src), eyesPath: asset(look[key].eyesSrc) } },
  }))
  const args = process.env.LUMA_PET_ACTIVITY_REALTIME === '1' ? [spec, '--wall-clock'] : [spec]
  const output = execFileSync(await compileCheck('PetActivityCheck', temp), args, { windowsHide: true, encoding: 'utf8' })
  t.diagnostic(output.trim())
})

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdir, mkdtemp, rename, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { resolveLumaProfileRoot } from './profile-data.mjs'

test('fresh profiles are isolated; only the returning default desktop profile keeps its 0.5.1 progress and workspace paths', async t => {
  const home = await mkdtemp(join(tmpdir(), 'luma-profiles-'))
  t.after(() => rm(home, {recursive:true,force:true}))
  const desktop = { home, dir: join(home, 'profiles', 'desktop'), name: 'desktop' }
  const second = { home, dir: join(home, 'profiles', 'second'), name: 'second' }
  const legacy = join(home, 'luma-plugin')
  await mkdir(legacy)
  const db = new DatabaseSync(join(legacy, 'desktop-settings.sqlite3'))
  db.exec("CREATE TABLE sections (value TEXT); INSERT INTO sections VALUES ('original collection')")
  db.close()
  assert.equal(await resolveLumaProfileRoot(second), join(second.dir, 'luma-plugin'))
  assert.deepEqual(await Promise.all([resolveLumaProfileRoot(desktop), resolveLumaProfileRoot(desktop)]), [legacy, legacy])
  const restored = new DatabaseSync(join(legacy,'desktop-settings.sqlite3'), {readOnly:true})
  assert.equal(restored.prepare('SELECT value FROM sections').get().value,'original collection')
  restored.close()
  await rename(desktop.dir, desktop.dir + '-moved-aside')
  assert.equal(await resolveLumaProfileRoot(desktop), join(desktop.dir, 'luma-plugin'))
})

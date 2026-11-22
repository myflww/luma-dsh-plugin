import { randomUUID } from 'node:crypto'
import { lstat, mkdir } from 'node:fs/promises'
import { isAbsolute, join, relative } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

async function existsFile(path) {
  try { return (await lstat(path)).isFile() }
  catch (error) { if (error.code === 'ENOENT') return false; throw error }
}

async function ensureDirectory(path) {
  await mkdir(path, { recursive: true, mode: 0o700 })
  const entry = await lstat(path)
  if (!entry.isDirectory() || entry.isSymbolicLink()) throw Error('Luma 档案目录无法安全打开。')
}

// Commit the owner in SQLite so simultaneous plugin activations choose one
// installation. The legacy directory retains its existing DSH workspace paths.
function claim(database, id) {
  const db = new DatabaseSync(database)
  try {
    db.exec('PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS luma_profile_owner (slot INTEGER PRIMARY KEY CHECK(slot=1), id TEXT NOT NULL)')
    db.prepare('INSERT INTO luma_profile_owner(slot,id) VALUES(1,?) ON CONFLICT(slot) DO NOTHING').run(id)
    return db.prepare('SELECT id FROM luma_profile_owner WHERE slot=1').get().id
  } finally { db.close() }
}

export async function resolveLumaProfileRoot({home, dir, name = 'desktop'}) {
  if (!isAbsolute(home) || (!dir && !/^[\w.-]+$/.test(name)) || (!dir && (name === '.' || name === '..'))) throw Error('DSH 未提供有效的档案目录。')
  const profile = dir ?? join(home, 'profiles', name)
  if (!isAbsolute(profile)) throw Error('DSH 未提供有效的档案目录。')
  const current = join(profile, 'luma-plugin')
  await ensureDirectory(current)
  if (name !== 'desktop' || relative(join(home, 'profiles', 'desktop'), profile) !== '') return current

  const original = join(home, 'luma-plugin')
  const legacyDatabase = join(original, 'desktop-settings.sqlite3')
  if (!await existsFile(legacyDatabase) || await existsFile(join(current, 'desktop-settings.sqlite3'))) return current
  await ensureDirectory(original)
  const id = claim(join(current, 'profile-owner.sqlite3'), randomUUID())
  return claim(legacyDatabase, id) === id ? original : current
}

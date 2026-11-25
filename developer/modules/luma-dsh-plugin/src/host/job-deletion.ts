import { lstatSync, rmdirSync, unlinkSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import type { DatabaseSync } from 'node:sqlite'

export function deliverableFolder(root: string, id: string) {
  return join(root, 'deliverables', createHash('sha256').update(id).digest('hex').slice(0, 28))
}

// A tombstone rejects late retries. Only plugin-generated file names are
// retained until cleanup, so a restart can finish a committed deletion.
export function createJobDeletion(db: DatabaseSync, root: string) {
  db.exec('CREATE TABLE IF NOT EXISTS deleted_jobs(id TEXT PRIMARY KEY, files TEXT NOT NULL)')
  const read = db.prepare('SELECT files FROM deleted_jobs WHERE id=?')
  const missing = (error:unknown) => (error as NodeJS.ErrnoException).code === 'ENOENT'
  function cleanup(id: string) {
    const row = read.get(id)
    if (!row || !row.files) return true
    const folder = deliverableFolder(root,id)
    try {
      for (const dir of [join(root,'deliverables'), folder]) {
        const info = lstatSync(dir,{throwIfNoEntry:false})
        if (!info) break
        if (!info.isDirectory() || info.isSymbolicLink()) return false
      }
      for (const name of JSON.parse(String(row.files)) as string[]) {
        if (!/^[1-9][0-9]*-[a-z-]+\.md$/.test(name)) return false
        try { unlinkSync(join(folder,name)) } catch (error) { if (!missing(error)) throw error }
      }
      try { rmdirSync(folder) } catch (error) {
        if (!missing(error) && (error as NodeJS.ErrnoException).code !== 'ENOTEMPTY') throw error
      }
      db.prepare("UPDATE deleted_jobs SET files='' WHERE id=?").run(id)
      return true
    } catch { return false }
  }
  function retryPending() {
    for (const row of db.prepare("SELECT id FROM deleted_jobs WHERE files!=''").all()) cleanup(String(row.id))
  }
  retryPending()
  return {
    cleanup, retryPending, has: (id:string) => !!read.get(id),
    mark(id:string,files:string[]) {
      db.prepare('INSERT INTO deleted_jobs VALUES(?,?)').run(id,JSON.stringify(files))
    },
  }
}

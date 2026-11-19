import { DatabaseSync } from 'node:sqlite'
import { lstat, realpath } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { parsePortableBinding, portableDesktopDirectory } from '../src/host/love-house.ts'

/** Read only the binding record at the shipped portable launcher's fixed location. */
export async function readPortableBinding(desktop?: string) {
  let db: DatabaseSync | undefined
  try {
    let path = await realpath(desktop ?? portableDesktopDirectory())
    for (const name of ['Luma-DSH','Data','luma-plugin','agent-workbench']) {
      path = join(path, name)
      const directory = await lstat(path)
      if (!directory.isDirectory() || directory.isSymbolicLink()) return
    }
    const file = join(path, 'employees.sqlite3')
    const before = await lstat(file)
    if (!before.isFile() || before.isSymbolicLink()) return
    // An immutable connection creates no journal, WAL or shared-memory file.
    // An open writer may have state newer than the main file. Retry on the next visit.
    for (const suffix of ['-journal','-wal']) {
      try { if ((await lstat(file + suffix)).size > 0) return } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== 'ENOENT') return
      }
    }
    const url = pathToFileURL(file)
    url.search = 'mode=ro&immutable=1'
    db = new DatabaseSync(url.href, {readOnly:true, allowExtension:false})
    db.exec('PRAGMA trusted_schema=OFF; PRAGMA query_only=ON')
    const type = db.prepare("SELECT type FROM sqlite_schema WHERE name='integration'").get()?.type
    if (type !== 'table') return
    const record = db.prepare("SELECT value FROM integration WHERE id='house' AND length(value)<=4096").get()
    if (typeof record?.value !== 'string') return
    const after = await lstat(file)
    if (after.ino !== before.ino || after.mtimeMs !== before.mtimeMs || after.size !== before.size) return
    return parsePortableBinding(JSON.parse(record.value))
  } catch { return undefined }
  finally { db?.close() }
}

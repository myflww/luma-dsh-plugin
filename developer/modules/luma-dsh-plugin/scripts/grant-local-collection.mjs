import { createHash } from 'node:crypto'
import { readFileSync, realpathSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

// Developer maintenance command. A normal desktop launch never invokes this file.
const [database, backup, ...extra] = process.argv.slice(2)
if (!database || !backup || extra.length) throw Error('用法：node scripts/grant-local-collection.mjs <现有 SQLite 档案> <原收藏备份 JSON>')
const original = JSON.parse(readFileSync(backup,'utf8'))
if (original.section?.ns !== 'luma-dsh-local-collection' || typeof original.section.value !== 'string'
  || createHash('sha256').update(original.section.value).digest('hex') !== original.sha256) throw Error('原收藏备份未通过校验。')
const {outputFiles} = await build({entryPoints:[fileURLToPath(new URL('../native-desktop/local-profile-grant.ts', import.meta.url))],
  bundle:true, write:false, format:'esm', platform:'node', target:'node22', logLevel:'silent'})
const {grantLocalProfileCollection} = await import('data:text/javascript;base64,' + Buffer.from(outputFiles[0].contents).toString('base64'))
const db = new DatabaseSync(realpathSync(database))
try {
  console.log(JSON.stringify(grantLocalProfileCollection(db,original.sha256)))
} finally {
  db.close()
}

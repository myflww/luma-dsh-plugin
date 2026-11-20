import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { copyFile, cp, lstat, mkdir, readFile, realpath } from 'node:fs/promises'
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const source = resolve(root, 'native-desktop')
const built = resolve(root, '.runtime/native-desktop')
const destination = process.argv[2] && resolve(process.argv[2])
if (!destination || !isAbsolute(process.argv[2])) throw Error('Supply an absolute release directory')

const manifest = JSON.parse(await readFile(resolve(source, 'manifest.json'), 'utf8'))
const art = JSON.parse(await readFile(resolve(root, 'lib/asset-manifest.json'), 'utf8'))
const publicDir = resolve(root, 'public')
const sha256 = async path => {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path)) hash.update(chunk)
  return hash.digest('hex')
}
for (const entry of ['client.mjs', 'server.mjs']) await lstat(resolve(built, entry))
// Existing release folders can be rebuilt, but never write over another package.
try {
  const existing = JSON.parse(await readFile(resolve(destination, 'package.json'), 'utf8'))
  if (existing.name !== manifest.name || existing.version !== manifest.version) throw Error('Different package at destination')
} catch (error) {
  if (error.code !== 'ENOENT') throw error
}
await mkdir(resolve(destination, 'native-desktop'), { recursive: true })
for (const row of art) {
  const file = resolve(publicDir, row.path)
  const inside = relative(publicDir, file)
  if (!inside || inside.startsWith('..' + sep) || isAbsolute(inside) || await realpath(file) !== file) {
    throw Error('Invalid asset path: ' + row.path)
  }
  if ((await lstat(file)).size !== row.bytes || await sha256(file) !== row.sha256) throw Error('Asset changed: ' + row.path)
  const target = resolve(destination, 'public', inside)
  await mkdir(dirname(target), { recursive: true })
  await copyFile(file, target)
}
for (const entry of ['client.mjs', 'server.mjs']) await copyFile(resolve(built, entry), resolve(destination, 'native-desktop', entry))
await cp(resolve(root, 'presets'), resolve(destination, 'presets'), { recursive: true })
await cp(resolve(root, 'cloud-office'), resolve(destination, 'cloud-office'), { recursive: true })
await copyFile(resolve(root, 'THIRD_PARTY_NOTICES.md'), resolve(destination, 'THIRD_PARTY_NOTICES.md'))
await copyFile(resolve(source, 'README.md'), resolve(destination, 'README.md'))
await copyFile(resolve(source,'cordis.patch.yml'),resolve(destination,'cordis.patch.yml'))
await copyFile(resolve(source, 'manifest.json'), resolve(destination, 'package.json'))
console.log(JSON.stringify({ directory: destination, version: manifest.version, verifiedAssets: art.length }))

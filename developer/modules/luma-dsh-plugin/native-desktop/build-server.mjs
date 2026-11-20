import { build } from 'esbuild'
import { createHash } from 'node:crypto'
import { DEFAULT_SCHEMA, Type, load as parse } from 'js-yaml'
import { mkdir, readFile, readdir } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const plugin = dirname(here), repo = resolve(plugin, '../..')
const baseline = process.env.LUMA_DSH_SOURCE ?? join(repo, '.luma-cache/deepseek-harness-baseline/141eb6fef83422698aef7a981029e843e8161534')
const output = join(plugin, '.runtime/native-desktop')
await mkdir(output, {recursive:true})
// This release is Windows-only and the plugin requires profileContext. Resolve
// exactly those three official switches at build time; reject unfamiliar tags.
const pinned = JSON.parse(await readFile(join(repo, 'upstream/pins.json'), 'utf8'))
const standard = await readFile(join(repo, 'upstream/desktop-0.2.2-rc.1/standard.patch.yml'), 'utf8')
if (createHash('sha256').update(standard).digest('hex') !== pinned.standardPresetSha256) throw Error('Unexpected desktop standard preset')
const conditions = new Map([["process.platform === 'win32'",true],["process.platform !== 'win32'",false],["!ctx.get('profileContext')",false]])
const schema = DEFAULT_SCHEMA.extend([new Type('tag:yaml.org,2002:js', { kind:'scalar', construct(condition) {
  if (!conditions.has(condition)) throw Error('Unsupported native preset condition: '+condition)
  return conditions.get(condition)
}})])
const config = parse(standard,{schema})[0].insert.find(row=>row.id==='preset-standard')?.config
if (config?.id !== 'standard' || !Array.isArray(config.plugins) || !config.plugins.some(row=>row.id==='persona')) throw Error('Invalid standard preset')
const employees = {}
for (const id of (await readdir(join(plugin,'presets'))).filter(id => /^luma-[a-z-]+$/.test(id)).sort()) {
  const meta = parse(await readFile(join(plugin,'presets',id,'preset.yml'), 'utf8'))
  if (!meta.name || !meta.description || !Number.isSafeInteger(meta.order)) throw Error('Invalid Luma preset '+id)
  employees[id]={name:meta.name,description:meta.description,order:meta.order}
}
if (Object.keys(employees).length !== 8) throw Error('Expected eight Luma employee presets.')
await build({
  entryPoints:[join(here, 'server-entry.ts')], outfile:join(output, 'server.mjs'),
  platform:'node', format:'esm', target:'node24', bundle:true,
  define:{__LUMA_DESKTOP_PRESETS__:JSON.stringify({employees,plugins:config.plugins})},
  alias:{
    '@deepseek-ai/schemastery':join(baseline, 'vendor/schemastery/src/index.ts'),
    '@deepseek-ai/cosmokit':join(baseline, 'vendor/cosmokit/src/index.ts'),
  },
})

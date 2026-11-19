import { build } from 'esbuild'
import { createHash } from 'node:crypto'
import { load as parse } from 'js-yaml'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const plugin = dirname(here), repo = resolve(plugin, '../..')
const baseline = process.env.LUMA_DSH_SOURCE ?? join(repo, '.luma-cache/deepseek-harness-baseline/141eb6fef83422698aef7a981029e843e8161534')
const output = join(plugin, '.runtime/native-desktop')
await mkdir(output, {recursive:true})
await build({
  entryPoints:[join(here, 'server-entry.ts')], outfile:join(output, 'server.mjs'),
  platform:'node', format:'esm', target:'node24', bundle:true,
  alias:{
    '@deepseek-ai/schemastery':join(baseline, 'vendor/schemastery/src/index.ts'),
    '@deepseek-ai/cosmokit':join(baseline, 'vendor/cosmokit/src/index.ts'),
  },
})

// Reuse the exact desktop build's standard agent composition, including platform
// expressions and isolates. The old Web preset format is not mounted by Desktop.
const pinned = JSON.parse(await readFile(join(repo, 'upstream/pins.json'), 'utf8'))
const standard = await readFile(join(repo, 'upstream/desktop-0.2.2-rc.1/standard.patch.yml'), 'utf8')
if (createHash('sha256').update(standard).digest('hex') !== pinned.standardPresetSha256) throw Error('Unexpected desktop standard preset')
const items = standard.slice(standard.indexOf('- insert:')).trimEnd()
if (!items.includes('    - id: preset-standard') || !items.includes('        id: standard') || !items.includes('        plugins:'))
  throw Error('The official standard preset layout has changed.')
const presets = []
for (const id of (await readdir(join(plugin,'presets'))).filter(id => /^luma-[a-z-]+$/.test(id)).sort()) {
  const meta = parse(await readFile(join(plugin,'presets',id,'preset.yml'), 'utf8'))
  if (!meta.name || !meta.description || !Number.isSafeInteger(meta.order)) throw Error('Invalid Luma preset '+id)
  const yaml = items.replace('    - id: preset-standard', '    - id: preset-'+id)
    .replace('        id: standard', '        id: '+id+'\n        name: '+JSON.stringify(meta.name)+'\n        description: '+JSON.stringify(meta.description))
    .replace('        order: 1\n', '        order: '+meta.order+'\n')
    .replace('prefix: You are a coding agent powered by the {{model}} model.',
      'prefix: '+JSON.stringify('你是 Luma 员工'+meta.name+'。'+meta.description+' 当前模型为 {{model}}。'))
  presets.push(yaml)
}
if (presets.length !== 8) throw Error('Expected eight Luma employee presets.')
await writeFile(join(output,'employee-presets.patch.yml'), presets.join('\n\n')+'\n')

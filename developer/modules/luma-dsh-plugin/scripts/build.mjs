import { build } from 'esbuild'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, mkdirSync, writeFileSync, cpSync } from 'node:fs'
import { dirname, resolve, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const repo = resolve(root, '../..')
const desktopClient = true
const id = '@luma/dsh-plugin'
const dshRoot = resolve(process.env.LUMA_DSH_SOURCE ?? resolve(repo, '.luma-cache/deepseek-harness-baseline/141eb6fef83422698aef7a981029e843e8161534'))
const configPath = resolve(dshRoot, 'tsconfig.base.json')
if (!existsSync(configPath)) throw new Error('Restore the locked DSH source first; set LUMA_DSH_SOURCE to its checkout')
const config = JSON.parse(readFileSync(configPath, 'utf8').split('\n').filter(line => !line.trimStart().startsWith('//')).join('\n').replace(/,(\s*[}\]])/gu, '$1'))
const aliases = config.compilerOptions.paths
const sharedPrimitives = '@deepseek-ai/dsh-client-ui-primitives'
const legacySourceRoot = resolve(repo, 'overlays/deepseek-harness/luma-full/files/packages/client').replace(/\\/g, '/') + '/'
const privatePrimitives = resolve(root, desktopClient ? 'native-desktop/client-primitives.ts' : 'src/client/primitives-compat.tsx')
const baseline = new Set(['react', 'react/jsx-runtime', 'react-dom', 'react-dom/client', '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-ui-slots', '@deepseek-ai/dsh-client-ui-primitives', '@deepseek-ai/dsh-client-runtime/client'])
const safeInline = /^@deepseek-ai\/(?:cosmokit|schemastery)(?:\/|$)|^@deepseek-ai\/dsh-(?:host-apiproxy|file-reference|session|llm|tools|brand)(?:\/|$)/u
const css = {
  name: 'luma-owned-css', setup(bundler) {
    bundler.onLoad({ filter: /\.css(?:\?inline)?$/ }, async args => {
      const file = args.path.replace(/\?inline$/u, '')
      const source = readFileSync(file, 'utf8')
      if (args.path.endsWith('?inline')) return { contents: `export default ${JSON.stringify(source)}`, loader: 'js' }
      const key = id + '/' + createHash('sha256').update(source).digest('hex').slice(0, 16)
      if (desktopClient) return {
        loader: 'js', resolveDir: root,
        contents: `import { registerStyle } from './native-desktop/client-styles.mjs';registerStyle(${JSON.stringify(key)},${JSON.stringify(source)})`,
      }
      return { contents: `if(typeof document!=='undefined'&&!document.querySelector('style[data-plugin-css="${key}"]')){const tag=document.createElement('style');tag.dataset.plugin=${JSON.stringify(id)};tag.dataset.pluginCss=${JSON.stringify(key)};tag.textContent=${JSON.stringify(source)};document.head.appendChild(tag)}`, loader: 'js' }
    })
  },
}
const sdk = {
  name: 'dsh-module-boundary', setup(bundler) {
    if (desktopClient) bundler.onResolve({ filter: /^\.\.\/\.\.\/package\.json$/ }, args => {
      if (args.importer === resolve(root, 'src/client/plugin-backup-runtime.ts')) return { path: resolve(root, 'native-desktop/manifest.json') }
    })
    bundler.onResolve({ filter: /^(?:react(?:\/.*)?|react-dom(?:\/.*)?|@deepseek-ai\/.*)$/ }, args => {
      // Luma's former full-application overlay added names to the primitive
      // namespace. A regular DSH plugin must provide those names privately;
      // imports inside the adapter itself still use DSH's shared module.
      if (args.path === sharedPrimitives && args.importer.replace(/\\/g, '/').startsWith(legacySourceRoot)) return { path: privatePrimitives }
      if (baseline.has(args.path)) return { path: args.path, external: true }
      if (args.path.startsWith('@deepseek-ai/') && !safeInline.test(args.path) && !args.path.endsWith('/remote')) return { path: args.path, external: true }
      const target = aliases[args.path]?.[0]
      if (target) return bundler.resolve(resolve(dshRoot, target), { kind: args.kind, resolveDir: dshRoot })
      return null
    })
  },
}
const common = { absWorkingDir: repo, bundle: true, target: 'es2022', jsx: 'automatic', sourcemap: true,
  tsconfigRaw: { compilerOptions: { jsx: 'react-jsx', useDefineForClassFields: true } }, logLevel: 'info' }
if (!desktopClient) await build({ ...common, entryPoints: [resolve(root, 'src/index.ts')], outfile: resolve(root, 'lib/index.js'),
  platform: 'node', format: 'esm', packages: 'external' })
const client = await build({ ...common,
  entryPoints: [resolve(root, desktopClient ? 'native-desktop/client.mjs' : 'src/client/index.ts')],
  outfile: resolve(root, desktopClient ? '.runtime/native-desktop/client.mjs' : 'lib/client.js'),
  sourcemap: !desktopClient,
  platform: 'browser', format: 'cjs', plugins: [sdk, css], metafile: true, loader: { '.webp': 'dataurl' },
  define: { 'process.env.NODE_ENV': '"production"', 'process.env.DSH_CLIENT_BUILD_PROFILE': '"official"', 'import.meta.env': '{}', 'import.meta.env.MODE': '"production"', 'import.meta.env.DEV': 'false', 'import.meta.env.PROD': 'true' },
  banner: { js: `window.__ModuleLoader__.load({id:${JSON.stringify(id)},factory:(require)=>{var module={exports:{}};var exports=module.exports;` },
  footer: { js: 'return module.exports;}});' },
})
const external = [...new Set(Object.values(client.metafile.outputs).flatMap(output => output.imports.filter(value => value.external).map(value => value.path)))].filter(value => !baseline.has(value)).sort()
if (desktopClient) {
  if (external.length) throw Error('Desktop renderer requires unregistered modules: ' + external.join(', '))
  console.log('Built native sidebar and main panel at .runtime/native-desktop/client.mjs')
  process.exit(0)
}

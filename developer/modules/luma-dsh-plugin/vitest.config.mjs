import { defineConfig } from 'vitest/config'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(fileURLToPath(import.meta.url))
const repo = resolve(root, '../..')
const dsh = resolve(process.env.LUMA_DSH_SOURCE ?? resolve(repo, '.luma-cache/deepseek-harness-baseline/141eb6fef83422698aef7a981029e843e8161534'))
const config = JSON.parse(readFileSync(resolve(dsh, 'tsconfig.base.json'), 'utf8').split('\n').filter(line => !line.trimStart().startsWith('//')).join('\n').replace(/,(\s*[}\]])/gu, '$1'))
const alias = Object.entries(config.compilerOptions.paths).filter(([name]) => !name.includes('*')).map(([name, targets]) => ({
  find: new RegExp('^' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$'), replacement: resolve(dsh, targets[0]),
}))
export default defineConfig({
  root, cacheDir: resolve(root, '.runtime/vitest'),
  esbuild: { jsx: 'automatic', target: 'ES2022', tsconfigRaw: JSON.stringify({ compilerOptions: { jsx: 'react-jsx', target: 'ES2022' } }) },
  resolve: { alias: [
    { find: /^@deepseek-ai\/dsh-client-ui-primitives$/, replacement: resolve(repo, 'overlays/deepseek-harness/luma-full/files/packages/client/ui-primitives/src/client/LumaHelpTip.tsx') },
    // Card persistence tests exercise the actual Host file provider, whose
    // Node-only packages are outside DSH's Client tsconfig paths.
    { find: /^@deepseek-ai\/dsh-atomic-write$/, replacement: resolve(dsh, 'packages/util/atomic-write/src/index.ts') },
    { find: /^@deepseek-ai\/dsh-home-paths$/, replacement: resolve(dsh, 'packages/util/home-paths/src/index.ts') },
    { find: /^@deepseek-ai\/dsh-settings$/, replacement: resolve(dsh, 'packages/settings/settings/src/index.ts') },
    { find: /^@deepseek-ai\/dsh-host-apiproxy\/api$/, replacement: resolve(dsh, 'packages/host/apiproxy/src/api/index.ts') },
    { find: /^@deepseek-ai\/dsh-llm$/, replacement: resolve(dsh, 'packages/llm/llm/src/index.ts') },
    { find: /^@deepseek-ai\/dsh-timeout$/, replacement: resolve(dsh, 'packages/util/timeout/src/index.ts') },
    { find: /^react$/, replacement: resolve(repo, 'node_modules/react/index.js') },
    { find: /^react\/(.*)$/, replacement: resolve(repo, 'node_modules/react') + '/$1' },
    { find: /^react-dom$/, replacement: resolve(repo, 'node_modules/react-dom/index.js') },
    { find: /^react-dom\/(.*)$/, replacement: resolve(repo, 'node_modules/react-dom') + '/$1' }, ...alias,
  ] },
  test: { include: ['test/**/*.test.{ts,tsx}'], environment: 'jsdom', maxWorkers: 1, fileParallelism: false },
})

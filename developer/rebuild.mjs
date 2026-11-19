import { cp, mkdir, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

const root = fileURLToPath(new URL('.', import.meta.url))
const { baselineCommit } = JSON.parse(await readFile(join(root, 'upstream/pins.json'), 'utf8'))
const baseline = join(root, '.luma-cache', 'deepseek-harness-baseline', baselineCommit)
await mkdir(baseline, { recursive: true })
await cp(join(root, 'upstream/dsh'), baseline, { recursive: true })
for (const script of ['scripts/build.mjs', 'native-desktop/build-server.mjs']) {
  const result = spawnSync(process.execPath, [join(root, 'modules/luma-dsh-plugin', script), '--native-desktop'], {
    cwd: root, stdio: 'inherit', env: { ...process.env, LUMA_DSH_SOURCE: baseline },
  })
  if (result.error) throw result.error
  if (result.status !== 0) process.exit(result.status ?? 1)
}

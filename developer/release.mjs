import { spawnSync } from 'node:child_process'
import { access, mkdir, mkdtemp, readFile, rename } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('.', import.meta.url))
const plugin = join(root, 'modules/luma-dsh-plugin')
const { version } = JSON.parse(await readFile(join(plugin, 'native-desktop/manifest.json'), 'utf8'))
const [archive, target] = process.argv.slice(2)
if (!archive || process.platform !== 'win32') throw Error('On Windows use npm run release -- path/to/release.zip [new-output-directory]')
const final = resolve(target ?? join(root, 'dist', 'DesktopPlugin-' + version))
try { await access(final); throw Error('Output already exists. Specify a fresh output directory.') } catch (error) { if (error.code !== 'ENOENT') throw error }
const run = (exe, args) => {
  const result = spawnSync(exe, args, { cwd: root, stdio: 'inherit' })
  if (result.error) throw result.error
  if (result.status !== 0) process.exit(result.status ?? 1)
}
run(process.execPath, [join(root, 'rebuild.mjs')])
run('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', join(root, 'restore-public.ps1'), '-Archive', resolve(archive)])
await mkdir(dirname(final), {recursive:true})
const stage = await mkdtemp(join(dirname(final), '.luma-build-'))
run(process.execPath, [join(plugin, 'scripts/prepare-native-release.mjs'), stage])
await rename(stage, final)
console.log('Rebuilt native plugin in ' + final)

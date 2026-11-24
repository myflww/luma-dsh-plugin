import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { copyFile, mkdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const vendor = fileURLToPath(new URL('../native-desktop/vendor/agent-desktop/', import.meta.url))
const digest = bytes => createHash('sha256').update(bytes).digest('hex')

export async function prepareStudioDesktop(output) {
  const archive = join(vendor, 'windows-x64-v1.3.1.tar.gz')
  if (digest(await readFile(archive)) !== '6ee4b1e078f4e78792e79f16e32e4a78b9919464aa3c55629b7e27ed53a08c13') throw Error('Unexpected agent-desktop release archive')
  const destination = join(output, 'agent-desktop')
  await mkdir(destination, {recursive:true})
  execFileSync('tar', ['-xzf', archive, '-C', destination, 'agent-desktop.exe'], {windowsHide:true})
  if (digest(await readFile(join(destination, 'agent-desktop.exe'))) !== 'a7ef5e539fb97287a35eb9ed49d3803b4d6bd705bc4106eb28617229f9be679e') throw Error('Unexpected agent-desktop executable')
  await copyFile(join(vendor, 'LICENSE'), join(destination, 'LICENSE'))
}

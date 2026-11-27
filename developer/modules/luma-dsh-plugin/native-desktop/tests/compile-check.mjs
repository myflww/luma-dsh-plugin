import { execFileSync } from 'node:child_process'
import { readdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const native = fileURLToPath(new URL('..', import.meta.url))

export async function compileCheck(name, directory) {
  const csc = join(process.env.SystemRoot, 'Microsoft.NET/Framework/v4.0.30319/csc.exe')
  const wpf = join(dirname(csc), 'WPF')
  const sources = (await readdir(native)).filter(file => file.endsWith('.cs')).map(file => join(native, file))
  const output = join(directory, name + '.exe')
  execFileSync(csc, [
    '/nologo', '/codepage:65001', '/r:System.Drawing.dll', '/r:System.Windows.Forms.dll',
    '/r:System.Web.Extensions.dll', '/r:System.Xaml.dll', '/r:' + join(wpf, 'PresentationCore.dll'),
    '/r:' + join(wpf, 'WindowsBase.dll'), '/main:' + name, '/out:' + output,
    ...sources, join(native, 'tests', name + '.cs'),
  ], { windowsHide: true })
  return output
}

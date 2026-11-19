import { lstat, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { MESSAGE_ROLE_IDS } from '../messages-settings.ts'
/** Empty, role-specific DSH directories. No project or user file is copied. */
export async function prepareRoleHomes(root: string): Promise<Record<string, string>> {
  await mkdir(root, { recursive: true, mode: 0o700 })
  const parent = await lstat(root)
  if (!parent.isDirectory() || parent.isSymbolicLink()) throw Error('角色目录必须是普通目录。')
  const homes: Record<string, string> = {}
  for (const id of MESSAGE_ROLE_IDS) {
    const path = join(root, id)
    await mkdir(path, { recursive: true, mode: 0o700 })
    const stat = await lstat(path)
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw Error('角色目录不能指向链接：' + id)
    homes[id] = path
  }
  return homes
}

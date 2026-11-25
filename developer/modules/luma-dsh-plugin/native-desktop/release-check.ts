import { execFile } from 'node:child_process'
import { access, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { promisify } from 'node:util'
import type { DatabaseSync } from 'node:sqlite'
import manifest from './manifest.json' with { type: 'json' }

const exec = promisify(execFile)
const repo = 'myflww/luma-dsh-plugin'
const versionParts = (version: string) => /^v?(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})$/.exec(version)?.slice(1).map(Number)
export function newer(candidate: string, installed = manifest.version) {
  const a = versionParts(candidate), b = versionParts(installed)
  if (!a || !b) return false
  const index = a.findIndex((part,i) => part !== b[i])
  return index >= 0 && a[index]! > b[index]!
}
async function latestTag() {
  try {
    const response = await fetch('https://api.github.com/repos/' + repo + '/releases/latest', {
      headers: { Accept: 'application/vnd.github+json' }, signal: AbortSignal.timeout(4500),
    })
    if (response.ok) {
      const { tag_name: tag } = await response.json()
      if (typeof tag === 'string' && versionParts(tag)) return tag
    }
  } catch { /* Restricted networks can still use the authenticated CLI below. */ }
  const installed = join(process.env.ProgramFiles ?? 'C:/Program Files', 'GitHub CLI', 'gh.exe')
  const binary = await access(installed).then(() => installed, () => 'gh')
  const { stdout } = await exec(binary, ['api', '--hostname', 'github.com', 'repos/' + repo + '/releases/latest', '--jq', '.tag_name'], {
    windowsHide: true, timeout: 8000, maxBuffer: 8192,
    env: {...process.env, GH_PROMPT_DISABLED:'1', GH_NO_UPDATE_NOTIFIER:'1'},
  })
  const tag = stdout.trim()
  if (!versionParts(tag)) throw Error('无可用正式版本')
  return tag
}
async function desktopVersion() {
  try {
    const p = join(dirname(process.execPath),'resources','app.asar','package.json')
    const data = JSON.parse(await readFile(p,'utf8'))
    if (data.name === '@deepseek-ai/dsh-desktop' && typeof data.version === 'string') return data.version
  } catch { /* Standalone preview hosts do not ship an Electron manifest. */ }
  return ''
}
export function releaseChecker(db: DatabaseSync, fetchTag = latestTag, clock = Date.now, host = desktopVersion) {
  db.exec("CREATE TABLE IF NOT EXISTS luma_release(id INTEGER PRIMARY KEY CHECK(id=1), tag TEXT NOT NULL, checked INTEGER NOT NULL, skipped TEXT NOT NULL); INSERT OR IGNORE INTO luma_release VALUES (1,'',0,'')")
  const read = db.prepare('SELECT tag,checked,skipped FROM luma_release WHERE id=1')
  const write = db.prepare('UPDATE luma_release SET tag=?,checked=? WHERE id=1')
  let pending: Promise<string> | undefined
  let failedAt = -Infinity
  let alive = true
  const hostPromise = host()
  return {
    close() { alive = false },
    async check(action: string, tag?: string) {
      if (!['auto','check','skip'].includes(action)) throw Error('未知更新操作')
      let row = read.get() as {tag:string;checked:number;skipped:string}
      let problem = ''
      if (action === 'skip') {
        if (!tag || row.tag !== tag || !newer(tag)) throw Error('版本已变化，请重新检查')
        db.prepare('UPDATE luma_release SET skipped=? WHERE id=1').run(tag)
      } else if (action === 'check' || (clock()-row.checked > 6*3600000 && clock()-failedAt > 900000)) {
        try {
          pending ??= fetchTag().then(value => {
            if (!versionParts(value)) throw Error('无效版本')
            if (alive) write.run(value,clock())
            failedAt = -Infinity
            return value
          }).catch(error=>{ failedAt=clock(); throw error }).finally(()=>{pending=undefined})
          await pending
        } catch { problem = '暂时无法读取 GitHub 上的版本信息，联网后可重新检查。' }
      } else if (failedAt > row.checked) problem = '上次未能读取版本信息，可重新检查。'
      if (!alive) throw Error('插件已关闭')
      row = read.get() as typeof row
      return { installed:manifest.version, host:await hostPromise, latest:row.tag, checked:row.checked, problem,
        available:newer(row.tag), dismissed:row.tag === row.skipped,
        url:row.tag ? 'https://github.com/'+repo+'/releases/tag/'+encodeURIComponent(row.tag) : 'https://github.com/'+repo+'/releases/latest' }
    }
  }
}

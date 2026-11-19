import { constants } from 'node:fs'
import { lstat, open, realpath } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { extname, isAbsolute, join, relative, sep } from 'node:path'

/** Public URL roots retained by the existing office and card renderers. */
export const ASSET_PREFIXES = Object.freeze([
  '/luma-office', '/luma-card-library', '/luma-card-viewers', '/luma-card-scene-frames',
  '/luma-card-scene-frame-craft', '/luma-collection', '/luma-economy',
])

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.gif': 'image/gif', '.avif': 'image/avif',
  '.wasm': 'application/wasm', '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.mp4': 'video/mp4',
}

function finish(res: ServerResponse, status: number): void {
  res.writeHead(status)
  res.end()
}

/** Open only regular, non-linked descendants; Windows ADS and separators are refused. */
async function openAsset(root: string, parts: string[]) {
  const rootStat = await lstat(root)
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) throw Error('Asset root is not a directory')
  const canonicalRoot = await realpath(root)
  let target = canonicalRoot
  for (const part of parts) {
    target = join(target, part)
    const stat = await lstat(target)
    if (stat.isSymbolicLink()) throw Error('Linked assets are not public')
  }
  if ((await lstat(target)).isDirectory()) {
    target = join(target, 'index.html')
    if ((await lstat(target)).isSymbolicLink()) throw Error('Linked assets are not public')
  }
  const canonical = await realpath(target)
  const inside = relative(canonicalRoot, canonical)
  if (!inside || isAbsolute(inside) || inside === '..' || inside.startsWith(`..${sep}`)) throw Error('Asset is outside public directory')
  const expected = await lstat(canonical)
  const handle = await open(canonical, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0))
  try {
    const stat = await handle.stat()
    if (!stat.isFile() || expected.isSymbolicLink() || stat.dev !== expected.dev || stat.ino !== expected.ino) {
      throw Error('Asset is not the admitted regular file')
    }
    return { handle, size: stat.size, path: canonical }
  } catch (error) {
    await handle.close()
    throw error
  }
}

/** Serve the plugin's own public tree through DSH's HTTP route service. */
export function createAssetHandler(publicRoot: string) {
  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    if (req.method !== 'GET' && req.method !== 'HEAD') { finish(res, 405); return }
    let pathname: string
    try { pathname = decodeURIComponent((req.url ?? '').split(/[?#]/u, 1)[0] ?? '') }
    catch { finish(res, 400); return }
    const parts = pathname.split('/').slice(1)
    if (!pathname.startsWith('/') || !ASSET_PREFIXES.includes(`/${parts[0]}`)
      || parts.some(part => part === '.' || part === '..' || /[\\:\u0000-\u001f\u007f]/u.test(part))) {
      finish(res, 403); return
    }
    if (parts.at(-1) === '') parts.pop()
    if (parts.some(part => part === '')) { finish(res, 403); return }
    let asset: Awaited<ReturnType<typeof openAsset>>
    try { asset = await openAsset(publicRoot, parts) }
    catch { finish(res, 404); return }
    const headers: Record<string, string | number> = {
      'content-type': CONTENT_TYPES[extname(asset.path).toLowerCase()] ?? 'application/octet-stream',
      'cache-control': 'no-cache', 'x-content-type-options': 'nosniff',
      'cross-origin-resource-policy': 'same-origin', 'accept-ranges': 'bytes',
    }
    let start = 0, end = asset.size - 1, status = 200
    const range = req.headers.range
    if (range !== undefined) {
      const match = /^bytes=(\d*)-(\d*)$/u.exec(range)
      if (match && (match[1] !== '' || match[2] !== '')) {
        start = match[1] === '' ? Math.max(0, asset.size - Number(match[2])) : Number(match[1])
        end = match[1] === '' || match[2] === '' ? asset.size - 1 : Math.min(Number(match[2]), asset.size - 1)
      } else start = -1
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start > end || start >= asset.size) {
        await asset.handle.close()
        res.writeHead(416, { 'content-range': `bytes */${asset.size}` }); res.end(); return
      }
      status = 206
      headers['content-range'] = `bytes ${start}-${end}/${asset.size}`
    }
    headers['content-length'] = Math.max(0, end - start + 1)
    res.writeHead(status, headers)
    if (req.method === 'HEAD' || asset.size === 0) { await asset.handle.close(); res.end(); return }
    await new Promise<void>((resolve) => {
      const stream = asset.handle.createReadStream({ start, end, autoClose: true })
      const close = () => { stream.destroy(); resolve() }
      res.once('close', close)
      stream.once('error', error => { res.off('close', close); res.destroy(error); resolve() })
      stream.once('end', () => { res.off('close', close); resolve() })
      stream.pipe(res)
    })
  }
}

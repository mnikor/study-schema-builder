/**
 * Production server: serves the built app from dist/ plus the local API. Run `npm run build` first.
 * HOST/PORT are configurable (Domino Apps need HOST=0.0.0.0 PORT=8888); paths work behind a proxy prefix.
 */
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { apiMiddleware } from './api.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist')
const port = Number(process.env.PORT || 5181)
const host = process.env.HOST || '127.0.0.1'
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.woff2': 'font/woff2', '.map': 'application/json' }
const api = apiMiddleware()

/** Find a built file for a URL path, ignoring any leading proxy prefix (e.g. /user/project/r/app/assets/x.js). */
function resolveFile(urlPath) {
  const parts = urlPath.split('/').filter(Boolean)
  for (let i = 0; i < parts.length; i++) {
    const file = path.join(root, ...parts.slice(i))
    if (file.startsWith(root) && fs.existsSync(file) && fs.statSync(file).isFile()) return file
  }
  return null
}

http
  .createServer((req, res) => {
    api(req, res, () => {
      const rel = decodeURIComponent((req.url || '/').split('?')[0])
      const found = resolveFile(rel)
      if (!found && /\.[a-z0-9]+$/i.test(rel)) {
        res.writeHead(404, { 'Content-Type': 'text/plain' })
        return res.end('Not found')
      }
      const file = found ?? path.join(root, 'index.html')
      res.writeHead(200, { 'Content-Type': types[path.extname(file)] ?? 'application/octet-stream' })
      fs.createReadStream(file).pipe(res)
    })
  })
  .listen(port, host, () => console.log(`Study Schema Builder on http://${host}:${port}`))

/** Production server: serves the built app from dist/ plus the local API. Run `npm run build` first. */
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { apiMiddleware } from './api.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist')
const port = Number(process.env.PORT || 5181)
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.woff2': 'font/woff2' }
const api = apiMiddleware()

http
  .createServer((req, res) => {
    api(req, res, () => {
      const rel = decodeURIComponent((req.url || '/').split('?')[0])
      let file = path.join(root, rel === '/' ? 'index.html' : rel)
      if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(root, 'index.html')
      res.writeHead(200, { 'Content-Type': types[path.extname(file)] ?? 'application/octet-stream' })
      fs.createReadStream(file).pipe(res)
    })
  })
  .listen(port, '127.0.0.1', () => console.log(`Study Schema Builder on http://127.0.0.1:${port}`))

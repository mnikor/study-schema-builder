/**
 * Local API used by both the Vite dev server and `npm start`.
 *   GET  /api/health   -> { ai, model, keySource }
 *   POST /api/analyze  -> NDJSON stream of {type:'progress'|'result'|'error'}
 * The OpenAI key never leaves this process.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { STUDY_SCHEMA, SYSTEM_PROMPT, userPrompt } from '../shared/prompt.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const appDir = path.resolve(here, '..')
const MAX_BODY = 60 * 1024 * 1024

function readEnvFile(file) {
  try {
    const out = {}
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
      if (m) out[m[1]] = m[2].replace(/^['"]|['"]$/g, '')
    }
    return out
  } catch {
    return {}
  }
}

/** Key lookup: environment, ./.env.local, then the sibling Study Schema Studio's .env.local. */
export function loadConfig() {
  const candidates = [process.env.STUDIO_ENV_FILE, path.join(appDir, '.env.local'), path.join(appDir, '..', 'study-schema', '.env.local')].filter(Boolean)
  let fileEnv = {}
  let source = null
  for (const f of candidates) {
    const env = readEnvFile(f)
    if (env.OPENAI_API_KEY) {
      fileEnv = env
      source = path.relative(appDir, f) || f
      break
    }
  }
  return {
    apiKey: process.env.OPENAI_API_KEY || fileEnv.OPENAI_API_KEY || '',
    model: process.env.STUDIO_AI_MODEL || fileEnv.STUDIO_AI_MODEL || 'gpt-5.4',
    keySource: process.env.OPENAI_API_KEY ? 'environment' : source,
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', (c) => {
      size += c.length
      if (size > MAX_BODY) {
        reject(new Error('Upload too large (limit 60 MB).'))
        req.destroy()
        return
      }
      chunks.push(c)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(body))
}

function upstreamError(text, status) {
  try {
    const j = JSON.parse(text)
    return `OpenAI error ${status}: ${j.error?.message ?? text.slice(0, 300)}`
  } catch {
    return `OpenAI error ${status}: ${text.slice(0, 300)}`
  }
}

async function analyze(req, res) {
  const cfg = loadConfig()
  let body
  try {
    body = JSON.parse(await readBody(req))
  } catch (e) {
    return json(res, 400, { error: String(e.message || e) })
  }
  if (!cfg.apiKey) return json(res, 503, { error: 'No OpenAI key configured. Set OPENAI_API_KEY or add it to .env.local.' })
  if (!body.text && !body.file) return json(res, 400, { error: 'Provide document text or a file.' })

  res.writeHead(200, { 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no' })
  const send = (o) => res.write(JSON.stringify(o) + '\n')
  const started = Date.now()
  const controller = new AbortController()
  res.on('close', () => {
    if (!res.writableEnded) controller.abort()
  })
  const heartbeat = setInterval(() => send({ type: 'progress', stage: 'thinking', elapsed: Math.round((Date.now() - started) / 1000) }), 4000)

  try {
    const content = []
    if (body.file?.data) {
      content.push({ type: 'input_file', filename: body.file.name || 'document.pdf', file_data: `data:${body.file.mime || 'application/pdf'};base64,${body.file.data}` })
    }
    content.push({ type: 'input_text', text: userPrompt({ text: body.text, fileName: body.file?.name ?? body.fileName, studyType: body.studyType, guidelines: body.guidelines, truncated: body.truncated }) })
    const payload = {
      model: cfg.model,
      input: [
        { role: 'developer', content: [{ type: 'input_text', text: SYSTEM_PROMPT }] },
        { role: 'user', content },
      ],
      text: { format: { type: 'json_schema', name: 'study_model', strict: true, schema: STUDY_SCHEMA } },
      reasoning: { effort: body.depth === 'thorough' ? 'medium' : 'low' },
      max_output_tokens: 32000,
      store: false,
      stream: true,
    }
    send({ type: 'progress', stage: 'sending', elapsed: 0, model: cfg.model })
    const upstream = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { Authorization: `Bearer ${cfg.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })
    if (!upstream.ok || !upstream.body) {
      send({ type: 'error', message: upstreamError(await upstream.text(), upstream.status) })
      return
    }
    const reader = upstream.body.getReader()
    const decoder = new TextDecoder()
    let buf = ''
    let out = ''
    let final = null
    let lastReport = 0
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })
      let idx
      while ((idx = buf.indexOf('\n\n')) >= 0) {
        const block = buf.slice(0, idx)
        buf = buf.slice(idx + 2)
        const data = block
          .split('\n')
          .filter((l) => l.startsWith('data:'))
          .map((l) => l.slice(5).trim())
          .join('')
        if (!data || data === '[DONE]') continue
        let ev
        try {
          ev = JSON.parse(data)
        } catch {
          continue
        }
        if (ev.type === 'response.output_text.delta') {
          out += ev.delta
          if (out.length - lastReport > 800) {
            lastReport = out.length
            send({ type: 'progress', stage: 'writing', chars: out.length, elapsed: Math.round((Date.now() - started) / 1000) })
          }
        } else if (ev.type === 'response.completed') final = ev.response
        else if (ev.type === 'response.incomplete') {
          send({ type: 'error', message: `The model stopped early (${ev.response?.incomplete_details?.reason ?? 'incomplete'}). Try “Fast” depth or a shorter document.` })
          return
        } else if (ev.type === 'response.failed' || ev.type === 'error') {
          send({ type: 'error', message: ev.response?.error?.message ?? ev.message ?? 'The model request failed.' })
          return
        } else if (ev.type === 'response.refusal.delta') {
          send({ type: 'error', message: 'The model declined to process this document.' })
          return
        }
      }
    }
    if (!out && final) {
      out = (final.output ?? [])
        .filter((o) => o.type === 'message')
        .flatMap((o) => o.content ?? [])
        .filter((c) => c.type === 'output_text')
        .map((c) => c.text)
        .join('')
    }
    let model
    try {
      model = JSON.parse(out)
    } catch {
      send({ type: 'error', message: 'The model returned text that is not valid JSON.' })
      return
    }
    send({ type: 'result', model, aiModel: cfg.model, usage: final?.usage ?? null, elapsed: Math.round((Date.now() - started) / 1000) })
  } catch (e) {
    if (e.name !== 'AbortError') send({ type: 'error', message: String(e.message || e) })
  } finally {
    clearInterval(heartbeat)
    res.end()
  }
}

export function apiMiddleware() {
  return async (req, res, next) => {
    const url = (req.url || '').split('?')[0]
    if (!url.startsWith('/api/')) return next()
    try {
      if (url === '/api/health' && req.method === 'GET') {
        const cfg = loadConfig()
        return json(res, 200, { ai: !!cfg.apiKey, model: cfg.model, keySource: cfg.keySource })
      }
      if (url === '/api/analyze' && req.method === 'POST') return await analyze(req, res)
      json(res, 404, { error: 'Not found' })
    } catch (e) {
      if (!res.headersSent) json(res, 500, { error: String(e.message || e) })
      else res.end()
    }
  }
}

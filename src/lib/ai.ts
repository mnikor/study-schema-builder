import enums from '../../shared/enums.json'
import type { GuidelineId, SegmentKind, StudyModel, StudyTypeId } from '../types'
import { uid } from './generate'
import { blankModel } from './templates'

export interface Health {
  ai: boolean
  model: string
  keySource: string | null
}

export async function health(): Promise<Health> {
  try {
    const r = await fetch('/api/health')
    if (!r.ok) throw new Error()
    return await r.json()
  } catch {
    return { ai: false, model: '', keySource: null }
  }
}

export interface AnalyzeInput {
  text?: string
  file?: { name: string; mime: string; data: string }
  fileName?: string
  studyType: StudyTypeId | 'auto'
  guidelines: GuidelineId[]
  depth: 'fast' | 'thorough'
  truncated?: boolean
}

export interface Progress {
  stage: 'sending' | 'thinking' | 'writing'
  elapsed: number
  chars?: number
}

/* ---------------- bring-your-own-key (static hosting, e.g. GitHub Pages) ---------------- */

export interface UserKey {
  key: string
  model: string
  remember: boolean
}

const KEY_STORE = 'study-schema-builder.openai'
let sessionKey: UserKey | null = null

/** The visitor's own OpenAI key: kept in memory, and in this browser's storage only if they ask. */
export function loadUserKey(): UserKey {
  if (sessionKey) return sessionKey
  try {
    const raw = localStorage.getItem(KEY_STORE)
    if (raw) return (sessionKey = { remember: true, ...JSON.parse(raw) })
  } catch {
    /* storage unavailable */
  }
  return { key: '', model: 'gpt-5.4', remember: false }
}

export function saveUserKey(k: UserKey) {
  sessionKey = k
  try {
    if (k.remember && k.key) localStorage.setItem(KEY_STORE, JSON.stringify({ key: k.key, model: k.model }))
    else localStorage.removeItem(KEY_STORE)
  } catch {
    /* storage unavailable */
  }
}

/** Same request as the local server makes, sent straight from the browser to OpenAI with the visitor's key. */
async function analyzeDirect(input: AnalyzeInput, k: UserKey, onProgress: (p: Progress) => void, signal?: AbortSignal) {
  const { STUDY_SCHEMA, SYSTEM_PROMPT, userPrompt } = await import('../../shared/prompt.mjs')
  const content: Record<string, unknown>[] = []
  if (input.file) content.push({ type: 'input_file', filename: input.file.name, file_data: `data:${input.file.mime};base64,${input.file.data}` })
  content.push({ type: 'input_text', text: userPrompt({ text: input.text, fileName: input.file?.name ?? input.fileName, studyType: input.studyType, guidelines: input.guidelines, truncated: input.truncated }) })
  const started = Date.now()
  const elapsed = () => Math.round((Date.now() - started) / 1000)
  onProgress({ stage: 'sending', elapsed: 0 })
  const heartbeat = setInterval(() => onProgress({ stage: 'thinking', elapsed: elapsed() }), 4000)
  try {
    const r = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { Authorization: `Bearer ${k.key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: k.model || 'gpt-5.4',
        input: [
          { role: 'developer', content: [{ type: 'input_text', text: SYSTEM_PROMPT }] },
          { role: 'user', content },
        ],
        text: { format: { type: 'json_schema', name: 'study_model', strict: true, schema: STUDY_SCHEMA } },
        reasoning: { effort: input.depth === 'thorough' ? 'medium' : 'low' },
        max_output_tokens: 32000,
        store: false,
        stream: true,
      }),
      signal,
    })
    if (!r.ok || !r.body) {
      const t = await r.text()
      let msg = t.slice(0, 300)
      try {
        msg = JSON.parse(t).error?.message ?? msg
      } catch {
        /* keep text */
      }
      throw new Error(`OpenAI error ${r.status}: ${msg}`)
    }
    const reader = r.body.getReader()
    const dec = new TextDecoder()
    let buf = ''
    let out = ''
    let last = 0
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      buf += dec.decode(value, { stream: true })
      let i
      while ((i = buf.indexOf('\n\n')) >= 0) {
        const data = buf
          .slice(0, i)
          .split('\n')
          .filter((l) => l.startsWith('data:'))
          .map((l) => l.slice(5).trim())
          .join('')
        buf = buf.slice(i + 2)
        if (!data || data === '[DONE]') continue
        const ev = JSON.parse(data)
        if (ev.type === 'response.output_text.delta') {
          out += ev.delta
          if (out.length - last > 800) {
            last = out.length
            onProgress({ stage: 'writing', chars: out.length, elapsed: elapsed() })
          }
        } else if (ev.type === 'response.incomplete') throw new Error(`The model stopped early (${ev.response?.incomplete_details?.reason ?? 'incomplete'}). Try “Fast” depth or a shorter document.`)
        else if (ev.type === 'response.failed' || ev.type === 'error') throw new Error(ev.response?.error?.message ?? ev.message ?? 'The model request failed.')
        else if (ev.type === 'response.refusal.delta') throw new Error('The model declined to process this document.')
      }
    }
    return { model: sanitizeModel(JSON.parse(out)), aiModel: k.model || 'gpt-5.4', elapsed: elapsed() }
  } finally {
    clearInterval(heartbeat)
  }
}

export async function analyzeWithAI(input: AnalyzeInput, onProgress: (p: Progress) => void, signal?: AbortSignal, userKey?: UserKey) {
  if (userKey?.key) return analyzeDirect(input, userKey, onProgress, signal)
  const r = await fetch('/api/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input), signal })
  if (!r.ok || !r.body) {
    let msg = `Request failed (${r.status})`
    try {
      msg = (await r.json()).error ?? msg
    } catch {
      /* keep default */
    }
    throw new Error(msg)
  }
  const reader = r.body.getReader()
  const dec = new TextDecoder()
  let buf = ''
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    buf += dec.decode(value, { stream: true })
    let i
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim()
      buf = buf.slice(i + 1)
      if (!line) continue
      const ev = JSON.parse(line)
      if (ev.type === 'progress') onProgress(ev)
      else if (ev.type === 'error') throw new Error(ev.message)
      else if (ev.type === 'result') return { model: sanitizeModel(ev.model), aiModel: ev.aiModel as string, elapsed: ev.elapsed as number }
    }
  }
  throw new Error('The analysis ended without a result.')
}

/* ------------------------------------------------------------------ */

const pick = <T extends string>(v: unknown, allowed: readonly string[], fallback: T): T => (typeof v === 'string' && allowed.includes(v) ? (v as T) : fallback)
const s = (v: unknown, f = ''): string => (typeof v === 'string' ? v : f)
const ns = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null)
const sa = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && !!x.trim()) : [])
const nn = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : null)
const arr = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? v.filter((x) => x && typeof x === 'object') : [])

/** Make any (AI or file) model safe to use: fill gaps, fix enums, ensure unique ids. */
export function sanitizeModel(raw: unknown): StudyModel {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, any>
  const b = blankModel()
  const seen = new Set<string>()
  const id = (v: unknown, p: string) => {
    let x = typeof v === 'string' && v.trim() ? v.trim().replace(/\s+/g, '-') : uid(p)
    while (seen.has(x)) x = `${x}-${uid()}`
    seen.add(x)
    return x
  }
  const out: StudyModel = {
    title: s(r.title, b.title) || b.title,
    acronym: ns(r.acronym),
    studyType: pick(r.studyType, enums.studyTypes, 'rct-parallel'),
    studyTypeRationale: s(r.studyTypeRationale),
    phase: ns(r.phase),
    guidelines: sa(r.guidelines).filter((g) => enums.guidelines.includes(g)) as GuidelineId[],
    recommendedLayouts: sa(r.recommendedLayouts).filter((g) => enums.layouts.includes(g)) as StudyModel['recommendedLayouts'],
    population: {
      description: s(r.population?.description),
      targetN: ns(r.population?.targetN),
      keyInclusion: sa(r.population?.keyInclusion),
      keyExclusion: sa(r.population?.keyExclusion),
    },
    design: {
      randomized: !!r.design?.randomized,
      allocationRatio: ns(r.design?.allocationRatio),
      blinding: ns(r.design?.blinding),
      stratification: sa(r.design?.stratification),
      control: ns(r.design?.control),
    },
    periods: arr(r.periods).map((p) => ({ id: id(p.id, 'p'), label: s(p.label, 'Period'), kind: pick(p.kind, enums.periodKinds, 'other'), duration: ns(p.duration), startLabel: ns(p.startLabel) })),
    arms: arr(r.arms).map((a) => ({
      id: id(a.id, 'a'),
      label: s(a.label, 'Arm'),
      kind: pick(a.kind, enums.armKinds, 'other'),
      intervention: s(a.intervention),
      details: ns(a.details),
      n: ns(a.n),
      sequence: sa(a.sequence),
      group: ns(a.group),
    })),
    flowSteps: arr(r.flowSteps).map((f) => ({ id: id(f.id, 'f'), label: s(f.label, 'Step'), n: ns(f.n), exclusions: arr(f.exclusions).map((e) => ({ label: s(e.label, 'Excluded'), n: ns(e.n) })) })),
    lines: arr(r.lines).map((l) => ({
      id: id(l.id, 'l'),
      label: s(l.label, 'Line'),
      regimens: arr(l.regimens).map((g) => ({ label: s(g.label, 'Regimen'), details: ns(g.details), isStudyTreatment: !!g.isStudyTreatment })),
      transition: ns(l.transition),
    })),
    windows: arr(r.windows).map((w) => ({ id: id(w.id, 'w'), label: s(w.label, 'Window'), kind: pick(w.kind, enums.windowKinds, 'other'), startDay: nn(w.startDay), endDay: nn(w.endDay), notes: ns(w.notes) })),
    indexDate: ns(r.indexDate),
    timeline: sanitizeTimeline(r.timeline),
    endpoints: { primary: sa(r.endpoints?.primary), secondary: sa(r.endpoints?.secondary) },
    dataSources: sa(r.dataSources),
    notes: sa(r.notes),
    openQuestions: sa(r.openQuestions),
    evidence: arr(r.evidence).map((e) => ({ field: s(e.field), quote: s(e.quote) })).filter((e) => e.quote),
  }
  // sequences only mean something for crossover designs
  if (out.studyType !== 'rct-crossover') out.arms = out.arms.map((a) => ({ ...a, sequence: [] }))
  return out
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)

function sanitizeTimeline(raw: unknown): StudyModel['timeline'] {
  const t = (raw && typeof raw === 'object' ? raw : {}) as Record<string, any>
  const lanes = arr(t.lanes).map((l, i) => ({
    id: typeof l.id === 'string' && l.id.trim() ? l.id.trim() : `lane${i + 1}`,
    label: s(l.label, `Group ${i + 1}`),
    n: ns(l.n),
    segments: arr(l.segments)
      .filter((g) => num(g.start) !== null)
      .map((g) => ({ label: s(g.label), start: num(g.start)!, end: num(g.end), kind: pick<SegmentKind>(g.kind, enums.segmentKinds, 'other') })),
  }))
  const ids = new Set(lanes.map((l) => l.id))
  return {
    unit: pick(t.unit, enums.timeUnits, 'weeks'),
    lanes,
    links: arr(t.links)
      .map((k) => ({ from: typeof k.from === 'string' && ids.has(k.from) ? k.from : null, at: num(k.at) ?? 0, to: sa(k.to).filter((x) => ids.has(x)), randomized: !!k.randomized, ratio: ns(k.ratio) }))
      .filter((k) => k.to.length > 0),
    milestones: arr(t.milestones).map((m) => ({ at: num(m.at), label: s(m.label) })).filter((m): m is { at: number; label: string } => m.at !== null && !!m.label),
    phases: arr(t.phases).map((p) => ({ label: s(p.label), start: num(p.start), end: num(p.end) })).filter((p): p is { label: string; start: number; end: number | null } => p.start !== null && !!p.label),
    breaks: arr(t.breaks).map((b) => ({ from: num(b.from), to: num(b.to) })).filter((b): b is { from: number; to: number } => b.from !== null && b.to !== null && b.to > b.from),
  }
}

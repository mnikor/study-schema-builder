/**
 * Protocol timeline: cohort lanes with treatment bars on a true time axis,
 * randomisation points, milestones, phase brackets and compressed intervals.
 */
import type { Diagram, SNode, StudyModel, StudyTimeline, TimeUnit, TimelineMeta } from '../types'
import { TL_BAR, TL_PAD_B } from './shapes'
import { lineHeight, measure, wrap } from './text'

export type Scale = NonNullable<TimelineMeta['scale']>

const BREAK_W = 30
const R_SIZE = 30

/** Time → x on a scale with compressed intervals. */
export function scaleX(sc: Scale, t: number): number {
  let x = sc.x0
  let cur = sc.tMin
  for (const b of sc.breaks) {
    if (t <= b.from) break
    x += (b.from - cur) * sc.k
    if (t < b.to) return x + BREAK_W * ((t - b.from) / (b.to - b.from))
    x += sc.breakW
    cur = b.to
  }
  return x + (t - cur) * sc.k
}

export const fmtT = (t: number) => (Math.abs(t - Math.round(t)) < 0.05 ? String(Math.round(t)) : t.toFixed(1)).replace('-', '−')

export const unitLabel = (u: TimeUnit) => u.charAt(0).toUpperCase() + u.slice(1)

/* ------------------------------------------------------------------ */
/* Deriving a timeline from periods + arms when the AI gave none        */
/* ------------------------------------------------------------------ */

const PER_WEEK: Record<string, number> = { day: 1 / 7, week: 1, month: 52.18 / 12, year: 52.18 }

/** "Up to 28 days" → 4, "approximately 3 years" → 156.5; open-ended text → null. */
export function parseWeeks(s: string | null | undefined): number | null {
  if (!s || /until|cycles? until|ongoing|indefinite/i.test(s)) return null
  const m = s.match(/(\d+(?:\.\d+)?)\s*(?:(?:-|–|to)\s*(\d+(?:\.\d+)?))?\s*-?\s*(day|week|month|year|wk|mo|yr)s?\b/i)
  if (!m) return null
  const raw = m[3].toLowerCase()
  const unit = raw === 'wk' ? 'week' : raw === 'mo' ? 'month' : raw === 'yr' ? 'year' : raw
  return parseFloat(m[2] ?? m[1]) * PER_WEEK[unit]
}

const PRE = new Set(['screening', 'run-in', 'baseline', 'lookback'])
const TREAT = new Set(['treatment', 'washout', 'maintenance', 'observation'])

export function deriveTimeline(m: StudyModel): StudyTimeline {
  const pre = m.periods.filter((p) => PRE.has(p.kind))
  const treat = m.periods.filter((p) => TREAT.has(p.kind))
  const post = m.periods.filter((p) => !PRE.has(p.kind) && !TREAT.has(p.kind))
  const r1 = (v: number) => Math.round(v * 10) / 10
  const lanes: StudyTimeline['lanes'] = []
  const phases: StudyTimeline['phases'] = []
  const preDur = pre.reduce((s, p) => s + (parseWeeks(p.duration) ?? 4), 0)
  let popId: string | null = null
  if (pre.length) {
    popId = 'pop'
    let c = -preDur
    lanes.push({
      id: popId,
      label: isObs(m) ? 'Study population' : 'Patients',
      n: m.population.targetN,
      segments: pre.map((p) => {
        const d = parseWeeks(p.duration) ?? 4
        const seg = { label: p.label, start: r1(c), end: r1(c + d), kind: 'off' as const }
        phases.push({ label: p.label, start: r1(c), end: r1(c + d) })
        c += d
        return seg
      }),
    })
  }
  const crossover = m.studyType === 'rct-crossover'
  let phaseDone = false
  const arms = m.arms.length ? m.arms : [{ id: 'a', label: 'Study treatment', kind: 'experimental', intervention: '', details: null, n: null, sequence: [], group: null } as StudyModel['arms'][number]]
  for (const a of arms) {
    const segs: StudyTimeline['lanes'][number]['segments'] = []
    const armKind = a.kind === 'experimental' || a.kind === 'exposure' ? 'active' : a.kind === 'placebo' ? 'placebo' : a.kind === 'cohort' || a.kind === 'other' ? 'active' : 'control'
    let c = 0
    let open = false
    let k = 0
    for (const p of treat.length ? treat : [{ label: 'Treatment', kind: 'treatment', duration: null } as unknown as StudyModel['periods'][number]]) {
      const d = parseWeeks(p.duration)
      const washout = p.kind === 'washout'
      const label = washout ? 'Washout' : crossover ? (a.sequence[k++] ?? a.label) : segs.length === 0 ? a.label : p.label
      segs.push({ label, start: r1(c), end: d === null ? null : r1(c + d), kind: washout ? 'off' : armKind })
      if (!phaseDone && treat.length) phases.push({ label: p.label, start: r1(c), end: d === null ? null : r1(c + d) })
      if (d === null) {
        open = true
        break
      }
      c += d
    }
    if (!open) {
      for (const p of post) {
        const d = parseWeeks(p.duration)
        segs.push({ label: p.label, start: r1(c), end: d === null ? null : r1(c + d), kind: 'off' })
        if (!phaseDone) phases.push({ label: p.label, start: r1(c), end: d === null ? null : r1(c + d) })
        if (d === null) break
        c += d
      }
    }
    phaseDone = true
    lanes.push({ id: a.id, label: a.label, n: a.n, segments: segs })
  }
  const armIds = lanes.filter((l) => l.id !== popId).map((l) => l.id)
  const links: StudyTimeline['links'] = []
  if (m.design.randomized && armIds.length) links.push({ from: popId, at: 0, to: armIds, randomized: true, ratio: m.design.allocationRatio })
  else if (popId && armIds.length) links.push({ from: popId, at: 0, to: armIds, randomized: false, ratio: null })
  const milestones: StudyTimeline['milestones'] = []
  for (const e of m.endpoints.primary) {
    const w = e.match(/week\s*(\d+)/i)
    if (w && !milestones.some((x) => x.at === Number(w[1]))) milestones.push({ at: Number(w[1]), label: 'Primary endpoint' })
  }
  return { unit: 'weeks', lanes, links, milestones, phases, breaks: [] }
}

const isObs = (m: StudyModel) => !['rct-parallel', 'rct-crossover', 'rct-factorial', 'single-arm', 'dose-escalation', 'platform'].includes(m.studyType)

/* ------------------------------------------------------------------ */
/* Layout                                                              */
/* ------------------------------------------------------------------ */

function autoBreaks(times: number[], tMin: number, tMax: number): { from: number; to: number }[] {
  const pts = [...new Set([tMin, tMax, ...times])].sort((a, b) => a - b)
  if (pts.length < 3) return []
  const gaps = pts.slice(1).map((b, i) => ({ a: pts[i], b, g: b - pts[i] })).sort((x, y) => y.g - x.g)
  const span = tMax - tMin
  const [top, second] = gaps
  if (top.g < span * 0.5 || top.g < second.g * 2.5) return []
  const rest = span - top.g
  // leave the start of the axis alone and only compress a stretch that dwarfs everything else around it
  if (top.a <= tMin + 1e-6 || rest < top.g * 0.2) return []
  const tail = Math.max(1, Math.round(Math.max(rest * 0.12, top.g * 0.05)))
  const from = top.a
  const to = top.b - tail
  return to - from > rest * 0.3 ? [{ from, to }] : []
}

export function layoutTimeline(d: Diagram, nodes: SNode[]): { nodes: SNode[]; scale: Scale } {
  const fs = d.settings.fontSize
  const segs = nodes.filter((n) => n.type === 'segment')
  const markers = nodes.filter((n) => n.type === 'marker')
  const laneLabels = nodes.filter((n) => n.type === 'text' && n.data.tlRole === 'lane')
  const nLanes = Math.max(1, ...nodes.map((n) => (n.data.lane ?? -1) + 1))
  const tPhases = d.phases.filter((p) => typeof p.start === 'number')
  const times: number[] = []
  for (const n of nodes) {
    if (typeof n.data.t0 === 'number') times.push(n.data.t0)
    if (typeof n.data.t1 === 'number') times.push(n.data.t1)
  }
  for (const p of tPhases) {
    times.push(p.start!)
    if (typeof p.end === 'number') times.push(p.end)
  }
  const tMin = Math.min(0, ...times)
  const known = Math.max(tMin + 1, ...times)
  const anyOpen = segs.some((s) => s.data.t1 === null || s.data.t1 === undefined) || tPhases.some((p) => p.end === null)
  // open-ended bars (e.g. "until progression") run clearly beyond the last fixed time and end in an arrow
  const openExt = Math.max(1, (known - tMin) * 0.35, tMin < 0 ? -tMin * 3 - Math.max(0, known) : 0)
  const tMax = anyOpen ? known + openExt : known
  const explicit = (d.timeline?.breaks ?? []).filter((b) => b.from >= tMin && b.to <= tMax && b.to > b.from).sort((a, b) => a.from - b.from)
  // automatic compression only looks at stated times, never at the drawn extension of open-ended bars
  const breaks = explicit.length ? explicit : autoBreaks(times, tMin, known)

  const labelMax = 230
  const labelW = Math.min(labelMax, Math.max(110, ...laneLabels.map((n) => measure(n.data.label, fs, true) + 24)))
  const labelLines = Math.max(1, ...laneLabels.map((n) => wrap(n.data.label, labelW - 12, fs, true).length + (n.data.detail ? wrap(n.data.detail, labelW - 12, fs - 1).length : 0)))
  const laneH = Math.max(lineHeight(fs) + 8 + TL_BAR + TL_PAD_B + 14, labelLines * lineHeight(fs) + 16)
  const target = d.settings.nodeWidth ? d.settings.nodeWidth * 4.5 : 860
  const visible = tMax - tMin - breaks.reduce((s, b) => s + (b.to - b.from), 0)
  const k = Math.max(0.5, (target - BREAK_W * breaks.length) / Math.max(1e-6, visible))
  const hasMilestones = markers.length > 0
  const bracketY = tPhases.length ? lineHeight(fs) + 10 : 0
  // milestone labels that would collide step up onto a second line
  const X0 = (t: number) => (labelW + 24) + (t - tMin) * k // provisional (breaks only shift right-hand labels further apart)
  const lift = new Map<string, number>()
  let lastRight = -Infinity
  for (const mk of [...markers].sort((a, b) => (a.data.t0 ?? 0) - (b.data.t0 ?? 0))) {
    const w = Math.min(196, measure(mk.data.label, fs, true))
    const cx = X0(mk.data.t0 ?? 0)
    if (cx - w / 2 < lastRight + 8) lift.set(mk.id, lineHeight(fs))
    else lastRight = cx + w / 2
  }
  const milestoneH = hasMilestones ? lineHeight(fs) + 10 + (lift.size ? lineHeight(fs) : 0) : 0
  const lanesTop = (tPhases.length ? bracketY + 16 : 0) + milestoneH + 4
  const laneYs = Array.from({ length: nLanes }, (_, i) => lanesTop + i * laneH)
  const scale: Scale = { tMin, tMax, k, x0: labelW + 24, breakW: BREAK_W, breaks, lanesTop, lanesBottom: lanesTop + nLanes * laneH, laneYs, laneH, labelW, bracketY, hasMilestones }
  const X = (t: number) => scaleX(scale, t)
  const nodeH = laneH - 8
  const barMid = nodeH - TL_PAD_B - TL_BAR / 2

  // lanes that start with a randomisation marker keep room for it before the bar label
  const offsets = new Map<string, number>()
  for (const n of nodes) {
    if (n.type === 'shape' && n.data.shape === 'circle' && typeof n.data.lane === 'number') {
      offsets.set(`${n.data.lane}:${n.data.t0}`, R_SIZE / 2 + 6)
    }
  }

  const out = nodes.map((n): SNode => {
    const lane = n.data.lane ?? 0
    const y = laneYs[Math.min(lane, nLanes - 1)] ?? 0
    if (n.type === 'segment') {
      const t0 = n.data.t0 ?? 0
      const t1 = typeof n.data.t1 === 'number' ? n.data.t1 : tMax
      const x = X(t0)
      const w = Math.max(10, X(t1) - x)
      // compressed intervals touching the bar (including ones that start/end exactly at its ends)
      const cuts = breaks.filter((b) => b.from < t1 && b.to > t0).map((b) => ({ a: Math.max(0, X(b.from) - x), b: Math.min(w, X(b.to) - x) }))
      const lead = cuts.find((c) => c.a <= 0.5)
      const labelOffset = Math.max(offsets.get(`${lane}:${t0}`) ?? 0, lead ? lead.b + 2 : 0)
      return { ...n, position: { x, y }, width: w, height: nodeH, data: { ...n.data, cuts, labelOffset } }
    }
    if (n.type === 'text' && n.data.tlRole === 'lane') return { ...n, position: { x: 0, y: y + 2 }, width: labelW - 12, height: nodeH }
    if (n.type === 'text' && n.data.tlRole === 'ratio') {
      const w = measure(n.data.label, fs, true) + 4
      return { ...n, position: { x: X(n.data.t0 ?? 0) - R_SIZE / 2 + 4 - w, y: y + barMid - R_SIZE / 2 - lineHeight(fs) + 2 }, width: w, height: lineHeight(fs) + 2 }
    }
    if (n.type === 'shape' && n.data.shape === 'circle' && typeof n.data.lane === 'number') {
      return { ...n, position: { x: X(n.data.t0 ?? 0) - R_SIZE / 2, y: y + barMid - R_SIZE / 2 }, width: R_SIZE, height: R_SIZE, data: { ...n.data, fixedSize: true } }
    }
    if (n.type === 'marker') {
      const mw = 200
      const top = lanesTop - milestoneH - 2
      return { ...n, position: { x: X(n.data.t0 ?? 0) - mw / 2, y: top }, width: mw, height: scale.lanesBottom - top, data: { ...n.data, labelLift: lift.get(n.id) ?? 0, bar: { from: 0, to: 0, openStart: false, openEnd: false, labelSize: milestoneH + 2 } } }
    }
    return n
  })
  return { nodes: out, scale }
}

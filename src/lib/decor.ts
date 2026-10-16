/**
 * Derived decoration: phase bands, timeline axis, title and footnote.
 * Computed from node positions on every render, so they always follow the layout.
 */
import type { Diagram, SNode } from '../types'
import type { Theme } from './catalog'
import type { Box } from './shapes'
import type { Prim } from './prims'
import { lineHeight, measure, wrap } from './text'
import { fmtT, scaleX, unitLabel } from './timeline'

export interface BandDecor {
  phaseId: string
  row: number
  box: Box
  prims: Prim[]
}

export interface Decor {
  bands: BandDecor[]
  axis: Prim[]
  axisBox: Box | null
  title: { box: Box; prims: Prim[] } | null
  footnote: { box: Box; prims: Prim[] } | null
  /** Bounds of nodes + bands + axis (without title/footnote). */
  content: Box
  /** Bounds of everything. */
  bounds: Box
}

const PAD = 16
const TB_HEADER = 124

export const dayLabel = (d: number) => (d === 0 ? 'Day 0' : `Day ${d < 0 ? '−' : ''}${Math.abs(d)}`)

function nodeBox(n: SNode): Box {
  return { x: n.position.x, y: n.position.y, w: n.width ?? 0, h: n.height ?? 0 }
}

function union(boxes: Box[]): Box {
  if (!boxes.length) return { x: 0, y: 0, w: 0, h: 0 }
  const x1 = Math.min(...boxes.map((b) => b.x))
  const y1 = Math.min(...boxes.map((b) => b.y))
  const x2 = Math.max(...boxes.map((b) => b.x + b.w))
  const y2 = Math.max(...boxes.map((b) => b.y + b.h))
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 }
}

export const hasBands = (d: Pick<Diagram, 'settings' | 'phases' | 'layout' | 'nodes'>) =>
  d.settings.bandStyle !== 'none' && (d.layout === 'schema' || d.layout === 'flow' || d.layout === 'lines') && d.phases.some((p) => d.nodes.some((n) => n.data.phase === p.id))

const headerTextH = (h: { label: string[]; dur: string[] }, fs: number) => h.label.length * lineHeight(fs) + (h.dur.length ? 2 + h.dur.length * lineHeight(fs - 1) : 0)

/** Phase extents and header text for one row of nodes (main axis only). */
function rowBands(d: Diagram, rn: SNode[]) {
  const fs = d.settings.fontSize
  const LR = d.direction === 'LR'
  const main = (b: Box) => (LR ? [b.x, b.x + b.w] : [b.y, b.y + b.h])
  const phases = d.phases.filter((p) => rn.some((n) => n.data.phase === p.id))
  if (!phases.length) return null
  const rows = new Set(d.nodes.map((n) => n.data.row ?? 0))
  const firstRowOf = new Map<string, number>()
  for (const n of d.nodes) {
    if (!n.data.phase) continue
    const r = n.data.row ?? 0
    firstRowOf.set(n.data.phase, Math.min(firstRowOf.get(n.data.phase) ?? Infinity, r))
  }
  const myRow = rn[0]?.data.row ?? 0
  const ext = phases.map((p) => {
    const members = rn.filter((n) => n.data.phase === p.id)
    const core = members.filter((n) => !n.data.side)
    const use = core.length ? core : members
    return { p, lo: Math.min(...use.map((n) => main(nodeBox(n))[0])), hi: Math.max(...use.map((n) => main(nodeBox(n))[1])) }
  })
  ext.sort((a, b) => a.lo - b.lo)
  // outer bands also cover side boxes / notes that stick out beyond the first or last step
  const allLo = Math.min(...rn.map((n) => main(nodeBox(n))[0]))
  const allHi = Math.max(...rn.map((n) => main(nodeBox(n))[1]))
  const bounds: [number, number][] = ext.map((e, i) => [
    i === 0 ? Math.min(e.lo, allLo) - PAD : (ext[i - 1].hi + e.lo) / 2,
    i === ext.length - 1 ? Math.max(e.hi, allHi) + PAD : (e.hi + ext[i + 1].lo) / 2,
  ])
  const headerLines = ext.map((e, i) => {
    const width = LR ? bounds[i][1] - bounds[i][0] - 12 : TB_HEADER - 14
    const cont = rows.size > 1 && (firstRowOf.get(e.p.id) ?? myRow) < myRow
    return {
      label: wrap(cont ? `${e.p.label} (cont.)` : e.p.label, width, fs, true),
      dur: e.p.duration && !cont ? wrap(e.p.duration, width, fs - 1) : [],
    }
  })
  const headerSize = LR ? Math.max(...headerLines.map((h) => headerTextH(h, fs))) + 14 : TB_HEADER
  return { ext, bounds, headerLines, headerSize, rb: union(rn.map(nodeBox)) }
}

/** Band header depth for a row of nodes (0 when the page has no bands). */
export function headerSizeFor(d: Diagram, rowNodes: SNode[]) {
  if (!hasBands(d)) return 0
  return rowBands({ ...d, nodes: rowNodes }, rowNodes)?.headerSize ?? 0
}

/** Space the timeline needs beside a row (below in LR, right in TB). */
export function axisSpaceFor(d: Diagram) {
  const fs = d.settings.fontSize
  if (d.direction === 'LR') return 18 + fs + 16
  const labels = [...d.phases.map((p) => p.startLabel ?? ''), d.settings.axisEndLabel]
  return 18 + 9 + Math.max(0, ...labels.map((l) => measure(l, fs - 1))) + 8
}

export function computeDecor(d: Diagram, theme: Theme): Decor {
  const fs = d.settings.fontSize
  const LR = d.direction === 'LR'
  const nodes = d.nodes
  const nb = union(nodes.map(nodeBox))
  const bands: BandDecor[] = []
  const axis: Prim[] = []
  let axisBox: Box | null = null
  const ink = theme.axis

  /* ------------------------------ bands ------------------------------ */
  // one set of bands (and one timeline) per wrapped row; unwrapped diagrams are a single row
  if (hasBands(d)) {
    const rows = new Map<number, SNode[]>()
    for (const n of nodes) rows.set(n.data.row ?? 0, [...(rows.get(n.data.row ?? 0) ?? []), n])
    const rowKeys = [...rows.keys()].sort((a, b) => a - b)
    const labelled = new Set<string>()
    const axisBoxes: Box[] = []
    rowKeys.forEach((rk, ri) => {
      const rn = rows.get(rk)!
      const layout = rowBands(d, rn)
      if (!layout) return
      const { ext, bounds, headerLines, headerSize, rb } = layout
      const crossLo = (LR ? rb.y : rb.x) - PAD - headerSize
      const crossHi = (LR ? rb.y + rb.h : rb.x + rb.w) + PAD
      const style = d.settings.bandStyle
      ext.forEach((e, i) => {
        const [lo, hi] = bounds[i]
        const box: Box = LR ? { x: lo, y: crossLo, w: hi - lo, h: crossHi - crossLo } : { x: crossLo, y: lo, w: crossHi - crossLo, h: hi - lo }
        const header: Box = LR ? { x: lo, y: crossLo, w: hi - lo, h: headerSize } : { x: crossLo, y: lo, w: headerSize, h: hi - lo }
        const pIdx = d.phases.findIndex((p) => p.id === e.p.id)
        const color = e.p.color ?? theme.bands[pIdx % theme.bands.length]
        const prims: Prim[] = []
        if (style === 'tinted') {
          prims.push({ t: 'rect', x: box.x, y: box.y, w: box.w, h: box.h, fill: color })
          if (i > 0) {
            prims.push(LR ? { t: 'line', x1: box.x, y1: box.y, x2: box.x, y2: box.y + box.h, stroke: '#cbd5e1', sw: 1, dash: true } : { t: 'line', x1: box.x, y1: box.y, x2: box.x + box.w, y2: box.y, stroke: '#cbd5e1', sw: 1, dash: true })
          }
        } else if (style === 'outline') {
          prims.push({ t: 'rect', x: box.x + 2, y: box.y + 2, w: box.w - 4, h: box.h - 4, rx: 6, stroke: '#94a3b8', sw: 1, dash: true })
        }
        const hl = headerLines[i]
        const th = headerTextH(hl, fs)
        let textColor = ink
        if (style === 'label') {
          prims.push({ t: 'rect', x: header.x + 4, y: header.y + 4, w: header.w - 8, h: header.h - 8, rx: 6, fill: theme.roles.population.fill, stroke: theme.roles.population.stroke, sw: 1 })
          textColor = theme.roles.population.text
        }
        let y = header.y + (header.h - th) / 2
        const cx = header.x + header.w / 2
        for (const l of hl.label) {
          prims.push({ t: 'text', x: cx, y: y + fs * 0.95, text: l, size: fs, bold: true, color: textColor, anchor: 'middle' })
          y += lineHeight(fs)
        }
        if (hl.dur.length) y += 2
        for (const l of hl.dur) {
          prims.push({ t: 'text', x: cx, y: y + (fs - 1) * 0.95, text: l, size: fs - 1, color: textColor, anchor: 'middle' })
          y += lineHeight(fs - 1)
        }
        bands.push({ phaseId: e.p.id, row: rk, box, prims })
      })

      /* timeline for this row */
      if (d.settings.showAxis) {
        const starts = ext.map((e, i) => {
          const first = !labelled.has(e.p.id)
          return { pos: bounds[i][0], label: first ? (e.p.startLabel ?? '') : '' }
        })
        const end = bounds[bounds.length - 1][1]
        const last = ri === rowKeys.length - 1
        const ticks = [...starts, { pos: end, label: last ? d.settings.axisEndLabel : '' }]
        // repeated labels (e.g. two phases both "After last dose") are shown once
        for (let i = 1; i < ticks.length; i++) if (ticks[i].label && ticks.slice(0, i).some((t) => t.label === ticks[i].label)) ticks[i] = { ...ticks[i], label: '' }
        if (rowKeys.length > 1 && ticks.every((t) => !t.label)) {
          for (const e of ext) labelled.add(e.p.id)
          return
        }
        if (LR) {
          const y = crossHi + 18
          axis.push({ t: 'line', x1: starts[0].pos, y1: y, x2: end + 4, y2: y, stroke: ink, sw: 1.5 })
          axis.push({ t: 'path', d: `M${end + 14} ${y} L${end + 2} ${y - 5} L${end + 2} ${y + 5} Z`, fill: ink })
          for (const t of ticks) {
            axis.push({ t: 'line', x1: t.pos, y1: y - 5, x2: t.pos, y2: y + 5, stroke: ink, sw: 1.5 })
            if (t.label) axis.push({ t: 'text', x: t.pos, y: y + 8 + fs, text: t.label, size: fs - 1, color: ink, anchor: t === ticks[0] ? 'start' : t.pos === end ? 'end' : 'middle' })
          }
          axisBoxes.push({ x: starts[0].pos, y: y - 6, w: end + 16 - starts[0].pos, h: fs + 18 })
        } else {
          const x = crossHi + 18
          axis.push({ t: 'line', x1: x, y1: starts[0].pos, x2: x, y2: end + 4, stroke: ink, sw: 1.5 })
          axis.push({ t: 'path', d: `M${x} ${end + 14} L${x - 5} ${end + 2} L${x + 5} ${end + 2} Z`, fill: ink })
          let maxW = 0
          for (const t of ticks) {
            axis.push({ t: 'line', x1: x - 5, y1: t.pos, x2: x + 5, y2: t.pos, stroke: ink, sw: 1.5 })
            if (t.label) {
              axis.push({ t: 'text', x: x + 9, y: t.pos + (fs - 1) * 0.35, text: t.label, size: fs - 1, color: ink })
              maxW = Math.max(maxW, measure(t.label, fs - 1))
            }
          }
          axisBoxes.push({ x: x - 6, y: starts[0].pos, w: maxW + 18, h: end + 16 - starts[0].pos })
        }
      }
      for (const e of ext) labelled.add(e.p.id)
    })
    if (axisBoxes.length) axisBox = union(axisBoxes)
  }

  /* ----------------------- time-window axis ----------------------- */
  if (d.layout === 'windows' && d.settings.showAxis) {
    const ticks = new Map<number, number>()
    for (const n of nodes) {
      if (n.type !== 'window' || !n.data.bar) continue
      const base = LR ? n.position.x : n.position.y
      const { from, to, openStart, openEnd } = n.data.bar
      if (!openStart && n.data.startDay !== null && n.data.startDay !== undefined) ticks.set(n.data.startDay, base + from)
      if (!openEnd && n.data.endDay !== null && n.data.endDay !== undefined) ticks.set(n.data.endDay, base + to)
    }
    const marker = nodes.find((n) => n.type === 'marker')
    if (marker) ticks.set(0, LR ? marker.position.x + (marker.width ?? 0) / 2 : marker.position.y + (marker.height ?? 0) / 2)
    const rows = nodes.filter((n) => n.type === 'window')
    if (rows.length && ticks.size) {
      const rb = union(rows.map(nodeBox))
      // collapse ticks that sit on the same pixel (e.g. Day −1 / Day 0 / Day 1 drawn at the index line)
      const byPos = new Map<number, number[]>()
      for (const [day, pos] of ticks) {
        const k = Math.round(pos)
        byPos.set(k, [...(byPos.get(k) ?? []), day])
      }
      const entries = [...byPos.entries()].sort((a, b) => a[0] - b[0])
      const label = (days: number[]) => (days.includes(0) ? 'Day 0' : dayLabel(days.sort((a, b) => Math.abs(a) - Math.abs(b))[0]))
      if (LR) {
        const y = rb.y + rb.h + 14
        const x1 = entries[0][0]
        const x2 = Math.max(entries[entries.length - 1][0], rb.x + rb.w)
        axis.push({ t: 'line', x1, y1: y, x2: x2 + 4, y2: y, stroke: ink, sw: 1.5 })
        axis.push({ t: 'path', d: `M${x2 + 14} ${y} L${x2 + 2} ${y - 5} L${x2 + 2} ${y + 5} Z`, fill: ink })
        for (const [pos, days] of entries) {
          axis.push({ t: 'line', x1: pos, y1: y - 5, x2: pos, y2: y + 5, stroke: ink, sw: 1.5 })
          axis.push({ t: 'text', x: pos, y: y + 8 + fs, text: label(days), size: fs - 1, bold: days.includes(0), color: ink, anchor: 'middle' })
        }
        axisBox = { x: x1 - 30, y: y - 6, w: x2 + 16 - x1 + 30, h: fs + 18 }
      } else {
        const x = rb.x + rb.w + 14
        const y1 = entries[0][0]
        const y2 = Math.max(entries[entries.length - 1][0], rb.y + rb.h)
        axis.push({ t: 'line', x1: x, y1, x2: x, y2: y2 + 4, stroke: ink, sw: 1.5 })
        axis.push({ t: 'path', d: `M${x} ${y2 + 14} L${x - 5} ${y2 + 2} L${x + 5} ${y2 + 2} Z`, fill: ink })
        let maxW = 0
        for (const [pos, days] of entries) {
          axis.push({ t: 'line', x1: x - 5, y1: pos, x2: x + 5, y2: pos, stroke: ink, sw: 1.5 })
          const l = label(days)
          axis.push({ t: 'text', x: x + 9, y: pos + (fs - 1) * 0.35, text: l, size: fs - 1, bold: days.includes(0), color: ink })
          maxW = Math.max(maxW, measure(l, fs - 1, true))
        }
        axisBox = { x: x - 6, y: y1, w: maxW + 18, h: y2 + 16 - y1 }
      }
    }
  }

  /* ------------------------ protocol timeline ------------------------ */
  if (d.layout === 'timeline' && d.timeline?.scale) {
    const sc = d.timeline.scale
    const X = (t: number) => scaleX(sc, t)
    const left = sc.x0
    const right = X(sc.tMax)
    const boxes: Box[] = []
    for (let i = 1; i < sc.laneYs.length; i++) {
      const y = sc.laneYs[i] - 4
      axis.push({ t: 'line', x1: left - 8, y1: y, x2: right + 4, y2: y, stroke: '#e2e8f0', sw: 1 })
    }
    // phase brackets
    for (const p of d.phases) {
      if (typeof p.start !== 'number') continue
      const x1 = X(p.start) + 3
      const x2 = X(typeof p.end === 'number' ? p.end : sc.tMax) - 3
      const y = sc.bracketY
      axis.push({ t: 'line', x1, y1: y, x2, y2: y, stroke: ink, sw: 1.2 })
      axis.push({ t: 'line', x1, y1: y, x2: x1, y2: y + 6, stroke: ink, sw: 1.2 })
      axis.push({ t: 'line', x1: x2, y1: y, x2, y2: y + 6, stroke: ink, sw: 1.2 })
      const label = wrap(p.label, Math.max(60, x2 - x1 - 8), fs, true)[0] ?? p.label
      axis.push({ t: 'text', x: x1 + 6, y: y - 7, text: label, size: fs, bold: true, color: ink })
      boxes.push({ x: x1, y: y - fs - 8, w: x2 - x1, h: fs + 16 })
    }
    // axis line with compressed intervals
    const ay = sc.lanesBottom + 14
    let cur = left
    for (const b of sc.breaks) {
      const g1 = X(b.from)
      const g2 = X(b.to)
      axis.push({ t: 'line', x1: cur, y1: ay, x2: g1 - 4, y2: ay, stroke: ink, sw: 1.5 })
      const cx = (g1 + g2) / 2
      for (const dx of [-3, 3]) axis.push({ t: 'line', x1: cx + dx - 3, y1: ay + 6, x2: cx + dx + 3, y2: ay - 6, stroke: ink, sw: 1.3 })
      cur = g2 + 4
    }
    axis.push({ t: 'line', x1: cur, y1: ay, x2: right, y2: ay, stroke: ink, sw: 1.5 })
    const ticks = new Set<number>([0])
    for (const n of nodes) {
      if (typeof n.data.t0 === 'number') ticks.add(n.data.t0)
      if (typeof n.data.t1 === 'number') ticks.add(n.data.t1)
    }
    for (const p of d.phases) {
      if (typeof p.start === 'number') ticks.add(p.start)
      if (typeof p.end === 'number') ticks.add(p.end)
    }
    for (const b of sc.breaks) {
      ticks.add(b.from)
      ticks.add(b.to)
    }
    const lh = lineHeight(fs - 1)
    let lastRight = -Infinity
    for (const t of [...ticks].filter((t) => t >= sc.tMin && t <= sc.tMax).sort((a, b) => a - b)) {
      const x = X(t)
      axis.push({ t: 'line', x1: x, y1: ay - 5, x2: x, y2: ay + 5, stroke: ink, sw: 1.3 })
      const label = fmtT(t)
      const w = measure(label, fs - 1)
      const second = x - w / 2 < lastRight + 4
      axis.push({ t: 'text', x, y: ay + 8 + (fs - 1) + (second ? lh : 0), text: label, size: fs - 1, color: ink, anchor: 'middle' })
      if (!second) lastRight = x + w / 2
    }
    const capY = ay + 8 + (fs - 1) + lh * 2 + 8
    axis.push({ t: 'text', x: 0, y: capY, text: `${unitLabel(d.timeline.unit)} from baseline`, size: fs - 1, color: ink })
    if (sc.breaks.length) {
      axis.push({ t: 'text', x: 0, y: capY + lh, text: `// Compressed interval${sc.breaks.length > 1 ? 's' : ''}: ${sc.breaks.map((b) => `${fmtT(b.from)}–${fmtT(b.to)}`).join(', ')}`, size: fs - 1, color: ink })
    }
    boxes.push({ x: 0, y: ay - 8, w: right + 10, h: capY + lh + 6 - (ay - 8) })
    axisBox = union(boxes)
  }

  const content = union([nb, ...bands.map((b) => b.box), ...(axisBox ? [axisBox] : [])])

  /* ------------------------ title & footnote ------------------------ */
  let title: Decor['title'] = null
  let footnote: Decor['footnote'] = null
  const tfs = fs + 4
  if (d.settings.showTitle && d.settings.title.trim()) {
    const lines = wrap(d.settings.title, Math.max(content.w, 300), tfs, true)
    const h = lines.length * lineHeight(tfs)
    const box: Box = { x: content.x, y: content.y - h - 14, w: content.w, h }
    title = {
      box,
      prims: lines.map((l, i) => ({ t: 'text' as const, x: box.x, y: box.y + i * lineHeight(tfs) + tfs * 0.95, text: l, size: tfs, bold: true, color: theme.roles.neutral.text })),
    }
  }
  if (d.settings.showFootnote && d.settings.footnote.trim()) {
    const ffs = Math.max(8, fs - 2)
    const lines = wrap(d.settings.footnote, Math.max(content.w, 300), ffs)
    const h = lines.length * lineHeight(ffs)
    const box: Box = { x: content.x, y: content.y + content.h + 14, w: content.w, h }
    footnote = {
      box,
      prims: lines.map((l, i) => ({ t: 'text' as const, x: box.x, y: box.y + i * lineHeight(ffs) + ffs * 0.95, text: l, size: ffs, color: '#475569' })),
    }
  }
  const bounds = union([content, ...(title ? [title.box] : []), ...(footnote ? [footnote.box] : [])])
  return { bands, axis, axisBox, title, footnote, content, bounds }
}

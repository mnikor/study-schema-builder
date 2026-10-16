import type { Direction, DiagramSettings, SNode, SchemaNodeData, ShapeKind } from '../types'
import type { Theme } from './catalog'
import type { Prim } from './prims'
import { lineHeight, measure, widestLine, wrap } from './text'

export const PAD_X = 10
export const PAD_Y = 8
/** Protocol timeline bar thickness and bottom padding. */
export const TL_BAR = 12
export const TL_PAD_B = 6

export interface Box {
  x: number
  y: number
  w: number
  h: number
}

/* ---------------------------- outlines ---------------------------- */

export function shapeOutline(shape: ShapeKind, w: number, h: number): { d: string; overlay?: string } {
  switch (shape) {
    case 'rect':
    case 'note': {
      if (shape === 'note') {
        const f = Math.min(14, w / 4, h / 3)
        return { d: `M0 0 H${w - f} L${w} ${f} V${h} H0 Z`, overlay: `M${w - f} 0 V${f} H${w}` }
      }
      return { d: `M0 0 H${w} V${h} H0 Z` }
    }
    case 'rounded':
    case 'pill': {
      const r = shape === 'pill' ? Math.min(h / 2, w / 2) : Math.min(8, h / 4, w / 4)
      return { d: `M${r} 0 H${w - r} A${r} ${r} 0 0 1 ${w} ${r} V${h - r} A${r} ${r} 0 0 1 ${w - r} ${h} H${r} A${r} ${r} 0 0 1 0 ${h - r} V${r} A${r} ${r} 0 0 1 ${r} 0 Z` }
    }
    case 'diamond':
      return { d: `M${w / 2} 0 L${w} ${h / 2} L${w / 2} ${h} L0 ${h / 2} Z` }
    case 'circle':
      return { d: `M0 ${h / 2} A${w / 2} ${h / 2} 0 1 1 ${w} ${h / 2} A${w / 2} ${h / 2} 0 1 1 0 ${h / 2} Z` }
    case 'hexagon': {
      const k = Math.min(w * 0.15, h * 0.45)
      return { d: `M${k} 0 H${w - k} L${w} ${h / 2} L${w - k} ${h} H${k} L0 ${h / 2} Z` }
    }
    case 'parallelogram': {
      const k = Math.min(16, w * 0.15)
      return { d: `M${k} 0 H${w} L${w - k} ${h} H0 Z` }
    }
    case 'document': {
      const a = Math.min(10, h * 0.14)
      return { d: `M0 0 H${w} V${h - a} C${w * 0.75} ${h + a * 0.6} ${w * 0.3} ${h - a * 2.4} 0 ${h - a * 0.6} Z` }
    }
    case 'cylinder': {
      const ry = Math.min(9, h * 0.16)
      return {
        d: `M0 ${ry} A${w / 2} ${ry} 0 0 1 ${w} ${ry} V${h - ry} A${w / 2} ${ry} 0 0 1 0 ${h - ry} Z`,
        overlay: `M0 ${ry} A${w / 2} ${ry} 0 0 0 ${w} ${ry}`,
      }
    }
  }
}

export function innerBox(shape: ShapeKind, w: number, h: number): Box {
  switch (shape) {
    case 'diamond':
      return { x: w * 0.25, y: h * 0.25, w: w * 0.5, h: h * 0.5 }
    case 'circle':
      return { x: w * 0.15, y: h * 0.15, w: w * 0.7, h: h * 0.7 }
    case 'pill': {
      const k = Math.min(h / 2, w / 4) * 0.6
      return { x: k, y: 0, w: w - 2 * k, h }
    }
    case 'hexagon': {
      const k = Math.min(w * 0.15, h * 0.45) * 0.7
      return { x: k, y: 0, w: w - 2 * k, h }
    }
    case 'parallelogram': {
      const k = Math.min(16, w * 0.15)
      return { x: k * 0.8, y: 0, w: w - k * 1.6, h }
    }
    case 'document': {
      const a = Math.min(10, h * 0.14)
      return { x: 0, y: 0, w, h: h - a * 1.2 }
    }
    case 'cylinder': {
      const ry = Math.min(9, h * 0.16)
      return { x: 0, y: ry * 2, w, h: h - ry * 3 }
    }
    default:
      return { x: 0, y: 0, w, h }
  }
}

const tightShape = (s: ShapeKind) => s === 'diamond' || s === 'circle'

/* ----------------------------- styles ----------------------------- */

export interface ResolvedStyle {
  fill: string
  stroke: string
  text: string
  sw: number
  dash: boolean
  fontSize: number
  align: 'left' | 'center'
}

export function resolveStyle(data: SchemaNodeData, theme: Theme, settings: Pick<DiagramSettings, 'fontSize'>): ResolvedStyle {
  const base = theme.roles[data.role] ?? theme.roles.neutral
  const s = data.style ?? {}
  return {
    fill: s.fill ?? base.fill,
    stroke: s.stroke ?? base.stroke,
    text: s.text ?? base.text,
    sw: s.strokeWidth ?? (data.role === 'exclusion' || data.role === 'note' ? 1 : 1.5),
    dash: s.dashed ?? data.role === 'note',
    fontSize: s.fontSize ?? settings.fontSize,
    align: s.align ?? (data.side || data.role === 'exclusion' || data.role === 'note' ? 'left' : 'center'),
  }
}

/* ------------------------------ text ------------------------------ */

interface TextBlock {
  label: string[]
  detail: string[]
  height: number
  width: number
  fs: number
}

function textBlock(data: SchemaNodeData, maxW: number, fs: number): TextBlock {
  const label = data.label ? wrap(data.label, maxW, fs, true) : []
  const detail = data.detail ? wrap(data.detail, maxW, fs - 1, false) : []
  const height = label.length * lineHeight(fs) + (detail.length ? (label.length ? 3 : 0) + detail.length * lineHeight(fs - 1) : 0)
  const width = Math.max(widestLine(label, fs, true), widestLine(detail, fs - 1))
  return { label, detail, height, width, fs }
}

function textPrims(block: TextBlock, box: Box, st: ResolvedStyle, padX: number): Prim[] {
  const out: Prim[] = []
  const { fs } = block
  let y = box.y + (box.h - block.height) / 2
  const anchor = st.align === 'left' ? 'start' : 'middle'
  const x = st.align === 'left' ? box.x + padX : box.x + box.w / 2
  const push = (text: string, size: number, bold: boolean) => {
    const lh = lineHeight(size)
    out.push({ t: 'text', x, y: y + (lh - size) / 2 + size * 0.84, text, size, bold, color: st.text, anchor })
    y += lh
  }
  for (const l of block.label) push(l, fs, true)
  if (block.label.length && block.detail.length) y += 3
  for (const l of block.detail) push(l, fs - 1, false)
  return out
}

/* ----------------------------- sizing ----------------------------- */

export function defaultWidth(data: SchemaNodeData, dir: Direction, settings: DiagramSettings) {
  const base = settings.nodeWidth || (dir === 'LR' ? 190 : 250)
  if (data.side) return dir === 'LR' ? Math.max(180, base) : Math.max(200, base * 0.9)
  if (data.shape === 'diamond') return Math.round(base * 0.85)
  return base
}

/** Width and height a node needs for its text at the current settings. */
export function autoSize(node: SNode, dir: Direction, settings: DiagramSettings, theme: Theme): { width: number; height: number } {
  const data = node.data
  if (node.type === 'window' || node.type === 'marker' || node.type === 'segment' || node.type === 'text') return { width: node.width ?? 200, height: node.height ?? 40 }
  const st = resolveStyle(data, theme, settings)
  const fs = st.fontSize
  if (data.shape === 'circle') {
    const probe = textBlock(data, 400, fs)
    const size = Math.ceil(Math.max(58, (probe.width + 6) / 0.7, (probe.height + 6) / 0.7))
    if (node.data.fixedSize && node.width && node.height) return { width: node.width, height: node.height }
    return { width: size, height: size }
  }
  const width = data.fixedSize && node.width ? node.width : defaultWidth(data, dir, settings)
  if (data.fixedSize && node.height) return { width, height: node.height }
  const pad = tightShape(data.shape) ? 2 : PAD_X
  let height = 44
  for (let i = 0; i < 3; i++) {
    const inner = innerBox(data.shape, width, height)
    const block = textBlock(data, inner.w - pad * 2, fs)
    const need = block.height + PAD_Y * 2
    const forShape =
      data.shape === 'diamond' ? need / 0.5 : data.shape === 'document' ? need + 12 : data.shape === 'cylinder' ? need + 27 : need
    height = Math.max(data.shape === 'diamond' ? width * 0.55 : 40, Math.ceil(forShape))
  }
  return { width, height }
}

/* --------------------------- node prims --------------------------- */

export function shapeNodePrims(node: SNode, theme: Theme, settings: DiagramSettings): Prim[] {
  const w = node.width ?? 180
  const h = node.height ?? 60
  const st = resolveStyle(node.data, theme, settings)
  const o = shapeOutline(node.data.shape, w, h)
  const out: Prim[] = [{ t: 'path', d: o.d, fill: st.fill, stroke: st.stroke, sw: st.sw, dash: st.dash }]
  if (o.overlay) out.push({ t: 'path', d: o.overlay, stroke: st.stroke, sw: st.sw })
  const inner = innerBox(node.data.shape, w, h)
  const pad = tightShape(node.data.shape) ? 2 : PAD_X
  const block = textBlock(node.data, inner.w - pad * 2, st.fontSize)
  out.push(...textPrims(block, inner, st, pad))
  return out
}

/** Time-window row: label column + bar on the time scale. */
export function windowNodePrims(node: SNode, theme: Theme, settings: DiagramSettings, dir: Direction): Prim[] {
  const w = node.width ?? 400
  const h = node.height ?? 44
  const st = resolveStyle(node.data, theme, settings)
  const bar = node.data.bar ?? { from: 0, to: 100, openStart: false, openEnd: false, labelSize: 150 }
  const fs = st.fontSize
  const out: Prim[] = []
  const labelSt = { ...st, text: theme.roles.neutral.text, align: 'left' as const }
  if (dir === 'LR') {
    const block = textBlock({ ...node.data, detail: undefined }, bar.labelSize - 12, fs)
    out.push(...textPrims(block, { x: 0, y: 0, w: bar.labelSize, h }, labelSt, 0))
    const bx = bar.from
    const bw = Math.max(6, bar.to - bar.from)
    const by = 6
    const bh = h - 12
    out.push({ t: 'rect', x: bx, y: by, w: bw, h: bh, rx: 4, fill: st.fill, stroke: st.stroke, sw: st.sw, dash: st.dash })
    if (bar.openEnd) out.push({ t: 'path', d: `M${bx + bw} ${by} L${bx + bw + 12} ${by + bh / 2} L${bx + bw} ${by + bh} Z`, fill: st.stroke })
    if (bar.openStart) out.push({ t: 'path', d: `M${bx} ${by} L${bx - 12} ${by + bh / 2} L${bx} ${by + bh} Z`, fill: st.stroke })
    if (node.data.detail) {
      const tw = measure(node.data.detail, fs - 1)
      const inside = tw + 12 <= bw
      const color = inside ? st.text : theme.roles.neutral.text
      const tx = inside ? bx + bw / 2 : bx + bw + (bar.openEnd ? 18 : 6)
      const fitsRight = tx + tw <= w + 4
      out.push({
        t: 'text',
        x: inside ? tx : fitsRight ? tx : bx - (bar.openStart ? 18 : 6),
        y: h / 2 + (fs - 1) * 0.35,
        text: node.data.detail,
        size: fs - 1,
        color,
        anchor: inside ? 'middle' : fitsRight ? 'start' : 'end',
      })
    }
  } else {
    const block = textBlock({ ...node.data, detail: undefined }, w - 8, fs)
    out.push(...textPrims(block, { x: 0, y: 0, w, h: bar.labelSize }, { ...labelSt, align: 'center' }, 4))
    const by = bar.from
    const bh = Math.max(6, bar.to - bar.from)
    const bx = 8
    const bw = w - 16
    out.push({ t: 'rect', x: bx, y: by, w: bw, h: bh, rx: 4, fill: st.fill, stroke: st.stroke, sw: st.sw, dash: st.dash })
    if (bar.openEnd) out.push({ t: 'path', d: `M${bx} ${by + bh} L${bx + bw / 2} ${by + bh + 12} L${bx + bw} ${by + bh} Z`, fill: st.stroke })
    if (bar.openStart) out.push({ t: 'path', d: `M${bx} ${by} L${bx + bw / 2} ${by - 12} L${bx + bw} ${by} Z`, fill: st.stroke })
    if (node.data.detail) {
      const lines = wrap(node.data.detail, bw - 8, fs - 1)
      const th = lines.length * lineHeight(fs - 1)
      const inside = th + 8 <= bh
      let y = inside ? by + (bh - th) / 2 : by + bh + (bar.openEnd ? 16 : 4)
      for (const l of lines) {
        out.push({ t: 'text', x: w / 2, y: y + (fs - 1) * 0.95, text: l, size: fs - 1, color: inside ? st.text : theme.roles.neutral.text, anchor: 'middle' })
        y += lineHeight(fs - 1)
      }
    }
  }
  return out
}

/** Index-date marker: a dashed line across the window rows with its label. */
export function markerNodePrims(node: SNode, theme: Theme, settings: DiagramSettings, dir: Direction): Prim[] {
  const w = node.width ?? 160
  const h = node.height ?? 200
  const st = resolveStyle(node.data, theme, settings)
  const fs = st.fontSize
  const color = node.data.style?.stroke ?? theme.axis
  const out: Prim[] = []
  const labelH = (node.data.bar?.labelSize ?? 40) - 6
  if (dir === 'LR') {
    const lines = wrap(node.data.label, w - 4, fs, true)
    let y = labelH - lines.length * lineHeight(fs) - (node.data.labelLift ?? 0)
    for (const l of lines) {
      out.push({ t: 'text', x: w / 2, y: y + fs * 0.95, text: l, size: fs, bold: true, color: st.text, anchor: 'middle' })
      y += lineHeight(fs)
    }
    out.push({ t: 'line', x1: w / 2, y1: labelH + 4, x2: w / 2, y2: h, stroke: color, sw: 2, dash: true })
  } else {
    const lines = wrap(node.data.label, labelH, fs, true)
    let y = h / 2 - (lines.length * lineHeight(fs)) / 2
    for (const l of lines) {
      out.push({ t: 'text', x: labelH, y: y + fs * 0.95, text: l, size: fs, bold: true, color: st.text, anchor: 'end' })
      y += lineHeight(fs)
    }
    out.push({ t: 'line', x1: labelH + 8, y1: h / 2, x2: w, y2: h / 2, stroke: color, sw: 2, dash: true })
  }
  return out
}

/** Timeline bar: label above, solid bar below; compressed intervals shown as // gaps; open end as an arrow. */
export function segmentNodePrims(node: SNode, theme: Theme, settings: DiagramSettings): Prim[] {
  const w = node.width ?? 100
  const h = node.height ?? 40
  const fs = node.data.style?.fontSize ?? settings.fontSize
  const color = node.data.style?.fill ?? (theme.roles[node.data.role] ?? theme.roles.neutral).stroke
  const ink = node.data.style?.text ?? theme.roles.neutral.text
  const barY = h - TL_PAD_B - TL_BAR
  const out: Prim[] = []
  if (node.data.label) out.push({ t: 'text', x: (node.data.labelOffset ?? 0) + 2, y: barY - 7, text: node.data.label, size: fs, bold: true, color: ink, halo: '#ffffff' })
  const cuts = [...(node.data.cuts ?? [])].sort((a, b) => a.a - b.a)
  const open = node.data.t1 === null
  const end = open ? Math.max(0, w - 10) : w
  let x = 0
  for (const c of [...cuts, { a: end, b: end }]) {
    if (c.a > x) out.push({ t: 'rect', x, y: barY, w: c.a - x, h: TL_BAR, fill: color })
    x = c.b
  }
  for (const c of cuts) {
    const cx = c.a <= 0.5 ? c.b / 2 : c.b >= w - 0.5 ? (c.a + w) / 2 : (c.a + c.b) / 2
    for (const dx of [-3, 3]) out.push({ t: 'line', x1: cx + dx - 3, y1: barY + TL_BAR + 2, x2: cx + dx + 3, y2: barY - 2, stroke: ink, sw: 1.3 })
  }
  if (open) out.push({ t: 'path', d: `M${end} ${barY - 3} L${w} ${barY + TL_BAR / 2} L${end} ${barY + TL_BAR + 3} Z`, fill: color })
  return out
}

/** Plain text (timeline lane labels, ratios): bold label + detail, top-left aligned. */
export function textNodePrims(node: SNode, theme: Theme, settings: DiagramSettings): Prim[] {
  const w = node.width ?? 120
  const fs = node.data.style?.fontSize ?? settings.fontSize
  const color = node.data.style?.text ?? theme.roles.neutral.text
  const out: Prim[] = []
  let y = 0
  for (const l of wrap(node.data.label, w, fs, true)) {
    out.push({ t: 'text', x: 0, y: y + fs * 0.95, text: l, size: fs, bold: true, color })
    y += lineHeight(fs)
  }
  if (node.data.detail) for (const l of wrap(node.data.detail, w, fs - 1)) {
    out.push({ t: 'text', x: 0, y: y + (fs - 1) * 0.95, text: l, size: fs - 1, color })
    y += lineHeight(fs - 1)
  }
  return out
}

export function nodePrims(node: SNode, theme: Theme, settings: DiagramSettings, dir: Direction): Prim[] {
  switch (node.type) {
    case 'segment':
      return segmentNodePrims(node, theme, settings)
    case 'text':
      return textNodePrims(node, theme, settings)
    case 'window':
      return windowNodePrims(node, theme, settings, dir)
    case 'marker':
      return markerNodePrims(node, theme, settings, dir)
    default:
      return shapeNodePrims(node, theme, settings)
  }
}

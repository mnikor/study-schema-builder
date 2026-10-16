import { Position, getBezierPath, getSmoothStepPath, getStraightPath } from '@xyflow/react'
import type { SEdge, SNode, SchemaEdgeData } from '../types'
import { TL_BAR, TL_PAD_B } from './shapes'

export type Side = 't' | 'r' | 'b' | 'l' | 'start' | 'startTop' | 'end'
export type BoxSide = 't' | 'r' | 'b' | 'l'
export const SIDES: BoxSide[] = ['t', 'r', 'b', 'l']
export const sidePosition: Record<Side, Position> = { t: Position.Top, r: Position.Right, b: Position.Bottom, l: Position.Left, start: Position.Left, startTop: Position.Top, end: Position.Bottom }

/** Timeline bar anchors (local coordinates): bar start (left / top) and a drop point near the bar end. */
export function segmentAnchors(w: number, h: number) {
  const barY = h - TL_PAD_B - TL_BAR
  return { start: { x: 0, y: barY + TL_BAR / 2 }, startTop: { x: 0, y: barY }, end: { x: w > 90 ? w - 40 : w / 2, y: barY + TL_BAR } }
}

export function handlePoint(node: SNode, side: Side) {
  const w = node.width ?? 0
  const h = node.height ?? 0
  const { x, y } = node.position
  if (side === 'start' || side === 'startTop' || side === 'end') {
    const a = segmentAnchors(w, h)[side]
    return { x: x + a.x, y: y + a.y }
  }
  switch (side) {
    case 't':
      return { x: x + w / 2, y }
    case 'b':
      return { x: x + w / 2, y: y + h }
    case 'l':
      return { x, y: y + h / 2 }
    case 'r':
      return { x: x + w, y: y + h / 2 }
  }
}

export interface PathInput {
  sx: number
  sy: number
  sp: Position
  tx: number
  ty: number
  tp: Position
  data?: SchemaEdgeData
}

export function edgePath({ sx, sy, sp, tx, ty, tp, data }: PathInput): { d: string; labelX: number; labelY: number; centerX: number; centerY: number } {
  const kind = data?.path ?? 'step'
  if (data?.wrap && kind === 'step') return wrapPath(sx, sy, sp, tx, ty, data)
  if (data?.lshape && kind === 'step') return lPath(sx, sy, tx, ty, data)
  if (kind === 'straight') {
    const [d, labelX, labelY] = getStraightPath({ sourceX: sx, sourceY: sy, targetX: tx, targetY: ty })
    return { d, labelX, labelY, centerX: labelX, centerY: labelY }
  }
  if (kind === 'bezier') {
    const [d, labelX, labelY] = getBezierPath({ sourceX: sx, sourceY: sy, sourcePosition: sp, targetX: tx, targetY: ty, targetPosition: tp })
    return { d, labelX, labelY, centerX: labelX, centerY: labelY }
  }
  const base = { sourceX: sx, sourceY: sy, sourcePosition: sp, targetX: tx, targetY: ty, targetPosition: tp, borderRadius: 6 }
  const [, cx, cy] = getSmoothStepPath(base)
  const off = data?.offset
  const centerX = cx + (off?.x ?? 0)
  const centerY = cy + (off?.y ?? 0)
  const [d, labelX, labelY] = off ? getSmoothStepPath({ ...base, centerX, centerY }) : getSmoothStepPath(base)
  return { d, labelX: off ? centerX : labelX, labelY: off ? centerY : labelY, centerX, centerY }
}

export function edgeGeometry(edge: SEdge, byId: Map<string, SNode>) {
  const s = byId.get(edge.source)
  const t = byId.get(edge.target)
  if (!s || !t) return null
  const ss = (edge.sourceHandle as Side) || 'r'
  const ts = (edge.targetHandle as Side) || 'l'
  const a = handlePoint(s, ss)
  const b = handlePoint(t, ts)
  const g = edgePath({ sx: a.x, sy: a.y, sp: sidePosition[ss], tx: b.x, ty: b.y, tp: sidePosition[ts], data: edge.data })
  return { ...g, points: pathToPoints(g.d) }
}

/** Convert an SVG path (M/L/Q/C) to a simplified polyline; Q corners collapse to their control point. */
export function pathToPoints(d: string): { x: number; y: number }[] {
  const tokens = d.match(/[a-zA-Z]|-?\d*\.?\d+(?:e[-+]?\d+)?/g) ?? []
  const pts: { x: number; y: number }[] = []
  let i = 0
  let cmd = ''
  const num = () => parseFloat(tokens[i++])
  while (i < tokens.length) {
    if (/[a-zA-Z]/.test(tokens[i])) cmd = tokens[i++]
    if (cmd === 'M' || cmd === 'L') pts.push({ x: num(), y: num() })
    else if (cmd === 'Q') {
      const cx = num()
      const cy = num()
      num()
      num()
      pts.push({ x: cx, y: cy })
    } else if (cmd === 'C') {
      const p0 = pts[pts.length - 1] ?? { x: 0, y: 0 }
      const c1 = { x: num(), y: num() }
      const c2 = { x: num(), y: num() }
      const p3 = { x: num(), y: num() }
      for (let k = 1; k <= 16; k++) {
        const t = k / 16
        const u = 1 - t
        pts.push({
          x: u * u * u * p0.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * p3.x,
          y: u * u * u * p0.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * p3.y,
        })
      }
    } else i++
  }
  // drop duplicates and collinear midpoints (only for axis-aligned runs)
  const out: { x: number; y: number }[] = []
  for (const p of pts) {
    const last = out[out.length - 1]
    if (last && Math.abs(last.x - p.x) < 0.01 && Math.abs(last.y - p.y) < 0.01) continue
    if (out.length >= 2) {
      const a = out[out.length - 2]
      const b = out[out.length - 1]
      const sameX = Math.abs(a.x - b.x) < 0.01 && Math.abs(b.x - p.x) < 0.01
      const sameY = Math.abs(a.y - b.y) < 0.01 && Math.abs(b.y - p.y) < 0.01
      if (sameX || sameY) {
        out[out.length - 1] = p
        continue
      }
    }
    out.push(p)
  }
  return out
}

/** Row-to-row connector: leave the source, run along the lane between rows, enter the next row from outside. */
function wrapPath(sx: number, sy: number, sp: Position, tx: number, ty: number, data: SchemaEdgeData) {
  const LR = sp === Position.Bottom
  const off = data.offset ?? { x: 0, y: 0 }
  const lane = data.wrap!.lane + (LR ? off.y : off.x)
  const pts = LR
    ? [{ x: sx, y: sy }, { x: sx, y: lane }, { x: tx - 24, y: lane }, { x: tx - 24, y: ty }, { x: tx, y: ty }]
    : [{ x: sx, y: sy }, { x: lane, y: sy }, { x: lane, y: ty - 24 }, { x: tx, y: ty - 24 }, { x: tx, y: ty }]
  const r = 6
  let d = `M${pts[0].x} ${pts[0].y}`
  for (let i = 1; i < pts.length - 1; i++) {
    const a = pts[i - 1]
    const b = pts[i]
    const c = pts[i + 1]
    const l1 = Math.hypot(b.x - a.x, b.y - a.y)
    const l2 = Math.hypot(c.x - b.x, c.y - b.y)
    const k = Math.min(r, l1 / 2, l2 / 2)
    const p1 = { x: b.x - ((b.x - a.x) / (l1 || 1)) * k, y: b.y - ((b.y - a.y) / (l1 || 1)) * k }
    const p2 = { x: b.x + ((c.x - b.x) / (l2 || 1)) * k, y: b.y + ((c.y - b.y) / (l2 || 1)) * k }
    d += ` L${p1.x} ${p1.y} Q${b.x} ${b.y} ${p2.x} ${p2.y}`
  }
  d += ` L${tx} ${ty}`
  const mid = { x: (pts[1].x + pts[2].x) / 2, y: (pts[1].y + pts[2].y) / 2 }
  return { d, labelX: mid.x, labelY: mid.y, centerX: mid.x, centerY: mid.y }
}

/** Timeline move: straight down from the source, then across into the target (or straight down when aligned). */
function lPath(sx: number, sy: number, tx: number, ty: number, data: SchemaEdgeData) {
  const off = data.offset?.x ?? 0
  const x = sx + off
  if (Math.abs(tx - x) < 1) return { d: `M${sx} ${sy} L${tx} ${ty}`, labelX: tx, labelY: (sy + ty) / 2, centerX: tx, centerY: (sy + ty) / 2 }
  const r = Math.min(6, Math.abs(ty - sy) / 2, Math.abs(tx - x) / 2)
  const dir = tx > x ? 1 : -1
  const start = off ? `M${sx} ${sy} L${x} ${sy}` : `M${sx} ${sy}`
  const d = `${start} L${x} ${ty - r} Q${x} ${ty} ${x + dir * r} ${ty} L${tx} ${ty}`
  return { d, labelX: x, labelY: (sy + ty) / 2, centerX: x, centerY: (sy + ty) / 2 }
}

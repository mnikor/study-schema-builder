import type { Diagram, SEdge, SNode } from '../types'
import type { Theme } from '../lib/catalog'
import { computeDecor, type Decor } from '../lib/decor'
import { edgeGeometry } from '../lib/edges'
import type { Prim } from '../lib/prims'
import { nodePrims } from '../lib/shapes'
import { measure } from '../lib/text'

export interface SceneEdge {
  edge: SEdge
  d: string
  points: { x: number; y: number }[]
  color: string
  sw: number
  dash: boolean
  arrowEnd: boolean
  arrowStart: boolean
  label?: { x: number; y: number; w: number; h: number; text: string; size: number }
}

export interface SceneNode {
  node: SNode
  prims: Prim[]
}

export interface Scene {
  diagram: Diagram
  decor: Decor
  /** viewBox with padding */
  x: number
  y: number
  w: number
  h: number
  edges: SceneEdge[]
  nodes: SceneNode[]
}

export function buildScene(d: Diagram, theme: Theme, pad = 20): Scene {
  const decor = computeDecor(d, theme)
  const byId = new Map(d.nodes.map((n) => [n.id, n]))
  const fs = d.settings.fontSize
  const edges: SceneEdge[] = []
  for (const e of d.edges) {
    const g = edgeGeometry(e, byId)
    if (!g) continue
    const text = e.data?.label?.trim()
    const size = fs - 2
    edges.push({
      edge: e,
      d: g.d,
      points: g.points,
      color: e.data?.color ?? theme.edge,
      sw: e.data?.width ?? 1.5,
      dash: !!e.data?.dashed,
      arrowEnd: e.data?.arrowEnd !== false,
      arrowStart: !!e.data?.arrowStart,
      label: text ? { x: g.labelX, y: g.labelY, w: measure(text, size) + 10, h: size + 8, text, size } : undefined,
    })
  }
  const nodes = d.nodes.map((n) => ({ node: n, prims: nodePrims(n, theme, d.settings, d.direction) }))
  const b = decor.bounds
  // include edge label and edge path extents
  let x1 = b.x
  let y1 = b.y
  let x2 = b.x + b.w
  let y2 = b.y + b.h
  for (const e of edges) {
    for (const p of e.points) {
      x1 = Math.min(x1, p.x)
      y1 = Math.min(y1, p.y)
      x2 = Math.max(x2, p.x)
      y2 = Math.max(y2, p.y)
    }
    if (e.label) {
      x1 = Math.min(x1, e.label.x - e.label.w / 2)
      x2 = Math.max(x2, e.label.x + e.label.w / 2)
    }
  }
  return { diagram: d, decor, x: x1 - pad, y: y1 - pad, w: x2 - x1 + pad * 2, h: y2 - y1 + pad * 2, edges, nodes }
}

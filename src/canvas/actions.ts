/** Editing actions shared by the canvas, inspector, palette and keyboard shortcuts. */
import type { Diagram, Role, SEdge, SNode, ShapeKind } from '../types'
import { themeById } from '../lib/catalog'
import type { BoxSide as Side } from '../lib/edges'
import { uid } from '../lib/generate'
import { fresh } from '../lib/layout'
import { autoSize } from '../lib/shapes'
import { useStore } from '../store'

export const SHAPE_PRESETS: { shape: ShapeKind; role: Role; label: string; title: string }[] = [
  { shape: 'rounded', role: 'neutral', label: 'Step', title: 'Rounded box' },
  { shape: 'rect', role: 'neutral', label: 'Box', title: 'Box' },
  { shape: 'pill', role: 'event', label: 'Event', title: 'Start / end / event' },
  { shape: 'diamond', role: 'allocation', label: 'Decision', title: 'Decision / allocation' },
  { shape: 'circle', role: 'allocation', label: 'R', title: 'Randomisation' },
  { shape: 'cylinder', role: 'data', label: 'Data source', title: 'Data source' },
  { shape: 'document', role: 'neutral', label: 'Document', title: 'Document / CRF' },
  { shape: 'hexagon', role: 'treatment', label: 'Process', title: 'Process / preparation' },
  { shape: 'parallelogram', role: 'data', label: 'Input', title: 'Input / output' },
  { shape: 'note', role: 'note', label: 'Note', title: 'Note' },
]

const active = () => {
  const s = useStore.getState()
  return s.project.diagrams.find((d) => d.id === s.project.activeId)!
}

function sized(n: SNode, d: Diagram): SNode {
  const theme = themeById(useStore.getState().project.themeId)
  return { ...n, ...autoSize(n, d.direction, d.settings, theme) }
}

export function addNode(shape: ShapeKind, role: Role, label: string, center: { x: number; y: number }) {
  const d = active()
  const raw: SNode = { id: uid('n'), type: 'shape', position: { x: 0, y: 0 }, data: { label, shape, role }, selected: true }
  const n = sized(raw, d)
  n.position = { x: Math.round(center.x - (n.width ?? 0) / 2), y: Math.round(center.y - (n.height ?? 0) / 2) }
  useStore.getState().updateDiagram((dd) => ({ ...dd, edited: true, nodes: [...dd.nodes.map((x) => ({ ...x, selected: false })), n], edges: dd.edges.map((e) => ({ ...e, selected: false })) }), 'add-node')
  return n.id
}

const OPPOSITE: Record<Side, Side> = { t: 'b', b: 't', l: 'r', r: 'l' }

export function addConnected(fromId: string, side: Side) {
  const d = active()
  const src = d.nodes.find((n) => n.id === fromId)
  if (!src) return
  const raw: SNode = {
    id: uid('n'),
    type: 'shape',
    position: { x: 0, y: 0 },
    data: { label: 'New step', shape: src.data.shape === 'circle' || src.data.shape === 'diamond' ? 'rounded' : src.data.shape, role: src.data.role === 'allocation' ? 'neutral' : src.data.role, phase: src.data.phase, side: side === (d.direction === 'LR' ? 'b' : 'r') ? true : undefined },
    selected: true,
  }
  const n = sized(raw, d)
  const gap = d.settings.rankGap
  const sw = src.width ?? 0
  const sh = src.height ?? 0
  const nw = n.width ?? 0
  const nh = n.height ?? 0
  const cx = src.position.x + sw / 2
  const cy = src.position.y + sh / 2
  n.position =
    side === 'r'
      ? { x: src.position.x + sw + gap, y: cy - nh / 2 }
      : side === 'l'
        ? { x: src.position.x - gap - nw, y: cy - nh / 2 }
        : side === 'b'
          ? { x: cx - nw / 2, y: src.position.y + sh + gap }
          : { x: cx - nw / 2, y: src.position.y - gap - nh }
  // nudge away from overlaps
  const hits = (p: { x: number; y: number }) => d.nodes.some((o) => p.x < o.position.x + (o.width ?? 0) + 8 && o.position.x < p.x + nw + 8 && p.y < o.position.y + (o.height ?? 0) + 8 && o.position.y < p.y + nh + 8)
  for (let i = 0; i < 12 && hits(n.position); i++) {
    n.position = side === 'r' || side === 'l' ? { x: n.position.x, y: n.position.y + nh + d.settings.nodeGap } : { x: n.position.x + nw + d.settings.nodeGap, y: n.position.y }
  }
  const e: SEdge = { id: uid('e'), source: src.id, target: n.id, sourceHandle: side, targetHandle: OPPOSITE[side], type: 'schema', data: { path: 'step', arrowEnd: true } }
  useStore.getState().updateDiagram((dd) => ({ ...dd, edited: true, nodes: [...dd.nodes.map((x) => ({ ...x, selected: false })), n], edges: [...dd.edges, e] }), 'add-connected')
  useStore.setState({ editingNode: n.id })
}

let clipboard: { nodes: SNode[]; edges: SEdge[] } | null = null

export function copySelection() {
  const d = active()
  const nodes = d.nodes.filter((n) => n.selected)
  if (!nodes.length) return false
  const ids = new Set(nodes.map((n) => n.id))
  clipboard = { nodes, edges: d.edges.filter((e) => ids.has(e.source) && ids.has(e.target)) }
  return true
}

export function paste(offset = 30) {
  if (!clipboard) return
  const map = new Map<string, string>()
  const nodes = clipboard.nodes.map((n) => {
    const id = uid('n')
    map.set(n.id, id)
    return { ...n, id, selected: true, position: { x: n.position.x + offset, y: n.position.y + offset }, data: { ...n.data } }
  })
  const edges = clipboard.edges.map((e) => ({ ...e, id: uid('e'), source: map.get(e.source)!, target: map.get(e.target)!, selected: false }))
  useStore.getState().updateDiagram((dd) => ({ ...dd, edited: true, nodes: [...dd.nodes.map((x) => ({ ...x, selected: false })), ...nodes], edges: [...dd.edges, ...edges] }), 'paste')
  clipboard = { nodes: nodes.map((n) => ({ ...n, selected: false })), edges }
}

export function duplicateSelection() {
  if (copySelection()) paste(24)
}

export function deleteSelection() {
  useStore.getState().updateDiagram((d) => {
    const gone = new Set(d.nodes.filter((n) => n.selected).map((n) => n.id))
    return { ...d, edited: true, nodes: d.nodes.filter((n) => !gone.has(n.id)), edges: d.edges.filter((e) => !e.selected && !gone.has(e.source) && !gone.has(e.target)) }
  }, 'delete')
}

export type AlignMode = 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom' | 'hdist' | 'vdist' | 'samew'

export function alignSelection(mode: AlignMode) {
  useStore.getState().updateDiagram((d) => {
    const sel = d.nodes.filter((n) => n.selected)
    if (sel.length < 2) return d
    const W = (n: SNode) => n.width ?? 0
    const H = (n: SNode) => n.height ?? 0
    const minX = Math.min(...sel.map((n) => n.position.x))
    const maxX = Math.max(...sel.map((n) => n.position.x + W(n)))
    const minY = Math.min(...sel.map((n) => n.position.y))
    const maxY = Math.max(...sel.map((n) => n.position.y + H(n)))
    const pos = new Map<string, { x: number; y: number }>()
    const size = new Map<string, number>()
    if (mode === 'hdist' || mode === 'vdist') {
      const horiz = mode === 'hdist'
      const sorted = [...sel].sort((a, b) => (horiz ? a.position.x - b.position.x : a.position.y - b.position.y))
      const total = sorted.reduce((s, n) => s + (horiz ? W(n) : H(n)), 0)
      const gap = ((horiz ? maxX - minX : maxY - minY) - total) / (sorted.length - 1)
      let cur = horiz ? minX : minY
      for (const n of sorted) {
        pos.set(n.id, horiz ? { x: cur, y: n.position.y } : { x: n.position.x, y: cur })
        cur += (horiz ? W(n) : H(n)) + gap
      }
    } else if (mode === 'samew') {
      const w = Math.max(...sel.map(W))
      for (const n of sel) size.set(n.id, w)
    } else {
      for (const n of sel) {
        const p = { ...n.position }
        if (mode === 'left') p.x = minX
        if (mode === 'right') p.x = maxX - W(n)
        if (mode === 'hcenter') p.x = (minX + maxX) / 2 - W(n) / 2
        if (mode === 'top') p.y = minY
        if (mode === 'bottom') p.y = maxY - H(n)
        if (mode === 'vcenter') p.y = (minY + maxY) / 2 - H(n) / 2
        pos.set(n.id, p)
      }
    }
    return {
      ...d,
      edited: true,
      nodes: d.nodes.map((n) => {
        if (size.has(n.id)) return { ...n, width: size.get(n.id), data: { ...n.data, fixedSize: true } }
        return pos.has(n.id) ? { ...n, position: { x: Math.round(pos.get(n.id)!.x), y: Math.round(pos.get(n.id)!.y) } } : n
      }),
    }
  }, 'align')
}

/** Apply text edits to a node and re-size it to fit. */
export function setNodeText(id: string, label: string, detail: string | undefined) {
  const theme = themeById(useStore.getState().project.themeId)
  useStore.getState().updateDiagram(
    (d) => ({
      ...d,
      edited: true,
      nodes: d.nodes.map((n) => {
        if (n.id !== id) return n
        const next = { ...n, data: { ...n.data, label, detail: detail || undefined } }
        return { ...fresh(next), ...autoSize(next, d.direction, d.settings, theme) }
      }),
    }),
    `text:${id}`,
  )
}

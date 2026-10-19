import ELK from 'elkjs/lib/elk.bundled.js'
import type { Diagram, Direction, PageId, PageOrientation, SEdge, SNode } from '../types'
import { PAGES, type Theme } from './catalog'
import { computeDecor, headerSizeFor, hasBands, axisSpaceFor } from './decor'
import type { Side } from './edges'
import { autoSize } from './shapes'
import { layoutTimeline } from './timeline'
import { lineHeight, measure, wrap } from './text'

const elk = new ELK()
const SIDE_CROSS = 36
const SIDE_MAIN_GAP = 14

type Box = { x: number; y: number; w: number; h: number }
const box = (n: SNode): Box => ({ x: n.position.x, y: n.position.y, w: n.width ?? 0, h: n.height ?? 0 })
const overlaps = (a: Box, b: Box, m = 4) => a.x < b.x + b.w + m && b.x < a.x + a.w + m && a.y < b.y + b.h + m && b.y < a.y + a.h + m

/** Drop React Flow's cached measurement so new width/height (and handle positions) are re-read. */
export function fresh(n: SNode): SNode {
  const { measured: _m, ...rest } = n
  return rest
}

const naturalOrient = (dir: Direction): PageOrientation => (dir === 'LR' ? 'landscape' : 'portrait')

export async function layoutDiagram(d: Diagram, theme: Theme): Promise<Diagram> {
  const fixed = d.settings.orientation && d.settings.orientation !== 'auto' ? d.settings.orientation : null
  const other: Direction = d.direction === 'LR' ? 'TB' : 'LR'
  const locked = !!d.settings.lockDirection
  // Which (flow direction, page) pairs to try. A horizontal flow belongs on a landscape page and a
  // vertical flow on a portrait page, so the figure always reads the way the direction control says.
  let combos: { dir: Direction; orient: PageOrientation }[]
  if (d.layout === 'timeline') combos = fixed ? [{ dir: 'LR', orient: fixed }] : [{ dir: 'LR', orient: 'landscape' }, { dir: 'LR', orient: 'portrait' }]
  else if (fixed) combos = locked ? [{ dir: d.direction, orient: fixed }] : [{ dir: d.direction, orient: fixed }, { dir: other, orient: fixed }]
  else combos = locked ? [{ dir: d.direction, orient: naturalOrient(d.direction) }] : [{ dir: d.direction, orient: naturalOrient(d.direction) }, { dir: other, orient: naturalOrient(other) }]
  const cands: Cand[] = []
  for (const dir of [...new Set(combos.map((c) => c.dir))]) {
    const dd0: Diagram = { ...d, direction: dir }
    for (const v of await variantsFor(dd0, theme)) {
      const dd: Diagram = { ...dd0, nodes: v.nodes, edges: assignHandles(v.nodes, d.edges, dd0), ...(v.timeline ? { timeline: v.timeline } : {}) }
      for (const c of combos) if (c.dir === dir) cands.push({ dd, rows: v.rows, orient: c.orient, s: fitScale(dd, theme, c.orient) })
    }
  }
  const c = pick(cands, d)
  return { ...c.dd, layoutInfo: { rows: c.rows, orientation: c.orient, bodyPt: bodyPt(d, c.s), adapted: c.dd.direction !== d.direction || undefined } }
}

async function variantsFor(d: Diagram, theme: Theme): Promise<{ nodes: SNode[]; rows: number; timeline?: Diagram['timeline'] }[]> {
  const sized = d.nodes.map((n) => ({ ...fresh(n), ...autoSize(n, d.direction, d.settings, theme) }))
  if (d.layout === 'timeline') {
    const r = layoutTimeline(d, sized)
    return [{ nodes: r.nodes, rows: 1, timeline: { unit: d.timeline?.unit ?? 'weeks', breaks: d.timeline?.breaks ?? [], scale: r.scale } }]
  }
  const clearRow = (ns: SNode[]) => ns.map((n) => (n.data.row === undefined ? n : { ...n, data: { ...n.data, row: undefined } }))
  if (d.layout === 'windows') return [{ nodes: normalize(layoutWindows(d, sized)), rows: 1 }]
  const base = clearRow(normalize(await layoutLayered(d, sized)))
  const want = d.settings.rows ?? 0
  const out: { nodes: SNode[]; rows: number }[] = []
  for (const k of want ? [want] : [1, 2, 3, 4]) {
    if (k === 1) out.push({ nodes: base, rows: 1 })
    else {
      const w = wrapRows(base, d, k, !!want)
      if (w) out.push({ nodes: normalize(w), rows: k })
    }
  }
  return out.length ? out : [{ nodes: base, rows: 1 }]
}

interface Cand {
  dd: Diagram
  rows: number
  orient: PageOrientation
  s: number
}

const bodyPt = (d: Diagram, s: number) => Math.round((((d.settings.fontSize - 1) * s * 72) / 25.4) * 10) / 10

/** Largest print; among near-equal options (within 7%) the one with fewest rows. */
function bestOf(xs: Cand[]): Cand | null {
  if (!xs.length) return null
  const top = Math.max(...xs.map((x) => x.s))
  return xs.filter((x) => x.s >= top * 0.93).sort((a, b) => a.rows - b.rows || b.s - a.s)[0]
}

/**
 * Keep the current flow direction (and its page) whenever text is readable (≥ 8 pt) or the
 * alternative isn't clearly better; otherwise take the alternative (other direction or page).
 */
function pick(c: Cand[], d: Diagram): Cand {
  const primaryOrient = d.settings.orientation && d.settings.orientation !== 'auto' ? d.settings.orientation : naturalOrient(d.direction)
  const isPrimary = (x: Cand) => (d.layout === 'timeline' ? x.orient === (d.settings.orientation && d.settings.orientation !== 'auto' ? d.settings.orientation : 'landscape') : x.dd.direction === d.direction && x.orient === primaryOrient)
  const primary = c.filter(isPrimary)
  // one row that already reads comfortably beats wrapping; wrapping is a remedy for small text
  const single = primary.filter((x) => x.rows === 1).sort((p, q) => q.s - p.s)[0]
  const a = single && bodyPt(d, single.s) >= 9 ? single : (bestOf(primary) ?? bestOf(c)!)
  const b = bestOf(c.filter((x) => !isPrimary(x)))
  if (!b || bodyPt(d, a.s) >= 8 || b.s <= a.s * 1.1) return a
  return b
}

/** Re-size nodes to their text without moving anything (after edits / font change). */
export function resizeNodes(d: Diagram, theme: Theme): Diagram {
  return { ...d, nodes: d.nodes.map((n) => ({ ...fresh(n), ...autoSize(n, d.direction, d.settings, theme) })) }
}

function normalize(nodes: SNode[]): SNode[] {
  if (!nodes.length) return nodes
  const minX = Math.min(...nodes.map((n) => n.position.x))
  const minY = Math.min(...nodes.map((n) => n.position.y))
  return nodes.map((n) => ({ ...n, position: { x: Math.round(n.position.x - minX), y: Math.round(n.position.y - minY) } }))
}

/* ------------------------------------------------------------------ */
/* Layered layout (schema, flow, lines)                                */
/* ------------------------------------------------------------------ */

async function layoutLayered(d: Diagram, nodes: SNode[]): Promise<SNode[]> {
  const LR = d.direction === 'LR'
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const sideIds = new Set(nodes.filter((n) => n.data.side).map((n) => n.id))
  const anchorOf = new Map<string, string>()
  for (const e of d.edges) {
    if (sideIds.has(e.target) && !sideIds.has(e.source) && !anchorOf.has(e.target)) anchorOf.set(e.target, e.source)
  }
  for (const e of d.edges) {
    if (sideIds.has(e.source) && !sideIds.has(e.target) && !anchorOf.has(e.source)) anchorOf.set(e.source, e.target)
  }
  // side boxes without an anchor are laid out as ordinary nodes
  const isSide = (id: string) => sideIds.has(id) && anchorOf.has(id)
  const main = nodes.filter((n) => !isSide(n.id))
  const mainEdges = d.edges.filter((e) => !isSide(e.source) && !isSide(e.target) && e.source !== e.target && byId.has(e.source) && byId.has(e.target))

  // partitions keep phases in order along the main axis
  const phaseIdx = new Map(d.phases.map((p, i) => [p.id, i]))
  const part = new Map<string, number>()
  for (const n of main) if (n.data.phase && phaseIdx.has(n.data.phase)) part.set(n.id, phaseIdx.get(n.data.phase)!)
  const usePartitions = part.size > 0
  if (usePartitions) {
    for (let pass = 0; pass < 3; pass++) {
      for (const n of main) {
        if (part.has(n.id)) continue
        const preds = mainEdges.filter((e) => e.target === n.id && part.has(e.source)).map((e) => part.get(e.source)!)
        const succs = mainEdges.filter((e) => e.source === n.id && part.has(e.target)).map((e) => part.get(e.target)!)
        if (preds.length) part.set(n.id, Math.max(...preds))
        else if (succs.length) part.set(n.id, Math.min(...succs))
      }
    }
    for (const n of main) if (!part.has(n.id)) part.set(n.id, 0)
  }

  const sidesOf = new Map<string, SNode[]>()
  for (const [sid, aid] of anchorOf) {
    if (!isSide(sid)) continue
    sidesOf.set(aid, [...(sidesOf.get(aid) ?? []), byId.get(sid)!])
  }

  const ordered = [...main].sort((a, b) => (a.data.order ?? 0) - (b.data.order ?? 0))

  const run = async (reserve: Set<string>) => {
    const graph = {
      id: 'root',
      layoutOptions: {
        'elk.algorithm': 'layered',
        'elk.direction': LR ? 'RIGHT' : 'DOWN',
        'elk.spacing.nodeNode': String(d.settings.nodeGap),
        'elk.layered.spacing.nodeNodeBetweenLayers': String(d.settings.rankGap),
        'elk.layered.spacing.edgeNodeBetweenLayers': '16',
        'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
        'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF',
        'elk.layered.nodePlacement.bk.fixedAlignment': 'BALANCED',
        'elk.layered.cycleBreaking.strategy': 'MODEL_ORDER',
        'elk.partitioning.activate': usePartitions ? 'true' : 'false',
        'elk.separateConnectedComponents': 'false',
        'elk.edgeRouting': 'ORTHOGONAL',
      },
      children: ordered.map((n) => {
        let w = n.width ?? 100
        let h = n.height ?? 50
        if (reserve.has(n.id)) {
          const sides = sidesOf.get(n.id) ?? []
          const sideCross = Math.max(...sides.map((s) => (LR ? s.height ?? 0 : s.width ?? 0)))
          const need = SIDE_CROSS + sideCross + 12
          if (LR) h = Math.max(h, 2 * need)
          else w = Math.max(w, 2 * need)
        }
        return {
          id: n.id,
          width: w,
          height: h,
          layoutOptions: (usePartitions ? { 'elk.partitioning.partition': String(part.get(n.id) ?? 0) } : {}) as Record<string, string>,
        }
      }),
      edges: mainEdges.map((e) => ({ id: e.id, sources: [e.source], targets: [e.target] })),
    }
    const res = await elk.layout(graph)
    const pos = new Map<string, { x: number; y: number }>()
    for (const c of res.children ?? []) {
      const n = byId.get(c.id)!
      const dx = ((c.width ?? 0) - (n.width ?? 0)) / 2
      const dy = ((c.height ?? 0) - (n.height ?? 0)) / 2
      pos.set(c.id, { x: (c.x ?? 0) + dx, y: (c.y ?? 0) + dy })
    }
    let placed: SNode[] = main.map((n) => ({ ...n, position: pos.get(n.id) ?? n.position }))
    placed = centerLayers(placed, LR)
    return placeSides(placed, sidesOf, mainEdges, LR, d.settings.rankGap)
  }

  let result = await run(new Set())
  // if a side box collides with another lane, reserve room beside its anchor and redo
  const collide = new Set<string>()
  const placedById = new Map(result.map((n) => [n.id, n]))
  for (const [aid, sides] of sidesOf) {
    for (const s of sides) {
      const sb = box(placedById.get(s.id)!)
      if (result.some((o) => o.id !== s.id && o.id !== aid && overlaps(sb, box(o)))) collide.add(aid)
    }
  }
  if (collide.size) result = await run(collide)
  return result
}

/** Center nodes that share a layer on the layer's center line (main axis). */
function centerLayers(nodes: SNode[], LR: boolean): SNode[] {
  const items = nodes.map((n) => ({ n, lo: LR ? n.position.x : n.position.y, size: LR ? n.width ?? 0 : n.height ?? 0 }))
  items.sort((a, b) => a.lo - b.lo)
  const groups: (typeof items)[] = []
  let hi = -Infinity
  for (const it of items) {
    if (groups.length && it.lo < hi - 1) {
      groups[groups.length - 1].push(it)
      hi = Math.max(hi, it.lo + it.size)
    } else {
      groups.push([it])
      hi = it.lo + it.size
    }
  }
  const out = new Map<string, SNode>()
  for (const g of groups) {
    const lo = Math.min(...g.map((i) => i.lo))
    const top = Math.max(...g.map((i) => i.lo + i.size))
    const c = (lo + top) / 2
    for (const it of g) {
      const p = LR ? { x: c - it.size / 2, y: it.n.position.y } : { x: it.n.position.x, y: c - it.size / 2 }
      out.set(it.n.id, { ...it.n, position: p })
    }
  }
  return nodes.map((n) => out.get(n.id) ?? n)
}

function placeSides(nodes: SNode[], sidesOf: Map<string, SNode[]>, mainEdges: SEdge[], LR: boolean, rankGap: number): SNode[] {
  const cur = new Map(nodes.map((n) => [n.id, { ...n }]))
  const mPos = (n: SNode) => (LR ? n.position.x : n.position.y)
  const mSize = (n: SNode) => (LR ? n.width ?? 0 : n.height ?? 0)
  const cPos = (n: SNode) => (LR ? n.position.y : n.position.x)
  const cSize = (n: SNode) => (LR ? n.height ?? 0 : n.width ?? 0)
  const setPos = (n: SNode, m: number, c: number) => {
    n.position = LR ? { x: m, y: c } : { x: c, y: m }
  }
  const anchors = [...sidesOf.keys()].filter((a) => cur.has(a)).sort((a, b) => mPos(cur.get(a)!) - mPos(cur.get(b)!))
  for (const aid of anchors) {
    const a = cur.get(aid)!
    const all = sidesOf.get(aid)!.map((s) => ({ ...s }))
    // annotation notes hang directly under (LR) / beside (TB) their anchor
    let c = cPos(a) + cSize(a) + 18
    for (const s of all.filter((x) => x.data.role === 'note')) {
      // centred under the anchor, but never past its far edge (keeps clear of fork lines)
      setPos(s, Math.min(mPos(a) + mSize(a) / 2 - mSize(s) / 2, mPos(a) + mSize(a) + 6 - mSize(s)), c)
      c += cSize(s) + 10
      cur.set(s.id, s)
    }
    const sides = all.filter((x) => x.data.role !== 'note')
    if (!sides.length) continue
    const aEnd = mPos(a) + mSize(a)
    const succ = mainEdges
      .filter((e) => e.source === aid)
      .map((e) => cur.get(e.target))
      .filter((n): n is SNode => !!n && mPos(n) >= aEnd - 1)
      .sort((x, y) => mPos(x) - mPos(y))[0]
    const total = sides.reduce((s, n) => s + mSize(n), 0) + SIDE_MAIN_GAP * (sides.length - 1)
    const need = total + SIDE_MAIN_GAP * 2
    let nextStart = succ ? mPos(succ) : aEnd + Math.max(need, rankGap)
    const avail = nextStart - aEnd
    if (need > avail && succ) {
      const shift = need - avail
      for (const n of cur.values()) if (mPos(n) >= nextStart - 1) setPos(n, mPos(n) + shift, cPos(n))
      nextStart += shift
    }
    const span = nextStart - aEnd
    let m = aEnd + (span - total) / 2
    const lineC = cPos(a) + cSize(a) / 2
    for (const s of sides) {
      setPos(s, m, lineC + SIDE_CROSS)
      m += mSize(s) + SIDE_MAIN_GAP
      cur.set(s.id, s)
    }
  }
  return [...cur.values()]
}

/* ------------------------------------------------------------------ */
/* Wrapping long diagrams into rows (LR) or columns (TB)               */
/* ------------------------------------------------------------------ */

const WRAP_LANE = 26

/** Distance from a row's content edge to the connector lane between rows (band padding + axis). */
export function laneOffset(d: Diagram) {
  return 16 + (hasBands(d) && d.settings.showAxis ? axisSpaceFor(d) : 0) + 12
}

function wrapRows(nodes: SNode[], d: Diagram, k: number, forced: boolean): SNode[] | null {
  const LR = d.direction === 'LR'
  const mLo = (n: SNode) => (LR ? n.position.x : n.position.y)
  const mHi = (n: SNode) => mLo(n) + (LR ? n.width ?? 0 : n.height ?? 0)
  const cLo = (n: SNode) => (LR ? n.position.y : n.position.x)
  const cHi = (n: SNode) => cLo(n) + (LR ? n.height ?? 0 : n.width ?? 0)
  const ids = new Set(nodes.map((n) => n.id))
  const anchorOf = new Map<string, string>()
  for (const e of d.edges) {
    if (!ids.has(e.source) || !ids.has(e.target)) continue
    const t = nodes.find((n) => n.id === e.target)!
    const s = nodes.find((n) => n.id === e.source)!
    if (t.data.side && !s.data.side && !anchorOf.has(t.id)) anchorOf.set(t.id, s.id)
  }
  const main = nodes.filter((n) => !anchorOf.has(n.id)).sort((a, b) => mLo(a) - mLo(b))
  // columns = groups of main nodes whose main-axis ranges overlap
  const cols: { lo: number; hi: number; ids: string[] }[] = []
  for (const n of main) {
    const last = cols[cols.length - 1]
    if (last && mLo(n) < last.hi - 1) {
      last.ids.push(n.id)
      last.hi = Math.max(last.hi, mHi(n))
    } else cols.push({ lo: mLo(n), hi: mHi(n), ids: [n.id] })
  }
  if (cols.length < 2 * k) return null
  const colOf = new Map<string, number>()
  cols.forEach((c, i) => c.ids.forEach((id) => colOf.set(id, i)))
  const hasSide = cols.map(() => false)
  for (const [sid, aid] of anchorOf) {
    const ci = colOf.get(aid)
    if (ci === undefined) continue
    colOf.set(sid, ci)
    hasSide[ci] = true
    const sn = nodes.find((n) => n.id === sid)!
    cols[ci].hi = Math.max(cols[ci].hi, mHi(sn))
  }
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const phaseSet = cols.map((c) => new Set(c.ids.map((id) => byId.get(id)!.data.phase).filter(Boolean)))
  const cutCost = (i: number) => {
    let cross = 0
    for (const e of d.edges) {
      const a = colOf.get(e.source)
      const b = colOf.get(e.target)
      if (a === undefined || b === undefined) continue
      if ((a <= i && b > i) || (b <= i && a > i)) cross++
    }
    const phaseCut = [...phaseSet[i]].some((p) => phaseSet[i + 1].has(p)) ? 1 : 0
    return 0.25 * Math.max(0, cross - 1) + 0.08 * phaseCut + 0.3 * (hasSide[i] ? 1 : 0) + (cross === 0 ? 0.5 : 0)
  }
  // enumerate cut positions
  let best: { cuts: number[]; score: number } | null = null
  const n = cols.length
  const tryCuts = (cuts: number[]) => {
    const bounds = [-1, ...cuts, n - 1]
    let maxW = 0
    let minW = Infinity
    let pen = 0
    for (let r = 0; r < bounds.length - 1; r++) {
      const a = bounds[r] + 1
      const b = bounds[r + 1]
      if (b - a < (forced ? 0 : 1)) return
      maxW = Math.max(maxW, cols[b].hi - cols[a].lo)
      minW = Math.min(minW, cols[b].hi - cols[a].lo)
    }
    for (const c of cuts) pen += cutCost(c)
    // narrowest rows decide the page; among similar options prefer evenly filled rows
    const score = maxW * (1 + pen) + 0.2 * (maxW - minW)
    if (!best || score < best.score) best = { cuts, score }
  }
  const choose = (from: number, left: number, acc: number[]) => {
    if (left === 0) return tryCuts(acc)
    for (let i = from; i < n - left; i++) choose(i + 1, left - 1, [...acc, i])
  }
  choose(0, k - 1, [])
  if (!best) return null
  const bounds = [-1, ...(best as { cuts: number[] }).cuts, n - 1]
  const out: SNode[] = []
  let prevEnd = 0
  for (let r = 0; r < bounds.length - 1; r++) {
    const a = bounds[r] + 1
    const b = bounds[r + 1]
    const rowNodes = nodes.filter((x) => {
      const ci = colOf.get(x.id)
      return ci !== undefined && ci >= a && ci <= b
    })
    const mStart = Math.min(cols[a].lo, ...rowNodes.map(mLo))
    // side boxes may hang out before the row's first step; the connector enters that step from above
    // their level, so they stay where the layout put them (clear of fork lines)
    const cMin = Math.min(...rowNodes.map(cLo))
    const cMax = Math.max(...rowNodes.map(cHi))
    const shifted = rowNodes.map((x) => ({ ...x, position: LR ? { x: x.position.x - mStart, y: x.position.y } : { x: x.position.x, y: x.position.y - mStart } }))
    const top = r === 0 ? cMin : prevEnd + laneOffset(d) + WRAP_LANE + headerSizeFor(d, shifted) + 16
    const dc = top - cMin
    for (const x of shifted) {
      out.push({ ...x, position: LR ? { x: x.position.x, y: x.position.y + dc } : { x: x.position.x + dc, y: x.position.y }, data: { ...x.data, row: r } })
    }
    prevEnd = cMax + dc
  }
  // nodes not assigned to a column (unanchored oddities) stay in row 0
  for (const x of nodes) if (!colOf.has(x.id)) out.push({ ...x, data: { ...x.data, row: 0 } })
  return out
}

/* ------------------------------------------------------------------ */
/* Handles                                                             */
/* ------------------------------------------------------------------ */

export function chooseHandles(s: SNode, t: SNode, dir: Direction): [Side, Side] {
  const LR = dir === 'LR'
  const sb = box(s)
  const tb = box(t)
  const scx = sb.x + sb.w / 2
  const scy = sb.y + sb.h / 2
  const tcx = tb.x + tb.w / 2
  const tcy = tb.y + tb.h / 2
  const mainOverlap = LR ? tb.x < scx && scx < tb.x + tb.w : tb.y < scy && scy < tb.y + tb.h
  if (t.data.side && !s.data.side && mainOverlap) {
    if (LR) return tcy >= scy ? ['b', 't'] : ['t', 'b']
    return tcx >= scx ? ['r', 'l'] : ['l', 'r']
  }
  if (t.data.side && !s.data.side) {
    if (LR) return tcy >= scy ? ['r', 't'] : ['r', 'b']
    return tcx >= scx ? ['b', 'l'] : ['b', 'r']
  }
  if (s.data.side && !t.data.side) {
    if (LR) return scy >= tcy ? ['t', 'l'] : ['b', 'l']
    return scx >= tcx ? ['l', 't'] : ['r', 't']
  }
  if (LR) {
    if (tb.x >= sb.x + sb.w - 1) return ['r', 'l']
    if (tb.x + tb.w <= sb.x + 1) return ['b', 'b']
    return tcy >= scy ? ['b', 't'] : ['t', 'b']
  }
  if (tb.y >= sb.y + sb.h - 1) return ['b', 't']
  if (tb.y + tb.h <= sb.y + 1) return ['r', 'r']
  return tcx >= scx ? ['r', 'l'] : ['l', 'r']
}

export function assignHandles(nodes: SNode[], edges: SEdge[], d: Pick<Diagram, 'direction' | 'settings' | 'phases' | 'layout'>): SEdge[] {
  const dir = d.direction
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const rowEnd = new Map<number, number>()
  for (const n of nodes) {
    if (n.data.row === undefined) continue
    const end = dir === 'LR' ? n.position.y + (n.height ?? 0) : n.position.x + (n.width ?? 0)
    rowEnd.set(n.data.row, Math.max(rowEnd.get(n.data.row) ?? -Infinity, end))
  }
  return edges.map((e) => {
    if (e.data?.manualHandles) return e
    const s = byId.get(e.source)
    const t = byId.get(e.target)
    if (!s || !t) return e
    if (s.data.row !== undefined && t.data.row !== undefined && t.data.row > s.data.row) {
      const lane = (rowEnd.get(s.data.row) ?? 0) + laneOffset(d as Diagram)
      return { ...e, sourceHandle: dir === 'LR' ? 'b' : 'r', targetHandle: dir === 'LR' ? 'l' : 't', data: { ...e.data, offset: undefined, wrap: { lane } } }
    }
    const [sh, th] = chooseHandles(s, t, dir)
    return { ...e, sourceHandle: sh, targetHandle: th, data: { ...e.data, offset: undefined, wrap: undefined } }
  })
}

/* ------------------------------------------------------------------ */
/* Time windows                                                        */
/* ------------------------------------------------------------------ */

function layoutWindows(d: Diagram, nodes: SNode[]): SNode[] {
  const LR = d.direction === 'LR'
  const fs = d.settings.fontSize
  const rows = nodes.filter((n) => n.type === 'window').sort((a, b) => (a.data.order ?? 0) - (b.data.order ?? 0))
  const marker = nodes.find((n) => n.type === 'marker')
  const others = nodes.filter((n) => n.type !== 'window' && n.type !== 'marker')
  const near0 = (v: number) => v >= -1 && v <= 1
  const vals = rows.flatMap((r) => [r.data.startDay, r.data.endDay]).filter((v): v is number => typeof v === 'number')
  const neg = [...new Set(vals.filter((v) => v < -1))].sort((a, b) => a - b)
  const pos = [...new Set(vals.filter((v) => v > 1))].sort((a, b) => a - b)
  const base = LR ? Math.max(90, d.settings.nodeWidth ? d.settings.nodeWidth * 0.6 : 118) : 84
  // spread few ticks over a comfortable width so bars stay readable
  const COLN = Math.max(base, (LR ? 280 : 200) / Math.max(1, neg.length))
  const COLP = Math.max(base, (LR ? 240 : 170) / Math.max(1, pos.length + 1))
  const COL = Math.max(COLN, COLP)
  const ZW = LR ? 66 : 40
  const map = (v: number) => (near0(v) ? 0 : v < 0 ? -(neg.length - neg.indexOf(v)) * COLN : (pos.indexOf(v) + 1) * COLP)
  const minX = -neg.length * COLN
  const maxX = pos.length * COLP
  const bars = rows.map((r) => {
    const s = r.data.startDay ?? null
    const e = r.data.endDay ?? null
    let from = s === null ? minX - COL * 0.7 : map(s)
    let to = e === null ? maxX + COL * 0.9 : map(e)
    if (s !== null && e !== null && to - from < 1) {
      const c = (from + to) / 2
      from = c - ZW / 2
      to = c + ZW / 2
    }
    return { from, to, openStart: s === null, openEnd: e === null }
  })
  const minFrom = Math.min(-ZW / 2, ...bars.map((b) => b.from - (b.openStart ? 14 : 0)))

  if (LR) {
    const labelW = Math.min(260, Math.max(150, ...rows.map((r) => Math.min(260, measure(r.data.label, fs, true) + 24))))
    const origin = labelW + 18 - minFrom
    const markerLines = marker ? wrap(marker.data.label, 220, fs, true) : []
    const top = marker ? markerLines.length * lineHeight(fs) + 14 : 0
    let tail = 0
    for (let i = 0; i < rows.length; i++) {
      const b = bars[i]
      const det = rows[i].data.detail ?? ''
      const tw = det ? measure(det, fs - 1) : 0
      const inside = tw + 12 <= b.to - b.from
      tail = Math.max(tail, origin + b.to + (b.openEnd ? 16 : 0) + (inside ? 0 : tw + 14))
    }
    const width = Math.ceil(tail + 8)
    let y = top
    const out: SNode[] = rows.map((r, i) => {
      const lines = wrap(r.data.label, labelW - 12, fs, true)
      const h = Math.max(40, lines.length * lineHeight(fs) + 14)
      const n: SNode = {
        ...r,
        position: { x: 0, y },
        width,
        height: h,
        data: { ...r.data, order: i, bar: { from: origin + bars[i].from, to: origin + bars[i].to, openStart: bars[i].openStart, openEnd: bars[i].openEnd, labelSize: labelW } },
      }
      y += h + 10
      return n
    })
    if (marker) {
      const mw = 230
      out.push({ ...marker, position: { x: origin - mw / 2, y: 0 }, width: mw, height: y - 4, data: { ...marker.data, bar: { from: 0, to: 0, openStart: false, openEnd: false, labelSize: top } } })
    }
    return [...out, ...others]
  }

  // vertical: windows become columns, time runs downwards
  const colW = d.settings.nodeWidth ? Math.max(110, d.settings.nodeWidth * 0.6) : 132
  const labelH = Math.max(...rows.map((r) => wrap(r.data.label, colW - 8, fs, true).length), 1) * lineHeight(fs) + 16
  const origin = labelH + 16 - minFrom
  const markerLabelW = marker ? 128 : 0
  let tail = 0
  for (let i = 0; i < rows.length; i++) {
    const b = bars[i]
    const det = rows[i].data.detail ?? ''
    const lines = det ? wrap(det, colW - 24, fs - 1).length : 0
    const th = lines * lineHeight(fs - 1)
    const inside = th + 8 <= b.to - b.from
    tail = Math.max(tail, origin + b.to + (b.openEnd ? 16 : 0) + (inside ? 0 : th + 8))
  }
  const height = Math.ceil(tail + 8)
  const x0 = markerLabelW ? markerLabelW + 12 : 0
  const out: SNode[] = rows.map((r, i) => ({
    ...r,
    position: { x: x0 + i * (colW + 10), y: 0 },
    width: colW,
    height,
    data: { ...r.data, order: i, bar: { from: origin + bars[i].from, to: origin + bars[i].to, openStart: bars[i].openStart, openEnd: bars[i].openEnd, labelSize: labelH } },
  }))
  if (marker) {
    const mh = 44
    const w = x0 + rows.length * (colW + 10)
    out.push({ ...marker, position: { x: 0, y: origin - mh / 2 }, width: w, height: mh, data: { ...marker.data, bar: { from: 0, to: 0, openStart: false, openEnd: false, labelSize: markerLabelW } } })
  }
  return [...out, ...others]
}

/* ------------------------------------------------------------------ */
/* Fit to page                                                         */
/* ------------------------------------------------------------------ */

/** Page size in mm. 'auto' is A4 (slides: 16:9 in landscape). */
export function pageSize(page: PageId, orient: PageOrientation, forSlides = false) {
  const id = page === 'auto' ? (forSlides && orient === 'landscape' ? 'slide16x9' : 'a4') : page
  const p = PAGES.find((x) => x.id === id) ?? PAGES[0]
  return orient === 'landscape' ? { w: p.w, h: p.h, label: p.label } : { w: p.h, h: p.w, label: p.label }
}

export function orientationOf(d: Diagram): PageOrientation {
  if (d.settings.orientation && d.settings.orientation !== 'auto') return d.settings.orientation
  return d.layoutInfo?.orientation ?? (d.direction === 'LR' ? 'landscape' : 'portrait')
}

/** Scale (mm per px) at which the diagram fits the page with 12 mm margins. */
export function fitScale(d: Diagram, theme: Theme, orient: PageOrientation = orientationOf(d)) {
  const { w, h } = pageSize(d.settings.page, orient)
  const b = computeDecor(d, theme).bounds
  return Math.min((w - 24) / Math.max(1, b.w), (h - 24) / Math.max(1, b.h))
}

/** Try box widths and spacings (each with automatic rows/orientation) and keep the best page fit. */
export async function fitToPage(d: Diagram, theme: Theme): Promise<Diagram> {
  const widths = d.direction === 'LR' ? [150, 170, 190, 220, 250] : [180, 210, 250, 290, 330]
  const gaps = [
    [44, 18],
    [64, 26],
  ]
  const cands: Cand[] = []
  for (const nodeWidth of widths) {
    for (const [rankGap, nodeGap] of gaps) {
      const dd = await layoutDiagram({ ...d, settings: { ...d.settings, nodeWidth, rankGap, nodeGap } }, theme)
      cands.push({ dd, rows: dd.layoutInfo?.rows ?? 1, orient: orientationOf(dd), s: fitScale(dd, theme) })
    }
  }
  return pick(cands, d).dd
}

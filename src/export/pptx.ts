import PptxGenJS from 'pptxgenjs'
import type { Diagram, ShapeKind } from '../types'
import type { Theme } from '../lib/catalog'
import { orientationOf, pageSize } from '../lib/layout'
import type { Prim } from '../lib/prims'
import { pathToPoints } from '../lib/edges'
import { PAD_X, resolveStyle } from '../lib/shapes'
import { lineHeight, measure, wrap } from '../lib/text'
import { buildScene } from './scene'
import { diagramToSvg } from './svg'
import { svgToPng } from './png'

type Slide = PptxGenJS.Slide

const col = (hex: string | undefined) => (hex ?? '#000000').replace('#', '').toUpperCase().slice(0, 6)

const SHAPE: Record<ShapeKind, string> = {
  rect: 'rect',
  rounded: 'roundRect',
  pill: 'roundRect',
  diamond: 'diamond',
  circle: 'ellipse',
  hexagon: 'hexagon',
  parallelogram: 'parallelogram',
  document: 'flowChartDocument',
  cylinder: 'can',
  note: 'rect',
}

interface Map2 {
  X: (v: number) => number
  Y: (v: number) => number
  S: (v: number) => number
  PT: (v: number) => number
}

function polyline(slide: Slide, pts: { x: number; y: number }[], m: Map2, line: PptxGenJS.ShapeLineProps, close = false, fill?: string) {
  if (pts.length < 2) return
  const xs = pts.map((p) => m.X(p.x))
  const ys = pts.map((p) => m.Y(p.y))
  const x0 = Math.min(...xs)
  const y0 = Math.min(...ys)
  const w = Math.max(0.01, Math.max(...xs) - x0)
  const h = Math.max(0.01, Math.max(...ys) - y0)
  const points: NonNullable<PptxGenJS.ShapeProps['points']> = xs.map((x, i) => ({ x: x - x0, y: ys[i] - y0 }))
  if (close) points.push({ close: true })
  slide.addShape('custGeom' as PptxGenJS.ShapeType, { x: x0, y: y0, w, h, points, line, fill: fill ? { color: col(fill) } : { type: 'none' } })
}

function lineShape(slide: Slide, a: { x: number; y: number }, b: { x: number; y: number }, m: Map2, line: PptxGenJS.ShapeLineProps) {
  const ax = m.X(a.x)
  const ay = m.Y(a.y)
  const bx = m.X(b.x)
  const by = m.Y(b.y)
  slide.addShape('line' as PptxGenJS.ShapeType, {
    x: Math.min(ax, bx),
    y: Math.min(ay, by),
    w: Math.max(0.001, Math.abs(bx - ax)),
    h: Math.max(0.001, Math.abs(by - ay)),
    flipH: bx < ax,
    flipV: by < ay,
    line,
  })
}

function drawPrims(slide: Slide, prims: Prim[], m: Map2, dx = 0, dy = 0) {
  for (const p of prims) {
    if (p.t === 'rect') {
      const hasFill = p.fill && p.fill !== 'none'
      slide.addShape((p.rx ? 'roundRect' : 'rect') as PptxGenJS.ShapeType, {
        x: m.X(p.x + dx),
        y: m.Y(p.y + dy),
        w: m.S(p.w),
        h: m.S(p.h),
        rectRadius: p.rx ? m.S(p.rx) : undefined,
        fill: hasFill ? { color: col(p.fill), transparency: p.opacity !== undefined ? Math.round((1 - p.opacity) * 100) : 0 } : { type: 'none' },
        line: p.stroke ? { color: col(p.stroke), width: m.PT(p.sw ?? 1), dashType: p.dash ? 'dash' : 'solid' } : { type: 'none' },
      })
    } else if (p.t === 'line') {
      // native line shape: top-left → bottom-right by default; flipV for rising lines ("/")
      const ax = m.X(p.x1 + dx)
      const ay = m.Y(p.y1 + dy)
      const bx = m.X(p.x2 + dx)
      const by = m.Y(p.y2 + dy)
      slide.addShape('line' as PptxGenJS.ShapeType, {
        x: Math.min(ax, bx),
        y: Math.min(ay, by),
        w: Math.max(0.001, Math.abs(bx - ax)),
        h: Math.max(0.001, Math.abs(by - ay)),
        flipV: (bx - ax) * (by - ay) < 0,
        line: { color: col(p.stroke), width: m.PT(p.sw), dashType: p.dash ? 'dash' : 'solid' },
      })
    } else if (p.t === 'path') {
      const pts = pathToPoints(p.d).map((q) => ({ x: q.x + dx, y: q.y + dy }))
      const closed = /z\s*$/i.test(p.d.trim())
      polyline(slide, pts, m, p.stroke ? { color: col(p.stroke), width: m.PT(p.sw ?? 1) } : { type: 'none' }, closed, p.fill && p.fill !== 'none' ? p.fill : undefined)
    } else if (p.t === 'text') {
      const w = measure(p.text, p.size, p.bold) + p.size * 0.8
      const lh = lineHeight(p.size)
      const left = p.anchor === 'middle' ? p.x - w / 2 : p.anchor === 'end' ? p.x - w : p.x
      slide.addText(p.text, {
        x: m.X(left + dx),
        y: m.Y(p.y - p.size * 0.84 - (lh - p.size) / 2 + dy),
        w: m.S(w),
        h: m.S(lh),
        fontFace: 'Arial',
        fontSize: m.PT(p.size),
        bold: !!p.bold,
        color: col(p.color),
        align: p.anchor === 'middle' ? 'center' : p.anchor === 'end' ? 'right' : 'left',
        valign: 'middle',
        margin: 0,
        wrap: false,
        fit: 'none',
      })
    }
  }
}

export async function buildPptx(diagrams: Diagram[], theme: Theme, opts: { mode: 'editable' | 'image' }) {
  const pres = new PptxGenJS()
  const first = diagrams[0]
  const ps = pageSize(first.settings.page, orientationOf(first), true)
  const W = ps.w / 25.4
  const H = ps.h / 25.4
  pres.defineLayout({ name: 'SCHEMA', width: W, height: H })
  pres.layout = 'SCHEMA'
  pres.title = first.settings.title || 'Study schema'

  for (const d of diagrams) {
    const slide = pres.addSlide()
    slide.background = { color: 'FFFFFF' }
    const scene = buildScene(d, theme, 4)
    const M = 0.3
    const k = Math.min((W - 2 * M) / scene.w, (H - 2 * M) / scene.h)
    const ox = (W - scene.w * k) / 2 - scene.x * k
    const oy = (H - scene.h * k) / 2 - scene.y * k
    const m: Map2 = { X: (v) => ox + v * k, Y: (v) => oy + v * k, S: (v) => v * k, PT: (v) => Math.max(0.5, Math.round(v * k * 72 * 10) / 10) }

    if (opts.mode === 'image') {
      const { svg, width, height } = diagramToSvg(d, theme, '#ffffff')
      const png = await svgToPng(svg, width, height, 3)
      const data = await new Promise<string>((res) => {
        const r = new FileReader()
        r.onload = () => res(r.result as string)
        r.readAsDataURL(png)
      })
      const kk = Math.min((W - 2 * M) / width, (H - 2 * M) / height)
      slide.addImage({ data, x: (W - width * kk) / 2, y: (H - height * kk) / 2, w: width * kk, h: height * kk })
      continue
    }

    for (const b of scene.decor.bands) drawPrims(slide, b.prims, m)
    drawPrims(slide, scene.decor.axis, m)

    for (const e of scene.edges) {
      const base = { color: col(e.color), width: m.PT(e.sw), dashType: e.dash ? ('dash' as const) : ('solid' as const) }
      const pts = e.points
      if (pts.length < 2) continue
      // body as one editable path; the last segment is a native line so arrowheads render in every viewer
      if (pts.length > 2) polyline(slide, pts.slice(0, -1), m, { ...base, beginArrowType: e.arrowStart ? 'triangle' : undefined })
      lineShape(slide, pts[pts.length - 2], pts[pts.length - 1], m, { ...base, endArrowType: e.arrowEnd ? 'triangle' : undefined, beginArrowType: pts.length === 2 && e.arrowStart ? 'triangle' : undefined })
    }

    for (const { node, prims } of scene.nodes) {
      const x = node.position.x
      const y = node.position.y
      const w = node.width ?? 0
      const h = node.height ?? 0
      if (node.type === 'shape' || !node.type) {
        const st = resolveStyle(node.data, theme, d.settings)
        const runs: PptxGenJS.TextProps[] = []
        const detail = node.data.detail ? node.data.detail.split('\n') : []
        if (node.data.label) runs.push({ text: node.data.label, options: { bold: true, fontSize: m.PT(st.fontSize), breakLine: detail.length > 0 } })
        detail.forEach((l, i) => runs.push({ text: l, options: { fontSize: m.PT(st.fontSize - 1), breakLine: i < detail.length - 1 } }))
        const shape = node.data.shape
        slide.addText(runs.length ? runs : '', {
          shape: SHAPE[shape] as PptxGenJS.ShapeType,
          x: m.X(x),
          y: m.Y(y),
          w: m.S(w),
          h: m.S(h),
          rectRadius: shape === 'pill' ? m.S(h / 2) : shape === 'rounded' ? m.S(Math.min(8, h / 4)) : undefined,
          fill: { color: col(st.fill) },
          line: { color: col(st.stroke), width: m.PT(st.sw), dashType: st.dash ? 'dash' : 'solid' },
          fontFace: 'Arial',
          color: col(st.text),
          align: st.align === 'left' ? 'left' : 'center',
          valign: 'middle',
          margin: shape === 'diamond' || shape === 'circle' ? 0 : m.PT(PAD_X * 0.7),
          fit: 'none',
        })
      } else {
        drawPrims(slide, prims, m, x, y)
      }
    }

    for (const e of scene.edges) {
      if (!e.label) continue
      const l = e.label
      slide.addText(l.text, {
        x: m.X(l.x - l.w / 2),
        y: m.Y(l.y - l.h / 2),
        w: m.S(l.w + 4),
        h: m.S(l.h),
        fontFace: 'Arial',
        fontSize: m.PT(l.size),
        color: col(e.color),
        align: 'center',
        valign: 'middle',
        fill: { color: 'FFFFFF' },
        margin: 0,
        wrap: false,
      })
    }
    if (scene.decor.title) drawPrims(slide, scene.decor.title.prims, m)
    if (scene.decor.footnote) {
      // footnote as one wrapped text box so it stays editable
      const fb = scene.decor.footnote.box
      const ffs = Math.max(8, d.settings.fontSize - 2)
      slide.addText(wrap(d.settings.footnote, fb.w, ffs).join(' '), {
        x: m.X(fb.x),
        y: m.Y(fb.y),
        w: m.S(fb.w),
        h: m.S(fb.h + 4),
        fontFace: 'Arial',
        fontSize: m.PT(ffs),
        color: '475569',
        valign: 'top',
        margin: 0,
      })
    }
  }
  return pres
}

export async function exportPptx(diagrams: Diagram[], theme: Theme, opts: { mode: 'editable' | 'image'; fileName: string }) {
  const pres = await buildPptx(diagrams, theme, opts)
  await pres.writeFile({ fileName: opts.fileName })
}

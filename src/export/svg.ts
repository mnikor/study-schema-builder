import type { Diagram } from '../types'
import type { Theme } from '../lib/catalog'
import { esc, markerDef, primToSvg } from '../lib/prims'
import { FONT_FAMILY } from '../lib/text'
import { buildScene, type Scene } from './scene'

export function sceneToSvg(scene: Scene, opts: { background?: string | null } = {}): string {
  const { x, y, w, h } = scene
  const colors = new Set(scene.edges.filter((e) => e.arrowEnd || e.arrowStart).map((e) => e.color))
  const parts: string[] = []
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${Math.ceil(w)}" height="${Math.ceil(h)}" viewBox="${x} ${y} ${w} ${h}" font-family="${FONT_FAMILY}">`)
  parts.push(`<title>${esc(scene.diagram.settings.title || scene.diagram.name)}</title>`)
  if (colors.size) parts.push(`<defs>${[...colors].map(markerDef).join('')}</defs>`)
  if (opts.background) parts.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${opts.background}"/>`)
  for (const b of scene.decor.bands) parts.push(`<g data-phase="${esc(b.phaseId)}">${b.prims.map(primToSvg).join('')}</g>`)
  if (scene.decor.axis.length) parts.push(`<g data-role="axis">${scene.decor.axis.map(primToSvg).join('')}</g>`)
  for (const e of scene.edges) {
    parts.push(
      primToSvg({ t: 'path', d: e.d, stroke: e.color, sw: e.sw, dash: e.dash, arrowEnd: e.arrowEnd, arrowStart: e.arrowStart }),
    )
  }
  for (const n of scene.nodes) {
    parts.push(`<g transform="translate(${n.node.position.x} ${n.node.position.y})">${n.prims.map(primToSvg).join('')}</g>`)
  }
  for (const e of scene.edges) {
    if (!e.label) continue
    const l = e.label
    parts.push(
      primToSvg({ t: 'rect', x: l.x - l.w / 2, y: l.y - l.h / 2, w: l.w, h: l.h, rx: 3, fill: '#ffffff', stroke: '#e2e8f0', sw: 1 }) +
        primToSvg({ t: 'text', x: l.x, y: l.y + l.size * 0.35, text: l.text, size: l.size, color: e.color, anchor: 'middle' }),
    )
  }
  if (scene.decor.title) parts.push(scene.decor.title.prims.map(primToSvg).join(''))
  if (scene.decor.footnote) parts.push(scene.decor.footnote.prims.map(primToSvg).join(''))
  parts.push('</svg>')
  return parts.join('\n')
}

export function diagramToSvg(d: Diagram, theme: Theme, background: string | null = '#ffffff') {
  const scene = buildScene(d, theme)
  return { svg: sceneToSvg(scene, { background }), width: scene.w, height: scene.h, scene }
}

export function download(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}

export const safeName = (s: string) => s.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').slice(0, 60) || 'study-schema'

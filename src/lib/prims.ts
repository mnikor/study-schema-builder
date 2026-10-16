/**
 * Drawing primitives. Nodes, bands and the axis are described once as primitives;
 * the canvas renders them as React SVG, and the exporters turn them into SVG text,
 * PNG and PowerPoint shapes. That keeps on-screen and exported figures identical.
 */
import { FONT_FAMILY } from './text'

export type Prim =
  | { t: 'path'; d: string; fill?: string; stroke?: string; sw?: number; dash?: boolean; opacity?: number; arrowEnd?: boolean; arrowStart?: boolean }
  | { t: 'rect'; x: number; y: number; w: number; h: number; rx?: number; fill?: string; stroke?: string; sw?: number; dash?: boolean; opacity?: number }
  | { t: 'line'; x1: number; y1: number; x2: number; y2: number; stroke: string; sw: number; dash?: boolean }
  | { t: 'text'; x: number; y: number; text: string; size: number; bold?: boolean; color: string; anchor?: 'start' | 'middle' | 'end'; halo?: string }

export const DASH = '6 4'

export const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const n = (v: number) => (Math.round(v * 100) / 100).toString()

export const markerId = (color: string) => `arrow-${color.replace(/[^a-z0-9]/gi, '')}`

export function primToSvg(p: Prim): string {
  switch (p.t) {
    case 'path': {
      const markers = `${p.arrowEnd ? ` marker-end="url(#${markerId(p.stroke ?? '#000')})"` : ''}${p.arrowStart ? ` marker-start="url(#${markerId(p.stroke ?? '#000')})"` : ''}`
      return `<path d="${p.d}" fill="${p.fill ?? 'none'}"${p.stroke ? ` stroke="${p.stroke}" stroke-width="${n(p.sw ?? 1)}" stroke-linejoin="round"` : ''}${p.dash ? ` stroke-dasharray="${DASH}"` : ''}${p.opacity !== undefined ? ` opacity="${p.opacity}"` : ''}${markers}/>`
    }
    case 'rect':
      return `<rect x="${n(p.x)}" y="${n(p.y)}" width="${n(p.w)}" height="${n(p.h)}"${p.rx ? ` rx="${n(p.rx)}"` : ''} fill="${p.fill ?? 'none'}"${p.stroke ? ` stroke="${p.stroke}" stroke-width="${n(p.sw ?? 1)}"` : ''}${p.dash ? ` stroke-dasharray="${DASH}"` : ''}${p.opacity !== undefined ? ` opacity="${p.opacity}"` : ''}/>`
    case 'line':
      return `<line x1="${n(p.x1)}" y1="${n(p.y1)}" x2="${n(p.x2)}" y2="${n(p.y2)}" stroke="${p.stroke}" stroke-width="${n(p.sw)}"${p.dash ? ` stroke-dasharray="${DASH}"` : ''}/>`
    case 'text':
      return `<text x="${n(p.x)}" y="${n(p.y)}" font-family="${FONT_FAMILY}" font-size="${n(p.size)}"${p.bold ? ' font-weight="700"' : ''} fill="${p.color}"${p.anchor && p.anchor !== 'start' ? ` text-anchor="${p.anchor}"` : ''}${p.halo ? ` stroke="${p.halo}" stroke-width="4" stroke-linejoin="round" paint-order="stroke"` : ''} xml:space="preserve">${esc(p.text)}</text>`
  }
}

/** Arrowhead identical to React Flow's "arrowclosed" marker at width/height 18. */
export function markerDef(color: string) {
  return `<marker id="${markerId(color)}" viewBox="-10 -10 20 20" markerWidth="18" markerHeight="18" refX="0" refY="0" orient="auto-start-reverse"><polyline points="-5,-4 0,0 -5,4 -5,-4" fill="${color}" stroke="${color}" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"/></marker>`
}

export function offsetPrim(p: Prim, dx: number, dy: number): Prim {
  switch (p.t) {
    case 'rect':
      return { ...p, x: p.x + dx, y: p.y + dy }
    case 'line':
      return { ...p, x1: p.x1 + dx, y1: p.y1 + dy, x2: p.x2 + dx, y2: p.y2 + dy }
    case 'text':
      return { ...p, x: p.x + dx, y: p.y + dy }
    case 'path':
      return { ...p, d: translatePath(p.d, dx, dy) }
  }
}

/** Translate an absolute-coordinate SVG path (M, L, H, V, C, Q, A, Z). */
export function translatePath(d: string, dx: number, dy: number): string {
  const tokens = d.match(/[a-zA-Z]|-?\d*\.?\d+(?:e[-+]?\d+)?/g) ?? []
  const out: string[] = []
  let cmd = ''
  let idx = 0
  for (const tok of tokens) {
    if (/[a-zA-Z]/.test(tok)) {
      cmd = tok
      idx = 0
      out.push(tok)
      continue
    }
    const v = parseFloat(tok)
    let r = v
    if (cmd === 'H') r = v + dx
    else if (cmd === 'V') r = v + dy
    else if (cmd === 'A') {
      const k = idx % 7
      if (k === 5) r = v + dx
      else if (k === 6) r = v + dy
    } else if ('MLCQST'.includes(cmd)) r = idx % 2 === 0 ? v + dx : v + dy
    idx++
    out.push(n(r))
  }
  return out.join(' ')
}

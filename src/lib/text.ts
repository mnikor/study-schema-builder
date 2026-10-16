/** Text measurement and wrapping shared by the canvas and every exporter. */

export const FONT_FAMILY = 'Arial, Helvetica, sans-serif'

let ctx: CanvasRenderingContext2D | null = null
const cache = new Map<string, number>()

export function measure(text: string, size: number, bold = false): number {
  const key = `${bold ? 'b' : 'n'}${size}|${text}`
  const hit = cache.get(key)
  if (hit !== undefined) return hit
  if (!ctx) ctx = document.createElement('canvas').getContext('2d')
  let w: number
  if (ctx) {
    ctx.font = `${bold ? 700 : 400} ${size}px ${FONT_FAMILY}`
    w = ctx.measureText(text).width
  } else {
    w = text.length * size * 0.52
  }
  if (cache.size > 20000) cache.clear()
  cache.set(key, w)
  return w
}

const BULLET_RE = /^\s*(?:[•\-–*·])\s+/

/** Wrap text into lines that fit maxWidth. Keeps explicit newlines and bullet lists. */
export function wrap(text: string, maxWidth: number, size: number, bold = false): string[] {
  const out: string[] = []
  const width = Math.max(20, maxWidth)
  for (const para of text.replace(/\r/g, '').split('\n')) {
    if (!para.trim()) {
      out.push('')
      continue
    }
    const bullet = BULLET_RE.test(para)
    const body = bullet ? para.replace(BULLET_RE, '') : para.trim()
    const first = bullet ? '• ' : ''
    const cont = bullet ? '   ' : ''
    let line = first
    let fresh = true
    for (const word of body.split(/[ \t]+/)) {
      const candidate = fresh ? line + word : `${line} ${word}`
      if (fresh || measure(candidate, size, bold) <= width) {
        line = candidate
        fresh = false
        // hard-break a single word that is wider than the box
        while (measure(line, size, bold) > width && line.length > 4) {
          let cut = line.length - 1
          while (cut > 1 && measure(line.slice(0, cut), size, bold) > width) cut--
          out.push(line.slice(0, cut))
          line = cont + line.slice(cut)
        }
      } else {
        out.push(line)
        line = cont + word
      }
    }
    out.push(line)
  }
  while (out.length > 1 && out[out.length - 1] === '') out.pop()
  return out
}

export const lineHeight = (size: number) => Math.round(size * 1.28 * 10) / 10

export function widestLine(lines: string[], size: number, bold = false) {
  return lines.reduce((m, l) => Math.max(m, measure(l, size, bold)), 0)
}

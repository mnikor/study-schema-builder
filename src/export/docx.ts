import {
  AlignmentType,
  Document,
  ImageRun,
  Packer,
  PageOrientation,
  Paragraph,
} from 'docx'
import type { Diagram } from '../types'
import type { Theme } from '../lib/catalog'
import { orientationOf, pageSize } from '../lib/layout'
import { svgToPng } from './png'
import { diagramToSvg } from './svg'

const MM_TWIP = 56.6929
const MARGIN_MM = 15
const pxFromMm = (mm: number) => (mm / 25.4) * 96

export async function exportDocx(diagrams: Diagram[], theme: Theme, opts: { fileName: string }) {
  const sections = []
  for (const d of diagrams) {
    const page = d.settings.page === 'letter' ? 'letter' : 'a4'
    const orient = orientationOf(d)
    const ps = pageSize(page, orient)
    const landscape = orient === 'landscape'
    const cwPx = pxFromMm(ps.w - 2 * MARGIN_MM)
    const chPx = pxFromMm(ps.h - 2 * MARGIN_MM) - 24
    const children: Paragraph[] = []
    const { svg, width, height } = diagramToSvg(d, theme, '#ffffff')
    const png = await svgToPng(svg, width, height, 3)
    const k = Math.min(cwPx / width, chPx / height)
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new ImageRun({
            type: 'svg',
            data: new TextEncoder().encode(svg),
            fallback: { type: 'png', data: new Uint8Array(await png.arrayBuffer()) },
            transformation: { width: Math.round(width * k), height: Math.round(height * k) },
            altText: { name: d.name, title: d.settings.title || d.name, description: `${d.name} figure` },
          }),
        ],
      }),
    )
    const portraitW = Math.min(ps.w, ps.h)
    const portraitH = Math.max(ps.w, ps.h)
    sections.push({
      properties: {
        page: {
          size: { orientation: landscape ? PageOrientation.LANDSCAPE : PageOrientation.PORTRAIT, width: Math.round(portraitW * MM_TWIP), height: Math.round(portraitH * MM_TWIP) },
          margin: { top: Math.round(MARGIN_MM * MM_TWIP), bottom: Math.round(MARGIN_MM * MM_TWIP), left: Math.round(MARGIN_MM * MM_TWIP), right: Math.round(MARGIN_MM * MM_TWIP) },
        },
      },
      children,
    })
  }
  const doc = new Document({ creator: 'Study Schema Builder', title: diagrams[0]?.settings.title ?? 'Study schema', styles: { default: { document: { run: { font: 'Arial' } } } }, sections })
  return Packer.toBlob(doc)
}

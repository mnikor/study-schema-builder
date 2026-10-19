import { Download, FileCode, FileText, Image, LoaderCircle, Presentation, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { PageId } from '../types'
import { PAGES } from '../lib/catalog'
import { fitScale, orientationOf, pageSize } from '../lib/layout'
import { useActive, useStore, useTheme } from '../store'
import { diagramToSvg, download, safeName } from '../export/svg'
import { svgToPng } from '../export/png'
import { Field, Segmented, Select } from './ui'

type Fmt = 'pptx' | 'docx' | 'png' | 'svg'

const FORMATS: { id: Fmt; label: string; icon: React.ReactNode; hint: string }[] = [
  { id: 'pptx', label: 'PowerPoint', icon: <Presentation size={18} />, hint: 'Editable shapes, text and arrows, one slide per page' },
  { id: 'docx', label: 'Word', icon: <FileText size={18} />, hint: 'Vector figure (SVG with PNG fallback) fitted to the page' },
  { id: 'png', label: 'PNG', icon: <Image size={18} />, hint: 'High-resolution image' },
  { id: 'svg', label: 'SVG', icon: <FileCode size={18} />, hint: 'Vector file for Illustrator, Inkscape, web' },
]

export function ExportDialog() {
  const d = useActive()
  const theme = useTheme()
  const project = useStore((s) => s.project)
  const { setUI, updateDiagram, toast, relayout } = useStore.getState()
  const [fmt, setFmt] = useState<Fmt>('pptx')
  const [scope, setScope] = useState<'page' | 'all'>('page')
  const [scale, setScale] = useState('3')
  const [bg, setBg] = useState<'white' | 'transparent'>('white')
  const [pptMode, setPptMode] = useState<'editable' | 'image'>('editable')
  const [busy, setBusy] = useState(false)

  const preview = useMemo(() => diagramToSvg(d, theme, '#ffffff'), [d, theme])
  const previewUrl = useMemo(() => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(preview.svg)}`, [preview])
  const pageId: PageId = fmt === 'docx' && d.settings.page !== 'letter' ? 'a4' : d.settings.page
  const orient = orientationOf(d)
  const ps = pageSize(pageId, orient, fmt === 'pptx')
  const kmm = fitScale({ ...d, settings: { ...d.settings, page: pageId } }, theme, orient)
  const minPt = ((d.settings.fontSize - 2) * kmm * 72) / 25.4
  const bodyPt = ((d.settings.fontSize - 1) * kmm * 72) / 25.4
  const pagesFor = scope === 'all' ? project.diagrams : [d]
  const base = `${safeName(project.title)}${scope === 'all' ? '' : `-${safeName(d.name)}`}`

  const run = async () => {
    setBusy(true)
    try {
      if (fmt === 'svg') {
        download(new Blob([diagramToSvg(d, theme, bg === 'white' ? '#ffffff' : null).svg], { type: 'image/svg+xml' }), `${base}.svg`)
      } else if (fmt === 'png') {
        const { svg, width, height } = diagramToSvg(d, theme, bg === 'white' ? '#ffffff' : null)
        download(await svgToPng(svg, width, height, Number(scale), bg === 'white' ? '#ffffff' : null), `${base}.png`)
      } else if (fmt === 'pptx') {
        const { exportPptx } = await import('../export/pptx')
        await exportPptx(pagesFor, theme, { mode: pptMode, fileName: `${base}.pptx` })
      } else {
        const { exportDocx } = await import('../export/docx')
        download(await exportDocx(pagesFor, theme, { fileName: `${base}.docx` }), `${base}.docx`)
      }
      toast('Export ready', 'ok')
    } catch (e) {
      console.error(e)
      toast(`Export failed: ${(e as Error).message}`, 'error')
    } finally {
      setBusy(false)
    }
  }

  const pageOptions = (fmt === 'docx' ? PAGES.filter((p) => p.id === 'a4' || p.id === 'letter') : PAGES).map((p) => ({ value: p.id as PageId, label: p.label }))
  const multi = fmt === 'pptx' || fmt === 'docx'
  const ratio = ps.w / ps.h

  return (
    <div className="modal-bg" onMouseDown={() => setUI({ exportOpen: false })}>
      <div className="modal export" onMouseDown={(e) => e.stopPropagation()}>
        <header>
          <h2>Export</h2>
          <button className="icon-btn" onClick={() => setUI({ exportOpen: false })}>
            <X size={16} />
          </button>
        </header>
        <div className="export-body">
          <div className="export-opts">
            <div className="fmt-grid">
              {FORMATS.map((f) => (
                <button key={f.id} className={`fmt${fmt === f.id ? ' on' : ''}`} onClick={() => setFmt(f.id)} title={f.hint}>
                  {f.icon}
                  <span>{f.label}</span>
                </button>
              ))}
            </div>
            <p className="hint">{FORMATS.find((f) => f.id === fmt)!.hint}</p>
            {multi && (
              <Field label="Pages">
                <Segmented value={scope} onChange={setScope} options={[{ value: 'page', label: 'This page' }, { value: 'all', label: `All pages (${project.diagrams.length})` }]} />
              </Field>
            )}
            {multi && (
              <>
                <Field label="Orientation" hint={d.settings.orientation && d.settings.orientation !== 'auto' ? undefined : `Auto chose ${orient}${d.layoutInfo && d.layoutInfo.rows > 1 ? ` with ${d.layoutInfo.rows} ${d.direction === 'LR' ? 'rows' : 'columns'}` : ''}.`}>
                  <Segmented
                    value={d.settings.orientation ?? 'auto'}
                    onChange={(v) => {
                      updateDiagram((dd) => ({ ...dd, settings: { ...dd.settings, orientation: v, lockDirection: false } }), 'orient')
                      relayout(undefined, { history: false })
                    }}
                    options={[{ value: 'auto', label: 'Auto' }, { value: 'portrait', label: 'Portrait' }, { value: 'landscape', label: 'Landscape' }]}
                  />
                </Field>
                <Field label="Page size">
                  <Select<PageId>
                    value={fmt === 'docx' ? pageId : d.settings.page}
                    onChange={(v) => {
                      updateDiagram((dd) => ({ ...dd, settings: { ...dd.settings, page: v } }), 'page')
                      relayout(undefined, { history: false })
                    }}
                    options={fmt === 'docx' ? pageOptions : [{ value: 'auto', label: fmt === 'pptx' && orient === 'landscape' ? 'Auto (slide 16:9)' : 'Auto (A4)' }, ...pageOptions]}
                  />
                </Field>
              </>
            )}
            {fmt === 'pptx' && (
              <Field label="Slide content">
                <Segmented value={pptMode} onChange={setPptMode} options={[{ value: 'editable', label: 'Editable shapes' }, { value: 'image', label: 'Picture' }]} />
              </Field>
            )}
            {fmt === 'png' && (
              <Field label="Resolution">
                <Segmented value={scale} onChange={setScale} options={[{ value: '2', label: '2×' }, { value: '3', label: '3×' }, { value: '4', label: '4×' }]} />
              </Field>
            )}
            {(fmt === 'png' || fmt === 'svg') && (
              <Field label="Background">
                <Segmented value={bg} onChange={setBg} options={[{ value: 'white', label: 'White' }, { value: 'transparent', label: 'Transparent' }]} />
              </Field>
            )}
            {multi && (
              <div className={`fit-info${minPt < 7 ? ' warn' : ''}`}>
                On {ps.label} {orient} this page prints with body text at ≈{bodyPt.toFixed(1)} pt (smallest ≈{minPt.toFixed(1)} pt).
                {minPt < 7 && ' Consider “Fit to page”, a vertical layout, or fewer words per box.'}
                {minPt < 7 && (d.settings.rows ?? 0) > 0 && ' Set Rows to Auto in page settings to let long chains wrap.'}
              </div>
            )}
            <button className="btn primary wide" disabled={busy} onClick={run}>
              {busy ? <LoaderCircle className="spin" size={15} /> : <Download size={15} />} Download {fmt.toUpperCase()}
            </button>
          </div>
          <div className="export-preview">
            <div className="page-frame" style={multi ? { aspectRatio: String(ratio) } : undefined}>
              <img src={previewUrl} alt="Export preview" />
            </div>
            <small>{multi ? `${ps.label} ${orient} preview` : `${Math.round(preview.width)} × ${Math.round(preview.height)} px at 1×`}</small>
          </div>
        </div>
      </div>
    </div>
  )
}

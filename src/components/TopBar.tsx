import { ArrowDown, ArrowRight, Download, FilePlus, FolderOpen, LayoutGrid, PanelLeft, PanelRight, Redo2, Save, Scan, Undo2 } from 'lucide-react'
import { useRef } from 'react'
import type { Project } from '../types'
import { useActive, useStore } from '../store'
import { download, safeName } from '../export/svg'
import { sanitizeModel } from '../lib/ai'

export function TopBar() {
  const d = useActive()
  const title = useStore((s) => s.project.title)
  const canUndo = useStore((s) => s.past.length > 0)
  const canRedo = useStore((s) => s.future.length > 0)
  const ui = useStore((s) => s.ui)
  const { undo, redo, setUI, update, setDirection, relayout, fitPage, toast, setProject } = useStore.getState()
  const fileRef = useRef<HTMLInputElement>(null)

  const save = () => {
    const p = useStore.getState().project
    download(new Blob([JSON.stringify(p, null, 2)], { type: 'application/json' }), `${safeName(p.title)}.schema.json`)
  }
  const open = async (f: File | undefined) => {
    if (!f) return
    try {
      const p = JSON.parse(await f.text()) as Project
      if (p.version !== 1 || !Array.isArray(p.diagrams)) throw new Error('Not a Study Schema Builder project file.')
      await setProject({ ...p, model: sanitizeModel(p.model) })
      toast(`Opened ${f.name}`, 'ok')
    } catch (e) {
      toast(String((e as Error).message || e), 'error')
    }
  }

  return (
    <header className="topbar">
      <div className="brand">
        <svg width="26" height="26" viewBox="0 0 32 32" aria-hidden>
          <rect x="2" y="11" width="8" height="10" rx="2" fill="#1f5fa8" />
          <rect x="22" y="4" width="8" height="9" rx="2" fill="#0e8a7a" />
          <rect x="22" y="19" width="8" height="9" rx="2" fill="#c2410c" />
          <path d="M10 16h6v-7.5h6M16 16v7.5h6" stroke="#334155" strokeWidth="2" fill="none" />
        </svg>
        <span className="brand-name">Study Schema Builder</span>
      </div>
      <input className="title-input" value={title} onChange={(e) => update((p) => ({ ...p, title: e.target.value }), 'ptitle')} title="Project name" />
      <div className="tb-group">
        <button className="tb-btn" title="New from template" onClick={() => setUI({ templatesOpen: true })}>
          <FilePlus size={16} /> <span>New</span>
        </button>
        <button className="tb-btn" title="Open project file (.json)" onClick={() => fileRef.current?.click()}>
          <FolderOpen size={16} /> <span>Open</span>
        </button>
        <input ref={fileRef} type="file" accept=".json" hidden onChange={(e) => { open(e.target.files?.[0]); e.target.value = '' }} />
        <button className="tb-btn" title="Save project file (.json)" onClick={save}>
          <Save size={16} /> <span>Save</span>
        </button>
      </div>
      <div className="tb-group">
        <button className="tb-btn icon" title="Undo (⌘Z)" disabled={!canUndo} onClick={undo}>
          <Undo2 size={16} />
        </button>
        <button className="tb-btn icon" title="Redo (⇧⌘Z)" disabled={!canRedo} onClick={redo}>
          <Redo2 size={16} />
        </button>
      </div>
      <div className="tb-spacer" />
      {d && (
        <div className="tb-group">
          <div className="seg tb-seg" title="Orientation">
            <button className={d.direction === 'LR' ? 'on' : ''} onClick={() => setDirection('LR')} title="Horizontal (left → right)">
              <ArrowRight size={15} /> Horizontal
            </button>
            <button className={d.direction === 'TB' ? 'on' : ''} onClick={() => setDirection('TB')} title="Vertical (top → bottom)">
              <ArrowDown size={15} /> Vertical
            </button>
          </div>
          <button className="tb-btn" title="Tidy the layout of this page" onClick={() => relayout()}>
            <LayoutGrid size={16} /> <span>Auto-arrange</span>
          </button>
          <button className="tb-btn" title="Try box widths and spacing to fill the export page" onClick={() => fitPage()}>
            <Scan size={16} /> <span>Fit to page</span>
          </button>
        </div>
      )}
      <button className="btn primary" onClick={() => setUI({ exportOpen: true })}>
        <Download size={15} /> Export
      </button>
      <div className="tb-group">
        <button className={`tb-btn icon${ui.showLeft ? ' on' : ''}`} title="Toggle study panel" onClick={() => setUI({ showLeft: !ui.showLeft })}>
          <PanelLeft size={16} />
        </button>
        <button className={`tb-btn icon${ui.showRight ? ' on' : ''}`} title="Toggle inspector" onClick={() => setUI({ showRight: !ui.showRight })}>
          <PanelRight size={16} />
        </button>
      </div>
    </header>
  )
}

import { ReactFlowProvider } from '@xyflow/react'
import { LoaderCircle } from 'lucide-react'
import { useEffect } from 'react'
import { Canvas } from './canvas/Canvas'
import { copySelection, duplicateSelection, paste } from './canvas/actions'
import { ChecksPanel } from './components/ChecksPanel'
import { ExportDialog } from './components/ExportDialog'
import { Inspector } from './components/Inspector'
import { PageTabs } from './components/PageTabs'
import { StudyPanel } from './components/StudyPanel'
import { TemplatesDialog } from './components/TemplatesDialog'
import { TopBar } from './components/TopBar'
import { health } from './lib/ai'
import { runChecks } from './lib/checks'
import { needsLayout, useStore } from './store'

function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (t.closest('input, textarea, select, [contenteditable="true"]')) return
      const s = useStore.getState()
      const mod = e.metaKey || e.ctrlKey
      const k = e.key.toLowerCase()
      if (mod && k === 'z') {
        e.preventDefault()
        if (e.shiftKey) s.redo()
        else s.undo()
      } else if (mod && k === 'y') {
        e.preventDefault()
        s.redo()
      } else if (mod && k === 'd') {
        e.preventDefault()
        duplicateSelection()
      } else if (mod && k === 'c') {
        copySelection()
      } else if (mod && k === 'v') {
        paste()
      } else if (e.key === 'Enter') {
        const d = s.project.diagrams.find((x) => x.id === s.project.activeId)
        const sel = d?.nodes.filter((n) => n.selected) ?? []
        if (sel.length === 1 && sel[0].type === 'shape') {
          e.preventDefault()
          useStore.setState({ editingNode: sel[0].id })
        }
      } else if (e.key === 'Escape') {
        useStore.setState({ editingNode: null, selectedBand: null })
        s.setUI({ exportOpen: false, templatesOpen: false })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}

function LeftPanel() {
  const tab = useStore((s) => s.ui.leftTab)
  const project = useStore((s) => s.project)
  const setUI = useStore((s) => s.setUI)
  const reports = runChecks(project)
  const issues = reports.flatMap((r) => r.items).filter((i) => i.status === 'fail' || i.status === 'warn').length
  return (
    <aside className="panel left">
      <div className="panel-tabs">
        <button className={tab === 'study' ? 'on' : ''} onClick={() => setUI({ leftTab: 'study' })}>
          Study
        </button>
        <button className={tab === 'checks' ? 'on' : ''} onClick={() => setUI({ leftTab: 'checks' })}>
          Guidelines {issues > 0 && <span className="badge warn">{issues}</span>}
        </button>
      </div>
      <div className="panel-scroll">{tab === 'study' ? <StudyPanel /> : <ChecksPanel />}</div>
    </aside>
  )
}

export default function App() {
  const ui = useStore((s) => s.ui)
  useShortcuts()

  useEffect(() => {
    health().then((h) => useStore.getState().setHealth(h))
    if (useStore.getState().project.diagrams.some(needsLayout)) useStore.getState().relayoutAll()
  }, [])

  return (
    <div className="app">
      <TopBar />
      <div className="main">
        {ui.showLeft && <LeftPanel />}
        <div className="center">
          <PageTabs />
          <div className="canvas-wrap">
            <ReactFlowProvider>
              <Canvas />
            </ReactFlowProvider>
          </div>
        </div>
        {ui.showRight && <Inspector />}
      </div>
      {ui.exportOpen && <ExportDialog />}
      {ui.templatesOpen && <TemplatesDialog />}
      {ui.toast && <div className={`toast ${ui.toast.kind}`}>{ui.toast.text}</div>}
      {ui.busy && (
        <div className="busy">
          <LoaderCircle className="spin" size={18} /> {ui.busy}
        </div>
      )}
    </div>
  )
}

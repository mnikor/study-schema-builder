import { CalendarRange, ChartGantt, GitBranch, ListOrdered, Plus, RefreshCw, Trash2, Workflow } from 'lucide-react'
import { useState } from 'react'
import type { LayoutKind } from '../types'
import { LAYOUTS } from '../lib/catalog'
import { useStore } from '../store'

export const LAYOUT_ICON: Record<LayoutKind, React.ReactNode> = {
  schema: <Workflow size={14} />,
  flow: <ListOrdered size={14} />,
  lines: <GitBranch size={14} />,
  windows: <CalendarRange size={14} />,
  timeline: <ChartGantt size={14} />,
}

export function PageTabs() {
  const diagrams = useStore((s) => s.project.diagrams)
  const activeId = useStore((s) => s.project.activeId)
  const { setActive, addPage, removePage, regeneratePage, updateDiagram } = useStore.getState()
  const [menu, setMenu] = useState(false)
  const active = diagrams.find((d) => d.id === activeId)

  return (
    <div className="tabs">
      {diagrams.map((d) => (
        <button
          key={d.id}
          className={`tab${d.id === activeId ? ' on' : ''}`}
          onClick={() => setActive(d.id)}
          onDoubleClick={() => {
            const name = prompt('Page name', d.name)
            if (name) updateDiagram((dd) => ({ ...dd, name }), 'rename', d.id)
          }}
          title={`${LAYOUTS.find((l) => l.id === d.layout)!.label} — double-click to rename`}
        >
          {LAYOUT_ICON[d.layout]}
          <span>{d.name}</span>
        </button>
      ))}
      <div className="tab-add">
        <button className="tab ghost" onClick={() => setMenu(!menu)} title="Add a page">
          <Plus size={14} /> Page
        </button>
        {menu && (
          <div className="menu" onMouseLeave={() => setMenu(false)}>
            {LAYOUTS.map((l) => (
              <button
                key={l.id}
                onClick={() => {
                  setMenu(false)
                  addPage(l.id)
                }}
              >
                {LAYOUT_ICON[l.id]}
                <span>
                  <b>{l.label}</b>
                  <small>{l.hint}</small>
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="tb-spacer" />
      {active && (
        <>
          <button
            className="tab ghost"
            title="Rebuild this page from the study details"
            onClick={() => {
              if (!active.edited || confirm('Rebuild this page from the study details? Your manual edits on it will be replaced (you can undo).')) regeneratePage(active.id)
            }}
          >
            <RefreshCw size={13} /> Rebuild page
          </button>
          <button
            className="tab ghost danger"
            disabled={diagrams.length < 2}
            title="Delete this page"
            onClick={() => {
              if (confirm(`Delete page “${active.name}”?`)) removePage(active.id)
            }}
          >
            <Trash2 size={13} />
          </button>
        </>
      )}
    </div>
  )
}

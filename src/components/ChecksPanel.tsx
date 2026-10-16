import { CircleAlert, CircleCheck, CircleX, Info, Plus } from 'lucide-react'
import { useMemo } from 'react'
import type { GuidelineId } from '../types'
import { GUIDELINES } from '../lib/catalog'
import { runChecks, type Status } from '../lib/checks'
import { useStore } from '../store'
import { Section } from './ui'

const ICON: Record<Status, React.ReactNode> = {
  pass: <CircleCheck size={15} className="st-pass" />,
  warn: <CircleAlert size={15} className="st-warn" />,
  fail: <CircleX size={15} className="st-fail" />,
  info: <Info size={15} className="st-info" />,
}

export function ChecksPanel() {
  const project = useStore((s) => s.project)
  const update = useStore((s) => s.update)
  const addPage = useStore((s) => s.addPage)
  const reports = useMemo(() => runChecks(project), [project])
  const toggle = (g: GuidelineId) =>
    update((p) => ({ ...p, guidelines: p.guidelines.includes(g) ? p.guidelines.filter((x) => x !== g) : [...p.guidelines, g] }), 'guidelines')
  const total = reports.flatMap((r) => r.items)
  const passed = total.filter((i) => i.status === 'pass').length

  return (
    <>
      <Section title="Reporting guidelines">
        <div className="chips">
          {GUIDELINES.map((g) => (
            <button key={g.id} className={`chip${project.guidelines.includes(g.id) ? ' on' : ''}`} title={`${g.scope}\nFigure: ${g.figure}`} onClick={() => toggle(g.id)}>
              {g.name}
            </button>
          ))}
        </div>
        <p className="hint">
          {total.length ? `${passed} of ${total.length} figure items covered.` : 'Choose the guidelines your figures should follow.'} These checks cover what the figures show; they do not replace the full checklist.
        </p>
      </Section>
      {reports.map((r) => (
        <Section key={r.guideline.id} title={r.guideline.name} right={<span className="badge">{r.items.filter((i) => i.status === 'pass').length}/{r.items.length}</span>}>
          <p className="hint">{r.guideline.figure}</p>
          <ul className="checks">
            {r.items.map((i) => (
              <li key={i.id}>
                {ICON[i.status]}
                <div>
                  <span>{i.text}</span>
                  {i.note && <small>{i.note}</small>}
                  {i.fix && (
                    <button className="btn ghost sm" onClick={() => addPage(i.fix!.layout)}>
                      <Plus size={12} /> {i.fix.label}
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
          <p className="ref">{r.guideline.reference}</p>
        </Section>
      ))}
    </>
  )
}

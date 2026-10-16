import { X } from 'lucide-react'
import { useState } from 'react'
import type { StudyTypeId } from '../types'
import { STUDY_TYPES, guidelineInfo, studyTypeInfo } from '../lib/catalog'
import { TEMPLATES, blankModel } from '../lib/templates'
import { guidelinesFor, recommendedLayouts } from '../lib/generate'
import { useStore } from '../store'
import { LAYOUT_ICON } from './PageTabs'
import { Select } from './ui'

export function TemplatesDialog() {
  const { setUI, loadModel } = useStore.getState()
  const [blankType, setBlankType] = useState<StudyTypeId>('rct-parallel')
  const close = () => setUI({ templatesOpen: false })
  const categories = [...new Set(TEMPLATES.map((t) => studyTypeInfo(t.model.studyType).category))]

  return (
    <div className="modal-bg" onMouseDown={close}>
      <div className="modal templates" onMouseDown={(e) => e.stopPropagation()}>
        <header>
          <h2>Start a new study</h2>
          <button className="icon-btn" onClick={close}>
            <X size={16} />
          </button>
        </header>
        <p className="hint">Pick an example design to start from (synthetic content — replace it with your study), or start blank. To build from a synopsis or protocol, close this and use “Study information” on the left.</p>
        {categories.map((c) => (
          <div key={c}>
            <h3>{c}</h3>
            <div className="tpl-grid">
              {TEMPLATES.filter((t) => studyTypeInfo(t.model.studyType).category === c).map((t) => (
                <button
                  key={t.id}
                  className="tpl"
                  onClick={async () => {
                    close()
                    await loadModel(structuredClone(t.model), { method: 'template', at: new Date().toISOString() })
                  }}
                >
                  <b>{t.name}</b>
                  <small>{studyTypeInfo(t.model.studyType).label}</small>
                  <span className="tpl-meta">
                    {recommendedLayouts(t.model).map((l) => (
                      <span key={l} title={l}>
                        {LAYOUT_ICON[l]}
                      </span>
                    ))}
                    <em>{guidelinesFor(t.model).map((g) => guidelineInfo(g).name).join(' · ')}</em>
                  </span>
                </button>
              ))}
            </div>
          </div>
        ))}
        <h3>Blank</h3>
        <div className="blank-row">
          <Select<StudyTypeId> value={blankType} onChange={setBlankType} options={STUDY_TYPES.map((s) => ({ value: s.id, label: s.label, group: s.category }))} />
          <button
            className="btn"
            onClick={async () => {
              close()
              const m = blankModel(blankType)
              m.population.description = 'Describe the population'
              await loadModel(m, { method: 'manual', at: new Date().toISOString() })
            }}
          >
            Start blank
          </button>
        </div>
      </div>
    </div>
  )
}

import { FileText, FileUp, LoaderCircle, RefreshCw, Sparkles, TriangleAlert, Wand2, X } from 'lucide-react'
import { useRef, useState } from 'react'
import enums from '../../shared/enums.json'
import type { ArmKind, FlowStep, PeriodKind, StudyArm, StudyModel, StudyPeriod, StudyTypeId, TherapyLine, TimeWindow, WindowKind } from '../types'
import { STUDY_TYPES, studyTypeInfo } from '../lib/catalog'
import { analyzeWithAI, loadUserKey, saveUserKey, type Progress, type UserKey } from '../lib/ai'
import { uid } from '../lib/generate'
import { localDraft } from '../lib/localDraft'
import { focusText, readFile, type ReadResult } from '../lib/readFile'
import { useStore } from '../store'
import { Area, Field, ListEditor, Num, Section, Segmented, Select, Text, Toggle, csv, fromCsv, fromLines, lines } from './ui'

const typeOptions = STUDY_TYPES.map((t) => ({ value: t.id, label: t.label, group: t.category }))

function ImportCard() {
  const health = useStore((s) => s.health)
  const loadModel = useStore((s) => s.loadModel)
  const toast = useStore((s) => s.toast)
  const [file, setFile] = useState<ReadResult | null>(null)
  const [text, setText] = useState('')
  const [studyType, setStudyType] = useState<StudyTypeId | 'auto'>('auto')
  const [depth, setDepth] = useState<'fast' | 'thorough'>('fast')
  const [reading, setReading] = useState(false)
  const [progress, setProgress] = useState<Progress | null>(null)
  const [drag, setDrag] = useState(false)
  const [userKey, setUserKeyState] = useState<UserKey>(() => loadUserKey())
  const setUserKey = (k: UserKey) => {
    setUserKeyState(k)
    saveUserKey(k)
  }
  const aiReady = health.ai || !!userKey.key.trim()
  const abort = useRef<AbortController | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const running = !!abort.current && !!progress

  const onFile = async (f: File | undefined) => {
    if (!f) return
    setReading(true)
    try {
      const r = await readFile(f)
      if (!r.text.trim() && r.kind !== 'pdf') throw new Error('No text found in this file.')
      setFile(r)
    } catch (e) {
      toast(String((e as Error).message || e), 'error')
    } finally {
      setReading(false)
    }
  }

  const source = () => [file?.text ?? '', text.trim() ? `\n\nAdditional information from the user:\n${text}` : ''].join('')

  const runAI = async () => {
    const ctl = new AbortController()
    abort.current = ctl
    setProgress({ stage: 'sending', elapsed: 0 })
    try {
      const sendPdf = file?.kind === 'pdf' && (file.pages ?? 0) <= 40 && file.sizeMB <= 20 && !!file.base64
      const focused = focusText(source())
      const res = await analyzeWithAI(
        {
          ...(sendPdf ? { file: { name: file!.name, mime: 'application/pdf', data: file!.base64! }, text: text.trim() ? `Additional information from the user:\n${text}` : undefined } : { text: focused.text, truncated: focused.truncated }),
          fileName: file?.name,
          studyType,
          guidelines: [],
          depth,
        },
        setProgress,
        ctl.signal,
        health.ai ? undefined : userKey,
      )
      await loadModel(res.model, { method: 'ai', fileName: file?.name, at: new Date().toISOString(), model: res.aiModel })
      toast(`Built ${useStore.getState().project.diagrams.length} pages in ${res.elapsed}s — review the study details below.`, 'ok')
    } catch (e) {
      if ((e as Error).name !== 'AbortError') toast(String((e as Error).message || e), 'error')
    } finally {
      abort.current = null
      setProgress(null)
    }
  }

  const runLocal = async () => {
    const src = source()
    if (!src.trim()) return toast('Add a document or paste some text first.', 'error')
    await loadModel(localDraft(src, studyType), { method: 'local', fileName: file?.name, at: new Date().toISOString() })
    toast('Offline draft created from keyword rules — check the study details.', 'info')
  }

  const hasInput = !!file || !!text.trim()
  const stageText = progress
    ? progress.stage === 'sending'
      ? 'Sending to the model…'
      : progress.stage === 'thinking'
        ? `Reading the document… ${progress.elapsed}s`
        : `Writing the study model… ${progress.chars ? `${Math.round(progress.chars / 100) / 10}k chars` : ''} · ${progress.elapsed}s`
    : ''

  return (
    <Section title="1 · Study information">
      <div
        className={`drop${drag ? ' over' : ''}`}
        onDragOver={(e) => {
          e.preventDefault()
          setDrag(true)
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDrag(false)
          onFile(e.dataTransfer.files[0])
        }}
        onClick={() => input.current?.click()}
      >
        <input ref={input} type="file" hidden accept=".pdf,.docx,.txt,.md,.rtf" onChange={(e) => onFile(e.target.files?.[0])} />
        {reading ? (
          <span className="drop-msg">
            <LoaderCircle className="spin" size={16} /> Reading file…
          </span>
        ) : file ? (
          <span className="drop-file" onClick={(e) => e.stopPropagation()}>
            <FileText size={16} />
            <span>
              <b>{file.name}</b>
              <small>
                {file.kind.toUpperCase()} · {file.pages ? `${file.pages} pages · ` : ''}
                {Math.round(file.text.length / 1000)}k characters
              </small>
            </span>
            <button className="icon-btn" title="Remove file" onClick={() => setFile(null)}>
              <X size={14} />
            </button>
          </span>
        ) : (
          <span className="drop-msg">
            <FileUp size={18} /> Drop a synopsis or protocol (PDF, DOCX, TXT) or click to choose
          </span>
        )}
      </div>
      <Area rows={4} value={text} onChange={setText} placeholder="…or describe the study / paste the synopsis here (arms, randomisation, periods, follow-up, data sources, index date…)" />
      <div className="row2">
        <Field label="Study type">
          <Select<StudyTypeId | 'auto'> value={studyType} onChange={setStudyType} options={[{ value: 'auto', label: 'Detect automatically' }, ...typeOptions]} />
        </Field>
        <Field label="AI depth">
          <Segmented value={depth} onChange={setDepth} options={[{ value: 'fast', label: 'Fast', title: 'Low reasoning effort — usually under a minute' }, { value: 'thorough', label: 'Thorough', title: 'Medium reasoning effort — slower, better for long protocols' }]} />
        </Field>
      </div>
      <div className="actions">
        {running ? (
          <button className="btn" onClick={() => abort.current?.abort()}>
            <X size={14} /> Cancel
          </button>
        ) : (
          <button className="btn primary" disabled={!hasInput || !aiReady} onClick={runAI} title={aiReady ? '' : 'Add an OpenAI key below to use AI'}>
            <Sparkles size={14} /> Analyse with AI
          </button>
        )}
        <button className="btn ghost" disabled={!hasInput || running} onClick={runLocal} title="Keyword rules, no data leaves this computer">
          <Wand2 size={14} /> Offline draft
        </button>
      </div>
      {progress && (
        <div className="progress">
          <LoaderCircle className="spin" size={14} /> {stageText}
        </div>
      )}
      <p className="hint">
        {health.ai ? (
          <>
            AI: OpenAI <b>{health.model}</b>
            {health.keySource ? ` · key from ${health.keySource}` : ''}. Short PDFs are sent whole; long ones are trimmed to their design sections.
          </>
        ) : (
          <>No server key here. Use your own OpenAI key below, or Offline draft and the templates (no data leaves the browser).</>
        )}
      </p>
      {!health.ai && (
        <div className="byo">
          <Field label="Your OpenAI API key" hint="Kept in this browser and sent only to api.openai.com. Usage is billed to your OpenAI account. Avoid “remember” on shared computers.">
            <input className="inp" type="password" autoComplete="off" spellCheck={false} placeholder="sk-…" value={userKey.key} onChange={(e) => setUserKey({ ...userKey, key: e.target.value.trim() })} />
          </Field>
          <div className="row2">
            <Field label="Model">
              <Text value={userKey.model} onChange={(v) => setUserKey({ ...userKey, model: v })} />
            </Field>
            <Toggle checked={userKey.remember} onChange={(v) => setUserKey({ ...userKey, remember: v })} label="Remember on this device" />
          </div>
        </div>
      )}
    </Section>
  )
}

/* ------------------------------------------------------------------ */

function ModelForm() {
  const model = useStore((s) => s.project.model)
  const source = useStore((s) => s.project.source)
  const anyEdited = useStore((s) => s.project.diagrams.some((d) => d.edited))
  const update = useStore((s) => s.update)
  const set = <K extends keyof StudyModel>(k: K, v: StudyModel[K]) => update((p) => ({ ...p, model: { ...p.model, [k]: v } }), `model:${String(k)}`)
  const m = model
  const rebuild = () => {
    if (!anyEdited || confirm('Rebuild all pages from these study details? Manual edits on the pages will be replaced (you can undo).')) useStore.getState().rebuildAll()
  }

  return (
    <>
      <div className="rebuild-bar">
        <span>
          {source?.method === 'ai' ? `From AI${source.fileName ? ` · ${source.fileName}` : ''}` : source?.method === 'local' ? 'Offline draft' : source?.method === 'template' ? 'Example template' : 'Study details'}
        </span>
        <button className="btn sm" onClick={rebuild} title="Regenerate every page from the details below">
          <RefreshCw size={13} /> Rebuild pages
        </button>
      </div>

      {(m.openQuestions.length > 0 || m.evidence.length > 0) && (
        <Section title={`Check before use (${m.openQuestions.length})`}>
          {m.openQuestions.map((q, i) => (
            <div key={i} className="question">
              <TriangleAlert size={13} /> {q}
            </div>
          ))}
          {m.evidence.length > 0 && (
            <details className="evidence">
              <summary>Supporting quotes from the document ({m.evidence.length})</summary>
              {m.evidence.map((e, i) => (
                <blockquote key={i}>
                  “{e.quote}” <small>{e.field}</small>
                </blockquote>
              ))}
            </details>
          )}
        </Section>
      )}

      <Section title="2 · Overview">
        <Field label="Title">
          <Area rows={2} value={m.title} onChange={(v) => set('title', v)} />
        </Field>
        <div className="row2">
          <Field label="Acronym">
            <Text value={m.acronym ?? ''} onChange={(v) => set('acronym', v || null)} />
          </Field>
          <Field label="Phase">
            <Text value={m.phase ?? ''} onChange={(v) => set('phase', v || null)} />
          </Field>
        </div>
        <Field label="Study type" hint={m.studyTypeRationale || studyTypeInfo(m.studyType).blurb}>
          <Select<StudyTypeId> value={m.studyType} onChange={(v) => set('studyType', v)} options={typeOptions} />
        </Field>
      </Section>

      <Section title="Population" defaultOpen={false}>
        <Field label="Description">
          <Area value={m.population.description} onChange={(v) => set('population', { ...m.population, description: v })} />
        </Field>
        <Field label="Target sample size">
          <Text value={m.population.targetN ?? ''} onChange={(v) => set('population', { ...m.population, targetN: v || null })} />
        </Field>
        <Field label="Key inclusion (one per line)">
          <Area value={lines(m.population.keyInclusion)} onChange={(v) => set('population', { ...m.population, keyInclusion: fromLines(v) })} />
        </Field>
      </Section>

      <Section title="Design & allocation" defaultOpen={false}>
        <Toggle checked={m.design.randomized} onChange={(v) => set('design', { ...m.design, randomized: v })} label="Randomised" />
        <div className="row2">
          <Field label="Allocation ratio">
            <Text value={m.design.allocationRatio ?? ''} onChange={(v) => set('design', { ...m.design, allocationRatio: v || null })} placeholder="e.g. 2:1" />
          </Field>
          <Field label="Blinding">
            <Text value={m.design.blinding ?? ''} onChange={(v) => set('design', { ...m.design, blinding: v || null })} />
          </Field>
        </div>
        <Field label="Stratification factors (comma-separated)">
          <Text value={csv(m.design.stratification)} onChange={(v) => set('design', { ...m.design, stratification: fromCsv(v) })} />
        </Field>
      </Section>

      <Section title={`Periods (${m.periods.length})`} defaultOpen={false}>
        <ListEditor<StudyPeriod>
          items={m.periods}
          onChange={(v) => set('periods', v)}
          addLabel="Period"
          make={() => ({ id: uid('p'), label: 'New period', kind: 'treatment', duration: null, startLabel: null })}
          render={(p, upd) => (
            <>
              <div className="row2">
                <Text value={p.label} onChange={(v) => upd({ ...p, label: v })} />
                <Select<PeriodKind> value={p.kind} onChange={(v) => upd({ ...p, kind: v })} options={enums.periodKinds.map((k) => ({ value: k, label: k }))} />
              </div>
              <div className="row2">
                <Text value={p.duration ?? ''} onChange={(v) => upd({ ...p, duration: v || null })} placeholder="Duration" />
                <Text value={p.startLabel ?? ''} onChange={(v) => upd({ ...p, startLabel: v || null })} placeholder="Starts at (e.g. Day 1)" />
              </div>
            </>
          )}
        />
      </Section>

      <Section title={`Arms / groups (${m.arms.length})`} defaultOpen={false}>
        <ListEditor<StudyArm>
          items={m.arms}
          onChange={(v) => set('arms', v)}
          addLabel="Arm"
          make={() => ({ id: uid('a'), label: 'New arm', kind: 'experimental', intervention: '', details: null, n: null, sequence: [], group: null })}
          render={(a, upd) => (
            <>
              <div className="row2">
                <Text value={a.label} onChange={(v) => upd({ ...a, label: v })} />
                <Select<ArmKind> value={a.kind} onChange={(v) => upd({ ...a, kind: v })} options={enums.armKinds.map((k) => ({ value: k, label: k }))} />
              </div>
              <Text value={a.intervention} onChange={(v) => upd({ ...a, intervention: v })} placeholder="Intervention / exposure (dose, route, schedule)" />
              <div className="row3">
                <Text value={a.n ?? ''} onChange={(v) => upd({ ...a, n: v || null })} placeholder="n" />
                <Text value={a.group ?? ''} onChange={(v) => upd({ ...a, group: v || null })} placeholder="Group / sub-study" />
                <Text value={csv(a.sequence)} onChange={(v) => upd({ ...a, sequence: fromCsv(v) })} placeholder="Crossover sequence" />
              </div>
            </>
          )}
        />
      </Section>

      <Section title={`Selection steps (${m.flowSteps.length})`} defaultOpen={false}>
        <ListEditor<FlowStep>
          items={m.flowSteps}
          onChange={(v) => set('flowSteps', v)}
          addLabel="Step"
          make={() => ({ id: uid('f'), label: 'New step', n: null, exclusions: [] })}
          render={(f, upd) => (
            <>
              <div className="row2">
                <Text value={f.label} onChange={(v) => upd({ ...f, label: v })} />
                <Text value={f.n ?? ''} onChange={(v) => upd({ ...f, n: v || null })} placeholder="n" />
              </div>
              <Area
                rows={2}
                value={f.exclusions.map((x) => (x.n ? `${x.label} | ${x.n}` : x.label)).join('\n')}
                onChange={(v) => upd({ ...f, exclusions: fromLines(v).map((l) => { const [label, n] = l.split('|').map((s) => s.trim()); return { label, n: n || null } }) })}
                placeholder="Exclusions, one per line (reason | n)"
              />
            </>
          )}
        />
      </Section>

      <Section title={`Lines of therapy (${m.lines.length})`} defaultOpen={false}>
        <ListEditor<TherapyLine>
          items={m.lines}
          onChange={(v) => set('lines', v)}
          addLabel="Line"
          make={() => ({ id: uid('l'), label: `${m.lines.length + 1}L`, regimens: [], transition: 'Progression' })}
          render={(l, upd) => (
            <>
              <div className="row2">
                <Text value={l.label} onChange={(v) => upd({ ...l, label: v })} />
                <Text value={l.transition ?? ''} onChange={(v) => upd({ ...l, transition: v || null })} placeholder="Transition to next line" />
              </div>
              <Area
                rows={2}
                value={l.regimens.map((r) => `${r.isStudyTreatment ? '* ' : ''}${r.label}`).join('\n')}
                onChange={(v) => upd({ ...l, regimens: fromLines(v).map((x) => ({ label: x.replace(/^\*\s*/, ''), details: null, isStudyTreatment: x.startsWith('*') })) })}
                placeholder="Regimens, one per line (* marks the study treatment)"
              />
            </>
          )}
        />
      </Section>

      <Section title={`Time windows (${m.windows.length})`} defaultOpen={false}>
        <Field label="Index date (Day 0)">
          <Text value={m.indexDate ?? ''} onChange={(v) => set('indexDate', v || null)} placeholder="e.g. first dispensing of drug X" />
        </Field>
        <ListEditor<TimeWindow>
          items={m.windows}
          onChange={(v) => set('windows', v)}
          addLabel="Window"
          make={() => ({ id: uid('w'), label: 'New window', kind: 'covariate', startDay: -365, endDay: -1, notes: null })}
          render={(w, upd) => (
            <>
              <div className="row2">
                <Text value={w.label} onChange={(v) => upd({ ...w, label: v })} />
                <Select<WindowKind> value={w.kind} onChange={(v) => upd({ ...w, kind: v })} options={enums.windowKinds.map((k) => ({ value: k, label: k }))} />
              </div>
              <div className="row2">
                <Num value={w.startDay} onChange={(v) => upd({ ...w, startDay: v })} placeholder="Start day (blank = open)" />
                <Num value={w.endDay} onChange={(v) => upd({ ...w, endDay: v })} placeholder="End day (blank = censoring)" />
              </div>
            </>
          )}
        />
      </Section>

      <Section title="Endpoints & sources" defaultOpen={false}>
        <Field label="Primary endpoints (one per line)">
          <Area value={lines(m.endpoints.primary)} onChange={(v) => set('endpoints', { ...m.endpoints, primary: fromLines(v) })} />
        </Field>
        <Field label="Data sources (one per line)">
          <Area rows={2} value={lines(m.dataSources)} onChange={(v) => set('dataSources', fromLines(v))} />
        </Field>
        <Field label="Footnotes (one per line)">
          <Area rows={2} value={lines(m.notes)} onChange={(v) => set('notes', fromLines(v))} />
        </Field>
      </Section>
    </>
  )
}

export function StudyPanel() {
  return (
    <>
      <ImportCard />
      <ModelForm />
    </>
  )
}

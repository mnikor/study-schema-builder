import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignHorizontalDistributeCenter,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignVerticalDistributeCenter,
  ArrowDown,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Copy,
  Plus,
  RotateCcw,
  Trash2,
} from 'lucide-react'
import { useRef } from 'react'
import type { BandStyle, Diagram, LayoutKind, Phase, Role, SEdge, SNode, SchemaEdgeData, SchemaNodeData, ShapeKind } from '../types'
import { LAYOUTS, ROLES, THEMES, themeById } from '../lib/catalog'
import { chooseHandles } from '../lib/layout'
import { rangeText, uid } from '../lib/generate'
import { fresh } from '../lib/layout'
import { autoSize, shapeOutline } from '../lib/shapes'
import { useActive, useStore, useTheme } from '../store'
import { alignSelection, deleteSelection, duplicateSelection, setNodeText, type AlignMode } from '../canvas/actions'
import { Area, Field, Num, Section, Segmented, Select, Swatches, Text, Toggle } from './ui'

const SHAPES: ShapeKind[] = ['rounded', 'rect', 'pill', 'diamond', 'circle', 'hexagon', 'parallelogram', 'document', 'cylinder', 'note']

function useDebouncedRelayout() {
  const t = useRef<ReturnType<typeof setTimeout>>(undefined)
  return () => {
    clearTimeout(t.current)
    t.current = setTimeout(() => useStore.getState().relayout(undefined, { history: false }), 280)
  }
}

function patchNodes(ids: string[], fn: (n: SNode) => SNode, key: string, resize = false) {
  const set = new Set(ids)
  const theme = themeById(useStore.getState().project.themeId)
  useStore.getState().updateDiagram(
    (d) => ({
      ...d,
      edited: true,
      nodes: d.nodes.map((n) => {
        if (!set.has(n.id)) return n
        const next = fn(n)
        return resize ? { ...fresh(next), ...autoSize(next, d.direction, d.settings, theme) } : next
      }),
    }),
    key,
  )
}

const patchData = (ids: string[], data: Partial<SchemaNodeData>, key: string, resize = false) => patchNodes(ids, (n) => ({ ...n, data: { ...n.data, ...data } }), key, resize)
const patchStyle = (ids: string[], style: Partial<NonNullable<SchemaNodeData['style']>>, key: string, resize = false) =>
  patchNodes(ids, (n) => ({ ...n, data: { ...n.data, style: { ...n.data.style, ...style } } }), key, resize)

function patchEdges(ids: string[], data: Partial<SchemaEdgeData>, key: string) {
  const set = new Set(ids)
  useStore.getState().updateDiagram((d) => ({ ...d, edited: true, edges: d.edges.map((e) => (set.has(e.id) ? { ...e, data: { ...e.data, ...data } } : e)) }), key)
}

function ShapePicker({ value, onChange }: { value: ShapeKind; onChange: (s: ShapeKind) => void }) {
  return (
    <div className="shape-grid">
      {SHAPES.map((s) => (
        <button key={s} className={s === value ? 'on' : ''} title={s} onClick={() => onChange(s)}>
          <svg width="28" height="20" viewBox="-2 -2 30 22">
            <path d={s === 'circle' ? shapeOutline('circle', 18, 18).d : shapeOutline(s, 26, 18).d} transform={s === 'circle' ? 'translate(4 0)' : undefined} fill="#fff" stroke="#334155" strokeWidth="1.3" />
          </svg>
        </button>
      ))}
    </div>
  )
}

function ColorRows({ ids, style }: { ids: string[]; style: SchemaNodeData['style'] }) {
  return (
    <>
      <Field label="Fill">
        <Swatches allowReset value={style?.fill} onChange={(v) => patchStyle(ids, { fill: v }, 'fill')} />
      </Field>
      <Field label="Border">
        <Swatches allowReset value={style?.stroke} onChange={(v) => patchStyle(ids, { stroke: v }, 'stroke')} />
      </Field>
      <Field label="Text">
        <Swatches allowReset value={style?.text} onChange={(v) => patchStyle(ids, { text: v }, 'textc')} />
      </Field>
    </>
  )
}

function PhaseSelect({ d, value, onChange }: { d: Diagram; value?: string; onChange: (v: string | undefined) => void }) {
  return <Select value={value ?? ''} onChange={(v) => onChange(v || undefined)} options={[{ value: '', label: '— none —' }, ...d.phases.map((p) => ({ value: p.id, label: p.label }))]} />
}

/* ------------------------------------------------------------------ */

function ShapeInspector({ n, d }: { n: SNode; d: Diagram }) {
  const ids = [n.id]
  const st = n.data.style ?? {}
  return (
    <>
      <Section title="Text">
        <Field label="Label">
          <Text value={n.data.label} onChange={(v) => setNodeText(n.id, v, n.data.detail)} />
        </Field>
        <Field label="Details" hint="Start lines with “• ” for bullets.">
          <Area rows={4} value={n.data.detail ?? ''} onChange={(v) => setNodeText(n.id, n.data.label, v)} />
        </Field>
      </Section>
      <Section title="Shape & meaning">
        <ShapePicker value={n.data.shape} onChange={(s) => patchData(ids, { shape: s }, 'shape', true)} />
        <Field label="Role (sets theme colours)">
          <Select<Role> value={n.data.role} onChange={(v) => patchData(ids, { role: v }, 'role', true)} options={ROLES.map((r) => ({ value: r.id, label: r.label }))} />
        </Field>
        {d.phases.length > 0 && (
          <Field label="Phase band">
            <PhaseSelect d={d} value={n.data.phase} onChange={(v) => patchData(ids, { phase: v }, 'phase')} />
          </Field>
        )}
        <Toggle checked={!!n.data.side} onChange={(v) => patchData(ids, { side: v || undefined }, 'side', true)} label="Side box (placed beside the flow, e.g. exclusions)" />
      </Section>
      <Section title="Colour">
        <ColorRows ids={ids} style={st} />
      </Section>
      <Section title="Text & border" defaultOpen={false}>
        <div className="row2">
          <Field label="Font size">
            <Num value={st.fontSize ?? null} placeholder={String(d.settings.fontSize)} min={7} max={40} onChange={(v) => patchStyle(ids, { fontSize: v ?? undefined }, 'fs', true)} />
          </Field>
          <Field label="Border width">
            <Num value={st.strokeWidth ?? null} placeholder="1.5" min={0} max={8} step={0.5} onChange={(v) => patchStyle(ids, { strokeWidth: v ?? undefined }, 'sw')} />
          </Field>
        </div>
        <Field label="Alignment">
          <Segmented value={st.align ?? (n.data.side || n.data.role === 'exclusion' ? 'left' : 'center')} onChange={(v) => patchStyle(ids, { align: v }, 'align')} options={[{ value: 'left', label: 'Left' }, { value: 'center', label: 'Centre' }]} />
        </Field>
        <Toggle checked={st.dashed ?? n.data.role === 'note'} onChange={(v) => patchStyle(ids, { dashed: v }, 'dash')} label="Dashed border" />
      </Section>
      <Section title="Size" defaultOpen={false}>
        <div className="row2">
          <Field label="Width">
            <Num value={n.width ?? null} min={30} onChange={(v) => v && patchNodes(ids, (x) => ({ ...x, width: v, data: { ...x.data, fixedSize: true } }), 'w')} />
          </Field>
          <Field label="Height">
            <Num value={n.height ?? null} min={24} onChange={(v) => v && patchNodes(ids, (x) => ({ ...x, height: v, data: { ...x.data, fixedSize: true } }), 'h')} />
          </Field>
        </div>
        <button className="btn ghost sm" onClick={() => patchData(ids, { fixedSize: false }, 'autosize', true)}>
          <RotateCcw size={13} /> Fit size to text
        </button>
      </Section>
      <Actions />
    </>
  )
}

function Actions() {
  return (
    <div className="actions">
      <button className="btn ghost sm" onClick={duplicateSelection}>
        <Copy size={13} /> Duplicate
      </button>
      <button className="btn ghost sm danger" onClick={deleteSelection}>
        <Trash2 size={13} /> Delete
      </button>
    </div>
  )
}

function WindowInspector({ n }: { n: SNode }) {
  const relayout = useDebouncedRelayout()
  const setDays = (startDay: number | null, endDay: number | null) => {
    patchData([n.id], { startDay, endDay, detail: rangeText({ startDay, endDay }) }, 'days')
    relayout()
  }
  return (
    <>
      <Section title="Time window">
        <Field label="Label">
          <Text value={n.data.label} onChange={(v) => { patchData([n.id], { label: v }, 'wlabel'); relayout() }} />
        </Field>
        <div className="row2">
          <Field label="Start day" hint="Blank = open start">
            <Num value={n.data.startDay ?? null} onChange={(v) => setDays(v, n.data.endDay ?? null)} />
          </Field>
          <Field label="End day" hint="Blank = until censoring">
            <Num value={n.data.endDay ?? null} onChange={(v) => setDays(n.data.startDay ?? null, v)} />
          </Field>
        </div>
        <Field label="Range text">
          <Text value={n.data.detail ?? ''} onChange={(v) => patchData([n.id], { detail: v }, 'wdetail')} />
        </Field>
        <Field label="Role (colour)">
          <Select<Role> value={n.data.role} onChange={(v) => patchData([n.id], { role: v }, 'role')} options={ROLES.map((r) => ({ value: r.id, label: r.label }))} />
        </Field>
      </Section>
      <Section title="Colour" defaultOpen={false}>
        <ColorRows ids={[n.id]} style={n.data.style} />
      </Section>
      <Actions />
    </>
  )
}

const SEGMENT_ROLES: { value: Role; label: string }[] = [
  { value: 'experimental', label: 'Study treatment' },
  { value: 'control', label: 'Placebo' },
  { value: 'treatment', label: 'Active comparator / SoC' },
  { value: 'screening', label: 'Off treatment / screening' },
  { value: 'followup', label: 'Follow-up' },
  { value: 'neutral', label: 'Other' },
]

function SegmentInspector({ n, d }: { n: SNode; d: Diagram }) {
  const relayout = useDebouncedRelayout()
  const unit = d.timeline?.unit ?? 'weeks'
  const set = (data: Partial<SchemaNodeData>, key: string) => {
    patchData([n.id], data, key)
    relayout()
  }
  return (
    <>
      <Section title="Timeline bar">
        <Field label="Label">
          <Text value={n.data.label} onChange={(v) => set({ label: v }, 'slabel')} />
        </Field>
        <div className="row2">
          <Field label={`Start (${unit})`}>
            <Num value={n.data.t0 ?? 0} onChange={(v) => v !== null && set({ t0: v }, 'st0')} />
          </Field>
          <Field label={`End (${unit})`} hint="Blank = open-ended">
            <Num value={typeof n.data.t1 === 'number' ? n.data.t1 : null} onChange={(v) => set({ t1: v }, 'st1')} />
          </Field>
        </div>
        <Field label="Meaning (colour)">
          <Select<Role> value={n.data.role} onChange={(v) => set({ role: v }, 'srole')} options={SEGMENT_ROLES} />
        </Field>
        <Field label="Custom colour">
          <Swatches allowReset value={n.data.style?.fill} onChange={(v) => patchStyle([n.id], { fill: v }, 'sfill')} />
        </Field>
        <p className="hint">Drag from the bar's end dot to another bar's start dot to draw a move between lanes.</p>
      </Section>
      <Actions />
    </>
  )
}

function TextInspector({ n }: { n: SNode }) {
  const relayout = useDebouncedRelayout()
  return (
    <>
      <Section title="Label">
        <Field label="Text">
          <Text value={n.data.label} onChange={(v) => { patchData([n.id], { label: v }, 'tlabel'); relayout() }} />
        </Field>
        <Field label="Second line">
          <Text value={n.data.detail ?? ''} onChange={(v) => { patchData([n.id], { detail: v || undefined }, 'tdetail'); relayout() }} />
        </Field>
        <Field label="Colour">
          <Swatches allowReset value={n.data.style?.text} onChange={(v) => patchStyle([n.id], { text: v }, 'tcolor')} />
        </Field>
      </Section>
      <Actions />
    </>
  )
}

function MultiInspector({ nodes, d }: { nodes: SNode[]; d: Diagram }) {
  const ids = nodes.map((n) => n.id)
  const btn = (mode: AlignMode, icon: React.ReactNode, title: string) => (
    <button className="icon-btn" title={title} onClick={() => alignSelection(mode)}>
      {icon}
    </button>
  )
  return (
    <>
      <Section title={`${nodes.length} items selected`}>
        <div className="align-row">
          {btn('left', <AlignStartVertical size={15} />, 'Align left')}
          {btn('hcenter', <AlignCenterVertical size={15} />, 'Align centres horizontally')}
          {btn('right', <AlignEndVertical size={15} />, 'Align right')}
          {btn('top', <AlignStartHorizontal size={15} />, 'Align top')}
          {btn('vcenter', <AlignCenterHorizontal size={15} />, 'Align middles')}
          {btn('bottom', <AlignEndHorizontal size={15} />, 'Align bottom')}
          {btn('hdist', <AlignHorizontalDistributeCenter size={15} />, 'Distribute horizontally')}
          {btn('vdist', <AlignVerticalDistributeCenter size={15} />, 'Distribute vertically')}
        </div>
        <button className="btn ghost sm" onClick={() => alignSelection('samew')}>
          Same width
        </button>
        <Field label="Role for all">
          <Select<Role | ''> value="" onChange={(v) => v && patchData(ids, { role: v }, 'role', true)} options={[{ value: '', label: '— choose —' }, ...ROLES.map((r) => ({ value: r.id, label: r.label }))]} />
        </Field>
        {d.phases.length > 0 && (
          <Field label="Phase band for all">
            <PhaseSelect d={d} onChange={(v) => patchData(ids, { phase: v }, 'phase')} />
          </Field>
        )}
      </Section>
      <Section title="Colour">
        <ColorRows ids={ids} style={{}} />
      </Section>
      <Actions />
    </>
  )
}

function EdgeInspector({ edges, d }: { edges: SEdge[]; d: Diagram }) {
  const ids = edges.map((e) => e.id)
  const e = edges[0]
  const data = e.data ?? {}
  const resetRoute = () => {
    const byId = new Map(d.nodes.map((n) => [n.id, n]))
    useStore.getState().updateDiagram(
      (dd) => ({
        ...dd,
        edges: dd.edges.map((x) => {
          if (!ids.includes(x.id)) return x
          const s = byId.get(x.source)
          const t = byId.get(x.target)
          if (!s || !t) return x
          const [sh, th] = chooseHandles(s, t, dd.direction)
          return { ...x, sourceHandle: sh, targetHandle: th, data: { ...x.data, offset: undefined, manualHandles: false } }
        }),
      }),
      'reset-route',
    )
  }
  return (
    <>
      <Section title={edges.length > 1 ? `${edges.length} arrows` : 'Arrow'}>
        <Field label="Label">
          <Text value={data.label ?? ''} onChange={(v) => patchEdges(ids, { label: v || undefined }, 'elabel')} placeholder="e.g. n = 200, PD, 2:1" />
        </Field>
        <Field label="Path">
          <Segmented value={data.path ?? 'step'} onChange={(v) => patchEdges(ids, { path: v, offset: undefined }, 'epath')} options={[{ value: 'step', label: 'Elbow' }, { value: 'straight', label: 'Straight' }, { value: 'bezier', label: 'Curve' }]} />
        </Field>
        <div className="row2">
          <Toggle checked={data.arrowEnd !== false} onChange={(v) => patchEdges(ids, { arrowEnd: v }, 'aend')} label="Arrow at end" />
          <Toggle checked={!!data.arrowStart} onChange={(v) => patchEdges(ids, { arrowStart: v }, 'astart')} label="Arrow at start" />
        </div>
        <div className="row2">
          <Field label="Width">
            <Num value={data.width ?? null} placeholder="1.5" min={0.5} max={6} step={0.5} onChange={(v) => patchEdges(ids, { width: v ?? undefined }, 'ew')} />
          </Field>
          <Toggle checked={!!data.dashed} onChange={(v) => patchEdges(ids, { dashed: v }, 'edash')} label="Dashed" />
        </div>
        <Field label="Colour">
          <Swatches allowReset value={data.color} onChange={(v) => patchEdges(ids, { color: v }, 'ecolor')} />
        </Field>
        <p className="hint">Drag an arrow end onto another connection dot to re-attach it. Drag the round handle in the middle of a selected elbow arrow to re-route it.</p>
        <div className="actions">
          <button className="btn ghost sm" onClick={resetRoute}>
            <RotateCcw size={13} /> Reset route
          </button>
          <button className="btn ghost sm danger" onClick={deleteSelection}>
            <Trash2 size={13} /> Delete
          </button>
        </div>
      </Section>
    </>
  )
}

function BandInspector({ d, phaseId }: { d: Diagram; phaseId: string }) {
  const idx = d.phases.findIndex((p) => p.id === phaseId)
  const p = d.phases[idx]
  const relayout = useDebouncedRelayout()
  if (!p) return null
  const setPhase = (patch: Partial<Phase>, key: string) => useStore.getState().updateDiagram((dd) => ({ ...dd, phases: dd.phases.map((x) => (x.id === phaseId ? { ...x, ...patch } : x)) }), key)
  const move = (delta: number) => {
    useStore.getState().updateDiagram((dd) => {
      const arr = [...dd.phases]
      const j = idx + delta
      if (j < 0 || j >= arr.length) return dd
      ;[arr[idx], arr[j]] = [arr[j], arr[idx]]
      return { ...dd, phases: arr }
    }, 'phase-move')
    relayout()
  }
  return (
    <Section title="Phase band">
      <Field label="Label">
        <Text value={p.label} onChange={(v) => setPhase({ label: v }, 'plabel')} />
      </Field>
      <Field label="Duration">
        <Text value={p.duration ?? ''} onChange={(v) => setPhase({ duration: v || undefined }, 'pdur')} placeholder="e.g. Up to 28 days" />
      </Field>
      <Field label="Timeline label at start" hint="Shown on the time axis (turn it on in page settings).">
        <Text value={p.startLabel ?? ''} onChange={(v) => setPhase({ startLabel: v || undefined }, 'pstart')} placeholder="e.g. Day −28" />
      </Field>
      <Field label="Band colour">
        <Swatches allowReset value={p.color} onChange={(v) => setPhase({ color: v }, 'pcolor')} />
      </Field>
      <div className="actions">
        <button className="btn ghost sm" disabled={idx === 0} onClick={() => move(-1)}>
          <ChevronLeft size={13} /> Earlier
        </button>
        <button className="btn ghost sm" disabled={idx === d.phases.length - 1} onClick={() => move(1)}>
          Later <ChevronRight size={13} />
        </button>
        <button
          className="btn ghost sm danger"
          onClick={() => {
            useStore.getState().updateDiagram((dd) => ({ ...dd, phases: dd.phases.filter((x) => x.id !== phaseId), nodes: dd.nodes.map((n) => (n.data.phase === phaseId ? { ...n, data: { ...n.data, phase: undefined } } : n)) }), 'phase-del')
            useStore.setState({ selectedBand: null })
          }}
        >
          <Trash2 size={13} /> Remove
        </button>
      </div>
    </Section>
  )
}

function TimelineSettings({ d }: { d: Diagram }) {
  const relayout = useDebouncedRelayout()
  const tl = d.timeline ?? { unit: 'weeks' as const, breaks: [] }
  const setTl = (patch: Partial<NonNullable<Diagram['timeline']>>, key: string) => {
    useStore.getState().updateDiagram((dd) => ({ ...dd, timeline: { ...(dd.timeline ?? { unit: 'weeks', breaks: [] }), ...patch } }), key)
    relayout()
  }
  const text = tl.breaks.map((b) => `${b.from}-${b.to}`).join(', ')
  return (
    <Section title="Time axis">
      <Field label="Unit">
        <Select value={tl.unit} onChange={(v) => setTl({ unit: v }, 'unit')} options={(['days', 'weeks', 'months', 'years'] as const).map((u) => ({ value: u, label: u }))} />
      </Field>
      <Field label="Compressed intervals" hint={`e.g. 52-148. Blank = automatic${tl.scale?.breaks.length && !tl.breaks.length ? ` (now ${tl.scale.breaks.map((b) => `${Math.round(b.from)}–${Math.round(b.to)}`).join(', ')})` : ''}.`}>
        <input
          key={text}
          className="inp"
          defaultValue={text}
          placeholder="automatic"
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          onBlur={(e) =>
            setTl(
              {
                breaks: e.target.value
                  .split(',')
                  .map((x) => x.split(/[-–]/).map((y) => Number(y.trim())))
                  .filter((p) => p.length === 2 && p.every(Number.isFinite) && p[1] > p[0])
                  .map(([from, to]) => ({ from, to })),
              },
              'breaks',
            )
          }
        />
      </Field>
    </Section>
  )
}

function PageInspector({ d }: { d: Diagram }) {
  const themeId = useStore((s) => s.project.themeId)
  const relayout = useDebouncedRelayout()
  const setS = (patch: Partial<Diagram['settings']>, key: string, layout = false) => {
    useStore.getState().updateDiagram((dd) => ({ ...dd, settings: { ...dd.settings, ...patch } }), key)
    if (layout) relayout()
  }
  const s = d.settings
  return (
    <>
      <Section title="Page">
        <Field label="Page name">
          <Text value={d.name} onChange={(v) => useStore.getState().updateDiagram((dd) => ({ ...dd, name: v }), 'pname')} />
        </Field>
        <Field label="Layout" hint="Changing it rebuilds this page from the study details.">
          <Select<LayoutKind>
            value={d.layout}
            onChange={(v) => {
              if (!d.edited || confirm('Rebuild this page with a different layout? Manual edits on this page will be replaced.')) useStore.getState().regeneratePage(d.id, v)
            }}
            options={LAYOUTS.map((l) => ({ value: l.id, label: l.label }))}
          />
        </Field>
        <Field label="Flow direction">
          <Segmented
            value={d.direction}
            onChange={(v) => useStore.getState().setDirection(v)}
            options={[
              { value: 'LR', label: <><ArrowRight size={13} /> Horizontal</> },
              { value: 'TB', label: <><ArrowDown size={13} /> Vertical</> },
            ]}
          />
        </Field>
        {(d.layout === 'schema' || d.layout === 'flow' || d.layout === 'lines') && (
          <Field label={d.direction === 'LR' ? 'Rows' : 'Columns'} hint="Auto keeps one row when it prints at 9 pt or more, otherwise wraps into up to 4.">
            <Segmented
              value={String(d.settings.rows ?? 0)}
              onChange={(v) => setS({ rows: Number(v) }, 'rows', true)}
              options={[{ value: '0', label: 'Auto' }, { value: '1', label: '1' }, { value: '2', label: '2' }, { value: '3', label: '3' }, { value: '4', label: '4' }]}
            />
          </Field>
        )}
        <Field label="Page" hint="Auto: landscape for horizontal flows, portrait for vertical ones. Choosing a page lets the flow direction adapt to it.">
          <Segmented
            value={d.settings.orientation ?? 'auto'}
            onChange={(v) => setS({ orientation: v, lockDirection: false }, 'orient', true)}
            options={[{ value: 'auto', label: 'Auto' }, { value: 'portrait', label: 'Portrait' }, { value: 'landscape', label: 'Landscape' }]}
          />
        </Field>
        {d.layoutInfo && (
          <p className={`fit-info${d.layoutInfo.bodyPt < 7 ? ' warn' : ''}`}>
            {`${d.layoutInfo.rows} ${d.direction === 'LR' ? 'row' : 'column'}${d.layoutInfo.rows > 1 ? 's' : ''}, `}
            {d.layoutInfo.orientation} page{d.layoutInfo.adapted ? ` · flow switched to ${d.direction === 'TB' ? 'vertical' : 'horizontal'} to suit the page` : ''} · body text ≈ {d.layoutInfo.bodyPt} pt when printed
          </p>
        )}
      </Section>
      {d.layout === 'timeline' && <TimelineSettings d={d} />}
      <Section title="Figure text">
        <Toggle checked={s.showTitle} onChange={(v) => setS({ showTitle: v }, 'stitle')} label="Show title" />
        <Area rows={2} value={s.title} onChange={(v) => setS({ title: v }, 'title')} />
        <Toggle checked={s.showFootnote} onChange={(v) => setS({ showFootnote: v }, 'sfoot')} label="Show footnote" />
        <Area rows={2} value={s.footnote} onChange={(v) => setS({ footnote: v }, 'foot')} placeholder="Abbreviations, notes…" />
      </Section>
      <Section title="Style">
        <Field label="Colour theme">
          <Select value={themeId} onChange={(v) => useStore.getState().update((p) => ({ ...p, themeId: v }), 'theme')} options={THEMES.map((t) => ({ value: t.id, label: t.name }))} />
        </Field>
        {(d.layout === 'schema' || d.layout === 'flow' || d.layout === 'lines') && (
          <>
            <Field label="Phase bands">
              <Segmented<BandStyle> value={s.bandStyle} onChange={(v) => setS({ bandStyle: v }, 'band')} options={[{ value: 'tinted', label: 'Tinted' }, { value: 'outline', label: 'Outline' }, { value: 'label', label: 'Labels' }, { value: 'none', label: 'None' }]} />
            </Field>
          </>
        )}
        {(d.layout === 'schema' || d.layout === 'windows' || d.layout === 'lines') && (
          <>
            <Toggle checked={s.showAxis} onChange={(v) => setS({ showAxis: v }, 'axis')} label="Show timeline axis" />
            {s.showAxis && d.layout !== 'windows' && (
              <Field label="Axis end label">
                <Text value={s.axisEndLabel} onChange={(v) => setS({ axisEndLabel: v }, 'axisend')} />
              </Field>
            )}
          </>
        )}
        <div className="row2">
          <Field label="Font size">
            <Num value={s.fontSize} min={8} max={28} onChange={(v) => v && setS({ fontSize: v }, 'fontsize', true)} />
          </Field>
          <Field label="Box width" hint="0 = auto">
            <Num value={s.nodeWidth} min={0} max={500} step={10} onChange={(v) => setS({ nodeWidth: v ?? 0 }, 'nodew', true)} />
          </Field>
        </div>
        {d.layout !== 'windows' && d.layout !== 'timeline' && (
          <>
            <Field label={`Spacing between steps: ${s.rankGap}px`}>
              <input type="range" min={24} max={140} value={s.rankGap} onChange={(e) => setS({ rankGap: Number(e.target.value) }, 'rankgap', true)} />
            </Field>
            <Field label={`Spacing between lanes: ${s.nodeGap}px`}>
              <input type="range" min={8} max={80} value={s.nodeGap} onChange={(e) => setS({ nodeGap: Number(e.target.value) }, 'nodegap', true)} />
            </Field>
          </>
        )}
      </Section>
      {(d.layout === 'schema' || d.layout === 'flow' || d.layout === 'lines') && (
        <Section title="Phase bands" defaultOpen={false}>
          {d.phases.map((p) => (
            <button key={p.id} className="phase-chip" onClick={() => useStore.setState({ selectedBand: p.id })}>
              {p.label}
              {p.duration ? <small> · {p.duration}</small> : null}
            </button>
          ))}
          <button
            className="btn ghost sm"
            onClick={() => useStore.getState().updateDiagram((dd) => ({ ...dd, phases: [...dd.phases, { id: uid('ph'), label: 'New phase' }] }), 'phase-add')}
          >
            <Plus size={13} /> Add phase
          </button>
          <p className="hint">Assign boxes to a phase in their inspector. Bands follow the boxes automatically.</p>
        </Section>
      )}
      <Section title="Editing tips" defaultOpen={false}>
        <ul className="tips">
          <li>Double-click a box to edit its text. Enter saves, Shift+Enter adds a line.</li>
          <li>Select a box, then click a blue + to add a connected step.</li>
          <li>Drag from a connection dot to another box to draw an arrow.</li>
          <li>Drag on empty canvas to select several items; scroll to pan, pinch or Ctrl+scroll to zoom.</li>
          <li>⌘/Ctrl+Z undo, ⇧⌘Z redo, ⌘D duplicate, ⌘C/⌘V copy/paste, Delete removes.</li>
        </ul>
      </Section>
    </>
  )
}

export function Inspector() {
  const d = useActive()
  useTheme()
  const selectedBand = useStore((s) => s.selectedBand)
  if (!d) return null
  const nodes = d.nodes.filter((n) => n.selected)
  const edges = d.edges.filter((e) => e.selected)
  let body: React.ReactNode
  let title = 'Page settings'
  if (selectedBand && !nodes.length && !edges.length) {
    body = <BandInspector d={d} phaseId={selectedBand} />
    title = 'Phase'
  } else if (nodes.length === 1 && !edges.length) {
    const n = nodes[0]
    const tl = d.layout === 'timeline'
    title = n.type === 'window' ? 'Time window' : n.type === 'marker' ? (tl ? 'Milestone' : 'Index date') : n.type === 'segment' ? 'Timeline bar' : n.type === 'text' ? 'Label' : 'Box'
    body =
      n.type === 'window' ? (
        <WindowInspector n={n} />
      ) : n.type === 'segment' ? (
        <SegmentInspector n={n} d={d} />
      ) : n.type === 'text' ? (
        <TextInspector n={n} />
      ) : n.type === 'marker' ? (
        <Section title={tl ? 'Milestone line' : 'Index date marker'}>
          <Field label="Label">
            <Text value={n.data.label} onChange={(v) => { patchData([n.id], { label: v }, 'mlabel'); useStore.getState().relayout(undefined, { history: false }) }} />
          </Field>
          {tl && (
            <Field label={`Time (${d.timeline?.unit ?? 'weeks'})`}>
              <Num value={n.data.t0 ?? null} onChange={(v) => { if (v !== null) { patchData([n.id], { t0: v }, 'mt0'); useStore.getState().relayout(undefined, { history: false }) } }} />
            </Field>
          )}
          <Field label="Line colour">
            <Swatches allowReset value={n.data.style?.stroke} onChange={(v) => patchStyle([n.id], { stroke: v }, 'mstroke')} />
          </Field>
        </Section>
      ) : (
        <ShapeInspector n={n} d={d} />
      )
  } else if (nodes.length > 1) {
    body = <MultiInspector nodes={nodes} d={d} />
    title = 'Selection'
  } else if (edges.length) {
    body = <EdgeInspector edges={edges} d={d} />
    title = 'Arrow'
  } else {
    body = <PageInspector d={d} />
  }
  return (
    <aside className="panel right">
      <div className="panel-title">{title}</div>
      <div className="panel-scroll">{body}</div>
    </aside>
  )
}

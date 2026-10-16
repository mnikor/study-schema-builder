import type {
  ArmKind,
  Diagram,
  DiagramSettings,
  Direction,
  GuidelineId,
  LayoutKind,
  NodeType,
  Phase,
  Role,
  SEdge,
  SNode,
  SchemaEdgeData,
  ShapeKind,
  StudyArm,
  StudyModel,
  TimeWindow,
  WindowKind,
} from '../types'
import { isInterventional, layoutLabel, studyTypeInfo } from './catalog'
import { dayLabel } from './decor'
import { deriveTimeline } from './timeline'

export const uid = (p = '') => p + Math.random().toString(36).slice(2, 9)

const join = (...parts: (string | null | undefined | false)[]) => parts.filter((p): p is string => !!p && !!p.trim()).join('\n')
const bullets = (items: string[], max = 4) => items.slice(0, max).map((i) => `• ${i}`).join('\n')
const fmtN = (n: string | null | undefined) => (n ? `(n\u00a0=\u00a0${n})` : '(n\u00a0=\u00a0)')
const short = (s: string, max = 140) => {
  if (s.length <= max) return s
  const cut = s.slice(0, max - 1)
  const sp = cut.lastIndexOf(' ')
  return (sp > max * 0.6 ? cut.slice(0, sp) : cut).replace(/[\s,;:–-]+$/, '') + '…'
}
const clip = (items: string[], n: number, max: number) => items.slice(0, n).map((x) => short(x, max))

class Builder {
  nodes: SNode[] = []
  edges: SEdge[] = []
  private order = 0
  node(label: string, o: { detail?: string; role: Role; shape?: ShapeKind; phase?: string; side?: boolean; type?: NodeType; extra?: Partial<SNode['data']> }): string {
    const id = uid('n')
    this.nodes.push({
      id,
      type: o.type ?? 'shape',
      position: { x: 0, y: 0 },
      data: { label, detail: o.detail || undefined, role: o.role, shape: o.shape ?? 'rounded', phase: o.phase, side: o.side, order: this.order++, ...o.extra },
    })
    return id
  }
  edge(source: string, target: string, data: SchemaEdgeData = {}) {
    this.edges.push({ id: uid('e'), source, target, type: 'schema', data: { path: 'step', arrowEnd: true, ...data } })
  }
}

const armRole = (k: ArmKind): Role =>
  k === 'experimental' || k === 'exposure' ? 'experimental' : k === 'cohort' || k === 'other' ? 'treatment' : 'control'

const armDetail = (a: StudyArm) =>
  join(a.intervention && a.intervention.trim() !== a.label.trim() ? a.intervention : '', a.details ?? '', a.n ? `n\u00a0=\u00a0${a.n}` : '')

const PRE = new Set(['screening', 'run-in', 'baseline', 'lookback'])
const TREAT = new Set(['treatment', 'washout', 'maintenance', 'observation'])
const POST = new Set(['follow-up', 'extension'])

/** "Study duration: 36 months" describes the whole study, not a step in it. */
export const isOverallPeriod = (p: { label: string; duration?: string | null }) =>
  /\b(study|total|overall|entire)\s+(duration|period|length)\b|^duration$/i.test(p.label.trim()) ||
  // an event listed as a period (treatment start, index date, randomisation) without any duration
  (!p.duration && /\b(start|initiation|initiat\w*|index|randomi[sz]ation|day\s*0|baseline visit)\b/i.test(p.label))

function splitPeriods(m0: StudyModel) {
  const m = { ...m0, periods: m0.periods.filter((p) => !isOverallPeriod(p)) }
  const firstTreat = m.periods.findIndex((p) => TREAT.has(p.kind))
  const pre = m.periods.filter((p, i) => PRE.has(p.kind) || (p.kind === 'other' && firstTreat >= 0 && i < firstTreat))
  const treat = m.periods.filter((p) => TREAT.has(p.kind))
  const post = m.periods.filter((p, i) => POST.has(p.kind) || (p.kind === 'other' && (firstTreat < 0 || i > firstTreat)))
  return { pre, treat, post }
}

/* ------------------------------------------------------------------ */
/* Study design schema                                                 */
/* ------------------------------------------------------------------ */

function genConsensus(m: StudyModel) {
  const b = new Builder()
  const steps = m.periods.filter((p) => !isOverallPeriod(p))
  const phases: Phase[] = steps.map((p) => ({ id: p.id, label: p.label, duration: p.duration ?? undefined, startLabel: p.startLabel ?? undefined }))
  const panel = b.node('Expert panel', {
    detail: join(short(m.population.description, 140), m.population.targetN ? `n\u00a0=\u00a0${m.population.targetN}` : '', bullets(m.population.keyInclusion, 3)),
    role: 'population',
    phase: steps[0]?.id,
  })
  let prev = panel
  const list = steps.length
    ? steps
    : [
        { id: 'r1', label: 'Round 1 survey', duration: null },
        { id: 'r2', label: 'Round 2 survey', duration: null },
        { id: 'mt', label: 'Consensus meeting', duration: null },
      ]
  list.forEach((p, i) => {
    if (i === 0 && steps.length && /panel|recruit|select|identif/i.test(p.label)) return
    const meeting = /meeting|workshop|panel discussion/i.test(p.label)
    const optional = /optional|if needed|if required/i.test(`${p.label} ${p.duration ?? ''}`)
    const id = b.node(p.label, { detail: p.duration ?? undefined, role: meeting ? 'allocation' : /report|publication|dissemin/i.test(p.label) ? 'endpoint' : 'treatment', shape: meeting ? 'hexagon' : 'rounded', phase: steps.length ? p.id : undefined, extra: optional ? { style: { dashed: true } } : undefined })
    b.edge(prev, id, /round/i.test(p.label) && i > 0 && /round/i.test(list[i - 1].label) ? { label: 'feedback' } : {})
    prev = id
  })
  if (m.endpoints.primary.length) {
    const id = b.node('Consensus definition', { detail: m.endpoints.primary[0], role: 'note', shape: 'note', side: true, phase: b.nodes.find((n) => n.id === prev)?.data.phase })
    b.edge(prev, id, { arrowEnd: false, dashed: true, path: 'straight' })
  }
  return { nodes: b.nodes, edges: b.edges, phases }
}

function genSchema(m: StudyModel) {
  if (m.studyType === 'consensus-delphi') return genConsensus(m)
  const b = new Builder()
  const obs = !isInterventional(m.studyType)
  const { pre, treat, post } = splitPeriods(m)
  const phases: Phase[] = m.periods.filter((p) => !isOverallPeriod(p)).map((p) => ({ id: p.id, label: p.label, duration: p.duration ?? undefined, startLabel: p.startLabel ?? undefined }))
  const treatPhase = treat[0]?.id ?? pre[pre.length - 1]?.id
  const firstPhase = pre[0]?.id ?? treatPhase

  let prev: string | null = null
  if (obs && m.dataSources.length) {
    prev = b.node('Data source', { detail: m.dataSources.join('; '), role: 'data', shape: 'cylinder', phase: firstPhase })
  }
  const popId = b.node(obs ? 'Study population' : 'Patients', {
    detail: join(short(m.population.description, 140), m.population.targetN ? `N\u00a0=\u00a0${m.population.targetN}` : '', bullets(clip(m.population.keyInclusion, m.population.description.length > 90 ? 2 : 3, 70), 3)),
    role: 'population',
    phase: firstPhase,
  })
  if (prev) b.edge(prev, popId)
  prev = popId
  for (const p of pre) {
    const id = b.node(p.label, { detail: p.duration ?? undefined, role: 'screening', phase: p.id })
    b.edge(prev, id)
    prev = id
  }

  const arms = m.arms
  const crossover = m.studyType === 'rct-crossover' && arms.some((a) => a.sequence.length >= 2)
  const sequential = m.studyType === 'dose-escalation'
  let ends: string[] = []

  if (!sequential && (arms.length >= 2 || m.design.randomized)) {
    let alloc: string
    if (m.design.randomized) {
      alloc = b.node('R', { detail: m.design.allocationRatio ?? undefined, role: 'allocation', shape: 'circle', phase: treatPhase })
      if (m.design.stratification.length) {
        const note = b.node('Stratified by', { detail: bullets(m.design.stratification, 5), role: 'note', shape: 'note', side: true, phase: treatPhase })
        b.edge(alloc, note, { arrowEnd: false, dashed: true, path: 'straight' })
      }
    } else {
      const label = obs ? (m.studyType === 'case-control' ? 'Case / control status' : 'Exposure status') : m.studyType === 'platform' ? 'Sub-study assignment' : 'Cohort assignment'
      alloc = b.node(label, { role: 'allocation', shape: 'diamond', phase: treatPhase })
    }
    b.edge(prev, alloc)
    prev = alloc
  }

  if (sequential) {
    const isExp = (a: StudyArm) => /expan|cohort/i.test(a.group ?? '')
    const escalation = arms.filter((a) => !isExp(a))
    const expansion = arms.filter(isExp)
    escalation.forEach((a, i) => {
      const id = b.node(a.label, { detail: armDetail(a), role: 'experimental', phase: treatPhase })
      b.edge(prev!, id, i > 0 ? { label: 'escalate' } : {})
      prev = id
    })
    if (expansion.length) {
      const rp2d = b.node('RP2D / MTD', { detail: 'determined', role: 'event', shape: 'diamond', phase: treatPhase })
      b.edge(prev!, rp2d)
      const expPhase = treat[1]?.id ?? treatPhase
      ends = expansion.map((a) => {
        const id = b.node(a.label, { detail: armDetail(a), role: 'treatment', phase: expPhase })
        b.edge(rp2d, id)
        return id
      })
    } else ends = [prev!]
  } else if (crossover) {
    const tp = treat.length ? treat : []
    ends = arms.map((a) => {
      let last = prev!
      let k = 0
      const steps = tp.length ? tp : a.sequence.map((s, i) => ({ id: undefined as string | undefined, kind: 'treatment', label: s, duration: null as string | null, i }))
      steps.forEach((p, idx) => {
        let id: string
        if (p.kind === 'washout') id = b.node('Washout', { detail: p.duration ?? undefined, role: 'screening', phase: p.id })
        else {
          const item = a.sequence[k] ?? a.label
          id = b.node(item, { detail: tp.length ? (p.duration ?? undefined) : undefined, role: k === 0 ? armRole(a.kind) : 'treatment', phase: p.id ?? treatPhase })
          k++
        }
        b.edge(last, id, idx === 0 ? { label: a.label } : {})
        last = id
      })
      return last
    })
  } else if (arms.length) {
    const groups = [...new Set(arms.map((a) => a.group).filter((g): g is string => !!g))]
    const laneStart = new Map<string, string>()
    if (groups.length && arms.length > 1) {
      for (const g of groups) {
        const gid = b.node(g, { role: 'population', shape: 'rounded', phase: treatPhase })
        b.edge(prev!, gid)
        laneStart.set(g, gid)
      }
    }
    // several cohorts on the same regimen: state the regimen once instead of repeating it in every box
    const same = (f: (a: StudyArm) => string) => arms.length >= 3 && new Set(arms.map((a) => f(a).trim().toLowerCase())).size === 1 && !!f(arms[0]).trim()
    const sharedIntervention = same((a) => a.intervention) && arms.every((a) => a.intervention.trim().toLowerCase() !== a.label.trim().toLowerCase())
    const sharedDetails = same((a) => a.details ?? '')
    if ((sharedIntervention || sharedDetails) && prev) {
      const note = b.node(m.studyType === 'platform' ? 'All sub-studies' : 'All cohorts', {
        detail: join(sharedIntervention ? arms[0].intervention : '', sharedDetails ? arms[0].details ?? '' : ''),
        role: 'note',
        shape: 'note',
        side: true,
        phase: treatPhase,
      })
      b.edge(prev, note, { arrowEnd: false, dashed: true, path: 'straight' })
    }
    ends = arms.map((a) => {
      const from = (a.group && laneStart.get(a.group)) || prev!
      const detail = join(!sharedIntervention && a.intervention && a.intervention.trim() !== a.label.trim() ? a.intervention : '', !sharedDetails ? (a.details ?? '') : '', a.n ? `n\u00a0=\u00a0${a.n}` : '')
      const id = b.node(a.label, { detail, role: armRole(a.kind), phase: treatPhase })
      b.edge(from, id)
      return id
    })
    // later treatment-like periods continue each lane
    for (const p of treat.slice(1)) {
      ends = ends.map((end) => {
        const id = b.node(p.label, { detail: p.duration ?? undefined, role: p.kind === 'washout' ? 'screening' : 'treatment', phase: p.id })
        b.edge(end, id)
        return id
      })
    }
  } else {
    for (const p of treat) {
      const id = b.node(p.label, { detail: p.duration ?? undefined, role: 'treatment', phase: p.id })
      b.edge(prev!, id)
      prev = id
    }
    ends = [prev!]
  }

  for (const p of post) {
    const id = b.node(p.label, { detail: p.duration ?? undefined, role: 'followup', phase: p.id })
    for (const e of ends) b.edge(e, id)
    ends = [id]
  }
  if (m.endpoints.primary.length) {
    const lastPhase = post[post.length - 1]?.id ?? treat[treat.length - 1]?.id
    const id = b.node(m.endpoints.primary.length > 1 ? 'Primary endpoints' : 'Primary endpoint', {
      detail: m.endpoints.primary.length > 1 ? bullets(m.endpoints.primary, 3) : m.endpoints.primary[0],
      role: 'endpoint',
      shape: 'rounded',
      phase: lastPhase,
    })
    for (const e of ends) b.edge(e, id)
  }
  return { nodes: b.nodes, edges: b.edges, phases }
}

/* ------------------------------------------------------------------ */
/* Participant flow                                                    */
/* ------------------------------------------------------------------ */

export type FlowVariant = 'consort' | 'trend' | 'strobe' | 'stard' | 'prisma' | 'accord'

export function flowVariant(m: StudyModel): FlowVariant {
  if (m.studyType === 'systematic-review') return 'prisma'
  if (m.studyType === 'consensus-delphi') return 'accord'
  if (m.studyType === 'diagnostic-accuracy') return 'stard'
  if (isInterventional(m.studyType)) return m.design.randomized ? 'consort' : 'trend'
  return 'strobe'
}

function exclusionText(ex: { label: string; n: string | null }[]) {
  return ex.map((x) => `• ${x.label} ${fmtN(x.n)}`).join('\n')
}

function chainSteps(b: Builder, steps: StudyModel['flowSteps'], phase: string, start: string | null, role: Role = 'neutral') {
  let prev = start
  for (const s of steps) {
    const id = b.node(`${s.label} ${fmtN(s.n)}`, { role, phase })
    if (prev) b.edge(prev, id)
    if (s.exclusions.length) {
      const total = s.exclusions.length === 1 ? s.exclusions[0] : null
      const exLabel = total && !/^(excluded|not |no |did |lost|withdr|declin|insufficient|prior|prevalent)/i.test(total.label) ? `Excluded: ${total.label.charAt(0).toLowerCase()}${total.label.slice(1)}` : total?.label
      const ex = b.node(total ? `${exLabel} ${fmtN(total.n)}` : 'Excluded (n\u00a0=\u00a0)', {
        detail: total ? undefined : exclusionText(s.exclusions),
        role: 'exclusion',
        shape: 'rect',
        phase,
        side: true,
      })
      b.edge(id, ex)
    }
    prev = id
  }
  return prev
}

function genFlow(m: StudyModel) {
  const b = new Builder()
  const v = flowVariant(m)
  let phases: Phase[] = []

  if (v === 'consort' || v === 'trend') {
    phases = [
      { id: 'enrol', label: 'Enrolment' },
      { id: 'alloc', label: 'Allocation' },
      { id: 'fu', label: 'Follow-up' },
      { id: 'an', label: 'Analysis' },
    ]
    const steps = m.flowSteps.length
      ? m.flowSteps
      : [{ id: 's1', label: 'Assessed for eligibility', n: null, exclusions: [{ label: 'Not meeting inclusion criteria', n: null }, { label: 'Declined to participate', n: null }, { label: 'Other reasons', n: null }] }]
    let prev = chainSteps(b, steps, 'enrol', null)!
    const last = steps[steps.length - 1].label
    if (!/randomi|enrol/i.test(last)) {
      const id = b.node(v === 'consort' ? `Randomised ${fmtN(m.population.targetN)}` : `Enrolled ${fmtN(m.population.targetN)}`, { role: v === 'consort' ? 'allocation' : 'population', shape: 'rounded', phase: 'enrol' })
      b.edge(prev, id)
      prev = id
    }
    const arms = m.arms.length ? m.arms : [{ id: 'a', label: 'study intervention', kind: 'experimental', intervention: '', details: null, n: null, sequence: [], group: null } as StudyArm]
    for (const a of arms) {
      const al = b.node(`Allocated to ${a.label} ${fmtN(a.n)}`, {
        detail: '• Received allocated intervention (n\u00a0=\u00a0)\n• Did not receive allocated intervention (give reasons) (n\u00a0=\u00a0)',
        role: armRole(a.kind),
        shape: 'rect',
        phase: 'alloc',
      })
      b.edge(prev, al)
      const fu = b.node('Lost to follow-up (give reasons) (n\u00a0=\u00a0)', { detail: 'Discontinued intervention (give reasons) (n\u00a0=\u00a0)', role: 'followup', shape: 'rect', phase: 'fu' })
      b.edge(al, fu)
      const an = b.node('Analysed (n\u00a0=\u00a0)', { detail: '• Excluded from analysis (give reasons) (n\u00a0=\u00a0)', role: 'analysis', shape: 'rect', phase: 'an' })
      b.edge(fu, an)
    }
  } else if (v === 'accord') {
    phases = [
      { id: 'rec', label: 'Recruitment' },
      { id: 'rounds', label: 'Rounds' },
      { id: 'out', label: 'Consensus' },
    ]
    const steps = m.flowSteps.length
      ? m.flowSteps
      : [
          { id: 'f1', label: 'Experts invited', n: null, exclusions: [{ label: 'Declined / no response', n: null }] },
          { id: 'f2', label: 'Experts agreed to participate', n: m.population.targetN, exclusions: [] },
        ]
    let prev = chainSteps(b, steps, 'rec', null)!
    const rounds = m.periods.filter((p) => /round/i.test(p.label))
    const list = rounds.length ? rounds.map((r) => r.label) : ['Round 1', 'Round 2']
    list.forEach((r, i) => {
      const id = b.node(`${r}: responded (n\u00a0=\u00a0)`, { detail: 'Statements rated (n\u00a0=\u00a0)', role: 'treatment', phase: 'rounds' })
      b.edge(prev, id, i > 0 ? { label: 'feedback' } : {})
      const lost = b.node('Did not respond / withdrew (n\u00a0=\u00a0)', { role: 'exclusion', shape: 'rect', phase: 'rounds', side: true })
      b.edge(id, lost)
      prev = id
    })
    if (m.periods.some((p) => /meeting/i.test(p.label))) {
      const id = b.node('Consensus meeting: attended (n\u00a0=\u00a0)', { role: 'allocation', shape: 'hexagon', phase: 'out' })
      b.edge(prev, id)
      prev = id
    }
    const fin = b.node('Statements reaching consensus (n\u00a0=\u00a0)', { detail: 'No consensus (n\u00a0=\u00a0)', role: 'analysis', shape: 'rect', phase: 'out' })
    b.edge(prev, fin)
  } else if (v === 'strobe') {
    phases = [
      { id: 'sel', label: 'Cohort selection' },
      { id: 'grp', label: 'Study groups' },
      { id: 'an', label: 'Analysis' },
    ]
    let prev: string | null = null
    if (m.dataSources.length) prev = b.node('Data source', { detail: `${m.dataSources.join('; ')}`, role: 'data', shape: 'cylinder', phase: 'sel' })
    const steps = m.flowSteps.length
      ? m.flowSteps
      : [
          { id: 's1', label: 'Individuals identified in data source', n: null, exclusions: [{ label: 'Did not meet inclusion criteria', n: null }] },
          { id: 's2', label: 'Eligible individuals', n: null, exclusions: [{ label: 'Met exclusion criteria', n: null }, { label: 'Insufficient enrolment / data', n: null }] },
        ]
    prev = chainSteps(b, steps, 'sel', prev)
    if (!/cohort|included|final|analys/i.test(steps[steps.length - 1].label)) {
      const id = b.node(`Final study cohort ${fmtN(m.population.targetN)}`, { role: 'population', phase: 'sel' })
      if (prev) b.edge(prev, id)
      prev = id
    }
    for (const a of m.arms) {
      const g = b.node(`${a.label} ${fmtN(a.n)}`, { detail: a.intervention && a.intervention !== a.label ? a.intervention : undefined, role: armRole(a.kind), phase: 'grp' })
      if (prev) b.edge(prev, g)
      const an = b.node('Included in analysis (n\u00a0=\u00a0)', { role: 'analysis', shape: 'rect', phase: 'an' })
      b.edge(g, an)
    }
  } else if (v === 'stard') {
    phases = [
      { id: 'enrol', label: 'Enrolment' },
      { id: 'index', label: 'Index test' },
      { id: 'ref', label: 'Reference standard' },
      { id: 'dx', label: 'Final diagnosis' },
    ]
    const indexTest = m.arms[0]?.intervention || m.arms[0]?.label || 'index test'
    const reference = m.arms[1]?.intervention || m.arms[1]?.label || m.design.control || 'reference standard'
    const steps = m.flowSteps.length ? m.flowSteps : [{ id: 's1', label: 'Potentially eligible participants', n: null, exclusions: [{ label: 'Excluded (reasons)', n: null }] }]
    let prev = chainSteps(b, steps, 'enrol', null)!
    const it = b.node(`Received ${indexTest} ${fmtN(null)}`, { role: 'experimental', phase: 'index' })
    b.edge(prev, it)
    const noIt = b.node('No index test (n\u00a0=\u00a0)', { role: 'exclusion', shape: 'rect', phase: 'index', side: true })
    b.edge(it, noIt)
    prev = it
    for (const r of ['positive', 'negative', 'inconclusive']) {
      const res = b.node(`Index test ${r} (n\u00a0=\u00a0)`, { role: r === 'positive' ? 'event' : 'neutral', phase: 'index' })
      b.edge(prev, res)
      const ref = b.node(`${reference[0].toUpperCase()}${reference.slice(1)} (n\u00a0=\u00a0)`, { detail: 'No reference standard (n\u00a0=\u00a0)', role: 'control', shape: 'rect', phase: 'ref' })
      b.edge(res, ref)
      const dx = b.node('Target condition', { detail: '• Present (n\u00a0=\u00a0)\n• Absent (n\u00a0=\u00a0)\n• Inconclusive (n\u00a0=\u00a0)', role: 'analysis', shape: 'rect', phase: 'dx' })
      b.edge(ref, dx)
    }
  } else {
    phases = [
      { id: 'id', label: 'Identification' },
      { id: 'scr', label: 'Screening' },
      { id: 'inc', label: 'Included' },
    ]
    const ident = b.node('Records identified from databases (n\u00a0=\u00a0) and registers (n\u00a0=\u00a0)', { role: 'data', shape: 'rect', phase: 'id' })
    const rem = b.node('Records removed before screening', { detail: '• Duplicates (n\u00a0=\u00a0)\n• Marked ineligible by automation (n\u00a0=\u00a0)\n• Removed for other reasons (n\u00a0=\u00a0)', role: 'exclusion', shape: 'rect', phase: 'id', side: true })
    b.edge(ident, rem)
    const scr = b.node('Records screened (n\u00a0=\u00a0)', { role: 'neutral', shape: 'rect', phase: 'scr' })
    b.edge(ident, scr)
    const ex1 = b.node('Records excluded (n\u00a0=\u00a0)', { role: 'exclusion', shape: 'rect', phase: 'scr', side: true })
    b.edge(scr, ex1)
    const sought = b.node('Reports sought for retrieval (n\u00a0=\u00a0)', { role: 'neutral', shape: 'rect', phase: 'scr' })
    b.edge(scr, sought)
    const nr = b.node('Reports not retrieved (n\u00a0=\u00a0)', { role: 'exclusion', shape: 'rect', phase: 'scr', side: true })
    b.edge(sought, nr)
    const elig = b.node('Reports assessed for eligibility (n\u00a0=\u00a0)', { role: 'neutral', shape: 'rect', phase: 'scr' })
    b.edge(sought, elig)
    const ex2 = b.node('Reports excluded', { detail: '• Reason 1 (n\u00a0=\u00a0)\n• Reason 2 (n\u00a0=\u00a0)\n• Reason 3 (n\u00a0=\u00a0)', role: 'exclusion', shape: 'rect', phase: 'scr', side: true })
    b.edge(elig, ex2)
    const inc = b.node('Studies included in review (n\u00a0=\u00a0)', { detail: 'Reports of included studies (n\u00a0=\u00a0)', role: 'analysis', shape: 'rect', phase: 'inc' })
    b.edge(elig, inc)
  }
  return { nodes: b.nodes, edges: b.edges, phases }
}

/* ------------------------------------------------------------------ */
/* Treatment lines                                                     */
/* ------------------------------------------------------------------ */

function genLines(m: StudyModel) {
  const b = new Builder()
  const lines = m.lines.length
    ? m.lines
    : [{ id: 'l1', label: 'Treatment', regimens: m.arms.map((a) => ({ label: a.label, details: a.intervention !== a.label ? a.intervention : null, isStudyTreatment: a.kind === 'experimental' })), transition: null }]
  const phases: Phase[] = [{ id: 'entry', label: m.indexDate ? 'Cohort entry' : 'Population' }, ...lines.map((l) => ({ id: l.id, label: l.label }))]
  const start = b.node(m.indexDate ? 'Cohort entry' : 'Study population', {
    detail: join(m.indexDate ?? '', short(m.population.description, 120), m.population.targetN ? `N\u00a0=\u00a0${m.population.targetN}` : ''),
    role: 'population',
    phase: 'entry',
  })
  let prevEnds = [start]
  lines.forEach((l, i) => {
    const ids = (l.regimens.length ? l.regimens : [{ label: 'Any therapy', details: null, isStudyTreatment: false }]).map((r) => {
      const id = b.node(r.label, { detail: r.details ?? undefined, role: r.isStudyTreatment ? 'experimental' : 'treatment', phase: l.id })
      for (const p of prevEnds) b.edge(p, id)
      return id
    })
    const last = i === lines.length - 1
    if (!last || l.transition) {
      const t = b.node(l.transition || 'Progression / discontinuation', { role: 'event', shape: 'pill', phase: l.id })
      for (const id of ids) b.edge(id, t)
      prevEnds = [t]
    } else prevEnds = ids
  })
  return { nodes: b.nodes, edges: b.edges, phases }
}

/* ------------------------------------------------------------------ */
/* Time windows                                                        */
/* ------------------------------------------------------------------ */

const windowRole = (k: WindowKind): Role =>
  ({ washout: 'screening', exclusion: 'exclusion', covariate: 'data', exposure: 'experimental', outcome: 'endpoint', 'follow-up': 'followup', enrollment: 'population', other: 'neutral' })[k] as Role

export function rangeText(w: Pick<TimeWindow, 'startDay' | 'endDay'>) {
  const f = (v: number) => (v < 0 ? `−${Math.abs(v)}` : `${v}`)
  const s = w.startDay
  const e = w.endDay
  if (s !== null && e !== null && s === e) return dayLabel(s)
  if (s === null && e === null) return 'All available history'
  if (s === null) return `Up to ${dayLabel(e!)}`
  if (e === null) return `Days [${f(s)}, end of follow-up]`
  return `Days [${f(s)}, ${f(e)}]`
}

export const PLACEHOLDER_WINDOWS: TimeWindow[] = [
  { id: 'w1', label: 'Washout (no prior use of study drugs)', kind: 'washout', startDay: -365, endDay: -1, notes: null },
  { id: 'w2', label: 'Exclusion assessment', kind: 'exclusion', startDay: -365, endDay: -1, notes: null },
  { id: 'w3', label: 'Covariate assessment', kind: 'covariate', startDay: -365, endDay: -1, notes: null },
  { id: 'w4', label: 'Exposure assessment', kind: 'exposure', startDay: 0, endDay: 0, notes: null },
  { id: 'w5', label: 'Follow-up', kind: 'follow-up', startDay: 1, endDay: null, notes: 'until outcome, death, disenrolment, treatment switch or end of data' },
]

function genWindows(m: StudyModel) {
  const b = new Builder()
  const placeholder = !m.windows.length
  const windows = placeholder ? PLACEHOLDER_WINDOWS : m.windows
  b.node(m.indexDate ? `Day 0: ${m.indexDate}` : 'Day 0: Index date', { role: 'neutral', type: 'marker' })
  windows.forEach((w, i) => {
    b.node(w.label, { detail: rangeText(w), role: windowRole(w.kind), shape: 'rect', type: 'window', extra: { startDay: w.startDay, endDay: w.endDay, order: i } })
  })
  const notes = windows.filter((w) => w.notes).map((w) => `${w.label}: ${w.notes}.`)
  const foot = join(placeholder ? 'Placeholder windows — edit them to match the protocol.' : '', ...notes)
  return { nodes: b.nodes, edges: b.edges, phases: [] as Phase[], footnote: foot }
}

/* ------------------------------------------------------------------ */
/* Protocol timeline                                                   */
/* ------------------------------------------------------------------ */

const KIND_ROLE: Record<string, Role> = { active: 'experimental', placebo: 'control', control: 'treatment', off: 'screening', other: 'neutral' }

function genTimeline(m: StudyModel) {
  const b = new Builder()
  const tl = m.timeline.lanes.length ? m.timeline : deriveTimeline(m)
  // milestones first (drawn underneath); same-time milestones share one line and one label
  const byTime = new Map<number, string[]>()
  for (const ms of tl.milestones) {
    const key = [...byTime.keys()].find((t) => Math.abs(t - ms.at) < 0.01) ?? ms.at
    const labels = byTime.get(key) ?? []
    if (!labels.some((l) => l.toLowerCase() === ms.label.toLowerCase())) labels.push(ms.label)
    byTime.set(key, labels)
  }
  for (const [at, labels] of byTime) b.node(labels.join(' / '), { role: 'neutral', type: 'marker', extra: { t0: at } })
  const laneIdx = new Map(tl.lanes.map((l, i) => [l.id, i]))
  const segIds = tl.lanes.map((l, i) => {
    b.node(l.n ? `${l.label} · N=${l.n}` : l.label, { role: 'neutral', type: 'text', extra: { lane: i, tlRole: 'lane' } })
    return l.segments.map((g) => ({ id: b.node(g.label, { role: KIND_ROLE[g.kind] ?? 'neutral', type: 'segment', extra: { lane: i, t0: g.start, t1: g.end } }), g }))
  })
  const eps = 0.01
  for (const k of tl.links) {
    const targets = k.to.map((id) => laneIdx.get(id)).filter((i): i is number => i !== undefined)
    if (!targets.length) continue
    const fromIdx = k.from ? laneIdx.get(k.from) : undefined
    const src = fromIdx === undefined ? undefined : [...segIds[fromIdx]].filter((x) => x.g.start < k.at + eps).sort((a, c) => c.g.start - a.g.start)[0]
    const firstSeg = (lane: number) => segIds[lane].find((x) => x.g.start >= k.at - eps) ?? segIds[lane][0]
    if (k.randomized) {
      const r = b.node('R', { role: 'allocation', shape: 'circle', extra: { lane: targets[0], t0: k.at, fixedSize: true } })
      if (k.ratio) b.node(k.ratio, { role: 'neutral', type: 'text', extra: { lane: targets[0], t0: k.at, tlRole: 'ratio' } })
      if (src) b.edge(src.id, r, { manualHandles: true, lshape: true }), (b.edges[b.edges.length - 1].sourceHandle = 'end'), (b.edges[b.edges.length - 1].targetHandle = 'l')
      for (const t of targets.slice(1)) {
        const seg = firstSeg(t)
        if (!seg) continue
        b.edge(r, seg.id, { manualHandles: true, lshape: true })
        const e = b.edges[b.edges.length - 1]
        e.sourceHandle = 'b'
        e.targetHandle = Math.abs(seg.g.start - k.at) < eps ? 'startTop' : 'start'
      }
    } else if (src) {
      for (const t of targets) {
        const seg = firstSeg(t)
        if (!seg) continue
        b.edge(src.id, seg.id, { manualHandles: true, lshape: true })
        const e = b.edges[b.edges.length - 1]
        e.sourceHandle = 'end'
        e.targetHandle = 'start'
      }
    }
  }

  const phases: Phase[] = tl.phases.map((p) => ({ id: uid('ph'), label: p.label, start: p.start, end: p.end }))
  return { nodes: b.nodes, edges: b.edges, phases, timeline: { unit: tl.unit, breaks: tl.breaks } }
}

/* ------------------------------------------------------------------ */

export function defaultSettings(layout: LayoutKind, m: StudyModel, phases: Phase[]): DiagramSettings {
  const name = m.acronym || short(m.title, 80)
  return {
    title: name ? `${name}: ${layoutLabel(layout)}` : layoutLabel(layout),
    showTitle: true,
    footnote: '',
    showFootnote: false,
    bandStyle: layout === 'flow' ? 'label' : layout === 'schema' || layout === 'lines' ? 'tinted' : 'none',
    showAxis: layout === 'windows' || (layout === 'schema' && phases.some((p) => p.startLabel)),
    axisEndLabel: layout === 'schema' ? 'End of study' : '',
    fontSize: 13,
    nodeWidth: 0,
    rankGap: layout === 'flow' ? 44 : 56,
    nodeGap: 22,
    page: 'auto',
  }
}

export function generateDiagram(m: StudyModel, layout: LayoutKind, direction: Direction = 'LR'): Diagram {
  const g =
    layout === 'schema' ? genSchema(m) : layout === 'flow' ? genFlow(m) : layout === 'lines' ? genLines(m) : layout === 'windows' ? genWindows(m) : genTimeline(m)
  const settings = defaultSettings(layout, m, g.phases)
  const foot = 'footnote' in g ? (g.footnote as string) : ''
  const overall = layout === 'schema' ? m.periods.filter((p) => isOverallPeriod(p) && p.duration).map((p) => `${p.label}: ${p.duration ?? ''}.`.replace(': .', '.')) : []
  const notes = layout === 'schema' ? [...overall, ...m.notes].join(' ') : ''
  if (layout !== 'timeline') {
    // phases follow the order in which the flow reaches them (keeps the layout's phase partitions monotonic)
    const first = new Map<string, number>()
    g.nodes.forEach((n, i) => n.data.phase && !first.has(n.data.phase) && first.set(n.data.phase, i))
    g.phases.sort((a, b) => (first.get(a.id) ?? 1e9) - (first.get(b.id) ?? 1e9))
  }
  settings.footnote = join(foot, notes).replace(/\n/g, ' ')
  settings.showFootnote = !!settings.footnote
  return {
    id: uid('d'),
    name: layoutLabel(layout),
    layout,
    direction,
    nodes: g.nodes,
    edges: g.edges,
    phases: g.phases,
    settings: layout === 'timeline' ? { ...settings, bandStyle: 'none', showAxis: true } : settings,
    timeline: 'timeline' in g ? (g.timeline as Diagram['timeline']) : undefined,
  }
}

export function recommendedLayouts(m: StudyModel): LayoutKind[] {
  const list = m.recommendedLayouts.length ? m.recommendedLayouts : studyTypeInfo(m.studyType).layouts
  return [...new Set(list)].slice(0, 4)
}

export function guidelinesFor(m: StudyModel): GuidelineId[] {
  return m.guidelines.length ? m.guidelines : studyTypeInfo(m.studyType).guidelines
}

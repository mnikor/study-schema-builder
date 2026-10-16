import type { Diagram, GuidelineId, LayoutKind, Project } from '../types'
import { guidelineInfo, type GuidelineInfo } from './catalog'

export type Status = 'pass' | 'warn' | 'fail' | 'info'

export interface CheckItem {
  id: string
  text: string
  status: Status
  note?: string
  fix?: { label: string; layout: LayoutKind }
}

export interface GuidelineReport {
  guideline: GuidelineInfo
  items: CheckItem[]
}

function ctx(p: Project) {
  const pages = (k: LayoutKind) => p.diagrams.filter((d) => d.layout === k)
  const nodeText = (d: Diagram) =>
    d.nodes
      .map((n) => [n.data.label, n.data.detail ?? ''].join(' '))
      .join(' \n ')
  const text = (k: LayoutKind) => [...pages(k), ...(k === 'schema' ? pages('timeline') : [])].map(nodeText).join(' ').toLowerCase()
  const has = (k: LayoutKind) => pages(k).length > 0
  const placeholders = (k: LayoutKind) => (text(k).match(/\(n\s*=\s*\)/g) ?? []).length
  const sideCount = (k: LayoutKind) => pages(k).reduce((s, d) => s + d.nodes.filter((n) => n.data.side && n.data.role === 'exclusion').length, 0)
  const windowLabels = pages('windows').flatMap((d) => d.nodes.filter((n) => n.type === 'window').map((n) => n.data.label.toLowerCase()))
  return { pages, text, has, placeholders, sideCount, windowLabels }
}

const ok = (b: boolean, failStatus: Status = 'warn'): Status => (b ? 'pass' : failStatus)

export function runChecks(p: Project): GuidelineReport[] {
  const c = ctx(p)
  const m = p.model
  const addPage = (layout: LayoutKind, label: string) => ({ label, layout })
  const placeholderItem = (k: LayoutKind): CheckItem[] => {
    const n = c.placeholders(k)
    return n ? [{ id: `ph-${k}`, text: 'Numbers at each stage', status: 'info', note: `${n} “(n = )” placeholders to complete when counts are available.` }] : []
  }

  const rules: Record<GuidelineId, () => CheckItem[]> = {
    spirit: () => {
      const schema = c.pages('schema')[0] ?? c.pages('timeline')[0]
      return [
        { id: 'schema', text: 'Study schema figure (design schema or protocol timeline)', status: ok(!!schema, 'fail'), fix: schema ? undefined : addPage('schema', 'Add schema page') },
        { id: 'pop', text: 'Eligible population and target sample size', status: ok(!!m.population.description && !!m.population.targetN), note: m.population.targetN ? undefined : 'No target sample size in the study details.' },
        {
          id: 'alloc',
          text: 'Allocation method and ratio',
          status: m.design.randomized ? ok(!!m.design.allocationRatio) : 'info',
          note: m.design.randomized ? (m.design.allocationRatio ? undefined : 'Randomised, but no ratio given.') : 'Not randomised.',
        },
        { id: 'arms', text: 'Interventions for each arm', status: ok(m.arms.length > 0 && m.arms.every((a) => !!(a.intervention || a.details || a.sequence.length))), note: m.arms.length ? undefined : 'No arms in the study details.' },
        { id: 'timing', text: 'Period durations / timepoints', status: ok(!!schema && (schema.layout === 'timeline' || schema.phases.some((ph) => ph.duration || ph.startLabel))) },
        { id: 'outcome', text: 'Primary outcome and timepoint', status: ok(m.endpoints.primary.length > 0) },
      ]
    },
    consort: () => {
      const has = c.has('flow')
      const t = c.text('flow')
      return [
        { id: 'flow', text: 'Participant flow diagram', status: ok(has, 'fail'), fix: has ? undefined : addPage('flow', 'Add flow page') },
        { id: 'enrol', text: 'Enrolment: assessed for eligibility, exclusions with reasons', status: ok(has && /eligib/.test(t) && c.sideCount('flow') > 0) },
        { id: 'alloc', text: 'Allocation: numbers allocated and receiving intervention per group', status: ok(has && m.arms.every((a) => t.includes(`allocated to ${a.label.toLowerCase()}`)) && /received/.test(t)) },
        { id: 'fu', text: 'Follow-up: losses and discontinuations per group, with reasons', status: ok(has && /lost to follow-up/.test(t) && /discontinu/.test(t)) },
        { id: 'an', text: 'Analysis: numbers analysed per group', status: ok(has && /analys/.test(t)) },
        ...placeholderItem('flow'),
      ]
    },
    'ich-m11': () => {
      const schema = c.pages('schema')[0] ?? c.pages('timeline')[0]
      return [
        { id: 'schema', text: 'Trial schema (section 1.2)', status: ok(!!schema, 'fail'), fix: schema ? undefined : addPage('schema', 'Add schema page') },
        { id: 'periods', text: 'Schema shows periods with durations', status: ok(!!schema && (schema.layout === 'timeline' ? schema.phases.length >= 1 : schema.phases.filter((ph) => ph.duration).length >= 2)) },
        { id: 'arms', text: 'Schema shows all arms and allocation', status: ok(!!schema && m.arms.every((a) => c.text('schema').includes(a.label.toLowerCase()))) },
      ]
    },
    trend: () => [
      { id: 'flow', text: 'Participant flow diagram', status: ok(c.has('flow')), fix: c.has('flow') ? undefined : addPage('flow', 'Add flow page') },
      { id: 'assign', text: 'Assignment to study conditions shown', status: ok(c.has('flow') && (/allocated|enrolled|assign/.test(c.text('flow')))) },
      ...placeholderItem('flow'),
    ],
    strobe: () => {
      const has = c.has('flow')
      return [
        { id: 'flow', text: 'Flow diagram (item 13c)', status: ok(has), note: has ? undefined : 'STROBE asks authors to consider a flow diagram.', fix: has ? undefined : addPage('flow', 'Add flow page') },
        { id: 'stages', text: 'Numbers at each stage of the study (item 13a)', status: ok(has && /\(n\s*=/.test(c.text('flow'))) },
        { id: 'reasons', text: 'Reasons for non-participation at each stage (item 13b)', status: ok(c.sideCount('flow') > 0) },
        { id: 'groups', text: 'Exposure / comparison groups shown', status: ok(m.arms.length > 0), note: m.arms.length ? undefined : 'No groups in the study details.' },
        ...placeholderItem('flow'),
      ]
    },
    record: () => {
      const t = [c.text('flow'), c.text('schema')].join(' ')
      const linked = m.dataSources.length > 1
      return [
        { id: 'sel', text: 'Population selection incl. data quality, availability and linkage (item 13.1)', status: ok(c.has('flow') && c.sideCount('flow') >= 2), fix: c.has('flow') ? undefined : addPage('flow', 'Add flow page') },
        { id: 'src', text: 'Data source(s) shown', status: ok(m.dataSources.length > 0 && m.dataSources.some((s) => t.includes(s.toLowerCase().slice(0, 12)))) },
        { id: 'link', text: 'Linkage of data sources shown', status: linked ? ok(/link/.test(t)) : 'info', note: linked ? undefined : 'Single data source.' },
      ]
    },
    'record-pe': () => {
      const w = c.windowLabels
      const has = c.has('windows')
      return [
        { id: 'diagram', text: 'Design diagram anchored on the index date', status: ok(has, 'fail'), fix: has ? undefined : addPage('windows', 'Add time-window page') },
        { id: 'exp', text: 'Exposure assessment window', status: ok(w.some((l) => /exposure|treatment start|strategy/.test(l))) },
        { id: 'cov', text: 'Covariate assessment window', status: ok(w.some((l) => /covariate|baseline/.test(l))) },
        { id: 'fu', text: 'Follow-up window and censoring', status: ok(w.some((l) => /follow/.test(l))) },
        { id: 'wo', text: 'Washout / new-user definition (if applicable)', status: w.some((l) => /washout|new.user|prior use/.test(l)) ? 'pass' : 'info' },
      ]
    },
    harper: () => [
      { id: 'diagram', text: 'Study design diagram', status: ok(c.has('windows'), 'fail'), fix: c.has('windows') ? undefined : addPage('windows', 'Add time-window page') },
      { id: 'flow', text: 'Participant flow / attrition', status: ok(c.has('flow')), fix: c.has('flow') ? undefined : addPage('flow', 'Add flow page') },
      { id: 'index', text: 'Index date defined', status: ok(!!m.indexDate) },
    ],
    'design-diagram': () => {
      const d = c.pages('windows')[0]
      return [
        { id: 'diagram', text: 'Longitudinal design diagram', status: ok(!!d, 'fail'), fix: d ? undefined : addPage('windows', 'Add time-window page') },
        { id: 'index', text: 'Index date (Day 0) marked and defined', status: ok(!!d && d.nodes.some((n) => n.type === 'marker') && !!m.indexDate) },
        { id: 'ranges', text: 'Each window shows its day range', status: ok(!!d && d.nodes.filter((n) => n.type === 'window').every((n) => /day/i.test(n.data.detail ?? ''))) },
        { id: 'axis', text: 'Time axis shown', status: ok(!!d && d.settings.showAxis) },
      ]
    },
    stard: () => {
      const t = c.text('flow')
      return [
        { id: 'flow', text: 'Participant flow diagram (item 19)', status: ok(c.has('flow'), 'fail'), fix: c.has('flow') ? undefined : addPage('flow', 'Add flow page') },
        { id: 'results', text: 'Index test results by category', status: ok(/positive/.test(t) && /negative/.test(t)) },
        { id: 'ref', text: 'Reference standard per index-test result', status: ok(/reference|standard/.test(t)) },
        { id: 'excl', text: 'Exclusions with reasons', status: ok(c.sideCount('flow') > 0) },
        ...placeholderItem('flow'),
      ]
    },
    accord: () => {
      const t = c.text('flow')
      const st = c.text('schema')
      return [
        { id: 'process', text: 'Consensus process (panel, rounds, meetings) shown', status: ok(c.has('schema') && /round/.test(st)), fix: c.has('schema') ? undefined : addPage('schema', 'Add schema page') },
        { id: 'flow', text: 'Participation at each round (invited, responded)', status: ok(c.has('flow') && /invited|responded/.test(t)), fix: c.has('flow') ? undefined : addPage('flow', 'Add flow page') },
        { id: 'definition', text: 'Consensus definition (threshold) stated', status: ok(m.endpoints.primary.some((e) => /%|agree|consensus/i.test(e))), note: 'Usually a percentage agreement threshold.' },
        ...placeholderItem('flow'),
      ]
    },
    prisma: () => {
      const t = c.text('flow')
      return [
        { id: 'flow', text: 'PRISMA flow diagram (item 16a)', status: ok(c.has('flow'), 'fail'), fix: c.has('flow') ? undefined : addPage('flow', 'Add flow page') },
        { id: 'ident', text: 'Records identified (databases, registers)', status: ok(/identified/.test(t)) },
        { id: 'screen', text: 'Records screened and excluded', status: ok(/screened/.test(t) && /excluded/.test(t)) },
        { id: 'elig', text: 'Reports assessed, with exclusion reasons', status: ok(/assessed for eligibility/.test(t)) },
        { id: 'inc', text: 'Studies included', status: ok(/included/.test(t)) },
        ...placeholderItem('flow'),
      ]
    },
  }

  return p.guidelines.map((g) => ({ guideline: guidelineInfo(g), items: rules[g]() }))
}

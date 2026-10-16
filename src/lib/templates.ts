import type { StudyArm, StudyModel, StudyPeriod, StudyTypeId } from '../types'

export function blankModel(studyType: StudyTypeId = 'rct-parallel'): StudyModel {
  return {
    title: 'Untitled study',
    acronym: null,
    studyType,
    studyTypeRationale: '',
    phase: null,
    guidelines: [],
    recommendedLayouts: [],
    population: { description: '', targetN: null, keyInclusion: [], keyExclusion: [] },
    design: { randomized: false, allocationRatio: null, blinding: null, stratification: [], control: null },
    periods: [],
    arms: [],
    flowSteps: [],
    lines: [],
    windows: [],
    indexDate: null,
    timeline: { unit: 'weeks', lanes: [], links: [], milestones: [], phases: [], breaks: [] },
    endpoints: { primary: [], secondary: [] },
    dataSources: [],
    notes: [],
    openQuestions: [],
    evidence: [],
  }
}

const P = (id: string, label: string, kind: StudyPeriod['kind'], duration: string | null = null, startLabel: string | null = null): StudyPeriod => ({ id, label, kind, duration, startLabel })
const A = (id: string, label: string, kind: StudyArm['kind'], intervention = '', o: Partial<StudyArm> = {}): StudyArm => ({ id, label, kind, intervention, details: null, n: null, sequence: [], group: null, ...o })

const m = (studyType: StudyTypeId, o: Partial<StudyModel>): StudyModel => ({ ...blankModel(studyType), ...o })

export interface Template {
  id: string
  name: string
  model: StudyModel
}

export const TEMPLATES: Template[] = [
  {
    id: 'rct',
    name: 'Phase 3 double-blind RCT',
    model: m('rct-parallel', {
      title: 'Example: Drug A versus placebo in moderate-to-severe disease',
      acronym: 'EXAMPLE-RCT',
      phase: 'Phase 3',
      population: { description: 'Adults with moderate-to-severe disease and inadequate response to standard therapy', targetN: '600', keyInclusion: ['Age ≥ 18 years', 'Disease score ≥ 6', 'Failed ≥ 1 prior therapy'], keyExclusion: [] },
      design: { randomized: true, allocationRatio: '2:1', blinding: 'Double-blind', stratification: ['Prior biologic use', 'Region'], control: 'Placebo' },
      periods: [P('scr', 'Screening', 'screening', 'Up to 28 days', 'Day −28'), P('trt', 'Treatment', 'treatment', '52 weeks', 'Day 1'), P('fu', 'Safety follow-up', 'follow-up', '12 weeks', 'Week 52')],
      arms: [A('a1', 'Drug A 200 mg', 'experimental', 'Drug A 200 mg orally once daily', { n: '400' }), A('a2', 'Placebo', 'placebo', 'Matching placebo orally once daily', { n: '200' })],
      endpoints: { primary: ['Clinical remission at Week 52'], secondary: ['Endoscopic improvement at Week 52'] },
      notes: ['Synthetic example for demonstration.'],
    }),
  },
  {
    id: 'rwd-timeline',
    name: 'Randomised withdrawal (timeline)',
    model: m('rct-parallel', {
      title: 'Example: randomised withdrawal study with adult and adolescent cohorts',
      acronym: 'EXAMPLE-RWD',
      phase: 'Phase 3',
      population: { description: 'Adults and adolescents with moderate-to-severe disease', targetN: '540', keyInclusion: [], keyExclusion: [] },
      design: { randomized: true, allocationRatio: '2:1', blinding: 'Double-blind', stratification: [], control: 'Placebo' },
      arms: [A('a', 'Treatment A', 'experimental', 'Treatment A'), A('p', 'Placebo', 'placebo', 'Placebo, then Treatment A from Week 16')],
      recommendedLayouts: ['timeline', 'schema', 'flow'],
      endpoints: { primary: ['Maintenance of response at Week 52'], secondary: [] },
      timeline: {
        unit: 'weeks',
        lanes: [
          { id: 'adults', label: 'Adults', n: '540', segments: [{ label: 'Treatment A', start: 0, end: 24, kind: 'active' }] },
          { id: 'respA', label: 'Responders', n: null, segments: [{ label: 'Treatment A', start: 24, end: 52, kind: 'active' }, { label: 'Treatment A', start: 52, end: 160, kind: 'active' }] },
          { id: 'respP', label: 'Responders', n: null, segments: [{ label: 'Placebo', start: 24, end: 52, kind: 'placebo' }, { label: 'Treatment A', start: 52, end: 160, kind: 'active' }] },
          { id: 'nonresp', label: 'Nonresponders', n: null, segments: [{ label: 'Treatment A', start: 24, end: 160, kind: 'active' }] },
          { id: 'comp', label: 'Adult comparator', n: null, segments: [{ label: 'Placebo', start: 0, end: 16, kind: 'placebo' }, { label: 'Treatment A', start: 16, end: 160, kind: 'active' }] },
          { id: 'adol', label: 'Adolescents', n: null, segments: [{ label: 'Treatment A', start: 0, end: 160, kind: 'active' }] },
        ],
        links: [
          { from: null, at: 0, to: ['adults', 'comp'], randomized: true, ratio: '2:1' },
          { from: 'adults', at: 24, to: ['respA', 'respP'], randomized: true, ratio: '1:1' },
          { from: 'adults', at: 24, to: ['nonresp'], randomized: false, ratio: null },
        ],
        milestones: [{ at: 24, label: 'Response assessment' }],
        phases: [
          { label: 'Initial treatment', start: 0, end: 24 },
          { label: 'Randomized withdrawal', start: 24, end: 52 },
        ],
        breaks: [{ from: 52, to: 148 }],
      },
    }),
  },
  {
    id: 'crossover',
    name: '2×2 crossover trial',
    model: m('rct-crossover', {
      title: 'Example: two-period crossover of Formulation T versus Reference R',
      acronym: 'EXAMPLE-XO',
      phase: 'Phase 1',
      population: { description: 'Healthy volunteers', targetN: '24', keyInclusion: ['Age 18–55 years', 'BMI 18–30 kg/m²'], keyExclusion: [] },
      design: { randomized: true, allocationRatio: '1:1', blinding: 'Open-label', stratification: [], control: 'Reference R' },
      periods: [P('scr', 'Screening', 'screening', 'Up to 21 days', 'Day −21'), P('p1', 'Period 1', 'treatment', 'Single dose', 'Day 1'), P('wo', 'Washout', 'washout', '7 days', 'Day 2'), P('p2', 'Period 2', 'treatment', 'Single dose', 'Day 9'), P('fu', 'Follow-up', 'follow-up', '7 days', 'Day 10')],
      arms: [A('s1', 'Sequence TR', 'experimental', '', { sequence: ['Test (T)', 'Reference (R)'], n: '12' }), A('s2', 'Sequence RT', 'active-control', '', { sequence: ['Reference (R)', 'Test (T)'], n: '12' })],
      endpoints: { primary: ['AUC and Cmax'], secondary: [] },
    }),
  },
  {
    id: 'single-arm',
    name: 'Single-arm phase 2',
    model: m('single-arm', {
      title: 'Example: open-label single-arm study of Drug B in relapsed disease',
      acronym: 'EXAMPLE-SA',
      phase: 'Phase 2',
      population: { description: 'Adults with relapsed or refractory disease after ≥ 2 prior lines', targetN: '80', keyInclusion: ['Measurable disease', 'ECOG 0–1'], keyExclusion: [] },
      periods: [P('scr', 'Screening', 'screening', 'Up to 28 days', 'Day −28'), P('trt', 'Treatment', 'treatment', 'Until progression or unacceptable toxicity', 'Cycle 1 Day 1'), P('fu', 'Survival follow-up', 'follow-up', 'Every 12 weeks', 'End of treatment')],
      arms: [A('a1', 'Drug B', 'experimental', 'Drug B 10 mg/kg IV every 3 weeks', { n: '80' })],
      endpoints: { primary: ['Objective response rate'], secondary: ['Duration of response', 'Progression-free survival'] },
    }),
  },
  {
    id: 'fih',
    name: 'Dose escalation + expansion',
    model: m('dose-escalation', {
      title: 'Example: first-in-human 3+3 dose escalation with expansion cohorts',
      acronym: 'EXAMPLE-FIH',
      phase: 'Phase 1/2',
      population: { description: 'Adults with advanced solid tumours', targetN: '~90', keyInclusion: ['No standard therapy available'], keyExclusion: [] },
      periods: [P('scr', 'Screening', 'screening', 'Up to 28 days'), P('esc', 'Dose escalation', 'treatment', '3+3 design'), P('exp', 'Expansion', 'treatment', 'At RP2D'), P('fu', 'Follow-up', 'follow-up', '30 days after last dose')],
      arms: [
        A('d1', 'Dose level 1', 'experimental', '50 mg'),
        A('d2', 'Dose level 2', 'experimental', '100 mg'),
        A('d3', 'Dose level 3', 'experimental', '200 mg'),
        A('d4', 'Dose level 4', 'experimental', '400 mg'),
        A('e1', 'Expansion cohort A', 'experimental', 'Tumour type A', { group: 'Expansion' }),
        A('e2', 'Expansion cohort B', 'experimental', 'Tumour type B', { group: 'Expansion' }),
      ],
      endpoints: { primary: ['Dose-limiting toxicities', 'RP2D'], secondary: [] },
    }),
  },
  {
    id: 'platform',
    name: 'Umbrella / platform trial',
    model: m('platform', {
      title: 'Example: biomarker-driven umbrella trial',
      acronym: 'EXAMPLE-UMB',
      phase: 'Phase 2',
      population: { description: 'Patients with advanced disease and centrally tested biomarker profile', targetN: null, keyInclusion: [], keyExclusion: [] },
      design: { randomized: false, allocationRatio: null, blinding: 'Open-label', stratification: [], control: null },
      periods: [P('scr', 'Molecular screening', 'screening', 'Central NGS testing'), P('trt', 'Sub-study treatment', 'treatment'), P('fu', 'Follow-up', 'follow-up')],
      arms: [
        A('a1', 'Targeted agent 1', 'experimental', '', { group: 'Biomarker A+' }),
        A('a2', 'Targeted agent 2', 'experimental', '', { group: 'Biomarker B+' }),
        A('a3', 'Immunotherapy', 'experimental', '', { group: 'No actionable marker' }),
      ],
      endpoints: { primary: ['Objective response rate per sub-study'], secondary: [] },
    }),
  },
  {
    id: 'rwe-cohort',
    name: 'RWE new-user cohort (claims)',
    model: m('cohort-retrospective', {
      title: 'Example: new users of Drug C versus Drug D and risk of hospitalisation',
      acronym: 'EXAMPLE-RWE',
      population: { description: 'Adults initiating Drug C or Drug D with ≥ 365 days continuous enrolment', targetN: null, keyInclusion: ['Age ≥ 18 years', '≥ 365 days continuous enrolment'], keyExclusion: [] },
      dataSources: ['US commercial claims database, 2015–2024'],
      indexDate: 'first dispensing of Drug C or Drug D',
      periods: [P('lb', 'Baseline', 'lookback', '365 days', 'Day −365'), P('fu', 'Follow-up', 'follow-up', 'Until censoring', 'Day 1')],
      arms: [A('c', 'Drug C initiators', 'exposure', 'Drug C'), A('d', 'Drug D initiators', 'comparator', 'Drug D')],
      flowSteps: [
        { id: 'f1', label: 'Patients with ≥ 1 dispensing of Drug C or D', n: null, exclusions: [] },
        { id: 'f2', label: '≥ 365 days continuous enrolment before index', n: null, exclusions: [{ label: 'Insufficient enrolment', n: null }] },
        { id: 'f3', label: 'No use of either drug in prior 365 days', n: null, exclusions: [{ label: 'Prevalent users', n: null }] },
        { id: 'f4', label: 'No outcome event in prior 365 days', n: null, exclusions: [{ label: 'Prior outcome', n: null }] },
      ],
      windows: [
        { id: 'w1', label: 'Washout for study drugs', kind: 'washout', startDay: -365, endDay: -1, notes: null },
        { id: 'w2', label: 'Exclusion assessment (prior outcome)', kind: 'exclusion', startDay: -365, endDay: -1, notes: null },
        { id: 'w3', label: 'Covariate assessment', kind: 'covariate', startDay: -365, endDay: 0, notes: null },
        { id: 'w4', label: 'Exposure assessment', kind: 'exposure', startDay: 0, endDay: 0, notes: null },
        { id: 'w5', label: 'Follow-up for outcome', kind: 'follow-up', startDay: 1, endDay: null, notes: 'until hospitalisation, treatment discontinuation or switch, disenrolment, death or end of data' },
      ],
      endpoints: { primary: ['Hospitalisation for heart failure'], secondary: [] },
    }),
  },
  {
    id: 'case-control',
    name: 'Nested case-control',
    model: m('case-control', {
      title: 'Example: nested case-control study of Drug E and fracture',
      population: { description: 'Cases with incident fracture matched 1:4 to controls on age, sex and calendar time', targetN: null, keyInclusion: [], keyExclusion: [] },
      dataSources: ['Primary care EHR linked to hospital data'],
      indexDate: 'date of fracture (cases) / matched date (controls)',
      arms: [A('ca', 'Cases', 'cohort', 'Incident fracture'), A('co', 'Matched controls', 'comparator', '4 per case')],
      windows: [
        { id: 'w1', label: 'Minimum database history', kind: 'enrollment', startDay: -730, endDay: -1, notes: null },
        { id: 'w2', label: 'Exposure assessment (Drug E use)', kind: 'exposure', startDay: -365, endDay: -1, notes: null },
        { id: 'w3', label: 'Covariate assessment', kind: 'covariate', startDay: -730, endDay: -1, notes: null },
      ],
    }),
  },
  {
    id: 'eca',
    name: 'External control arm',
    model: m('external-control', {
      title: 'Example: single-arm trial versus real-world external control',
      population: { description: 'Trial participants and RWD patients meeting harmonised eligibility', targetN: null, keyInclusion: [], keyExclusion: [] },
      dataSources: ['Single-arm trial data', 'Oncology EHR-derived database'],
      indexDate: 'start of eligible line of therapy',
      design: { randomized: false, allocationRatio: null, blinding: null, stratification: [], control: 'Real-world standard of care' },
      periods: [P('lb', 'Baseline', 'lookback', '90 days', 'Day −90'), P('fu', 'Follow-up', 'follow-up', 'Until death or end of data', 'Day 0')],
      arms: [A('t', 'Trial arm', 'experimental', 'Drug F (single-arm trial)'), A('rw', 'External control', 'comparator', 'Physician’s choice (RWD)')],
      windows: [
        { id: 'w1', label: 'Eligibility & covariate assessment', kind: 'covariate', startDay: -90, endDay: 0, notes: null },
        { id: 'w2', label: 'Treatment start', kind: 'exposure', startDay: 0, endDay: 0, notes: null },
        { id: 'w3', label: 'Follow-up for overall survival', kind: 'follow-up', startDay: 1, endDay: null, notes: 'until death, loss to follow-up or data cut-off' },
      ],
      endpoints: { primary: ['Overall survival'], secondary: [] },
    }),
  },
  {
    id: 'lines',
    name: 'Treatment patterns (lines)',
    model: m('treatment-patterns', {
      title: 'Example: real-world lines of therapy in advanced disease',
      population: { description: 'Patients newly diagnosed with advanced disease', targetN: null, keyInclusion: [], keyExclusion: [] },
      dataSources: ['EHR-derived oncology database'],
      indexDate: 'advanced diagnosis',
      lines: [
        { id: 'l1', label: '1st line', regimens: [{ label: 'Chemo-immunotherapy', details: null, isStudyTreatment: false }, { label: 'Immunotherapy alone', details: null, isStudyTreatment: false }, { label: 'Targeted therapy', details: 'biomarker-positive', isStudyTreatment: false }], transition: 'Progression or intolerance' },
        { id: 'l2', label: '2nd line', regimens: [{ label: 'Docetaxel ± anti-VEGF', details: null, isStudyTreatment: false }, { label: 'Study drug G', details: 'subgroup of interest', isStudyTreatment: true }], transition: 'Progression' },
        { id: 'l3', label: '3rd line and later', regimens: [{ label: 'Clinical trial / other', details: null, isStudyTreatment: false }, { label: 'Best supportive care', details: null, isStudyTreatment: false }], transition: null },
      ],
    }),
  },
  {
    id: 'registry',
    name: 'Prospective registry',
    model: m('registry', {
      title: 'Example: prospective disease registry with 5-year follow-up',
      population: { description: 'Patients with confirmed diagnosis treated in routine care', targetN: '2,000', keyInclusion: [], keyExclusion: [] },
      periods: [P('en', 'Enrolment', 'baseline', 'Baseline visit', 'Month 0'), P('fu', 'Routine-care follow-up', 'observation', 'Visits every 6 months', 'Month 6'), P('end', 'End of observation', 'follow-up', 'Up to 5 years', 'Year 5')],
      arms: [A('c', 'Registry cohort', 'cohort', 'Any treatment per physician decision')],
      endpoints: { primary: ['Long-term safety and effectiveness'], secondary: [] },
    }),
  },
  {
    id: 'tte',
    name: 'Target trial emulation',
    model: m('target-trial-emulation', {
      title: 'Example: emulated trial of early versus delayed treatment',
      population: { description: 'Eligible patients at each emulated baseline (sequential trials)', targetN: null, keyInclusion: [], keyExclusion: [] },
      dataSources: ['National registry linked to prescriptions'],
      indexDate: 'time zero (eligibility met and treatment strategy assigned)',
      design: { randomized: false, allocationRatio: null, blinding: null, stratification: [], control: 'Delayed treatment' },
      arms: [A('e', 'Initiate within 30 days', 'exposure', 'Early treatment strategy'), A('d', 'Delay ≥ 6 months', 'comparator', 'Delayed treatment strategy')],
      windows: [
        { id: 'w1', label: 'Eligibility & covariate assessment', kind: 'covariate', startDay: -365, endDay: 0, notes: null },
        { id: 'w2', label: 'Grace period for strategy assignment', kind: 'exposure', startDay: 0, endDay: 30, notes: null },
        { id: 'w3', label: 'Follow-up', kind: 'follow-up', startDay: 0, endDay: 1825, notes: 'or censoring at deviation from assigned strategy' },
      ],
      endpoints: { primary: ['5-year risk of outcome'], secondary: [] },
    }),
  },
  {
    id: 'diag',
    name: 'Diagnostic accuracy study',
    model: m('diagnostic-accuracy', {
      title: 'Example: accuracy of a point-of-care test versus laboratory reference',
      population: { description: 'Consecutive patients presenting with suspected condition', targetN: '500', keyInclusion: [], keyExclusion: [] },
      arms: [A('it', 'Index test', 'experimental', 'point-of-care test'), A('rs', 'Reference standard', 'comparator', 'laboratory reference test')],
    }),
  },
  {
    id: 'sr',
    name: 'Systematic review (PRISMA)',
    model: m('systematic-review', {
      title: 'Example: systematic review and meta-analysis',
    }),
  },
]

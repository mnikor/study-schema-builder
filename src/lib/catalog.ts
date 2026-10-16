import type { GuidelineId, LayoutKind, Role, StudyTypeId } from '../types'

export type Category = 'Interventional' | 'Observational / RWE' | 'Diagnostic' | 'Evidence synthesis' | 'Consensus'

export interface StudyTypeInfo {
  id: StudyTypeId
  label: string
  category: Category
  blurb: string
  guidelines: GuidelineId[]
  layouts: LayoutKind[]
}

export const STUDY_TYPES: StudyTypeInfo[] = [
  { id: 'rct-parallel', label: 'Randomised controlled trial (parallel)', category: 'Interventional', blurb: 'Two or more arms followed in parallel after randomisation.', guidelines: ['spirit', 'consort', 'ich-m11'], layouts: ['schema', 'flow'] },
  { id: 'rct-crossover', label: 'Crossover trial', category: 'Interventional', blurb: 'Each participant receives treatments in sequence, usually with washout.', guidelines: ['spirit', 'consort', 'ich-m11'], layouts: ['schema', 'flow'] },
  { id: 'rct-factorial', label: 'Factorial trial', category: 'Interventional', blurb: 'Two or more interventions tested in combination (e.g. 2×2).', guidelines: ['spirit', 'consort', 'ich-m11'], layouts: ['schema', 'flow'] },
  { id: 'single-arm', label: 'Single-arm trial', category: 'Interventional', blurb: 'All participants receive the study treatment; no concurrent control.', guidelines: ['spirit', 'ich-m11', 'trend'], layouts: ['schema', 'flow'] },
  { id: 'dose-escalation', label: 'Dose escalation / first-in-human', category: 'Interventional', blurb: 'Sequential dose levels (e.g. 3+3, BOIN) followed by expansion.', guidelines: ['spirit', 'ich-m11'], layouts: ['schema', 'timeline'] },
  { id: 'platform', label: 'Master protocol (platform / umbrella / basket)', category: 'Interventional', blurb: 'Several sub-studies or arms under one protocol.', guidelines: ['spirit', 'consort', 'ich-m11'], layouts: ['schema', 'flow'] },
  { id: 'cohort-prospective', label: 'Prospective cohort study', category: 'Observational / RWE', blurb: 'Participants enrolled and followed forward in time.', guidelines: ['strobe'], layouts: ['schema', 'flow'] },
  { id: 'cohort-retrospective', label: 'Retrospective cohort (database / RWE)', category: 'Observational / RWE', blurb: 'Cohort built from claims, EHR or registry data around an index date.', guidelines: ['strobe', 'record', 'record-pe', 'harper', 'design-diagram'], layouts: ['windows', 'flow', 'schema'] },
  { id: 'case-control', label: 'Case-control study', category: 'Observational / RWE', blurb: 'Cases and matched controls compared on prior exposure.', guidelines: ['strobe', 'record', 'design-diagram'], layouts: ['windows', 'flow', 'schema'] },
  { id: 'cross-sectional', label: 'Cross-sectional study / survey', category: 'Observational / RWE', blurb: 'Exposure and outcome measured at one point in time.', guidelines: ['strobe'], layouts: ['flow', 'schema'] },
  { id: 'registry', label: 'Registry / non-interventional study', category: 'Observational / RWE', blurb: 'Routine-care data collected prospectively in a registry.', guidelines: ['strobe', 'record'], layouts: ['schema', 'flow'] },
  { id: 'external-control', label: 'External control arm (trial vs RWD)', category: 'Observational / RWE', blurb: 'Single-arm trial patients compared with a real-world comparator cohort.', guidelines: ['record', 'record-pe', 'harper', 'design-diagram'], layouts: ['schema', 'windows', 'flow'] },
  { id: 'target-trial-emulation', label: 'Target trial emulation', category: 'Observational / RWE', blurb: 'Observational analysis designed to mimic a hypothetical randomised trial.', guidelines: ['record-pe', 'harper', 'design-diagram'], layouts: ['windows', 'flow', 'schema'] },
  { id: 'treatment-patterns', label: 'Treatment patterns / lines of therapy', category: 'Observational / RWE', blurb: 'Sequences of treatment lines in routine care.', guidelines: ['strobe', 'record'], layouts: ['lines', 'flow', 'windows'] },
  { id: 'diagnostic-accuracy', label: 'Diagnostic accuracy study', category: 'Diagnostic', blurb: 'Index test compared with a reference standard.', guidelines: ['stard'], layouts: ['flow', 'schema'] },
  { id: 'systematic-review', label: 'Systematic review / meta-analysis', category: 'Evidence synthesis', blurb: 'Identification, screening and inclusion of studies.', guidelines: ['prisma'], layouts: ['flow'] },
  { id: 'consensus-delphi', label: 'Expert consensus (Delphi / nominal group)', category: 'Consensus', blurb: 'Expert panel, iterative survey rounds and a consensus meeting.', guidelines: ['accord'], layouts: ['schema', 'flow'] },
]

export const studyTypeInfo = (id: StudyTypeId) => STUDY_TYPES.find((s) => s.id === id) ?? STUDY_TYPES[0]

export const isInterventional = (id: StudyTypeId) => studyTypeInfo(id).category === 'Interventional'

export interface GuidelineInfo {
  id: GuidelineId
  name: string
  scope: string
  figure: string
  reference: string
}

export const GUIDELINES: GuidelineInfo[] = [
  { id: 'spirit', name: 'SPIRIT 2025', scope: 'Protocols of randomised trials', figure: 'Study schema (design, allocation, interventions, timing)', reference: 'Chan A-W, et al. SPIRIT 2025 statement: updated guideline for protocols of randomised trials. 2025.' },
  { id: 'consort', name: 'CONSORT 2025', scope: 'Reports of randomised trials', figure: 'Participant flow diagram (enrolment, allocation, follow-up, analysis)', reference: 'Hopewell S, et al. CONSORT 2025 statement: updated guideline for reporting randomised trials. 2025.' },
  { id: 'ich-m11', name: 'ICH M11 (CeSHarP)', scope: 'Structured clinical trial protocol template', figure: 'Trial schema (section 1.2)', reference: 'ICH M11 Clinical electronic Structured Harmonised Protocol (CeSHarP) template.' },
  { id: 'trend', name: 'TREND', scope: 'Non-randomised evaluations of interventions', figure: 'Participant flow diagram', reference: 'Des Jarlais DC, et al. The TREND statement. Am J Public Health 2004;94:361–6.' },
  { id: 'strobe', name: 'STROBE', scope: 'Observational studies (cohort, case-control, cross-sectional)', figure: 'Flow diagram with numbers at each stage (item 13c)', reference: 'von Elm E, et al. The STROBE statement. Lancet 2007;370:1453–7.' },
  { id: 'record', name: 'RECORD', scope: 'Studies using routinely collected health data', figure: 'Population selection incl. data quality, availability and linkage (item 13.1)', reference: 'Benchimol EI, et al. The RECORD statement. PLoS Med 2015;12:e1001885.' },
  { id: 'record-pe', name: 'RECORD-PE', scope: 'Pharmacoepidemiology studies using routinely collected data', figure: 'Design diagram of exposure, covariate and follow-up windows', reference: 'Langan SM, et al. The RECORD-PE statement. BMJ 2018;363:k3532.' },
  { id: 'harper', name: 'HARPER', scope: 'Protocols for real-world evidence studies', figure: 'Study design diagram and participant flow', reference: 'Wang SV, et al. HARmonized Protocol Template to Enhance Reproducibility (HARPER). Pharmacoepidemiol Drug Saf 2022.' },
  { id: 'design-diagram', name: 'Longitudinal design diagram', scope: 'Database studies anchored on an index date', figure: 'Index date with washout, exclusion, covariate, exposure and follow-up windows', reference: 'Schneeweiss S, et al. Graphical depiction of longitudinal study designs in health care databases. Ann Intern Med 2019;170:398–406.' },
  { id: 'stard', name: 'STARD 2015', scope: 'Diagnostic accuracy studies', figure: 'Flow of participants through index test and reference standard (item 19)', reference: 'Bossuyt PM, et al. STARD 2015. BMJ 2015;351:h5527.' },
  { id: 'accord', name: 'ACCORD', scope: 'Consensus methods (Delphi, nominal group, consensus meetings)', figure: 'Process of rounds and meetings, and participation (invited, responded) at each round', reference: 'Gattrell WT, et al. ACCORD (ACcurate COnsensus Reporting Document): a reporting guideline for consensus methods in biomedicine. PLoS Med 2024.' },
  { id: 'prisma', name: 'PRISMA 2020', scope: 'Systematic reviews', figure: 'Flow diagram of identification, screening and inclusion (item 16a)', reference: 'Page MJ, et al. The PRISMA 2020 statement. BMJ 2021;372:n71.' },
]

export const guidelineInfo = (id: GuidelineId) => GUIDELINES.find((g) => g.id === id)!

export const LAYOUTS: { id: LayoutKind; label: string; hint: string }[] = [
  { id: 'schema', label: 'Study design schema', hint: 'Population → allocation → arms → follow-up, with period bands and a timeline' },
  { id: 'flow', label: 'Participant flow', hint: 'CONSORT / STROBE / STARD / PRISMA style flow with exclusion boxes' },
  { id: 'lines', label: 'Treatment lines', hint: 'Lines of therapy or patient journey with transition events' },
  { id: 'windows', label: 'Time windows (RWE)', hint: 'Index date with washout, covariate, exposure and follow-up windows' },
  { id: 'timeline', label: 'Protocol timeline', hint: 'Cohort lanes on a true time axis with randomisation points, milestones and compressed intervals' },
]

export const layoutLabel = (k: LayoutKind) => LAYOUTS.find((l) => l.id === k)!.label

/* ------------------------------------------------------------------ */
/* Colour themes                                                       */
/* ------------------------------------------------------------------ */

export interface RoleColors {
  fill: string
  stroke: string
  text: string
}

export interface Theme {
  id: string
  name: string
  roles: Record<Role, RoleColors>
  bands: string[]
  edge: string
  axis: string
}

const r = (fill: string, stroke: string, text = '#0f172a'): RoleColors => ({ fill, stroke, text })

export const THEMES: Theme[] = [
  {
    id: 'clinical',
    name: 'Clinical blue',
    roles: {
      population: r('#e8f0fb', '#1f5fa8'),
      screening: r('#f1f5f9', '#64748b'),
      allocation: r('#1f5fa8', '#1f5fa8', '#ffffff'),
      experimental: r('#dbeafe', '#1d4ed8'),
      control: r('#fde7d9', '#c2410c'),
      treatment: r('#e0f2f1', '#0e8a7a'),
      followup: r('#ede9fe', '#6d28d9'),
      endpoint: r('#fef3c7', '#b45309'),
      exclusion: r('#ffffff', '#94a3b8', '#334155'),
      event: r('#fee2e2', '#b91c1c'),
      data: r('#e0f2fe', '#0369a1'),
      analysis: r('#dcfce7', '#15803d'),
      note: r('#fffbea', '#d4b106', '#422006'),
      neutral: r('#ffffff', '#475569'),
    },
    bands: ['#f1f5f9', '#eef4fc', '#f3f0fd', '#eefaf6', '#fdf6ec'],
    edge: '#334155',
    axis: '#334155',
  },
  {
    id: 'print',
    name: 'Print grayscale',
    roles: {
      population: r('#f3f4f6', '#111827'),
      screening: r('#ffffff', '#4b5563'),
      allocation: r('#111827', '#111827', '#ffffff'),
      experimental: r('#e5e7eb', '#111827'),
      control: r('#ffffff', '#111827'),
      treatment: r('#f3f4f6', '#374151'),
      followup: r('#ffffff', '#374151'),
      endpoint: r('#f9fafb', '#111827'),
      exclusion: r('#ffffff', '#6b7280', '#1f2937'),
      event: r('#e5e7eb', '#111827'),
      data: r('#f3f4f6', '#374151'),
      analysis: r('#ffffff', '#111827'),
      note: r('#ffffff', '#9ca3af', '#1f2937'),
      neutral: r('#ffffff', '#374151'),
    },
    bands: ['#f9fafb', '#f3f4f6'],
    edge: '#111827',
    axis: '#111827',
  },
  {
    id: 'pastel',
    name: 'Soft pastel',
    roles: {
      population: r('#eef2ff', '#6366f1'),
      screening: r('#f8fafc', '#94a3b8'),
      allocation: r('#6366f1', '#6366f1', '#ffffff'),
      experimental: r('#e0f2fe', '#0284c7'),
      control: r('#fce7f3', '#db2777'),
      treatment: r('#ecfdf5', '#10b981'),
      followup: r('#f5f3ff', '#8b5cf6'),
      endpoint: r('#fffbeb', '#f59e0b'),
      exclusion: r('#ffffff', '#cbd5e1', '#475569'),
      event: r('#fff1f2', '#f43f5e'),
      data: r('#f0f9ff', '#38bdf8'),
      analysis: r('#f0fdf4', '#22c55e'),
      note: r('#fefce8', '#eab308', '#422006'),
      neutral: r('#ffffff', '#94a3b8'),
    },
    bands: ['#f8fafc', '#f5f7ff', '#fbf7ff', '#f4fbf8'],
    edge: '#475569',
    axis: '#475569',
  },
  {
    id: 'bold',
    name: 'Bold corporate',
    roles: {
      population: r('#0b3d6e', '#0b3d6e', '#ffffff'),
      screening: r('#cbd5e1', '#475569'),
      allocation: r('#f59e0b', '#b45309', '#111827'),
      experimental: r('#0e7490', '#0e7490', '#ffffff'),
      control: r('#9a3412', '#9a3412', '#ffffff'),
      treatment: r('#0f766e', '#0f766e', '#ffffff'),
      followup: r('#4c1d95', '#4c1d95', '#ffffff'),
      endpoint: r('#fde68a', '#b45309'),
      exclusion: r('#ffffff', '#64748b', '#1e293b'),
      event: r('#b91c1c', '#b91c1c', '#ffffff'),
      data: r('#1e3a8a', '#1e3a8a', '#ffffff'),
      analysis: r('#166534', '#166534', '#ffffff'),
      note: r('#fef9c3', '#ca8a04', '#422006'),
      neutral: r('#ffffff', '#334155'),
    },
    bands: ['#eef2f7', '#e4ebf3'],
    edge: '#1e293b',
    axis: '#1e293b',
  },
  {
    id: 'outline',
    name: 'Outline only',
    roles: Object.fromEntries(
      (['population', 'screening', 'allocation', 'experimental', 'control', 'treatment', 'followup', 'endpoint', 'exclusion', 'event', 'data', 'analysis', 'note', 'neutral'] as Role[]).map((k) => [
        k,
        r('#ffffff', k === 'exclusion' || k === 'note' ? '#94a3b8' : '#1e293b', '#0f172a'),
      ]),
    ) as Record<Role, RoleColors>,
    bands: ['#ffffff'],
    edge: '#1e293b',
    axis: '#1e293b',
  },
]

export const themeById = (id: string) => THEMES.find((t) => t.id === id) ?? THEMES[0]

export const ROLES: { id: Role; label: string }[] = [
  { id: 'population', label: 'Population' },
  { id: 'screening', label: 'Screening / run-in' },
  { id: 'allocation', label: 'Randomisation / allocation' },
  { id: 'experimental', label: 'Experimental arm' },
  { id: 'control', label: 'Control / comparator' },
  { id: 'treatment', label: 'Treatment (generic)' },
  { id: 'followup', label: 'Follow-up' },
  { id: 'endpoint', label: 'Endpoint / outcome' },
  { id: 'exclusion', label: 'Exclusion' },
  { id: 'event', label: 'Event / transition' },
  { id: 'data', label: 'Data source' },
  { id: 'analysis', label: 'Analysis' },
  { id: 'note', label: 'Note' },
  { id: 'neutral', label: 'Neutral' },
]

export const SWATCHES = [
  '#ffffff', '#f1f5f9', '#e2e8f0', '#94a3b8', '#475569', '#0f172a',
  '#dbeafe', '#1d4ed8', '#e0f2f1', '#0e8a7a', '#dcfce7', '#15803d',
  '#fde7d9', '#c2410c', '#fef3c7', '#b45309', '#fee2e2', '#b91c1c',
  '#ede9fe', '#6d28d9', '#fce7f3', '#db2777', '#e0f2fe', '#0369a1',
]

export const PAGES: { id: Exclude<import('../types').PageId, 'auto'>; label: string; w: number; h: number }[] = [
  { id: 'a4', label: 'A4', w: 297, h: 210 },
  { id: 'letter', label: 'US Letter', w: 279.4, h: 215.9 },
  { id: 'slide16x9', label: 'Slide 16:9', w: 338.7, h: 190.5 },
  { id: 'slide4x3', label: 'Slide 4:3', w: 254, h: 190.5 },
]

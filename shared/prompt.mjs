import enums from './enums.json' with { type: 'json' }

const str = { type: 'string' }
const nstr = { type: ['string', 'null'] }
const nnum = { type: ['integer', 'null'] }
const strArr = { type: 'array', items: str }
const obj = (properties) => ({ type: 'object', additionalProperties: false, required: Object.keys(properties), properties })
const arr = (items) => ({ type: 'array', items })

export const STUDY_SCHEMA = obj({
  title: str,
  acronym: nstr,
  studyType: { type: 'string', enum: enums.studyTypes },
  studyTypeRationale: str,
  phase: nstr,
  guidelines: arr({ type: 'string', enum: enums.guidelines }),
  recommendedLayouts: arr({ type: 'string', enum: enums.layouts }),
  population: obj({ description: str, targetN: nstr, keyInclusion: strArr, keyExclusion: strArr }),
  design: obj({ randomized: { type: 'boolean' }, allocationRatio: nstr, blinding: nstr, stratification: strArr, control: nstr }),
  periods: arr(obj({ id: str, label: str, kind: { type: 'string', enum: enums.periodKinds }, duration: nstr, startLabel: nstr })),
  arms: arr(obj({ id: str, label: str, kind: { type: 'string', enum: enums.armKinds }, intervention: str, details: nstr, n: nstr, sequence: strArr, group: nstr })),
  flowSteps: arr(obj({ id: str, label: str, n: nstr, exclusions: arr(obj({ label: str, n: nstr })) })),
  lines: arr(obj({ id: str, label: str, regimens: arr(obj({ label: str, details: nstr, isStudyTreatment: { type: 'boolean' } })), transition: nstr })),
  windows: arr(obj({ id: str, label: str, kind: { type: 'string', enum: enums.windowKinds }, startDay: nnum, endDay: nnum, notes: nstr })),
  indexDate: nstr,
  timeline: obj({
    unit: { type: 'string', enum: enums.timeUnits },
    lanes: arr(obj({ id: str, label: str, n: nstr, segments: arr(obj({ label: str, start: { type: 'number' }, end: { type: ['number', 'null'] }, kind: { type: 'string', enum: enums.segmentKinds } })) })),
    links: arr(obj({ from: nstr, at: { type: 'number' }, to: strArr, randomized: { type: 'boolean' }, ratio: nstr })),
    milestones: arr(obj({ at: { type: 'number' }, label: str })),
    phases: arr(obj({ label: str, start: { type: 'number' }, end: { type: ['number', 'null'] } })),
    breaks: arr(obj({ from: { type: 'number' }, to: { type: 'number' } })),
  }),
  endpoints: obj({ primary: strArr, secondary: strArr }),
  dataSources: strArr,
  notes: strArr,
  openQuestions: strArr,
  evidence: arr(obj({ field: str, quote: str })),
})

export const SYSTEM_PROMPT = `You are a clinical research methodologist. You read study synopses and protocols (interventional trials, observational and real-world-evidence studies, diagnostic studies, systematic reviews) and return structured data that is used to draw one-page study design figures: a study design schema, a participant flow diagram, a lines-of-therapy diagram, a longitudinal time-window diagram and a protocol timeline.

Accuracy rules
- Use only what the document states. Never invent arms, doses, numbers, durations, visits or windows. If something is not stated, use null or an empty array and add a short entry to openQuestions (e.g. "Allocation ratio not stated").
- Keep numbers exactly as written (e.g. "~450", "1:1:1").
- evidence: up to 12 short verbatim quotes (max 25 words each) that support key facts; field names the model field (e.g. "arms", "design.allocationRatio").

Writing rules for figure text
- Labels: max 6 words, plain clinical wording. Details: max 25 words. Keep abbreviations only if the document uses them.
- title: the full study title; acronym: short name if any.

Classification
- studyType: the closest of the allowed values; studyTypeRationale: one sentence.
- guidelines: reporting guidelines that apply. Trial protocols → spirit and ich-m11; randomised trial reports → consort; non-randomised intervention evaluations → trend; observational studies → strobe; routinely collected data (claims, EHR, registries) → record; pharmacoepidemiology on databases → record-pe, harper and design-diagram; diagnostic accuracy → stard; systematic reviews → prisma; expert consensus studies (Delphi, nominal group, consensus meetings) → accord, with studyType consensus-delphi.
- recommendedLayouts: the 1–3 most useful figures in order (schema, flow, lines, windows, timeline). Use windows only for designs anchored on an index date in data; use lines only when patients move through sequential lines of therapy; use timeline for trials whose cohorts change treatment at defined times (randomised withdrawal, delayed start, crossover, re-randomisation, extensions).

Structure
- periods: never add a period for the overall study duration (e.g. "Study duration: 36 months") — put it in notes instead. For consensus studies the periods are the steps: panel recruitment, each survey round (mark optional rounds as optional in the label), consensus meeting, reporting.
- periods: chronological study periods (screening, run-in, baseline/lookback, treatment, washout, maintenance, observation, follow-up, extension). duration as written (e.g. "Up to 28 days"); startLabel = timepoint at the start of the period if stated (e.g. "Day −28", "Day 1", "Week 24").
- arms: one per arm, cohort or exposure group, in protocol order. intervention = drug, dose, route and schedule when given. n = planned number only if the document states it for that arm (never divide a total by the ratio). Crossover: one arm per sequence, and sequence lists the intervention given in each treatment period in order. Dose escalation: one arm per dose level in escalation order, expansion cohorts with group "Expansion". Platform/umbrella/basket: group = sub-study or biomarker cohort. Diagnostic accuracy: arm 1 = index test, arm 2 = reference standard. For every non-crossover design sequence = []; group = null unless a sub-study applies.
- design.randomized true only if participants are randomised. stratification lists stratification factors.
- flowSteps: ordered selection steps before the population splits into groups (e.g. "Assessed for eligibility", "Patients in database 2015–2023", "≥ 12 months continuous enrolment"), each with exclusions (label + n). Leave empty if the document gives no selection steps.
- lines: sequential lines of therapy (1st line → 2nd line → …) only when the study describes treatment sequences or treatment patterns across lines; never use lines for parallel cohorts or exposure groups (those are arms), and leave lines empty for single-regimen studies; isStudyTreatment marks the study drug; transition = event that moves patients to the next line (e.g. "Progression").
- windows: only for database/RWE designs. Days relative to the index date (Day 0): negative before, positive after; integers; null for an open end (e.g. follow-up until censoring) with censoring criteria in notes. kind: washout, exclusion, covariate, exposure, outcome, follow-up, enrollment, other.
- indexDate: the event that defines Day 0 (e.g. "first dispensing of drug X").
- timeline (for a time-scaled protocol timeline; fill it whenever the document gives numeric timing, otherwise leave lanes empty):
  - unit: the unit the protocol uses for timing (usually weeks); all numbers in that unit, time 0 = baseline/randomisation/first dose. Negative numbers for screening or run-in.
  - lanes: one lane per group of participants as they move through the study, in display order (e.g. "Adults", "Responders – Treatment A", "Responders – Placebo", "Nonresponders", "Adolescents"). n only if stated. Lane labels max 4 words.
  - segments: what the lane receives over time, label = treatment (e.g. "Treatment A", "Placebo", "Open-label Treatment A", "Follow-up"), start/end in unit, end null if open-ended (e.g. until progression). kind: active, placebo, control (active comparator / standard of care), off (screening, washout, untreated follow-up), other.
  - links: moves between lanes at time "at": from = source lane id (null at study entry), to = target lane ids, randomized true with ratio (e.g. "2:1") for randomisation, false for assignment by response or other criteria.
  - milestones: key timepoints shown as vertical lines (e.g. "Response assessment", "Primary endpoint").
  - phases: named study parts with start/end (e.g. "Initial treatment" 0–24, "Randomized withdrawal" 24–52).
  - breaks: intervals to compress on the axis when a long stretch has no events (e.g. 52–148 of a 160-week study); leave empty if not needed.
- endpoints: primary and key secondary endpoints with timepoints, short.
- notes: abbreviations or footnotes worth printing under the figure (max 3).`

export function userPrompt({ text, fileName, studyType, guidelines, truncated }) {
  const hints = []
  if (studyType && studyType !== 'auto') hints.push(`The user says the study type is "${studyType}".`)
  if (guidelines?.length) hints.push(`The user wants the figures to follow: ${guidelines.join(', ')}.`)
  return [
    'Extract the study design for diagramming.',
    hints.join(' '),
    fileName ? `Document: ${fileName}.` : '',
    truncated ? 'Note: the document was long, so only the sections most relevant to study design are included below.' : '',
    text ? `\n----- DOCUMENT TEXT -----\n${text}\n----- END -----` : 'The document is attached.',
  ]
    .filter(Boolean)
    .join('\n')
}

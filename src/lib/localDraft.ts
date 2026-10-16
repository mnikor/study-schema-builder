/** Offline draft from keyword rules — a starting point when no AI key is configured. */
import type { StudyArm, StudyModel, StudyPeriod, StudyTypeId } from '../types'
import { isInterventional } from './catalog'
import { blankModel } from './templates'

const TYPE_RULES: [RegExp, StudyTypeId][] = [
  [/systematic review|meta-analys/i, 'systematic-review'],
  [/delphi|consensus (study|meeting|panel)|nominal group/i, 'consensus-delphi'],
  [/diagnostic accuracy|sensitivity and specificity|index test/i, 'diagnostic-accuracy'],
  [/target trial/i, 'target-trial-emulation'],
  [/external control|synthetic control|external comparator/i, 'external-control'],
  [/lines? of therapy|treatment patterns?|treatment sequenc/i, 'treatment-patterns'],
  [/case[- ]control/i, 'case-control'],
  [/cross[- ]sectional|survey/i, 'cross-sectional'],
  [/cross[- ]?over/i, 'rct-crossover'],
  [/factorial/i, 'rct-factorial'],
  [/dose[- ]escalation|first[- ]in[- ]human|\b3\s*\+\s*3\b|maximum tolerated dose/i, 'dose-escalation'],
  [/platform trial|umbrella|basket trial|master protocol/i, 'platform'],
  [/registry/i, 'registry'],
  [/retrospective|claims data|administrative claims|electronic health record|\bEHR\b|healthcare database/i, 'cohort-retrospective'],
  [/prospective cohort|non[- ]interventional|observational/i, 'cohort-prospective'],
  [/single[- ]arm/i, 'single-arm'],
  [/randomi[sz]ed/i, 'rct-parallel'],
]

const firstMatch = (text: string, re: RegExp, group = 1) => text.match(re)?.[group]?.trim() ?? null

export function localDraft(text: string, hint?: StudyTypeId | 'auto'): StudyModel {
  const t = text.replace(/\r/g, '')
  const studyType = hint && hint !== 'auto' ? hint : (TYPE_RULES.find(([re]) => re.test(t))?.[1] ?? 'rct-parallel')
  const m = blankModel(studyType)
  m.title =
    firstMatch(t, /^\s*(?:full |official |protocol |study )?title\s*[:\-–]\s*(.{10,300})$/im) ??
    t.split('\n').map((l) => l.trim()).find((l) => l.length > 15 && l.length < 220) ??
    'Untitled study'
  m.acronym = firstMatch(t, /acronym\s*[:\-–]\s*([A-Z0-9][\w\-]{1,20})/i) ?? firstMatch(m.title, /\(([A-Z][A-Z0-9\-]{2,15})\)/)
  m.phase = firstMatch(t, /\b(phase\s*(?:I{1,3}V?|[1-4])(?:\s*\/\s*(?:I{1,3}|[1-4]))?[ab]?)\b/i)
  m.design.randomized = /randomi[sz]ed|randomi[sz]ation/i.test(t) && !/non[- ]randomi/i.test(t)
  m.design.allocationRatio = firstMatch(t, /(\d+\s*:\s*\d+(?:\s*:\s*\d+)*)\s*(?:ratio|randomi|allocation)/i) ?? firstMatch(t, /randomi[sz]ed\s*(?:in\s*a\s*)?(\d+\s*:\s*\d+(?:\s*:\s*\d+)*)/i)
  m.design.blinding = firstMatch(t, /\b((?:double|single|triple|quadruple)[- ]blind(?:ed)?|open[- ]label)\b/i, 1)
  const strat = firstMatch(t, /stratifi(?:ed|cation)\s*(?:factors?)?\s*(?:by|:)\s*([^\n.]{4,160})/i)
  if (strat) m.design.stratification = strat.split(/,|;|\band\b/).map((x) => x.trim()).filter(Boolean).slice(0, 5)
  m.population.targetN = firstMatch(t, /(?:approximately|about|~|total of|up to|planned)?\s*(\d[\d,]{0,7})\s*(?:patients|participants|subjects|individuals)/i)
  m.population.description =
    firstMatch(t, /(?:study population|population|patients?|participants?)\s*[:\-–]\s*([^\n]{10,220})/i) ?? ''

  const arms: StudyArm[] = []
  for (const mm of t.matchAll(/^\s*(?:arm|group|cohort|treatment group)\s*([A-Z0-9]{1,3})\s*[:\-–)]\s*(.{3,200})$/gim)) {
    const body = mm[2].trim()
    const isCtrl = /placebo|control|standard of care|comparator|usual care/i.test(body)
    arms.push({ id: `a${arms.length + 1}`, label: `Arm ${mm[1]}`, kind: isCtrl ? (/placebo/i.test(body) ? 'placebo' : 'active-control') : 'experimental', intervention: body, details: null, n: null, sequence: [], group: null })
  }
  m.arms = arms.slice(0, 8)

  const periods: StudyPeriod[] = []
  const dur = (re: RegExp) => firstMatch(t, re)
  const scr = dur(/screening\s*(?:period|phase)?\s*(?:of|:)?\s*(?:up to\s*)?(\d+\s*(?:days?|weeks?))/i)
  const run = dur(/run-?in\s*(?:period)?\s*(?:of|:)?\s*(\d+\s*(?:days?|weeks?))/i)
  const trt = dur(/treatment\s*(?:period|duration|phase)\s*(?:of|:|will last)?\s*(?:up to\s*)?(\d+\s*(?:days?|weeks?|months?|years?))/i)
  const fu = dur(/follow[- ]?up\s*(?:period|phase)?\s*(?:of|:|for)?\s*(?:up to\s*)?(\d+\s*(?:days?|weeks?|months?|years?))/i)
  const lb = dur(/(?:baseline|look-?back|washout)\s*(?:period|window)?\s*(?:of|:)?\s*(\d+\s*(?:days?|months?|years?))/i)
  const obs = !isInterventional(studyType)
  if (obs && lb) periods.push({ id: 'lb', label: 'Baseline', kind: 'lookback', duration: lb, startLabel: null })
  if (!obs && (scr || /screening/i.test(t))) periods.push({ id: 'scr', label: 'Screening', kind: 'screening', duration: scr ? `Up to ${scr}` : null, startLabel: null })
  if (run) periods.push({ id: 'run', label: 'Run-in', kind: 'run-in', duration: run, startLabel: null })
  if (!obs) periods.push({ id: 'trt', label: 'Treatment', kind: 'treatment', duration: trt, startLabel: null })
  if (fu || /follow[- ]?up/i.test(t)) periods.push({ id: 'fu', label: 'Follow-up', kind: 'follow-up', duration: fu, startLabel: null })
  m.periods = periods

  const prim = firstMatch(t, /primary (?:efficacy )?(?:end ?point|outcome)s?\s*(?:is|are|was|will be|:)?\s*(?:the\s*)?([^\n.]{5,180})/i)
  if (prim) m.endpoints.primary = [prim]
  if (obs) {
    const src = firstMatch(t, /((?:[A-Z][\w-]*\s){0,4}(?:claims|electronic health records?|EHR|registry|database)[^.\n]{0,60})/)
    if (src) m.dataSources = [src]
    m.indexDate = firstMatch(t, /index date\s*(?:is|was|will be|defined as|:)?\s*(?:the\s*)?([^\n.]{5,120})/i)
  }
  m.openQuestions = ['Drafted offline from keyword rules — check every field before using the figures.']
  return m
}

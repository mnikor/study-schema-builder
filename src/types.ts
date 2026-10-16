import type { Edge, Node } from '@xyflow/react'
import enums from '../shared/enums.json'

export type StudyTypeId = (typeof enums.studyTypes)[number]
export type GuidelineId = (typeof enums.guidelines)[number]
export type LayoutKind = 'schema' | 'flow' | 'lines' | 'windows' | 'timeline'
export type PeriodKind = (typeof enums.periodKinds)[number]
export type ArmKind = (typeof enums.armKinds)[number]
export type WindowKind = (typeof enums.windowKinds)[number]
export type Direction = 'LR' | 'TB'

/* ------------------------------------------------------------------ */
/* Study model: what the AI (or the user, via the form) knows about    */
/* the study. Diagrams are generated from it.                          */
/* ------------------------------------------------------------------ */

export interface StudyPeriod {
  id: string
  label: string
  kind: PeriodKind
  duration: string | null
  startLabel: string | null
}

export interface StudyArm {
  id: string
  label: string
  kind: ArmKind
  intervention: string
  details: string | null
  n: string | null
  sequence: string[]
  group: string | null
}

export interface FlowExclusion {
  label: string
  n: string | null
}

export interface FlowStep {
  id: string
  label: string
  n: string | null
  exclusions: FlowExclusion[]
}

export interface TherapyRegimen {
  label: string
  details: string | null
  isStudyTreatment: boolean
}

export interface TherapyLine {
  id: string
  label: string
  regimens: TherapyRegimen[]
  transition: string | null
}

export interface TimeWindow {
  id: string
  label: string
  kind: WindowKind
  startDay: number | null
  endDay: number | null
  notes: string | null
}

export type SegmentKind = 'active' | 'placebo' | 'control' | 'off' | 'other'
export type TimeUnit = 'days' | 'weeks' | 'months' | 'years'

export interface TimelineSegment {
  label: string
  start: number
  end: number | null
  kind: SegmentKind
}

export interface TimelineLane {
  id: string
  label: string
  n: string | null
  segments: TimelineSegment[]
}

/** Movement between lanes at time `at`: randomisation (R) or assignment (e.g. responders). */
export interface TimelineLink {
  from: string | null
  at: number
  to: string[]
  randomized: boolean
  ratio: string | null
}

export interface StudyTimeline {
  unit: TimeUnit
  lanes: TimelineLane[]
  links: TimelineLink[]
  milestones: { at: number; label: string }[]
  phases: { label: string; start: number; end: number | null }[]
  breaks: { from: number; to: number }[]
}

export interface StudyModel {
  title: string
  acronym: string | null
  studyType: StudyTypeId
  studyTypeRationale: string
  phase: string | null
  guidelines: GuidelineId[]
  recommendedLayouts: LayoutKind[]
  population: {
    description: string
    targetN: string | null
    keyInclusion: string[]
    keyExclusion: string[]
  }
  design: {
    randomized: boolean
    allocationRatio: string | null
    blinding: string | null
    stratification: string[]
    control: string | null
  }
  periods: StudyPeriod[]
  arms: StudyArm[]
  flowSteps: FlowStep[]
  lines: TherapyLine[]
  windows: TimeWindow[]
  indexDate: string | null
  timeline: StudyTimeline
  endpoints: { primary: string[]; secondary: string[] }
  dataSources: string[]
  notes: string[]
  openQuestions: string[]
  evidence: { field: string; quote: string }[]
}

/* ------------------------------------------------------------------ */
/* Diagram (one page)                                                  */
/* ------------------------------------------------------------------ */

export type ShapeKind =
  | 'rect'
  | 'rounded'
  | 'pill'
  | 'diamond'
  | 'circle'
  | 'hexagon'
  | 'parallelogram'
  | 'document'
  | 'cylinder'
  | 'note'

export type Role =
  | 'population'
  | 'screening'
  | 'allocation'
  | 'experimental'
  | 'control'
  | 'treatment'
  | 'followup'
  | 'endpoint'
  | 'exclusion'
  | 'event'
  | 'data'
  | 'analysis'
  | 'note'
  | 'neutral'

export interface NodeStyle {
  fill?: string
  stroke?: string
  text?: string
  strokeWidth?: number
  dashed?: boolean
  fontSize?: number
  align?: 'left' | 'center'
}

export interface SchemaNodeData extends Record<string, unknown> {
  label: string
  detail?: string
  shape: ShapeKind
  role: Role
  style?: NodeStyle
  phase?: string
  /** Side box (exclusions, notes) placed beside the main flow. */
  side?: boolean
  /** Size set by the user; auto-sizing leaves it alone. */
  fixedSize?: boolean
  /** Model order hint for layout (lanes). */
  order?: number
  /** Row (LR) / column (TB) when a long diagram is wrapped. */
  row?: number
  // time-window rows
  startDay?: number | null
  endDay?: number | null
  bar?: { from: number; to: number; openStart: boolean; openEnd: boolean; labelSize: number }
  // protocol timeline: lane index, start/end (or marker time) in timeline units
  lane?: number
  t0?: number
  t1?: number | null
  /** Space kept before a bar label (for an R marker / ratio at the lane start). */
  labelOffset?: number
  /** Compressed intervals inside a bar, in local px. */
  cuts?: { a: number; b: number }[]
  /** Text node role in a timeline: lane label or randomisation ratio. */
  tlRole?: 'lane' | 'ratio'
  /** Milestone label raised by this many px (staggered labels). */
  labelLift?: number
}

export type NodeType = 'shape' | 'window' | 'marker' | 'text' | 'segment'
export type SNode = Node<SchemaNodeData, NodeType>

export interface SchemaEdgeData extends Record<string, unknown> {
  label?: string
  path?: 'step' | 'straight' | 'bezier'
  dashed?: boolean
  color?: string
  width?: number
  arrowEnd?: boolean
  arrowStart?: boolean
  /** Offset of the step path's middle segment, set by dragging. */
  offset?: { x: number; y: number }
  /** Handles were chosen by the user (keep them on re-layout). */
  manualHandles?: boolean
  /** Connector between wrapped rows: runs along this lane (y for LR, x for TB). */
  wrap?: { lane: number }
  /** Protocol timeline move: down from the source, then across into the target. */
  lshape?: boolean
}
export type SEdge = Edge<SchemaEdgeData, 'schema'>

export interface Phase {
  id: string
  label: string
  /** Timeline pages: phase span in timeline units (drawn as a bracket). */
  start?: number
  end?: number | null
  duration?: string
  startLabel?: string
  color?: string
}

export type BandStyle = 'tinted' | 'outline' | 'label' | 'none'
export type PageId = 'auto' | 'a4' | 'letter' | 'slide16x9' | 'slide4x3'
export type PageOrientation = 'portrait' | 'landscape'

export interface DiagramSettings {
  title: string
  showTitle: boolean
  footnote: string
  showFootnote: boolean
  bandStyle: BandStyle
  showAxis: boolean
  axisEndLabel: string
  fontSize: number
  nodeWidth: number
  rankGap: number
  nodeGap: number
  page: PageId
  /** 0 = choose automatically; otherwise 1–3 rows (LR) / columns (TB). */
  rows?: number
  orientation?: 'auto' | PageOrientation
  /** User picked the flow direction explicitly; don't adapt it to the page. */
  lockDirection?: boolean
}

export interface Diagram {
  id: string
  name: string
  layout: LayoutKind
  direction: Direction
  nodes: SNode[]
  edges: SEdge[]
  phases: Phase[]
  settings: DiagramSettings
  /** True once the user changed the generated diagram by hand. */
  edited?: boolean
  /** Protocol timeline: unit, explicit breaks and the scale computed by the layout. */
  timeline?: TimelineMeta
  /** What the last layout resolved (auto rows / page orientation). */
  layoutInfo?: { rows: number; orientation: PageOrientation; bodyPt: number; adapted?: boolean }
}

export interface Project {
  version: 1
  id: string
  title: string
  model: StudyModel
  guidelines: GuidelineId[]
  themeId: string
  diagrams: Diagram[]
  activeId: string
  source?: { method: 'ai' | 'local' | 'template' | 'manual'; fileName?: string; at: string; model?: string }
}

export interface TimelineMeta {
  unit: TimeUnit
  /** User/AI-defined compressed intervals; when empty a long tail is compressed automatically. */
  breaks: { from: number; to: number }[]
  scale?: {
    tMin: number
    tMax: number
    k: number
    x0: number
    breakW: number
    breaks: { from: number; to: number }[]
    lanesTop: number
    lanesBottom: number
    laneYs: number[]
    laneH: number
    labelW: number
    bracketY: number
    hasMilestones: boolean
  }
}

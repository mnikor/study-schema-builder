import { create } from 'zustand'
import type { Diagram, Direction, LayoutKind, Project, StudyModel } from './types'
import { LAYOUTS, themeById } from './lib/catalog'
import { generateDiagram, guidelinesFor, recommendedLayouts, uid } from './lib/generate'
import { fitToPage, layoutDiagram, resizeNodes } from './lib/layout'
import { TEMPLATES } from './lib/templates'
import { sanitizeModel, type Health } from './lib/ai'

const STORAGE_KEY = 'study-schema-builder.project.v1'
const HISTORY = 80

export type LeftTab = 'study' | 'checks'

interface UI {
  leftTab: LeftTab
  showLeft: boolean
  showRight: boolean
  exportOpen: boolean
  templatesOpen: boolean
  busy: string | null
  toast: { text: string; kind: 'info' | 'error' | 'ok' } | null
}

interface State {
  project: Project
  past: Project[]
  future: Project[]
  lastCommit: { key: string; t: number }
  selectedBand: string | null
  editingNode: string | null
  fitNonce: number
  ui: UI
  health: Health

  setUI: (p: Partial<UI>) => void
  toast: (text: string, kind?: 'info' | 'error' | 'ok') => void
  commit: (key?: string) => void
  update: (fn: (p: Project) => Project, commitKey?: string | false) => void
  updateDiagram: (fn: (d: Diagram) => Diagram, commitKey?: string | false, id?: string) => void
  undo: () => void
  redo: () => void

  setActive: (id: string) => void
  /** history: false when the change that triggered it already created the undo step (spec R-STATE-1). */
  relayout: (id?: string, opts?: { history?: boolean }) => Promise<void>
  relayoutAll: () => Promise<void>
  resize: (id?: string) => void
  setDirection: (dir: Direction) => Promise<void>
  fitPage: () => Promise<void>
  loadModel: (model: StudyModel, source: Project['source']) => Promise<void>
  addPage: (layout: LayoutKind) => Promise<void>
  regeneratePage: (id?: string, layout?: LayoutKind) => Promise<void>
  rebuildAll: () => Promise<void>
  removePage: (id: string) => void
  setProject: (p: Project) => Promise<void>
  setHealth: (h: Health) => void
}

export function projectFromModel(model: StudyModel, source?: Project['source']): Project {
  const diagrams = recommendedLayouts(model).map((k) => generateDiagram(model, k))
  return {
    version: 1,
    id: uid('p'),
    title: model.acronym || model.title,
    model,
    guidelines: guidelinesFor(model),
    themeId: 'clinical',
    diagrams,
    activeId: diagrams[0]?.id ?? '',
    source,
  }
}

function loadInitial(): Project {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const p = JSON.parse(raw) as Project
      if (p?.version === 1 && Array.isArray(p.diagrams)) return withoutRemovedPages({ ...p, model: sanitizeModel(p.model) })
    }
  } catch {
    /* storage unavailable */
  }
  return projectFromModel(TEMPLATES[0].model, { method: 'template', at: new Date().toISOString() })
}

/** Pages of layouts that no longer exist (e.g. the removed schedule of assessments) are dropped. */
function withoutRemovedPages(p: Project): Project {
  const known = new Set(LAYOUTS.map((l) => l.id as string))
  const diagrams = p.diagrams.filter((d) => known.has(d.layout))
  if (!diagrams.length) return projectFromModel(p.model, p.source)
  return { ...p, diagrams, activeId: diagrams.some((d) => d.id === p.activeId) ? p.activeId : diagrams[0].id }
}

/** Page-level choices a rebuild keeps (spec: docs/layout-behaviour-spec.md, R-REBUILD). */
function keepPageChoices(old: Diagram): Partial<Diagram['settings']> {
  const s = old.settings
  return { fontSize: s.fontSize, page: s.page, rows: s.rows, orientation: s.orientation, lockDirection: s.lockDirection }
}

export const needsLayout = (d: Diagram) => d.nodes.length > 0 && d.nodes.every((n) => n.position.x === 0 && n.position.y === 0 && !n.width)

export const useStore = create<State>((set, get) => ({
  project: loadInitial(),
  past: [],
  future: [],
  lastCommit: { key: '', t: 0 },
  selectedBand: null,
  editingNode: null,
  fitNonce: 0,
  ui: { leftTab: 'study', showLeft: true, showRight: true, exportOpen: false, templatesOpen: false, busy: null, toast: null },
  health: { ai: false, model: '', keySource: null },

  setUI: (p) => set((s) => ({ ui: { ...s.ui, ...p } })),
  toast: (text, kind = 'info') => {
    set((s) => ({ ui: { ...s.ui, toast: { text, kind } } }))
    setTimeout(() => {
      if (get().ui.toast?.text === text) set((s) => ({ ui: { ...s.ui, toast: null } }))
    }, kind === 'error' ? 7000 : 3200)
  },
  setHealth: (h) => set({ health: h }),

  commit: (key = '') => {
    const { lastCommit, project, past } = get()
    const now = Date.now()
    if (key && key === lastCommit.key && now - lastCommit.t < 1200) {
      set({ lastCommit: { key, t: now } })
      return
    }
    set({ past: [...past.slice(-HISTORY + 1), project], future: [], lastCommit: { key, t: now } })
  },

  update: (fn, commitKey = '') => {
    if (commitKey !== false) get().commit(commitKey)
    set((s) => ({ project: fn(s.project) }))
  },

  updateDiagram: (fn, commitKey = '', id) => {
    const target = id ?? get().project.activeId
    get().update((p) => ({ ...p, diagrams: p.diagrams.map((d) => (d.id === target ? fn(d) : d)) }), commitKey)
  },

  undo: () => {
    const { past, project, future } = get()
    if (!past.length) return
    set({ project: past[past.length - 1], past: past.slice(0, -1), future: [project, ...future].slice(0, HISTORY), lastCommit: { key: '', t: 0 } })
  },
  redo: () => {
    const { past, project, future } = get()
    if (!future.length) return
    set({ project: future[0], future: future.slice(1), past: [...past, project], lastCommit: { key: '', t: 0 } })
  },

  setActive: (id) => set((s) => ({ project: { ...s.project, activeId: id }, selectedBand: null, editingNode: null, fitNonce: s.fitNonce + 1 })),

  relayout: async (id, opts) => {
    const p = get().project
    const d = p.diagrams.find((x) => x.id === (id ?? p.activeId))
    if (!d) return
    const next = await layoutDiagram(d, themeById(p.themeId))
    get().updateDiagram(() => next, opts?.history === false ? false : 'layout', d.id)
    set((s) => ({ fitNonce: s.fitNonce + 1 }))
  },

  relayoutAll: async () => {
    const p = get().project
    const theme = themeById(p.themeId)
    const laid = await Promise.all(p.diagrams.map((d) => layoutDiagram(d, theme)))
    set((s) => ({ project: { ...s.project, diagrams: s.project.diagrams.map((d) => laid.find((x) => x.id === d.id) ?? d) }, fitNonce: s.fitNonce + 1 }))
  },

  resize: (id) => {
    const p = get().project
    get().updateDiagram((d) => resizeNodes(d, themeById(p.themeId)), false, id)
  },

  setDirection: async (dir) => {
    const p = get().project
    const d = p.diagrams.find((x) => x.id === p.activeId)
    if (!d) return
    if (d.layout === 'timeline' && dir === 'TB') {
      get().toast('Protocol timelines run left to right; use Page → Portrait to fit a portrait page.', 'info')
      return
    }
    if (d.direction === dir) {
      get().updateDiagram((dd) => ({ ...dd, settings: { ...dd.settings, lockDirection: true } }), 'direction')
      return
    }
    const reset: Diagram = {
      ...d,
      direction: dir,
      settings: { ...d.settings, lockDirection: true },
      nodes: d.nodes.map((n) => (n.type === 'shape' && n.data.fixedSize ? { ...n, data: { ...n.data, fixedSize: false } } : n)),
      edges: d.edges.map((e) => ({ ...e, data: { ...e.data, manualHandles: false, offset: undefined } })),
    }
    const next = await layoutDiagram(reset, themeById(p.themeId))
    get().updateDiagram(() => next, 'direction')
    set((s) => ({ fitNonce: s.fitNonce + 1 }))
  },

  fitPage: async () => {
    const p = get().project
    const d = p.diagrams.find((x) => x.id === p.activeId)
    if (!d) return
    get().setUI({ busy: 'Finding the best fit for the page…' })
    try {
      const next = await fitToPage(d, themeById(p.themeId))
      get().updateDiagram(() => next, 'fit')
      set((s) => ({ fitNonce: s.fitNonce + 1 }))
    } finally {
      get().setUI({ busy: null })
    }
  },

  loadModel: async (model, source) => {
    const prev = get().project
    const next = projectFromModel(model, source)
    next.themeId = prev.themeId
    get().commit('load')
    const theme = themeById(next.themeId)
    next.diagrams = await Promise.all(next.diagrams.map((d) => layoutDiagram(d, theme)))
    set((s) => ({ project: next, selectedBand: null, editingNode: null, fitNonce: s.fitNonce + 1 }))
  },

  setProject: async (p0) => {
    const p = withoutRemovedPages(p0)
    get().commit('open')
    const theme = themeById(p.themeId)
    const diagrams = await Promise.all(p.diagrams.map((d) => (needsLayout(d) ? layoutDiagram(d, theme) : Promise.resolve(d))))
    set((s) => ({ project: { ...p, diagrams }, selectedBand: null, editingNode: null, fitNonce: s.fitNonce + 1 }))
  },

  addPage: async (layout) => {
    const p = get().project
    const d = await layoutDiagram(generateDiagram(p.model, layout), themeById(p.themeId))
    get().update((pp) => ({ ...pp, diagrams: [...pp.diagrams, d], activeId: d.id }), 'add-page')
    set((s) => ({ fitNonce: s.fitNonce + 1 }))
  },

  regeneratePage: async (id, layout) => {
    const p = get().project
    const old = p.diagrams.find((x) => x.id === (id ?? p.activeId))
    if (!old) return
    const fresh = generateDiagram(p.model, layout ?? old.layout, old.direction)
    const keep: Diagram = {
      ...fresh,
      id: old.id,
      settings: layout && layout !== old.layout ? { ...fresh.settings, ...keepPageChoices(old) } : { ...fresh.settings, ...keepPageChoices(old), bandStyle: old.settings.bandStyle, showTitle: old.settings.showTitle },
    }
    const d = await layoutDiagram(keep, themeById(p.themeId))
    get().updateDiagram(() => d, 'regen', old.id)
    set((s) => ({ fitNonce: s.fitNonce + 1 }))
  },

  rebuildAll: async () => {
    const p = get().project
    const theme = themeById(p.themeId)
    const diagrams = await Promise.all(
      p.diagrams.map(async (old) => {
        const fresh = generateDiagram(p.model, old.layout, old.direction)
        return layoutDiagram({ ...fresh, id: old.id, settings: { ...fresh.settings, ...keepPageChoices(old) } }, theme)
      }),
    )
    get().update((pp) => ({ ...pp, diagrams }), 'rebuild')
    set((s) => ({ fitNonce: s.fitNonce + 1 }))
  },

  removePage: (id) => {
    get().update((p) => {
      const diagrams = p.diagrams.filter((d) => d.id !== id)
      return { ...p, diagrams, activeId: p.activeId === id ? (diagrams[0]?.id ?? '') : p.activeId }
    }, 'remove-page')
  },
}))

export const useActive = () => useStore((s) => s.project.diagrams.find((d) => d.id === s.project.activeId) ?? s.project.diagrams[0])
export const useTheme = () => useStore((s) => themeById(s.project.themeId))

// autosave (per-browser convenience; use Save to keep a project file)
let saveTimer: ReturnType<typeof setTimeout> | undefined
useStore.subscribe((s, prev) => {
  if (s.project === prev.project) return
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(s.project))
    } catch {
      /* quota or private mode */
    }
  }, 600)
})

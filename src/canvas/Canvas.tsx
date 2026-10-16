import {
  Background,
  ConnectionLineType,
  ConnectionMode,
  Controls,
  MarkerType,
  MiniMap,
  Panel,
  ReactFlow,
  SelectionMode,
  applyEdgeChanges,
  applyNodeChanges,
  useReactFlow,
  useUpdateNodeInternals,
  type Connection,
  type EdgeChange,
  type Node,
  type NodeChange,
} from '@xyflow/react'
import { useCallback, useEffect, useMemo } from 'react'
import type { Role, SEdge, SNode, ShapeKind } from '../types'
import { computeDecor } from '../lib/decor'
import { uid } from '../lib/generate'
import { useActive, useStore, useTheme } from '../store'
import { SHAPE_PRESETS, addNode } from './actions'
import { nodeTypes, type DecorData } from './nodes'
import { edgeTypes } from './SchemaEdge'
import { shapeOutline } from '../lib/shapes'

const DND = 'application/x-schema-shape'
/** keep fitted content clear of the floating palette (left) and minimap (bottom right) */
const FIT = { padding: { left: '70px', right: '40px', top: '30px', bottom: '40px' } } as const

function Palette() {
  const { screenToFlowPosition } = useReactFlow()
  const addAtCenter = (shape: ShapeKind, role: Role, label: string) => {
    const el = document.querySelector('.react-flow') as HTMLElement | null
    const r = el?.getBoundingClientRect()
    const c = r ? screenToFlowPosition({ x: r.left + r.width / 2, y: r.top + r.height / 2 }) : { x: 0, y: 0 }
    addNode(shape, role, label, c)
  }
  return (
    <Panel position="top-left" className="palette">
      {SHAPE_PRESETS.map((p) => {
        const o = shapeOutline(p.shape, 26, p.shape === 'circle' ? 18 : 18)
        return (
          <button
            key={p.shape}
            className="palette-item"
            title={`${p.title} — click or drag onto the canvas`}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData(DND, JSON.stringify(p))
              e.dataTransfer.effectAllowed = 'move'
            }}
            onClick={() => addAtCenter(p.shape, p.role, p.label)}
          >
            <svg width="30" height="22" viewBox="-2 -2 30 22">
              <path d={p.shape === 'circle' ? shapeOutline('circle', 18, 18).d : o.d} transform={p.shape === 'circle' ? 'translate(4 0)' : undefined} fill="#fff" stroke="#334155" strokeWidth="1.4" />
            </svg>
          </button>
        )
      })}
    </Panel>
  )
}

export function Canvas() {
  const d = useActive()
  const theme = useTheme()
  const selectedBand = useStore((s) => s.selectedBand)
  const fitNonce = useStore((s) => s.fitNonce)
  const updateDiagram = useStore((s) => s.updateDiagram)
  const { fitView, screenToFlowPosition } = useReactFlow()
  const updateNodeInternals = useUpdateNodeInternals()

  useEffect(() => {
    const ids = useStore.getState().project.diagrams.find((x) => x.id === useStore.getState().project.activeId)?.nodes.map((n) => n.id) ?? []
    const t = setTimeout(() => {
      updateNodeInternals(ids)
      fitView({ ...FIT, duration: 250 })
    }, 30)
    return () => clearTimeout(t)
  }, [fitNonce, fitView, updateNodeInternals])

  const decor = useMemo(() => computeDecor(d, theme), [d, theme])

  const derived = useMemo(() => {
    const out: Node<DecorData>[] = decor.bands.map((b) => ({
      id: `band:${b.phaseId}:${b.row}`,
      type: 'band',
      position: { x: b.box.x, y: b.box.y },
      width: b.box.w,
      height: b.box.h,
      data: { prims: b.prims, box: b.box, phaseId: b.phaseId },
      draggable: false,
      connectable: false,
      deletable: false,
      selected: selectedBand === b.phaseId,
      zIndex: -1,
    }))
    const extra: [string, { box: { x: number; y: number; w: number; h: number }; prims: DecorData['prims'] } | null][] = [
      ['axis', decor.axisBox && decor.axis.length ? { box: { ...decor.axisBox, x: decor.axisBox.x - 40, w: decor.axisBox.w + 80, h: decor.axisBox.h + 10 }, prims: decor.axis } : null],
      ['title', decor.title],
      ['footnote', decor.footnote],
    ]
    for (const [k, v] of extra) {
      if (!v) continue
      out.push({ id: `decor:${k}`, type: 'decor', position: { x: v.box.x, y: v.box.y }, width: v.box.w, height: v.box.h, data: { prims: v.prims, box: v.box }, draggable: false, selectable: false, connectable: false, deletable: false, focusable: false, zIndex: -1 })
    }
    return out
  }, [decor, selectedBand])

  const nodes = useMemo(() => [...derived, ...(d.nodes as Node[])], [derived, d.nodes])
  const edges = useMemo(
    () =>
      d.edges.map((e) => {
        const color = e.data?.color ?? theme.edge
        return {
          ...e,
          markerEnd: e.data?.arrowEnd !== false ? { type: MarkerType.ArrowClosed, color, width: 18, height: 18 } : undefined,
          markerStart: e.data?.arrowStart ? { type: MarkerType.ArrowClosed, color, width: 18, height: 18 } : undefined,
        }
      }),
    [d.edges, theme],
  )

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      const own: NodeChange<SNode>[] = []
      for (const c of changes) {
        const id = 'id' in c ? c.id : ''
        if (id.startsWith('band:')) {
          if (c.type === 'select') {
            const phaseId = id.split(':')[1]
            if (c.selected) useStore.setState({ selectedBand: phaseId })
            else if (useStore.getState().selectedBand === phaseId) useStore.setState({ selectedBand: null })
          }
          continue
        }
        if (id.startsWith('decor:')) continue
        own.push(c as NodeChange<SNode>)
      }
      if (!own.length) return
      const structural = own.some((c) => c.type === 'remove' || c.type === 'add')
      const moved = own.some((c) => c.type === 'position' || (c.type === 'dimensions' && c.resizing))
      if (structural) useStore.getState().commit(`nodes:${Date.now()}`)
      updateDiagram((dd) => ({ ...dd, edited: dd.edited || structural || moved, nodes: applyNodeChanges(own, dd.nodes) }), false)
    },
    [updateDiagram],
  )

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      const structural = changes.some((c) => c.type === 'remove' || c.type === 'add')
      if (structural) useStore.getState().commit(`edges:${Date.now()}`)
      updateDiagram((dd) => ({ ...dd, edited: dd.edited || structural, edges: applyEdgeChanges(changes as EdgeChange<SEdge>[], dd.edges) }), false)
    },
    [updateDiagram],
  )

  const onConnect = useCallback(
    (c: Connection) => {
      if (!c.source || !c.target || c.source === c.target || c.source.startsWith('band:')) return
      const e: SEdge = { id: uid('e'), source: c.source, target: c.target, sourceHandle: c.sourceHandle, targetHandle: c.targetHandle, type: 'schema', data: { path: 'step', arrowEnd: true, manualHandles: true } }
      updateDiagram((dd) => ({ ...dd, edited: true, edges: [...dd.edges, e] }), `connect:${Date.now()}`)
    },
    [updateDiagram],
  )

  const onReconnect = useCallback(
    (old: SEdge, c: Connection) => {
      updateDiagram(
        (dd) => ({
          ...dd,
          edited: true,
          edges: dd.edges.map((e) => (e.id === old.id ? { ...e, source: c.source, target: c.target, sourceHandle: c.sourceHandle, targetHandle: c.targetHandle, data: { ...e.data, manualHandles: true, offset: undefined, wrap: undefined } } : e)),
        }),
        `reconnect:${Date.now()}`,
      )
    },
    [updateDiagram],
  )

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onConnect={onConnect}
      onReconnect={onReconnect as never}
      edgesReconnectable
      connectionMode={ConnectionMode.Loose}
      connectionLineType={ConnectionLineType.SmoothStep}
      connectionRadius={28}
      snapToGrid
      snapGrid={[5, 5]}
      minZoom={0.08}
      maxZoom={4}
      deleteKeyCode={['Backspace', 'Delete']}
      selectionOnDrag
      selectionMode={SelectionMode.Partial}
      panOnDrag={[1, 2]}
      panOnScroll
      zoomOnPinch
      zoomActivationKeyCode={['Meta', 'Control']}
      multiSelectionKeyCode="Shift"
      elevateEdgesOnSelect
      onNodeDragStart={() => useStore.getState().commit(`drag:${Date.now()}`)}
      onNodeDoubleClick={(_, n) => {
        if (n.type === 'shape') useStore.setState({ editingNode: n.id })
      }}
      onPaneClick={() => useStore.setState({ selectedBand: null, editingNode: null })}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes(DND)) {
          e.preventDefault()
          e.dataTransfer.dropEffect = 'move'
        }
      }}
      onDrop={(e) => {
        const raw = e.dataTransfer.getData(DND)
        if (!raw) return
        e.preventDefault()
        const p = JSON.parse(raw) as { shape: ShapeKind; role: Role; label: string }
        addNode(p.shape, p.role, p.label, screenToFlowPosition({ x: e.clientX, y: e.clientY }))
      }}
      fitView
      fitViewOptions={FIT}
      onInit={(inst) => setTimeout(() => inst.fitView(FIT), 80)}
    >
      <Background gap={20} size={1} color="#d5dbe5" />
      <Controls showInteractive={false} position="bottom-left" />
      <MiniMap pannable zoomable position="bottom-right" nodeStrokeWidth={2} nodeColor={(n) => (n.type === 'band' || n.type === 'decor' ? 'transparent' : '#cbd5e1')} maskColor="rgba(241,245,249,0.7)" />
      <Palette />
    </ReactFlow>
  )
}

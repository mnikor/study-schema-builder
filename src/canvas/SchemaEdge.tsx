import { BaseEdge, EdgeLabelRenderer, useReactFlow, type EdgeProps } from '@xyflow/react'
import { memo, useRef } from 'react'
import type { SEdge } from '../types'
import { themeById } from '../lib/catalog'
import { edgePath } from '../lib/edges'
import { DASH } from '../lib/prims'
import { useStore } from '../store'

export const SchemaEdge = memo(function SchemaEdge(p: EdgeProps<SEdge>) {
  const themeId = useStore((s) => s.project.themeId)
  const fontSize = useStore((s) => (s.project.diagrams.find((d) => d.id === s.project.activeId) ?? s.project.diagrams[0]).settings.fontSize)
  const theme = themeById(themeId)
  const { getZoom } = useReactFlow()
  const g = edgePath({ sx: p.sourceX, sy: p.sourceY, sp: p.sourcePosition, tx: p.targetX, ty: p.targetY, tp: p.targetPosition, data: p.data })
  const color = p.data?.color ?? theme.edge
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null)

  const onPointerDown = (e: React.PointerEvent) => {
    e.stopPropagation()
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    drag.current = { x: e.clientX, y: e.clientY, ox: p.data?.offset?.x ?? 0, oy: p.data?.offset?.y ?? 0 }
    useStore.getState().commit(`edge-route:${p.id}:${Date.now()}`)
  }
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return
    const z = getZoom()
    const off = { x: Math.round(drag.current.ox + (e.clientX - drag.current.x) / z), y: Math.round(drag.current.oy + (e.clientY - drag.current.y) / z) }
    useStore.getState().updateDiagram((d) => ({ ...d, edited: true, edges: d.edges.map((x) => (x.id === p.id ? { ...x, data: { ...x.data, offset: off } } : x)) }), false)
  }
  const onPointerUp = () => {
    drag.current = null
  }

  return (
    <>
      <BaseEdge
        id={p.id}
        path={g.d}
        markerEnd={p.markerEnd}
        markerStart={p.markerStart}
        interactionWidth={16}
        style={{ stroke: color, strokeWidth: (p.data?.width ?? 1.5) + (p.selected ? 0.75 : 0), strokeDasharray: p.data?.dashed ? DASH : undefined, filter: p.selected ? 'drop-shadow(0 0 2px rgba(37,99,235,.7))' : undefined }}
      />
      <EdgeLabelRenderer>
        {p.data?.label && (
          <div className="edge-label nodrag nopan" style={{ transform: `translate(-50%, -50%) translate(${g.labelX}px, ${g.labelY}px)`, color, fontSize: fontSize - 2 }}>
            {p.data.label}
          </div>
        )}
        {p.selected && (p.data?.path ?? 'step') === 'step' && (
          <div
            className="edge-route-handle nodrag nopan"
            title="Drag to re-route this arrow"
            style={{ transform: `translate(-50%, -50%) translate(${g.centerX}px, ${g.centerY}px)` }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
          />
        )}
      </EdgeLabelRenderer>
    </>
  )
})

export const edgeTypes = { schema: SchemaEdge }

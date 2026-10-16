import { Handle, NodeResizer, Position, type Node, type NodeProps } from '@xyflow/react'
import { memo, useEffect, useRef, useState } from 'react'
import { Plus } from 'lucide-react'
import type { SNode } from '../types'
import { themeById } from '../lib/catalog'
import type { Box } from '../lib/shapes'
import { nodePrims } from '../lib/shapes'
import type { Prim } from '../lib/prims'
import { SIDES, segmentAnchors, type BoxSide as Side } from '../lib/edges'
import { useStore } from '../store'
import { addConnected, setNodeText } from './actions'
import { Prims } from './Prims'

const POS: Record<Side, Position> = { t: Position.Top, r: Position.Right, b: Position.Bottom, l: Position.Left }

function useDiagramContext() {
  const settings = useStore((s) => (s.project.diagrams.find((d) => d.id === s.project.activeId) ?? s.project.diagrams[0]).settings)
  const direction = useStore((s) => (s.project.diagrams.find((d) => d.id === s.project.activeId) ?? s.project.diagrams[0]).direction)
  const themeId = useStore((s) => s.project.themeId)
  return { settings, direction, theme: themeById(themeId) }
}

function asNode(p: NodeProps<SNode>): SNode {
  return { id: p.id, type: p.type as SNode['type'], position: { x: 0, y: 0 }, width: p.width, height: p.height, data: p.data }
}

function InlineEditor({ node }: { node: NodeProps<SNode> }) {
  const [value, setValue] = useState(() => [node.data.label, node.data.detail].filter(Boolean).join('\n'))
  const ref = useRef<HTMLTextAreaElement>(null)
  const done = useRef(false)
  useEffect(() => {
    ref.current?.focus()
    ref.current?.select()
  }, [])
  const finish = (save: boolean) => {
    if (done.current) return
    done.current = true
    if (save) {
      const [label, ...rest] = value.split('\n')
      setNodeText(node.id, label.trim(), rest.join('\n').trim() || undefined)
    }
    useStore.setState({ editingNode: null })
  }
  return (
    <textarea
      ref={ref}
      className="inline-editor nodrag nowheel nopan"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => finish(true)}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.key === 'Escape') finish(false)
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault()
          finish(true)
        }
      }}
      placeholder={'Label\nDetails (Shift+Enter for new line)'}
    />
  )
}

export const ShapeNode = memo(function ShapeNode(p: NodeProps<SNode>) {
  const { settings, direction, theme } = useDiagramContext()
  const editing = useStore((s) => s.editingNode === p.id)
  const single = useStore((s) => {
    const d = s.project.diagrams.find((x) => x.id === s.project.activeId)
    return !!d && d.nodes.filter((n) => n.selected).length === 1
  })
  const w = p.width ?? 180
  const h = p.height ?? 60
  const prims = nodePrims(asNode(p), theme, settings, direction)
  return (
    <div className="shape-node" style={{ width: w, height: h }}>
      <NodeResizer
        isVisible={p.selected && !editing}
        minWidth={40}
        minHeight={30}
        lineClassName="resize-line"
        handleClassName="resize-handle"
        keepAspectRatio={p.data.shape === 'circle'}
        onResizeStart={() => useStore.getState().commit(`resize:${p.id}:${Date.now()}`)}
        onResizeEnd={() => useStore.getState().updateDiagram((d) => ({ ...d, edited: true, nodes: d.nodes.map((n) => (n.id === p.id ? { ...n, data: { ...n.data, fixedSize: true } } : n)) }), false)}
      />
      <svg width={w} height={h} overflow="visible" className="node-svg">
        <Prims prims={editing ? prims.filter((x) => x.t !== 'text') : prims} />
      </svg>
      {SIDES.map((s) => (
        <Handle key={s} id={s} type="source" position={POS[s]} className="hdl" />
      ))}
      {editing && <InlineEditor node={p} />}
      {p.selected && single && !editing && (
        <>
          {SIDES.map((s) => (
            <button
              key={s}
              className={`quick-add quick-add-${s} nodrag nopan`}
              title="Add connected step"
              onClick={(e) => {
                e.stopPropagation()
                addConnected(p.id, s)
              }}
            >
              <Plus size={11} strokeWidth={3} />
            </button>
          ))}
        </>
      )}
    </div>
  )
})

export const PrimNode = memo(function PrimNode(p: NodeProps<SNode>) {
  const { settings, direction, theme } = useDiagramContext()
  const w = p.width ?? 100
  const h = p.height ?? 40
  const prims = nodePrims(asNode(p), theme, settings, direction)
  return (
    <div className={`prim-node ${p.type}-node${p.selected ? ' is-selected' : ''}`} style={{ width: w, height: h }}>
      <svg width={w} height={h} overflow="visible">
        <Prims prims={prims} />
      </svg>
      {p.type === 'segment' &&
        (() => {
          const a = segmentAnchors(w, h)
          return (
            <>
              <Handle id="start" type="source" position={Position.Left} className="hdl" style={{ top: a.start.y }} />
              <Handle id="startTop" type="source" position={Position.Top} className="hdl" style={{ left: 0, top: a.startTop.y }} />
              <Handle id="end" type="source" position={Position.Bottom} className="hdl" style={{ left: a.end.x, top: a.end.y, bottom: 'auto' }} />
            </>
          )
        })()}
    </div>
  )
})

export type DecorData = { prims: Prim[]; box: Box; phaseId?: string }
type DecorNode = Node<DecorData, 'band' | 'decor'>

export const BandNode = memo(function BandNode(p: NodeProps<DecorNode>) {
  const { box, prims } = p.data
  return (
    <div className={`band-node${p.selected ? ' is-selected' : ''}`} style={{ width: box.w, height: box.h }}>
      <svg width={box.w} height={box.h} overflow="visible">
        <g transform={`translate(${-box.x} ${-box.y})`}>
          <Prims prims={prims} />
        </g>
      </svg>
    </div>
  )
})

export const DecorNodeView = memo(function DecorNodeView(p: NodeProps<DecorNode>) {
  const { box, prims } = p.data
  return (
    <svg width={Math.max(1, box.w)} height={Math.max(1, box.h)} overflow="visible" style={{ pointerEvents: 'none' }}>
      <g transform={`translate(${-box.x} ${-box.y})`}>
        <Prims prims={prims} />
      </g>
    </svg>
  )
})

export const nodeTypes = { shape: ShapeNode, window: PrimNode, marker: PrimNode, segment: PrimNode, text: PrimNode, band: BandNode, decor: DecorNodeView }

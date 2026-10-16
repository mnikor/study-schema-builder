import type { Prim } from '../lib/prims'
import { DASH } from '../lib/prims'
import { FONT_FAMILY } from '../lib/text'

export function Prims({ prims }: { prims: Prim[] }) {
  return (
    <>
      {prims.map((p, i) => {
        switch (p.t) {
          case 'path':
            return <path key={i} d={p.d} fill={p.fill ?? 'none'} stroke={p.stroke} strokeWidth={p.sw} strokeDasharray={p.dash ? DASH : undefined} strokeLinejoin="round" opacity={p.opacity} />
          case 'rect':
            return <rect key={i} x={p.x} y={p.y} width={Math.max(0, p.w)} height={Math.max(0, p.h)} rx={p.rx} fill={p.fill ?? 'none'} stroke={p.stroke} strokeWidth={p.sw} strokeDasharray={p.dash ? DASH : undefined} opacity={p.opacity} />
          case 'line':
            return <line key={i} x1={p.x1} y1={p.y1} x2={p.x2} y2={p.y2} stroke={p.stroke} strokeWidth={p.sw} strokeDasharray={p.dash ? DASH : undefined} />
          case 'text':
            return (
              <text key={i} x={p.x} y={p.y} fontFamily={FONT_FAMILY} fontSize={p.size} fontWeight={p.bold ? 700 : 400} fill={p.color} textAnchor={p.anchor ?? 'start'} stroke={p.halo} strokeWidth={p.halo ? 4 : undefined} strokeLinejoin="round" paintOrder="stroke" style={{ whiteSpace: 'pre' }}>
                {p.text}
              </text>
            )
        }
      })}
    </>
  )
}

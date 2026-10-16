import { ChevronDown, ChevronRight, Plus, Trash2 } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { SWATCHES } from '../lib/catalog'

export function Section({ title, children, defaultOpen = true, right }: { title: string; children: ReactNode; defaultOpen?: boolean; right?: ReactNode }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <section className="sec">
      <header className="sec-h" onClick={() => setOpen(!open)}>
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <span>{title}</span>
        {right && (
          <span className="sec-right" onClick={(e) => e.stopPropagation()}>
            {right}
          </span>
        )}
      </header>
      {open && <div className="sec-b">{children}</div>}
    </section>
  )
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="field">
      <span className="field-l">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  )
}

export function Text({ value, onChange, placeholder, onFocus }: { value: string; onChange: (v: string) => void; placeholder?: string; onFocus?: () => void }) {
  return <input className="inp" value={value} placeholder={placeholder} onFocus={onFocus} onChange={(e) => onChange(e.target.value)} />
}

export function Area({ value, onChange, rows = 3, placeholder }: { value: string; onChange: (v: string) => void; rows?: number; placeholder?: string }) {
  return <textarea className="inp" rows={rows} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
}

export function Num({ value, onChange, min, max, step = 1, placeholder }: { value: number | null; onChange: (v: number | null) => void; min?: number; max?: number; step?: number; placeholder?: string }) {
  return (
    <input
      className="inp num"
      type="number"
      value={value ?? ''}
      min={min}
      max={max}
      step={step}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
    />
  )
}

export function Select<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: string; group?: string }[] }) {
  const groups = [...new Set(options.map((o) => o.group).filter(Boolean))] as string[]
  return (
    <select className="inp" value={value} onChange={(e) => onChange(e.target.value as T)}>
      {groups.length
        ? [
            ...options.filter((o) => !o.group).map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            )),
            ...groups.map((g) => (
              <optgroup key={g} label={g}>
                {options
                  .filter((o) => o.group === g)
                  .map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
              </optgroup>
            )),
          ]
        : options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
    </select>
  )
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  )
}

export function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode; title?: string }[] }) {
  return (
    <div className="seg">
      {options.map((o) => (
        <button key={o.value} title={o.title} className={o.value === value ? 'on' : ''} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Swatches({ value, onChange, allowReset }: { value?: string; onChange: (v: string | undefined) => void; allowReset?: boolean }) {
  return (
    <div className="swatches">
      {allowReset && (
        <button className={`sw sw-reset${!value ? ' on' : ''}`} title="Theme colour" onClick={() => onChange(undefined)}>
          A
        </button>
      )}
      {SWATCHES.map((c) => (
        <button key={c} className={`sw${value?.toLowerCase() === c ? ' on' : ''}`} style={{ background: c }} title={c} onClick={() => onChange(c)} />
      ))}
      <label className="sw sw-custom" title="Custom colour">
        <input type="color" value={value ?? '#ffffff'} onChange={(e) => onChange(e.target.value)} />
      </label>
    </div>
  )
}

export function ListEditor<T>({ items, onChange, render, make, addLabel }: { items: T[]; onChange: (v: T[]) => void; render: (item: T, set: (v: T) => void, i: number) => ReactNode; make: () => T; addLabel: string }) {
  return (
    <div className="list-ed">
      {items.map((it, i) => (
        <div className="list-row" key={i}>
          <div className="list-body">{render(it, (v) => onChange(items.map((x, j) => (j === i ? v : x))), i)}</div>
          <button className="icon-btn danger" title="Remove" onClick={() => onChange(items.filter((_, j) => j !== i))}>
            <Trash2 size={13} />
          </button>
        </div>
      ))}
      <button className="btn ghost sm" onClick={() => onChange([...items, make()])}>
        <Plus size={13} /> {addLabel}
      </button>
    </div>
  )
}

export const csv = (a: string[]) => a.join(', ')
export const fromCsv = (s: string) =>
  s
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean)
export const lines = (a: string[]) => a.join('\n')
export const fromLines = (s: string) =>
  s
    .split('\n')
    .map((x) => x.trim())
    .filter(Boolean)

import { useEffect, useRef, useState, type ReactNode, type CSSProperties } from 'react'
import { useStore } from '../app/store'

export interface Column<T> { key: string; label: string; width?: number | string; render: (row: T, i: number) => ReactNode; align?: 'left' | 'right'; sort?: (a: T, b: T) => number }

/** Virtualised table with keyboard navigation (j/k, Enter, o, g, m, e) and stagger for the first 20 rows. */
export function DataTable<T extends { id: string }>({ rows, columns, onOpen, onSelect, selected, height, rowClass, empty, onGraph, onMap, onExplain, staggerKey, footer }: {
  rows: T[]; columns: Column<T>[]; onOpen?: (r: T) => void; onSelect?: (r: T) => void; selected?: string | null; height?: number | string; rowClass?: (r: T) => string; empty?: ReactNode; onGraph?: (r: T) => void; onMap?: (r: T) => void; onExplain?: (r: T) => void; staggerKey?: string; footer?: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [scroll, setScroll] = useState(0)
  const [vh, setVh] = useState(400)
  const [cursor, setCursor] = useState(-1)
  const [sortKey, setSortKey] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<1 | -1>(1)
  const density = useStore(s => s.settings.density)
  const rowH = density === 'compact' ? 28 : density === 'spacious' ? 44 : 36
  useEffect(() => { const el = ref.current; if (!el) return; const ro = new ResizeObserver(() => setVh(el.clientHeight)); ro.observe(el); setVh(el.clientHeight); return () => ro.disconnect() }, [])
  const sorted = sortKey ? [...rows].sort((a, b) => (columns.find(c => c.key === sortKey)?.sort?.(a, b) ?? 0) * sortDir) : rows
  const start = Math.max(0, Math.floor(scroll / rowH) - 4)
  const end = Math.min(sorted.length, Math.ceil((scroll + vh) / rowH) + 4)
  const [animKey, setAnimKey] = useState(0)
  useEffect(() => { setAnimKey(k => k + 1); setCursor(-1) }, [staggerKey, rows.length])

  useEffect(() => {
    const el = ref.current; if (!el) return
    const h = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'TEXTAREA') return
      const r = sorted[cursor]
      if (e.key === 'j' || e.key === 'ArrowDown') { e.preventDefault(); setCursor(c => { const n = Math.min(sorted.length - 1, c + 1); el.scrollTop = Math.max(el.scrollTop, (n + 1) * rowH - vh + rowH); onSelect?.(sorted[n]); return n }) }
      else if (e.key === 'k' || e.key === 'ArrowUp') { e.preventDefault(); setCursor(c => { const n = Math.max(0, c - 1); el.scrollTop = Math.min(el.scrollTop, n * rowH); onSelect?.(sorted[n]); return n }) }
      else if ((e.key === 'Enter' || e.key === 'o') && r) onOpen?.(r)
      else if (e.key === ' ' && r) { e.preventDefault(); onSelect?.(r) }
      else if (e.key === 'g' && r && onGraph) onGraph(r)
      else if (e.key === 'm' && r && onMap) onMap(r)
      else if (e.key === 'e' && r && onExplain) onExplain(r)
    }
    el.addEventListener('keydown', h); return () => el.removeEventListener('keydown', h)
  }, [sorted, cursor, rowH, vh, onOpen, onSelect, onGraph, onMap, onExplain])

  const grid = columns.map(c => typeof c.width === 'number' ? `${c.width}px` : c.width || 'minmax(80px, 1fr)').join(' ')
  return (
    <div className="dt" style={{ height: height ?? '100%' }}>
      <div className="dt-head" style={{ gridTemplateColumns: grid }}>{columns.map(c => <div key={c.key} className={`dt-th ${c.align === 'right' ? 'right' : ''} ${c.sort ? 'sortable' : ''}`} onClick={() => { if (!c.sort) return; if (sortKey === c.key) setSortDir(d => (d === 1 ? -1 : 1)); else { setSortKey(c.key); setSortDir(1) } }}>{c.label}{sortKey === c.key ? (sortDir === 1 ? ' ↑' : ' ↓') : ''}</div>)}</div>
      <div className="dt-body" ref={ref} tabIndex={0} onScroll={e => setScroll((e.target as HTMLDivElement).scrollTop)}>
        {sorted.length === 0 && <div className="dt-empty">{empty ?? 'Нет данных'}</div>}
        <div style={{ height: sorted.length * rowH, position: 'relative' }}>
          {sorted.slice(start, end).map((r, i) => {
            const idx = start + i
            const style: CSSProperties = { position: 'absolute', top: idx * rowH, height: rowH, gridTemplateColumns: grid, animationDelay: idx < 20 ? `${idx * 15}ms` : '0ms' }
            return <div key={`${animKey}-${r.id}`} className={`dt-row ${idx < 20 ? 'dt-row-anim' : ''} ${selected === r.id ? 'selected' : ''} ${cursor === idx ? 'cursor' : ''} ${rowClass?.(r) || ''}`} style={style} onClick={() => { setCursor(idx); onSelect?.(r) }} onDoubleClick={() => onOpen?.(r)}>
              {columns.map(c => <div key={c.key} className={`dt-td ${c.align === 'right' ? 'right' : ''}`}>{c.render(r, idx)}</div>)}
            </div>
          })}
        </div>
      </div>
      {footer && <div className="dt-foot">{footer}</div>}
    </div>
  )
}

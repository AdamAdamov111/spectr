// U3 Поиск объектов: строка с префиксами типа, фасеты, виртуализированная таблица, сохранённые запросы, сравнение.
import { useEffect, useMemo, useRef, useState } from 'react'
import { Search as SearchIcon, X, Columns3 } from 'lucide-react'
import { search, type SearchFilters, world, get as getObject } from '../data/api'
import { useStore, useSimulatedSession } from '../app/store'
import { DataTable, type Column } from '../components/DataTable'
import { ObjectChip, Markings, Freshness, Kbd, Modal, formatProp, Masked, TypeIcon } from '../components/ui'
import { TYPES, type ObjectType, type Marking, LEVELS, isLevel } from '../data/ontology'
import { effectiveCategories, effectiveLevel, viewProps } from '../data/security'
import type { SpObject } from '../data/types'

interface Saved { label: string; q: string; f: SearchFilters; pred?: (o: SpObject) => boolean }
const SAVED: Saved[] = [
  { label: 'Насосы с индексом < 0.5', q: 'eq: насос', f: { type: 'Equipment' }, pred: o => (o.props.health_index as number) < 0.5 },
  { label: 'Контрагенты с риском > 0.6', q: '', f: { type: 'Organization' }, pred: o => (o.props.risk_score as number) > 0.6 },
  { label: 'Просроченные договоры', q: '', f: { type: 'Contract', status: 'просрочен' } },
  { label: 'Открытые заявки ТОиР', q: '', f: { type: 'MaintenanceOrder' }, pred: o => o.props.status !== 'закрыта' },
  { label: 'Закупки с картельным паттерном', q: '', f: { type: 'Procurement' }, pred: o => (o.props.cartel_pattern as number) > 0.5 },
  { label: 'Скважины с падением дебита', q: '', f: { type: 'Well' }, pred: o => (o.props.trend_30d as number) < -10 },
]

let preset: SearchFilters | null = null
export function setSearchPreset(f: SearchFilters) { preset = f }

export function SearchScreen() {
  const session = useSimulatedSession()
  const openObject = useStore(s => s.openObject); const openScreen = useStore(s => s.openScreen); const openExplain = useStore(s => s.openExplain); const focusMap = useStore(s => s.focusMap)
  const compare = useStore(s => s.compare); const toggleCompare = useStore(s => s.toggleCompare); const clearCompare = useStore(s => s.clearCompare)
  const [q, setQ] = useState(''); const [f, setF] = useState<SearchFilters>(() => { const p = preset; preset = null; return { type: 'all', ...(p || {}) } }); const [pred, setPred] = useState<((o: SpObject) => boolean) | null>(null)
  const [debounced, setDebounced] = useState('')
  const [showCompare, setShowCompare] = useState(false)
  const selected = useStore(s => s.inspector.objectId)
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => { const t = setTimeout(() => setDebounced(q), 120); return () => clearTimeout(t) }, [q])
  useEffect(() => { ref.current?.focus() }, [])
  const res = useMemo(() => search(session, debounced, f, 10000), [debounced, f, session.login, session.purpose])
  const rows = useMemo(() => (pred ? res.items.filter(pred) : res.items), [res, pred])
  const type: ObjectType | null = f.type && f.type !== 'all' ? f.type : rows.length && rows.every(r => r.type === rows[0].type) ? rows[0].type : null
  const lvl = effectiveLevel(session); const cats = effectiveCategories(session)
  const w = world()
  const columns = useMemo<Column<SpObject>[]>(() => {
    const cols: Column<SpObject>[] = [
      { key: 'obj', label: 'Объект', width: 'minmax(220px, 2fr)', render: r => <ObjectChip o={r} noHover />, sort: (a, b) => a.label.localeCompare(b.label) },
      { key: 'type', label: 'Тип', width: 120, render: r => <span className="dim">{TYPES[r.type].label}</span>, sort: (a, b) => a.type.localeCompare(b.type) },
      { key: 'dzo', label: 'ДЗО', width: 120, render: r => <span className="dim truncate">{r.subsidiary ? getObject(r.subsidiary)?.label : '—'}</span> },
    ]
    if (type) { const keys = TYPES[type].props.filter(p => p.key).slice(0, 5); for (const p of keys) cols.push({ key: p.name, label: p.label, width: p.type === 'money' || p.type === 'number' || p.type === 'decimal' ? 120 : 'minmax(100px, 1fr)', align: p.type === 'money' || p.type === 'number' || p.type === 'decimal' || p.type === 'percent' ? 'right' : 'left', render: r => { const vp = viewProps(session, r).find(x => x.name === p.name)!; return vp.masked && !vp.partial ? <Masked reason={vp.reason} markings={p.markings} inline /> : <span className="mono truncate">{formatProp(vp.value, p.type, p.unit)}</span> }, sort: (a, b) => { const x = a.props[p.name], y = b.props[p.name]; return typeof x === 'number' && typeof y === 'number' ? x - y : String(x ?? '').localeCompare(String(y ?? '')) } }) }
    cols.push({ key: 'mk', label: 'Маркировки', width: 170, render: r => <Markings list={r.markings} small /> })
    cols.push({ key: 'fresh', label: 'Свежесть', width: 80, render: r => <Freshness o={r} /> })
    return cols
  }, [type, session.login, session.purpose])
  const facet = (k: keyof SearchFilters, v: unknown) => setF(x => ({ ...x, [k]: x[k] === v ? undefined : v }))
  return (
    <div className="screen search">
      <div className="screen-h">
        <div className="search-input"><SearchIcon size={15} className="dim" /><input ref={ref} value={q} onChange={e => { setQ(e.target.value); setPred(null) }} placeholder="Поиск объектов… префиксы eq: org: inn: well: nps: mo: ctr: prc: doc:" />{q && <button className="btn-icon" onClick={() => setQ('')}><X size={13} /></button>}<Kbd k="/" /></div>
        <span className="dim mono" style={{ fontSize: 11 }}>{rows.length.toLocaleString('ru-RU')} объектов · {res.tookMs} мс · PEP: фильтр _mk до подсчёта</span>
        <span className="grow" />
        {compare.length > 0 && <button className="btn" onClick={() => setShowCompare(true)}><Columns3 size={13} /> Сравнить ({compare.length})</button>}
      </div>
      <div className="screen-b">
        <aside className="facets">
          <div className="facet"><div className="facet-h">Сохранённые запросы</div>{SAVED.map(s => <button key={s.label} className="facet-item" onClick={() => { setQ(s.q); setF({ type: 'all', ...s.f }); setPred(() => s.pred || null) }}>{s.label}</button>)}</div>
          <div className="facet"><div className="facet-h">Тип объекта</div><button className={`facet-item ${!f.type || f.type === 'all' ? 'active' : ''}`} onClick={() => setF(x => ({ ...x, type: 'all' }))}>Все<span className="n">{res.total.toLocaleString('ru-RU')}</span></button>{res.facets.types.slice(0, 14).map(([t, n]) => <button key={t} className={`facet-item ${f.type === t ? 'active' : ''}`} onClick={() => facet('type', t)}><TypeIcon type={t} size={12} />{TYPES[t].plural}<span className="n">{n.toLocaleString('ru-RU')}</span></button>)}</div>
          <div className="facet"><div className="facet-h">ДЗО</div>{res.facets.subsidiaries.map(([id, n]) => <button key={id} className={`facet-item ${f.subsidiary === id ? 'active' : ''}`} onClick={() => facet('subsidiary', id)}>{getObject(id)?.label}<span className="n">{n.toLocaleString('ru-RU')}</span></button>)}</div>
          <div className="facet"><div className="facet-h">Маркировка</div>{([...LEVELS, 'FIN', 'PII', 'PROD', 'GEO', 'HR', 'LEGAL'] as Marking[]).map(m => { const n = res.facets.markings.find(x => x[0] === m)?.[1] || 0; const na = isLevel(m) ? LEVELS.indexOf(m) > LEVELS.indexOf(lvl) : !cats.has(m); return <button key={m} className={`facet-item ${f.marking === m ? 'active' : ''} ${na ? 'na' : ''}`} onClick={() => !na && facet('marking', m)} title={na ? 'недоступно под текущей целью' : ''}>{m}<span className="n">{na ? 'недоступно' : n.toLocaleString('ru-RU')}</span></button> })}</div>
          {res.facets.statuses.length > 0 && <div className="facet"><div className="facet-h">Статус</div>{res.facets.statuses.map(([s, n]) => <button key={s} className={`facet-item ${f.status === s ? 'active' : ''}`} onClick={() => facet('status', s)}>{s}<span className="n">{n.toLocaleString('ru-RU')}</span></button>)}</div>}
          <div className="facet"><div className="facet-h">Свежесть</div>{(['ok', 'warn', 'stale'] as const).map(s => <button key={s} className={`facet-item ${f.freshness === s ? 'active' : ''}`} onClick={() => facet('freshness', s)}><span className={`fresh fresh-${s}`}><span className="fresh-dot" /></span>{s === 'ok' ? 'в SLO' : s === 'warn' ? '1–3 SLO' : 'устарело'}</button>)}</div>
        </aside>
        <div className="search-results">
          <DataTable rows={rows} columns={columns} selected={selected} staggerKey={`${debounced}|${JSON.stringify(f)}`} onSelect={r => openObject(r.id)} onOpen={r => openObject(r.id, { tab: true })} onGraph={() => openScreen('graph')} onMap={r => r.geo && focusMap(r.id)} onExplain={r => openExplain(r.id, TYPES[r.type].props.find(p => p.derived_by)?.name || TYPES[r.type].props[0].name)}
            empty={<span>Объектов не найдено. Подключите источник или проверьте фильтры</span>}
            footer={<><span>{rows.length >= 10000 ? 'показаны первые 10 000, уточните запрос' : `${rows.length.toLocaleString('ru-RU')} строк`}</span><span>j/k — навигация · o — открыть · g — граф · m — карта · e — explain · Shift+клик — в сравнение</span><span className="grow" /><span>всего объектов на стенде: {w.objects.size.toLocaleString('ru-RU')}</span></>}
            rowClass={r => (compare.includes(r.id) ? 'in-compare' : '')} />
          <div className="compare-hint" onClickCapture={e => { const el = (e.target as HTMLElement).closest('.dt-row'); if (el && (e as unknown as MouseEvent).shiftKey) { e.stopPropagation(); e.preventDefault(); const idx = Number((el as HTMLElement).style.top.replace('px', '')) / (el as HTMLElement).clientHeight; const r = rows[Math.round(idx)]; if (r) toggleCompare(r.id) } }} />
        </div>
      </div>
      {showCompare && <Modal title={`Сравнение объектов (${compare.length})`} onClose={() => setShowCompare(false)} width={960}><Compare ids={compare} /><div className="row" style={{ marginTop: 10 }}><button className="btn" onClick={() => { clearCompare(); setShowCompare(false) }}>Очистить</button></div></Modal>}
    </div>
  )
}

function Compare({ ids }: { ids: string[] }) {
  const session = useSimulatedSession()
  const objs = ids.map(getObject).filter(Boolean) as SpObject[]
  if (!objs.length) return null
  const type = objs[0].type
  const props = TYPES[type].props
  return <table className="xw cmp"><thead><tr><th>Свойство</th>{objs.map(o => <th key={o.id}><ObjectChip o={o} /></th>)}</tr></thead><tbody>{props.map(p => { const vals = objs.map(o => viewProps(session, o).find(x => x.name === p.name)!); const distinct = new Set(vals.map(v => JSON.stringify(v.value))).size > 1; return <tr key={p.name} className={distinct ? 'diff-hl' : ''}><td className="dim">{p.label}</td>{vals.map((v, i) => <td key={i} className="mono">{v.masked && !v.partial ? <Masked inline markings={p.markings} /> : formatProp(v.value, p.type, p.unit)}</td>)}</tr> })}</tbody></table>
}

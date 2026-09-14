// U6 Граф связей: раскрытие узлов, фильтры по типам связей и confidence, таймлайн, путь между узлами, экспорт с водяным знаком.
import { useEffect, useMemo, useRef, useState } from 'react'
import { Maximize2, Download, Table2, Waypoints, Save, Pin } from 'lucide-react'
import { ForceGraph, type GNode, type GLink, type GraphHandle } from '../graph/ForceGraph'
import { traverse, shortestPath, world, get as getObject, logRead, neighbors } from '../data/api'
import { useStore, useSimulatedSession } from '../app/store'
import { LINKS, LINK_BY_TYPE, TYPES, type LinkType } from '../data/ontology'
import { ObjectChip, Panel, Markings } from '../components/ui'
import type { SpObject, SpLink } from '../data/types'
import { fmtDate } from '../data/rng'

export function GraphScreen() {
  const session = useSimulatedSession()
  const openObject = useStore(s => s.openObject); const openExplain = useStore(s => s.openExplain); const focusMap = useStore(s => s.focusMap); const toast = useStore(s => s.toast); const openTab = useStore(s => s.openTab)
  const theme = useStore(s => s.settings.theme)
  const insId = useStore(s => s.inspector.objectId)
  const w = world()
  const [roots, setRoots] = useState<string[]>(() => [insId && getObject(insId)?.type !== 'Purpose' ? insId : w.named.vektor])
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [types, setTypes] = useState<Set<LinkType>>(new Set(LINKS.map(l => l.type).filter(t => t !== 'accessed_under')))
  const [minConf, setMinConf] = useState(0.5)
  const [timeCut, setTimeCut] = useState<number | null>(null)
  const [selected, setSelected] = useState<string | null>(roots[0])
  const [pathMode, setPathMode] = useState<string | null>(null)
  const [path, setPath] = useState<{ nodes: string[]; links: string[] } | null>(null)
  const [pinned, setPinned] = useState<Set<string>>(new Set())
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null)
  const [table, setTable] = useState(false)
  const g = useRef<GraphHandle>(null)
  const data = useMemo(() => {
    const t = traverse(session, roots, 1, { types: [...types], minConfidence: minConf })
    const nodes = new Map(t.nodes.map(n => [n.id, n])); const links = new Map(t.links.map(l => [l.id, l])); const hidden = new Set(t.hidden); const parent = new Map<string, string>()
    for (const r of roots) for (const n of t.nodes) if (n.id !== r) parent.set(n.id, r)
    for (const id of expanded) { const e = traverse(session, [id], 1, { types: [...types], minConfidence: minConf }); for (const n of e.nodes) { if (!nodes.has(n.id)) { nodes.set(n.id, n); parent.set(n.id, id) } } for (const l of e.links) links.set(l.id, l); for (const h of e.hidden) hidden.add(h) }
    return { nodes: [...nodes.values()], links: [...links.values()], hidden, parent }
  }, [roots, expanded, types, minConf, session.login, session.purpose])
  const gnodes: GNode[] = useMemo(() => data.nodes.map(n => ({ id: n.id, label: n.label, type: n.type, color: TYPES[n.type].color, hidden: data.hidden.has(n.id), root: roots.includes(n.id), parent: data.parent.get(n.id), pinned: pinned.has(n.id), ts: n.created })), [data, pinned])
  const glinks: GLink[] = useMemo(() => data.links.map(l => ({ id: l.id, from: l.from, to: l.to, confidence: l.confidence, type: l.type, label: LINK_BY_TYPE[l.type].label, ts: l.validFrom })), [data])
  useEffect(() => { if (insId && !roots.includes(insId) && !data.nodes.some(n => n.id === insId) && getObject(insId) && getObject(insId)!.type !== 'Purpose') { /* keep graph stable; user can add via drag or context */ } }, [insId])
  const sel = selected ? getObject(selected) : undefined
  const counts = useMemo(() => { const m = new Map<string, number>(); for (const n of data.nodes) m.set(n.type, (m.get(n.type) || 0) + 1); return [...m].sort((a, b) => b[1] - a[1]) }, [data])
  const timeRange = useMemo(() => { const ts = data.nodes.map(n => n.created).filter(Boolean); return { min: Math.min(...ts), max: Math.max(...ts) } }, [data])
  function onSelect(id: string | null) {
    if (pathMode && id) { const p = shortestPath(session, pathMode, id); if (p) { setPath({ nodes: p.nodes, links: p.links.map(l => l.id) }); for (const n of p.nodes) if (!data.nodes.some(x => x.id === n)) setExpanded(s => new Set([...s, ...p.nodes])); toast({ text: `Путь найден: ${p.links.length} рёбер (Function graph_shortest_path с учётом маркировок)`, kind: 'ok' }) } else toast({ text: 'Путь не найден в пределах 5 хопов под текущей целью', kind: 'warn' }); setPathMode(null); return }
    setSelected(id); if (id) openObject(id)
  }
  return (
    <div className="screen graph-screen">
      <div className="screen-h">
        <span className="screen-title">Граф связей</span>
        <div className="row" style={{ gap: 4 }}>{roots.map(r => <ObjectChip key={r} id={r} compact />)}</div>
        <span className="dim mono" style={{ fontSize: 11 }}>{data.nodes.length} узлов · {data.links.length} рёбер · {data.hidden.size} скрыто политикой</span>
        <span className="grow" />
        {pathMode && <span className="pill accent">Путь от {getObject(pathMode)?.label}: кликните второй узел · Esc</span>}
        <button className="btn btn-xs" onClick={() => g.current?.fit()}><Maximize2 size={12} /> Вписать</button>
        <button className={`btn btn-xs ${table ? 'btn-primary' : ''}`} onClick={() => setTable(t => !t)} title="Табличная альтернатива графа (AC-04)"><Table2 size={12} /> Таблица</button>
        <button className="btn btn-xs" onClick={() => { const png = g.current?.exportPng(`${session.login} · ${session.purpose} · ${new Date().toISOString()}`); if (png) { const a = document.createElement('a'); a.href = png; a.download = 'spectr-graph.png'; a.click() } logRead(session, 'export', data.nodes.map(n => n.id), 'graph.png', 'allow', 'PNG с водяным знаком'); toast({ text: 'Экспорт графа с водяным знаком зарегистрирован в аудите', kind: 'info' }) }}><Download size={12} /> Экспорт PNG</button>
        <button className="btn btn-xs" onClick={() => { openTab({ kind: 'investigation', title: `Расследование #${142 + w.events.length % 20}`, id: `i:${Date.now()}`, params: { roots, expanded: [...expanded], positions: g.current?.positions() } }); toast({ text: 'Состояние графа сохранено в объект Investigation', kind: 'ok' }) }}><Save size={12} /> Сохранить расследование</button>
      </div>
      <div className="screen-b">
        <div className="graph-area" onKeyDown={e => { if (e.key === 'Escape') { setPathMode(null); setPath(null) } }} tabIndex={-1}>
          {table ? <GraphTable nodes={data.nodes} links={data.links} /> : <ForceGraph ref={g} nodes={gnodes} links={glinks} selected={selected} onSelect={onSelect} onExpand={id => setExpanded(s => new Set([...s, id]))} onContext={(id, x, y) => setMenu({ id, x, y })} pathLinks={path?.links} pathNodes={path?.nodes} timeCut={timeCut ?? undefined} theme={theme} onDropObject={id => setRoots(r => [...r, id])} />}
          {menu && <div className="ctx-menu scale-in" style={{ left: menu.x, top: menu.y }} onMouseLeave={() => setMenu(null)}>
            <button onClick={() => { openObject(menu.id, { tab: true }); setMenu(null) }}>Открыть карточку</button>
            <button onClick={() => { setExpanded(s => new Set([...s, menu.id])); setMenu(null) }}>Раскрыть связи</button>
            <button onClick={() => { setPinned(s => { const c = new Set(s); c.has(menu.id) ? c.delete(menu.id) : c.add(menu.id); return c }); setMenu(null) }}><Pin size={11} /> {pinned.has(menu.id) ? 'Открепить' : 'Закрепить'}</button>
            <button onClick={() => { setPathMode(menu.id); setPath(null); setMenu(null) }}><Waypoints size={11} /> Путь отсюда…</button>
            <button onClick={() => { const o = getObject(menu.id)!; openExplain(o.id, TYPES[o.type].props.find(p => p.derived_by)?.name || TYPES[o.type].props[0].name); setMenu(null) }}>Explain</button>
            {getObject(menu.id)?.geo && <button onClick={() => { focusMap(menu.id); setMenu(null) }}>Показать на карте</button>}
            <button onClick={() => { setRoots([menu.id]); setExpanded(new Set()); setPath(null); setMenu(null) }}>Сделать корнем</button>
          </div>}
          <div className="graph-timeline">
            <span className="mono dim" style={{ fontSize: 10 }}>{fmtDate(timeRange.min)}</span>
            <input type="range" min={timeRange.min} max={timeRange.max} step={86400000} value={timeCut ?? timeRange.max} onChange={e => setTimeCut(Number(e.target.value) >= timeRange.max ? null : Number(e.target.value))} aria-label="Таймлайн графа" />
            <span className="mono" style={{ fontSize: 10, color: timeCut ? 'var(--sp-warn)' : 'var(--sp-text-2)' }}>{timeCut ? `до ${fmtDate(timeCut)}` : 'сейчас'}</span>
          </div>
        </div>
        <aside className="graph-side">
          <Panel title="Типы связей" dense><div className="col" style={{ padding: 8, gap: 2 }}>{LINKS.filter(l => l.type !== 'accessed_under').map(l => <label key={l.type} className="check"><input type="checkbox" checked={types.has(l.type)} onChange={e => setTypes(s => { const c = new Set(s); e.target.checked ? c.add(l.type) : c.delete(l.type); return c })} /><span className="grow">{l.label}</span><span className="dim mono" style={{ fontSize: 10 }}>{l.markings.join(',')}</span></label>)}</div></Panel>
          <Panel title={`Порог confidence · ${minConf.toFixed(2)}`} dense><div style={{ padding: 8 }}><input type="range" min={0} max={1} step={0.05} value={minConf} onChange={e => setMinConf(Number(e.target.value))} style={{ width: '100%' }} aria-label="Порог confidence" /><div className="dim" style={{ fontSize: 11 }}>Связи ниже 0.6 показаны пунктиром; источник NLP даёт confidence модели natasha-ner</div></div></Panel>
          <Panel title="Легенда" dense><div className="col" style={{ padding: 8, gap: 4 }}>{counts.map(([t, n]) => <div key={t} className="row" style={{ fontSize: 12 }}><i className="legend-dot" style={{ background: TYPES[t as keyof typeof TYPES].color }} /><span className="grow">{TYPES[t as keyof typeof TYPES].plural}</span><span className="mono dim">{n}</span></div>)}<div className="row" style={{ fontSize: 11, marginTop: 4 }}><span className="dim">◌ 🔒 — узел скрыт политикой: существование известно, свойства нет</span></div></div></Panel>
          {sel && <Panel title="Выбранный узел" dense><div style={{ padding: 8 }} className="col"><ObjectChip o={sel} /><Markings list={sel.markings} small /><div className="dim" style={{ fontSize: 11 }}>{neighbors(session, sel.id).length} связей доступно · двойной клик — раскрыть</div><div className="row"><button className="btn btn-xs" onClick={() => setExpanded(s => new Set([...s, sel.id]))}>Раскрыть</button><button className="btn btn-xs" onClick={() => { setPathMode(sel.id); setPath(null) }}>Путь отсюда</button></div></div></Panel>}
        </aside>
      </div>
    </div>
  )
}

function GraphTable({ nodes, links }: { nodes: SpObject[]; links: SpLink[] }) {
  return <div style={{ overflow: 'auto', padding: 10, height: '100%' }}><table className="xw"><thead><tr><th>От</th><th>Связь</th><th>К</th><th>Confidence</th><th>Источник</th></tr></thead><tbody>{links.map(l => { const a = nodes.find(n => n.id === l.from), b = nodes.find(n => n.id === l.to); return <tr key={l.id}><td>{a ? <ObjectChip o={a} compact /> : l.from}</td><td className="dim">{LINK_BY_TYPE[l.type].label}</td><td>{b ? <ObjectChip o={b} compact /> : l.to}</td><td className="mono">{l.confidence.toFixed(2)}</td><td className="dim">{l.source}</td></tr> })}</tbody></table></div>
}

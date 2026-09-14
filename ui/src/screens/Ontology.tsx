// U11 Онтология: граф типов и связей, панель типа (свойства, маркировки, версии, использование), YAML как код.
import { useMemo, useState } from 'react'
import { TYPES, LINKS, ACTIONS, FUNCTIONS, ONTOLOGY_VERSION, ONTOLOGY_RELEASES, type ObjectType } from '../data/ontology'
import { world } from '../data/api'
import { ForceGraph, type GNode, type GLink } from '../graph/ForceGraph'
import { useStore } from '../app/store'
import { Panel, Markings, TypeIcon } from '../components/ui'
import { setSearchPreset } from './Search'
import { hash32 } from '../data/rng'

export function OntologyScreen() {
  const theme = useStore(s => s.settings.theme); const openScreen = useStore(s => s.openScreen)
  const [sel, setSel] = useState<ObjectType>('Equipment')
  const [tab, setTab] = useState<'props' | 'yaml' | 'versions'>('props')
  const w = world()
  const nodes: GNode[] = useMemo(() => (Object.keys(TYPES) as ObjectType[]).map(t => ({ id: t, label: TYPES[t].label, type: t, color: TYPES[t].color, size: 6 + Math.min(8, Math.log2((w.byType.get(t)?.length || 1) + 1)), root: t === sel })), [sel])
  const links: GLink[] = useMemo(() => LINKS.flatMap(l => l.from.flatMap(f => l.to.map(t => ({ id: `${l.type}:${f}:${t}`, from: f, to: t, confidence: 1, type: l.type, label: l.label })))), [])
  const related = useMemo(() => { const s = new Set<string>([sel]); for (const l of links) { if (l.from === sel) s.add(l.to); if (l.to === sel) s.add(l.from) } return [...s] }, [sel, links])
  const def = TYPES[sel]
  const usage = (p: string) => { const h = hash32(sel + p) % 100; return h }
  const yaml = () => `# ontology/objects/${sel.toLowerCase()}.yaml\nobject_type: ${sel}\nversion: ${def.version}\nowner: ${def.owner}\ndescription: ${def.description}\nprimary_key: ${def.prefix}_id            # golden_id, UUIDv7\nbacking_dataset: ${def.backing}      # Iceberg table\nprovenance: ${def.provenance}\nfreshness_slo: ${def.sloSec >= 86400 ? def.sloSec / 86400 + 'd' : def.sloSec >= 3600 ? def.sloSec / 3600 + 'h' : def.sloSec >= 60 ? def.sloSec / 60 + 'm' : def.sloSec + 's'}\nmarkings: [${def.markings.join(', ')}]\nproperties:\n${def.props.map(p => `  - name: ${p.name}\n    type: ${p.type}${p.unit ? `\n    unit: ${p.unit}` : ''}${p.markings?.length ? `\n    markings: [${p.markings.join(', ')}]` : ''}${p.masking ? `\n    masking: ${p.masking}` : ''}${p.sources?.length ? `\n    sources: [${p.sources.join(', ')}]` : ''}${p.survivorship ? `\n    survivorship: ${p.survivorship}` : ''}${p.derived_by ? `\n    derived_by: ${p.derived_by}` : ''}`).join('\n')}\nlinks:\n${LINKS.filter(l => l.from.includes(sel) || l.to.includes(sel)).map(l => `  - name: ${l.type}\n    ${l.from.includes(sel) ? 'to' : 'from'}: [${(l.from.includes(sel) ? l.to : l.from).join(', ')}]\n    cardinality: ${l.cardinality}`).join('\n')}\nactions:\n${ACTIONS.filter(a => a.object.includes(sel)).map(a => `  - ${a.name}`).join('\n') || '  []'}\n${sel === 'Equipment' ? 'compat:\n  deprecated_properties:\n    - name: cond_index      # переименовано в health_index в 1.2.0, alias до 2.0.0\n      alias_of: health_index\n' : ''}`
  return (
    <div className="screen onto">
      <div className="screen-h"><span className="screen-title">Онтология</span><span className="pill">v{ONTOLOGY_VERSION}</span><span className="dim mono" style={{ fontSize: 11 }}>{Object.keys(TYPES).length} типов · {LINKS.length} связей · {ACTIONS.length} действий · {FUNCTIONS.length} функций · YAML в git, CI на совместимость (ADR-12)</span><span className="grow" /><button className="btn btn-xs" onClick={() => { setSearchPreset({ type: sel }); openScreen('search') }}>Показать объекты типа {def.label} ({w.byType.get(sel)?.length || 0})</button></div>
      <div className="screen-b">
        <div className="graph-area"><ForceGraph nodes={nodes} links={links} selected={sel} onSelect={id => id && setSel(id as ObjectType)} pathNodes={related} dimOthers theme={theme} /></div>
        <aside className="onto-side">
          <div className="row" style={{ padding: '10px 10px 0', gap: 8 }}><TypeIcon type={sel} size={18} /><b style={{ fontSize: 15 }}>{def.label}</b><span className="mono dim">{sel}</span><span className="grow" /><span className="pill">v{def.version}</span></div>
          <div className="dim" style={{ padding: '4px 10px', fontSize: 12 }}>{def.description}</div>
          <div className="row" style={{ padding: '0 10px', flexWrap: 'wrap', gap: 6 }}><Markings list={def.markings} small /><span className="pill">{def.backing}</span><span className="pill">provenance: {def.provenance}</span><span className="pill">SLO {def.sloSec >= 3600 ? def.sloSec / 3600 + ' ч' : def.sloSec >= 60 ? def.sloSec / 60 + ' мин' : def.sloSec + ' с'}</span><span className="pill">owner: {def.owner}</span><span className="pill">объектов: {w.byType.get(sel)?.length || 0}</span></div>
          <div className="tabs" style={{ marginTop: 8 }}>{(['props', 'yaml', 'versions'] as const).map(t => <button key={t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>{t === 'props' ? 'Свойства и связи' : t === 'yaml' ? 'Как код (YAML)' : 'Версии'}</button>)}</div>
          <div className="onto-body xfade" key={tab}>
            {tab === 'props' && <>
              <table className="xw"><thead><tr><th>Свойство</th><th>Тип</th><th>Маркировки</th><th>Источник / функция</th><th>Исп. %</th></tr></thead><tbody>{def.props.map(p => <tr key={p.name}><td className="mono">{p.name}{p.key && <span className="dim"> ★</span>}</td><td className="dim">{p.type}{p.unit ? ` (${p.unit})` : ''}</td><td>{p.markings?.length ? <Markings list={p.markings} small /> : <span className="dim">—</span>}</td><td className="dim mono" style={{ fontSize: 10 }}>{p.derived_by ? `ƒ ${p.derived_by}` : p.sources?.join(', ') || '—'}</td><td><div className="bar" style={{ width: 60 }}><i style={{ width: `${usage(p.name)}%`, background: usage(p.name) < 10 ? 'var(--sp-danger)' : 'var(--sp-accent)' }} /></div></td></tr>)}</tbody></table>
              <div className="section-h">Связи</div>
              {LINKS.filter(l => l.from.includes(sel) || l.to.includes(sel)).map(l => <div key={l.type} className="row" style={{ fontSize: 12, padding: '3px 0' }}><span className="mono">{l.type}</span><span className="dim">{l.from.includes(sel) ? '→ ' + l.to.join(', ') : '← ' + l.from.join(', ')}</span><span className="grow" /><span className="dim mono" style={{ fontSize: 10 }}>{l.cardinality}</span><Markings list={l.markings} small /></div>)}
              <div className="section-h">Действия</div>
              {ACTIONS.filter(a => a.object.includes(sel)).map(a => <div key={a.name} className="row" style={{ fontSize: 12, padding: '3px 0' }}><span className="mono">{a.name}</span><span className="dim">{a.label}</span><span className="grow" /><span className="pill" style={{ fontSize: 10 }}>{a.risk}</span></div>) || null}
              {!ACTIONS.some(a => a.object.includes(sel)) && <div className="dim" style={{ fontSize: 12 }}>нет действий</div>}
              <div className="section-h">Источники</div>
              <div className="row" style={{ flexWrap: 'wrap', gap: 4 }}>{def.sources.map(s => <span key={s} className="src-tag mono">{s}</span>)}</div>
            </>}
            {tab === 'yaml' && <div className="code" style={{ whiteSpace: 'pre', fontSize: 11 }}>{yaml()}</div>}
            {tab === 'versions' && <div className="tl">{ONTOLOGY_RELEASES.map((r, i) => <div key={r.version} className="tl-item" style={{ animationDelay: `${i * 40}ms` }}><div className="row"><b>v{r.version}</b><span className="mono dim" style={{ fontSize: 11 }}>{r.date}</span><span className="dim">{r.author}</span></div><div style={{ fontSize: 12 }}>{r.note}</div></div>)}<div className="dim" style={{ fontSize: 11 }}>Правила: добавление свойства = minor; переименование = alias на N релизов; удаление после 30 дней нулевого трафика (O-02).</div></div>}
          </div>
        </aside>
      </div>
    </div>
  )
}

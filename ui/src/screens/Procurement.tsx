// U7 Антифрод закупок: таблица с cartel_pattern, мини-граф участников, explain факторов с весами, сравнение.
import { useMemo, useState } from 'react'
import { Gavel, Columns3 } from 'lucide-react'
import { world, get as getObject, neighbors, cartelFactors, traverse } from '../data/api'
import { useStore, useSimulatedSession } from '../app/store'
import { DataTable, type Column } from '../components/DataTable'
import { ObjectChip, Panel, Masked, formatProp, Modal, PolicyDenied } from '../components/ui'
import { ForceGraph, type GNode, type GLink } from '../graph/ForceGraph'
import { TYPES, LINK_BY_TYPE } from '../data/ontology'
import { canSee, viewProps, canExecute, decide } from '../data/security'
import type { SpObject } from '../data/types'

export function ProcurementScreen() {
  const session = useSimulatedSession()
  const openObject = useStore(s => s.openObject); const openAction = useStore(s => s.openAction); const openExplain = useStore(s => s.openExplain); const theme = useStore(s => s.settings.theme)
  const w = world()
  const [dzo, setDzo] = useState(''); const [year, setYear] = useState(''); const [thr, setThr] = useState(0.5)
  const [sel, setSel] = useState<string>(w.named.sharedProcs[5])
  const [cmp, setCmp] = useState<string[]>([]); const [showCmp, setShowCmp] = useState(false)
  const [hl, setHl] = useState<string[] | null>(null)
  const rows = useMemo(() => (w.byType.get('Procurement') || []).filter(p => canSee(session, p) && (!dzo || p.subsidiary === dzo) && (!year || String(p.props.published).startsWith(year)) && (p.props.cartel_pattern as number) >= thr).sort((a, b) => (b.props.cartel_pattern as number) - (a.props.cartel_pattern as number)), [dzo, year, thr, session.login, session.purpose])
  const winner = (p: SpObject) => neighbors(session, p.id, { types: ['participated_in'] }).find(n => n.link.props?.winner)?.other
  const columns = useMemo<Column<SpObject>[]>(() => [
    { key: 'score', label: 'Картель', width: 90, render: r => <span className={`score ${(r.props.cartel_pattern as number) > 0.6 ? 'danger-text' : (r.props.cartel_pattern as number) > 0.4 ? 'warn-text' : ''}`}>{(r.props.cartel_pattern as number).toFixed(2)}</span>, sort: (a, b) => (a.props.cartel_pattern as number) - (b.props.cartel_pattern as number) },
    { key: 'obj', label: 'Закупка', width: 'minmax(150px, 1fr)', render: r => <ObjectChip o={r} noHover /> },
    { key: 'subj', label: 'Предмет', width: 'minmax(160px, 1.4fr)', render: r => <span className="truncate">{String(r.props.subject)}</span> },
    { key: 'dzo', label: 'ДЗО', width: 110, render: r => <span className="dim truncate">{getObject(r.subsidiary!)?.label}</span> },
    { key: 'pub', label: 'Дата', width: 90, render: r => <span className="mono dim">{String(r.props.published)}</span>, sort: (a, b) => String(a.props.published).localeCompare(String(b.props.published)) },
    { key: 'nmc', label: 'НМЦ', width: 130, align: 'right', render: r => { const v = viewProps(session, r).find(p => p.name === 'nmc')!; return v.masked ? <Masked inline markings={['FIN']} reason={v.reason} /> : <span className="mono">{formatProp(v.value, 'money')}</span> } },
    { key: 'bids', label: 'Заявок', width: 70, align: 'right', render: r => <span className="mono">{String(r.props.bids_count)}</span> },
    { key: 'disc', label: 'Снижение', width: 90, align: 'right', render: r => <span className="mono">{(r.props.winner_discount as number).toFixed(1)} %</span>, sort: (a, b) => (a.props.winner_discount as number) - (b.props.winner_discount as number) },
    { key: 'win', label: 'Победитель', width: 'minmax(140px, 1fr)', render: r => { const o = winner(r); return o ? <ObjectChip o={o} compact noHover /> : <span className="dim">—</span> } },
    { key: 'act', label: '', width: 120, render: r => { const o = winner(r); return o && !o.props.control_flag ? <button className="btn btn-xs" onClick={e => { e.stopPropagation(); openAction('flag_counterparty', o.id, { reason: 'Признаки картельного сговора' }) }} title={canExecute(session, 'flag_counterparty') ? '' : 'нет права — откроется предпросмотр'}><Gavel size={11} /> на контроль</button> : o?.props.control_flag ? <span className="pill" style={{ fontSize: 10 }}>на контроле</span> : null } },
  ], [session.login, session.purpose])
  const p = getObject(sel)
  const factors = useMemo(() => (p ? cartelFactors(session, p) : []), [sel, session.login, session.purpose])
  const graph = useMemo(() => {
    if (!p) return { nodes: [] as GNode[], links: [] as GLink[] }
    const parts = neighbors(session, p.id, { types: ['participated_in'] }).map(n => n.other.id)
    const t = traverse(session, [p.id, ...parts], 1, { types: ['participated_in', 'founder_of', 'director_of', 'awarded'], maxPerNode: 12 })
    const nodes: GNode[] = t.nodes.map(n => ({ id: n.id, label: n.label, type: n.type, color: TYPES[n.type].color, hidden: t.hidden.has(n.id), root: n.id === p.id, parent: n.id === p.id ? undefined : parts.includes(n.id) ? p.id : parts[0] }))
    const links: GLink[] = t.links.map(l => ({ id: l.id, from: l.from, to: l.to, confidence: l.confidence, type: l.type, label: LINK_BY_TYPE[l.type].label }))
    return { nodes, links }
  }, [sel, session.login, session.purpose])
  const dec = p ? decide(session, p.markings) : null
  return (
    <div className="screen proc">
      <div className="screen-h">
        <span className="screen-title">Антифрод закупок (223-ФЗ)</span>
        <select className="input" style={{ width: 150 }} value={dzo} onChange={e => setDzo(e.target.value)}><option value="">Все ДЗО</option>{(w.byType.get('Subsidiary') || []).map(d => <option key={d.id} value={d.id}>{d.label}</option>)}</select>
        <select className="input" style={{ width: 110 }} value={year} onChange={e => setYear(e.target.value)}><option value="">Все годы</option>{['2026', '2025', '2024'].map(y => <option key={y} value={y}>{y}</option>)}</select>
        <label className="row" style={{ gap: 6, fontSize: 12 }}>cartel_pattern ≥ <input type="range" min={0} max={0.9} step={0.05} value={thr} onChange={e => setThr(Number(e.target.value))} /><span className="mono">{thr.toFixed(2)}</span></label>
        <span className="dim mono" style={{ fontSize: 11 }}>{rows.length} закупок</span>
        <span className="grow" />
        {cmp.length === 2 && <button className="btn" onClick={() => setShowCmp(true)}><Columns3 size={13} /> Сравнить 2 закупки</button>}
      </div>
      <div className="screen-b">
        <div className="proc-table"><DataTable rows={rows} columns={columns} selected={sel} onSelect={r => { setSel(r.id); setHl(null); openObject(r.id) }} onOpen={r => openObject(r.id, { tab: true })} onExplain={r => openExplain(r.id, 'cartel_pattern')} rowClass={r => (cmp.includes(r.id) ? 'in-compare' : '')} footer={<><span>Shift+клик по строке — в сравнение (2)</span><span className="grow" /><span>функция cartel_pattern@1.0.0 · участники, связи учредителей, паттерны цен</span></>} />
          <div className="proc-cmp-catch" onClickCapture={e => { if (!(e as unknown as MouseEvent).shiftKey) return; const el = (e.target as HTMLElement).closest('.dt-row') as HTMLElement | null; if (!el) return; e.stopPropagation(); e.preventDefault(); const idx = Math.round(Number(el.style.top.replace('px', '')) / el.clientHeight); const r = rows[idx]; if (r) setCmp(c => (c.includes(r.id) ? c.filter(x => x !== r.id) : [...c, r.id].slice(-2))) }} /></div>
        <aside className="proc-side">
          {p && dec && !dec.allow && <PolicyDenied markings={p.markings} alternative={dec.alternativePurpose} />}
          {p && dec?.allow && <>
            <Panel title="Подграф участников" dense className="proc-graph"><ForceGraph nodes={graph.nodes} links={graph.links} selected={hl ? null : sel} onSelect={id => id && openObject(id)} onExpand={id => openObject(id, { tab: true })} pathNodes={hl ?? undefined} dimOthers={!!hl} theme={theme} mini /></Panel>
            <Panel title={`Explain факторов · cartel_pattern = ${(p.props.cartel_pattern as number).toFixed(2)}`} dense>
              <div className="col" style={{ padding: 8, gap: 8 }}>
                {factors.map((f, i) => <div role="button" tabIndex={0} key={f.label} className={`factor ${hl === f.objects ? 'active' : ''}`} style={{ animationDelay: `${i * 60}ms` }} onClick={() => setHl(hl === f.objects ? null : f.objects.length ? [...f.objects, p.id] : null)}><div className="row"><span className="grow">{f.label}</span><span className="mono">{f.value.toFixed(2)} / {f.weight.toFixed(2)}</span></div><div className="bar"><i style={{ width: `${(f.value / f.weight) * 100}%`, background: f.value / f.weight > 0.7 ? 'var(--sp-danger)' : f.value / f.weight > 0.3 ? 'var(--sp-warn)' : 'var(--sp-accent)' }} /></div>{f.objects.length > 0 && <div className="row" style={{ flexWrap: 'wrap', gap: 4, marginTop: 4 }}>{f.objects.slice(0, 4).map(id => <ObjectChip key={id} id={id} compact />)}</div>}</div>)}
                <div className="row"><button className="btn btn-xs" onClick={() => openExplain(p.id, 'cartel_pattern', true)}>Explain до строк ЕИС/ЕГРЮЛ</button><span className="grow" /><span className="dim" style={{ fontSize: 10 }}>клик по фактору подсвечивает подграф</span></div>
              </div>
            </Panel>
          </>}
        </aside>
      </div>
      {showCmp && <Modal title="Сравнение закупок" onClose={() => setShowCmp(false)} width={860}><div className="grid-2">{cmp.map(id => { const q = getObject(id)!; const fs = cartelFactors(session, q); return <div key={id} className="col"><ObjectChip o={q} /><div className="dim" style={{ fontSize: 12 }}>{String(q.props.subject)} · {String(q.props.published)}</div><div className="mono">cartel_pattern {(q.props.cartel_pattern as number).toFixed(2)}</div>{fs.map(f => <div key={f.label} style={{ fontSize: 12 }}><div className="row"><span className="grow">{f.label}</span><span className="mono">{f.value.toFixed(2)}</span></div><div className="bar"><i style={{ width: `${(f.value / f.weight) * 100}%` }} /></div></div>)}</div> })}</div></Modal>}
    </div>
  )
}

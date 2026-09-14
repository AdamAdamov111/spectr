// U10 Инспектор аудита: фильтры, события, подпись и хеши, inclusion proof в браузере (WebCrypto) с визуализацией Merkle-пути, отчёты.
import { useEffect, useMemo, useState } from 'react'
import { ShieldCheck, FileDown } from 'lucide-react'
import { audit, seedAudit, get as getObject, logRead, type AuditEvent } from '../data/api'
import { useStore, useSimulatedSession, reducedMotion } from '../app/store'
import { DataTable, type Column } from '../components/DataTable'
import { Panel, Stamp, Modal, ObjectChip, Empty } from '../components/ui'
import { PURPOSE_LABELS, POLICY_LOG } from '../data/security'
import { fmtDateTime } from '../data/rng'

export function AuditScreen() {
  const session = useSimulatedSession(); const openObject = useStore(s => s.openObject); const toast = useStore(s => s.toast)
  const [, force] = useState(0)
  useEffect(() => { void seedAudit().then(() => { force(x => x + 1); setSel(prev => prev ?? [...audit.events].reverse().find(e => e.batch != null && e.action === 'read') ?? null) }); return audit.subscribe(() => force(x => x + 1)) }, [])
  const [f, setF] = useState({ actor: '', object: '', purpose: '', action: '', outcome: '' })
  const [sel, setSel] = useState<AuditEvent | null>(null)
  const [report, setReport] = useState<string | null>(null)
  const rows = useMemo(() => audit.events.filter(e => (!f.actor || e.actor.includes(f.actor)) && (!f.object || e.resource_ids.some(id => id.includes(f.object)) || (e.resource_label || '').toLowerCase().includes(f.object.toLowerCase())) && (!f.purpose || e.purpose === f.purpose) && (!f.action || e.action.startsWith(f.action)) && (!f.outcome || e.outcome === f.outcome)).slice().reverse(), [f, audit.events.length, force])
  const columns = useMemo<Column<AuditEvent>[]>(() => [
    { key: 'ts', label: 'Время', width: 140, render: r => <span className="mono dim">{fmtDateTime(r.ts)}</span> },
    { key: 'actor', label: 'Субъект', width: 130, render: r => <span className={r.actorKind === 'service' ? 'dim' : ''}>{r.actor}</span> },
    { key: 'purpose', label: 'Цель', width: 150, render: r => <span className="dim truncate">{PURPOSE_LABELS[r.purpose] || r.purpose}</span> },
    { key: 'action', label: 'Действие', width: 170, render: r => <span className="mono truncate">{r.action}</span> },
    { key: 'res', label: 'Объект', width: 'minmax(160px, 1fr)', render: r => <span className="truncate">{r.resource_label || r.resource_ids.join(', ')}</span> },
    { key: 'out', label: 'Решение', width: 70, render: r => <span className={r.outcome === 'allow' ? 'ok-text' : 'danger-text'}>{r.outcome}</span> },
    { key: 'batch', label: 'Batch', width: 60, render: r => <span className="mono dim">{r.batch != null ? `#${r.batch}` : '…'}</span> },
  ], [])
  const purposes = [...new Set(audit.events.map(e => e.purpose))]
  return (
    <div className="screen audit">
      <div className="screen-h">
        <span className="screen-title">Инспектор аудита</span>
        <input className="input" style={{ width: 130 }} placeholder="субъект" value={f.actor} onChange={e => setF({ ...f, actor: e.target.value })} />
        <input className="input" style={{ width: 160 }} placeholder="объект (имя или id)" value={f.object} onChange={e => setF({ ...f, object: e.target.value })} />
        <select className="input" style={{ width: 150 }} value={f.purpose} onChange={e => setF({ ...f, purpose: e.target.value })}><option value="">все цели</option>{purposes.map(p => <option key={p} value={p}>{PURPOSE_LABELS[p] || p}</option>)}</select>
        <select className="input" style={{ width: 130 }} value={f.action} onChange={e => setF({ ...f, action: e.target.value })}><option value="">все действия</option>{['read', 'search', 'traverse', 'explain', 'export', 'copy', 'action', 'agent', 'login', 'policy'].map(a => <option key={a} value={a}>{a}</option>)}</select>
        <select className="input" style={{ width: 90 }} value={f.outcome} onChange={e => setF({ ...f, outcome: e.target.value })}><option value="">allow+deny</option><option value="allow">allow</option><option value="deny">deny</option></select>
        <span className="dim mono" style={{ fontSize: 11 }}>{rows.length} событий · {audit.batches.length} Merkle-корней</span>
        <span className="grow" />
        <div className="seg">{[['purposes', 'Доступ по целям'], ['pii', 'Доступ к PII'], ['export', 'Экспорт'], ['policies', 'Политики']].map(([k, l]) => <button key={k} onClick={() => { setReport(k); logRead(session, 'report', [], l) }}><FileDown size={11} /> {l}</button>)}</div>
      </div>
      <div className="screen-b">
        <div className="audit-table"><DataTable rows={rows} columns={columns} selected={sel?.id} onSelect={r => setSel(r)} onOpen={r => { const id = r.resource_ids[0]; if (id && getObject(id)) openObject(id, { tab: true }) }} footer={<><span>Реплика ClickHouse ← WORM MinIO Object Lock (compliance mode) · корни каждые {audit.batchSize} событий</span><span className="grow" /><span>«кто, что, зачем» за секунды</span></>} /></div>
        <aside className="audit-side">{sel ? <EventDetail ev={sel} key={sel.id} /> : <Empty text="Выберите событие: подпись, хеш-цепочка и inclusion proof в Merkle-корне" />}</aside>
      </div>
      {report && <Modal title={`Отчёт: ${{ purposes: 'Доступ по целям', pii: 'Доступ к персональным данным', export: 'Экспорт данных', policies: 'Изменения политик' }[report]}`} onClose={() => setReport(null)} width={800}><Report kind={report} /><div className="row" style={{ marginTop: 10 }}><button className="btn" onClick={() => { toast({ text: 'Отчёт выгружен с водяным знаком и зарегистрирован в аудите (событие export)', kind: 'info' }); logRead(session, 'export', [], `report:${report}`, 'allow', 'xlsx, водяной знак'); setReport(null) }}>Выгрузить с водяным знаком</button></div></Modal>}
    </div>
  )
}

function EventDetail({ ev }: { ev: AuditEvent }) {
  const [lit, setLit] = useState(-1); const [result, setResult] = useState<{ ok: boolean; computedRoot: string } | null>(null); const [running, setRunning] = useState(false)
  const [tamper, setTamper] = useState(audit.tampered)
  const proof = audit.proofFor(ev)
  const rm = reducedMotion()
  const verify = async () => {
    setRunning(true); setResult(null); setLit(-1)
    const r = await audit.verify(ev, async (level) => { setLit(level); if (!rm) await new Promise(res => setTimeout(res, 80)) })
    setResult({ ok: r.ok, computedRoot: r.computedRoot }); setRunning(false)
  }
  const levels = proof ? proof.batch.tree.length : 0
  return (
    <div className="col" style={{ padding: 10, gap: 10, overflow: 'auto', height: '100%' }}>
      <div className="row"><ShieldCheck size={16} className="accent" /><b>{ev.id}</b><span className="grow" /><span className={ev.outcome === 'allow' ? 'ok-text' : 'danger-text'}>{ev.outcome}</span></div>
      <table className="kv"><tbody>
        <tr><td className="dim">время</td><td className="mono">{new Date(ev.ts).toISOString()}</td></tr>
        <tr><td className="dim">субъект</td><td className="mono">{ev.actor} ({ev.actorKind})</td></tr>
        <tr><td className="dim">цель</td><td className="mono">{ev.purpose}</td></tr>
        <tr><td className="dim">действие</td><td className="mono">{ev.action}</td></tr>
        <tr><td className="dim">объекты</td><td>{ev.resource_ids.slice(0, 3).map(id => getObject(id) ? <ObjectChip key={id} id={id} compact /> : <span key={id} className="mono">{id}</span>)}{ev.resource_ids.length > 3 && <span className="dim"> +{ev.resource_ids.length - 3}</span>}</td></tr>
        <tr><td className="dim">решение PDP</td><td className="mono">{ev.policy_decision_id}</td></tr>
        {ev.detail && <tr><td className="dim">детали</td><td className="mono" style={{ wordBreak: 'break-all' }}>{ev.detail}</td></tr>}
        <tr><td className="dim">request_hash</td><td className="mono hash">{ev.request_hash}</td></tr>
        <tr><td className="dim">response_digest</td><td className="mono hash">{ev.response_digest}</td></tr>
        <tr><td className="dim">prev_hash</td><td className="mono hash">{ev.prev_hash.slice(0, 32)}…</td></tr>
        <tr><td className="dim">hash</td><td className="mono hash">{ev.hash.slice(0, 32)}…</td></tr>
        <tr><td className="dim">подпись</td><td className="mono hash">{ev.signature}</td></tr>
        <tr><td className="dim">Merkle batch</td><td className="mono">{ev.batch != null ? `#${ev.batch} · корень ${proof?.batch.root.slice(0, 16)}… · якорь ${proof?.batch.anchor.split('/').pop()}` : 'ещё не запечатан (следующий корень через ≤ 16 событий)'}</td></tr>
      </tbody></table>
      <div className="row"><button className="btn btn-primary" disabled={!proof || running} onClick={verify}>Проверить inclusion proof</button><label className="check"><input type="checkbox" checked={tamper} onChange={e => { audit.tampered = e.target.checked; setTamper(e.target.checked); setResult(null) }} /> имитировать подмену записи</label></div>
      {proof && <div className="merkle">
        {Array.from({ length: levels }).map((_, li) => { const level = levels - 1 - li; const layer = proof.batch.tree[level]; return <div key={level} className="merkle-row">{layer.map((h, i) => { const onPath = level === 0 ? i === proof.leafIndex : Math.floor(proof.leafIndex / Math.pow(2, level)) === i; const isSib = level < levels - 1 && !onPath && Math.floor(i / 2) === Math.floor(Math.floor(proof.leafIndex / Math.pow(2, level)) / 2); const on = onPath && lit >= level; return <span key={i} className={`merkle-node ${onPath ? 'path' : ''} ${isSib ? 'sib' : ''} ${on ? 'lit' : ''} ${level === levels - 1 ? 'root' : ''}`} title={h}>{level === levels - 1 ? 'ROOT' : h.slice(0, 4)}</span> })}</div> })}
        {result && <div className="row" style={{ marginTop: 8 }}>{result.ok ? <Stamp text="Подтверждено" tone="ok" big /> : <span className="shake"><Stamp text="Нарушение" tone="danger" big /></span>}<span className="dim mono" style={{ fontSize: 10 }}>computed {result.computedRoot.slice(0, 16)}… {result.ok ? '=' : '≠'} anchored {proof.batch.root.slice(0, 16)}…</span></div>}
        <div className="dim" style={{ fontSize: 11, marginTop: 6 }}>Проверка выполнена в браузере через WebCrypto SHA-256: лист = H(prev_hash ‖ событие), путь O(log n) до подписанного корня, корень сверен с якорем WORM.</div>
      </div>}
    </div>
  )
}

function Report({ kind }: { kind: string }) {
  const evs = audit.events
  if (kind === 'policies') return <table className="xw"><thead><tr><th>Дата</th><th>Политика</th><th>Автор</th><th>Суть</th><th>Подпись</th><th>Тесты</th></tr></thead><tbody>{POLICY_LOG.map(p => <tr key={p.id}><td className="mono dim">{p.ts}</td><td className="mono">{p.name}</td><td>{p.author}</td><td>{p.summary}</td><td className="ok-text">{p.signature}</td><td className="mono">{p.tests}</td></tr>)}</tbody></table>
  if (kind === 'export') { const rows = evs.filter(e => e.action === 'export'); return <table className="xw"><thead><tr><th>Время</th><th>Кто</th><th>Цель</th><th>Что</th><th>Детали</th></tr></thead><tbody>{rows.map(e => <tr key={e.id}><td className="mono dim">{fmtDateTime(e.ts)}</td><td>{e.actor}</td><td>{PURPOSE_LABELS[e.purpose] || e.purpose}</td><td>{e.resource_label}</td><td className="dim">{e.detail}</td></tr>)}{!rows.length && <tr><td colSpan={5} className="dim">экспортов не было</td></tr>}</tbody></table> }
  if (kind === 'pii') { const rows = evs.filter(e => e.resource_ids.some(id => id.startsWith('per_') || id.startsWith('emp_'))); return <table className="xw"><thead><tr><th>Время</th><th>Кто</th><th>Цель</th><th>Объект PII</th><th>Решение</th></tr></thead><tbody>{rows.map(e => <tr key={e.id}><td className="mono dim">{fmtDateTime(e.ts)}</td><td>{e.actor}</td><td>{PURPOSE_LABELS[e.purpose] || e.purpose}</td><td>{e.resource_label}</td><td className={e.outcome === 'allow' ? 'ok-text' : 'danger-text'}>{e.outcome}</td></tr>)}</tbody></table> }
  const byP = new Map<string, { allow: number; deny: number; actors: Set<string> }>()
  for (const e of evs) { const x = byP.get(e.purpose) || { allow: 0, deny: 0, actors: new Set() }; x[e.outcome]++; x.actors.add(e.actor); byP.set(e.purpose, x) }
  return <table className="xw"><thead><tr><th>Цель</th><th>Разрешено</th><th>Отказано</th><th>Субъектов</th></tr></thead><tbody>{[...byP].map(([p, x]) => <tr key={p}><td>{PURPOSE_LABELS[p] || p}</td><td className="mono ok-text">{x.allow}</td><td className="mono danger-text">{x.deny}</td><td className="mono">{x.actors.size}</td></tr>)}</tbody></table>
}

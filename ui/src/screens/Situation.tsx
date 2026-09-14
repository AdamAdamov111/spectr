// U2 Ситуационный центр: карта 60 %, KPI, свежесть источников, лента, действия, таймлайн 24 ч.
import { useEffect, useMemo, useState } from 'react'
import { Siren, Wrench, Gavel } from 'lucide-react'
import { MapCanvas, DEFAULT_LAYERS, type MapMarker } from '../map/MapCanvas'
import { world, kpis, get as getObject, neighbors, subscribeEvents, typeFreshness } from '../data/api'
import { useStore, useSimulatedSession } from '../app/store'
import { CountUp, Panel, ObjectChip } from '../components/ui'
import { Sparkline } from '../components/Sparkline'
import { Rng, hash32 } from '../data/rng'
import { canSee } from '../data/security'
import { fmtAgo, fmtTime } from '../data/rng'
import { TYPES } from '../data/ontology'

export function useMarkers(session: ReturnType<typeof useSimulatedSession>, tickKey: number): MapMarker[] {
  return useMemo(() => {
    const w = world(); const out: MapMarker[] = []
    const push = (m: MapMarker) => out.push(m)
    for (const f of w.byType.get('Field') || []) if (f.geo) push({ id: f.id, kind: 'field', x: f.geo[0], y: f.geo[1], label: f.label })
    for (const p of w.byType.get('WellPad') || []) if (p.geo) push({ id: p.id, kind: 'pad', x: p.geo[0], y: p.geo[1], label: p.label })
    for (const wl of w.byType.get('Well') || []) if (wl.geo && canSee(session, wl)) push({ id: wl.id, kind: 'well', x: wl.geo[0], y: wl.geo[1], label: wl.label, status: wl.props.status as string, value: wl.props.trend_30d as number })
    for (const n of w.byType.get('PumpStation') || []) if (n.geo) push({ id: n.id, kind: 'nps', x: n.geo[0], y: n.geo[1], label: n.label, score: n.props.pressure_anomaly_score as number })
    for (const t of w.byType.get('Tank') || []) if (t.geo) push({ id: t.id, kind: 'tank', x: t.geo[0], y: t.geo[1], label: t.label, value: canSee(session, t) ? (t.props.level as number) : undefined })
    for (const v of w.byType.get('Vehicle') || []) if (v.geo) push({ id: v.id, kind: 'vehicle', x: v.geo[0], y: v.geo[1], label: v.label })
    for (const a of w.byType.get('Anomaly') || []) { if (a.id === w.named.anomalyNps2) continue; if ((a.props.score as number) < 0.7) continue; const host = neighbors(session, a.id, { types: ['detected_on'] }).map(x => x.other).find(x => x.geo); if (host?.geo) push({ id: a.id, kind: 'anomaly', x: host.geo[0] + 3, y: host.geo[1] - 3, label: a.label, score: a.props.score as number, ts: a.created }) }
    for (const i of w.byType.get('Incident') || []) { if (i.props.status === 'закрыт' || !canSee(session, i)) continue; const host = neighbors(session, i.id, { types: ['occurred_at'] }).map(x => x.other).find(x => x.geo); if (host?.geo) push({ id: i.id, kind: 'incident', x: host.geo[0] - 6, y: host.geo[1] + 6, label: i.label, ts: i.created }) }
    // contractor risk heat: attach risk to NPS/tanks by their contractors (approximate)
    return out
  }, [session.login, session.purpose, tickKey])
}

export function Situation() {
  const session = useSimulatedSession()
  const openObject = useStore(s => s.openObject); const openScreen = useStore(s => s.openScreen); const openAction = useStore(s => s.openAction); const inspect = useStore(s => s.inspect)
  const flyDone = useStore(s => s.flyDone); const setFlyDone = useStore(s => s.setFlyDone)
  const ambient = useStore(s => s.settings.ambient); const theme = useStore(s => s.settings.theme)
  const chaos = useStore(s => s.chaos)
  const [tickKey, setTick] = useState(0)
  const [offset, setOffset] = useState(0)
  const [hover, setHover] = useState<string | null>(null)
  const selected = useStore(s => s.inspector.objectId)
  useEffect(() => { const id = setInterval(() => setTick(x => x + 1), 5000); return () => clearInterval(id) }, [])
  useEffect(() => { if (!flyDone) setFlyDone() }, [])
  useEffect(() => subscribeEvents(() => setTick(x => x + 1)), [])
  const markers = useMarkers(session, tickKey)
  const k = useMemo(() => kpis(session), [tickKey, session.login])
  const w = world(); const n = w.named
  const events = w.events.slice(0, 14)
  const fresh = typeFreshness().filter(f => f.sloSec <= 3600).slice(0, 9)
  return (
    <div className="screen situation">
      <div className="situ-map">
        <MapCanvas markers={markers} pipelines={w.pipelines} layers={DEFAULT_LAYERS} selected={selected} hover={hover} onHover={setHover} onSelect={id => id && openObject(id)} onLasso={ids => inspect({ open: true, mode: 'summary', summaryIds: ids })} ambient={ambient} intro={!flyDone} theme={theme} timeOffsetH={offset} staleLayer={chaos.sapStale ? { kind: 'well', text: 'Источник SAP-реплика молчит 14 мин (SLO 15 мин) — слой скважин устарел' } : null} />
        <div className="map-legend legend"><span><i style={{ background: '#a78bfa' }} />скважины</span><span><i style={{ background: '#22d3ee' }} />НПС / резервуары</span><span><i style={{ background: '#ef4444' }} />аномалии / инциденты</span><span><i style={{ background: '#93a1b0' }} />техника</span><span className="dim">Shift+drag — лассо · колесо — масштаб</span></div>
        <div className="timeline">
          <span className="mono dim" style={{ fontSize: 10 }}>−24 ч</span>
          <input type="range" min={0} max={24} value={24 - offset} onChange={e => setOffset(24 - Number(e.target.value))} aria-label="Таймлайн 24 часа" />
          <span className="mono" style={{ fontSize: 10, color: offset ? 'var(--sp-warn)' : 'var(--sp-text-2)' }}>{offset ? `−${offset} ч` : 'сейчас'}</span>
        </div>
      </div>
      <div className="situ-side">
        <div className="kpi-grid">
          <Kpi label="Добыча" v={k.debit} d={0} unit="т/сут" sub={`${k.wells} из ${k.wellsTotal} скважин в работе`} delta={-1.8} spark="debit" onClick={() => openScreen('search')} />
          <Kpi label="Транспорт" v={k.flow} unit="м³/ч" sub="суммарный расход МН" tone="accent" delta={0.6} spark="flow" onClick={() => openObject(n.nps2)} />
          <Kpi label="Инциденты" v={k.incidents} sub="открытых, 2 на НПС-2" tone={k.incidents ? 'danger' : 'ok'} delta={1} deltaAbs spark="inc" onClick={() => openObject(n.incidentNps2[0])} />
          <Kpi label="Аномалии" v={k.anomalies} sub="score > 0.6 за 30 дн" tone="warn" delta={3} deltaAbs spark="anom" onClick={() => openObject(n.anomalyNps2)} />
          <Kpi label="ТОиР: открыто" v={k.openOrders} sub={`${k.critical} ед. с индексом < 0.4`} delta={-2.4} spark="toir" onClick={() => openScreen('toir')} />
          <Kpi label="Закупки: риск" v={k.cartel} sub="cartel_pattern > 0.5" tone="warn" delta={2} deltaAbs spark="cartel" onClick={() => openScreen('procurement')} />
        </div>
        <Panel title="Свежесть источников" dense className="situ-fresh">
          <div className="fresh-list">{fresh.map(f => <div key={f.type} className="fresh-row"><span className={`fresh fresh-${f.status}`}><span className="fresh-dot" /></span><span className="grow">{f.label}</span><span className="mono dim" style={{ fontSize: 11 }}>{fmtAgo(f.lagSec)} / {fmtAgo(f.sloSec)}</span></div>)}{chaos.sapStale && <div className="fresh-row" style={{ color: 'var(--sp-danger)' }}><span className="fresh fresh-stale"><span className="fresh-dot" /></span><span className="grow">SAP-реплика (скважины)</span><span className="mono" style={{ fontSize: 11 }}>14 мин / 15 мин</span></div>}</div>
        </Panel>
        <Panel title="Действия" dense>
          <div className="col" style={{ padding: 8, gap: 6 }}>
            <button className="btn" onClick={() => openAction('open_incident', n.nps2)}><Siren size={13} /> Открыть инцидент · НПС-2</button>
            <button className="btn" onClick={() => openAction('create_maintenance_order', n.pump104)}><Wrench size={13} /> Создать заявку ТОиР · Насос-104</button>
            <button className="btn" onClick={() => openAction('flag_counterparty', n.vektor)}><Gavel size={13} /> Поставить на контроль · ООО «Вектор»</button>
            <div className="row" style={{ marginTop: 4, gap: 6 }}><span className="dim" style={{ fontSize: 11 }}>сценарий:</span><ObjectChip id={n.nps2} compact /><span className="dim">→</span><ObjectChip id={n.pump104} compact /><span className="dim">→</span><ObjectChip id={n.vektor} compact /></div>
          </div>
        </Panel>
        <Panel title="Лента событий" dense className="situ-events">
          <div className="ev-list">{events.map((e, i) => <div key={e.id} className="ev-row" style={{ animationDelay: `${i * 20}ms` }} onClick={() => e.objectId && openObject(e.objectId)}><i className={`ev-dot ev-${e.kind}`} /><span className="mono dim" style={{ fontSize: 10 }}>{fmtTime(e.ts)}</span><span className="truncate">{e.text}</span></div>)}</div>
        </Panel>
      </div>
      {hover && (() => { const o = getObject(hover); return o ? <div className="map-tip">{TYPES[o.type].label} · <b>{o.label}</b></div> : null })()}
    </div>
  )
}

const TONE_COLOR = { danger: '#ef4444', warn: '#f59e0b', ok: '#22c55e', accent: '#22d3ee', default: '#93a1b0' }
function sparkData(key: string, v: number, trend: number): number[] { const r = new Rng(hash32(key)); const out: number[] = []; let x = v * (1 - trend / 100 * 1.2); for (let i = 0; i < 16; i++) { x = x * (1 + r.gauss(0, 0.02)) + (v - x) * 0.12; out.push(x) } out.push(v); return out }
function Kpi({ label, v, d = 0, unit, sub, tone, onClick, delta, deltaAbs, spark }: { label: string; v: number; d?: number; unit?: string; sub?: string; tone?: 'danger' | 'warn' | 'ok' | 'accent'; onClick?: () => void; delta?: number; deltaAbs?: boolean; spark?: string }) {
  const color = TONE_COLOR[tone || 'default']
  return <button className={`kpi shine ${tone || ''}`} onClick={onClick} style={{ textAlign: 'left' }}>
    <span className="kpi-l">{label}{delta != null && <span className={`delta ${delta > 0 ? (tone === 'danger' || tone === 'warn' ? 'down' : 'up') : delta < 0 ? (tone === 'danger' || tone === 'warn' ? 'up' : 'down') : 'flat'}`}>{delta > 0 ? '▲' : delta < 0 ? '▼' : '•'} {deltaAbs ? Math.abs(delta) : `${Math.abs(delta).toFixed(1)}%`}</span>}</span>
    <span className="kpi-v"><CountUp value={v} decimals={d} />{unit && <small>{unit}</small>}</span>
    {sub && <span className="kpi-s">{sub}</span>}
    {spark && <span className="kpi-spark"><Sparkline data={sparkData(spark, v, delta || 0)} color={color} /></span>}
  </button>
}

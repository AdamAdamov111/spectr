// U2 Ситуационный центр: карта 60 %, KPI, свежесть источников, лента, действия, таймлайн 24 ч.
import { useEffect, useMemo, useState } from 'react'
import { Siren, Wrench, Gavel } from 'lucide-react'
import { MapCanvas, DEFAULT_LAYERS, type MapMarker } from '../map/MapCanvas'
import { world, kpis, get as getObject, neighbors, subscribeEvents, typeFreshness } from '../data/api'
import { useStore, useSimulatedSession } from '../app/store'
import { CountUp, Panel, ObjectChip } from '../components/ui'
import { canSee } from '../data/security'
import { fmtAgo, fmtTime } from '../data/rng'
import { TYPES } from '../data/ontology'

export function useMarkers(session: ReturnType<typeof useSimulatedSession>, tickKey: number): MapMarker[] {
  return useMemo(() => {
    const w = world(); const d = w.domain; const out: MapMarker[] = []
    const push = (m: MapMarker) => out.push(m)
    const isHub = (o: { type: string; props: Record<string, unknown> }) => o.type === 'PumpStation' || (o.type === 'Substation' && o.props.voltage_kv === 220)
    const isDist = (o: { type: string; props: Record<string, unknown> }) => o.type === 'Tank' || (o.type === 'Substation' && o.props.voltage_kv === 110)
    const isPad = (o: { type: string; props: Record<string, unknown> }) => o.type === 'WellPad' || (o.type === 'Substation' && o.props.voltage_kv === 35)
    for (const f of w.byType.get(d.areaType) || []) if (f.geo) push({ id: f.id, kind: 'field', x: f.geo[0], y: f.geo[1], label: f.label, size: d.key === 'oilgas' ? 2.5 + Math.sqrt((f.props.production_ktd as number) || 4) * 1.1 : 6, major: !!f.props._major })
    for (const r of w.byType.get('Refinery') || []) if (r.geo) push({ id: r.id, kind: 'refinery', x: r.geo[0], y: r.geo[1], label: r.label, value: r.props.load_pct as number })
    for (const t of w.byType.get('Terminal') || []) if (t.geo && canSee(session, t)) push({ id: t.id, kind: 'terminal', x: t.geo[0], y: t.geo[1], label: String(t.props.name).replace('Порт ', ''), major: t.props.kind === 'морской терминал' })
    for (const t of [...(w.byType.get('WellPad') || []), ...(w.byType.get('Substation') || [])]) if (t.geo && isPad(t)) push({ id: t.id, kind: 'pad', x: t.geo[0], y: t.geo[1], label: t.label })
    for (const wl of w.byType.get(d.unitType) || []) if (wl.geo && canSee(session, wl)) push({ id: wl.id, kind: 'well', x: wl.geo[0], y: wl.geo[1], label: wl.label, status: wl.props.status === 'в работе' || wl.props.status === 'под нагрузкой' ? 'в работе' : String(wl.props.status), value: d.key === 'energy' ? -(wl.props.trend_30d as number) : (wl.props.trend_30d as number) })
    for (const n of [...(w.byType.get('PumpStation') || []), ...(w.byType.get('Substation') || [])]) if (n.geo && isHub(n)) push({ id: n.id, kind: 'nps', x: n.geo[0], y: n.geo[1], label: String(n.props.code).replace(/^НПС · /, ''), score: n.props[d.focusProp] as number })
    for (const t of [...(w.byType.get('Tank') || []), ...(w.byType.get('Substation') || [])]) if (t.geo && isDist(t)) push({ id: t.id, kind: 'tank', x: t.geo[0], y: t.geo[1], label: t.label, value: canSee(session, t) ? ((t.props.level ?? t.props.load_pct) as number) : undefined })
    for (const v of w.byType.get('Vehicle') || []) if (v.geo) push({ id: v.id, kind: 'vehicle', x: v.geo[0], y: v.geo[1], label: v.label })
    for (const a of w.byType.get('Anomaly') || []) { if (a.id === w.named.focusAnomaly) continue; if ((a.props.score as number) < 0.7) continue; const host = neighbors(session, a.id, { types: ['detected_on'] }).map(x => x.other).find(x => x.geo); if (host?.geo) push({ id: a.id, kind: 'anomaly', x: host.geo[0] + 3, y: host.geo[1] - 3, label: a.label, score: a.props.score as number, ts: a.created }) }
    for (const i of w.byType.get('Incident') || []) { if (i.props.status === 'закрыт' || !canSee(session, i)) continue; const host = neighbors(session, i.id, { types: ['occurred_at'] }).map(x => x.other).find(x => x.geo); if (host?.geo) push({ id: i.id, kind: 'incident', x: host.geo[0] - 6, y: host.geo[1] + 6, label: i.label, ts: i.created }) }
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
  void getObject
  const w = world(); const n = w.named
  const events = w.events.slice(0, 14)
  const fresh = typeFreshness().filter(f => f.sloSec <= 3600).slice(0, 9)
  return (
    <div className="screen situation">
      <div className="situ-map">
        <MapCanvas markers={markers} pipelines={w.pipelines} basemap={w.basemap} home={w.home} layers={DEFAULT_LAYERS} selected={selected} hover={hover} onHover={setHover} onSelect={id => id && openObject(id)} onLasso={ids => inspect({ open: true, mode: 'summary', summaryIds: ids })} ambient={ambient} intro={!flyDone} theme={theme} timeOffsetH={offset} staleLayer={chaos.sapStale ? { kind: 'well', text: 'Источник SAP-реплика молчит 14 мин (SLO 15 мин) — слой скважин устарел' } : null} />
        <div className="map-legend legend">{w.domain.legend.map(l => <span key={l.label}><i style={{ background: l.color }} />{l.label}</span>)}</div>
        <div className="timeline">
          <span className="mono dim" style={{ fontSize: 10 }}>−24 ч</span>
          <input type="range" min={0} max={24} value={24 - offset} onChange={e => setOffset(24 - Number(e.target.value))} aria-label="Таймлайн 24 часа" />
          <span className="mono" style={{ fontSize: 10, color: offset ? 'var(--sp-warn)' : 'var(--sp-text-2)' }}>{offset ? `−${offset} ч` : 'сейчас'}</span>
        </div>
      </div>
      <div className="situ-side">
        <div className="kpi-grid">
          {k.cards.map(c => <Kpi key={c.key} label={c.label} v={c.value} d={c.decimals || 0} unit={c.unit} sub={c.sub} tone={c.tone} delta={c.delta} deltaAbs={c.deltaAbs} onClick={() => { if (c.target?.object) openObject(c.target.object); else if (c.target?.screen) openScreen(c.target.screen as never) }} />)}
        </div>
        <Panel title="Свежесть данных" dense className="situ-fresh">
          <div className="fresh-list">{fresh.map(f => <div key={f.type} className="fresh-row"><span className={`fresh fresh-${f.status}`}><span className="fresh-dot" /></span><span className="grow">{f.label}</span><span className="mono dim" style={{ fontSize: 11 }}>{fmtAgo(f.lagSec)} / {fmtAgo(f.sloSec)}</span></div>)}{chaos.sapStale && <div className="fresh-row" style={{ color: 'var(--sp-danger)' }}><span className="fresh fresh-stale"><span className="fresh-dot" /></span><span className="grow">SAP-реплика (скважины)</span><span className="mono" style={{ fontSize: 11 }}>14 мин / 15 мин</span></div>}</div>
        </Panel>
        <Panel title="Действия" dense>
          <div className="col" style={{ padding: 8, gap: 6 }}>
            <button className="btn" onClick={() => openAction('open_incident', n.focusAsset)}><Siren size={13} /> Открыть инцидент · {String(getObject(n.focusAsset)?.props.code)}</button>
            <button className="btn" onClick={() => openAction('create_maintenance_order', n.focusEquipment)}><Wrench size={13} /> Создать заявку ТОиР · {getObject(n.focusEquipment)?.label}</button>
            <button className="btn" onClick={() => openAction('flag_counterparty', n.focusOrg)}><Gavel size={13} /> Поставить на контроль · {getObject(n.focusOrg)?.label}</button>
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

const TONE_COLOR = { danger: '#e76a6e', warn: '#ec9a3c', ok: '#32a467', accent: '#4c90f0', default: '#abb3bf' }
function Kpi({ label, v, d = 0, unit, sub, tone, onClick, delta, deltaAbs }: { label: string; v: number; d?: number; unit?: string; sub?: string; tone?: 'danger' | 'warn' | 'ok' | 'accent'; onClick?: () => void; delta?: number; deltaAbs?: boolean }) {
  void TONE_COLOR
  return <button className={`kpi shine ${tone || ''}`} onClick={onClick} style={{ textAlign: 'left' }}>
    <span className="kpi-l">{label}{delta != null && <span className={`delta ${delta > 0 ? (tone === 'danger' || tone === 'warn' ? 'down' : 'up') : delta < 0 ? (tone === 'danger' || tone === 'warn' ? 'up' : 'down') : 'flat'}`}>{delta > 0 ? '▲' : delta < 0 ? '▼' : '•'} {deltaAbs ? Math.abs(delta) : `${Math.abs(delta).toFixed(1)}%`}</span>}</span>
    <span className="kpi-v"><CountUp value={v} decimals={d} />{unit && <small>{unit}</small>}</span>
    {sub && <span className="kpi-s">{sub}</span>}
  </button>
}

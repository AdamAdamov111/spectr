// /wall — видеостена ситуационного центра (8.13): карта 2/3, KPI и лента, ротация панелей 45 с, инцидент останавливает ротацию.
import { useEffect, useMemo, useState } from 'react'
import { MapCanvas, DEFAULT_LAYERS } from '../map/MapCanvas'
import { world, kpis, typeFreshness, subscribeEvents } from '../data/api'
import { useMarkers } from './Situation'
import { CountUp } from '../components/ui'
import { ONTOLOGY_VERSION } from '../data/ontology'
import type { Session } from '../data/types'
import { fmtAgo, fmtTime, pad } from '../data/rng'
import './wall.css'

const WALL_SESSION: Session = { login: 'svc:situation_wall', name: 'Видеостена СЦ', role: 'wall', roleLabel: 'сервисная цель', clearance: { level: 'INTERNAL', categories: [] }, purposes: ['situation_wall'], purpose: 'situation_wall' }

export function Wall() {
  const [tickKey, setTick] = useState(0); const [panel, setPanel] = useState(0); const [incident, setIncident] = useState<string | null>(null); const [clock, setClock] = useState(new Date())
  useEffect(() => { document.documentElement.dataset.theme = 'dark'; const id = setInterval(() => { setTick(x => x + 1); setClock(new Date()) }, 1000); return () => clearInterval(id) }, [])
  useEffect(() => { if (incident) return; const id = setInterval(() => setPanel(p => (p + 1) % 3), 45000); return () => clearInterval(id) }, [incident])
  useEffect(() => subscribeEvents(() => { const e = world().events[0]; if (e && (e.kind === 'incident' || (e.kind === 'anomaly' && e.objectId === world().named.focusAsset))) { setIncident(e.text); setTimeout(() => setIncident(null), 20000) } }), [])
  const markers = useMarkers(WALL_SESSION, Math.floor(tickKey / 5))
  const w = world(); const k = useMemo(() => kpis(WALL_SESSION), [Math.floor(tickKey / 5)])
  const fresh = typeFreshness().filter(f => f.sloSec <= 3600)
  const events = w.events.slice(0, 12)
  const incidents = (w.byType.get('Incident') || []).filter(i => i.props.status !== 'закрыт').slice(0, 6)
  return (
    <div className="wall">
      <div className="wall-map"><MapCanvas markers={markers} pipelines={w.pipelines} basemap={w.basemap} home={w.home} layers={{ ...DEFAULT_LAYERS }} onSelect={() => {}} ambient theme="dark" wall />
        <div className="wall-corner"><span className="mono">{pad(clock.getHours())}:{pad(clock.getMinutes())}:{pad(clock.getSeconds())}</span><span className="dim">{w.domain.holding} · СЦ · онтология v{ONTOLOGY_VERSION} · цель situation_wall · INTERNAL</span></div>
      </div>
      <div className="wall-side">
        {incident ? <div className="wall-incident fade-in"><div className="wall-incident-h">ИНЦИДЕНТ</div><div className="wall-incident-t">{incident}</div><div className="dim">ротация панелей остановлена</div></div> : (
          <div className="wall-panel fade-in" key={panel}>
            {panel === 0 && <><div className="wall-h">Ключевые показатели</div><div className="wall-kpis">
              {k.cards.map(c => <div key={c.key} className={`wall-kpi ${c.tone || ''}`}><span>{c.label}</span><b><CountUp value={c.value} decimals={c.decimals || 0} /> {c.unit && <small>{c.unit}</small>}</b></div>)}
            </div></>}
            {panel === 1 && <><div className="wall-h">Свежесть источников</div><div className="wall-list">{fresh.map(f => <div key={f.type} className="wall-row"><span className={`fresh fresh-${f.status}`}><span className="fresh-dot" /></span><span className="grow">{f.label}</span><span className="mono">{fmtAgo(f.lagSec)} / {fmtAgo(f.sloSec)}</span></div>)}</div></>}
            {panel === 2 && <><div className="wall-h">Открытые инциденты</div><div className="wall-list">{incidents.map(i => <div key={i.id} className="wall-row"><i className="ev-dot ev-incident" /><span className="grow">{i.label} · {String(i.props.class)}</span><span className="mono dim">{String(i.props.date).slice(0, 10)}</span></div>)}</div></>}
          </div>
        )}
        <div className="wall-feed"><div className="wall-h">Лента событий</div>{events.map(e => <div key={e.id} className="wall-row"><i className={`ev-dot ev-${e.kind}`} /><span className="mono dim">{fmtTime(e.ts)}</span><span className="truncate">{e.text}</span></div>)}</div>
        <a className="wall-exit" href="#/s/situation">выход из режима видеостены</a>
      </div>
    </div>
  )
}

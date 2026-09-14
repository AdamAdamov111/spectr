// Карта активов: слои (8.9), поиск актива, таймлайн, лассо, flyTo к объекту из любого экрана.
import { useEffect, useMemo, useState } from 'react'
import { Layers } from 'lucide-react'
import { MapCanvas, DEFAULT_LAYERS, type MapLayers } from '../map/MapCanvas'
import { world, get as getObject, quickSearch, neighbors } from '../data/api'
import { useStore, useSimulatedSession } from '../app/store'
import { useMarkers } from './Situation'
import { ObjectChip, Panel } from '../components/ui'
import { TYPES } from '../data/ontology'

export function MapScreen() {
  const session = useSimulatedSession()
  const openObject = useStore(s => s.openObject); const inspect = useStore(s => s.inspect)
  const ambient = useStore(s => s.settings.ambient); const theme = useStore(s => s.settings.theme); const chaos = useStore(s => s.chaos)
  const mapFocus = useStore(s => s.mapFocus)
  const selected = useStore(s => s.inspector.objectId)
  const [layers, setLayers] = useState<MapLayers>({ ...DEFAULT_LAYERS })
  const [tickKey, setTick] = useState(0); const [offset, setOffset] = useState(0); const [q, setQ] = useState(''); const [hover, setHover] = useState<string | null>(null)
  const [fly, setFly] = useState<{ x: number; y: number; zoom: number; key: number } | null>(null)
  useEffect(() => { const id = setInterval(() => setTick(x => x + 1), 5000); return () => clearInterval(id) }, [])
  const markers = useMarkers(session, tickKey)
  const riskMarkers = useMemo(() => { const w = world(); const out = markers.slice(); for (const n of (w.byType.get(w.domain.hubType) || []).filter(x => x.type !== 'Substation' || x.props.voltage_kv === 220)) { let risk = 0; for (const e of neighbors(session, n.id, { types: ['has_equipment'] }).slice(0, 40)) for (const mo of neighbors(session, e.other.id, { types: ['maintains'] }).slice(0, 3)) for (const p of neighbors(session, mo.other.id, { types: ['performed_by'] })) risk = Math.max(risk, (p.other.props.risk_score as number) || 0); const m = out.find(x => x.id === n.id); if (m) m.risk = risk } return out }, [markers])
  useEffect(() => { if (!mapFocus) return; const o = getObject(mapFocus.id); if (o?.geo) setFly({ x: o.geo[0], y: o.geo[1], zoom: 3.2, key: mapFocus.key }) }, [mapFocus])
  const w = world()
  const found = q.length >= 2 ? quickSearch(session, q, 8).filter(o => o.geo) : []
  return (
    <div className="screen map-screen">
      <div className="screen-h"><span className="screen-title">Карта активов</span><input className="input" style={{ width: 260 }} placeholder="Найти актив на карте…" value={q} onChange={e => setQ(e.target.value)} />{found.length > 0 && <div className="map-found">{found.map(o => <ObjectChip key={o.id} o={o} compact onOpen={x => { setFly({ x: x.geo![0], y: x.geo![1], zoom: 3.2, key: Date.now() }); openObject(x.id); setQ('') }} />)}</div>}<span className="grow" /><span className="dim mono" style={{ fontSize: 11 }}>векторные тайлы офлайн · deck.gl слои · схематическая проекция стенда</span></div>
      <div className="screen-b">
        <div className="situ-map" style={{ flex: 1 }}>
          <MapCanvas markers={riskMarkers} pipelines={w.pipelines} layers={layers} selected={selected} hover={hover} onHover={setHover} onSelect={id => id && openObject(id)} onLasso={ids => inspect({ open: true, mode: 'summary', summaryIds: ids })} flyTo={fly} ambient={ambient} theme={theme} timeOffsetH={offset} staleLayer={chaos.sapStale ? { kind: 'well', text: 'Источник SAP-реплика молчит 14 мин (SLO 15 мин)' } : null} />
          <div className="timeline"><span className="mono dim" style={{ fontSize: 10 }}>−24 ч</span><input type="range" min={0} max={24} value={24 - offset} onChange={e => setOffset(24 - Number(e.target.value))} aria-label="Таймлайн" /><span className="mono" style={{ fontSize: 10, color: offset ? 'var(--sp-warn)' : 'var(--sp-text-2)' }}>{offset ? `−${offset} ч` : 'сейчас'}</span></div>
          {hover && (() => { const o = getObject(hover); return o ? <div className="map-tip">{TYPES[o.type].label} · <b>{o.label}</b></div> : null })()}
        </div>
        <aside className="graph-side">
          <Panel title={<span className="row"><Layers size={12} /> Слои</span>} dense><div className="col" style={{ padding: 8, gap: 2 }}>{(Object.entries(w.domain.layerLabels) as [keyof MapLayers, string][]).map(([k, l]) => <label key={k} className="check"><input type="checkbox" checked={layers[k]} onChange={e => setLayers(s => ({ ...s, [k]: e.target.checked }))} />{l}</label>)}</div></Panel>
          <Panel title="Активы" dense><div className="col" style={{ padding: 8, gap: 4 }}>{[...(w.byType.get(w.domain.hubType) || []).filter(x => x.type !== 'Substation' || x.props.voltage_kv === 220), ...(w.byType.get(w.domain.areaType) || [])].map(o => <ObjectChip key={o.id} o={o} onOpen={x => { setFly({ x: x.geo![0], y: x.geo![1], zoom: x.type === w.domain.areaType ? 2.2 : 3.2, key: Date.now() }); openObject(x.id) }} />)}</div></Panel>
          <Panel title="Табличная альтернатива" dense><div style={{ padding: 8 }} className="dim">Список активов доступен на экране Поиск (тип: {[w.domain.unitType, w.domain.hubType, w.domain.distType].filter((t, i, a) => a.indexOf(t) === i).map(t => TYPES[t].label).join(', ')}) — для экранных дикторов (AC-04).</div></Panel>
        </aside>
      </div>
    </div>
  )
}

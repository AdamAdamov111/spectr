// U8 ТОиР и надёжность: таблица оборудования по индексу состояния, телеметрия (3 графика, синхронный курсор), окна аномалий, заявки.
import { useEffect, useMemo, useRef, useState } from 'react'
import * as echarts from 'echarts'
import { Wrench, TriangleAlert } from 'lucide-react'
import { world, get as getObject, neighbors } from '../data/api'
import { telemetry } from '../data/generator'
import { useStore, useSimulatedSession, reducedMotion } from '../app/store'
import { DataTable, type Column } from '../components/DataTable'
import { ObjectChip, HealthArc, Panel, Masked, formatProp, Empty } from '../components/ui'
import { canSee, viewProps } from '../data/security'
import type { SpObject } from '../data/types'
import { fmtNum, HOUR, MIN } from '../data/rng'
import { DOMAINS } from '../data/domain'

const CLASS_RU: Record<string, string> = Object.fromEntries([...DOMAINS.oilgas.equipmentClasses, ...DOMAINS.energy.equipmentClasses].map(c => [c[0], c[1]]))

export function ToirScreen() {
  const session = useSimulatedSession()
  const openObject = useStore(s => s.openObject); const openAction = useStore(s => s.openAction); const openExplain = useStore(s => s.openExplain)
  const w = world()
  const [dzo, setDzo] = useState<string>(''); const [cls, setCls] = useState(''); const [onlyBad, setOnlyBad] = useState(false)
  const [sel, setSel] = useState<string>(w.named.focusEquipment)
  const rows = useMemo(() => (w.byType.get('Equipment') || []).filter(e => canSee(session, e) && (!dzo || e.subsidiary === dzo) && (!cls || e.props.equipment_class === cls) && (!onlyBad || (e.props.health_index as number) < 0.5)).sort((a, b) => (a.props.health_index as number) - (b.props.health_index as number)), [dzo, cls, onlyBad, session.login, session.purpose])
  const host = (e: SpObject) => neighbors(session, e.id, { types: ['has_equipment'] }).find(n => n.direction === 'in')?.other
  const openOrders = (e: SpObject) => neighbors(session, e.id, { types: ['maintains'] }).filter(n => n.other.props.status !== 'закрыта')
  const columns = useMemo<Column<SpObject>[]>(() => [
    { key: 'h', label: 'Индекс', width: 70, render: r => <><HealthArc v={r.props.health_index as number} /><span className="mono">{(r.props.health_index as number).toFixed(2)}</span></>, sort: (a, b) => (a.props.health_index as number) - (b.props.health_index as number) },
    { key: 'obj', label: 'Оборудование', width: 'minmax(180px, 1.4fr)', render: r => <ObjectChip o={r} noHover /> },
    { key: 'cls', label: 'Класс', width: 120, render: r => <span className="dim">{CLASS_RU[r.props.equipment_class as string]}</span>, sort: (a, b) => String(a.props.equipment_class).localeCompare(String(b.props.equipment_class)) },
    { key: 'host', label: 'Установлено на', width: 'minmax(120px, 1fr)', render: r => { const h = host(r); return h ? <span className="truncate">{h.label}</span> : <span className="dim">—</span> } },
    { key: 'hrs', label: 'Наработка, ч', width: 110, align: 'right', render: r => <span className="mono">{fmtNum(r.props.operating_hours as number)}</span>, sort: (a, b) => (a.props.operating_hours as number) - (b.props.operating_hours as number) },
    { key: 'orders', label: 'Открытых заявок', width: 110, align: 'right', render: r => <span className="mono">{openOrders(r).length}</span> },
    { key: 'crit', label: 'Критичность', width: 100, render: r => <span className={r.props.criticality === 'высокая' ? 'danger-text' : 'dim'}>{String(r.props.criticality)}</span> },
    { key: 'cost', label: 'Стоимость', width: 120, align: 'right', render: r => { const v = viewProps(session, r).find(p => p.name === 'purchase_cost')!; return v.masked ? <Masked inline markings={['FIN']} reason={v.reason} /> : <span className="mono">{formatProp(v.value, 'money')}</span> } },
  ], [session.login, session.purpose])
  const e = getObject(sel)
  return (
    <div className="screen toir">
      <div className="screen-h">
        <span className="screen-title">ТОиР и надёжность</span>
        <select className="input" style={{ width: 160 }} value={dzo} onChange={e => setDzo(e.target.value)}><option value="">Все ДЗО</option>{(w.byType.get('Subsidiary') || []).map(d => <option key={d.id} value={d.id}>{d.label}</option>)}</select>
        <select className="input" style={{ width: 160 }} value={cls} onChange={e => setCls(e.target.value)}><option value="">Все классы</option>{w.domain.equipmentClasses.map(c => <option key={c[0]} value={c[0]}>{c[1]}</option>)}</select>
        <label className="check"><input type="checkbox" checked={onlyBad} onChange={e => setOnlyBad(e.target.checked)} /> только индекс &lt; 0.5</label>
        <span className="dim mono" style={{ fontSize: 11 }}>{rows.length} ед.</span>
        <span className="grow" />
        {e && <button className="btn btn-primary" onClick={() => openAction('create_maintenance_order', e.id, { kind: 'Диагностика', priority: (e.props.health_index as number) < 0.4 ? 'Критический' : 'Высокий' })}><Wrench size={13} /> Создать заявку · {e.label}</button>}
      </div>
      <div className="screen-b">
        <div className="toir-table"><DataTable rows={rows} columns={columns} selected={sel} onSelect={r => { setSel(r.id); openObject(r.id) }} onOpen={r => openObject(r.id, { tab: true })} onExplain={r => openExplain(r.id, 'health_index')} footer={<><span>{rows.length} единиц</span><span className="grow" /><span>Индекс: equipment_health_index@2.1.0</span></>} /></div>
        <div className="toir-side">{e ? <Telemetry e={e} key={e.id} /> : <Empty text="Выберите оборудование" />}</div>
      </div>
    </div>
  )
}

function Telemetry({ e }: { e: SpObject }) {
  const session = useSimulatedSession(); const openObject = useStore(s => s.openObject); const theme = useStore(s => s.settings.theme)
  const w = world()
  const sensors = neighbors(session, e.id, { types: ['measured_by'] }).map(n => n.other)
  const anomalies = neighbors(session, e.id, { types: ['detected_on'] }).map(n => n.other)
  const refs = [useRef<HTMLDivElement>(null), useRef<HTMLDivElement>(null), useRef<HTMLDivElement>(null)]
  const isPump104 = e.id === w.named.focusEquipment
  const orders = neighbors(session, e.id, { types: ['maintains'] }).filter(n => n.other.props.status !== 'закрыта').map(n => n.other)
  useEffect(() => {
    if (!sensors.length) return
    const now = Date.now(); const from = now - 24 * HOUR
    const charts: echarts.ECharts[] = []
    const rm = reducedMotion()
    const light = theme === 'light'
    sensors.slice(0, 3).forEach((s, i) => {
      const el = refs[i].current; if (!el) return
      const kind = s.props.kind as string
      const data = telemetry(s.props.tag as string, kind, from, now, 2 * MIN, { anomaly: isPump104 })
      const areas: [{ xAxis: number; name?: string }, { xAxis: number }][] = []
      if (isPump104 && i === 0) areas.push([{ xAxis: now - 15 * MIN, name: 'anomaly_v3 · 0.87' }, { xAxis: now }])
      if (isPump104 && i === 1) areas.push([{ xAxis: now - 6 * HOUR, name: 'спайк' }, { xAxis: now - 5.2 * HOUR }])
      for (const a of anomalies) { const f = new Date(String(a.props.window_from).replace(' ', 'T') + 'Z').getTime(); const t = new Date(String(a.props.window_to).replace(' ', 'T') + 'Z').getTime(); if (t > from && !isPump104) areas.push([{ xAxis: Math.max(from, f), name: `${a.props.kind} · ${a.props.score}` }, { xAxis: Math.min(now, t) }]) }
      const c = echarts.init(el, undefined, { renderer: 'canvas' })
      charts.push(c)
      c.setOption({
        backgroundColor: 'transparent', animationDuration: rm ? 0 : 600, animationEasing: 'linear',
        grid: { left: 44, right: 12, top: 26, bottom: 22 },
        title: { text: `${s.label} · ${kind}, ${s.props.unit}`, left: 4, top: 2, textStyle: { color: light ? '#5f6b7c' : '#abb3bf', fontSize: 12, fontWeight: 'normal', fontFamily: 'Inter Variable, sans-serif' } },
        tooltip: { trigger: 'axis', backgroundColor: light ? '#fff' : '#252a31', borderColor: light ? '#d5dce3' : '#3a434d', textStyle: { color: light ? '#1c2127' : '#f6f7f9', fontSize: 12 }, axisPointer: { type: 'line', lineStyle: { color: '#4c90f0' } } },
        xAxis: { type: 'time', axisLine: { lineStyle: { color: light ? '#b9c3cd' : '#1e2935' } }, axisLabel: { color: light ? '#4b5967' : '#5c6b7a', fontSize: 10 }, splitLine: { show: false } },
        yAxis: { type: 'value', scale: true, axisLabel: { color: light ? '#4b5967' : '#5c6b7a', fontSize: 10 }, splitLine: { lineStyle: { color: light ? '#e6ebf0' : '#131b25' } } },
        series: [{ type: 'line', showSymbol: false, data: data.map(d => [d.t, d.v]), lineStyle: { width: 1.6, color: ['#4c90f0', '#9d8be8', '#ec9a3c'][i] }, areaStyle: { color: ['rgba(76,144,240,0.1)', 'rgba(157,139,232,0.1)', 'rgba(236,154,60,0.1)'][i] },
          markArea: areas.length ? { silent: false, itemStyle: { color: 'rgba(231,106,110,0.18)', borderColor: '#e76a6e', borderWidth: 1 }, label: { color: '#e76a6e', fontSize: 11, position: 'insideTop' }, data: areas, animationDelay: rm ? 0 : 800 } : undefined }],
      })
    })
    if (charts.length > 1) echarts.connect(charts)
    const ro = new ResizeObserver(() => charts.forEach(c => c.resize())); refs.forEach(r => r.current && ro.observe(r.current))
    return () => { ro.disconnect(); charts.forEach(c => c.dispose()) }
  }, [e.id, theme])
  return (
    <div className="col" style={{ height: '100%', gap: 8, overflow: 'auto' }}>
      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}><ObjectChip o={e} /><HealthArc v={e.props.health_index as number} size={26} /><span className="mono">{(e.props.health_index as number).toFixed(2)}</span><span className="dim" style={{ fontSize: 11 }}>{sensors.length} датчиков · окно 24 ч · шаг 2 мин</span></div>
      {!sensors.length && <Empty text="У этого оборудования нет датчиков SCADA. Индекс состояния считается по наработке, заявкам и возрасту" />}
      <div className="charts">{sensors.slice(0, 3).map((_, i) => <div key={i} ref={refs[i]} className="chart" />)}</div>
      {(anomalies.length > 0 || isPump104) && <Panel title="Аномалии" dense><div className="col" style={{ padding: 8, gap: 4 }}>{(isPump104 ? [getObject(w.named.focusAnomaly)!, ...anomalies.filter(a => a.id !== w.named.focusAnomaly)] : anomalies).slice(0, 6).map(a => <button key={a.id} className="anom-row" onClick={() => openObject(a.id)}><TriangleAlert size={13} style={{ color: 'var(--sp-danger)' }} /><span className="grow">{a.label}</span><span className="mono">score {String(a.props.score)}</span><span className="dim mono" style={{ fontSize: 10 }}>{String(a.props.window_from).slice(5)} → {String(a.props.window_to).slice(11)}</span></button>)}</div></Panel>}
      <Panel title={`Открытые заявки · ${orders.length}`} dense><div className="col" style={{ padding: 8, gap: 4 }}>{orders.length ? orders.slice(0, 8).map(o => <div key={o.id} className="row"><ObjectChip o={o} compact /><span className="dim" style={{ fontSize: 11 }}>{String(o.props.kind)} · {String(o.props.priority)} · {String(o.props.status)} · {String(o.props.source_system)}</span></div>) : <span className="dim">Нет открытых заявок</span>}</div></Panel>
    </div>
  )
}

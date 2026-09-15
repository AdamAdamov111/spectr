// Time-series panel for objects carrying real open-data series (holding: JODI/EIA; Volve wells). Lazy-loaded (ECharts).
import { useEffect, useRef, useState } from 'react'
import * as echarts from 'echarts'
import type { SeriesDef } from '../data/types'
import { useStore, reducedMotion } from '../app/store'

export default function SeriesChart({ series }: { series: SeriesDef[] }) {
  const theme = useStore(s => s.settings.theme)
  const [active, setActive] = useState(0)
  const ref = useRef<HTMLDivElement>(null)
  const sd = series[Math.min(active, series.length - 1)]
  useEffect(() => {
    const el = ref.current; if (!el || !sd) return
    const light = theme === 'light'; const rm = reducedMotion()
    const c = echarts.init(el, undefined, { renderer: 'canvas' })
    const data = sd.x.map((x, i) => [x.length === 7 ? `${x}-01` : x, sd.y[i]]).filter(d => d[1] != null)
    c.setOption({
      backgroundColor: 'transparent', animationDuration: rm ? 0 : 500,
      grid: { left: 56, right: 16, top: 30, bottom: 28 },
      title: { text: `${sd.label}, ${sd.unit}`, left: 4, top: 2, textStyle: { color: light ? '#5f6b7c' : '#abb3bf', fontSize: 12, fontWeight: 'normal', fontFamily: 'Inter Variable, sans-serif' } },
      tooltip: { trigger: 'axis', backgroundColor: light ? '#fff' : '#252a31', borderColor: light ? '#d5dce3' : '#3a434d', textStyle: { color: light ? '#1c2127' : '#f6f7f9', fontSize: 12 }, valueFormatter: (v: number) => `${v} ${sd.unit}` },
      xAxis: { type: 'time', axisLine: { lineStyle: { color: light ? '#b9c3cd' : '#2f343c' } }, axisLabel: { color: light ? '#4b5967' : '#738091', fontSize: 10 }, splitLine: { show: false } },
      yAxis: { type: 'value', scale: true, axisLabel: { color: light ? '#4b5967' : '#738091', fontSize: 10 }, splitLine: { lineStyle: { color: light ? '#e6ebf0' : '#252a31' } } },
      dataZoom: sd.x.length > 400 ? [{ type: 'inside' }] : undefined,
      series: [{ type: sd.kind === 'bar' ? 'bar' : 'line', showSymbol: false, data, lineStyle: { width: 1.5, color: '#4c90f0' }, itemStyle: { color: '#4c90f0' }, areaStyle: sd.kind === 'bar' ? undefined : { color: 'rgba(76,144,240,0.08)' } }],
    })
    const ro = new ResizeObserver(() => c.resize()); ro.observe(el)
    return () => { ro.disconnect(); c.dispose() }
  }, [sd, theme])
  return (
    <div className="series-panel">
      <div className="tabs tabs-sub">{series.map((s, i) => <button key={s.key} className={i === active ? 'active' : ''} onClick={() => setActive(i)}>{s.label.split(' (')[0]}</button>)}</div>
      <div ref={ref} style={{ height: 260, width: '100%' }} />
      <div className="dim" style={{ fontSize: 11, padding: '4px 4px 0' }}>Источник: {sd.source} · {sd.x.length} точек · {sd.x[0]} — {sd.x[sd.x.length - 1]}</div>
    </div>
  )
}

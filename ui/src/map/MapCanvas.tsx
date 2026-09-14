// Schematic asset map — canvas "tactical" rendering (production: MapLibre + deck.gl, spec 8.9).
// Layers: fields, pipelines with flow particles (MO-16), wells, NPS, tanks, vehicles, anomalies with expanding rings (MO-15), incidents.
import { useEffect, useRef, useState } from 'react'
import type { PipelineGeom } from '../data/generator'
import { reducedMotion } from '../app/store'

export interface MapMarker { id: string; kind: 'well' | 'pad' | 'field' | 'nps' | 'tank' | 'vehicle' | 'anomaly' | 'incident' | 'equipment'; x: number; y: number; label?: string; score?: number; status?: string; value?: number; ts?: number; risk?: number }
export interface MapLayers { fields: boolean; pipelines: boolean; wells: boolean; nps: boolean; tanks: boolean; vehicles: boolean; anomalies: boolean; incidents: boolean; heat: boolean }
export const DEFAULT_LAYERS: MapLayers = { fields: true, pipelines: true, wells: true, nps: true, tanks: true, vehicles: true, anomalies: true, incidents: true, heat: false }

interface Props { markers: MapMarker[]; pipelines: PipelineGeom[]; layers: MapLayers; selected?: string | null; hover?: string | null; onSelect: (id: string | null) => void; onHover?: (id: string | null) => void; onLasso?: (ids: string[]) => void; flyTo?: { x: number; y: number; zoom: number; key: number } | null; ambient: boolean; staleLayer?: { kind: string; text: string } | null; timeOffsetH?: number; wall?: boolean; intro?: boolean; theme?: 'dark' | 'light' }

interface Cam { x: number; y: number; z: number }

export function MapCanvas(p: Props) {
  const ref = useRef<HTMLCanvasElement>(null)
  const cam = useRef<Cam>({ x: 500, y: 320, z: 1 })
  const target = useRef<Cam | null>(null)
  const flyStart = useRef<{ from: Cam; t0: number; dur: number } | null>(null)
  const particles = useRef<{ p: number; s: number }[][]>([])
  const drag = useRef<{ x: number; y: number; cx: number; cy: number; lasso?: boolean; lx?: number; ly?: number } | null>(null)
  const [lasso, setLasso] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null)
  const hoverRef = useRef<string | null>(null)
  const propsRef = useRef(p); propsRef.current = p
  const anomalyBorn = useRef(new Map<string, number>())
  const size = useRef({ w: 0, h: 0 })

  // world → screen
  const toScreen = (x: number, y: number) => { const c = cam.current; const { w, h } = size.current; return [(x - c.x) * c.z * (w / 1000) + w / 2, (y - c.y) * c.z * (w / 1000) + h / 2] as [number, number] }
  const toWorld = (sx: number, sy: number) => { const c = cam.current; const { w, h } = size.current; const k = c.z * (w / 1000); return [(sx - w / 2) / k + c.x, (sy - h / 2) / k + c.y] as [number, number] }

  useEffect(() => {
    // particles per pipeline
    particles.current = p.pipelines.map(pl => { const n = Math.max(6, Math.round(pl.flow / 90)); return Array.from({ length: n }, (_, i) => ({ p: i / n, s: 0.02 + pl.flow / 60000 })) })
  }, [p.pipelines])

  useEffect(() => {
    if (!p.flyTo) return
    const rm = reducedMotion()
    const to = { x: p.flyTo.x, y: p.flyTo.y, z: p.flyTo.zoom }
    if (rm) { cam.current = to; return }
    flyStart.current = { from: { ...cam.current }, t0: performance.now(), dur: 900 }; target.current = to
  }, [p.flyTo?.key])

  useEffect(() => {
    const c = ref.current!
    const onWheel = (e: WheelEvent) => { e.preventDefault(); const [wx, wy] = toWorld(e.offsetX, e.offsetY); const nz = Math.min(8, Math.max(0.3, cam.current.z * (e.deltaY < 0 ? 1.15 : 0.87))); const cc = cam.current; const k = nz / cc.z; cam.current = { x: wx - (wx - cc.x) / k, y: wy - (wy - cc.y) / k, z: nz }; flyStart.current = null }
    c.addEventListener('wheel', onWheel, { passive: false })
    return () => c.removeEventListener('wheel', onWheel)
  }, [])

  useEffect(() => {
    const c = ref.current!; const ctx = c.getContext('2d')!
    let raf = 0; let running = true; let last = performance.now()
    const rm = reducedMotion()
    const fit = () => { const r = c.getBoundingClientRect(); size.current = { w: r.width, h: r.height }; c.width = r.width * devicePixelRatio; c.height = r.height * devicePixelRatio }
    fit(); const ro = new ResizeObserver(fit); ro.observe(c)
    if (propsRef.current.intro && !rm) { cam.current = { x: 500, y: 320, z: 0.35 }; flyStart.current = { from: { ...cam.current }, t0: performance.now() + 100, dur: 900 }; target.current = { x: 520, y: 320, z: 1 } }
    const draw = (t: number) => {
      const dt = Math.min(0.05, (t - last) / 1000); last = t
      const now = t
      const pr = propsRef.current
      const { w, h } = size.current
      ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0)
      const light = pr.theme === 'light'
      ctx.fillStyle = light ? '#edeff2' : '#0d1013'; ctx.fillRect(0, 0, w, h)
      // camera flight (ease-inout)
      if (flyStart.current && target.current) { const f = flyStart.current; const k = Math.min(1, Math.max(0, (t - f.t0) / f.dur)); const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2; cam.current = { x: f.from.x + (target.current.x - f.from.x) * e, y: f.from.y + (target.current.y - f.from.y) * e, z: f.from.z + (target.current.z - f.from.z) * e }; if (k >= 1) { flyStart.current = null; target.current = null } }
      const z = cam.current.z * (w / 1000)
      // grid + coordinates
      const step = 50 * z
      const [ox, oy] = toScreen(0, 0)
      ctx.strokeStyle = light ? 'rgba(28,33,39,0.06)' : 'rgba(246,247,249,0.035)'; ctx.lineWidth = 1; ctx.beginPath()
      for (let x = ox % step; x < w; x += step) { ctx.moveTo(x, 0); ctx.lineTo(x, h) }
      for (let y = oy % step; y < h; y += step) { ctx.moveTo(0, y); ctx.lineTo(w, y) }
      ctx.stroke()
      ctx.fillStyle = light ? 'rgba(28,33,39,0.4)' : 'rgba(171,179,191,0.4)'; ctx.font = `${pr.wall ? 14 : 10}px "JetBrains Mono Variable", monospace`
      for (let x = ox % (step * 4); x < w; x += step * 4) { const wx = toWorld(x, 0)[0]; ctx.fillText(`${(73 + wx / 400).toFixed(2)}E`, x + 3, 12) }
      for (let y = oy % (step * 4); y < h; y += step * 4) { const wy = toWorld(0, y)[1]; ctx.fillText(`${(61 + wy / 900).toFixed(2)}N`, 3, y - 3) }
      const stale = pr.staleLayer?.kind
      // fields
      if (pr.layers.fields) for (const m of pr.markers) if (m.kind === 'field') { const [sx, sy] = toScreen(m.x, m.y); const r = 62 * z; const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, r); g.addColorStop(0, 'rgba(167,139,250,0.16)'); g.addColorStop(1, 'rgba(167,139,250,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(sx, sy, r, r * 0.7, 0, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = 'rgba(167,139,250,0.35)'; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.ellipse(sx, sy, r, r * 0.7, 0, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle = light ? '#5c4bb5' : '#c9bfff'; ctx.font = `500 ${(pr.wall ? 20 : 13)}px "Inter Variable", sans-serif`; ctx.fillText(m.label || '', sx - r * 0.5, sy - r * 0.7 - 6) }
      // pipelines
      if (pr.layers.pipelines) pr.pipelines.forEach((pl, pi) => {
        const pts = pl.points.map(q => toScreen(q[0], q[1]))
        const pressureColor = pl.pressure > 6.5 ? '#ec9a3c' : '#8abbff'
        ctx.lineJoin = 'round'; ctx.lineCap = 'round'
        ctx.strokeStyle = light ? 'rgba(45,114,210,0.14)' : 'rgba(76,144,240,0.1)'; ctx.lineWidth = Math.max(6, (pl.flow / 900) * z * 5); ctx.beginPath(); pts.forEach((q, i) => (i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]))); ctx.stroke()
        ctx.strokeStyle = light ? 'rgba(45,114,210,0.6)' : 'rgba(138,187,255,0.42)'; ctx.lineWidth = Math.max(1.8, (pl.flow / 900) * z * 1.8); ctx.beginPath(); pts.forEach((q, i) => (i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]))); ctx.stroke()
        if (pr.ambient && !rm) {
          const segs: number[] = []; let total = 0
          for (let i = 1; i < pts.length; i++) { const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); segs.push(l); total += l }
          for (const part of particles.current[pi] || []) {
            part.p = (part.p + part.s * dt * 8) % 1
            let d = part.p * total; let i = 0; while (i < segs.length && d > segs[i]) { d -= segs[i]; i++ }
            if (i >= segs.length) continue
            const f = d / segs[i]; const x = pts[i][0] + (pts[i + 1][0] - pts[i][0]) * f; const y = pts[i][1] + (pts[i + 1][1] - pts[i][1]) * f
            ctx.fillStyle = pressureColor; ctx.shadowColor = pressureColor; ctx.shadowBlur = 8; ctx.beginPath(); ctx.arc(x, y, Math.max(1.2, 1.8 * z), 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0
          }
        }
        if (z > 0.9) { const mid = pts[Math.floor(pts.length / 2)]; ctx.fillStyle = light ? '#215db0' : 'rgba(138,187,255,0.8)'; ctx.font = `${pr.wall ? 14 : 11}px "JetBrains Mono Variable", monospace`; ctx.fillText(`${pl.code.split(' ')[0]} · ${pl.flow} м³/ч`, mid[0] + 6, mid[1] - 6) }
      })
      // markers
      const hov = hoverRef.current
      for (const m of pr.markers) {
        if (m.kind === 'field') continue
        if (m.kind === 'well' && !pr.layers.wells) continue; if (m.kind === 'pad' && !pr.layers.wells) continue
        if (m.kind === 'nps' && !pr.layers.nps) continue; if (m.kind === 'tank' && !pr.layers.tanks) continue; if (m.kind === 'vehicle' && !pr.layers.vehicles) continue
        if (m.kind === 'anomaly' && !pr.layers.anomalies) continue; if (m.kind === 'incident' && !pr.layers.incidents) continue
        if (pr.timeOffsetH && m.ts && m.ts > Date.now() - pr.timeOffsetH * 3600_000 && (m.kind === 'anomaly' || m.kind === 'incident')) continue
        const [sx, sy] = toScreen(m.x, m.y)
        if (sx < -40 || sy < -40 || sx > w + 40 || sy > h + 40) continue
        const isStale = stale === m.kind
        const sel = pr.selected === m.id; const hv = hov === m.id
        ctx.globalAlpha = isStale ? 0.45 : 1
        if (m.kind === 'well') { if (z < 0.6) continue; ctx.fillStyle = m.status === 'в работе' ? (m.value && m.value < 0 ? '#f59e0b' : '#a78bfa') : '#5c6b7a'; ctx.beginPath(); ctx.arc(sx, sy, Math.max(2, 3 * z), 0, Math.PI * 2); ctx.fill(); if (z > 2.2) { ctx.fillStyle = light ? '#334' : '#93a1b0'; ctx.font = '9px "JetBrains Mono Variable", monospace'; ctx.fillText(m.label || '', sx + 4, sy + 3) } }
        else if (m.kind === 'pad') { ctx.strokeStyle = 'rgba(167,139,250,0.6)'; ctx.lineWidth = 1; ctx.strokeRect(sx - 5 * z, sy - 5 * z, 10 * z, 10 * z) }
        else if (m.kind === 'tank') { const s = Math.max(4, 6.5 * z); ctx.fillStyle = light ? '#0891b2' : '#22d3ee'; ctx.globalAlpha *= 0.85; ctx.beginPath(); ctx.arc(sx, sy, s, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = isStale ? 0.45 : 1; if (m.value != null) { ctx.strokeStyle = light ? '#0e7490' : '#67e8f9'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(sx, sy, s + 2, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (m.value / 100)); ctx.stroke() } }
        else if (m.kind === 'nps') { const s = Math.max(8, 14 * z); const col = m.score && m.score > 0.8 ? '#e76a6e' : '#4c90f0'; ctx.fillStyle = col; ctx.shadowColor = col; ctx.shadowBlur = 10; hex(ctx, sx, sy, s); ctx.fill(); ctx.shadowBlur = 0; ctx.font = `600 ${pr.wall ? 22 : 14}px "Inter Variable", sans-serif`; const tw = ctx.measureText(m.label || '').width; ctx.fillStyle = light ? 'rgba(255,255,255,0.8)' : 'rgba(8,13,20,0.75)'; roundRect(ctx, sx + s + 4, sy - 11, tw + 14, 22, 3); ctx.fill(); ctx.fillStyle = light ? '#1c2127' : '#f6f7f9'; ctx.fillText(m.label || '', sx + s + 11, sy + 5); if (m.score && m.score > 0.8) { const born = anomalyBorn.current.get(m.id) ?? (anomalyBorn.current.set(m.id, now), now); const age = now - born; for (let k = 0; k < 2; k++) { const ph = ((age - k * 600) % 1200) / 1200; if (age < 2400 + 1200 && ph >= 0 && !rm) { ctx.strokeStyle = `rgba(239,68,68,${(1 - ph) * 0.9})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(sx, sy, s + ph * 40 * z, 0, Math.PI * 2); ctx.stroke() } } ctx.strokeStyle = `rgba(239,68,68,${0.35 + 0.15 * Math.sin(now / 400)})`; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(sx, sy, s + 5, 0, Math.PI * 2); ctx.stroke() } }
        else if (m.kind === 'vehicle') { if (z < 0.7) continue; ctx.fillStyle = light ? '#4b5967' : '#93a1b0'; ctx.beginPath(); ctx.moveTo(sx, sy - 4); ctx.lineTo(sx + 4, sy + 3); ctx.lineTo(sx - 4, sy + 3); ctx.closePath(); ctx.fill() }
        else if (m.kind === 'anomaly') { const r = Math.max(4, (m.score || 0.5) * 12 * z); const born = anomalyBorn.current.get(m.id) ?? (anomalyBorn.current.set(m.id, now), now); const age = now - born; if (!rm && age < 2400) { for (let k = 0; k < 2; k++) { const ph = ((age - k * 600) % 1200) / 1200; if (ph >= 0) { ctx.strokeStyle = `rgba(239,68,68,${(1 - ph) * 0.8})`; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(sx, sy, r + ph * 30, 0, Math.PI * 2); ctx.stroke() } } } ctx.fillStyle = `rgba(239,68,68,${0.25 + 0.1 * Math.sin(now / 500)})`; ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = '#ef4444'; ctx.lineWidth = 1; ctx.stroke() }
        else if (m.kind === 'incident') { const s = Math.max(4, 6 * z); ctx.fillStyle = '#ef4444'; ctx.beginPath(); ctx.moveTo(sx, sy - s); ctx.lineTo(sx + s, sy); ctx.lineTo(sx, sy + s); ctx.lineTo(sx - s, sy); ctx.closePath(); ctx.fill() }
        if (sel || hv) { ctx.strokeStyle = sel ? '#ffffff' : 'rgba(255,255,255,0.6)'; ctx.lineWidth = sel ? 2 : 1; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.arc(sx, sy, 14 * Math.max(0.6, z), 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]); if (hv && m.kind !== 'nps') { ctx.fillStyle = light ? '#1c2127' : '#f6f7f9'; ctx.font = '500 13px "Inter Variable", sans-serif'; ctx.fillText(m.label || m.id, sx + 14, sy - 12) } }
        ctx.globalAlpha = 1
      }
      // heat layer (risk)
      if (pr.layers.heat) for (const m of pr.markers) if (m.risk != null && m.risk > 0.4) { const [sx, sy] = toScreen(m.x, m.y); const r = 40 * z; const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, r); g.addColorStop(0, `rgba(239,68,68,${m.risk * 0.35})`); g.addColorStop(1, 'rgba(239,68,68,0)'); ctx.fillStyle = g; ctx.fillRect(sx - r, sy - r, r * 2, r * 2) }
      // vignette + ambient sweep
      const vg = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.75); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, light ? 'rgba(15,23,42,0.18)' : 'rgba(0,0,0,0.55)'); ctx.fillStyle = vg; ctx.fillRect(0, 0, w, h)
      
      if (pr.staleLayer) { ctx.fillStyle = 'rgba(239,68,68,0.9)'; ctx.font = `${pr.wall ? 16 : 11}px "JetBrains Mono Variable", monospace`; ctx.fillText(`⚠ ${pr.staleLayer.text}`, 12, h - 12) }
      if (pr.timeOffsetH) { ctx.fillStyle = 'rgba(245,158,11,0.9)'; ctx.font = `${pr.wall ? 16 : 11}px "JetBrains Mono Variable", monospace`; ctx.fillText(`◷ состояние −${pr.timeOffsetH} ч`, w - 150, h - 12) }
      if (running) raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)
    const vis = () => { if (document.visibilityState === 'hidden') { running = false; cancelAnimationFrame(raf) } else if (!running) { running = true; last = performance.now(); raf = requestAnimationFrame(draw) } }
    document.addEventListener('visibilitychange', vis)
    return () => { running = false; cancelAnimationFrame(raf); ro.disconnect(); document.removeEventListener('visibilitychange', vis) }
  }, [])

  const hit = (sx: number, sy: number): MapMarker | null => {
    let best: MapMarker | null = null; let bd = 14
    for (const m of p.markers) { if (m.kind === 'field') continue; const [x, y] = toScreen(m.x, m.y); const d = Math.hypot(x - sx, y - sy); const pri = m.kind === 'nps' ? 0.5 : m.kind === 'anomaly' || m.kind === 'incident' ? 0.6 : 1; if (d * pri < bd) { bd = d * pri; best = m } }
    return best
  }
  return (
    <div className="map-wrap" style={{ position: 'relative', width: '100%', height: '100%' }}>
      <canvas ref={ref} style={{ width: '100%', height: '100%', display: 'block', cursor: drag.current ? 'grabbing' : 'crosshair' }}
        onMouseDown={e => { drag.current = { x: e.clientX, y: e.clientY, cx: cam.current.x, cy: cam.current.y, lasso: e.shiftKey, lx: e.nativeEvent.offsetX, ly: e.nativeEvent.offsetY } }}
        onMouseMove={e => {
          const d = drag.current
          if (d) { if (d.lasso) { setLasso({ x0: d.lx!, y0: d.ly!, x1: e.nativeEvent.offsetX, y1: e.nativeEvent.offsetY }) } else { const k = cam.current.z * (size.current.w / 1000); cam.current = { ...cam.current, x: d.cx - (e.clientX - d.x) / k, y: d.cy - (e.clientY - d.y) / k }; flyStart.current = null } return }
          const m = hit(e.nativeEvent.offsetX, e.nativeEvent.offsetY); const id = m?.id ?? null; if (id !== hoverRef.current) { hoverRef.current = id; p.onHover?.(id) }
        }}
        onMouseUp={e => {
          const d = drag.current; drag.current = null
          if (!d) return
          if (d.lasso && lasso) { const x0 = Math.min(lasso.x0, lasso.x1), x1 = Math.max(lasso.x0, lasso.x1), y0 = Math.min(lasso.y0, lasso.y1), y1 = Math.max(lasso.y0, lasso.y1); const ids = p.markers.filter(m => m.kind !== 'field' && m.kind !== 'anomaly').filter(m => { const [sx, sy] = toScreen(m.x, m.y); return sx >= x0 && sx <= x1 && sy >= y0 && sy <= y1 }).map(m => m.id); setLasso(null); p.onLasso?.(ids); return }
          setLasso(null)
          if (Math.hypot(e.clientX - d.x, e.clientY - d.y) < 4) { const m = hit(e.nativeEvent.offsetX, e.nativeEvent.offsetY); p.onSelect(m?.id ?? null) }
        }}
        onMouseLeave={() => { drag.current = null; setLasso(null) }}
      />
      {lasso && <div style={{ position: 'absolute', left: Math.min(lasso.x0, lasso.x1), top: Math.min(lasso.y0, lasso.y1), width: Math.abs(lasso.x1 - lasso.x0), height: Math.abs(lasso.y1 - lasso.y0), border: '1px dashed var(--sp-accent)', background: 'var(--sp-accent-dim)', pointerEvents: 'none' }} />}
    </div>
  )
}
function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r); ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h); ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r); ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath() }
function hex(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) { ctx.beginPath(); for (let i = 0; i < 6; i++) { const a = (Math.PI / 3) * i - Math.PI / 6; const px = x + r * Math.cos(a), py = y + r * Math.sin(a); i ? ctx.lineTo(px, py) : ctx.moveTo(px, py) } ctx.closePath() }

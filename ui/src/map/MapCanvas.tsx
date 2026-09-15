// Schematic asset map — quiet canvas rendering (production: MapLibre + deck.gl, spec 8.9).
// One base map (country outlines), thin pipelines, small glyphs; only anomalies and incidents use colour.
import { useEffect, useRef, useState } from 'react'
import type { PipelineGeom } from '../data/generator'
import type { Basemap } from './geo'
import { reducedMotion } from '../app/store'

export type MarkerKind = 'well' | 'pad' | 'field' | 'nps' | 'tank' | 'vehicle' | 'anomaly' | 'incident' | 'equipment' | 'refinery' | 'terminal'
export interface MapMarker { id: string; kind: MarkerKind; x: number; y: number; label?: string; score?: number; status?: string; value?: number; ts?: number; risk?: number; major?: boolean; size?: number }
export interface MapLayers { basemap: boolean; fields: boolean; pipelines: boolean; wells: boolean; nps: boolean; refineries: boolean; terminals: boolean; tanks: boolean; vehicles: boolean; anomalies: boolean; incidents: boolean; heat: boolean }
export const DEFAULT_LAYERS: MapLayers = { basemap: true, fields: true, pipelines: true, wells: true, nps: true, refineries: true, terminals: true, tanks: true, vehicles: false, anomalies: true, incidents: true, heat: false }

interface Props { markers: MapMarker[]; pipelines: PipelineGeom[]; basemap?: Basemap | null; layers: MapLayers; selected?: string | null; hover?: string | null; onSelect: (id: string | null) => void; onHover?: (id: string | null) => void; onLasso?: (ids: string[]) => void; flyTo?: { x: number; y: number; zoom: number; key: number } | null; ambient: boolean; staleLayer?: { kind: string; text: string } | null; timeOffsetH?: number; wall?: boolean; intro?: boolean; theme?: 'dark' | 'light'; home?: { x: number; y: number; z: number } }

interface Cam { x: number; y: number; z: number }
const FONT = '"Inter Variable", sans-serif'
const MONO = '"JetBrains Mono Variable", monospace'

export function MapCanvas(p: Props) {
  const ref = useRef<HTMLCanvasElement>(null)
  const home = p.home || { x: 500, y: 300, z: 1 }
  const cam = useRef<Cam>({ ...home })
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
    particles.current = p.pipelines.map(pl => { const n = Math.max(3, Math.min(14, Math.round(pl.flow / 300))); return Array.from({ length: n }, (_, i) => ({ p: i / n, s: 0.015 + Math.min(0.03, pl.flow / 90000) })) })
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
    const onWheel = (e: WheelEvent) => { e.preventDefault(); const [wx, wy] = toWorld(e.offsetX, e.offsetY); const nz = Math.min(12, Math.max(0.5, cam.current.z * (e.deltaY < 0 ? 1.15 : 0.87))); const cc = cam.current; const k = nz / cc.z; cam.current = { x: wx - (wx - cc.x) / k, y: wy - (wy - cc.y) / k, z: nz }; flyStart.current = null }
    c.addEventListener('wheel', onWheel, { passive: false })
    return () => c.removeEventListener('wheel', onWheel)
  }, [])

  useEffect(() => {
    const c = ref.current!; const ctx = c.getContext('2d')!
    let raf = 0; let running = true; let last = performance.now()
    const rm = reducedMotion()
    const fit = () => { const r = c.getBoundingClientRect(); size.current = { w: r.width, h: r.height }; c.width = r.width * devicePixelRatio; c.height = r.height * devicePixelRatio }
    fit(); const ro = new ResizeObserver(fit); ro.observe(c)
    const h0 = propsRef.current.home || { x: 500, y: 300, z: 1 }
    if (propsRef.current.intro && !rm) { cam.current = { x: h0.x, y: h0.y, z: h0.z * 0.7 }; flyStart.current = { from: { ...cam.current }, t0: performance.now() + 100, dur: 900 }; target.current = { ...h0 } }
    const draw = (t: number) => {
      const dt = Math.min(0.05, (t - last) / 1000); last = t
      const now = t
      const pr = propsRef.current
      const { w, h } = size.current
      ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0)
      const light = pr.theme === 'light'
      ctx.fillStyle = light ? '#e4e8ec' : '#0f1216'; ctx.fillRect(0, 0, w, h)
      if (flyStart.current && target.current) { const f = flyStart.current; const k = Math.min(1, Math.max(0, (t - f.t0) / f.dur)); const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2; cam.current = { x: f.from.x + (target.current.x - f.from.x) * e, y: f.from.y + (target.current.y - f.from.y) * e, z: f.from.z + (target.current.z - f.from.z) * e }; if (k >= 1) { flyStart.current = null; target.current = null } }
      const z = cam.current.z * (w / 1000)
      const stale = pr.staleLayer?.kind
      const textCol = light ? '#1c2127' : '#f6f7f9'; const dimCol = light ? '#5f6b7c' : '#8f98a3'
      // base map: land fill + borders, home country slightly brighter
      if (pr.layers.basemap && pr.basemap) {
        const drawRings = (rings: { points: [number, number][] }[], fill: string, stroke: string) => {
          ctx.fillStyle = fill; ctx.strokeStyle = stroke; ctx.lineWidth = 1
          for (const r of rings) { ctx.beginPath(); r.points.forEach((q, i) => { const [sx, sy] = toScreen(q[0], q[1]); i ? ctx.lineTo(sx, sy) : ctx.moveTo(sx, sy) }); ctx.closePath(); ctx.fill(); ctx.stroke() }
        }
        drawRings(pr.basemap.land, light ? '#eceff2' : '#151a20', light ? '#cfd6dd' : '#232a32')
        drawRings(pr.basemap.home, light ? '#f4f6f8' : '#1a2027', light ? '#c2cad2' : '#2a323b')
      }
      // fields: filled discs sized by production, quiet violet
      if (pr.layers.fields) for (const m of pr.markers) if (m.kind === 'field') {
        const [sx, sy] = toScreen(m.x, m.y); if (sx < -60 || sy < -60 || sx > w + 60 || sy > h + 60) continue
        const r = Math.max(3, (m.size ?? 6) * Math.sqrt(z))
        ctx.fillStyle = light ? 'rgba(124,106,224,0.22)' : 'rgba(157,139,232,0.22)'; ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI * 2); ctx.fill()
        ctx.strokeStyle = light ? 'rgba(124,106,224,0.7)' : 'rgba(157,139,232,0.7)'; ctx.lineWidth = 1; ctx.stroke()
        if (m.major || z > 1.6) { ctx.fillStyle = light ? '#4a3fa0' : '#c9bfff'; ctx.font = `500 ${pr.wall ? 16 : 11}px ${FONT}`; ctx.fillText(m.label || '', sx + r + 4, sy + 4) }
      }
      // pipelines: one thin line; hot line orange; flow particles only in ambient mode
      if (pr.layers.pipelines) pr.pipelines.forEach((pl, pi) => {
        const pts = pl.points.map(q => toScreen(q[0], q[1]))
        const col = pl.hot ? '#ec9a3c' : light ? 'rgba(45,114,210,0.75)' : 'rgba(138,187,255,0.55)'
        ctx.lineJoin = 'round'; ctx.lineCap = 'round'
        ctx.strokeStyle = col; ctx.lineWidth = pl.hot ? 2 : Math.max(1, Math.min(2.2, 0.8 + pl.flow / 3000)); ctx.beginPath(); pts.forEach((q, i) => (i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]))); ctx.stroke()
        if (pr.ambient && !rm) {
          const segs: number[] = []; let total = 0
          for (let i = 1; i < pts.length; i++) { const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); segs.push(l); total += l }
          ctx.fillStyle = pl.hot ? '#ffc078' : light ? '#2d72d2' : '#bcd4ff'
          for (const part of particles.current[pi] || []) {
            part.p = (part.p + part.s * dt * 8) % 1
            let d = part.p * total; let i = 0; while (i < segs.length && d > segs[i]) { d -= segs[i]; i++ }
            if (i >= segs.length) continue
            const f = d / segs[i]; const x = pts[i][0] + (pts[i + 1][0] - pts[i][0]) * f; const y = pts[i][1] + (pts[i + 1][1] - pts[i][1]) * f
            ctx.beginPath(); ctx.arc(x, y, 1.4, 0, Math.PI * 2); ctx.fill()
          }
        }
        if (z > 1.8) { const mid = pts[Math.floor(pts.length / 2)]; ctx.fillStyle = dimCol; ctx.font = `${pr.wall ? 13 : 10}px ${MONO}`; ctx.fillText(`${pl.code.split(' «')[0]} · ${pl.flow} ${pl.unit}`, mid[0] + 6, mid[1] - 6) }
      })
      // markers
      const hov = hoverRef.current
      for (const m of pr.markers) {
        if (m.kind === 'field') continue
        if ((m.kind === 'well' || m.kind === 'pad') && !pr.layers.wells) continue
        if (m.kind === 'nps' && !pr.layers.nps) continue; if (m.kind === 'tank' && !pr.layers.tanks) continue; if (m.kind === 'vehicle' && !pr.layers.vehicles) continue
        if (m.kind === 'refinery' && !pr.layers.refineries) continue; if (m.kind === 'terminal' && !pr.layers.terminals) continue
        if (m.kind === 'anomaly' && !pr.layers.anomalies) continue; if (m.kind === 'incident' && !pr.layers.incidents) continue
        if (pr.timeOffsetH && m.ts && m.ts > Date.now() - pr.timeOffsetH * 3600_000 && (m.kind === 'anomaly' || m.kind === 'incident')) continue
        const [sx, sy] = toScreen(m.x, m.y)
        if (sx < -40 || sy < -40 || sx > w + 40 || sy > h + 40) continue
        const isStale = stale === m.kind
        const sel = pr.selected === m.id; const hv = hov === m.id
        ctx.globalAlpha = isStale ? 0.45 : 1
        const showLabel = (min: number) => m.major || z > min
        if (m.kind === 'well') { if (z < 1.2) continue; ctx.fillStyle = m.status === 'в работе' ? (m.value && m.value < 0 ? '#ec9a3c' : '#9d8be8') : '#5c6b7a'; ctx.beginPath(); ctx.arc(sx, sy, Math.max(1.5, 1.6 * z), 0, Math.PI * 2); ctx.fill(); if (z > 3) { ctx.fillStyle = dimCol; ctx.font = `9px ${MONO}`; ctx.fillText(m.label || '', sx + 4, sy + 3) } }
        else if (m.kind === 'pad') { if (z < 1.2) continue; ctx.strokeStyle = 'rgba(157,139,232,0.6)'; ctx.lineWidth = 1; ctx.strokeRect(sx - 3 * z, sy - 3 * z, 6 * z, 6 * z) }
        else if (m.kind === 'tank') { if (z < 2) continue; const s = Math.max(3, 2.5 * z); ctx.fillStyle = light ? '#0891b2' : '#22d3ee'; ctx.beginPath(); ctx.arc(sx, sy, s, 0, Math.PI * 2); ctx.fill() }
        else if (m.kind === 'nps') {
          const alert = !!(m.score && m.score > 0.8)
          const s = Math.max(3, (alert ? 5 : 3.5) * Math.sqrt(z))
          ctx.fillStyle = alert ? '#e76a6e' : light ? '#2d72d2' : '#8abbff'
          ctx.fillRect(sx - s, sy - s, s * 2, s * 2)
          if (alert) {
            const born = anomalyBorn.current.get(m.id) ?? (anomalyBorn.current.set(m.id, now), now); const age = now - born
            const ph = ((age % 1600) / 1600); if (!rm) { ctx.strokeStyle = `rgba(231,106,110,${(1 - ph) * 0.7})`; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(sx, sy, s + 4 + ph * 18, 0, Math.PI * 2); ctx.stroke() }
            ctx.strokeStyle = 'rgba(231,106,110,0.9)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(sx, sy, s + 4, 0, Math.PI * 2); ctx.stroke()
          }
          if (alert || showLabel(1.6)) { ctx.fillStyle = alert ? textCol : dimCol; ctx.font = `${alert ? 600 : 400} ${pr.wall ? 16 : 11}px ${FONT}`; ctx.fillText(m.label || '', sx + s + 5, sy + 4) }
        }
        else if (m.kind === 'refinery') { const s = Math.max(3, 3.4 * Math.sqrt(z)); ctx.fillStyle = light ? '#b07a1f' : 'rgba(236,154,60,0.85)'; ctx.beginPath(); ctx.moveTo(sx, sy - s); ctx.lineTo(sx + s, sy + s * 0.8); ctx.lineTo(sx - s, sy + s * 0.8); ctx.closePath(); ctx.fill(); if (showLabel(1.6)) { ctx.fillStyle = dimCol; ctx.font = `${pr.wall ? 15 : 11}px ${FONT}`; ctx.fillText(m.label || '', sx + s + 4, sy + 4) } }
        else if (m.kind === 'terminal') { const s = Math.max(3.5, 4 * Math.sqrt(z)); ctx.strokeStyle = light ? '#1c2127' : '#f6f7f9'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(sx, sy, s, 0, Math.PI * 2); ctx.stroke(); ctx.fillStyle = light ? '#1c2127' : '#f6f7f9'; ctx.beginPath(); ctx.arc(sx, sy, s * 0.35, 0, Math.PI * 2); ctx.fill(); if (showLabel(1.2)) { ctx.fillStyle = dimCol; ctx.font = `${pr.wall ? 15 : 11}px ${FONT}`; ctx.fillText(m.label || '', sx + s + 4, sy + 4) } }
        else if (m.kind === 'vehicle') { if (z < 1.5) continue; ctx.fillStyle = dimCol; ctx.beginPath(); ctx.moveTo(sx, sy - 3); ctx.lineTo(sx + 3, sy + 2.5); ctx.lineTo(sx - 3, sy + 2.5); ctx.closePath(); ctx.fill() }
        else if (m.kind === 'anomaly') { const r = Math.max(3, (m.score || 0.5) * 6 * Math.sqrt(z)); ctx.fillStyle = 'rgba(231,106,110,0.35)'; ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = '#e76a6e'; ctx.lineWidth = 1; ctx.stroke() }
        else if (m.kind === 'incident') { const s = Math.max(3, 4 * Math.sqrt(z)); ctx.fillStyle = '#e76a6e'; ctx.beginPath(); ctx.moveTo(sx, sy - s); ctx.lineTo(sx + s, sy); ctx.lineTo(sx, sy + s); ctx.lineTo(sx - s, sy); ctx.closePath(); ctx.fill() }
        if (sel || hv) { ctx.strokeStyle = sel ? textCol : dimCol; ctx.lineWidth = 1; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.arc(sx, sy, 10 + 2 * Math.sqrt(z), 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]); if (hv && m.kind !== 'nps' && m.kind !== 'refinery' && m.kind !== 'terminal') { ctx.fillStyle = textCol; ctx.font = `500 12px ${FONT}`; ctx.fillText(m.label || m.id, sx + 14, sy - 12) } }
        ctx.globalAlpha = 1
      }
      // heat layer (counterparty risk around assets)
      if (pr.layers.heat) for (const m of pr.markers) if (m.risk != null && m.risk > 0.4) { const [sx, sy] = toScreen(m.x, m.y); const r = 30 * Math.sqrt(z); const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, r); g.addColorStop(0, `rgba(231,106,110,${m.risk * 0.35})`); g.addColorStop(1, 'rgba(231,106,110,0)'); ctx.fillStyle = g; ctx.fillRect(sx - r, sy - r, r * 2, r * 2) }
      if (pr.staleLayer) { ctx.fillStyle = '#e76a6e'; ctx.font = `${pr.wall ? 16 : 11}px ${MONO}`; ctx.fillText(`⚠ ${pr.staleLayer.text}`, 12, h - 12) }
      if (pr.timeOffsetH) { ctx.fillStyle = '#ec9a3c'; ctx.font = `${pr.wall ? 16 : 11}px ${MONO}`; ctx.fillText(`◷ состояние −${pr.timeOffsetH} ч`, w - 150, h - 12) }
      if (running) raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)
    const vis = () => { if (document.visibilityState === 'hidden') { running = false; cancelAnimationFrame(raf) } else if (!running) { running = true; last = performance.now(); raf = requestAnimationFrame(draw) } }
    document.addEventListener('visibilitychange', vis)
    return () => { running = false; cancelAnimationFrame(raf); ro.disconnect(); document.removeEventListener('visibilitychange', vis) }
  }, [])

  const hit = (sx: number, sy: number): MapMarker | null => {
    let best: MapMarker | null = null; let bd = 12
    const L = p.layers
    for (const m of p.markers) {
      if (m.kind === 'field' && !L.fields) continue
      if ((m.kind === 'well' || m.kind === 'pad') && (!L.wells || cam.current.z < 1.2)) continue
      if (m.kind === 'vehicle' && !L.vehicles) continue; if (m.kind === 'tank' && !L.tanks) continue
      const [x, y] = toScreen(m.x, m.y); const d = Math.hypot(x - sx, y - sy); const pri = m.kind === 'nps' ? 0.6 : m.kind === 'anomaly' || m.kind === 'incident' ? 0.7 : m.kind === 'field' ? 1.3 : 1
      if (d * pri < bd) { bd = d * pri; best = m }
    }
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
          if (d.lasso && lasso) { const x0 = Math.min(lasso.x0, lasso.x1), x1 = Math.max(lasso.x0, lasso.x1), y0 = Math.min(lasso.y0, lasso.y1), y1 = Math.max(lasso.y0, lasso.y1); const ids = p.markers.filter(m => m.kind !== 'anomaly').filter(m => { const [sx, sy] = toScreen(m.x, m.y); return sx >= x0 && sx <= x1 && sy >= y0 && sy <= y1 }).map(m => m.id); setLasso(null); p.onLasso?.(ids); return }
          setLasso(null)
          if (Math.hypot(e.clientX - d.x, e.clientY - d.y) < 4) { const m = hit(e.nativeEvent.offsetX, e.nativeEvent.offsetY); p.onSelect(m?.id ?? null) }
        }}
        onMouseLeave={() => { drag.current = null; setLasso(null) }}
      />
      {lasso && <div style={{ position: 'absolute', left: Math.min(lasso.x0, lasso.x1), top: Math.min(lasso.y0, lasso.y1), width: Math.abs(lasso.x1 - lasso.x0), height: Math.abs(lasso.y1 - lasso.y0), border: '1px dashed var(--sp-accent)', background: 'var(--sp-accent-dim)', pointerEvents: 'none' }} />}
    </div>
  )
}

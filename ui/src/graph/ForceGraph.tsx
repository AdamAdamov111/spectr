// Canvas force graph (production: Sigma.js + graphology ForceAtlas2 in a Worker, spec 8.8).
// Spring fly-out on expand (MO-19 spring 180/22), sequential path highlight (60 ms per edge), LOD labels, policy-hidden nodes as outlines with a lock.
import { useEffect, useImperativeHandle, useRef, forwardRef } from 'react'
import { reducedMotion } from '../app/store'

export interface GNode { id: string; label: string; type: string; color: string; hidden?: boolean; size?: number; parent?: string; pinned?: boolean; ts?: number; root?: boolean }
export interface GLink { id: string; from: string; to: string; confidence: number; type: string; label: string; dashed?: boolean; ts?: number }
export interface GraphHandle { fit: () => void; exportPng: (watermark: string) => string; positions: () => Record<string, [number, number]>; focus: (id: string) => void }

interface Props { nodes: GNode[]; links: GLink[]; selected?: string | null; onSelect: (id: string | null) => void; onExpand?: (id: string) => void; onContext?: (id: string, x: number, y: number) => void; pathLinks?: string[]; pathNodes?: string[]; dimOthers?: boolean; timeCut?: number; theme?: 'dark' | 'light'; layoutKey?: string; showLabels?: boolean; onDropObject?: (id: string, x: number, y: number) => void; mini?: boolean; wall?: boolean }

interface P { x: number; y: number; vx: number; vy: number; fx?: number; fy?: number; born: number }

export const ForceGraph = forwardRef<GraphHandle, Props>(function ForceGraph(p, ref) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const mini = useRef<HTMLCanvasElement>(null)
  const pos = useRef(new Map<string, P>())
  const cam = useRef({ x: 0, y: 0, z: 1 })
  const propsRef = useRef(p); propsRef.current = p
  const hover = useRef<string | null>(null)
  const drag = useRef<{ id?: string; sx: number; sy: number; cx: number; cy: number; moved: boolean } | null>(null)
  const pathStart = useRef<number>(0)
  const size = useRef({ w: 0, h: 0 })
  const alpha = useRef(1)

  const toScreen = (x: number, y: number) => { const c = cam.current; const { w, h } = size.current; return [(x - c.x) * c.z + w / 2, (y - c.y) * c.z + h / 2] as [number, number] }
  const toWorld = (sx: number, sy: number) => { const c = cam.current; const { w, h } = size.current; return [(sx - w / 2) / c.z + c.x, (sy - h / 2) / c.z + c.y] as [number, number] }

  useImperativeHandle(ref, () => ({
    fit: () => fit(),
    focus: (id: string) => { const q = pos.current.get(id); if (q) cam.current = { ...cam.current, x: q.x, y: q.y } },
    positions: () => Object.fromEntries([...pos.current].map(([k, v]) => [k, [v.x, v.y] as [number, number]])),
    exportPng: (watermark: string) => { const c = canvas.current!; const out = document.createElement('canvas'); out.width = c.width; out.height = c.height; const ctx = out.getContext('2d')!; ctx.drawImage(c, 0, 0); ctx.fillStyle = 'rgba(245,158,11,0.55)'; ctx.font = `${16 * devicePixelRatio}px monospace`; ctx.fillText(watermark, 16 * devicePixelRatio, out.height - 16 * devicePixelRatio); ctx.save(); ctx.globalAlpha = 0.08; ctx.translate(out.width / 2, out.height / 2); ctx.rotate(-0.4); ctx.font = `${72 * devicePixelRatio}px monospace`; ctx.textAlign = 'center'; ctx.fillText(watermark.split('·')[0], 0, 0); ctx.restore(); return out.toDataURL('image/png') },
  }))
  function fit() {
    const ps = [...pos.current.values()]; if (!ps.length) return
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
    for (const q of ps) { x0 = Math.min(x0, q.x); y0 = Math.min(y0, q.y); x1 = Math.max(x1, q.x); y1 = Math.max(y1, q.y) }
    const { w, h } = size.current; const z = Math.min(2.2, Math.max(0.45, Math.min(w / (x1 - x0 + 160), h / (y1 - y0 + 160))))
    cam.current = { x: (x0 + x1) / 2, y: (y0 + y1) / 2, z }
  }

  // sync node positions: spawn new nodes near parent with outward velocity (spring fly-out)
  useEffect(() => {
    const now = performance.now(); const rm = reducedMotion()
    const ids = new Set(p.nodes.map(n => n.id))
    for (const id of [...pos.current.keys()]) if (!ids.has(id)) pos.current.delete(id)
    let i = 0
    for (const n of p.nodes) {
      if (pos.current.has(n.id)) continue
      const par = n.parent ? pos.current.get(n.parent) : undefined
      const a = (i++ * 2.399) % (Math.PI * 2)
      if (par) { const r = rm ? 120 : 6; pos.current.set(n.id, { x: par.x + Math.cos(a) * r, y: par.y + Math.sin(a) * r, vx: rm ? 0 : Math.cos(a) * 14, vy: rm ? 0 : Math.sin(a) * 14, born: now }) }
      else { const r = 60 + Math.sqrt(i) * 40; pos.current.set(n.id, { x: Math.cos(a) * r, y: Math.sin(a) * r, vx: 0, vy: 0, born: now }) }
    }
    alpha.current = 1
    if (p.nodes.length && p.nodes.every(n => (now - (pos.current.get(n.id)?.born ?? 0)) < 50)) setTimeout(fit, 400)
  }, [p.nodes])
  useEffect(() => { pathStart.current = performance.now() }, [p.pathLinks])

  useEffect(() => {
    const c = canvas.current!
    const onWheel = (e: WheelEvent) => { e.preventDefault(); const [wx, wy] = toWorld(e.offsetX, e.offsetY); const cc = cam.current; const nz = Math.min(4, Math.max(0.15, cc.z * (e.deltaY < 0 ? 1.12 : 0.89))); const k = nz / cc.z; cam.current = { x: wx - (wx - cc.x) / k, y: wy - (wy - cc.y) / k, z: nz } }
    c.addEventListener('wheel', onWheel, { passive: false })
    return () => c.removeEventListener('wheel', onWheel)
  }, [])

  useEffect(() => {
    const c = canvas.current!; const ctx = c.getContext('2d')!
    let raf = 0; let running = true; let last = performance.now()
    const fitSize = () => { const r = c.getBoundingClientRect(); size.current = { w: r.width, h: r.height }; c.width = r.width * devicePixelRatio; c.height = r.height * devicePixelRatio }
    fitSize(); const ro = new ResizeObserver(fitSize); ro.observe(c)
    const step = (dt: number) => {
      const pr = propsRef.current; const ps = pos.current
      const nodes = pr.nodes; const n = nodes.length
      if (!n) return
      const a = alpha.current
      const k = Math.min(1, dt * 60)
      // repulsion O(n²) (n ≤ ~400 on the stand)
      const arr = nodes.map(x => ps.get(x.id)!)
      for (let i = 0; i < n; i++) { const A = arr[i]; if (!A) continue; for (let j = i + 1; j < n; j++) { const B = arr[j]; if (!B) continue; let dx = A.x - B.x, dy = A.y - B.y; let d2 = dx * dx + dy * dy + 0.01; if (d2 > 90000) continue; const d = Math.sqrt(d2); const f = (2600 * a) / d2; dx = (dx / d) * f; dy = (dy / d) * f; A.vx += dx * k; A.vy += dy * k; B.vx -= dx * k; B.vy -= dy * k } }
      // springs
      for (const l of pr.links) { const A = ps.get(l.from), B = ps.get(l.to); if (!A || !B) continue; const dx = B.x - A.x, dy = B.y - A.y; const d = Math.sqrt(dx * dx + dy * dy) + 0.01; const rest = 70 + (1 - l.confidence) * 40; const f = ((d - rest) * 0.012 * a); A.vx += (dx / d) * f * k; A.vy += (dy / d) * f * k; B.vx -= (dx / d) * f * k; B.vy -= (dy / d) * f * k }
      // gravity to centre + integrate (damping ≈ spring 180/22)
      for (let i = 0; i < n; i++) { const P = arr[i]; if (!P) continue; P.vx -= P.x * 0.0009 * a * k; P.vy -= P.y * 0.0009 * a * k; if (P.fx != null) { P.x = P.fx; P.y = P.fy!; P.vx = 0; P.vy = 0; continue } P.vx *= 0.86; P.vy *= 0.86; P.x += P.vx * k; P.y += P.vy * k }
      alpha.current = Math.max(0.05, a - dt * 0.12)
    }
    const draw = (t: number) => {
      const dt = Math.min(0.05, (t - last) / 1000); last = t
      const pr = propsRef.current; const { w, h } = size.current; const light = pr.theme === 'light'
      if (!reducedMotion() || alpha.current > 0.5) step(dt)
      ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0)
      ctx.fillStyle = light ? '#f0f3f6' : '#070b11'; ctx.fillRect(0, 0, w, h)
      const z = cam.current.z
      const hov = hover.current
      const neigh = new Set<string>()
      if (hov) { neigh.add(hov); for (const l of pr.links) { if (l.from === hov) neigh.add(l.to); if (l.to === hov) neigh.add(l.from) } }
      const pathSet = new Map<string, number>(); (pr.pathLinks || []).forEach((id, i) => pathSet.set(id, i))
      const pathNodes = new Set(pr.pathNodes || [])
      const lit = pr.pathLinks?.length ? Math.floor((t - pathStart.current) / 60) : -1
      const focusMode = !!(pr.pathLinks?.length) || (!!pr.dimOthers && pathNodes.size > 0)
      const cut = pr.timeCut
      // links
      for (const l of pr.links) {
        if (cut && l.ts && l.ts > cut) continue
        const A = pos.current.get(l.from), B = pos.current.get(l.to); if (!A || !B) continue
        const [ax, ay] = toScreen(A.x, A.y), [bx, by] = toScreen(B.x, B.y)
        const pi = pathSet.get(l.id)
        const onPath = pi != null && pi <= lit
        let alphaL = hov ? (neigh.has(l.from) && neigh.has(l.to) ? 0.9 : 0.12) : 0.55
        if (focusMode && !onPath && !(pr.dimOthers && pathNodes.has(l.from) && pathNodes.has(l.to))) alphaL *= 0.25
        ctx.strokeStyle = onPath ? '#22d3ee' : light ? `rgba(60,75,90,${alphaL})` : `rgba(147,161,176,${alphaL})`
        ctx.lineWidth = onPath ? 3 : Math.max(0.6, l.confidence * 2.2 * Math.min(1, z))
        if (l.confidence < 0.6 || l.dashed) ctx.setLineDash([4, 4]); else ctx.setLineDash([])
        if (onPath) { ctx.shadowColor = '#22d3ee'; ctx.shadowBlur = 10 }
        ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke(); ctx.shadowBlur = 0; ctx.setLineDash([])
        if ((hov && neigh.has(l.from) && neigh.has(l.to)) || onPath) { ctx.fillStyle = light ? '#334' : '#93a1b0'; ctx.font = `${pr.wall ? 14 : 10}px "Inter Variable", sans-serif`; ctx.fillText(l.label, (ax + bx) / 2 + 4, (ay + by) / 2 - 4) }
      }
      // nodes
      const showLabels = pr.showLabels !== false && pr.nodes.length <= 2000
      for (const nd of pr.nodes) {
        if (cut && nd.ts && nd.ts > cut) continue
        const P = pos.current.get(nd.id); if (!P) continue
        const [sx, sy] = toScreen(P.x, P.y)
        if (sx < -30 || sy < -30 || sx > w + 30 || sy > h + 30) continue
        const r = (nd.size ?? (nd.root ? 11 : 7)) * Math.max(0.6, Math.min(1.6, z))
        const isSel = pr.selected === nd.id; const isHov = hov === nd.id
        let alphaN = hov ? (neigh.has(nd.id) ? 1 : 0.2) : 1
        if (focusMode && !pathNodes.has(nd.id)) alphaN *= 0.35
        ctx.globalAlpha = alphaN
        const born = t - P.born; const pop = born < 500 && !reducedMotion() ? 0.6 + 0.4 * (1 - Math.pow(1 - Math.min(1, born / 500), 3)) : 1
        if (nd.hidden) { ctx.strokeStyle = light ? '#7b8896' : '#5c6b7a'; ctx.lineWidth = 1.2; ctx.setLineDash([3, 2]); ctx.beginPath(); ctx.arc(sx, sy, r * pop, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle = light ? '#7b8896' : '#5c6b7a'; ctx.font = `${Math.round(r * 1.1)}px sans-serif`; ctx.textAlign = 'center'; ctx.fillText('🔒', sx, sy + r * 0.4); ctx.textAlign = 'left' }
        else {
          ctx.fillStyle = nd.color; if (isSel || isHov) { ctx.shadowColor = nd.color; ctx.shadowBlur = 18 }
          ctx.beginPath(); ctx.arc(sx, sy, r * pop, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0
          if (isSel) { ctx.strokeStyle = '#22d3ee'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(sx, sy, r * pop + 4, 0, Math.PI * 2); ctx.stroke() }
          if (nd.pinned) { ctx.fillStyle = light ? '#0e1620' : '#e6edf3'; ctx.beginPath(); ctx.arc(sx + r * 0.7, sy - r * 0.7, 2.5, 0, Math.PI * 2); ctx.fill() }
          if (showLabels && (z > 0.4 || isSel || isHov || nd.root)) { ctx.fillStyle = light ? '#0e1620' : isSel || isHov ? '#e6edf3' : '#c7d0d9'; ctx.font = `${isSel || nd.root ? 600 : 400} ${pr.wall ? 16 : 11}px "Inter Variable", sans-serif`; ctx.fillText(nd.label.length > 28 ? nd.label.slice(0, 27) + '…' : nd.label, sx + r + 5, sy + 4) }
        }
        ctx.globalAlpha = 1
      }
      // minimap
      const mc = mini.current
      if (mc && !pr.mini) { const mctx = mc.getContext('2d')!; mc.width = 140 * devicePixelRatio; mc.height = 90 * devicePixelRatio; mctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0); mctx.fillStyle = light ? 'rgba(255,255,255,0.7)' : 'rgba(13,19,27,0.85)'; mctx.fillRect(0, 0, 140, 90); const ps = [...pos.current.values()]; if (ps.length) { let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const q of ps) { x0 = Math.min(x0, q.x); y0 = Math.min(y0, q.y); x1 = Math.max(x1, q.x); y1 = Math.max(y1, q.y) } const sc = Math.min(120 / (x1 - x0 + 1), 70 / (y1 - y0 + 1)); const mx = (x: number) => 10 + (x - x0) * sc, my = (y: number) => 10 + (y - y0) * sc; for (const nd of pr.nodes) { const q = pos.current.get(nd.id); if (!q) continue; mctx.fillStyle = nd.color; mctx.fillRect(mx(q.x) - 1, my(q.y) - 1, 2, 2) } const [vx0, vy0] = toWorld(0, 0), [vx1, vy1] = toWorld(w, h); mctx.strokeStyle = '#22d3ee'; mctx.lineWidth = 1; mctx.strokeRect(mx(vx0), my(vy0), (vx1 - vx0) * sc, (vy1 - vy0) * sc) } }
      if (running) raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)
    const vis = () => { if (document.visibilityState === 'hidden') { running = false; cancelAnimationFrame(raf) } else if (!running) { running = true; last = performance.now(); raf = requestAnimationFrame(draw) } }
    document.addEventListener('visibilitychange', vis)
    return () => { running = false; cancelAnimationFrame(raf); ro.disconnect(); document.removeEventListener('visibilitychange', vis) }
  }, [])

  const hit = (sx: number, sy: number): string | null => { let best: string | null = null; let bd = 16; for (const nd of p.nodes) { const P = pos.current.get(nd.id); if (!P) continue; const [x, y] = toScreen(P.x, P.y); const d = Math.hypot(x - sx, y - sy); if (d < bd) { bd = d; best = nd.id } } return best }
  return (
    <div className="graph-wrap" style={{ position: 'relative', width: '100%', height: '100%' }} onDragOver={e => { if (e.dataTransfer.types.includes('text/spectr-object')) e.preventDefault() }} onDrop={e => { const id = e.dataTransfer.getData('text/spectr-object'); if (id) { e.preventDefault(); const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); const [wx, wy] = toWorld(e.clientX - r.left, e.clientY - r.top); pos.current.set(id, { x: wx, y: wy, vx: 0, vy: 0, born: performance.now() }); p.onDropObject?.(id, wx, wy) } }}>
      <canvas ref={canvas} style={{ width: '100%', height: '100%', display: 'block', cursor: hover.current ? 'pointer' : 'grab' }}
        onMouseDown={e => { const id = hit(e.nativeEvent.offsetX, e.nativeEvent.offsetY) ?? undefined; drag.current = { id, sx: e.clientX, sy: e.clientY, cx: cam.current.x, cy: cam.current.y, moved: false }; if (id) { const P = pos.current.get(id)!; P.fx = P.x; P.fy = P.y } }}
        onMouseMove={e => {
          const d = drag.current
          if (d) { d.moved = d.moved || Math.hypot(e.clientX - d.sx, e.clientY - d.sy) > 3; if (d.id) { const P = pos.current.get(d.id)!; const [wx, wy] = toWorld(e.nativeEvent.offsetX, e.nativeEvent.offsetY); P.fx = wx; P.fy = wy; alpha.current = Math.max(alpha.current, 0.4) } else { cam.current = { ...cam.current, x: d.cx - (e.clientX - d.sx) / cam.current.z, y: d.cy - (e.clientY - d.sy) / cam.current.z } } return }
          hover.current = hit(e.nativeEvent.offsetX, e.nativeEvent.offsetY)
        }}
        onMouseUp={e => { const d = drag.current; drag.current = null; if (!d) return; if (d.id) { const P = pos.current.get(d.id); const nd = p.nodes.find(x => x.id === d.id); if (P && !nd?.pinned) { P.fx = undefined; P.fy = undefined } } if (!d.moved) p.onSelect(hit(e.nativeEvent.offsetX, e.nativeEvent.offsetY)) }}
        onDoubleClick={e => { const id = hit(e.nativeEvent.offsetX, e.nativeEvent.offsetY); if (id) p.onExpand?.(id) }}
        onContextMenu={e => { e.preventDefault(); const id = hit(e.nativeEvent.offsetX, e.nativeEvent.offsetY); if (id) p.onContext?.(id, e.nativeEvent.offsetX, e.nativeEvent.offsetY) }}
        onMouseLeave={() => { hover.current = null; drag.current = null }}
      />
      {!p.mini && <canvas ref={mini} className="graph-minimap" style={{ position: 'absolute', right: 8, bottom: 8, width: 140, height: 90, border: '1px solid var(--sp-border)', borderRadius: 4 }} />}
    </div>
  )
})

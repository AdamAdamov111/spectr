import { useEffect, useRef } from 'react'

/** Tiny canvas sparkline with gradient fill (Tremor-style KPI accent). */
export function Sparkline({ data, width = 84, height = 26, color = '#22d3ee' }: { data: number[]; width?: number; height?: number; color?: string }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const c = ref.current; if (!c || !data.length) return
    c.width = width * devicePixelRatio; c.height = height * devicePixelRatio
    const ctx = c.getContext('2d')!; ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0)
    const min = Math.min(...data), max = Math.max(...data); const span = max - min || 1
    const pts = data.map((v, i) => [ (i / (data.length - 1)) * (width - 2) + 1, height - 2 - ((v - min) / span) * (height - 6) ] as [number, number])
    const g = ctx.createLinearGradient(0, 0, 0, height); g.addColorStop(0, color + '55'); g.addColorStop(1, color + '00')
    ctx.beginPath(); ctx.moveTo(pts[0][0], height); pts.forEach(p => ctx.lineTo(p[0], p[1])); ctx.lineTo(pts[pts.length - 1][0], height); ctx.closePath(); ctx.fillStyle = g; ctx.fill()
    ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.lineJoin = 'round'; ctx.stroke()
    const last = pts[pts.length - 1]; ctx.beginPath(); ctx.arc(last[0], last[1], 2, 0, Math.PI * 2); ctx.fillStyle = color; ctx.shadowColor = color; ctx.shadowBlur = 6; ctx.fill()
  }, [data.join(','), width, height, color])
  return <canvas ref={ref} style={{ width, height, display: 'block' }} />
}

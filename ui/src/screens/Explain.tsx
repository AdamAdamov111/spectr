// U5 Explain — provenance pulse (MO-14): edges draw from the value towards raw rows, 260 ms per level, nodes light up as data "arrives".
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { get as getObject, explain, type ExplainNode, logRead } from '../data/api'
import { useSimulatedSession, useStore, reducedMotion } from '../app/store'
import { CopyButton, Empty, Markings, PolicyDenied } from '../components/ui'
import { decide } from '../data/security'
import { TYPES } from '../data/ontology'
import { hexHash } from '../data/rng'

const KIND_LABEL: Record<ExplainNode['kind'], string> = { value: 'ЗНАЧЕНИЕ', function: 'ФУНКЦИЯ', pipeline: 'ПАЙПЛАЙН', dataset: 'ДАТАСЕТ', raw: 'СЫРАЯ СТРОКА', action: 'ДЕЙСТВИЕ', policy: 'ПОЛИТИКА', model: 'МОДЕЛЬ' }

export function ExplainView({ id, prop, full }: { id: string; prop: string; full?: boolean }) {
  const o = getObject(id); const session = useSimulatedSession()
  const [t0] = useState(() => performance.now())
  const [now, setNow] = useState(t0)
  const [rects, setRects] = useState<Record<string, DOMRect>>({})
  const [hoverPath, setHoverPath] = useState<Set<string>>(new Set())
  const [open, setOpen] = useState<Set<string>>(new Set())
  const [rawShown, setRawShown] = useState<string | null>(null)
  const wrap = useRef<HTMLDivElement>(null)
  const rm = reducedMotion()
  const toast = useStore(s => s.toast)
  const data = useMemo(() => (o ? explain(session, o, prop) : null), [id, prop, session.purpose, session.login])
  const levels = useMemo(() => { const out: ExplainNode[][] = []; const walk = (n: ExplainNode) => { (out[n.level] ||= []).push(n); n.children.forEach(walk) }; if (data) walk(data.root); return out }, [data])
  const parents = useMemo(() => { const m = new Map<string, ExplainNode>(); const walk = (n: ExplainNode) => { for (const c of n.children) { m.set(c.id, n); walk(c) } }; if (data) walk(data.root); return m }, [data])
  useEffect(() => { if (rm) { setNow(t0 + 10000); return } let raf = 0; const f = () => { setNow(performance.now()); if (performance.now() - t0 < levels.length * 260 + 600) raf = requestAnimationFrame(f) }; raf = requestAnimationFrame(f); return () => cancelAnimationFrame(raf) }, [levels.length])
  useLayoutEffect(() => {
    const el = wrap.current; if (!el) return
    const measure = () => { const base = el.getBoundingClientRect(); const out: Record<string, DOMRect> = {}; el.querySelectorAll<HTMLElement>('[data-xid]').forEach(n => { const r = n.getBoundingClientRect(); out[n.dataset.xid!] = new DOMRect(r.left - base.left + el.scrollLeft, r.top - base.top + el.scrollTop, r.width, r.height) }); setRects(out) }
    measure(); const ro = new ResizeObserver(measure); ro.observe(el); el.querySelectorAll<HTMLElement>('[data-xid]').forEach(n => ro.observe(n)); return () => ro.disconnect()
  }, [levels, open, rawShown])
  if (!o || !data) return <Empty text="Объект не найден" />
  const pd = TYPES[o.type].props.find(p => p.name === prop)
  const dec = decide(session, [...o.markings, ...(pd?.markings || [])])
  if (!dec.allow) return <div style={{ padding: 12 }}><PolicyDenied markings={[...o.markings, ...(pd?.markings || [])]} alternative={dec.alternativePurpose} title="Explain недоступен: свойство замаскировано" /></div>
  const elapsed = now - t0
  const lit = (n: ExplainNode) => rm || elapsed >= n.level * 260
  const proof = () => JSON.stringify({ object: o.id, property: prop, ontology_version: '1.4.2', policy_decision: data.policy.decision, purpose: data.policy.purpose, chain: flatten(data.root).map(n => ({ kind: n.kind, title: n.title, ...n.details })), root_hash: hexHash(o.id + prop, 64) }, null, 2)
  const pathTo = (nid: string) => { const s = new Set<string>(); let cur: ExplainNode | undefined = flatten(data.root).find(n => n.id === nid); while (cur) { s.add(cur.id); cur = parents.get(cur.id) } return s }
  return (
    <div className={`explain ${full ? 'explain-full' : ''}`}>
      <div className="explain-top">
        <span className="label" style={{ margin: 0 }}>Происхождение</span><b>{o.label}</b><span className="mono">.{prop}</span><span className="grow" />
        <CopyButton text={proof()} label="Скопировать доказательство" />
      </div>
      <div className="explain-canvas" ref={wrap}>
        <svg className="explain-edges" width="100%" height="100%">
          {flatten(data.root).filter(n => parents.has(n.id)).map(n => { const p = parents.get(n.id)!; const a = rects[p.id], b = rects[n.id]; if (!a || !b) return null; const x1 = a.right, y1 = a.top + a.height / 2, x2 = b.left, y2 = b.top + b.height / 2; const d = `M${x1},${y1} C${x1 + 30},${y1} ${x2 - 30},${y2} ${x2},${y2}`; const on = hoverPath.has(n.id) && hoverPath.has(p.id); const show = lit(n); return <path key={n.id} d={d} className={`xedge ${on ? 'on' : ''} ${show ? 'draw' : ''}`} style={{ animationDelay: rm ? '0ms' : `${Math.max(0, (n.level - 1) * 260 - Math.min(elapsed, (n.level - 1) * 260))}ms` }} pathLength={1} /> })}
        </svg>
        <div className="explain-levels">
          {levels.map((nodes, li) => (
            <div key={li} className="explain-level">
              <div className="explain-level-h">{li === 0 ? 'ЗНАЧЕНИЕ' : li === levels.length - 1 ? 'ИСТОЧНИК' : `УРОВЕНЬ ${li}`}</div>
              {nodes.map(n => (
                <div key={n.id} data-xid={n.id} className={`xnode xnode-${n.kind} ${lit(n) ? 'lit' : ''} ${hoverPath.has(n.id) ? 'on' : ''}`} onMouseEnter={() => n.kind === 'raw' && setHoverPath(pathTo(n.id))} onMouseLeave={() => setHoverPath(new Set())} onClick={() => setOpen(s => { const c = new Set(s); c.has(n.id) ? c.delete(n.id) : c.add(n.id); return c })}>
                  <div className="xnode-k">{KIND_LABEL[n.kind]}</div>
                  <div className="xnode-t">{n.title}</div>
                  {n.subtitle && <div className="xnode-s mono">{n.subtitle}</div>}
                  {(open.has(n.id) || n.kind === 'value' || n.kind === 'raw') && <table className="kv xnode-d"><tbody>{Object.entries(n.details).map(([k, v]) => <tr key={k}><td className="dim">{k}</td><td className="mono">{v}</td></tr>)}</tbody></table>}
                  {n.code && open.has(n.id) && <div className="code" style={{ marginTop: 6 }}>{n.code.map((l, i) => <div key={i} className={l.startsWith('+') ? 'add' : l.startsWith('-') ? 'del' : ''}>{l}</div>)}</div>}
                  {n.kind === 'raw' && <div className="row" style={{ marginTop: 6 }}><button className="btn btn-xs" onClick={e => { e.stopPropagation(); setRawShown(rawShown === n.id ? null : n.id); logRead(session, 'read.raw', [o.id], n.title) }}>{rawShown === n.id ? 'Скрыть строку' : 'Открыть сырую строку'}</button></div>}
                  {rawShown === n.id && n.raw && <div className="code" style={{ marginTop: 6, whiteSpace: 'pre-wrap', maxWidth: 360 }}>{n.raw}</div>}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
      <div className="explain-policy mono">policy: markings {'{'}{data.policy.markings.join(', ')}{'}'} · decision <b>{data.policy.decision}</b> · purpose {data.policy.purpose} · <Markings list={data.policy.markings} small /><span className="grow" /><button className="btn btn-xs" onClick={() => toast({ text: 'Дерево происхождения зафиксировано в аудите как explain-запрос', kind: 'info' })}>ok</button></div>
    </div>
  )
}
function flatten(n: ExplainNode): ExplainNode[] { return [n, ...n.children.flatMap(flatten)] }

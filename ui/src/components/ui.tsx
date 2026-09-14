import { useEffect, useRef, useState, type ReactNode, type CSSProperties, type MouseEvent } from 'react'
import { Lock, X, Pin, PinOff, Copy, Check, CircleAlert } from 'lucide-react'
import type { Marking, ObjectType } from '../data/ontology'
import { TYPES, isLevel, srcLabel } from '../data/ontology'
import type { SpObject } from '../data/types'
import { markingColor, MARKING_LABEL, viewProps, PURPOSE_LABELS, decide } from '../data/security'
import { freshnessOf, get as getObject, logRead } from '../data/api'
import { fmtAgo, fmtMoney, fmtNum, fmtDateTime } from '../data/rng'
import { useStore, reducedMotion } from '../app/store'
import { TYPE_ICONS } from './icons'

// ---------- Marking badges ----------
export function MarkingBadge({ m, small }: { m: Marking; small?: boolean }) {
  if (m === 'SYNTHETIC') return null
  const level = isLevel(m)
  return <span className={`mk ${level ? 'mk-level' : 'mk-cat'} ${small ? 'mk-sm' : ''}`} style={{ ['--c' as string]: markingColor(m) }} title={MARKING_LABEL[m]}>{m}</span>
}
export function Markings({ list, small }: { list: Marking[]; small?: boolean }) {
  return <span className="mks">{list.filter(m => m !== 'SYNTHETIC').map(m => <MarkingBadge key={m} m={m} small={small} />)}</span>
}

// ---------- Freshness ----------
export function Freshness({ o, text = true, pulseKey }: { o: SpObject; text?: boolean; pulseKey?: number }) {
  const [, force] = useState(0)
  useEffect(() => { const t = setInterval(() => force(x => x + 1), 1000); return () => clearInterval(t) }, [])
  const f = freshnessOf(o)
  const inspect = useStore(s => s.inspect)
  const [pulse, setPulse] = useState(false)
  const prev = useRef(o.version)
  useEffect(() => { if (prev.current !== o.version) { prev.current = o.version; setPulse(true); const t = setTimeout(() => setPulse(false), 600); return () => clearTimeout(t) } }, [o.version, pulseKey])
  return (
    <span role="button" tabIndex={-1} className={`fresh fresh-${f.status} ${pulse ? 'fresh-pulse' : ''}`} title={`Свежесть: ${fmtAgo(f.lagSec)} при SLO ${fmtAgo(f.sloSec)}`} onClick={e => { e.stopPropagation(); inspect({ open: true, objectId: o.id, mode: 'freshness' }) }} style={{ cursor: 'pointer' }}>
      <span className="fresh-dot" />{text && <span>{fmtAgo(f.lagSec)}</span>}
    </span>
  )
}

// ---------- Object chip with hover card ----------
export function ObjectChip({ id, o: given, compact, onOpen, noHover, style }: { id?: string; o?: SpObject; compact?: boolean; onOpen?: (o: SpObject) => void; noHover?: boolean; style?: CSSProperties }) {
  const o = given ?? (id ? getObject(id) : undefined)
  const session = useStore(s => s.session)
  const openObject = useStore(s => s.openObject)
  const [hover, setHover] = useState(false)
  const timer = useRef<number>(0)
  if (!o) return <span className="chip chip-missing">объект не найден</span>
  if (session && !decide(session, o.markings).allow) return <span className="chip chip-locked" title="Объект скрыт политикой"><Lock size={12} /> <span className="mono">{o.type}</span></span>
  const Icon = TYPE_ICONS[o.type]
  const lvl = o.markings.find(isLevel) || 'INTERNAL'
  return (
    <span className={`chip-wrap`} onMouseEnter={() => { if (noHover) return; timer.current = window.setTimeout(() => setHover(true), 350) }} onMouseLeave={() => { clearTimeout(timer.current); setHover(false) }}>
      <button className={`chip ${compact ? 'chip-compact' : ''}`} style={{ ['--tc' as string]: TYPES[o.type].color, ...style }} draggable onDragStart={e => { e.dataTransfer.setData('text/spectr-object', o.id); e.dataTransfer.setData('text/plain', o.id) }}
        onClick={e => { e.stopPropagation(); onOpen ? onOpen(o) : openObject(o.id, { inspector: true, tab: e.metaKey || e.ctrlKey }) }} onDoubleClick={e => { e.stopPropagation(); openObject(o.id, { tab: true }) }} title={`${TYPES[o.type].label} · ${o.label}`}>
        <Icon size={13} className="chip-icon" />
        <span className="chip-label truncate">{o.label}</span>
        {!compact && <span className="chip-mk" style={{ background: markingColor(lvl) }} />}
        {!compact && <Freshness o={o} text={false} />}
      </button>
      {hover && <HoverCard o={o} />}
    </span>
  )
}

export function HoverCard({ o }: { o: SpObject }) {
  const session = useStore(s => s.session)
  const openObject = useStore(s => s.openObject)
  const openExplain = useStore(s => s.openExplain)
  const def = TYPES[o.type]
  const props = session ? viewProps(session, o, useStore.getState().settings.presentation).filter(p => def.props.find(d => d.name === p.name)?.key).slice(0, 5) : []
  return (
    <div className="hover-card scale-in" onClick={e => e.stopPropagation()}>
      <div className="row" style={{ justifyContent: 'space-between' }}><span className="dim">{def.label}</span><Markings list={o.markings} small /></div>
      <div className="hover-title">{o.label}</div>
      <div className="mono dim" style={{ fontSize: 11 }}>{o.id}</div>
      <table className="kv"><tbody>{props.map(p => { const d = def.props.find(x => x.name === p.name)!; return <tr key={p.name}><td className="dim">{d.label}</td><td className="mono">{p.masked ? <Masked reason={p.reason} markings={p.markings} inline /> : formatProp(p.value, d.type, d.unit)}</td></tr> })}</tbody></table>
      <div className="row" style={{ marginTop: 6, gap: 6 }}>
        <button className="btn btn-xs" onClick={() => openObject(o.id, { tab: true })}>Открыть</button>
        <button className="btn btn-xs" onClick={() => openExplain(o.id, def.props.find(p => p.key)?.name || def.props[0].name)}>Explain</button>
        <span className="grow" /><Freshness o={o} />
      </div>
    </div>
  )
}

export function Masked({ reason, markings, inline }: { reason?: string; markings?: Marking[]; inline?: boolean }) {
  const mk = markings?.find(m => !isLevel(m)) || markings?.[0]
  return <span className={`masked ${inline ? 'masked-inline' : ''}`} title={reason || 'замаскировано политикой'}><Lock size={11} /><span>{mk || 'скрыто'}</span></span>
}

export function formatProp(v: unknown, t?: string, unit?: string): string {
  if (v == null || v === '') return '—'
  if (t === 'money' && typeof v === 'number') return fmtMoney(v)
  if (t === 'bool') return v ? 'да' : 'нет'
  if (t === 'percent' && typeof v === 'number') return `${fmtNum(v, 1)} %`
  if (t === 'decimal' && typeof v === 'number') return v.toFixed(2)
  if (typeof v === 'number') return `${fmtNum(v, Number.isInteger(v) ? 0 : 1)}${unit ? ' ' + unit : ''}`
  return String(v)
}

// ---------- Policy denied ----------
export function PolicyDenied({ markings, purpose, alternative, title, compact }: { markings: Marking[]; purpose?: string; alternative?: string; title?: string; compact?: boolean }) {
  const toast = useStore(s => s.toast)
  const session = useStore(s => s.session)
  const mk = markings.filter(m => m !== 'SYNTHETIC')
  return (
    <div className={`policy-denied ${compact ? 'policy-denied-compact' : ''}`} style={{ ['--c' as string]: markingColor(mk.find(isLevel) || mk[0] || 'INTERNAL') }}>
      <div className="pd-lock"><Lock size={compact ? 14 : 20} /></div>
      <div className="pd-body">
        <div className="pd-title">{title || 'Отказ политики'}</div>
        <div className="pd-text">Данные с маркировкой <b>{mk.join(', ')}</b> недоступны под целью <span className="mono">{purpose || session?.purpose}</span>.{alternative && <> Доступно под целью <span className="mono">{alternative}</span> ({PURPOSE_LABELS[alternative]}).</>}</div>
        <div className="row" style={{ marginTop: 6 }}>
          <button className="btn btn-xs" onClick={() => { toast({ text: 'Заявка на доступ отправлена владельцу цели. Событие зафиксировано в аудите.', kind: 'info' }); if (session) logRead(session, 'access.request', [], mk.join(',')) }}>Запросить доступ</button>
          <Markings list={mk} small />
        </div>
      </div>
    </div>
  )
}

// ---------- Scramble (MO-10) ----------
const GLYPHS = '0123456789ABCDEF█▓░/\\|'
export function useScramble(text: string, opts: { active?: boolean; tick?: number; step?: number; once?: string } = {}): string {
  const [out, setOut] = useState(reducedMotion() ? text : '')
  useEffect(() => {
    if (opts.active === false) { setOut(text); return }
    if (opts.once && !useStore.getState().markScramble(opts.once)) { setOut(text); return }
    if (reducedMotion()) { setOut(text); return }
    const tick = opts.tick ?? 40, step = opts.step ?? 90
    let raf = 0; const start = performance.now(); let last = 0
    const frame = (t: number) => {
      const fixed = Math.floor((t - start) / step)
      if (t - last >= tick) {
        last = t
        let s = ''
        for (let i = 0; i < text.length; i++) s += i < fixed || text[i] === ' ' ? text[i] : GLYPHS[Math.floor(Math.random() * GLYPHS.length)]
        setOut(s)
      }
      if (fixed < text.length) raf = requestAnimationFrame(frame); else setOut(text)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [text, opts.active, opts.once])
  return out
}
export function Scramble({ text, className, once, style }: { text: string; className?: string; once?: string; style?: CSSProperties }) {
  const s = useScramble(text, { once })
  return <span className={className} style={style}>{s}</span>
}

// ---------- Count-up (MO-17) ----------
export function CountUp({ value, decimals = 0, suffix = '', prefix = '' }: { value: number; decimals?: number; suffix?: string; prefix?: string }) {
  const [v, setV] = useState(value)
  const from = useRef(value)
  useEffect(() => {
    if (reducedMotion()) { setV(value); from.current = value; return }
    const start = performance.now(); const a = from.current; const b = value; let raf = 0
    const f = (t: number) => { const k = Math.min(1, (t - start) / 400); const e = 1 - Math.pow(1 - k, 3); setV(a + (b - a) * e); if (k < 1) raf = requestAnimationFrame(f); else from.current = b }
    raf = requestAnimationFrame(f); return () => cancelAnimationFrame(raf)
  }, [value])
  return <span className="mono">{prefix}{fmtNum(v, decimals)}{suffix}</span>
}

// ---------- Confidence bar ----------
export function Confidence({ v, note }: { v: number; note?: string }) {
  return <span className="conf" title={note || `confidence ${v.toFixed(2)}`}><span className="conf-bar" style={{ width: `${Math.round(v * 100)}%`, background: v < 0.6 ? 'var(--sp-warn)' : 'var(--sp-accent)' }} /></span>
}

// ---------- Health arc ----------
export function HealthArc({ v, size = 22 }: { v: number; size?: number }) {
  const r = (size - 4) / 2; const c = 2 * Math.PI * r
  const color = v < 0.4 ? 'var(--sp-danger)' : v < 0.6 ? 'var(--sp-warn)' : 'var(--sp-ok)'
  return (
    <svg width={size} height={size} className="health-arc" style={{ ['--dash' as string]: c, ['--off' as string]: c * (1 - v) }}>
      <circle cx={size / 2} cy={size / 2} r={r} stroke="var(--sp-border)" strokeWidth={3} fill="none" />
      <circle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth={3} fill="none" strokeDasharray={c} strokeDashoffset={c * (1 - v)} strokeLinecap="round" transform={`rotate(-90 ${size / 2} ${size / 2})`} />
    </svg>
  )
}

// ---------- Panels, buttons, misc ----------
export function Panel({ title, children, actions, className, style, dense }: { title?: ReactNode; children: ReactNode; actions?: ReactNode; className?: string; style?: CSSProperties; dense?: boolean }) {
  return <section className={`panel ${dense ? 'panel-dense' : ''} ${className || ''}`} style={style}>{title != null && <header className="panel-h"><span className="panel-title">{title}</span><span className="grow" />{actions}</header>}<div className="panel-b">{children}</div></section>
}
export function Empty({ text, action, icon }: { text: string; action?: ReactNode; icon?: ReactNode }) {
  return <div className="empty">{icon || <svg width="64" height="40" viewBox="0 0 64 40" fill="none" stroke="var(--sp-text-3)" strokeWidth="1"><rect x="2" y="6" width="60" height="28" rx="3" /><path d="M2 14h60M18 14v20M40 14v20" /></svg>}<div className="empty-text">{text}</div>{action}</div>
}
export function Kbd({ k }: { k: string }) { return <kbd className="kbd">{k}</kbd> }
export function Stamp({ text, tone = 'ok', big }: { text: string; tone?: 'ok' | 'danger' | 'warn' | 'accent'; big?: boolean }) {
  return <span className={`stamp stamp-${tone} ${big ? 'stamp-big' : ''} stamp-anim`}>{text}</span>
}
export function CopyButton({ text, label = 'Скопировать', confidential }: { text: string; label?: string; confidential?: boolean }) {
  const [ok, setOk] = useState(false)
  const session = useStore(s => s.session); const toast = useStore(s => s.toast)
  return <button className="btn btn-xs" onClick={async () => { try { await navigator.clipboard.writeText(text) } catch { /* ignore */ } setOk(true); setTimeout(() => setOk(false), 1200); if (confidential && session) { logRead(session, 'copy', [], text.slice(0, 40), 'allow', 'CONFIDENTIAL+'); toast({ text: 'Копирование маркированных данных зафиксировано в аудите (событие copy)', kind: 'info' }) } }}>{ok ? <Check size={12} /> : <Copy size={12} />} {label}</button>
}
export function PinButton({ id }: { id: string }) {
  const pinned = useStore(s => s.pinned); const toggle = useStore(s => s.togglePin)
  const on = pinned.includes(id)
  return <button className={`btn-icon ${on ? 'active' : ''}`} title={on ? 'Открепить из инспектора' : 'Закрепить в инспекторе'} onClick={() => toggle(id)}>{on ? <PinOff size={14} /> : <Pin size={14} />}</button>
}
export function Modal({ title, children, onClose, width = 720 }: { title: ReactNode; children: ReactNode; onClose: () => void; width?: number }) {
  useEffect(() => { const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }; window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h) }, [onClose])
  return <div className="modal-back fade-in" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}><div className="modal scale-in" style={{ width }}><header className="modal-h"><span>{title}</span><span className="grow" /><button className="btn-icon" onClick={onClose}><X size={16} /></button></header><div className="modal-b">{children}</div></div></div>
}
export function Toasts() {
  const toasts = useStore(s => s.toasts); const dismiss = useStore(s => s.dismissToast)
  return <div className="toasts">{toasts.map(t => <div key={t.id} className={`toast toast-${t.kind} rise`}>{t.kind === 'warn' || t.kind === 'danger' ? <CircleAlert size={14} /> : null}<span className="grow">{t.text}</span>{t.undo && <button className="btn btn-xs" onClick={() => { t.undo!(); dismiss(t.id) }}>Отменить</button>}<button className="btn-icon" onClick={() => dismiss(t.id)}><X size={12} /></button></div>)}</div>
}
export function TypeIcon({ type, size = 14 }: { type: ObjectType; size?: number }) { const I = TYPE_ICONS[type]; return <I size={size} style={{ color: TYPES[type].color }} /> }
export function SourceTag({ s }: { s: string }) { return <span className="src-tag mono">{srcLabel(s)}</span> }
export function Ts({ ts }: { ts: number }) { return <span className="mono dim" style={{ fontSize: 11 }}>{fmtDateTime(ts)}</span> }
export const stop = (e: MouseEvent) => e.stopPropagation()

import { useEffect, useMemo, useRef, useState } from 'react'
import './login.css'
import { USERS, DEMO_KEY, MFA_ENABLED, sessionFor, PURPOSE_LABELS, PURPOSE_BASIS, PURPOSE_EXPIRES, PURPOSE_CATEGORIES, type UserDef } from '../data/security'
import type { Session } from '../data/types'
import { audit, seedAudit, world } from '../data/api'
import { reducedMotion } from '../app/store'
import { ONTOLOGY_VERSION } from '../data/ontology'

type Phase = 'void' | 'logo' | 'login' | 'key' | 'checking' | 'mfa' | 'stamp' | 'purpose' | 'iris' | 'locked'
const GLYPHS = '0123456789ABCDEF█▓░/\\|'
const LOGO = 'SPECTR'
const SUB = `SEMANTIC PLATFORM · TRUSTED DATA · v1.0 · ONTOLOGY ${ONTOLOGY_VERSION}`
const STEPS = ['ПОДПИСЬ ТОКЕНА', 'ПОЛИТИКИ', 'ЦЕЛИ ДОСТУПА', 'ДОПУСК']

export function Login({ onDone }: { onDone: (s: Session) => void }) {
  const rm = useMemo(() => reducedMotion(), [])
  const [phase, setPhase] = useState<Phase>(rm ? 'login' : 'void')
  const [logoFixed, setLogoFixed] = useState(rm ? 6 : 0)
  const [logoGlyphs, setLogoGlyphs] = useState<string[]>(LOGO.split(''))
  const [sub, setSub] = useState(rm ? SUB : '')
  const [login, setLogin] = useState('sc_head')
  const [key, setKey] = useState('')
  const [lastGlyph, setLastGlyph] = useState<string | null>(null)
  const [step, setStep] = useState(-1)
  const [error, setError] = useState<string | null>(null)
  const [shake, setShake] = useState(false)
  const [failures, setFailures] = useState(0)
  const [mfa, setMfa] = useState('')
  const [mfaDecoding, setMfaDecoding] = useState<number | null>(null)
  const [user, setUser] = useState<UserDef | null>(null)
  const [stampUp, setStampUp] = useState(false)
  const [purposeHover, setPurposeHover] = useState<string | null>(null)
  const [purposeSel, setPurposeSel] = useState<string | null>(null)
  const [lockLeft, setLockLeft] = useState(30)
  const [autoLeft, setAutoLeft] = useState(6)
  const [frozen, setFrozen] = useState(false)
  const loginRef = useRef<HTMLInputElement>(null)
  const keyRef = useRef<HTMLInputElement>(null)
  const mfaRef = useRef<HTMLInputElement>(null)
  const timers = useRef<number[]>([])
  const later = (fn: () => void, ms: number) => { const t = window.setTimeout(fn, rm ? 0 : ms); timers.current.push(t); return t }

  // warm the world while the user watches the intro
  useEffect(() => { later(() => { world(); void seedAudit() }, 50) }, [])

  // cinematic intro: void → logo (200ms) → field (900ms)
  useEffect(() => {
    if (rm) return
    later(() => setPhase('logo'), 200)
    later(() => setPhase('login'), 900)
    return () => { timers.current.forEach(clearTimeout) }
  }, [])
  // logo scramble (MO-10): 40ms tick, letters fix left→right every 90ms
  useEffect(() => {
    if (phase === 'void' || rm) return
    let raf = 0; const start = performance.now(); let last = 0
    const frame = (t: number) => {
      const fixed = Math.min(6, Math.floor((t - start) / 90))
      if (t - last > 40) { last = t; setLogoGlyphs(LOGO.split('').map((c, i) => (i < fixed ? c : GLYPHS[Math.floor(Math.random() * GLYPHS.length)]))); setLogoFixed(fixed) }
      if (fixed < 6) raf = requestAnimationFrame(frame); else { setLogoGlyphs(LOGO.split('')); setLogoFixed(6) }
    }
    raf = requestAnimationFrame(frame); return () => cancelAnimationFrame(raf)
  }, [phase === 'void'])
  useEffect(() => {
    if (phase === 'void' || rm) return
    let i = 0; const id = window.setInterval(() => { i++; setSub(SUB.slice(0, i)); if (i >= SUB.length) clearInterval(id) }, 18)
    return () => clearInterval(id)
  }, [phase === 'void'])
  useEffect(() => { if (phase === 'login') later(() => loginRef.current?.focus(), 30); if (phase === 'key') later(() => keyRef.current?.focus(), 30); if (phase === 'mfa') later(() => mfaRef.current?.focus(), 200) }, [phase])
  // Esc skips cinematic layers
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') { if (phase === 'void' || phase === 'logo') { timers.current.forEach(clearTimeout); setPhase('login'); setLogoGlyphs(LOGO.split('')); setLogoFixed(6); setSub(SUB) } else if (phase === 'stamp') { goPurpose() } } }
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h)
  }, [phase])
  useEffect(() => { if (phase !== 'locked') return; setFrozen(true); setLockLeft(30); const id = window.setInterval(() => setLockLeft(x => { if (x <= 1) { clearInterval(id); setFrozen(false); setFailures(0); setPhase('login'); setError(null); return 0 } return x - 1 }), 1000); return () => clearInterval(id) }, [phase])

  async function submit() {
    if (!login.trim() || !key) return
    setPhase('checking'); setStep(0); setError(null)
    const u = USERS.find(x => x.login === login.trim().toLowerCase())
    // 1. token signature (OIDC) — credentials check
    await wait(rm ? 0 : 320)
    const ok = !!u && key === DEMO_KEY
    if (!ok) {
      setStep(3)
      await wait(rm ? 0 : 200)
      const f = failures + 1; setFailures(f)
      audit.append({ ts: Date.now(), actor: login.trim() || '(пусто)', actorKind: 'user', purpose: '—', action: 'login', resource_ids: [], policy_decision_id: 'd_login', outcome: 'deny', detail: 'invalid credentials' })
      setError(`Учётные данные не подтверждены. Попытка зафиксирована (${f}/5).`)
      setShake(true); later(() => setShake(false), 260)
      if (f >= 5) { later(() => setPhase('locked'), 300); return }
      later(() => { setPhase('key'); setKey(''); setStep(-1) }, 700)
      return
    }
    setStep(1); await wait(rm ? 0 : 380)   // policies PDP loaded
    setStep(2); await wait(rm ? 0 : 300)   // purposes list
    setStep(3); await wait(rm ? 0 : 260)   // subject attributes
    setUser(u!)
    if (MFA_ENABLED) setPhase('mfa')
    else { setPhase('stamp'); later(goPurpose, 1400) }
  }
  function onMfa(v: string) {
    const d = v.replace(/\D/g, '').slice(0, 6)
    if (d.length > mfa.length) { setMfaDecoding(d.length - 1); later(() => setMfaDecoding(null), 160) }
    setMfa(d)
    if (d.length === 6) {
      later(() => {
        audit.append({ ts: Date.now(), actor: user!.login, actorKind: 'user', purpose: '—', action: 'login', resource_ids: [], policy_decision_id: 'd_login', outcome: 'allow', detail: 'OIDC + OTP' })
        setPhase('stamp'); later(goPurpose, 1400)
      }, 260)
    }
  }
  function goPurpose() { setStampUp(true); later(() => setPhase('purpose'), 400) }
  useEffect(() => { if (phase !== 'purpose' || purposeSel) return; setAutoLeft(6); const id = window.setInterval(() => setAutoLeft(x => { if (x <= 1) { clearInterval(id); if (!purposeHover) choose(user!.purposes[0]); return 0 } return x - 1 }), 1000); return () => clearInterval(id) }, [phase, purposeSel, purposeHover])
  function choose(p: string) {
    setPurposeSel(p)
    later(() => { setPhase('iris'); later(() => onDone(sessionFor(user!, p)), rm ? 0 : 1000) }, 220)
  }
  const cats = user ? user.clearance.categories : []
  const litCats = new Set(purposeHover || purposeSel ? (PURPOSE_CATEGORIES[purposeHover || purposeSel || ''] || []).filter(c => cats.includes(c)) : [])

  return (
    <div className={`login ${shake ? 'shake' : ''}`} onClick={() => { if (phase === 'login') loginRef.current?.focus(); if (phase === 'key') keyRef.current?.focus(); if (phase === 'mfa') mfaRef.current?.focus() }}>
      <GridCanvas frozen={frozen} />
      {phase === 'iris' && <div className="iris"><div className="iris-mask" /><div className="iris-grid" />{[['12%', '18%', '61.2N 73.4E'], ['70%', '30%', 'НПС-2 · 61.9N 74.8E'], ['40%', '70%', 'ЮГ-1 · 60.8N 72.1E'], ['82%', '76%', 'РВС · 62.0N 75.6E']].map((c, i) => <span key={i} className="iris-coords" style={{ left: c[0], top: c[1] }}>{c[2]}</span>)}</div>}
      <div className="skip-hint">{(phase === 'void' || phase === 'logo' || phase === 'stamp') && 'ESC — ПРОПУСТИТЬ'}</div>
      <div className={`login-center ${phase === 'purpose' || phase === 'iris' ? 'compact' : ''}`}>
        {phase !== 'void' && (
          <div style={{ textAlign: 'center' }}>
            <div className="logo">{logoGlyphs.map((g, i) => <span key={i} className={i < logoFixed ? 'fixed' : ''}>{g}</span>)}</div>
            <div className="logo-sub">{sub}{sub.length < SUB.length && <span className="caret" />}</div>
          </div>
        )}
        {(phase === 'login' || phase === 'key') && (
          <form className="login-field beam" onSubmit={e => { e.preventDefault(); if (phase === 'login') { if (login.trim()) setPhase('key') } else submit() }}>
            <div className="login-label"><span>{phase === 'login' ? 'ИДЕНТИФИКАТОР' : 'КЛЮЧ ДОСТУПА'}</span><span>{phase === 'key' ? login : ''}</span></div>
            <div className="login-input">
              {phase === 'login' ? (
                <>
                  <input ref={loginRef} value={login} autoCapitalize="off" autoCorrect="off" spellCheck={false} onChange={e => setLogin(e.target.value)} aria-label="Идентификатор" />
                  {login.split('').map((c, i) => <span key={i + c} className="ch">{c}</span>)}<span className="caret" />
                </>
              ) : (
                <>
                  <input ref={keyRef} type="password" value={key} onChange={e => { const v = e.target.value; if (v.length > key.length) { setLastGlyph(GLYPHS[Math.floor(Math.random() * GLYPHS.length)]); later(() => setLastGlyph(null), 120) } setKey(v) }} onKeyDown={e => { if (e.key === 'Backspace' && !key) setPhase('login') }} aria-label="Ключ доступа" />
                  {key.split('').map((_, i) => (i === key.length - 1 && lastGlyph ? <span key={i} className="glyph">{lastGlyph}</span> : <span key={i} className="dot" />))}<span className="caret" />
                </>
              )}
            </div>
            <div className="login-line" key={phase} />
            {error && <div className="login-error">{error}</div>}
            <button type="submit" style={{ position: 'absolute', left: -9999 }} aria-hidden tabIndex={-1}>ok</button>
          </form>
        )}
        {phase === 'checking' && (
          <div className={`progress ${error ? 'error' : ''}`}>
            <div className="progress-bar"><i style={{ width: `${((step + 1) / 4) * 100}%` }} /></div>
            <div className="progress-labels">{STEPS.map((s, i) => <span key={s} className={error && i === 3 ? 'fail' : i <= step ? 'on' : ''}>{s}</span>)}</div>
            {error && <div className="login-error">{error}</div>}
          </div>
        )}
        {phase === 'mfa' && (
          <div style={{ textAlign: 'center' }} onClick={() => mfaRef.current?.focus()}>
            <div className="login-label" style={{ justifyContent: 'center' }}>ВТОРОЙ ФАКТОР · KEYCLOAK OTP</div>
            <div className="mfa" style={{ position: 'relative' }}>
              <input ref={mfaRef} value={mfa} inputMode="numeric" onChange={e => onMfa(e.target.value)} style={{ position: 'absolute', opacity: 0, inset: 0, width: '100%' }} aria-label="Код подтверждения" />
              {Array.from({ length: 6 }).map((_, i) => <div key={i} className={`cell ${i === mfa.length ? 'active' : ''} ${mfaDecoding === i ? 'decoding' : ''}`}>{mfa[i] ? (mfaDecoding === i ? GLYPHS[Math.floor(Math.random() * 16)] : mfa[i]) : ''}</div>)}
            </div>
            <div className="mfa-hint">КОД ОТПРАВЛЕН НА УСТРОЙСТВО · ДЕМО: <b>{user?.otp}</b></div>
          </div>
        )}
        {(phase === 'stamp' || phase === 'purpose' || phase === 'iris') && user && (
          <div className={`clearance ${stampUp ? 'up' : ''}`} style={{ ['--lvl' as string]: user.clearance.level === 'CONFIDENTIAL' ? '#f59e0b' : user.clearance.level === 'SECRET' ? '#ef4444' : '#3b82f6' }}>
            <small>ДОПУСК ПОДТВЕРЖДЁН · {user.name}</small>
            {user.clearance.level}
            <div className="cats">{['FIN', 'PII', 'PROD', 'GEO', 'HR', 'LEGAL'].map(c => <span key={c} className={litCats.has(c as never) ? 'lit' : ''} style={{ opacity: cats.includes(c as never) ? 1 : 0.35 }}>{c}</span>)}</div>
          </div>
        )}
        {(phase === 'purpose' || phase === 'iris') && user && (
          <div className="purposes" style={{ marginTop: -40 }}>
            <div className="purposes-h">ВЫБЕРИТЕ ЦЕЛЬ ДОСТУПА (PBAC){!purposeSel && autoLeft > 0 && <span className="dim"> · АВТОВЫБОР ЧЕРЕЗ {autoLeft}</span>}</div>
            {user.purposes.map((p, i) => (
              <button key={p} className={`purpose ${purposeSel === p ? 'sel' : ''}`} style={{ animationDelay: `${i * 60}ms` }} onMouseEnter={() => setPurposeHover(p)} onMouseLeave={() => setPurposeHover(null)} onClick={() => choose(p)}>
                <span className="pn">{PURPOSE_LABELS[p]} <span className="dim mono" style={{ fontSize: 10 }}>{p}</span></span>
                <span className="pe">до {PURPOSE_EXPIRES[p]}</span>
                <span className="pb">Основание: {PURPOSE_BASIS[p]}</span>
                <span className="pc">{(PURPOSE_CATEGORIES[p] || []).map(c => <span key={c}>{c}</span>)}</span>
              </button>
            ))}
          </div>
        )}
        {phase === 'locked' && (
          <div style={{ textAlign: 'center' }}>
            <div className="login-label" style={{ justifyContent: 'center' }}>ВХОД ЗАМОРОЖЕН · 5 НЕУДАЧНЫХ ПОПЫТОК · KEYCLOAK BRUTE FORCE PROTECTION</div>
            <div className="locked-timer">00:{String(lockLeft).padStart(2, '0')}</div>
          </div>
        )}
      </div>
      {(phase === 'login' || phase === 'key' || phase === 'void' || phase === 'logo') && (
        <div className="demo-hint" onClick={e => e.stopPropagation()}>
          ДЕМО-СТЕНД · СИНТЕТИЧЕСКИЙ ХОЛДИНГ «СЕВЕРНАЯ НЕФТЬ» · РОЛИ:
          {USERS.map(u => <button key={u.login} onClick={() => { setLogin(u.login); setPhase('key') }}>{u.login} — {u.roleLabel}</button>)}
        </div>
      )}
      <div className="login-foot">SPECTR · ИЗОЛИРОВАННЫЙ КОНТУР · ВСЕ ДАННЫЕ ПОМЕЧЕНЫ SYNTHETIC</div>
    </div>
  )
}

const wait = (ms: number) => new Promise(r => setTimeout(r, ms))

function GridCanvas({ frozen }: { frozen: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const c = ref.current!; const ctx = c.getContext('2d')!
    let raf = 0; let off = 0; let last = performance.now(); let running = true
    const resize = () => { c.width = c.clientWidth * devicePixelRatio; c.height = c.clientHeight * devicePixelRatio }
    resize(); window.addEventListener('resize', resize)
    const rm = reducedMotion()
    const draw = (t: number) => {
      const dt = (t - last) / 1000; last = t
      if (!frozen && !rm) off = (off + 0.2 * dt * 3) % 48
      const w = c.width, h = c.height, s = 48 * devicePixelRatio
      ctx.clearRect(0, 0, w, h)
      ctx.strokeStyle = 'rgba(230,237,243,0.06)'; ctx.lineWidth = 1
      ctx.beginPath()
      for (let x = (off * devicePixelRatio) % s; x < w; x += s) { ctx.moveTo(x, 0); ctx.lineTo(x, h) }
      for (let y = (off * devicePixelRatio * 0.6) % s; y < h; y += s) { ctx.moveTo(0, y); ctx.lineTo(w, y) }
      ctx.stroke()
      // faint vignette
      const g = ctx.createRadialGradient(w / 2, h / 2, h * 0.2, w / 2, h / 2, h * 0.9); g.addColorStop(0, 'rgba(5,8,12,0)'); g.addColorStop(1, 'rgba(5,8,12,0.85)')
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h)
      if (running && !rm) raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)
    const vis = () => { if (document.visibilityState === 'hidden') { running = false; cancelAnimationFrame(raf) } else if (!running) { running = true; last = performance.now(); raf = requestAnimationFrame(draw) } }
    document.addEventListener('visibilitychange', vis)
    return () => { running = false; cancelAnimationFrame(raf); window.removeEventListener('resize', resize); document.removeEventListener('visibilitychange', vis) }
  }, [frozen])
  return <canvas ref={ref} />
}

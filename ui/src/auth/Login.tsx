import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowRight } from 'lucide-react'
import './login.css'
import { USERS, DEMO_KEY, sessionFor, PURPOSE_LABELS, PURPOSE_BASIS, PURPOSE_EXPIRES, PURPOSE_CATEGORIES, type UserDef } from '../data/security'
import type { Session } from '../data/types'
import { audit, seedAudit, world } from '../data/api'
import { reducedMotion } from '../app/store'
import { ONTOLOGY_VERSION } from '../data/ontology'

type Phase = 'login' | 'checking' | 'stamp' | 'purpose' | 'leaving' | 'locked'
const STEPS = ['Подпись токена', 'Политики доступа', 'Цели обработки', 'Допуск']
const ROLE_SHORT: Record<string, string> = { sc_head: 'Сит. центр', toir_eng: 'ТОиР', seb_analyst: 'СЭБ', analyst_open: 'Аналитик' }
const initials = (name: string) => name.split(' ').map(x => x[0]).join('').slice(0, 2)

export function Login({ onDone }: { onDone: (s: Session) => void }) {
  const rm = useMemo(() => reducedMotion(), [])
  const [phase, setPhase] = useState<Phase>('login')
  const [user, setUser] = useState<UserDef>(USERS[0])
  const [key, setKey] = useState('')
  const [step, setStep] = useState(-1)
  const [stepTs, setStepTs] = useState<number[]>([])
  const [error, setError] = useState<string | null>(null)
  const [shake, setShake] = useState(false)
  const [failures, setFailures] = useState(0)
  const [purposeHover, setPurposeHover] = useState<string | null>(null)
  const [purposeSel, setPurposeSel] = useState<string | null>(null)
  const [lockLeft, setLockLeft] = useState(30)
  const [clock, setClock] = useState(new Date())
  const keyRef = useRef<HTMLInputElement>(null)
  const timers = useRef<number[]>([])
  const later = (fn: () => void, ms: number) => { const t = window.setTimeout(fn, rm ? 0 : ms); timers.current.push(t); return t }

  useEffect(() => { later(() => { world(); void seedAudit() }, 50); const id = setInterval(() => setClock(new Date()), 1000); return () => { timers.current.forEach(clearTimeout); clearInterval(id) } }, [])
  useEffect(() => { if (phase === 'login') later(() => keyRef.current?.focus(), rm ? 0 : 2000) }, [phase, user])
  useEffect(() => { if (phase !== 'locked') return; setLockLeft(30); const id = window.setInterval(() => setLockLeft(x => { if (x <= 1) { clearInterval(id); setFailures(0); setPhase('login'); setError(null); return 0 } return x - 1 }), 1000); return () => clearInterval(id) }, [phase])
  useEffect(() => {
    if (phase !== 'purpose' || purposeSel) return
    const id = window.setTimeout(() => { if (!purposeHover) choose(user.purposes[0]) }, rm ? 0 : 6000)
    return () => clearTimeout(id)
  }, [phase, purposeSel, purposeHover])
  useEffect(() => { const h = (e: KeyboardEvent) => { if (e.key === 'Escape' && phase === 'stamp') setPhase('purpose') }; window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h) }, [phase])

  const mark = (i: number) => setStepTs(t => { const c = [...t]; c[i] = Date.now(); return c })
  async function submit() {
    if (!key) return
    setPhase('checking'); setStep(0); setError(null); setStepTs([])
    await wait(rm ? 0 : 460); mark(0)                       // OIDC: token signature
    if (key !== DEMO_KEY) {
      setStep(3); await wait(rm ? 0 : 260)
      const f = failures + 1; setFailures(f)
      audit.append({ ts: Date.now(), actor: user.login, actorKind: 'user', purpose: '—', action: 'login', resource_ids: [], policy_decision_id: 'd_login', outcome: 'deny', detail: 'invalid credentials' })
      setError(`Пароль не подтверждён. Попытка зафиксирована в аудите (${f} из 5).`)
      if (f >= 5) { later(() => setPhase('locked'), 400); return }
      later(() => { setPhase('login'); setKey(''); setStep(-1); setShake(true); later(() => setShake(false), 300) }, 700)
      return
    }
    setStep(1); await wait(rm ? 0 : 440); mark(1)           // PDP policies
    setStep(2); await wait(rm ? 0 : 380); mark(2)           // purposes
    setStep(3); await wait(rm ? 0 : 340); mark(3)           // subject attributes
    audit.append({ ts: Date.now(), actor: user.login, actorKind: 'user', purpose: '—', action: 'login', resource_ids: [], policy_decision_id: 'd_login', outcome: 'allow', detail: 'OIDC' })
    setStep(4); await wait(rm ? 0 : 300)
    setPhase('stamp'); later(() => setPhase('purpose'), 1500)
  }
  function choose(p: string) { setPurposeSel(p); later(() => { setPhase('leaving'); later(() => onDone(sessionFor(user, p)), 480) }, 260) }
  const cats = user.clearance.categories
  const lit = new Set((PURPOSE_CATEGORIES[purposeHover || purposeSel || ''] || []).filter(c => cats.includes(c)))
  const hh = String(clock.getHours()).padStart(2, '0'), mm = String(clock.getMinutes()).padStart(2, '0'), ss = String(clock.getSeconds()).padStart(2, '0')

  return (
    <div className="login">
      <div className="lg-frame" aria-hidden />
      <div className="lg-corner tl">SPECTR · <b>Trusted data platform</b><br />Северная нефть · изолированный контур</div>
      <div className="lg-corner tr"><b>{hh}:{mm}:{ss}</b> MSK<br />ontology {ONTOLOGY_VERSION}</div>
      <div className="lg-corner bl">Все данные синтетические · <b>SYNTHETIC</b></div>
      <div className="lg-corner br">Пароль операторов стенда<br /><b>{DEMO_KEY}</b></div>

      <div className={`login-center ${phase === 'leaving' ? 'leaving' : ''}`}>
        <Prism />
        <div className="lg-word" aria-label="SPECTR">{'SPECTR'.split('').map((c, i) => <span key={i} style={{ ['--i' as string]: i }}>{c}</span>)}</div>
        <div className="lg-tag">Trusted data · Digital twins · Secure access</div>

        {phase === 'login' && (
          <form className={`panel-lg entry ${shake ? 'shake' : ''}`} onSubmit={e => { e.preventDefault(); submit() }}>
            <div className="lg-h"><span>Оператор</span><b>{user.roleLabel}</b></div>
            <div className="ops" role="radiogroup" aria-label="Оператор">
              {USERS.map(u => <button type="button" key={u.login} className={`op ${u.login === user.login ? 'sel' : ''}`} onClick={() => { setUser(u); setKey(''); setError(null) }} role="radio" aria-checked={u.login === user.login}><span className="op-av">{initials(u.name)}</span><span className="op-name">{u.name}</span><span className="op-role">{ROLE_SHORT[u.login]}</span></button>)}
            </div>
            <div className="field-lg">
              <label htmlFor="lg-pass">Пароль</label>
              <div className={`entry-row ${error ? 'error' : ''}`}>
                <input id="lg-pass" ref={keyRef} type="password" value={key} onChange={e => setKey(e.target.value)} placeholder="Введите пароль" autoComplete="current-password" aria-label="Пароль" />
                <button type="submit" className="enter" disabled={!key}>Войти <ArrowRight size={14} /></button>
              </div>
              {error ? <div className="lg-error">{error}</div> : <div className="lg-note">Пароль стенда · <b>{DEMO_KEY}</b></div>}
            </div>
          </form>
        )}

        {phase === 'checking' && (
          <div className="panel-lg">
            <div className="lg-h"><span>Проверка допуска</span><b>{user.login}</b></div>
            <div className="steps">{STEPS.map((s, i) => <div key={s} className={`step ${error && i === 3 ? 'fail' : i < step ? 'done' : i === step ? 'run' : ''}`}><span className="dot" />{s}{stepTs[i] && <span className="t">{new Date(stepTs[i]).toLocaleTimeString('ru-RU')}</span>}</div>)}</div>
            {error && <div className="lg-error">{error}</div>}
          </div>
        )}

        {(phase === 'stamp' || phase === 'purpose' || phase === 'leaving') && (
          <div className="panel-lg">
            <div className={`clearance lvl-${user.clearance.level}`}>
              <small>Допуск подтверждён · {user.name}</small>
              <div className="lvl">{user.clearance.level}</div>
              <div className="cats">{['FIN', 'PII', 'PROD', 'GEO', 'HR', 'LEGAL'].map(c => <span key={c} className={lit.has(c as never) ? 'lit' : cats.includes(c as never) ? '' : 'off'}>{c}</span>)}</div>
            </div>
            {phase !== 'stamp' && (
              <div className="purposes">
                <div className="lg-h"><span>Цель доступа</span><b>{purposeSel ? 'вход' : purposeHover ? 'выберите' : 'автовыбор · 6 с'}</b></div>
                {!purposeSel && !rm && <div className="auto-line"><i /></div>}
                {user.purposes.map((p, i) => (
                  <button key={p} className={`purpose ${purposeSel === p ? 'sel' : ''}`} style={{ animationDelay: `${i * 60}ms` }} onMouseEnter={() => setPurposeHover(p)} onMouseLeave={() => setPurposeHover(null)} onClick={() => choose(p)}>
                    <span className="radio" />
                    <span className="pn">{PURPOSE_LABELS[p]}</span>
                    <span className="pe">до {PURPOSE_EXPIRES[p]}</span>
                    <span className="pb">{PURPOSE_BASIS[p]} · {(PURPOSE_CATEGORIES[p] || []).join(' ')}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {phase === 'locked' && (
          <div className="panel-lg">
            <div className="lg-h"><span>Вход заблокирован</span><b>5 попыток</b></div>
            <div className="locked-timer">00:{String(lockLeft).padStart(2, '0')}</div>
            <div className="lg-note">Защита от подбора (Keycloak brute force protection)</div>
          </div>
        )}
      </div>
    </div>
  )
}

/** Geometric identity: a beam enters a hexagonal prism and leaves as a spectrum — the SPECTR metaphor. */
function Prism() {
  const cx = 170, cy = 75, r = 34
  const hex = Array.from({ length: 6 }, (_, i) => { const a = (Math.PI / 3) * i - Math.PI / 6; return `${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}` }).join(' ')
  const fan = [[-30, '#ffffff', 0.9], [-15, '#8abbff', 0.9], [0, '#4c90f0', 1], [15, '#9d8be8', 0.9], [30, '#ffffff', 0.5]] as const
  return (
    <svg className="prism" viewBox="0 0 340 150" fill="none" aria-hidden>
      <circle className="draw ring" cx={cx} cy={cy} r={58} stroke="rgba(255,255,255,0.18)" strokeWidth="1" strokeDasharray="1" pathLength={1} />
      <polygon className="draw hex" points={hex} stroke="#ffffff" strokeWidth="1.2" pathLength={1} />
      <line className="draw beam" x1={10} y1={cy} x2={cx - r + 6} y2={cy} stroke="#ffffff" strokeWidth="1.2" pathLength={1} />
      {fan.map(([deg, col, op], i) => { const a = (deg * Math.PI) / 180; const x2 = cx + r - 6 + 150 * Math.cos(a); const y2 = cy + 150 * Math.sin(a); return <line key={i} className={`draw fan${i + 1}`} x1={cx + r - 6} y1={cy} x2={x2} y2={y2} stroke={col} strokeOpacity={op} strokeWidth={i === 2 ? 1.4 : 1} pathLength={1} /> })}
      {[0, 1, 2].map(i => { const [deg] = fan[[2, 1, 3][i]]; const a = (deg * Math.PI) / 180; const x1 = cx + r - 6, y1 = cy, x2 = x1 + 150 * Math.cos(a), y2 = cy + 150 * Math.sin(a); return <circle key={i} className={`pulse p${i + 1}`} r="2.2" fill="#fff"><animateMotion dur="3.2s" begin={`${2 + i * 0.65}s`} repeatCount="indefinite" path={`M${x1},${y1} L${x2},${y2}`} /></circle> })}
      <circle cx={cx} cy={cy} r="2" fill="#fff" />
    </svg>
  )
}
const wait = (ms: number) => new Promise(r => setTimeout(r, ms))

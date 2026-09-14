import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowRight, Check } from 'lucide-react'
import './login.css'
import { USERS, DEMO_KEY, sessionFor, PURPOSE_LABELS, PURPOSE_BASIS, PURPOSE_EXPIRES, PURPOSE_CATEGORIES, type UserDef } from '../data/security'
import type { Session } from '../data/types'
import { audit, seedAudit, world } from '../data/api'
import { reducedMotion } from '../app/store'
import { LogoMark } from '../components/Logo'

type Phase = 'login' | 'checking' | 'stamp' | 'purpose' | 'leaving' | 'locked'
const STEPS = ['Подпись токена', 'Политики доступа', 'Цели обработки', 'Допуск']
const AVATARS: Record<string, [string, string]> = { sc_head: ['#22d3ee', '#3b82f6'], toir_eng: ['#f59e0b', '#ef4444'], seb_analyst: ['#8b5cf6', '#ec4899'], analyst_open: ['#64748b', '#94a3b8'] }
const initials = (name: string) => name.split(' ').map(x => x[0]).join('').slice(0, 2)

export function Login({ onDone }: { onDone: (s: Session) => void }) {
  const rm = useMemo(() => reducedMotion(), [])
  const [phase, setPhase] = useState<Phase>('login')
  const [user, setUser] = useState<UserDef>(USERS[0])
  const [key, setKey] = useState('')
  const [step, setStep] = useState(-1)
  const [error, setError] = useState<string | null>(null)
  const [shake, setShake] = useState(false)
  const [failures, setFailures] = useState(0)
  const [purposeHover, setPurposeHover] = useState<string | null>(null)
  const [purposeSel, setPurposeSel] = useState<string | null>(null)
  const [lockLeft, setLockLeft] = useState(30)
  const keyRef = useRef<HTMLInputElement>(null)
  const timers = useRef<number[]>([])
  const later = (fn: () => void, ms: number) => { const t = window.setTimeout(fn, rm ? 0 : ms); timers.current.push(t); return t }

  useEffect(() => { later(() => { world(); void seedAudit() }, 50); return () => timers.current.forEach(clearTimeout) }, [])
  useEffect(() => { if (phase === 'login') later(() => keyRef.current?.focus(), 80) }, [phase, user])
  useEffect(() => { if (phase !== 'locked') return; setLockLeft(30); const id = window.setInterval(() => setLockLeft(x => { if (x <= 1) { clearInterval(id); setFailures(0); setPhase('login'); setError(null); return 0 } return x - 1 }), 1000); return () => clearInterval(id) }, [phase])
  // purpose: auto-select after 6 s unless the user is choosing
  useEffect(() => {
    if (phase !== 'purpose' || purposeSel) return
    const id = window.setTimeout(() => { if (!purposeHover) choose(user.purposes[0]) }, rm ? 0 : 6000)
    return () => clearTimeout(id)
  }, [phase, purposeSel, purposeHover])
  useEffect(() => { const h = (e: KeyboardEvent) => { if (e.key === 'Escape' && phase === 'stamp') goPurpose() }; window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h) }, [phase])

  async function submit() {
    if (!key) return
    setPhase('checking'); setStep(0); setError(null)
    await wait(rm ? 0 : 420)                         // OIDC: token signature
    const ok = key === DEMO_KEY
    if (!ok) {
      setStep(3); await wait(rm ? 0 : 250)
      const f = failures + 1; setFailures(f)
      audit.append({ ts: Date.now(), actor: user.login, actorKind: 'user', purpose: '—', action: 'login', resource_ids: [], policy_decision_id: 'd_login', outcome: 'deny', detail: 'invalid credentials' })
      setError(`Пароль не подтверждён. Попытка зафиксирована в аудите (${f} из 5).`)
      if (f >= 5) { later(() => setPhase('locked'), 400); return }
      later(() => { setPhase('login'); setKey(''); setStep(-1); setShake(true); later(() => setShake(false), 300) }, 600)
      return
    }
    setStep(1); await wait(rm ? 0 : 420)             // PDP policies loaded
    setStep(2); await wait(rm ? 0 : 360)             // purposes
    setStep(3); await wait(rm ? 0 : 320)             // subject attributes
    audit.append({ ts: Date.now(), actor: user.login, actorKind: 'user', purpose: '—', action: 'login', resource_ids: [], policy_decision_id: 'd_login', outcome: 'allow', detail: 'OIDC' })
    setPhase('stamp'); later(goPurpose, 1500)
  }
  function goPurpose() { setPhase('purpose') }
  function choose(p: string) { setPurposeSel(p); later(() => { setPhase('leaving'); later(() => onDone(sessionFor(user, p)), 520) }, 260) }
  const cats = user.clearance.categories
  const lit = new Set((PURPOSE_CATEGORIES[purposeHover || purposeSel || ''] || []).filter(c => cats.includes(c)))

  return (
    <div className="login">
      <div className="aurora" aria-hidden><i className="a1" /><i className="a2" /><i className="a3" /></div>
      <div className={`login-center ${phase === 'leaving' ? 'leaving' : ''}`}>
        <div className="lg-brand">
          <div className="lg-mark"><LogoMark size={40} /></div>
          <div className="lg-word" aria-label="SPECTR">{'SPECTR'.split('').map((c, i) => <span key={i} style={{ ['--i' as string]: i }}>{c}</span>)}</div>
          <div className="lg-sub">Платформа доверенных данных · Северная нефть</div>
        </div>

        {phase === 'login' && (
          <form className={`glass ${shake ? 'shake' : ''}`} onSubmit={e => { e.preventDefault(); submit() }}>
            <div className="tiles" role="radiogroup" aria-label="Оператор">
              {USERS.map(u => <button type="button" key={u.login} className={`tile ${u.login === user.login ? 'sel' : ''}`} onClick={() => { setUser(u); setKey(''); setError(null) }} role="radio" aria-checked={u.login === user.login}><span className="tile-av" style={{ ['--c1' as string]: AVATARS[u.login][0], ['--c2' as string]: AVATARS[u.login][1] }}>{initials(u.name)}</span><span className="tile-name">{u.name}</span></button>)}
            </div>
            <div className="who"><b>{user.name}</b><span>{user.roleLabel}</span></div>
            <label className={`capsule ${error ? 'error' : ''}`}>
              <input ref={keyRef} type="password" value={key} onChange={e => setKey(e.target.value)} placeholder="Пароль" autoComplete="current-password" aria-label="Пароль" />
              <button type="submit" className={key ? 'ready' : ''} aria-label="Войти"><ArrowRight size={16} /></button>
            </label>
            {error ? <div className="lg-error">{error}</div> : <div className="lg-hint">Пароль стенда: <b>{DEMO_KEY}</b></div>}
          </form>
        )}

        {phase === 'checking' && (
          <div className="glass">
            <div className="who"><b>{user.name}</b><span>Проверка допуска</span></div>
            <div className="steps">{STEPS.map((s, i) => <div key={s} className={`step ${error && i === 3 ? 'fail' : i < step ? 'done' : i === step ? 'run' : ''}`}><span className="dot">{i < step && <Check size={11} strokeWidth={3} />}</span>{s}</div>)}</div>
            {error && <div className="lg-error">{error}</div>}
          </div>
        )}

        {(phase === 'stamp' || phase === 'purpose' || phase === 'leaving') && (
          <div className="glass">
            <div className={`clearance lvl-${user.clearance.level}`}>
              <small>Допуск подтверждён · {user.name}</small>
              <div className="lvl">{user.clearance.level}</div>
              <div className="cats">{['FIN', 'PII', 'PROD', 'GEO', 'HR', 'LEGAL'].map(c => <span key={c} className={lit.has(c as never) ? 'lit' : cats.includes(c as never) ? '' : 'off'}>{c}</span>)}</div>
            </div>
            {phase !== 'stamp' && (
              <div className="purposes">
                <div className="purposes-h"><span>Цель доступа</span><span>{purposeSel ? 'входим…' : purposeHover ? 'выберите цель' : 'автовыбор через 6 с'}</span></div>
                {!purposeSel && !rm && <div className="auto-line"><i /></div>}
                {user.purposes.map((p, i) => (
                  <button key={p} className={`purpose ${purposeSel === p ? 'sel' : ''}`} style={{ animationDelay: `${i * 60}ms` }} onMouseEnter={() => setPurposeHover(p)} onMouseLeave={() => setPurposeHover(null)} onClick={() => choose(p)}>
                    <span className="radio">{purposeSel === p && <Check size={11} strokeWidth={3} />}</span>
                    <span className="pn">{PURPOSE_LABELS[p]}</span>
                    <span className="pe">до {PURPOSE_EXPIRES[p]}</span>
                    <span className="pb">{PURPOSE_BASIS[p]} · {(PURPOSE_CATEGORIES[p] || []).join(', ')}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {phase === 'locked' && (
          <div className="glass">
            <div className="who"><b>Вход временно заблокирован</b><span>5 неудачных попыток · защита от подбора (Keycloak)</span></div>
            <div className="locked-timer">00:{String(lockLeft).padStart(2, '0')}</div>
          </div>
        )}
      </div>
      <div className="lg-foot">Демо-стенд · синтетический холдинг · все данные помечены SYNTHETIC · пароль для всех операторов: <b>{DEMO_KEY}</b></div>
    </div>
  )
}
const wait = (ms: number) => new Promise(r => setTimeout(r, ms))

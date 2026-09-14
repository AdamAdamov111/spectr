import { lazy, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Command, X, Plus, ChevronUp, ChevronDown, Sun, Moon, Eye, EyeOff, Keyboard, LogOut, PanelRightClose, PanelRightOpen, Pin, Search } from 'lucide-react'
import { useStore, SCREENS, type ScreenKey, type Tab } from './store'
import { SCREEN_ICONS, TYPE_ICONS } from '../components/icons'
import { Kbd, Toasts } from '../components/ui'
import { LogoMark } from '../components/Logo'
import { quickSearch, world, typeFreshness, subscribeEvents, get as getObject, logRead } from '../data/api'
import { TYPES } from '../data/ontology'
import { PURPOSE_LABELS, effectiveLevel, effectiveCategories } from '../data/security'
import { fmtTime, fmtAgo } from '../data/rng'
import { Situation } from '../screens/Situation'
import { SearchScreen } from '../screens/Search'
import { GraphScreen } from '../screens/Graph'
import { MapScreen } from '../screens/MapScreen'
const ToirScreen = lazy(() => import('../screens/Toir').then(m => ({ default: m.ToirScreen })))
import { ProcurementScreen } from '../screens/Procurement'
import { AuditScreen } from '../screens/Audit'
import { OntologyScreen } from '../screens/Ontology'
import { BranchesScreen } from '../screens/Branches'
import { AgentScreen } from '../screens/Agent'
import { AdminScreen } from '../screens/Admin'
import { ObjectCard } from '../screens/ObjectCard'
import { ExplainView } from '../screens/Explain'
import { ActionScreen } from '../screens/ActionScreen'
import { Inspector } from '../screens/Inspector'

const SCREEN_COMPONENTS: Record<ScreenKey, () => ReactNode> = {
  situation: () => <Situation />, search: () => <SearchScreen />, graph: () => <GraphScreen />, map: () => <MapScreen />, toir: () => <Suspense fallback={<div className="empty">Загрузка модуля телеметрии…</div>}><ToirScreen /></Suspense>, procurement: () => <ProcurementScreen />,
  audit: () => <AuditScreen />, ontology: () => <OntologyScreen />, branches: () => <BranchesScreen />, agent: () => <AgentScreen />, admin: () => <AdminScreen />,
}

export function Shell() {
  const tabs = useStore(s => s.tabs); const activeTab = useStore(s => s.activeTab)
  const inspectorOpen = useStore(s => s.inspector.open)
  const tickerOpen = useStore(s => s.tickerOpen)
  const simulation = useStore(s => s.simulation)
  const connection = useStore(s => s.connection)
  const palette = useStore(s => s.palette); const help = useStore(s => s.help)
  const session = useStore(s => s.session)
  useShortcuts()
  useHashSync()
  const tab = tabs.find(t => t.id === activeTab) || tabs[0]
  if (!session) return null
  return (
    <div className={`shell ${tickerOpen ? 'ticker-open' : ''}`}>
      {connection !== 'ok' && <div className={`status-bar ${connection}`} />}
      <Rail />
      <TopBar />
      <TabsBar />
      <div className={`workspace ${inspectorOpen ? '' : 'inspector-closed'}`}>
        <div className="work-area" key={tab.id}>
          <TabContent tab={tab} />
          {simulation && <div className="watermark">СИМУЛЯЦИЯ</div>}
        </div>
        {inspectorOpen ? <Inspector /> : <button className="btn-icon inspector-toggle" title="Открыть инспектор" onClick={() => useStore.getState().inspect({ open: true })}><PanelRightOpen size={16} /></button>}
      </div>
      <Ticker />
      {palette && <CommandPalette />}
      {help && <Help />}
      <Toasts />
      {simulation && <><div className="simulation-frame" /><div className="simulation-tag">СИМУЛЯЦИЯ: вид пользователя {simulation.login} под целью {simulation.purpose} · <button style={{ color: 'inherit', textDecoration: 'underline' }} onClick={() => useStore.getState().endSimulation()}>завершить</button></div></>}
    </div>
  )
}

function TabContent({ tab }: { tab: Tab }) {
  if (tab.kind === 'screen' && tab.screen) return <>{SCREEN_COMPONENTS[tab.screen]()}</>
  if (tab.kind === 'object' && tab.objectId) return <ObjectCard id={tab.objectId} />
  if (tab.kind === 'explain' && tab.objectId && tab.prop) return <ExplainView id={tab.objectId} prop={tab.prop} full />
  if (tab.kind === 'action' && tab.objectId && tab.action) return <ActionScreen action={tab.action} objectId={tab.objectId} params={tab.params} tabId={tab.id} />
  return null
}

function Rail() {
  const tabs = useStore(s => s.tabs); const activeTab = useStore(s => s.activeTab); const openScreen = useStore(s => s.openScreen); const setHelp = useStore(s => s.setHelp)
  const tab = tabs.find(t => t.id === activeTab)
  return (
    <nav className="rail">
      <div className="rail-logo" title="SPECTR"><LogoMark size={34} /></div>
      {SCREENS.map(s => { const I = SCREEN_ICONS[s.key]; return <button key={s.key} className={`rail-btn ${tab?.kind === 'screen' && tab.screen === s.key ? 'active' : ''}`} onClick={() => openScreen(s.key)} aria-label={s.label}><I size={22} strokeWidth={1.75} /><span className="rail-label">{s.label}<Kbd k={s.hint} /></span></button> })}
      <div className="rail-bottom" />
      <button className="rail-btn" onClick={() => setHelp(true)} aria-label="Подсказка по клавишам"><Keyboard size={22} strokeWidth={1.75} /><span className="rail-label">Клавиши<Kbd k="?" /></span></button>
      <RailUser />
    </nav>
  )
}

function RailUser() {
  const s = useStore(st => st.session)
  const initials = (s?.name || '??').split(' ').map(x => x[0]).join('').slice(0, 2)
  return <div className="rail-user" title={`${s?.name} · ${s?.roleLabel}`}><span>{initials}</span></div>
}

function TopBar() {
  const session = useStore(s => s.session)!; const setPalette = useStore(s => s.setPalette); const settings = useStore(s => s.settings); const setSettings = useStore(s => s.setSettings)
  const tabs = useStore(s => s.tabs); const activeTab = useStore(s => s.activeTab); const logout = useStore(s => s.logout); const setPurpose = useStore(s => s.setPurpose); const toast = useStore(s => s.toast)
  const expires = useStore(s => s.sessionExpiresAt)
  const [lag, setLag] = useState(0); const [pulse, setPulse] = useState(0)
  const [menu, setMenu] = useState(false)
  useEffect(() => { const id = setInterval(() => { const f = typeFreshness().filter(x => x.sloSec <= 60); const l = f.length ? f.reduce((a, x) => a + x.lagSec, 0) / f.length : 0; setLag(l); setPulse(p => p + 1) }, 4000); return () => clearInterval(id) }, [])
  const tab = tabs.find(t => t.id === activeTab)
  const w = world(); const obj = tab?.objectId ? getObject(tab.objectId) : undefined
  const dzo = obj?.subsidiary ? getObject(obj.subsidiary)?.label : session.subsidiary ? getObject(w.named[session.subsidiary as 'dobycha' | 'transport' | 'pererabotka'])?.label : undefined
  const cats = [...effectiveCategories(session)].filter(c => c !== 'SYNTHETIC')
  const left = Math.max(0, expires - Date.now())
  return (
    <header className="topbar">
      <span className="brand"><LogoMark size={22} />SPECTR</span>
      <span className="env-badge" title="Изолированный контур, российские ОС, без обращения к внешним сервисам"><i />ON-PREM · ИЗОЛИРОВАННЫЙ КОНТУР</span>
      <span className="crumbs"><b>Северная нефть</b>{dzo && <><span className="sep">›</span><span>{dzo}</span></>}{obj && <><span className="sep">›</span><b>{obj.label}</b></>}{!obj && tab?.kind === 'screen' && <><span className="sep">›</span><span>{tab.title}</span></>}</span>
      <button className="pill" onClick={() => setPalette(true)} title="Командная палитра"><Command size={11} />K</button>
      <span className="pill" key={pulse} style={{ animation: 'sp-pulse 600ms var(--ease-inout) 1' }} title="Средний лаг живых типов (SLO ≤ 60 с)">⟳ {fmtAgo(lag)}</span>
      <span className="grow" />
      <span className="mks"><span className="mk mk-level" style={{ ['--c' as string]: effectiveLevel(session) === 'CONFIDENTIAL' ? 'var(--mk-confidential)' : 'var(--mk-internal)' }}>{effectiveLevel(session)}</span>{cats.map(c => <span key={c} className="mk mk-cat">{c}</span>)}</span>
      <button className="pill accent" onClick={() => setMenu(m => !m)} title="Текущая цель доступа (PBAC)">◎ {PURPOSE_LABELS[session.purpose || ''] || session.purpose}</button>
      <button className="btn-icon" title={settings.presentation ? 'Выключить режим презентации' : 'Режим презентации: скрыть PII и FIN'} onClick={() => { setSettings({ presentation: !settings.presentation }); logRead(session, 'presentation.' + (settings.presentation ? 'off' : 'on'), []); toast({ text: settings.presentation ? 'Режим презентации выключен' : 'Режим презентации: PII и FIN скрыты. Зафиксировано в аудите', kind: 'info' }) }}>{settings.presentation ? <EyeOff size={15} /> : <Eye size={15} />}</button>
      <button className="btn-icon" title="Тема" onClick={() => setSettings({ theme: settings.theme === 'dark' ? 'light' : 'dark' })}>{settings.theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}</button>
      <div className="profile" style={{ position: 'relative' }}>
        <button className="row" onClick={() => setMenu(m => !m)} style={{ gap: 8 }}><span className="avatar">{session.name.split(' ').map(x => x[0]).join('').slice(0, 2)}</span><span style={{ textAlign: 'left', lineHeight: 1.1 }}><div>{session.name}</div><div className="dim" style={{ fontSize: 10 }}>{session.roleLabel}</div></span></button>
        {menu && (
          <div className="menu scale-in" onMouseLeave={() => setMenu(false)}>
            <div className="menu-h">Цель доступа</div>
            {session.purposes.map(p => <button key={p} className={`menu-item ${p === session.purpose ? 'active' : ''}`} onClick={() => { setPurpose(p); setMenu(false); toast({ text: `Цель изменена: ${PURPOSE_LABELS[p]}. Штамп допуска обновлён`, kind: 'ok' }) }}>{PURPOSE_LABELS[p]} <span className="dim mono" style={{ fontSize: 10 }}>{p}</span></button>)}
            <div className="menu-h">Анимации</div>
            <div className="seg" style={{ margin: '0 8px 6px' }}>{(['full', 'reduced', 'off'] as const).map(m => <button key={m} className={settings.motion === m ? 'active' : ''} onClick={() => setSettings({ motion: m })}>{m === 'full' ? 'полные' : m === 'reduced' ? 'умеренные' : 'выкл'}</button>)}</div>
            <div className="menu-h">Плотность</div>
            <div className="seg" style={{ margin: '0 8px 6px' }}>{(['compact', 'normal', 'spacious'] as const).map(m => <button key={m} className={settings.density === m ? 'active' : ''} onClick={() => setSettings({ density: m })}>{m === 'compact' ? 'компактная' : m === 'normal' ? 'обычная' : 'просторная'}</button>)}</div>
            <label className="check" style={{ margin: '4px 10px 8px' }}><input type="checkbox" checked={settings.ambient} onChange={e => setSettings({ ambient: e.target.checked })} /> Ambient-слой (потоки, пульс)</label>
            <div className="menu-h">Сессия истекает через {Math.floor(left / 3600000)} ч {Math.floor((left % 3600000) / 60000)} мин</div>
            <button className="menu-item" onClick={() => { location.hash = '#/wall' }}>Открыть видеостену /wall</button>
            <button className="menu-item" onClick={() => { logout(); location.hash = '' }}><LogOut size={12} /> Выйти</button>
          </div>
        )}
      </div>
    </header>
  )
}

function TabsBar() {
  const tabs = useStore(s => s.tabs); const activeTab = useStore(s => s.activeTab); const activate = useStore(s => s.activate); const closeTab = useStore(s => s.closeTab); const setPalette = useStore(s => s.setPalette)
  return (
    <div className="tabsbar">
      {tabs.map(t => { const o = t.objectId ? getObject(t.objectId) : undefined; const I = t.kind === 'screen' && t.screen ? SCREEN_ICONS[t.screen] : o ? TYPE_ICONS[o.type] : Search
        return <button key={t.id} className={`tab ${t.id === activeTab ? 'active' : ''}`} onClick={() => activate(t.id)} onAuxClick={e => { if (e.button === 1) closeTab(t.id) }} title={t.title}><I size={12} style={{ color: o ? TYPES[o.type].color : undefined }} /><span className="truncate">{t.title}</span>{t.pinned && <Pin size={10} />}<span className="tab-close" onClick={e => { e.stopPropagation(); closeTab(t.id) }}><X size={12} /></span></button> })}
      <button className="tab-add" onClick={() => setPalette(true)} title="Открыть (⌘K)"><Plus size={14} /></button>
    </div>
  )
}

function Ticker() {
  const open = useStore(s => s.tickerOpen); const setTicker = useStore(s => s.setTicker); const openObject = useStore(s => s.openObject)
  const [, force] = useState(0)
  useEffect(() => subscribeEvents(() => force(x => x + 1)), [])
  const events = world().events
  return (
    <div className="ticker">
      <div className="ticker-line">
        <button className="btn-icon" onClick={() => setTicker(!open)} title="Лента событий">{open ? <ChevronDown size={14} /> : <ChevronUp size={14} />}</button>
        {events.slice(0, 6).map(e => <span key={e.id} className="ticker-item" onClick={() => e.objectId && openObject(e.objectId)}><i className={`ev-dot ev-${e.kind}`} /><span className="t">{fmtTime(e.ts)}</span><span className="truncate" style={{ maxWidth: 360 }}>{e.text}</span></span>)}
      </div>
      {open && <div className="ticker-list">{events.slice(0, 80).map(e => <span key={e.id} className="ticker-item" onClick={() => e.objectId && openObject(e.objectId)}><i className={`ev-dot ev-${e.kind}`} /><span className="t">{fmtTime(e.ts)}</span><span>{e.text}</span></span>)}</div>}
    </div>
  )
}

function CommandPalette() {
  const setPalette = useStore(s => s.setPalette); const openScreen = useStore(s => s.openScreen); const openObject = useStore(s => s.openObject); const session = useStore(s => s.session)!
  const setSettings = useStore(s => s.setSettings); const settings = useStore(s => s.settings); const logout = useStore(s => s.logout)
  const [q, setQ] = useState(''); const [cur, setCur] = useState(0)
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => { ref.current?.focus() }, [])
  const items = useMemo(() => {
    const out: { group: string; label: string; hint?: string; icon?: ReactNode; run: () => void; sub?: string }[] = []
    const ql = q.toLowerCase()
    if (!ql.includes(':')) {
      for (const s of SCREENS) if (!ql || s.label.toLowerCase().includes(ql)) { const I = SCREEN_ICONS[s.key]; out.push({ group: 'Экраны', label: s.label, hint: s.hint, icon: <I size={14} />, run: () => openScreen(s.key) }) }
      const cmds = [
        { label: settings.theme === 'dark' ? 'Светлая тема' : 'Тёмная тема', run: () => setSettings({ theme: settings.theme === 'dark' ? 'light' : 'dark' }) },
        { label: settings.presentation ? 'Выключить режим презентации' : 'Режим презентации (скрыть PII/FIN)', run: () => setSettings({ presentation: !settings.presentation }) },
        { label: 'Открыть видеостену /wall', run: () => { location.hash = '#/wall' } },
        { label: 'Сценарий демо: НПС-2 → Насос-104 → ООО Вектор', run: () => { openObject(world().named.nps2, { tab: true }) } },
        { label: 'Выйти', run: () => { logout(); location.hash = '' } },
      ]
      for (const c of cmds) if (!ql || c.label.toLowerCase().includes(ql)) out.push({ group: 'Команды', label: c.label, run: c.run })
    }
    if (ql.length >= 2) for (const o of quickSearch(session, q, 14)) { const I = TYPE_ICONS[o.type]; out.push({ group: TYPES[o.type].plural, label: o.label, sub: o.id, icon: <I size={14} style={{ color: TYPES[o.type].color }} />, run: () => openObject(o.id, { tab: true, inspector: true }) }) }
    return out
  }, [q, settings])
  useEffect(() => setCur(0), [q])
  const groups = [...new Set(items.map(i => i.group))]
  return (
    <div className="palette-back" onMouseDown={e => { if (e.target === e.currentTarget) setPalette(false) }}>
      <div className="palette">
        <div className="palette-input"><Search size={16} className="dim" /><input ref={ref} value={q} onChange={e => setQ(e.target.value)} placeholder="Объект, команда или экран… (eq: org: inn: well: nps: doc:)" onKeyDown={e => { if (e.key === 'ArrowDown') { e.preventDefault(); setCur(c => Math.min(items.length - 1, c + 1)) } if (e.key === 'ArrowUp') { e.preventDefault(); setCur(c => Math.max(0, c - 1)) } if (e.key === 'Enter' && items[cur]) { items[cur].run(); setPalette(false) } if (e.key === 'Escape') setPalette(false) }} /><Kbd k="esc" /></div>
        <div className="palette-list">
          {groups.map(g => <div key={g}><div className="palette-group">{g}</div>{items.filter(i => i.group === g).map(i => { const idx = items.indexOf(i); return <div key={idx} className={`palette-item ${idx === cur ? 'active' : ''}`} style={{ animationDelay: `${Math.min(idx, 20) * 20}ms` }} onMouseEnter={() => setCur(idx)} onClick={() => { i.run(); setPalette(false) }}>{i.icon}<span>{i.label}</span>{i.sub && <span className="dim mono" style={{ fontSize: 10 }}>{i.sub}</span>}{i.hint && <span className="hint">{i.hint}</span>}</div> })}</div>)}
          {!items.length && <div className="dt-empty">Ничего не найдено</div>}
        </div>
        <div className="palette-foot"><span>↑↓ выбор</span><span>⏎ открыть</span><span>префиксы: eq: org: inn: well: nps: mo: ctr: prc: doc:</span></div>
      </div>
    </div>
  )
}

function Help() {
  const setHelp = useStore(s => s.setHelp)
  const rows: [string, string][] = [['⌘K / Ctrl+K', 'Командная палитра'], ['g s · g g · g m · g i', 'СЦ · Граф · Карта · Инспектор аудита'], ['g t · g p · g o · g b · g a', 'ТОиР · Закупки · Онтология · Ветки · Помощник'], ['/', 'Фокус в поиск'], ['e', 'Explain выделенного объекта'], ['a', 'Действия выделенного объекта'], ['[ ]', 'Переключение вкладок'], ['j / k · Enter · o', 'Навигация по таблице · открыть'], ['g / m / e (в таблице)', 'В граф · на карту · explain'], ['Esc', 'Закрыть панель / прервать анимацию'], ['?', 'Эта подсказка']]
  return <div className="help-back" onMouseDown={e => { if (e.target === e.currentTarget) setHelp(false) }}><div className="help"><div className="row" style={{ marginBottom: 10 }}><b>Клавиатура · одна рука на клавиатуре (UX-05)</b><span className="grow" /><button className="btn-icon" onClick={() => setHelp(false)}><X size={14} /></button></div><table><tbody>{rows.map(r => <tr key={r[0]}><td><Kbd k={r[0]} /></td><td>{r[1]}</td></tr>)}</tbody></table></div></div>
}

function useShortcuts() {
  const st = useStore
  useEffect(() => {
    let pendingG = 0
    const h = (e: KeyboardEvent) => {
      const s = st.getState()
      const tag = (e.target as HTMLElement).tagName
      const typing = tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement).isContentEditable
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); s.setPalette(!s.palette); return }
      if (e.key === 'Escape') { if (s.palette) s.setPalette(false); else if (s.help) s.setHelp(false); else if (s.inspector.mode !== 'object') s.inspect({ mode: 'object' }); return }
      if (typing) return
      if (e.key === '?') { s.setHelp(!s.help); return }
      if (e.key === '/') { e.preventDefault(); s.openScreen('search'); setTimeout(() => (document.querySelector('.search-input input') as HTMLInputElement)?.focus(), 50); return }
      if (e.key === '[') { s.cycleTab(-1); return } if (e.key === ']') { s.cycleTab(1); return }
      if (Date.now() - pendingG < 900) {
        const map: Record<string, ScreenKey> = { s: 'situation', g: 'graph', m: 'map', i: 'audit', t: 'toir', p: 'procurement', o: 'ontology', b: 'branches', a: 'agent', ',': 'admin' }
        if (map[e.key]) { s.openScreen(map[e.key]); pendingG = 0; return }
      }
      if (e.key === 'g') { pendingG = Date.now(); return }
      if (e.key === 'e' && s.inspector.objectId) { const o = getObject(s.inspector.objectId); if (o) s.openExplain(o.id, TYPES[o.type].props.find(p => p.key)?.name || TYPES[o.type].props[0].name) ; return }
      if (e.key === 'a' && s.inspector.objectId) { s.openObject(s.inspector.objectId, { tab: true }); return }
    }
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h)
  }, [])
}

function useHashSync() {
  const activeTab = useStore(s => s.activeTab); const tabs = useStore(s => s.tabs)
  useEffect(() => {
    const t = tabs.find(x => x.id === activeTab); if (!t) return
    const h = t.kind === 'screen' ? `#/s/${t.screen}` : t.kind === 'object' ? `#/o/${t.objectId}` : t.kind === 'explain' ? `#/x/${t.objectId}/${t.prop}` : t.kind === 'action' ? `#/a/${t.action}/${t.objectId}` : location.hash
    if (location.hash !== h) history.replaceState(null, '', h)
  }, [activeTab, tabs])
  useEffect(() => {
    const apply = () => {
      const s = useStore.getState(); const h = location.hash
      const m = h.match(/^#\/(s|o|x|a)\/([^/]+)(?:\/([^/]+))?(?:\/([^/]+))?/); if (!m) return
      if (m[1] === 's' && SCREENS.some(x => x.key === m[2])) s.openScreen(m[2] as ScreenKey)
      if (m[1] === 'o' && getObject(m[2])) s.openObject(m[2], { tab: true })
      if (m[1] === 'x' && getObject(m[2]) && m[3]) s.openExplain(m[2], m[3], true)
    }
    apply(); window.addEventListener('hashchange', apply); return () => window.removeEventListener('hashchange', apply)
  }, [])
}


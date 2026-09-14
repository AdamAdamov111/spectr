import { lazy, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { X, Plus, Bell, Search, Keyboard, LogOut, PanelRightOpen, ChevronsLeft, ChevronsRight, Sun, Moon, Eye, EyeOff, Monitor } from 'lucide-react'
import { useStore, SCREENS, type ScreenKey, type Tab } from './store'
import { SCREEN_ICONS, TYPE_ICONS } from '../components/icons'
import { Kbd, Toasts } from '../components/ui'
import { LogoMark } from '../components/Logo'
import { quickSearch, world, subscribeEvents, get as getObject, logRead } from '../data/api'
import { TYPES } from '../data/ontology'
import { PURPOSE_LABELS, effectiveLevel } from '../data/security'
import { fmtTime } from '../data/rng'
import { Situation } from '../screens/Situation'
import { SearchScreen } from '../screens/Search'
import { GraphScreen } from '../screens/Graph'
import { MapScreen } from '../screens/MapScreen'
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
const ToirScreen = lazy(() => import('../screens/Toir').then(m => ({ default: m.ToirScreen })))

const SCREEN_COMPONENTS: Record<ScreenKey, () => ReactNode> = {
  situation: () => <Situation />, search: () => <SearchScreen />, graph: () => <GraphScreen />, map: () => <MapScreen />, toir: () => <Suspense fallback={<div className="empty">Загрузка модуля телеметрии…</div>}><ToirScreen /></Suspense>, procurement: () => <ProcurementScreen />,
  audit: () => <AuditScreen />, ontology: () => <OntologyScreen />, branches: () => <BranchesScreen />, agent: () => <AgentScreen />, admin: () => <AdminScreen />,
}

export function Shell() {
  const tabs = useStore(s => s.tabs); const activeTab = useStore(s => s.activeTab)
  const inspector = useStore(s => s.inspector)
  const simulation = useStore(s => s.simulation)
  const connection = useStore(s => s.connection)
  const palette = useStore(s => s.palette); const help = useStore(s => s.help)
  const collapsed = useStore(s => s.settings.sidebar === 'collapsed')
  const session = useStore(s => s.session)
  useShortcuts()
  useHashSync()
  const tab = tabs.find(t => t.id === activeTab) || tabs[0]
  if (!session) return null
  const sameAsTab = tab.kind === 'object' && inspector.mode === 'object' && inspector.objectId === tab.objectId
  const inspectorVisible = inspector.open && !sameAsTab && (!!inspector.objectId || inspector.mode === 'summary')
  return (
    <div className={`shell ${collapsed ? 'sidebar-collapsed' : ''}`}>
      {connection !== 'ok' && <div className={`status-bar ${connection}`} />}
      <Sidebar />
      <div className="main">
        <TopBar />
        {tabs.length > 1 && <TabsBar />}
        <div className={`workspace ${inspectorVisible ? '' : 'inspector-closed'}`}>
          <div className="work-area" key={tab.id}>
            <TabContent tab={tab} />
            {simulation && <div className="watermark">СИМУЛЯЦИЯ</div>}
          </div>
          {inspectorVisible ? <Inspector /> : inspector.objectId && !sameAsTab ? <button className="btn-icon inspector-toggle" title="Открыть инспектор" onClick={() => useStore.getState().inspect({ open: true })}><PanelRightOpen /></button> : null}
        </div>
      </div>
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

const GROUPS: { title: string; keys: ScreenKey[] }[] = [
  { title: 'Операции', keys: ['situation', 'map', 'toir', 'procurement'] },
  { title: 'Данные', keys: ['search', 'graph', 'ontology', 'branches'] },
  { title: 'Контроль', keys: ['audit', 'agent', 'admin'] },
]

function Sidebar() {
  const tabs = useStore(s => s.tabs); const activeTab = useStore(s => s.activeTab); const openScreen = useStore(s => s.openScreen); const setHelp = useStore(s => s.setHelp)
  const settings = useStore(s => s.settings); const setSettings = useStore(s => s.setSettings)
  const session = useStore(s => s.session)!
  const collapsed = settings.sidebar === 'collapsed'
  const tab = tabs.find(t => t.id === activeTab)
  return (
    <nav className="sidebar">
      <div className="sb-brand"><LogoMark size={26} />{!collapsed && <span className="sb-word">SPECTR</span>}</div>
      <div className="sb-groups">
        {GROUPS.map(g => (
          <div key={g.title} className="sb-group">
            {!collapsed && <div className="sb-group-h">{g.title}</div>}
            {g.keys.map(k => { const s = SCREENS.find(x => x.key === k)!; const I = SCREEN_ICONS[k]; const active = tab?.kind === 'screen' && tab.screen === k
              return <button key={k} className={`sb-item ${active ? 'active' : ''}`} onClick={() => openScreen(k)} title={collapsed ? s.label : undefined}><I /><span className="sb-label">{s.label}</span></button> })}
          </div>
        ))}
      </div>
      <div className="sb-foot">
        <button className="sb-item" onClick={() => setHelp(true)} title="Клавиши"><Keyboard /><span className="sb-label">Клавиши <Kbd k="?" /></span></button>
        <button className="sb-item" onClick={() => setSettings({ sidebar: collapsed ? 'expanded' : 'collapsed' })} title={collapsed ? 'Развернуть' : 'Свернуть'}>{collapsed ? <ChevronsRight /> : <ChevronsLeft />}<span className="sb-label">Свернуть</span></button>
        <div className="sb-user"><span className="avatar">{session.name.split(' ').map(x => x[0]).join('').slice(0, 2)}</span>{!collapsed && <span className="sb-user-t"><b>{session.name}</b><span>{session.roleLabel}</span></span>}</div>
      </div>
    </nav>
  )
}

function TopBar() {
  const session = useStore(s => s.session)!; const setPalette = useStore(s => s.setPalette); const settings = useStore(s => s.settings); const setSettings = useStore(s => s.setSettings)
  const tabs = useStore(s => s.tabs); const activeTab = useStore(s => s.activeTab); const logout = useStore(s => s.logout); const setPurpose = useStore(s => s.setPurpose); const toast = useStore(s => s.toast)
  const [menu, setMenu] = useState(false)
  const tab = tabs.find(t => t.id === activeTab)
  const obj = tab?.objectId ? getObject(tab.objectId) : undefined
  const title = obj ? obj.label : tab?.title || ''
  const sub = obj ? TYPES[obj.type].label : tab?.kind === 'screen' ? 'Северная нефть' : ''
  return (
    <header className="topbar">
      <div className="tb-title"><span className="tb-h">{title}</span>{sub && <span className="tb-sub">{sub}</span>}</div>
      <span className="grow" />
      <button className="tb-search" onClick={() => setPalette(true)}><Search /><span>Поиск объектов и команд</span><Kbd k="⌘K" /></button>
      <Notifications />
      <div className="profile" style={{ position: 'relative' }}>
        <button className="tb-user" onClick={() => setMenu(m => !m)} title="Профиль и настройки"><span className="tb-clearance">{effectiveLevel(session)}</span><span className="tb-purpose">{PURPOSE_LABELS[session.purpose || ''] || session.purpose}</span><span className="avatar">{session.name.split(' ').map(x => x[0]).join('').slice(0, 2)}</span></button>
        {menu && (
          <div className="menu scale-in" onMouseLeave={() => setMenu(false)}>
            <div className="menu-h">{session.name} · {session.roleLabel}</div>
            <div className="menu-h">Цель доступа</div>
            {session.purposes.map(p => <button key={p} className={`menu-item ${p === session.purpose ? 'active' : ''}`} onClick={() => { setPurpose(p); setMenu(false); toast({ text: `Цель изменена: ${PURPOSE_LABELS[p]}`, kind: 'ok' }) }}>{PURPOSE_LABELS[p]}</button>)}
            <div className="menu-h">Вид</div>
            <button className="menu-item" onClick={() => setSettings({ theme: settings.theme === 'dark' ? 'light' : 'dark' })}>{settings.theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />} {settings.theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}</button>
            <button className="menu-item" onClick={() => { setSettings({ presentation: !settings.presentation }); logRead(session, 'presentation.' + (settings.presentation ? 'off' : 'on'), []); toast({ text: settings.presentation ? 'Режим презентации выключен' : 'Режим презентации: PII и FIN скрыты, зафиксировано в аудите', kind: 'info' }) }}>{settings.presentation ? <EyeOff size={14} /> : <Eye size={14} />} {settings.presentation ? 'Выключить режим презентации' : 'Режим презентации (скрыть PII и FIN)'}</button>
            <button className="menu-item" onClick={() => { location.hash = '#/wall' }}><Monitor size={14} /> Видеостена /wall</button>
            <div className="menu-h">Анимации</div>
            <div className="seg" style={{ margin: '0 12px 8px' }}>{(['full', 'reduced', 'off'] as const).map(m => <button key={m} className={settings.motion === m ? 'active' : ''} onClick={() => setSettings({ motion: m })}>{m === 'full' ? 'полные' : m === 'reduced' ? 'умеренные' : 'выкл'}</button>)}</div>
            <div className="menu-h">Плотность</div>
            <div className="seg" style={{ margin: '0 12px 8px' }}>{(['compact', 'normal', 'spacious'] as const).map(m => <button key={m} className={settings.density === m ? 'active' : ''} onClick={() => setSettings({ density: m })}>{m === 'compact' ? 'компактная' : m === 'normal' ? 'обычная' : 'просторная'}</button>)}</div>
            <button className="menu-item" onClick={() => { logout(); location.hash = '' }}><LogOut size={14} /> Выйти</button>
          </div>
        )}
      </div>
    </header>
  )
}

function Notifications() {
  const openObject = useStore(s => s.openObject)
  const [open, setOpen] = useState(false)
  const [, force] = useState(0)
  useEffect(() => subscribeEvents(() => force(x => x + 1)), [])
  const events = world().events
  const important = events.filter(e => e.kind === 'anomaly' || e.kind === 'incident' || e.kind === 'action').slice(0, 40)
  const fresh = important.filter(e => Date.now() - e.ts < 15 * 60_000).length
  return (
    <div style={{ position: 'relative' }}>
      <button className={`btn-icon ${open ? 'active' : ''}`} onClick={() => setOpen(o => !o)} title="События"><Bell />{fresh > 0 && <span className="badge">{fresh}</span>}</button>
      {open && (
        <div className="menu notif scale-in" onMouseLeave={() => setOpen(false)}>
          <div className="menu-h">События · аномалии, инциденты, действия</div>
          {important.map(e => <button key={e.id} className="notif-item" onClick={() => { if (e.objectId) openObject(e.objectId); setOpen(false) }}><i className={`ev-dot ev-${e.kind}`} /><span className="grow">{e.text}</span><span className="mono dim">{fmtTime(e.ts)}</span></button>)}
        </div>
      )}
    </div>
  )
}

function TabsBar() {
  const tabs = useStore(s => s.tabs); const activeTab = useStore(s => s.activeTab); const activate = useStore(s => s.activate); const closeTab = useStore(s => s.closeTab); const setPalette = useStore(s => s.setPalette)
  return (
    <div className="tabsbar">
      {tabs.map(t => { const o = t.objectId ? getObject(t.objectId) : undefined; const I = t.kind === 'screen' && t.screen ? SCREEN_ICONS[t.screen] : o ? TYPE_ICONS[o.type] : Search
        return <button key={t.id} className={`tab ${t.id === activeTab ? 'active' : ''}`} onClick={() => activate(t.id)} onAuxClick={e => { if (e.button === 1) closeTab(t.id) }} title={t.title}><I /><span className="truncate">{t.title}</span><span className="tab-close" onClick={e => { e.stopPropagation(); closeTab(t.id) }}><X size={13} /></span></button> })}
      <button className="tab-add" onClick={() => setPalette(true)} title="Открыть (⌘K)"><Plus size={15} /></button>
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
      for (const s of SCREENS) if (!ql || s.label.toLowerCase().includes(ql)) { const I = SCREEN_ICONS[s.key]; out.push({ group: 'Экраны', label: s.label, hint: s.hint, icon: <I size={16} />, run: () => openScreen(s.key) }) }
      const cmds = [
        { label: settings.theme === 'dark' ? 'Светлая тема' : 'Тёмная тема', run: () => setSettings({ theme: settings.theme === 'dark' ? 'light' : 'dark' }) },
        { label: settings.presentation ? 'Выключить режим презентации' : 'Режим презентации (скрыть PII/FIN)', run: () => setSettings({ presentation: !settings.presentation }) },
        { label: 'Открыть видеостену /wall', run: () => { location.hash = '#/wall' } },
        { label: 'Сценарий демо: НПС-2 → Насос-104 → ООО Вектор', run: () => { openObject(world().named.nps2, { tab: true }) } },
        { label: 'Выйти', run: () => { logout(); location.hash = '' } },
      ]
      for (const c of cmds) if (!ql || c.label.toLowerCase().includes(ql)) out.push({ group: 'Команды', label: c.label, run: c.run })
    }
    if (ql.length >= 2) for (const o of quickSearch(session, q, 14)) { const I = TYPE_ICONS[o.type]; out.push({ group: TYPES[o.type].plural, label: o.label, sub: o.id, icon: <I size={16} style={{ color: TYPES[o.type].color }} />, run: () => openObject(o.id, { tab: true, inspector: true }) }) }
    return out
  }, [q, settings])
  useEffect(() => setCur(0), [q])
  const groups = [...new Set(items.map(i => i.group))]
  return (
    <div className="palette-back" onMouseDown={e => { if (e.target === e.currentTarget) setPalette(false) }}>
      <div className="palette">
        <div className="palette-input"><Search size={18} className="dim" /><input ref={ref} value={q} onChange={e => setQ(e.target.value)} placeholder="Объект, команда или экран…" onKeyDown={e => { if (e.key === 'ArrowDown') { e.preventDefault(); setCur(c => Math.min(items.length - 1, c + 1)) } if (e.key === 'ArrowUp') { e.preventDefault(); setCur(c => Math.max(0, c - 1)) } if (e.key === 'Enter' && items[cur]) { items[cur].run(); setPalette(false) } if (e.key === 'Escape') setPalette(false) }} /><Kbd k="esc" /></div>
        <div className="palette-list">
          {groups.map(g => <div key={g}><div className="palette-group">{g}</div>{items.filter(i => i.group === g).map(i => { const idx = items.indexOf(i); return <div key={idx} className={`palette-item ${idx === cur ? 'active' : ''}`} onMouseEnter={() => setCur(idx)} onClick={() => { i.run(); setPalette(false) }}>{i.icon}<span>{i.label}</span>{i.sub && <span className="dim mono" style={{ fontSize: 11 }}>{i.sub}</span>}{i.hint && <span className="hint">{i.hint}</span>}</div> })}</div>)}
          {!items.length && <div className="dt-empty">Ничего не найдено</div>}
        </div>
        <div className="palette-foot"><span>↑↓ выбор</span><span>⏎ открыть</span><span>префиксы типов: eq: org: inn: well: nps: mo: ctr: prc: doc:</span></div>
      </div>
    </div>
  )
}

function Help() {
  const setHelp = useStore(s => s.setHelp)
  const rows: [string, string][] = [['⌘K / Ctrl+K', 'Поиск и команды'], ['g s · g g · g m · g i', 'Ситуационный центр · Граф · Карта · Аудит'], ['g t · g p · g o · g b · g a', 'ТОиР · Закупки · Онтология · Ветки · Помощник'], ['/', 'Поиск объектов'], ['e', 'Explain выделенного объекта'], ['a', 'Действия выделенного объекта'], ['[ ]', 'Переключение вкладок'], ['j / k · Enter · o', 'Навигация по таблице · открыть'], ['g / m / e (в таблице)', 'В граф · на карту · explain'], ['Esc', 'Закрыть панель'], ['?', 'Эта подсказка']]
  return <div className="help-back" onMouseDown={e => { if (e.target === e.currentTarget) setHelp(false) }}><div className="help"><div className="row" style={{ marginBottom: 10 }}><b>Клавиатура</b><span className="grow" /><button className="btn-icon" onClick={() => setHelp(false)}><X size={16} /></button></div><table><tbody>{rows.map(r => <tr key={r[0]}><td><Kbd k={r[0]} /></td><td>{r[1]}</td></tr>)}</tbody></table></div></div>
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
      if (e.key === 'e' && s.inspector.objectId) { const o = getObject(s.inspector.objectId); if (o) s.openExplain(o.id, TYPES[o.type].props.find(p => p.key)?.name || TYPES[o.type].props[0].name); return }
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

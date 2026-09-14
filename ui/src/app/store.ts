import { create } from 'zustand'
import type { Session } from '../data/types'
import { get as getObject, logRead } from '../data/api'
import { TYPES } from '../data/ontology'
import { USERS, sessionFor } from '../data/security'
import { useMemo } from 'react'

export type ScreenKey = 'situation' | 'search' | 'graph' | 'map' | 'toir' | 'procurement' | 'audit' | 'ontology' | 'branches' | 'agent' | 'admin'
export const SCREENS: { key: ScreenKey; label: string; hint: string }[] = [
  { key: 'situation', label: 'Ситуационный центр', hint: 'g s' },
  { key: 'search', label: 'Поиск объектов', hint: '/' },
  { key: 'graph', label: 'Граф связей', hint: 'g g' },
  { key: 'map', label: 'Карта активов', hint: 'g m' },
  { key: 'toir', label: 'ТОиР и надёжность', hint: 'g t' },
  { key: 'procurement', label: 'Антифрод закупок', hint: 'g p' },
  { key: 'audit', label: 'Инспектор аудита', hint: 'g i' },
  { key: 'ontology', label: 'Онтология', hint: 'g o' },
  { key: 'branches', label: 'Ветки данных', hint: 'g b' },
  { key: 'agent', label: 'ИИ-помощник', hint: 'g a' },
  { key: 'admin', label: 'Администрирование', hint: 'g ,' },
]

export interface Tab { id: string; kind: 'screen' | 'object' | 'explain' | 'action' | 'investigation'; screen?: ScreenKey; objectId?: string; prop?: string; action?: string; title: string; pinned?: boolean; params?: Record<string, unknown> }
export interface Toast { id: number; text: string; kind: 'info' | 'ok' | 'warn' | 'danger'; undo?: () => void; ttl?: number }
export interface InspectorState { open: boolean; objectId?: string; mode: 'object' | 'explain' | 'summary' | 'freshness'; prop?: string; summaryIds?: string[] }
export interface Settings { theme: 'dark' | 'light'; density: 'compact' | 'normal' | 'spacious'; motion: 'full' | 'reduced' | 'off'; presentation: boolean; ambient: boolean; sidebar: 'expanded' | 'collapsed' }

interface State {
  session: Session | null
  simulation: { login: string; purpose: string } | null
  realSession: Session | null
  tabs: Tab[]
  activeTab: string
  inspector: InspectorState
  pinned: string[]
  palette: boolean
  help: boolean
  tickerOpen: boolean
  settings: Settings
  toasts: Toast[]
  connection: 'ok' | 'lost' | 'policy'
  sessionExpiresAt: number
  scrambleSeen: Set<string>
  assembledSeen: Set<string>
  flyDone: boolean
  wall: boolean
  chaos: { sapStale: boolean; pdpDown: boolean }
  mapFocus: { id: string; key: number } | null
  compare: string[]

  setSession: (s: Session | null) => void
  setPurpose: (p: string) => void
  logout: () => void
  openScreen: (k: ScreenKey) => void
  openObject: (id: string, opts?: { inspector?: boolean; tab?: boolean }) => void
  openExplain: (id: string, prop: string, asTab?: boolean) => void
  openAction: (action: string, objectId: string, params?: Record<string, unknown>) => void
  openTab: (t: Omit<Tab, 'id'> & { id?: string }) => void
  closeTab: (id: string) => void
  activate: (id: string) => void
  cycleTab: (dir: 1 | -1) => void
  togglePin: (id: string) => void
  inspect: (patch: Partial<InspectorState>) => void
  setPalette: (v: boolean) => void
  setHelp: (v: boolean) => void
  setTicker: (v: boolean) => void
  setSettings: (p: Partial<Settings>) => void
  toast: (t: Omit<Toast, 'id'>) => void
  dismissToast: (id: number) => void
  setConnection: (c: State['connection']) => void
  simulate: (login: string, purpose: string) => void
  endSimulation: () => void
  markScramble: (k: string) => boolean
  markAssembled: (id: string) => boolean
  setFlyDone: () => void
  setChaos: (p: Partial<State['chaos']>) => void
  focusMap: (id: string) => void
  toggleCompare: (id: string) => void
  clearCompare: () => void
}

const tabIdFor = (t: Omit<Tab, 'id'>) => t.kind === 'screen' ? `s:${t.screen}` : t.kind === 'object' ? `o:${t.objectId}` : t.kind === 'explain' ? `x:${t.objectId}:${t.prop}` : t.kind === 'action' ? `a:${t.action}:${t.objectId}` : `i:${t.title}`
let toastSeq = 1

// The session survives a page reload within the browser tab (domain switch rebuilds the world via reload); 8 h TTL.
const SESSION_KEY = 'spectr.session'
function restoreSession(): Session | null {
  try { const raw = sessionStorage.getItem(SESSION_KEY); if (!raw) return null; const { s, exp } = JSON.parse(raw); if (Date.now() > exp) return null; return s as Session } catch { return null }
}
function persistSession(s: Session | null) {
  try { if (s) sessionStorage.setItem(SESSION_KEY, JSON.stringify({ s, exp: Date.now() + 8 * 3600_000 })); else sessionStorage.removeItem(SESSION_KEY) } catch { /* ignore */ }
}
const restored = restoreSession()

export const useStore = create<State>((set, get) => ({
  session: restored, simulation: null, realSession: restored,
  tabs: [{ id: 's:situation', kind: 'screen', screen: 'situation', title: 'Ситуационный центр' }],
  activeTab: 's:situation',
  inspector: { open: typeof window === 'undefined' || window.innerWidth >= 1000, mode: 'object' },
  pinned: [], palette: false, help: false, tickerOpen: false,
  settings: loadSettings(),
  toasts: [], connection: 'ok', sessionExpiresAt: Date.now() + 8 * 3600_000,
  scrambleSeen: new Set(), assembledSeen: new Set(), flyDone: false, wall: false, chaos: { sapStale: false, pdpDown: false }, mapFocus: null, compare: [],

  setSession: s => { persistSession(s); set({ session: s, realSession: s, simulation: null, sessionExpiresAt: Date.now() + 8 * 3600_000 }) },
  setPurpose: p => set(st => { if (!st.session) return {}; const session = { ...st.session, purpose: p }; persistSession(session); return { session } }),
  logout: () => { persistSession(null); set({ session: null, realSession: null, simulation: null, tabs: [{ id: 's:situation', kind: 'screen', screen: 'situation', title: 'Ситуационный центр' }], activeTab: 's:situation', flyDone: false, assembledSeen: new Set(), scrambleSeen: new Set() }) },
  openScreen: k => get().openTab({ kind: 'screen', screen: k, title: SCREENS.find(s => s.key === k)!.label }),
  openObject: (id, opts = {}) => {
    const o = getObject(id); if (!o) return
    const s = get().session
    if (s) logRead(s, 'read', [id], o.label)
    if (opts.inspector !== false) set({ inspector: { ...get().inspector, open: true, objectId: id, mode: 'object', prop: undefined } })
    if (opts.tab) get().openTab({ kind: 'object', objectId: id, title: `${TYPES[o.type].label}: ${o.label}` })
  },
  openExplain: (id, prop, asTab) => {
    const o = getObject(id); if (!o) return
    const s = get().session; if (s) logRead(s, 'explain', [id], `${o.label}.${prop}`)
    if (asTab) get().openTab({ kind: 'explain', objectId: id, prop, title: `Explain: ${o.label}.${prop}` })
    else set({ inspector: { open: true, objectId: id, mode: 'explain', prop } })
  },
  openAction: (action, objectId, params) => { const o = getObject(objectId); if (!o) return; get().openTab({ kind: 'action', action, objectId, params, title: `Действие: ${o.label}` }) },
  openTab: t => {
    const id = t.id ?? tabIdFor(t)
    const tabs = get().tabs
    if (!tabs.find(x => x.id === id)) set({ tabs: [...tabs, { ...t, id }] })
    set({ activeTab: id })
  },
  closeTab: id => {
    const { tabs, activeTab } = get()
    const idx = tabs.findIndex(t => t.id === id); if (idx < 0) return
    const next = tabs.filter(t => t.id !== id)
    if (!next.length) next.push({ id: 's:situation', kind: 'screen', screen: 'situation', title: 'Ситуационный центр' })
    set({ tabs: next, activeTab: activeTab === id ? next[Math.max(0, idx - 1)].id : activeTab })
  },
  activate: id => set({ activeTab: id }),
  cycleTab: dir => { const { tabs, activeTab } = get(); const i = tabs.findIndex(t => t.id === activeTab); set({ activeTab: tabs[(i + dir + tabs.length) % tabs.length].id }) },
  togglePin: id => set(st => ({ pinned: st.pinned.includes(id) ? st.pinned.filter(x => x !== id) : [...st.pinned, id] })),
  inspect: patch => set(st => ({ inspector: { ...st.inspector, ...patch } })),
  setPalette: v => set({ palette: v }),
  setHelp: v => set({ help: v }),
  setTicker: v => set({ tickerOpen: v }),
  setSettings: p => set(st => { const settings = { ...st.settings, ...p }; applySettings(settings); return { settings } }),
  toast: t => { const id = toastSeq++; set(st => ({ toasts: [...st.toasts, { ...t, id }] })); setTimeout(() => get().dismissToast(id), t.ttl ?? (t.undo ? 8000 : 4000)) },
  dismissToast: id => set(st => ({ toasts: st.toasts.filter(t => t.id !== id) })),
  setConnection: c => set({ connection: c }),
  simulate: (login, purpose) => set(st => ({ simulation: { login, purpose }, session: st.session })),
  endSimulation: () => set(st => ({ simulation: null, session: st.realSession })),
  markScramble: k => { const s = get().scrambleSeen; if (s.has(k)) return false; s.add(k); return true },
  markAssembled: id => { const s = get().assembledSeen; if (s.has(id)) return false; s.add(id); return true },
  setFlyDone: () => set({ flyDone: true }),
  setChaos: p => set(st => ({ chaos: { ...st.chaos, ...p } })),
  focusMap: id => { set({ mapFocus: { id, key: Date.now() } }); get().openScreen('map') },
  toggleCompare: id => set(st => ({ compare: st.compare.includes(id) ? st.compare.filter(x => x !== id) : st.compare.length >= 4 ? st.compare : [...st.compare, id] })),
  clearCompare: () => set({ compare: [] }),
}))

/** Session as seen by screens: the admin "view as user X" simulation narrows the real session. */
export function useSimulatedSession(): Session {
  const session = useStore(s => s.session); const sim = useStore(s => s.simulation)
  return useMemo(() => { if (sim) { const u = USERS.find(x => x.login === sim.login); if (u) return sessionFor(u, sim.purpose) } return session! }, [session, sim])
}

function loadSettings(): Settings {
  const d: Settings = { theme: 'dark', density: 'normal', motion: 'full', presentation: false, ambient: true, sidebar: typeof window !== 'undefined' && window.innerWidth < 1200 ? 'collapsed' : 'expanded' }
  try { const raw = localStorage.getItem('spectr.settings'); if (raw) Object.assign(d, JSON.parse(raw)) } catch { /* ignore */ }
  d.presentation = false
  if (!d.sidebar) d.sidebar = 'expanded'
  applySettings(d)
  return d
}
export function applySettings(s: Settings) {
  const r = document.documentElement
  r.dataset.theme = s.theme; r.dataset.density = s.density; r.dataset.motion = s.motion
  try { localStorage.setItem('spectr.settings', JSON.stringify(s)) } catch { /* ignore */ }
}
export function reducedMotion(): boolean {
  const m = document.documentElement.dataset.motion
  if (m === 'reduced' || m === 'off') return true
  if (m === 'full') return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}
export const activeSession = () => useStore.getState().session

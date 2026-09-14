import { lazy, Suspense, useEffect, useState } from 'react'
import { useStore } from './app/store'
import { Login } from './auth/Login'
const Shell = lazy(() => import('./app/Shell').then(m => ({ default: m.Shell })))
const Wall = lazy(() => import('./screens/Wall').then(m => ({ default: m.Wall })))
import { tick } from './data/api'

export function App() {
  const session = useStore(s => s.session)
  const setSession = useStore(s => s.setSession)
  const [route, setRoute] = useState(location.hash)
  useEffect(() => { const h = () => setRoute(location.hash); window.addEventListener('hashchange', h); return () => window.removeEventListener('hashchange', h) }, [])
  useEffect(() => { const id = setInterval(() => { if (document.visibilityState === 'visible') tick() }, 1000); return () => clearInterval(id) }, [])
  if (route.startsWith('#/wall')) return <Suspense fallback={null}><Wall /></Suspense>
  if (!session) return <Login onDone={s => { setSession(s); if (location.hash.startsWith('#/login')) location.hash = '#/s/situation' }} />
  return <><div className="ground" /><Suspense fallback={<div style={{ position: 'fixed', inset: 0, background: 'var(--sp-bg)' }} />}><Shell /></Suspense></>
}

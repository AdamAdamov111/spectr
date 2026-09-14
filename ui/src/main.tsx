import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/inter'
import '@fontsource-variable/jetbrains-mono'
import './design/tokens.css'
import './design/app.css'
import './screens/screens.css'
import { App } from './App'
import { useStore } from './app/store'

if (import.meta.env.DEV) (window as unknown as { __store?: unknown }).__store = useStore

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)

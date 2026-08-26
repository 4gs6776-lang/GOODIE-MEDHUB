import React from 'react'
import ReactDOM from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import App from './App'
import './theme/globals.css'
import './theme/components.css'
import './theme/dashboard.css'
import './theme/owner.css'
import './theme/billing.css'
import './theme/mobile.css'

// Apply the saved theme immediately, before any page renders. Dark is
// the app-wide default — light mode only turns on if the person has
// explicitly toggled it before (Dashboard.jsx's sun/moon switch writes
// this same key). Doing it here — not just inside Dashboard.jsx — means
// every route (Login, Owner Portal, every dashboard section) starts
// dark and stays consistent, instead of only the Dashboard applying it.
try {
  const savedTheme = localStorage.getItem('gmedhub-theme')
  document.documentElement.classList.toggle('light-mode', savedTheme === 'light')
} catch {}

registerSW({ immediate: true })

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)

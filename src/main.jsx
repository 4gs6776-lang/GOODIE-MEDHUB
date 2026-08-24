import React from 'react'
import ReactDOM from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import App from './App'
import './theme/globals.css'
import './theme/components.css'
import './theme/dashboard.css'
import './theme/owner.css'
import './theme/mobile.css'
registerSW({ immediate: true })

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)

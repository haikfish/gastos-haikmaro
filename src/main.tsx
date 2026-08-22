import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { App } from './App'
import './tema.css'

createRoot(document.getElementById('raiz')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// El service worker: es lo que hace que la app abra sin señal.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('./sw.js')
  })
}

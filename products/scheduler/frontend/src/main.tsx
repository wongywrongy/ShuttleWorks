import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Self-hosted variable fonts. Geist for UI text, JetBrains Mono for numerics.
// Importing here registers the @font-face rules globally; weights are loaded
// on demand by the variable font.
import '@fontsource-variable/geist'
import '@fontsource-variable/jetbrains-mono'
import './index.css'
import App from './app/App.tsx'

// One-time cleanup of the pre-store-split localStorage key. The combined
// useAppStore used to persist a subset of fields here; the three new
// stores rely on the server snapshot instead, so any leftover blob is
// stale on every machine.
try {
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem('scheduler-storage');
  }
} catch {
  // ignore (private-mode, quota, etc.)
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

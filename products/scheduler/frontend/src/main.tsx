import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Self-hosted variable fonts. Geist for UI text, JetBrains Mono for numerics.
// Importing here registers the @font-face rules globally; weights are loaded
// on demand by the variable font.
import '@fontsource-variable/geist'
import '@fontsource-variable/jetbrains-mono'
import './index.css'
import App from './app/App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BRAND } from '@scheduler/brand'
// Self-hosted variable fonts. Geist for UI text, JetBrains Mono for numerics,
// Archivo for the display role. Importing here registers the @font-face rules
// globally; weights are loaded on demand by the variable font.
//
// Archivo is imported from its `wdth` subpath, which carries the WIDTH axis
// (62–125%) as well as weight — that is the whole point of the face here. The
// display role is condensed on purpose: it borrows from the object every
// player in the hall is already reading, the scoreboard.
import '@fontsource-variable/geist'
import '@fontsource-variable/jetbrains-mono'
import '@fontsource-variable/archivo/wdth.css'
import './index.css'
import App from './app/App.tsx'
import { errorHarnessEnabled, installErrorHarness } from './platform/errorHarness'

document.title = BRAND.productName

// Interaction-audit instrumentation: dev builds and VITE_ERROR_HARNESS=1
// builds record uncaught errors / rejections / console.error with the
// triggering interaction. No-op in normal production builds.
if (errorHarnessEnabled()) {
  installErrorHarness()
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

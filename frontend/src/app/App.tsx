import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { IconContext } from '@phosphor-icons/react';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { AppShell } from './AppShell';

// Phosphor defaults: ultra-light strokes are the visual lift the
// taste skills mandate. ``size="1em"`` lets size flow from the
// surrounding font size so chips, buttons, eyebrow rows all scale
// proportionally without per-callsite overrides.
const ICON_DEFAULTS = { weight: 'light' as const, size: '1em' as const, mirrored: false };

const PublicDisplayPage = lazy(() =>
  import('../pages/PublicDisplayPage').then((m) => ({ default: m.PublicDisplayPage })),
);

function App() {
  return (
    <ErrorBoundary>
      <IconContext.Provider value={ICON_DEFAULTS}>
      <BrowserRouter>
        <Routes>
          {/* Standalone fullscreen TV view — no shell, no HUD, no nav. */}
          <Route
            path="/display"
            element={
              <Suspense fallback={<div className="p-4 text-sm text-muted-foreground">Loading…</div>}>
                <PublicDisplayPage />
              </Suspense>
            }
          />
          {/* Legacy deep links redirect to root so existing bookmarks keep working. */}
          <Route path="/tracking" element={<Navigate to="/" replace />} />
          <Route path="/live-ops" element={<Navigate to="/" replace />} />
          {/* Everything else is the one-shell app. */}
          <Route path="/*" element={<AppShell />} />
        </Routes>
      </BrowserRouter>
      </IconContext.Provider>
    </ErrorBoundary>
  );
}

export default App;

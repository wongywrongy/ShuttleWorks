import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { IconContext } from '@phosphor-icons/react';
import { ErrorBoundary } from '../components/ErrorBoundary';

// Phosphor defaults: ultra-light strokes are the visual lift the
// taste skills mandate. ``size="1em"`` lets size flow from the
// surrounding font size so chips, buttons, eyebrow rows all scale
// proportionally without per-callsite overrides.
const ICON_DEFAULTS = { weight: 'light' as const, size: '1em' as const, mirrored: false };

const PublicDisplayPage = lazy(() =>
  import('../pages/PublicDisplayPage').then((m) => ({ default: m.PublicDisplayPage })),
);
const TournamentListPage = lazy(() =>
  import('../pages/TournamentListPage').then((m) => ({ default: m.TournamentListPage })),
);
const TournamentPage = lazy(() =>
  import('../pages/TournamentPage').then((m) => ({ default: m.TournamentPage })),
);

function Fallback() {
  return <div className="p-4 text-sm text-muted-foreground">Loading…</div>;
}

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
              <Suspense fallback={<Fallback />}>
                <PublicDisplayPage />
              </Suspense>
            }
          />
          {/* Legacy deep links redirect to the list. */}
          <Route path="/tracking" element={<Navigate to="/" replace />} />
          <Route path="/live-ops" element={<Navigate to="/" replace />} />
          {/* Dashboard / tournament list. */}
          <Route
            path="/"
            element={
              <Suspense fallback={<Fallback />}>
                <TournamentListPage />
              </Suspense>
            }
          />
          {/* Per-tournament app shell. ``*`` keeps internal tab state
              owned by AppShell (no nested routes). */}
          <Route
            path="/tournaments/:id/*"
            element={
              <Suspense fallback={<Fallback />}>
                <TournamentPage />
              </Suspense>
            }
          />
          {/* Fallback — anything else goes home. */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
      </IconContext.Provider>
    </ErrorBoundary>
  );
}

export default App;

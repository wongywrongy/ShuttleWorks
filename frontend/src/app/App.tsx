import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { AppShell } from './AppShell';

const PublicDisplayPage = lazy(() =>
  import('../pages/PublicDisplayPage').then((m) => ({ default: m.PublicDisplayPage })),
);

function App() {
  return (
    <ErrorBoundary>
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
    </ErrorBoundary>
  );
}

export default App;

import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { IconContext } from '@phosphor-icons/react';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { AuthProvider } from '../context/AuthContext';
import { AuthGuard } from './AuthGuard';

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
const LoginPage = lazy(() =>
  import('../pages/LoginPage').then((m) => ({ default: m.LoginPage })),
);

function Fallback() {
  return <div className="p-4 text-sm text-muted-foreground">Loading…</div>;
}

function App() {
  return (
    <ErrorBoundary>
      <IconContext.Provider value={ICON_DEFAULTS}>
        <BrowserRouter>
          <AuthProvider>
            <Routes>
              {/* Public: login. */}
              <Route
                path="/login"
                element={
                  <Suspense fallback={<Fallback />}>
                    <LoginPage />
                  </Suspense>
                }
              />

              {/* Public: TV view. The /display route reads the
                  tournament_id from the URL query string and polls
                  read-only. Step 7's /invite/:token will join this
                  set of public routes when it lands. */}
              <Route
                path="/display"
                element={
                  <Suspense fallback={<Fallback />}>
                    <PublicDisplayPage />
                  </Suspense>
                }
              />

              {/* Legacy redirects. */}
              <Route path="/tracking" element={<Navigate to="/" replace />} />
              <Route path="/live-ops" element={<Navigate to="/" replace />} />

              {/* Authenticated: dashboard list. */}
              <Route
                path="/"
                element={
                  <AuthGuard>
                    <Suspense fallback={<Fallback />}>
                      <TournamentListPage />
                    </Suspense>
                  </AuthGuard>
                }
              />

              {/* Authenticated: per-tournament shell. */}
              <Route
                path="/tournaments/:id/*"
                element={
                  <AuthGuard>
                    <Suspense fallback={<Fallback />}>
                      <TournamentPage />
                    </Suspense>
                  </AuthGuard>
                }
              />

              {/* Fallback. */}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </AuthProvider>
        </BrowserRouter>
      </IconContext.Provider>
    </ErrorBoundary>
  );
}

export default App;

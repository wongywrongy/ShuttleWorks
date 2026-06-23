import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useParams } from 'react-router-dom';
import { IconContext } from '@phosphor-icons/react';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { AuthProvider } from '../context/AuthContext';
import { useAppliedTheme } from '../hooks/useAppliedTheme';
import { useAppliedDensity } from '../hooks/useAppliedDensity';
import { AuthGuard } from './AuthGuard';

const ICON_DEFAULTS = { weight: 'light' as const, size: '1em' as const, mirrored: false };

const PublicDisplayPage = lazy(() =>
  import('../products/display/PublicDisplayPage').then((m) => ({ default: m.PublicDisplayPage })),
);
const HubPage = lazy(() =>
  import('../products/hub/HubPage').then((m) => ({ default: m.HubPage })),
);
const TournamentPage = lazy(() =>
  import('../pages/TournamentPage').then((m) => ({ default: m.TournamentPage })),
);
const LoginPage = lazy(() =>
  import('../pages/LoginPage').then((m) => ({ default: m.LoginPage })),
);
const InvitePage = lazy(() =>
  import('../pages/InvitePage').then((m) => ({ default: m.InvitePage })),
);

function Fallback() {
  return <div className="p-4 text-sm text-muted-foreground">Loading…</div>;
}

/** Legacy redirect: pre-Bundle-3 URLs pointed at the bare /bracket
 *  segment. Redirect them to /bracket-setup so bookmarks and shared
 *  links don't 404. Uses an absolute target so React Router resolves
 *  the path correctly (a bare relative "bracket-setup" would append
 *  to the matched segment and produce /bracket/bracket-setup). */
function BracketLegacyRedirect() {
  const { id } = useParams<{ id: string }>();
  return <Navigate to={`/tournaments/${id}/bracket-setup`} replace />;
}

function App() {
  // Theme + density apply to <html> and must run on every route —
  // including the public ones (login, invite, display) and the dashboard
  // at `/`, which sit outside the AppShell. Mounted here so a fresh load
  // to any route honors the user's stored preference (or system pref).
  useAppliedTheme();
  useAppliedDensity();
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

              {/* Public: invite landing. The page itself handles the
                  "redirect to login if not authenticated" flow so a
                  shared link works without requiring the recipient to
                  be signed in already. */}
              <Route
                path="/invite/:token"
                element={
                  <Suspense fallback={<Fallback />}>
                    <InvitePage />
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
                      <HubPage />
                    </Suspense>
                  </AuthGuard>
                }
              />

              {/* Legacy redirect: pre-Bundle-3 URLs pointed at the bare /bracket
                  segment. Redirect them to /bracket-setup so bookmarks and shared
                  links don't 404. Replace semantics so the operator's history
                  stays clean (no back-button stop on the dead legacy URL). */}
              <Route
                path="/tournaments/:id/bracket"
                element={<BracketLegacyRedirect />}
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

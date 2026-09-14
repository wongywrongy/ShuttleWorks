import { lazy, Suspense } from 'react';
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
  useParams,
} from 'react-router-dom';
import { IconContext } from '@phosphor-icons/react';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { AuthProvider } from '../context/AuthContext';
import { useAppliedTheme } from '../hooks/useAppliedTheme';
import { useAppliedDensity } from '../hooks/useAppliedDensity';
import { AuthedLayout } from './AuthedLayout';
import { authWorkspaceScope } from '../lib/authWorkspaceScope';
import { rememberedNodeWorkspace } from '../lib/nodeWorkspace';
import { HomeRoute, NotFound } from './HomeRoute';

const ICON_DEFAULTS = { weight: 'light' as const, size: '1em' as const, mirrored: false };

const NodeEnrollmentPage = lazy(() => import('../platform/auth/NodeEnrollmentPage').then(m => ({ default: m.NodeEnrollmentPage })));

function RoutedAuthProvider({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  // A bare `/` names no workspace; an event node still needs its scope to
  // resolve the operator's cookie (a selector, not a credential).
  const workspaceId = authWorkspaceScope(location.pathname, location.search, location.state)
    ?? (location.pathname === '/' ? rememberedNodeWorkspace() : undefined);
  return <AuthProvider workspaceId={workspaceId}>
    {children}
  </AuthProvider>;
}

const PublicDisplayPage = lazy(() =>
  import('../modules/display/PublicDisplayPage').then((m) => ({ default: m.PublicDisplayPage })),
);
const NewWorkspacePage = lazy(() =>
  import('../modules/hub/NewWorkspacePage').then((m) => ({ default: m.NewWorkspacePage })),
);
const GlobalSettingsPage = lazy(() =>
  import('../modules/settings/GlobalSettingsPage').then((m) => ({
    default: m.GlobalSettingsPage,
  })),
);
const TournamentPage = lazy(() =>
  import('../pages/TournamentPage').then((m) => ({ default: m.TournamentPage })),
);
const LoginPage = lazy(() =>
  import('../platform/auth/LoginPage').then((m) => ({ default: m.LoginPage })),
);
const InvitePage = lazy(() =>
  import('../platform/auth/InvitePage').then((m) => ({ default: m.InvitePage })),
);

function Fallback() {
  return <div className="p-4 text-sm text-muted-foreground">Loading…</div>;
}

function TournamentRootRedirect() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  return (
    <Navigate
      to={{ pathname: `/tournaments/${id}/overview`, search: location.search, hash: location.hash }}
      replace
    />
  );
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
          <RoutedAuthProvider>
            <Routes>
              <Route path="/node-enrollment" element={<Suspense fallback={<Fallback />}><NodeEnrollmentPage /></Suspense>} />
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

              {/* Authenticated app — one layout mounts the persistent global
                  sidebar (AppSidebar) + AuthGuard + Suspense around the routed
                  content, so the rail is present on every authenticated surface
                  incl. inside a workspace. */}
              <Route element={<AuthedLayout />}>
                <Route path="/" element={<HomeRoute />} />
                <Route path="/new" element={<NewWorkspacePage />} />
                {/* Global (app-wide) settings — distinct from per-workspace. */}
                <Route path="/settings" element={<GlobalSettingsPage />} />
                <Route path="/tournaments/:id" element={<TournamentRootRedirect />} />
                <Route path="/tournaments/:id/*" element={<TournamentPage />} />
                {/* Unknown paths are honest dead ends; legacy URLs are not
                    silently redirected into a different task. */}
                <Route path="*" element={<NotFound />} />
              </Route>
            </Routes>
          </RoutedAuthProvider>
        </BrowserRouter>
      </IconContext.Provider>
    </ErrorBoundary>
  );
}

export default App;

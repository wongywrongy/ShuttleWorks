/**
 * Redirect to ``/login`` when no Supabase session.
 *
 * Mounted between ``BrowserRouter`` and the protected route subtree.
 * In local-dev mode (no Supabase env config), the synthetic session
 * provided by ``AuthProvider`` lets every request through, so the
 * guard is a no-op for the developer experience and pytest harness.
 *
 * Loading: while ``supabase.auth.getSession()`` resolves on first
 * mount, render a thin spinner instead of flashing the login form —
 * a flicker would be confusing for an already-authenticated user.
 */
import { Navigate, useLocation, type Location } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth();
  const location: Location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <>{children}</>;
}

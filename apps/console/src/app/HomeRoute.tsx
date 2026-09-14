import { lazy } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { homePath } from '../lib/nodeWorkspace';

const HubPage = lazy(() =>
  import('../modules/hub/HubPage').then((m) => ({ default: m.HubPage })),
);

/** `/`: the Hub lists workspaces; an event-node operator has exactly one,
 *  and their node credential cannot list anything else. */
export function HomeRoute() {
  const { user } = useAuth();
  if (user?.offlineWorkspaceId) return <Navigate to={homePath(user.offlineWorkspaceId)} replace />;
  return <HubPage />;
}

/** Unknown paths are honest dead ends; legacy URLs are not silently
 *  redirected into a different task. */
export function NotFound() {
  const { user } = useAuth();
  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-2 p-6 text-center">
      <h1 className="text-sm font-semibold text-foreground">Page not found</h1>
      <p className="text-sm text-muted-foreground">This ShuttleWorks page is no longer available.</p>
      <Link to={homePath(user?.offlineWorkspaceId)} className="text-sm text-accent underline underline-offset-2">Go to your workspaces</Link>
    </main>
  );
}

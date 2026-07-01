/**
 * AuthedLayout — the chrome shared by every authenticated surface. Mounts the
 * persistent global sidebar to the left of the routed content. The page in the
 * <Outlet/> owns its own scroll; the layout owns the viewport height (so pages
 * use `h-full`, not `h-screen`, to avoid a double scrollbar).
 */
import { Suspense } from 'react';
import { Outlet } from 'react-router-dom';
import { AuthGuard } from './AuthGuard';
import { AppSidebar } from './AppSidebar';

function Fallback() {
  return <div className="p-4 text-sm text-muted-foreground">Loading…</div>;
}

export function AuthedLayout() {
  return (
    <AuthGuard>
      <div className="flex h-screen overflow-hidden bg-background text-foreground">
        <AppSidebar />
        <main className="flex min-h-0 min-w-0 flex-1 flex-col">
          <Suspense fallback={<Fallback />}>
            <Outlet />
          </Suspense>
        </main>
      </div>
    </AuthGuard>
  );
}

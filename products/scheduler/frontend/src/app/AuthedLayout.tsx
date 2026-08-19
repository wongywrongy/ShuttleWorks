/**
 * AuthedLayout — the chrome shared by every authenticated surface. Mounts the
 * persistent global sidebar to the left of the routed content. The page in the
 * <Outlet/> owns its own scroll; the layout owns the viewport height (so pages
 * use `h-full`, not `h-screen`, to avoid a double scrollbar).
 *
 * This `<main>` is THE main landmark for every authenticated page — the only
 * element on an authed screen outside it is the global nav rail, which is
 * exactly what a main landmark is supposed to exclude. Routed pages must not
 * open a second one (the HTML spec allows only one per document and screen
 * readers announce both); `AppShell` deep-links past its own chrome with a
 * plain `<div id="main">` instead.
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

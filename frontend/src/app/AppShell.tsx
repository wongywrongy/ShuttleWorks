import { lazy, Suspense, useEffect } from 'react';
import { useAppStore } from '../store/appStore';
import { useTournamentState } from '../hooks/useTournamentState';
import { useAppliedTheme } from '../hooks/useAppliedTheme';
import { useAppliedDensity } from '../hooks/useAppliedDensity';
import { TabBar } from './TabBar';
import { SolverHud } from '../components/SolverHud';
import { UnsavedBanner } from '../components/UnsavedBanner';
import { ToastStack } from '../components/Toast';
import { PublicDisplaySettings } from '../features/tournaments/PublicDisplaySettings';

// Tabs are wired to the existing pages during Step 4. Each tab is replaced with
// a dedicated Tab component in Step 5 (inline authoring). Using lazy() keeps
// the tab-switch fast and matches the previous per-page load behaviour.
const TournamentSetupPage = lazy(() =>
  import('../pages/TournamentSetupPage').then((m) => ({ default: m.TournamentSetupPage })),
);
const RosterTab = lazy(() =>
  import('../features/roster/RosterTab').then((m) => ({ default: m.RosterTab })),
);
const MatchesTab = lazy(() =>
  import('../features/matches/MatchesTab').then((m) => ({ default: m.MatchesTab })),
);
const SchedulePage = lazy(() =>
  import('../pages/SchedulePage').then((m) => ({ default: m.SchedulePage })),
);
const MatchControlCenterPage = lazy(() =>
  import('../pages/MatchControlCenterPage').then((m) => ({ default: m.MatchControlCenterPage })),
);
const PublicDisplayPage = lazy(() =>
  import('../pages/PublicDisplayPage').then((m) => ({ default: m.PublicDisplayPage })),
);

const FALLBACK = (
  <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Loading…</div>
);

export function AppShell() {
  // Hydrate from server-side tournament.json on mount + debounced PUTs on change.
  useTournamentState();
  // Apply the user's theme preference to <html> (adds/removes `.dark`).
  useAppliedTheme();
  // Apply the user's density preference to <html> (sets data-density).
  useAppliedDensity();
  const activeTab = useAppStore((s) => s.activeTab);
  const pushToast = useAppStore((s) => s.pushToast);

  // Catch anything that would otherwise surface only in the devtools console
  // — unhandled promise rejections and top-level runtime errors — and surface
  // them as sticky error toasts with a dev-friendly detail line.
  useEffect(() => {
    const onRejection = (ev: PromiseRejectionEvent) => {
      const reason = ev.reason;
      const msg = reason instanceof Error ? reason.message : String(reason ?? 'Unknown error');
      // Keep the full stack in the console for debugging.
      console.error('[unhandledrejection]', reason);
      pushToast({
        level: 'error',
        message: 'Unhandled error',
        detail: msg,
      });
    };
    const onError = (ev: ErrorEvent) => {
      console.error('[window.error]', ev.error ?? ev.message);
      pushToast({
        level: 'error',
        message: 'Unexpected error',
        detail: ev.message,
      });
    };
    window.addEventListener('unhandledrejection', onRejection);
    window.addEventListener('error', onError);
    return () => {
      window.removeEventListener('unhandledrejection', onRejection);
      window.removeEventListener('error', onError);
    };
  }, [pushToast]);

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <TabBar />
      <div className="px-2 pt-1">
        <UnsavedBanner />
      </div>
      <main className="flex-1 overflow-auto">
        <Suspense fallback={FALLBACK}>
          {activeTab === 'setup' ? <TournamentSetupPage /> : null}
          {activeTab === 'roster' ? <RosterTab /> : null}
          {activeTab === 'matches' ? <MatchesTab /> : null}
          {activeTab === 'schedule' ? <SchedulePage /> : null}
          {activeTab === 'live' ? <MatchControlCenterPage /> : null}
          {activeTab === 'tv' ? (
            <div className="p-4 text-sm text-muted-foreground">
              This tab is a preview of the public display.
              {' '}
              <a href="/display" className="text-blue-600 underline">
                Open fullscreen TV view
              </a>
              {/* Director-only TV settings: lives on the TV tab so the
                  configuration sits beside the preview that reflects it.
                  Hidden on the standalone /display window. */}
              <div className="mt-3">
                <PublicDisplaySettings />
              </div>
              <div className="mt-4 rounded border bg-card">
                <PublicDisplayPage />
              </div>
            </div>
          ) : null}
        </Suspense>
      </main>
      <SolverHud />
      <ToastStack />
    </div>
  );
}

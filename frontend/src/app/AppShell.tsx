import { lazy, Suspense, useEffect } from 'react';
import { ExternalLink, Settings2 } from 'lucide-react';
import { useAppStore } from '../store/appStore';
import { useTournamentState } from '../hooks/useTournamentState';
import { useAppliedTheme } from '../hooks/useAppliedTheme';
import { useAppliedDensity } from '../hooks/useAppliedDensity';
import { TabBar } from './TabBar';
import { SolverHud } from '../components/SolverHud';
import { UnsavedBanner } from '../components/UnsavedBanner';
import { ToastStack } from '../components/Toast';
import { INTERACTIVE_BASE } from '../lib/utils';

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
    <div className="flex h-screen flex-col overflow-hidden bg-background text-foreground">
      <TabBar />
      <UnsavedBannerSlot />
      <main className="flex-1 min-h-0 overflow-auto">
        <Suspense fallback={FALLBACK}>
          {activeTab === 'setup' ? <TournamentSetupPage /> : null}
          {activeTab === 'roster' ? <RosterTab /> : null}
          {activeTab === 'matches' ? <MatchesTab /> : null}
          {activeTab === 'schedule' ? <SchedulePage /> : null}
          {activeTab === 'live' ? <MatchControlCenterPage /> : null}
          {activeTab === 'tv' ? <TvPreviewTab /> : null}
        </Suspense>
      </main>
      <SolverHud />
      <ToastStack />
    </div>
  );
}

// Banner slot: collapses to zero height when no banner is visible so the
// main flex-fill layout stays exact. UnsavedBanner returns null when idle.
function UnsavedBannerSlot() {
  return (
    <div className="empty:hidden border-b border-border bg-background px-4 py-1.5">
      <UnsavedBanner />
    </div>
  );
}

// TV tab: presentation-grade preview with primary CTA + secondary action.
// The PublicDisplayPage is fullscreen-designed; embedding it inline used to
// look broken. We keep the embed but frame it as an aspect-ratio preview
// card with clear hierarchy and pointer-events disabled so it reads as a
// preview, not a live surface.
function TvPreviewTab() {
  const setActiveTab = useAppStore((s) => s.setActiveTab);
  return (
    <div className="mx-auto flex h-full max-w-[1400px] flex-col gap-4 px-4 py-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">Public display</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Preview of the venue TV. Open fullscreen on the display device.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setActiveTab('setup');
              const url = new URL(window.location.href);
              url.searchParams.set('section', 'display');
              window.history.replaceState({}, '', url.toString());
            }}
            className={`${INTERACTIVE_BASE} inline-flex items-center gap-1.5 rounded border border-border bg-card px-3 py-1.5 text-sm text-card-foreground hover:bg-accent hover:text-accent-foreground`}
          >
            <Settings2 aria-hidden="true" className="h-4 w-4" />
            Configure display
          </button>
          <a
            href="/display"
            target="_blank"
            rel="noopener noreferrer"
            className={`${INTERACTIVE_BASE} inline-flex items-center gap-1.5 rounded bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90`}
          >
            <ExternalLink aria-hidden="true" className="h-4 w-4" />
            Open fullscreen
          </a>
        </div>
      </header>
      <div className="relative flex-1 min-h-0 overflow-hidden rounded-lg border border-border bg-card shadow-sm">
        <div className="pointer-events-none absolute inset-0 overflow-auto">
          <PublicDisplayPage />
        </div>
      </div>
    </div>
  );
}

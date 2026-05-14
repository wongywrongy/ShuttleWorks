import { lazy, Suspense, useEffect } from 'react';
import { ArrowSquareOut, GearSix } from '@phosphor-icons/react';
import { useUiStore } from '../store/uiStore';
import { useTournamentState } from '../hooks/useTournamentState';
import { useAdvisories } from '../hooks/useAdvisories';
import { useSuggestions } from '../hooks/useSuggestions';
import { TabBar } from './TabBar';
import { SolverHud } from '../components/SolverHud';
import { UnsavedBanner } from '../components/UnsavedBanner';
import { ToastStack } from '../components/Toast';
import { UnlockModalHost } from '../components/common/UnlockModalHost';
import { TabSkeleton } from '../components/TabSkeleton';
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
const BracketTab = lazy(() =>
  import('../features/bracket/BracketTab').then((m) => ({ default: m.BracketTab })),
);

// FALLBACK is now built per-tab via TabSkeleton so the Suspense
// shape matches the layout that's about to mount.

export function AppShell() {
  // Hydrate from server-side tournament.json on mount + debounced PUTs on change.
  // Theme + density hooks live at App.tsx level so they fire on every route.
  useTournamentState();
  // Poll /schedule/advisories every 15s and surface warn/critical
  // advisories as toasts. Single mount covers every page.
  useAdvisories();
  // Poll /schedule/suggestions every 8s and drop into appStore.
  // The SuggestionsRail (rendered per-page directly under each
  // AdvisoryBanner) reads from the store.
  useSuggestions();
  const activeTab = useUiStore((s) => s.activeTab);
  const activeTournamentKind = useUiStore((s) => s.activeTournamentKind);
  const pushToast = useUiStore((s) => s.pushToast);
  const setActiveProposal = useUiStore((s) => s.setActiveProposal);

  // Discard any in-flight proposal when the operator switches tabs.
  // Otherwise the next visit to the originating tab re-opens the
  // diff modal with stale data (the schedule may have changed in the
  // meantime; the operator hasn't agreed to commit those exact moves).
  // Server-side TTL eviction will clean up the abandoned proposal.
  useEffect(() => {
    setActiveProposal(null);
    // intentionally trigger only on tab change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  // Catch anything that would otherwise surface only in the devtools console
  // — unhandled promise rejections and top-level runtime errors — and surface
  // them as sticky error toasts with a dev-friendly detail line.
  useEffect(() => {
    const onRejection = (ev: PromiseRejectionEvent) => {
      const reason = ev.reason;
      // The axios response interceptor on ``apiClient.client`` stamps
      // ``__handled = true`` on every error it surfaces (including the
      // deduped toasts). Re-toasting those here just creates a second
      // pop-up for an already-shown failure. Console-log only.
      if (
        reason &&
        typeof reason === 'object' &&
        (reason as { __handled?: boolean }).__handled
      ) {
        console.error('[unhandledrejection — already toasted]', reason);
        return;
      }
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
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-background text-foreground">
      {/* Operator-surface texture — a barely-perceptible noise overlay
          (1.8% alpha) lifts the flat ``--background`` away from looking
          like a default Tailwind tint. Fixed + pointer-events-none keeps
          it off the GPU's continuous-repaint path; the SVG is inlined as
          a data URI so it doesn't add a network request. Hidden from
          reduced-motion users for whom the visual fizz can be
          distracting. */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-hud opacity-[0.018] mix-blend-overlay motion-reduce:hidden"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200' viewBox='0 0 200 200'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")",
        }}
      />
      {/* Skip-link: hidden until focused. Lets keyboard users jump past the
          TabBar straight into the active pane. The target id (#main) is on
          the <main> element below. */}
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-modal focus:rounded-sm focus:bg-primary focus:px-3 focus:py-1.5 focus:text-sm focus:text-primary-foreground focus:shadow-md focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
      >
        Skip to content
      </a>
      <TabBar />
      <UnsavedBannerSlot />
      <main id="main" className="flex-1 min-h-0 overflow-auto">
        <Suspense fallback={<TabSkeleton tab={activeTab} />}>
          {/* Bracket-kind tournaments skip the activeTab dispatch and
              render BracketTab directly — the meet tabs aren't
              relevant. ``activeTournamentKind`` is loaded by
              ``useTournamentKind`` on mount; while it's ``null`` the
              shell falls back to the meet-style tab dispatch below. */}
          {activeTournamentKind === 'bracket' ? (
            <div key="bracket" className="h-full animate-block-in">
              <BracketTab />
            </div>
          ) : (
            // Re-keying on activeTab forces a remount and re-runs the
            // animate-block-in entry so each tab switch reads as a
            // deliberate arrival, not a flash.
            <div key={activeTab} className="h-full animate-block-in">
              {activeTab === 'setup' ? <TournamentSetupPage /> : null}
              {activeTab === 'roster' ? <RosterTab /> : null}
              {activeTab === 'matches' ? <MatchesTab /> : null}
              {activeTab === 'schedule' ? <SchedulePage /> : null}
              {activeTab === 'live' ? <MatchControlCenterPage /> : null}
              {activeTab === 'tv' ? <TvPreviewTab /> : null}
            </div>
          )}
        </Suspense>
      </main>
      <SolverHud />
      <ToastStack />
      <UnlockModalHost />
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
  const setActiveTab = useUiStore((s) => s.setActiveTab);
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
            className={`${INTERACTIVE_BASE} inline-flex items-center gap-1.5 rounded border border-border bg-card px-3 py-1.5 text-sm text-card-foreground hover:bg-muted/40 hover:text-foreground`}
          >
            <GearSix aria-hidden="true" className="h-4 w-4" />
            Configure display
          </button>
          <a
            href="/display"
            target="_blank"
            rel="noopener noreferrer"
            className={`${INTERACTIVE_BASE} inline-flex items-center gap-1.5 rounded bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90`}
          >
            <ArrowSquareOut aria-hidden="true" className="h-4 w-4" />
            Open fullscreen
          </a>
        </div>
      </header>
      <div className="relative flex-1 min-h-0 overflow-hidden border border-border bg-card">
        <div className="pointer-events-none absolute inset-0 overflow-auto">
          <PublicDisplayPage />
        </div>
      </div>
    </div>
  );
}

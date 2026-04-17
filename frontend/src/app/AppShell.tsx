import { lazy, Suspense } from 'react';
import { useAppStore } from '../store/appStore';
import { useTournamentState } from '../hooks/useTournamentState';
import { TabBar } from './TabBar';
import { SolverHud } from '../components/SolverHud';

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
  <div className="flex h-full items-center justify-center text-sm text-gray-500">Loading…</div>
);

export function AppShell() {
  // Hydrate from server-side tournament.json on mount + debounced PUTs on change.
  useTournamentState();
  const activeTab = useAppStore((s) => s.activeTab);

  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      <TabBar />
      <main className="flex-1 overflow-auto">
        <Suspense fallback={FALLBACK}>
          {activeTab === 'setup' ? <TournamentSetupPage /> : null}
          {activeTab === 'roster' ? <RosterTab /> : null}
          {activeTab === 'matches' ? <MatchesTab /> : null}
          {activeTab === 'schedule' ? <SchedulePage /> : null}
          {activeTab === 'live' ? <MatchControlCenterPage /> : null}
          {activeTab === 'tv' ? (
            <div className="p-4 text-sm text-gray-600">
              This tab is a preview of the public display.
              {' '}
              <a href="/display" className="text-blue-600 underline">
                Open fullscreen TV view
              </a>
              <div className="mt-4 rounded border bg-white">
                <PublicDisplayPage />
              </div>
            </div>
          ) : null}
        </Suspense>
      </main>
      <SolverHud />
    </div>
  );
}

import { lazy, Suspense } from 'react';
import { useUiStore } from '../../store/uiStore';
import { TabBar } from '../../app/TabBar';
import { TabSkeleton } from '../../components/TabSkeleton';

const TournamentSetupPage = lazy(() =>
  import('./TournamentSetupPage').then((m) => ({ default: m.TournamentSetupPage })),
);
const RosterTab = lazy(() =>
  import('./roster/RosterTab').then((m) => ({ default: m.RosterTab })),
);
const MatchesTab = lazy(() =>
  import('./matches/MatchesTab').then((m) => ({ default: m.MatchesTab })),
);
const SchedulePage = lazy(() =>
  import('./SchedulePage').then((m) => ({ default: m.SchedulePage })),
);
const MatchControlCenterPage = lazy(() =>
  import('./MatchControlCenterPage').then((m) => ({ default: m.MatchControlCenterPage })),
);

/** Meet product mode: the operator tab strip + the active meet tab. The `tv`
 *  tab is no longer here — it became the Display product mode. */
export function MeetProduct() {
  const activeTab = useUiStore((s) => s.activeTab);
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <TabBar />
      <div className="min-h-0 flex-1 overflow-auto">
        <Suspense fallback={<TabSkeleton tab={activeTab} />}>
          <div key={activeTab} className="h-full animate-block-in">
            {activeTab === 'setup' ? <TournamentSetupPage /> : null}
            {activeTab === 'roster' ? <RosterTab /> : null}
            {activeTab === 'matches' ? <MatchesTab /> : null}
            {activeTab === 'schedule' ? <SchedulePage /> : null}
            {activeTab === 'live' ? <MatchControlCenterPage /> : null}
          </div>
        </Suspense>
      </div>
    </div>
  );
}

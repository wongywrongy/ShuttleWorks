import { useAppStore, type AppTab } from '../store/appStore';
import { AppStatusPopover } from '../components/AppStatusPopover';

type TabDef = { id: AppTab; label: string; hint?: string };

const TABS: TabDef[] = [
  { id: 'setup', label: 'Setup' },
  { id: 'roster', label: 'Roster' },
  { id: 'matches', label: 'Matches' },
  { id: 'schedule', label: 'Schedule' },
  { id: 'live', label: 'Live' },
  { id: 'tv', label: 'TV' },
];

export function TabBar() {
  const activeTab = useAppStore((s) => s.activeTab);
  const setActiveTab = useAppStore((s) => s.setActiveTab);
  const matches = useAppStore((s) => s.matches);
  const players = useAppStore((s) => s.players);

  const disabledTabs = new Set<AppTab>();
  if (players.length === 0) disabledTabs.add('matches');
  if (matches.length === 0) disabledTabs.add('schedule');
  if (matches.length === 0) disabledTabs.add('live');

  return (
    <nav
      aria-label="Tournament scheduler tabs"
      className="sticky top-0 z-20 flex items-center justify-between border-b border-gray-200 bg-white px-4 h-12"
    >
      <div className="flex items-center gap-1">
        <span className="mr-3 text-sm font-semibold text-gray-900">
          Tournament Scheduler
        </span>
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          const isDisabled = disabledTabs.has(tab.id);
          return (
            <button
              key={tab.id}
              type="button"
              disabled={isDisabled}
              onClick={() => setActiveTab(tab.id)}
              aria-current={isActive ? 'page' : undefined}
              data-testid={`tab-${tab.id}`}
              className={[
                'rounded px-3 py-1.5 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-blue-100 text-blue-700'
                  : isDisabled
                    ? 'text-gray-300 cursor-not-allowed'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900',
              ].join(' ')}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
      <AppStatusPopover />
    </nav>
  );
}

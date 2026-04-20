import { useAppStore, type AppTab } from '../store/appStore';
import { AppStatusPopover } from '../components/AppStatusPopover';
import { ThemeToggle } from '../components/ThemeToggle';
import { INTERACTIVE_BASE } from '../lib/utils';

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
      className="sticky top-0 z-20 flex items-center justify-between border-b border-border bg-card px-4 h-12"
    >
      <div className="flex items-center gap-1">
        <span className="mr-3 text-sm font-semibold text-card-foreground">
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
              aria-disabled={isDisabled || undefined}
              title={
                isDisabled
                  ? tab.id === 'matches'
                    ? 'Add players first'
                    : tab.id === 'schedule' || tab.id === 'live'
                      ? 'Create matches first'
                      : undefined
                  : undefined
              }
              data-testid={`tab-${tab.id}`}
              className={[
                INTERACTIVE_BASE,
                'rounded px-3 py-1.5 text-sm font-medium',
                isActive
                  ? 'bg-blue-100 text-blue-700 shadow-inner dark:bg-blue-500/15 dark:text-blue-300'
                  : isDisabled
                    ? 'text-muted-foreground/50'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
              ].join(' ')}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
      <div className="flex items-center gap-2">
        <ThemeToggle />
        <AppStatusPopover />
      </div>
    </nav>
  );
}

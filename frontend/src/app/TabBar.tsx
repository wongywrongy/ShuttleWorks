import { useAppStore, type AppTab } from '../store/appStore';
import { AppStatusPopover } from '../components/AppStatusPopover';
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
      className="sticky top-0 z-20 flex h-12 flex-shrink-0 items-center justify-between gap-3 border-b border-border bg-card px-4"
    >
      <div className="flex min-w-0 items-center gap-3">
        <span className="hidden text-sm font-semibold tracking-tight text-card-foreground sm:inline">
          Tournament Scheduler
        </span>
        <div role="tablist" aria-label="Sections" className="flex items-center gap-0.5">
          {TABS.map((tab) => {
            const isActive = activeTab === tab.id;
            const isDisabled = disabledTabs.has(tab.id);
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                disabled={isDisabled}
                onClick={() => setActiveTab(tab.id)}
                aria-current={isActive ? 'page' : undefined}
                aria-selected={isActive}
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
                  'relative rounded-md px-3 py-1.5 text-sm font-medium',
                  isActive
                    ? 'bg-primary/10 text-primary dark:bg-primary/15'
                    : isDisabled
                      ? 'text-muted-foreground/50'
                      : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                ].join(' ')}
              >
                {tab.label}
                {isActive && (
                  <span
                    aria-hidden
                    className="absolute inset-x-2 -bottom-[5px] h-0.5 rounded-full bg-primary"
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>
      {/* Header chrome stays minimal: just the live status. Theme +
          density toggles live in Setup → Appearance. */}
      <div className="flex items-center gap-2">
        <AppStatusPopover />
      </div>
    </nav>
  );
}

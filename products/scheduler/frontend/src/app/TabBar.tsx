import { useAppStore, type AppTab } from '../store/appStore';
import { AppStatusPopover } from '../components/AppStatusPopover';
import { useDisruptions } from '../hooks/useDisruptions';
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

/** Tabs that surface match-level state — the disruption count badge
 *  rides along on these so an operator on Schedule / Live can see at a
 *  glance that there are pending issues without first navigating to
 *  Matches. The badge counts the SAME disruptions on all three tabs;
 *  it's a global feed, not a per-tab one. */
const DISRUPTION_TABS = new Set<AppTab>(['matches', 'schedule', 'live']);

export function TabBar() {
  const activeTab = useAppStore((s) => s.activeTab);
  const setActiveTab = useAppStore((s) => s.setActiveTab);
  const matches = useAppStore((s) => s.matches);
  const players = useAppStore((s) => s.players);
  const disruptions = useDisruptions();

  const disabledTabs = new Set<AppTab>();
  if (players.length === 0) disabledTabs.add('matches');
  if (matches.length === 0) disabledTabs.add('schedule');
  if (matches.length === 0) disabledTabs.add('live');

  return (
    <nav
      aria-label="Tournament scheduler tabs"
      className="sticky top-0 z-chrome flex h-12 flex-shrink-0 items-center justify-between gap-3 border-b border-border bg-card px-4"
    >
      <div className="flex min-w-0 items-center gap-3">
        {/* Boxed wordmark. The 1px frame *is* the mark — no separate
            glyph. Sizes match the design system's TabBar lockup
            (26px tall · 13px Geist SemiBold · 4px radius). */}
        <span
          aria-label="ShuttleWorks"
          title="ShuttleWorks"
          className="hidden h-[26px] items-center rounded-[4px] border border-foreground px-[9px] text-[13px] font-semibold leading-none tracking-[-0.005em] text-foreground sm:inline-flex"
        >
          ShuttleWorks
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
                  // Clean sans sentence-case tab. Visual emphasis comes
                  // from the brand-orange underline + active text color,
                  // not from typographic shouting. Sentence case keeps
                  // the chrome readable without competing with content.
                  'relative rounded-none px-3 py-2 text-sm font-medium tracking-tight',
                  isActive
                    ? 'text-accent font-semibold'
                    : isDisabled
                      ? 'text-muted-foreground/50'
                      : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground',
                ].join(' ')}
              >
                {tab.label}
                {/* Disruption count badge — same number on Matches,
                    Schedule, and Live so the operator can see pending
                    issues without first navigating to Matches. The
                    badge appears only when disruptions exist; severity
                    colours the badge bg. */}
                {DISRUPTION_TABS.has(tab.id) &&
                disruptions.total > 0 &&
                !isDisabled ? (
                  <span
                    key={`${disruptions.total}-${disruptions.severity}`}
                    aria-label={`${disruptions.total} disruption${disruptions.total === 1 ? '' : 's'}`}
                    title={
                      disruptions.errors > 0 && disruptions.warnings > 0
                        ? `${disruptions.errors} error${disruptions.errors === 1 ? '' : 's'}, ${disruptions.warnings} warning${disruptions.warnings === 1 ? '' : 's'}`
                        : disruptions.errors > 0
                          ? `${disruptions.errors} error${disruptions.errors === 1 ? '' : 's'}`
                          : `${disruptions.warnings} warning${disruptions.warnings === 1 ? '' : 's'}`
                    }
                    className={[
                      'motion-enter-icon ml-1.5 inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full px-1 text-[10px] font-semibold tabular-nums',
                      disruptions.severity === 'error'
                        ? 'bg-destructive text-destructive-foreground'
                        : 'bg-status-warning/20 text-status-warning',
                    ].join(' ')}
                  >
                    {disruptions.total}
                  </span>
                ) : null}
                {/* Brand-orange underline. Always rendered so the
                    inactive→active transition grows the width via scaleX
                    on a transform-anchored span (GPU-safe), following
                    the shared --ease-brand curve. Square corners — the
                    underline IS the brutalist accent. */}
                <span
                  aria-hidden
                  className={[
                    'absolute inset-x-2 -bottom-[1px] h-0.5 origin-center bg-accent',
                    'transition-transform duration-300 ease-brand',
                    isActive ? 'scale-x-100' : 'scale-x-0',
                  ].join(' ')}
                />
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

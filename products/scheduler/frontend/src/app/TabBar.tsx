import { ArrowLeft } from '@phosphor-icons/react';
import { Link } from 'react-router-dom';
import { useTournamentStore } from '../store/tournamentStore';
import { useUiStore, type AppTab } from '../store/uiStore';
import { AppStatusPopover } from '../components/AppStatusPopover';
import { ShuttleWorksMark } from '../components/ShuttleWorksMark';
import { useDisruptions } from '../hooks/useDisruptions';
import { INTERACTIVE_BASE } from '../lib/utils';
import { BRACKET_TABS } from '../lib/bracketTabs';

type TabDef = { id: AppTab; label: string; hint?: string };

/** Tabs shown for a ``kind='meet'`` tournament — the intercollegiate
 *  dual / tri-meet workflow. */
const MEET_TABS: TabDef[] = [
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
  const activeTab = useUiStore((s) => s.activeTab);
  const setActiveTab = useUiStore((s) => s.setActiveTab);
  const activeTournamentKind = useUiStore((s) => s.activeTournamentKind);
  const bracketDataReady = useUiStore((s) => s.bracketDataReady);
  const matches = useTournamentStore((s) => s.matches);
  const players = useTournamentStore((s) => s.players);
  const disruptions = useDisruptions();

  // Default to meet tabs while ``activeTournamentKind`` is loading
  // (it's null on first mount before useTournamentKind resolves).
  // Bracket-kind tournaments navigate Draw / Schedule / Live through
  // this same TabBar — same markup, same accent underline.
  const tabs: TabDef[] =
    activeTournamentKind === 'bracket' ? BRACKET_TABS : MEET_TABS;

  const disabledTabs = new Set<AppTab>();
  if (activeTournamentKind === 'bracket') {
    // Draw / Schedule / Live stay disabled until a draw exists — the
    // operator is on the SetupForm wizard until then. ``bracketDataReady``
    // is written by ``BracketTab``; TabBar lives outside
    // ``BracketApiProvider`` and can't call ``useBracket`` itself.
    if (bracketDataReady !== true) {
      disabledTabs.add('bracket-draw');
      disabledTabs.add('bracket-schedule');
      disabledTabs.add('bracket-live');
    }
  } else {
    if (players.length === 0) disabledTabs.add('matches');
    if (matches.length === 0) disabledTabs.add('schedule');
    if (matches.length === 0) disabledTabs.add('live');
  }

  return (
    <nav
      aria-label="Tournament scheduler tabs"
      className="sticky top-0 z-chrome flex h-12 flex-shrink-0 items-center justify-between gap-3 border-b border-border bg-card px-4"
    >
      <div className="flex min-w-0 items-center gap-3">
        {/* Back-to-dashboard control: an arrow icon-button paired with
            a clickable wordmark. Both navigate to ``/``; redundancy is
            deliberate — the arrow is the discoverable affordance,
            the wordmark click matches web convention (logo = home). */}
        <Link
          to="/"
          aria-label="Back to dashboard"
          title="Back to dashboard"
          className={[
            INTERACTIVE_BASE,
            'inline-flex h-7 w-7 items-center justify-center rounded-sm border border-border text-muted-foreground',
            'hover:bg-muted/40 hover:text-foreground',
          ].join(' ')}
        >
          <ArrowLeft size={14} aria-hidden="true" />
        </Link>
        {/* Boxed wordmark — also a Link to the dashboard for parity
            with web-app convention. Hidden on narrow viewports so it
            doesn't compete with the tab strip. */}
        <Link
          to="/"
          aria-label="Back to dashboard"
          title="Back to dashboard"
          className={`${INTERACTIVE_BASE} hidden sm:inline-flex`}
        >
          <ShuttleWorksMark />
        </Link>
        <div
          role="tablist"
          aria-label="Sections"
          className="flex items-center gap-0.5"
        >
          {tabs.map((tab) => {
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
                    ? activeTournamentKind === 'bracket'
                      ? 'Generate a draw first'
                      : tab.id === 'matches'
                        ? 'Add players first'
                        : tab.id === 'schedule' || tab.id === 'live'
                          ? 'Create matches first'
                          : undefined
                    : undefined
                }
                data-testid={`tab-${tab.id}`}
                className={[
                  INTERACTIVE_BASE,
                  'relative rounded-none px-3 py-2 text-sm font-medium tracking-tight',
                  isActive
                    ? 'text-accent font-semibold'
                    : isDisabled
                      ? 'text-muted-foreground/50'
                      : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground',
                ].join(' ')}
              >
                {tab.label}
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
                      'motion-enter-icon ml-1.5 inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full px-1 text-3xs font-semibold tabular-nums',
                      disruptions.severity === 'error'
                        ? 'bg-destructive text-destructive-foreground'
                        : 'bg-status-warning/20 text-status-warning',
                    ].join(' ')}
                  >
                    {disruptions.total}
                  </span>
                ) : null}
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
      <div className="flex items-center gap-2">
        <AppStatusPopover />
      </div>
    </nav>
  );
}

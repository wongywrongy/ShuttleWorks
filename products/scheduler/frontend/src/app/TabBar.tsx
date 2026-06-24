import { useNavigate } from 'react-router-dom';
import { useTournamentStore } from '../store/tournamentStore';
import { useUiStore, type AppTab } from '../store/uiStore';
import { useTournamentId } from '../hooks/useTournamentId';
import { INTERACTIVE_BASE } from '../lib/utils';
import { tabsForModule } from '../lib/bracketTabs';
import { moduleForTab } from '../platform/domain/moduleModel';
import type { ModuleId } from '../platform/product-shell/types';
import { workspaceCopy } from '../platform/domain/workspace';

type TabDef = { id: AppTab; label: string; hint?: string };

/** Tabs that surface match-level state — the disruption count badge
 *  rides along on these so an operator on Schedule / Live can see at a
 *  glance that there are pending issues without first navigating to
 *  Matches. The badge counts the SAME disruptions on all three tabs;
 *  it's a global feed, not a per-tab one. */
const DISRUPTION_TABS = new Set<AppTab>(['matches', 'schedule', 'live']);

/** Tooltip for a disabled tab — names the unmet prerequisite. */
function disabledTabTitle(
  tabId: AppTab,
  module: ModuleId,
): string | undefined {
  if (module === 'bracket') return 'Generate a draw first';
  if (tabId === 'matches') return 'Add players first';
  if (tabId === 'schedule' || tabId === 'live') return 'Create matches first';
  return undefined;
}

export function TabBar() {
  const activeTab = useUiStore((s) => s.activeTab);
  const setActiveTab = useUiStore((s) => s.setActiveTab);
  const activeTournamentKind = useUiStore((s) => s.activeTournamentKind);
  const bracketDataReady = useUiStore((s) => s.bracketDataReady);
  const matches = useTournamentStore((s) => s.matches);
  const players = useTournamentStore((s) => s.players);
  const disruptions = useUiStore((s) => s.disruptionSummary);
  const navigate = useNavigate();
  const tid = useTournamentId();

  // The tab strip follows the ACTIVE MODULE (derived from the active tab),
  // not the workspace kind — so a multi-module workspace switches strips as
  // the dock switches modules, while a single-module workspace always shows
  // its one operator module's tabs (identical to the prior kind-keyed list).
  const activeModule = moduleForTab(activeTab, activeTournamentKind);
  const tabs: TabDef[] = tabsForModule(activeModule);

  const disabledTabs = new Set<AppTab>();
  if (activeModule === 'bracket') {
    // Bracket entry tabs (Setup, Roster, Events) stay enabled at all times —
    // they're how the operator builds the bracket. Draw / Schedule / Live
    // stay disabled until at least one event has been Generated, since
    // those tabs render bracket_matches that don't exist yet. ``bracketDataReady``
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
      aria-label={workspaceCopy.tabsAriaLabel}
      className="sticky top-0 z-chrome flex h-12 flex-shrink-0 items-center justify-between gap-3 border-b border-border bg-card px-4"
    >
      <div className="flex min-w-0 items-center gap-3">
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
                onClick={() => {
                  if (tid) {
                    navigate(`/tournaments/${tid}/${tab.id}`, { replace: true });
                  }
                  setActiveTab(tab.id);
                }}
                aria-current={isActive ? 'page' : undefined}
                aria-selected={isActive}
                aria-disabled={isDisabled || undefined}
                title={
                  isDisabled
                    ? disabledTabTitle(tab.id, activeModule)
                    : undefined
                }
                data-testid={`tab-${tab.id}`}
                className={[
                  INTERACTIVE_BASE,
                  'relative rounded-none px-3 py-2 text-sm font-medium tracking-tight',
                  isDisabled
                    ? 'text-muted-foreground/50'
                    : isActive
                      ? 'text-accent font-semibold'
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
                    isActive && !isDisabled ? 'scale-x-100' : 'scale-x-0',
                  ].join(' ')}
                />
              </button>
            );
          })}
        </div>
      </div>
    </nav>
  );
}

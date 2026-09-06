/**
 * Matches page — two-zone layout. A fixed 44px actions bar owns every
 * page-level control (title + count, search, auto-generate, export, add
 * match); the scrollable content area below holds the match rows grouped
 * by event with collapsible headers. Auto-generate moved from a content
 * banner strip into the actions bar as a secondary popover affordance.
 */
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Download, MagnifyingGlass } from '@phosphor-icons/react';
import { v4 as uuid } from 'uuid';
import { useTournamentStore } from '../../../store/tournamentStore';
import { exportMatchesXlsx } from '../exports/xlsxExports';
import { useSearchParamState } from '../../../hooks/useSearchParamState';
import { usePlayerMap } from '../../../store/selectors';
import { MatchesSpreadsheet } from './MatchesSpreadsheet';
import { RegenerateMenu } from './RegenerateMenu';
import { EmptyState } from '../../../components/control-plane';
import { MeetActionsBar } from '../components/MeetActionsBar';
import { INTERACTIVE_BASE } from '../../../lib/utils';
import { useCanEdit } from '../../../hooks/useCanEdit';
import { useTournamentId } from '../../../hooks/useTournamentId';
import { useMatchStateSync } from '../../../hooks/useMatchStateSync';
import { READ_ONLY_MESSAGE } from '../../../platform/domain/permissions';

export function MatchesTab() {
  const tid = useTournamentId();
  const navigate = useNavigate();
  // The Status column (Pending/Ready/Live/Done) reads matchStateStore, but
  // nothing else mounted on this surface hydrates it — an operator who opens
  // Matches directly (without ever visiting Schedule/Operations/Display)
  // would see a stale/empty store and a lying status. One mount keeps it
  // converged the same way SchedulePage does (initial load + 5s poll).
  useMatchStateSync(tid);
  const matches = useTournamentStore((s) => s.matches);
  const players = useTournamentStore((s) => s.players);
  const groups = useTournamentStore((s) => s.groups);
  const addMatch = useTournamentStore((s) => s.addMatch);

  const [searchQuery, setSearchQuery] = useSearchParamState('q', '');
  const playerById = usePlayerMap();
  // After "+ Add match", we want the new row's event field to take
  // focus so the operator can pick the rank without hunting for it.
  // The button lives here (in the bar) but the rows are rendered by
  // MatchesSpreadsheet, so the focus directive crosses components via
  // this state + callback.
  const [pendingFocusId, setPendingFocusId] = useState<string | null>(null);

  // Same filter logic the spreadsheet uses, computed once here for the
  // bar count readout so "showing M of N" stays in sync.
  const filteredCount = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return matches.length;
    return matches.filter((m) => {
      const playerName = (id: string) =>
        playerById.get(id)?.name?.toLowerCase() ?? '';
      return (
        (m.eventRank?.toLowerCase().includes(q) ?? false) ||
        m.sideA.some((id) => playerName(id).includes(q)) ||
        m.sideB.some((id) => playerName(id).includes(q)) ||
        (m.sideC?.some((id) => playerName(id).includes(q)) ?? false)
      );
    }).length;
  }, [matches, searchQuery, playerById]);

  // A viewer may not build the match list (audit A2-followup). Folded into the
  // existing precondition so every Add-match entry point inherits it.
  const canEditWorkspace = useCanEdit();
  const canAddRow = players.length >= 2 && canEditWorkspace;
  const addEmptyRow = () => {
    const id = uuid();
    addMatch({
      id,
      sideA: [],
      sideB: [],
      matchType: 'dual',
      eventRank: '',
      durationSlots: 1,
    });
    setPendingFocusId(id);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <MeetActionsBar
        title="Matches"
        status={
          <>
            <span className="text-sm font-semibold text-foreground tabular-nums">
              {matches.length} match{matches.length === 1 ? '' : 'es'}
            </span>
            <span className="whitespace-nowrap text-xs text-muted-foreground">
              · from roster
            </span>
            {searchQuery.trim() && filteredCount !== matches.length ? (
              <span className="whitespace-nowrap text-xs text-muted-foreground tabular-nums">
                · showing {filteredCount}
              </span>
            ) : null}
          </>
        }
      >
        <div className="relative">
          <MagnifyingGlass
            aria-hidden="true"
            className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
          />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search event or player…"
            aria-label="Search matches"
            data-testid="matches-search"
            className="h-7 w-56 rounded-sm border border-border bg-card pl-7 pr-2 text-xs outline-none transition-colors duration-fast ease-brand placeholder:text-muted-foreground focus:border-accent focus:ring-1 focus:ring-accent/30"
          />
        </div>
        {/* Manual add is a de-emphasized override — the primary path is
            regenerating from the roster. V3-OC33.1: before any match
            exists, this control is not a valid next step (there is nothing
            yet to override), so it is withheld from the empty inventory
            rather than shown disabled. */}
        {matches.length > 0 && (
          <button
            type="button"
            onClick={addEmptyRow}
            disabled={!canAddRow}
            data-testid="add-match-row"
            title={canAddRow ? 'Add a custom match by hand' : 'Need at least 2 players'}
            className={`${INTERACTIVE_BASE} inline-flex h-7 items-center gap-1 rounded-sm border border-dashed border-border bg-card px-2.5 text-xs text-muted-foreground transition-colors duration-fast ease-brand hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-50`}
          >
            Add match
          </button>
        )}
        <button
          type="button"
          onClick={() => void exportMatchesXlsx(matches, players, groups)}
          disabled={matches.length === 0}
          data-testid="export-matches"
          className={`${INTERACTIVE_BASE} inline-flex h-7 items-center gap-1.5 rounded-sm border border-border bg-card px-2.5 text-xs text-card-foreground transition-colors duration-fast ease-brand hover:bg-muted/40 hover:text-foreground disabled:opacity-50`}
        >
          <Download aria-hidden="true" className="h-3.5 w-3.5" />
          Export XLSX
        </button>
        <RegenerateMenu />
      </MeetActionsBar>

      {/* Flex ROW: the match list + the docked match DetailPanel (both
          rendered by MatchesSpreadsheet — its scroll column and DetailDock
          are fragment children of this container). `relative` anchors the
          dock's narrow-viewport overlay fallback. */}
      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        {matches.length === 0 ? (
          <div className="min-h-0 flex-1 overflow-auto">
            <EmptyState
              title="No matches yet"
              // V3-OC33.1: one valid next step, chosen by roster readiness —
              // not a muted alternative competing with the toolbar's own
              // Generate/Regenerate control. Below 2 players there is
              // nothing to generate from yet, so the step is building the
              // roster; at 2+ the step is the first generation itself,
              // triggered here through the same control the toolbar uses
              // (Operations → Plan is where the result gets laid out, one
              // step past this page's own job).
              body={
                players.length < 2
                  ? 'Matches can be generated once players are on the roster.'
                  : 'Matches come from the position grid on Roster.'
              }
              action={
                players.length < 2 ? (
                  <button
                    type="button"
                    onClick={() =>
                      navigate(`/tournaments/${encodeURIComponent(tid)}/participants/people`)
                    }
                    disabled={!canEditWorkspace}
                    data-testid="empty-add-players"
                    title={!canEditWorkspace ? READ_ONLY_MESSAGE : 'Add players in Roster'}
                    className={`${INTERACTIVE_BASE} inline-flex h-8 items-center gap-1 rounded-sm bg-accent px-3 text-xs font-medium text-accent-ink disabled:cursor-not-allowed disabled:opacity-50`}
                  >
                    Add players
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() =>
                      document
                        .querySelector<HTMLButtonElement>('[data-testid="regenerate-toggle"]')
                        ?.click()
                    }
                    disabled={!canEditWorkspace}
                    data-testid="empty-generate-matches"
                    title={!canEditWorkspace ? READ_ONLY_MESSAGE : 'Generate matches from the roster'}
                    className={`${INTERACTIVE_BASE} inline-flex h-8 items-center gap-1 rounded-sm bg-accent px-3 text-xs font-medium text-accent-ink disabled:cursor-not-allowed disabled:opacity-50`}
                  >
                    Generate matches
                  </button>
                )
              }
            />
          </div>
        ) : (
          <MatchesSpreadsheet
            pendingFocusId={pendingFocusId}
            onFocusConsumed={() => setPendingFocusId(null)}
          />
        )}
      </div>
    </div>
  );
}

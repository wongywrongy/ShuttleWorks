/**
 * Matches page — one flat operator surface, dividers only. Header
 * mirrors RosterTab's `PositionGridHeader` treatment: single
 * baseline `px-4 py-3 bg-card border-b`, eyebrow + bold count + filter
 * context on the left, search/add/export on the right. No big `<h1>`
 * — the AppShell tab bar already labels the page.
 *
 * Below: the Auto-generate row, the column-label row, and the match
 * rows all sit at the page edge separated only by hairlines.
 */
import { useMemo, useState } from 'react';
import { Download, MagnifyingGlass } from '@phosphor-icons/react';
import { v4 as uuid } from 'uuid';
import { useTournamentStore } from '../../store/tournamentStore';
import { exportMatchesXlsx } from '../exports/xlsxExports';
import { useSearchParamState } from '../../hooks/useSearchParamState';
import { usePlayerMap } from '../../store/selectors';
import { AutoGeneratePanel } from './AutoGeneratePanel';
import { MatchesSpreadsheet } from './MatchesSpreadsheet';
import { INTERACTIVE_BASE } from '../../lib/utils';

export function MatchesTab() {
  const matches = useTournamentStore((s) => s.matches);
  const players = useTournamentStore((s) => s.players);
  const groups = useTournamentStore((s) => s.groups);
  const addMatch = useTournamentStore((s) => s.addMatch);

  const [searchQuery, setSearchQuery] = useSearchParamState('q', '');
  const playerById = usePlayerMap();
  // After "+ Add match", we want the new row's event field to take
  // focus so the operator can pick the rank without hunting for it.
  // The button lives here (in the header) but the rows are rendered
  // by MatchesSpreadsheet, so the focus directive crosses components
  // via this state + callback.
  const [pendingFocusId, setPendingFocusId] = useState<string | null>(null);

  // Same filter logic the spreadsheet uses, computed once here for
  // the header count readout so "showing M of N" stays in sync.
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

  const canAddRow = players.length >= 2;
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
    <div className="flex flex-col">
      {/* Operator header — single baseline; mirrors RosterTab's
          PositionGridHeader rhythm. */}
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border bg-card px-4 py-3">
        <div className="flex min-w-0 items-baseline gap-3">
          <span className="text-2xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Matches
          </span>
          <span className="text-sm font-semibold text-foreground tabular-nums">
            {matches.length} match{matches.length === 1 ? '' : 'es'}
          </span>
          {searchQuery.trim() && filteredCount !== matches.length ? (
            <span className="text-xs text-muted-foreground tabular-nums whitespace-nowrap">
              · showing {filteredCount}
            </span>
          ) : null}
        </div>
        <div className="flex flex-shrink-0 items-center gap-2">
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
          <button
            type="button"
            onClick={addEmptyRow}
            disabled={!canAddRow}
            data-testid="add-match-row"
            title={canAddRow ? 'Add match row' : 'Need at least 2 players'}
            className={`${INTERACTIVE_BASE} inline-flex h-7 items-center gap-1 rounded-sm border border-dashed border-border bg-card px-2.5 text-xs text-foreground transition-colors duration-fast ease-brand hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-50`}
          >
            ＋ Add match
          </button>
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
        </div>
      </header>

      <AutoGeneratePanel />
      <MatchesSpreadsheet
        pendingFocusId={pendingFocusId}
        onFocusConsumed={() => setPendingFocusId(null)}
      />
    </div>
  );
}

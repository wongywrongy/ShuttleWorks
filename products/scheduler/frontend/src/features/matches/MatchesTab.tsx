/**
 * Matches page — one flat surface, dividers only. Page header at the
 * top owns the eyebrow/title + search + Add match + Export. Below it
 * the Auto-generate row and the matches table sit edge-to-edge with
 * only `border-b` hairlines separating them. No cards, no padded
 * containers, no max-width.
 */
import { Download, MagnifyingGlass } from '@phosphor-icons/react';
import { v4 as uuid } from 'uuid';
import { useAppStore } from '../../store/appStore';
import { exportMatchesXlsx } from '../exports/xlsxExports';
import { useSearchParamState } from '../../hooks/useSearchParamState';
import { AutoGeneratePanel } from './AutoGeneratePanel';
import { MatchesSpreadsheet } from './MatchesSpreadsheet';
import { INTERACTIVE_BASE } from '../../lib/utils';

export function MatchesTab() {
  const matches = useAppStore((s) => s.matches);
  const players = useAppStore((s) => s.players);
  const groups = useAppStore((s) => s.groups);
  const addMatch = useAppStore((s) => s.addMatch);

  const [searchQuery, setSearchQuery] = useSearchParamState('q', '');

  const canAddRow = players.length >= 2;
  const addEmptyRow = () => {
    addMatch({
      id: uuid(),
      sideA: [],
      sideB: [],
      matchType: 'dual',
      eventRank: '',
      durationSlots: 1,
    });
  };

  return (
    <div className="flex flex-col">
      {/* Page header — 16/20/12 padding, border-b only. Search + Add
          match + Export sit on the right of the same row. */}
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-border px-5 pb-3 pt-4">
        <div className="min-w-0">
          <div className="text-2xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            Matches
          </div>
          <h1 className="mt-0.5 text-xl font-semibold leading-tight tracking-tight text-foreground">
            Match construction
          </h1>
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
              className="h-8 w-56 rounded-sm border border-border bg-card pl-7 pr-2 text-sm outline-none transition-colors duration-fast ease-brand placeholder:text-muted-foreground focus:border-accent focus:ring-1 focus:ring-accent/30"
            />
          </div>
          <button
            type="button"
            onClick={addEmptyRow}
            disabled={!canAddRow}
            data-testid="add-match-row"
            title={canAddRow ? 'Add match row' : 'Need at least 2 players'}
            className={`${INTERACTIVE_BASE} inline-flex h-8 items-center gap-1 rounded-sm border border-dashed border-border bg-card px-3 text-xs text-foreground transition-colors duration-fast ease-brand hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-50`}
          >
            ＋ Add match
          </button>
          <button
            type="button"
            onClick={() => void exportMatchesXlsx(matches, players, groups)}
            disabled={matches.length === 0}
            data-testid="export-matches"
            className={`${INTERACTIVE_BASE} inline-flex h-8 items-center gap-1.5 rounded-sm border border-border bg-card px-3 text-xs text-card-foreground transition-colors duration-fast ease-brand hover:bg-muted/40 hover:text-foreground disabled:opacity-50`}
          >
            <Download aria-hidden="true" className="h-3.5 w-3.5" />
            Export XLSX
          </button>
        </div>
      </header>

      <AutoGeneratePanel />
      <MatchesSpreadsheet />
    </div>
  );
}

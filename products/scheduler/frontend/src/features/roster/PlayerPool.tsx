/**
 * Left-hand player pool for the PositionGrid.
 *
 * Two jobs:
 *   1. Bulk-import players — paste a list of names (one per line, optionally
 *      separated by commas) and add them all to the active school.
 *   2. Serve as the drag source — each player becomes a draggable chip that
 *      can be dropped on a cell in the PositionGrid.
 *
 * Players already assigned to every event (no empty rank slots left for them)
 * are faded out so the operator can tell at a glance who's still waiting.
 */
import { useMemo, useState } from 'react';
import { v4 as uuid } from 'uuid';
import { useAppStore } from '../../store/appStore';
import { DraggablePlayerChip } from './PositionGrid';
import { InlineSearch } from '../../components/InlineSearch';

function parseNames(input: string): string[] {
  return input
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function PlayerPool({ schoolId }: { schoolId: string }) {
  const players = useAppStore((s) => s.players);
  const groups = useAppStore((s) => s.groups);
  const addPlayer = useAppStore((s) => s.addPlayer);
  const deletePlayer = useAppStore((s) => s.deletePlayer);

  const [draft, setDraft] = useState('');
  const [expanded, setExpanded] = useState(false);
  // Local-only search (not URL-backed — the pool is per-school side-bar
  // chrome, not a primary surface). Resets when the school changes.
  const [query, setQuery] = useState('');

  const allInSchool = useMemo(
    () =>
      players
        .filter((p) => p.groupId === schoolId)
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name)),
    [players, schoolId],
  );

  const pool = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allInSchool;
    return allInSchool.filter((p) => p.name.toLowerCase().includes(q));
  }, [allInSchool, query]);

  const school = groups.find((g) => g.id === schoolId);

  const commitImport = () => {
    const names = parseNames(draft);
    if (names.length === 0) return;
    for (const name of names) {
      addPlayer({
        id: uuid(),
        name,
        groupId: schoolId,
        ranks: [],
        availability: [],
      });
    }
    setDraft('');
    setExpanded(false);
  };

  return (
    <div
      className="flex min-h-0 flex-col bg-card"
      data-testid="player-pool"
    >
      <div className="border-b border-border/60 bg-muted/40 px-3 py-2">
        <div className="flex items-baseline justify-between">
          <span className="text-2xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Players
          </span>
          <span className="text-[11px] text-muted-foreground tabular-nums">
            {pool.length} in {school?.name ?? '—'}
          </span>
        </div>
      </div>

      <div className="border-b border-border/60 px-3 py-2">
        {expanded ? (
          <div className="space-y-2">
            <textarea
              autoFocus
              rows={5}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={'Paste names — one per line or comma-separated.\nToan Le\nKyle Wong\nSean Hsieh'}
              data-testid="bulk-import-textarea"
              className="w-full resize-y rounded border border-border px-2 py-1.5 text-sm outline-none focus:border-blue-400"
            />
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-muted-foreground">
                {parseNames(draft).length} name{parseNames(draft).length === 1 ? '' : 's'} detected
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setDraft('');
                    setExpanded(false);
                  }}
                  className="rounded border border-border bg-card px-2 py-0.5 text-foreground hover:bg-muted/40"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={commitImport}
                  disabled={parseNames(draft).length === 0}
                  data-testid="bulk-import-commit"
                  className="rounded bg-blue-600 px-2 py-0.5 font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Add {parseNames(draft).length || ''}
                </button>
              </div>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            data-testid="bulk-import-toggle"
            className="flex w-full items-center justify-center rounded-sm border border-dashed border-border px-2 py-1 text-xs text-muted-foreground transition-colors hover:border-accent hover:bg-accent-bg hover:text-accent"
          >
            ＋ Bulk-import players
          </button>
        )}
      </div>

      {allInSchool.length > 0 && (
        <div className="border-b border-border/60 px-3 py-2">
          <InlineSearch
            query={query}
            onQueryChange={setQuery}
            placeholder={`Filter ${allInSchool.length} player${allInSchool.length === 1 ? '' : 's'}…`}
          />
        </div>
      )}

      <div className="max-h-[32rem] overflow-y-auto p-2">
        {allInSchool.length === 0 ? (
          <div className="py-6 text-center text-xs text-muted-foreground">
            No players yet.
          </div>
        ) : pool.length === 0 ? (
          <div className="py-6 text-center text-xs text-muted-foreground">
            No players match <span className="font-mono text-foreground">{query}</span>.
          </div>
        ) : (
          <ul className="space-y-1">
            {pool.map((p) => (
              <li key={p.id} className="group relative flex items-center gap-1">
                <span className="flex-1">
                  <DraggablePlayerChip player={p} schoolId={schoolId} />
                </span>
                <button
                  type="button"
                  onClick={() => deletePlayer(p.id)}
                  title={`Remove ${p.name}`}
                  aria-label={`Remove ${p.name}`}
                  className="rounded p-1 text-muted-foreground/60 opacity-0 transition-[opacity,background-color,color] duration-150 ease-brand hover:bg-red-50 hover:text-red-600 group-hover:opacity-100"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

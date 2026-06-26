/**
 * Bracket Matches — the bracket's output surface, the parallel of the
 * meet's Matches tab. Where the meet derives matches from the roster
 * grid, the bracket derives them from the draws: every PlayUnit across
 * every event. This is a read-only projection (edit the draw in Draw /
 * Events to change matches) grouped by event with collapsible headers,
 * mirroring the meet's grouped match list. The list feeds Operations
 * (Courts / Live) just like the meet's matches do.
 */
import { useMemo, useState } from 'react';
import { CaretRight, Download, MagnifyingGlass } from '@phosphor-icons/react';
import type { BracketTournamentDTO } from '../../api/bracketDto';
import { useBracketApi } from '../../api/bracketClient';
import { ActionsBar } from '../../components/control-plane';
import { EmptyState } from '../../components/control-plane';
import { INTERACTIVE_BASE } from '../../lib/utils';

type Status = 'done' | 'live' | 'ready' | 'pending';

const STATUS_LABEL: Record<Status, string> = {
  done: 'Done',
  live: 'Live',
  ready: 'Ready',
  pending: 'Pending',
};

const STATUS_CLASS: Record<Status, string> = {
  done: 'text-status-done',
  live: 'text-status-live',
  ready: 'text-status-warning',
  pending: 'text-muted-foreground/70',
};

export function BracketMatchesTab({ data }: { data: BracketTournamentDTO }) {
  const api = useBracketApi();
  const [query, setQuery] = useState('');
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const toggle = (key: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const participantById = useMemo(
    () => new Map(data.participants.map((p) => [p.id, p])),
    [data.participants],
  );
  const assignmentByPu = useMemo(
    () => new Map(data.assignments.map((a) => [a.play_unit_id, a])),
    [data.assignments],
  );
  const resultSet = useMemo(
    () => new Set(data.results.map((r) => r.play_unit_id)),
    [data.results],
  );

  const resolveSide = (ids: string[] | null): string => {
    if (!ids || ids.length === 0) return 'TBD';
    return ids.map((id) => participantById.get(id)?.name ?? id).join(' / ');
  };

  const statusOf = (puId: string): Status => {
    if (resultSet.has(puId)) return 'done';
    const a = assignmentByPu.get(puId);
    if (a?.started && !a.finished) return 'live';
    if (a) return 'ready';
    return 'pending';
  };

  const q = query.toLowerCase().trim();
  // Group every play unit by its event, ordered by the events list, then
  // by round / match index within the event.
  const groups = useMemo(() => {
    const byEvent = new Map<string, BracketTournamentDTO['play_units']>();
    for (const pu of data.play_units) {
      const arr = byEvent.get(pu.event_id) ?? [];
      arr.push(pu);
      byEvent.set(pu.event_id, arr);
    }
    return data.events
      .map((ev) => {
        const units = (byEvent.get(ev.id) ?? [])
          .slice()
          .sort(
            (a, b) =>
              a.round_index - b.round_index || a.match_index - b.match_index,
          )
          .filter((pu) => {
            if (!q) return true;
            const hay = [
              pu.id,
              ev.id,
              ev.discipline,
              resolveSide(pu.side_a),
              resolveSide(pu.side_b),
            ]
              .join(' ')
              .toLowerCase();
            return hay.includes(q);
          });
        return { ev, units };
      })
      .filter((g) => g.units.length > 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.play_units, data.events, q, participantById]);

  const total = data.play_units.length;
  const shown = groups.reduce((n, g) => n + g.units.length, 0);

  return (
    <div className="flex h-full min-h-0 flex-col bg-card">
      <ActionsBar
        title="Matches"
        status={
          <>
            <span className="text-sm font-semibold text-foreground tabular-nums">
              {total} match{total === 1 ? '' : 'es'}
            </span>
            <span className="whitespace-nowrap text-xs text-muted-foreground">
              · from draws
            </span>
            {q && shown !== total ? (
              <span className="whitespace-nowrap text-xs text-muted-foreground tabular-nums">
                · showing {shown}
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
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search event or player…"
            aria-label="Search matches"
            data-testid="bracket-matches-search"
            className="h-7 w-56 rounded-sm border border-border bg-card pl-7 pr-2 text-xs outline-none transition-colors duration-fast ease-brand placeholder:text-muted-foreground focus:border-accent focus:ring-1 focus:ring-accent/30"
          />
        </div>
        <a
          href={api.exportCsvUrl()}
          data-testid="bracket-export-matches"
          className={`${INTERACTIVE_BASE} inline-flex h-7 items-center gap-1.5 rounded-sm border border-border bg-card px-2.5 text-xs text-card-foreground transition-colors duration-fast ease-brand hover:bg-muted/40 hover:text-foreground`}
        >
          <Download aria-hidden="true" className="h-3.5 w-3.5" />
          Export CSV
        </a>
      </ActionsBar>

      <div className="min-h-0 flex-1 overflow-auto">
        {total === 0 ? (
          <EmptyState
            title="No matches yet"
            body="Matches come from the draws. Add events and generate draws in the Events and Draw tabs; they’ll appear here and feed Operations."
          />
        ) : (
          <>
            <div className="flex items-center gap-3 border-b border-border bg-muted/40 px-4 py-1.5 text-2xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              <span className="w-20">Match</span>
              <span className="min-w-0 flex-1">Side A</span>
              <span className="min-w-0 flex-1">Side B</span>
              <span className="w-16 text-right">Status</span>
            </div>
            {groups.map(({ ev, units }) => {
              const isCollapsed = collapsed.has(ev.id);
              return (
                <div key={ev.id}>
                  <button
                    type="button"
                    onClick={() => toggle(ev.id)}
                    aria-expanded={!isCollapsed}
                    data-testid={`bracket-match-group-${ev.id}`}
                    className="flex w-full items-center gap-2 border-b border-border bg-muted/40 px-4 py-1.5 text-left transition-colors duration-fast ease-brand hover:bg-muted/60"
                  >
                    <CaretRight
                      aria-hidden
                      weight="bold"
                      className={[
                        'h-3 w-3 shrink-0 text-muted-foreground transition-transform duration-fast ease-brand',
                        isCollapsed ? '' : 'rotate-90',
                      ].join(' ')}
                    />
                    <span className="font-mono text-2xs font-semibold uppercase tracking-[0.12em] text-foreground">
                      {ev.id}
                    </span>
                    <span className="text-2xs uppercase tracking-[0.18em] text-muted-foreground">
                      {ev.discipline}
                    </span>
                    <span className="text-2xs tabular-nums text-muted-foreground">
                      {units.length}
                    </span>
                  </button>
                  {!isCollapsed
                    ? units.map((pu) => {
                        const status = statusOf(pu.id);
                        return (
                          <div
                            key={pu.id}
                            data-testid={`bracket-match-row-${pu.id}`}
                            className="flex min-h-[40px] items-center gap-3 border-b border-border px-4 text-sm transition-colors duration-fast ease-brand hover:bg-muted/30"
                          >
                            <span className="w-20 font-mono text-xs text-muted-foreground">
                              R{pu.round_index}·M{pu.match_index}
                            </span>
                            <span className="min-w-0 flex-1 truncate text-foreground">
                              {resolveSide(pu.side_a)}
                            </span>
                            <span className="min-w-0 flex-1 truncate text-foreground">
                              {resolveSide(pu.side_b)}
                            </span>
                            <span
                              className={`w-16 text-right text-2xs font-semibold uppercase tracking-[0.12em] ${STATUS_CLASS[status]}`}
                            >
                              {STATUS_LABEL[status]}
                            </span>
                          </div>
                        );
                      })
                    : null}
                </div>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}

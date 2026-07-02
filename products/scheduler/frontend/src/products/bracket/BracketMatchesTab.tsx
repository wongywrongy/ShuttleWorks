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
import { Download, MagnifyingGlass } from '@phosphor-icons/react';
import type { BracketTournamentDTO } from '../../api/bracketDto';
import { useBracketApi } from '../../api/bracketClient';
import {
  ActionsBar,
  BANDED_ROW_CLASSES,
  ColumnHeaderRow,
  EmptyState,
  GroupBandHeader,
  type BandedListColumn,
} from '../../components/control-plane';
import { INTERACTIVE_BASE } from '../../lib/utils';
import { disciplineOrderIndex } from '../../lib/eventColors';
import { buildPlayUnitLabels, disciplineLabel } from './bracketLabels';

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

/** Column set for the bracket match list — same `px-5` rhythm and the
 *  same leading anatomy as Meet Matches: a `w-4` gutter spacer (Meet's
 *  warning-icon slot — kept here so the `#` column starts at the same x
 *  on both surfaces), then `#`, the accent code, and two flex-[3] sides. */
// Same column set as Meet Matches ('Event' code column; the trailing
// column is w-[5.5rem] = Meet's Slots w-14 + delete w-8, so Side B's
// right edge lines up across the two surfaces).
const MATCH_COLUMNS: BandedListColumn[] = [
  { label: '', className: 'w-4' },
  { label: '#', className: 'w-8' },
  { label: 'Event', className: 'w-20' },
  { label: 'Side A', className: 'min-w-0 flex-[3]' },
  { label: 'Side B', className: 'min-w-0 flex-[3]' },
  { label: 'Status', className: 'w-[5.5rem] text-right' },
];

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
  // Operator-friendly play-unit labels ("MS QF1") — the same names the
  // Draw / Live / Operations surfaces show, instead of the raw
  // R{round}·M{match} indices.
  const labelById = useMemo(() => buildPlayUnitLabels(data), [data]);

  const resolveSide = (ids: string[] | null): string => {
    if (!ids || ids.length === 0) return 'TBD';
    return ids.map((id) => participantById.get(id)?.name ?? id).join(' / ');
  };

  // Render form of a side: unresolved slots get the same muted-italic
  // placeholder treatment as Meet's empty side ("＋ add player") so the
  // two match lists read identically — TBD is a placeholder, not a name.
  const renderSide = (ids: string[] | null) =>
    !ids || ids.length === 0 ? (
      <span className="text-xs italic text-muted-foreground">TBD</span>
    ) : (
      resolveSide(ids)
    );

  const statusOf = (puId: string): Status => {
    if (resultSet.has(puId)) return 'done';
    const a = assignmentByPu.get(puId);
    if (a?.started && !a.finished) return 'live';
    if (a) return 'ready';
    return 'pending';
  };

  const q = query.toLowerCase().trim();
  // Group every play unit by its event, ordered by the events list, then
  // by round / match index within the event. Each unit is numbered
  // BEFORE the search filter runs so a row's `#` is a stable per-event
  // identifier (mirrors Meet, where filtering never renumbers rows).
  const groups = useMemo(() => {
    const byEvent = new Map<string, BracketTournamentDTO['play_units']>();
    for (const pu of data.play_units) {
      const arr = byEvent.get(pu.event_id) ?? [];
      arr.push(pu);
      byEvent.set(pu.event_id, arr);
    }
    return data.events
      .slice()
      // Same discipline banding order as Meet Matches (doubles-first
      // dual-meet convention); ties keep the events-list order.
      .sort(
        (a, b) =>
          disciplineOrderIndex(a.discipline) - disciplineOrderIndex(b.discipline),
      )
      .map((ev) => {
        const units = (byEvent.get(ev.id) ?? [])
          .slice()
          .sort(
            (a, b) =>
              a.round_index - b.round_index || a.match_index - b.match_index,
          )
          .map((pu, idx) => ({ pu, n: idx + 1 }))
          .filter(({ pu }) => {
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
    <div className="flex h-full min-h-0 flex-col">
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
            <ColumnHeaderRow columns={MATCH_COLUMNS} />
            {shown === 0 ? (
              <div className="px-5 py-10 text-center text-sm text-muted-foreground">
                No matches match the current search.
              </div>
            ) : null}
            {groups.map(({ ev, units }) => {
              const isCollapsed = collapsed.has(ev.id);
              return (
                <div key={ev.id}>
                  <GroupBandHeader
                    code={ev.id}
                    label={disciplineLabel(ev.discipline)}
                    count={units.length}
                    collapsed={isCollapsed}
                    onToggle={() => toggle(ev.id)}
                    data-testid={`bracket-match-group-${ev.id}`}
                  />
                  {!isCollapsed
                    ? units.map(({ pu, n }) => {
                        const status = statusOf(pu.id);
                        return (
                          <div
                            key={pu.id}
                            data-testid={`bracket-match-row-${pu.id}`}
                            className={BANDED_ROW_CLASSES}
                          >
                            {/* Gutter spacer — Meet's warning-icon slot;
                                empty here but kept so the columns start
                                at the same x on both surfaces. */}
                            <span className="w-4 shrink-0" aria-hidden />
                            <span className="w-8 text-xs text-muted-foreground tabular-nums">
                              {n}
                            </span>
                            {/* Friendly label; raw id kept on title for
                                traceability (it's also the row testid).
                                px-1.5 mirrors the inner inset of Meet's
                                editable event field. */}
                            <span
                              className="w-20 truncate px-1.5 text-sm font-semibold text-accent sw-num"
                              title={pu.id}
                            >
                              {labelById.get(pu.id) ?? pu.id}
                            </span>
                            <span className="min-w-0 flex-[3] text-sm leading-relaxed text-foreground">
                              {renderSide(pu.side_a)}
                            </span>
                            <span className="min-w-0 flex-[3] text-sm leading-relaxed text-foreground">
                              {renderSide(pu.side_b)}
                            </span>
                            <span
                              className={`w-[5.5rem] text-right text-2xs font-semibold uppercase tracking-[0.08em] ${STATUS_CLASS[status]}`}
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

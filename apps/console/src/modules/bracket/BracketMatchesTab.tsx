/**
 * Bracket Matches — the bracket's output surface, the parallel of the
 * meet's Matches tab. Where the meet derives matches from the roster
 * grid, the bracket derives them from the draws: every PlayUnit across
 * every event. The list is a read-only projection (edit the draw in
 * Draw / Events to change matches) grouped by event on the shared
 * BandedTable shell, mirroring the meet's grouped match list; clicking
 * a row (anywhere — the rows hold no editors) opens the right-docked
 * match DetailPanel with the sides' player cards and the read-only
 * status pill. The list feeds Operations (Courts / Live) just like the
 * meet's matches do.
 */
import { useCallback, useMemo, useState } from 'react';
import { Download, MagnifyingGlass } from '@phosphor-icons/react';
import type { BracketTournamentDTO, PlayUnitDTO } from '../../api/bracketDto';
import { useBracketApi } from '../../api/bracketClient';
import { useSearchParamState } from '../../hooks/useSearchParamState';
import { useCanEdit } from '../../hooks/useCanEdit';
import {
  ActionsBar,
  BandedTable,
  DetailDock,
  EmptyState,
  MatchStatusFilter,
  BRACKET_MATCH_CELL,
  BRACKET_MATCH_LIST_COLUMNS,
  BRACKET_MATCH_LIST_DOCK_MIN_CONTENT_WIDTH,
  MatchStatus,
  OverflowMenu,
  parseMatchStatusFilter,
  ScoreLane,
  STATUS_LABEL,
  type BandedTableGroup,
  type BracketMatchStatus,
} from '../../components/control-plane';
import { formatSideName } from '../../lib/names';
import { INTERACTIVE_BASE } from '../../lib/utils';
import { disciplineOrderIndex } from '../../lib/eventColors';
import { buildPlayUnitLabels, disciplineLabel, sideLabel } from './bracketLabels';
import {
  BracketMatchDetailPanel,
  type ContingencyReason,
} from './BracketMatchDetailPanel';
import { type CommitEventFn } from './BracketPlayerFields';
import {
  exportBracketMatchesXlsx,
  type BracketMatchExportRow,
} from './exports/xlsxExports';

const CONTINGENCY_MENU_LABEL: Record<ContingencyReason, string> = {
  walkover: 'Walkover…',
  retired: 'Retired (injury)…',
  forfeit: 'Forfeit…',
};

/** One numbered row: the play unit plus its stable per-event `#`. */
type NumberedUnit = {
  pu: BracketTournamentDTO['play_units'][number];
  n: number;
};

export function BracketMatchesTab({
  data,
  onData,
}: {
  data: BracketTournamentDTO;
  /** Receives the fresh snapshot after a panel-side event upsert (the
   *  host's `setData` from useBracket). Optional — without it edits
   *  still commit; the poll picks the snapshot up. */
  onData?: (next: BracketTournamentDTO) => void;
}) {
  const api = useBracketApi();
  const canEdit = useCanEdit();
  // Same URL-backed `?q=` contract as Meet Matches — the URL is the shared
  // source of truth, so a pasted link restores the operator's filter.
  const [query, setQuery] = useSearchParamState('q', '');
  // Status facet (?status=) — the same strip Meet Matches renders.
  const [statusParam, setStatusParam] = useSearchParamState('status', '');
  const statusFilter = parseMatchStatusFilter(statusParam);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Row-menu deep-link into the detail panel's Contingency section (a
  // winner must still be chosen there — this only pre-selects the kind).
  const [contingency, setContingency] = useState<ContingencyReason | null>(null);

  // Panel-side event entry writes ride the same upsert path as the
  // roster panel (config echoed by BracketPlayerFields).
  const commitEvent = useCallback<CommitEventFn>(
    async (eventId, body) => {
      const next = await api.eventUpsert(eventId, body);
      onData?.(next);
    },
    [api, onData],
  );

  const participantById = useMemo(
    () => new Map(data.participants.map((p) => [p.id, p])),
    [data.participants],
  );
  const assignmentByPu = useMemo(
    () => new Map(data.assignments.map((a) => [a.play_unit_id, a])),
    [data.assignments],
  );
  // Full result per play unit — the row's score lane and winner dot read
  // it; `has()` still answers the status question `resultSet` used to.
  const resultByPu = useMemo(
    () => new Map(data.results.map((r) => [r.play_unit_id, r])),
    [data.results],
  );
  // Operator-friendly play-unit labels ("MS QF1") — the same names the
  // Draw / Live / Operations surfaces show, instead of the raw
  // R{round}·M{match} indices.
  const labelById = useMemo(() => buildPlayUnitLabels(data), [data]);

  // Row form of the label INSIDE its event group (G6): the group band
  // already says "MS", so "MS QF1" rows repeat it — row identity is "QF1".
  // Exports and titles keep the full label.
  const shortLabelById = useMemo(() => {
    // `buildPlayUnitLabels` prefixes with the raw discipline CODE — strip
    // exactly that, not the long `disciplineLabel` form.
    const prefixByEvent = new Map(
      data.events.map((ev) => [ev.id, `${ev.discipline} `]),
    );
    const out = new Map<string, string>();
    for (const pu of data.play_units) {
      const full = labelById.get(pu.id) ?? pu.id;
      const prefix = prefixByEvent.get(pu.event_id);
      out.set(
        pu.id,
        prefix && full.startsWith(prefix) ? full.slice(prefix.length) : full,
      );
    }
    return out;
  }, [data.events, data.play_units, labelById]);

  const resolveSide = (ids: string[] | null): string => {
    if (!ids || ids.length === 0) return 'TBD';
    return ids.map((id) => participantById.get(id)?.name ?? id).join(' / ');
  };

  // Render form of a side. Real names take the BWF presentation
  // ("NAKAMURA Kei / TRAN Vincent"); exports keep the raw `resolveSide`
  // projection.
  //
  // An unresolved slot says WHAT it is waiting for — "Winner of QF1" —
  // rather than a bare italic "TBD" (BMAT-4). The provenance was already
  // computed and already shown in the ops queue and the detail pane; this
  // list was the one place that dropped it and printed a placeholder.
  //
  // ONLY when a feeder exists. `sideLabel` reads a feeder-less empty slot
  // as "Bye", which is right for a real bye and a lie for a round the draw
  // has not built yet — and this list cannot tell those apart. No feeder,
  // no claim: it stays "TBD".
  const renderSide = (ids: string[] | null, slot: PlayUnitDTO['slot_a']) => {
    if (ids && ids.length > 0) return formatSideName(resolveSide(ids));
    if (!slot?.feeder_play_unit_id) {
      return <span className="text-xs italic text-muted-foreground">TBD</span>;
    }
    const nameById = Object.fromEntries(
      [...participantById.entries()].map(([id, p]) => [id, p.name]),
    );
    return (
      <span className="text-xs italic text-muted-foreground">
        {sideLabel(ids, slot, nameById, shortLabelById)}
      </span>
    );
  };

  const statusOf = (puId: string): BracketMatchStatus => {
    if (resultByPu.has(puId)) return 'done';
    const a = assignmentByPu.get(puId);
    if (a?.started && !a.finished) return 'live';
    if (a) return 'ready';
    return 'pending';
  };

  // Counts over the FULL play-unit list for the filter strip (a chip states
  // what selecting it will show, so the search must not shrink it).
  const statusCounts = useMemo(() => {
    const counts: Record<BracketMatchStatus, number> = {
      done: 0,
      live: 0,
      ready: 0,
      pending: 0,
    };
    for (const pu of data.play_units) counts[statusOf(pu.id)] += 1;
    return counts;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.play_units, assignmentByPu, resultByPu]);

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
            if (statusFilter !== 'all' && statusOf(pu.id) !== statusFilter)
              return false;
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
  }, [data.play_units, data.events, q, statusFilter, assignmentByPu, resultByPu, participantById]);

  const total = data.play_units.length;
  const shown = groups.reduce((n, g) => n + g.units.length, 0);

  // Spreadsheet projection of exactly what the list shows — same friendly
  // labels, same resolved names, same status word. Every other surface in the
  // product exports XLSX; this one shipped a raw CSV link (defect D14).
  const exportRows: BracketMatchExportRow[] = groups.flatMap(({ ev, units }) =>
    units.map(({ pu, n }) => ({
      event: ev.id,
      discipline: disciplineLabel(ev.discipline),
      n,
      match: labelById.get(pu.id) ?? pu.id,
      sideA: resolveSide(pu.side_a),
      sideB: resolveSide(pu.side_b),
      status: STATUS_LABEL[statusOf(pu.id)],
    })),
  );

  // Grouped-table view of the same data for the shared BandedTable shell.
  const tableGroups: BandedTableGroup<NumberedUnit>[] = groups.map(
    ({ ev, units }) => ({
      key: ev.id,
      code: ev.id,
      label: disciplineLabel(ev.discipline),
      items: units,
      testId: `bracket-match-group-${ev.id}`,
    }),
  );

  const selected = selectedId
    ? data.play_units.find((pu) => pu.id === selectedId) ?? null
    : null;

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
        <button
          type="button"
          onClick={() => void exportBracketMatchesXlsx(exportRows)}
          disabled={exportRows.length === 0}
          title="Export the listed matches to a spreadsheet"
          data-testid="bracket-export-matches"
          className={`${INTERACTIVE_BASE} inline-flex h-7 items-center gap-1.5 rounded-sm border border-border bg-card px-2.5 text-xs text-card-foreground transition-colors duration-fast ease-brand hover:bg-muted/40 hover:text-foreground disabled:opacity-50`}
        >
          <Download aria-hidden="true" className="h-3.5 w-3.5" />
          Export XLSX
        </button>
      </ActionsBar>

      {/* Flex ROW: match list + docked detail pane (see BracketRosterTab). */}
      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col @container/table">
          {total === 0 ? (
            <EmptyState
              title="No matches yet"
              // "the Events and Draw tabs" named a nav that stopped existing
              // when Events folded into Draws (2026-06-26). Bracket has
              // Roster / Draws / Matches / Configuration.
              body="Matches come from the draws. Create and generate a draw in Bracket → Draws; its matches appear here and feed Operations."
            />
          ) : (
            <>
              <MatchStatusFilter
                counts={statusCounts}
                active={statusFilter}
                onChange={(v) => setStatusParam(v === 'all' ? '' : v)}
                testIdPrefix="bracket-matches"
              />
              <div className="min-h-0 flex-1 overflow-auto">
              <BandedTable
                columns={BRACKET_MATCH_LIST_COLUMNS}
                groups={tableGroups}
                rowId={({ pu }) => pu.id}
                onRowClick={({ pu }) =>
                  setSelectedId((prev) => (prev === pu.id ? null : pu.id))
                }
                selectedId={selectedId}
                rowTestId={({ pu }) => `bracket-match-row-${pu.id}`}
                renderRow={({ pu }) => {
                  const status = statusOf(pu.id);
                  const result = resultByPu.get(pu.id);
                  const sets = result?.score?.sets ?? [];
                  const reason =
                    result?.reason ?? (result?.walkover ? 'walkover' : null);
                  // `winner_side` can be 'none' (double W.O.) — no dot then.
                  const winner =
                    result?.winner_side === 'A' || result?.winner_side === 'B'
                      ? result.winner_side
                      : null;
                  return (
                    <>
                      {/* Gutter spacer — Meet's warning-icon slot;
                          empty here but kept so the columns start
                          at the same x on both surfaces. */}
                      <span role="cell" className={`${BRACKET_MATCH_CELL.warnGutter} shrink-0`} />
                      {/* Friendly label, group prefix stripped (the band
                          header already carries "MS"); raw id kept on title
                          for traceability (it's also the row testid).
                          px-1.5 mirrors the inner inset of Meet's
                          editable event field. `break-words` is the backstop
                          for a longer operator discipline code: it grows the
                          row rather than spilling into Side A. */}
                      <span
                        role="cell"
                        className={`${BRACKET_MATCH_CELL.event} break-words px-1.5 text-2sm font-semibold text-foreground sw-num`}
                        title={pu.id}
                      >
                        {shortLabelById.get(pu.id) ?? pu.id}
                      </span>
                      {/* Winner by WEIGHT, not by a green dot floating before
                          the name — green reads as live at scan speed, which a
                          finished match is not (BMAT-2 / MAT-3). */}
                      <span
                        role="cell"
                        className={`${BRACKET_MATCH_CELL.side} flex flex-wrap items-baseline gap-x-1 text-2sm leading-relaxed text-foreground ${
                          winner === 'A' ? 'font-semibold' : ''
                        }`}
                      >
                        {renderSide(pu.side_a, pu.slot_a)}
                      </span>
                      <span
                        role="cell"
                        className={`${BRACKET_MATCH_CELL.side} flex flex-wrap items-baseline gap-x-1 text-2sm leading-relaxed text-foreground ${
                          winner === 'B' ? 'font-semibold' : ''
                        }`}
                      >
                        {renderSide(pu.side_b, pu.slot_b)}
                      </span>
                      <span
                        role="cell"
                        data-testid={`bracket-match-status-${pu.id}`}
                        className={`${BRACKET_MATCH_CELL.status} flex items-center justify-end`}
                      >
                        {/* X6-D (supersedes X3): a finished row's score IS
                            its status — no DONE label beside it. See the
                            meet list. */}
                        {sets.length > 0 || reason ? (
                          <ScoreLane sets={sets} reason={reason} />
                        ) : (
                          <MatchStatus status={status} />
                        )}
                      </span>
                      <span
                        role="cell"
                        className={`flex ${BRACKET_MATCH_CELL.actionGutter} shrink-0 items-center justify-center`}
                        onClick={(e) => e.stopPropagation()}
                      >
                        {status !== 'done' && canEdit ? (
                          <OverflowMenu
                            label={`Contingency for ${labelById.get(pu.id) ?? pu.id}`}
                            items={(['walkover', 'retired', 'forfeit'] as const).map(
                              (r) => ({
                                key: r,
                                label: CONTINGENCY_MENU_LABEL[r],
                                testId: `bracket-match-menu-${r}-${pu.id}`,
                                onSelect: () => {
                                  setSelectedId(pu.id);
                                  setContingency(r);
                                },
                              }),
                            )}
                          />
                        ) : null}
                      </span>
                    </>
                  );
                }}
              />
              {shown === 0 ? (
                <div className="px-5 py-10 text-center text-sm text-muted-foreground">
                  No matches match the current filters.
                </div>
              ) : null}
              </div>
            </>
          )}
        </div>

        {/* Derived from THIS list's columns: same shared anatomy as Meet
            Matches, but a wider event column for the longer play-unit
            labels, so a wider floor (712 vs 672). */}
        <DetailDock
          open={selected != null}
          minContentWidth={BRACKET_MATCH_LIST_DOCK_MIN_CONTENT_WIDTH}
        >
        {selected ? (
          <BracketMatchDetailPanel
            key={selected.id}
            pu={selected}
            data={data}
            label={labelById.get(selected.id) ?? selected.id}
            status={statusOf(selected.id)}
            labelById={labelById}
            onClose={() => {
              setSelectedId(null);
              setContingency(null);
            }}
            onCommitEvent={commitEvent}
            initialContingency={contingency}
            onRecordContingency={
              canEdit
                ? async (reason, winner) => {
                    const next = await api.recordResultCommand({
                      play_unit_id: selected.id,
                      winner_side: winner,
                      reason,
                      seen_version: selected.version,
                    });
                    onData?.(next);
                    setContingency(null);
                  }
                : null
            }
          />
        ) : null}
        </DetailDock>
      </div>
    </div>
  );
}

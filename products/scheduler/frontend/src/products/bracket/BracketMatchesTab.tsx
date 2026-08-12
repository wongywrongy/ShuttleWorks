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
import type { BracketTournamentDTO } from '../../api/bracketDto';
import { useBracketApi } from '../../api/bracketClient';
import { useSearchParamState } from '../../hooks/useSearchParamState';
import { useCanEdit } from '../../hooks/useCanEdit';
import {
  ActionsBar,
  BandedTable,
  DetailDock,
  EmptyState,
  BRACKET_MATCH_CELL,
  BRACKET_MATCH_LIST_COLUMNS,
  BRACKET_MATCH_LIST_DOCK_MIN_CONTENT_WIDTH,
  OverflowMenu,
  STATUS_CLASS,
  STATUS_LABEL,
  type BandedTableGroup,
  type BracketMatchStatus,
} from '../../components/control-plane';
import { EYEBROW_CLASS, INTERACTIVE_BASE } from '../../lib/utils';
import { disciplineOrderIndex } from '../../lib/eventColors';
import { buildPlayUnitLabels, disciplineLabel } from './bracketLabels';
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

  const statusOf = (puId: string): BracketMatchStatus => {
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
        <div className="min-h-0 min-w-0 flex-1 overflow-auto @container/table">
          {total === 0 ? (
            <EmptyState
              title="No matches yet"
              body="Matches come from the draws. Add events and generate draws in the Events and Draw tabs; they’ll appear here and feed Operations."
            />
          ) : (
            <>
              <BandedTable
                columns={BRACKET_MATCH_LIST_COLUMNS}
                groups={tableGroups}
                rowId={({ pu }) => pu.id}
                onRowClick={({ pu }) =>
                  setSelectedId((prev) => (prev === pu.id ? null : pu.id))
                }
                selectedId={selectedId}
                rowTestId={({ pu }) => `bracket-match-row-${pu.id}`}
                renderRow={({ pu, n }) => {
                  const status = statusOf(pu.id);
                  return (
                    <>
                      {/* Gutter spacer — Meet's warning-icon slot;
                          empty here but kept so the columns start
                          at the same x on both surfaces. */}
                      <span role="cell" className={`${BRACKET_MATCH_CELL.warnGutter} shrink-0`} />
                      <span
                        role="cell"
                        className={`${BRACKET_MATCH_CELL.number} text-xs text-muted-foreground tabular-nums`}
                      >
                        {n}
                      </span>
                      {/* Friendly label; raw id kept on title for
                          traceability (it's also the row testid).
                          px-1.5 mirrors the inner inset of Meet's
                          editable event field — BRACKET_EVENT_COL is
                          sized with that 12px pair already deducted, so
                          the 10-char worst case ("XDC L R327") stays on
                          one line. `break-words` is the backstop for a
                          longer operator discipline code: it grows the
                          row rather than spilling into Side A. */}
                      <span
                        role="cell"
                        className={`${BRACKET_MATCH_CELL.event} break-words px-1.5 text-sm font-semibold text-accent sw-num`}
                        title={pu.id}
                      >
                        {labelById.get(pu.id) ?? pu.id}
                      </span>
                      <span
                        role="cell"
                        className={`${BRACKET_MATCH_CELL.side} text-sm leading-relaxed text-foreground`}
                      >
                        {renderSide(pu.side_a)}
                      </span>
                      <span
                        role="cell"
                        className={`${BRACKET_MATCH_CELL.side} text-sm leading-relaxed text-foreground`}
                      >
                        {renderSide(pu.side_b)}
                      </span>
                      <span
                        role="cell"
                        className={`${BRACKET_MATCH_CELL.status} ${EYEBROW_CLASS} ${STATUS_CLASS[status]}`}
                      >
                        {STATUS_LABEL[status]}
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
                  No matches match the current search.
                </div>
              ) : null}
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

/**
 * Bracket Matches — the bracket's output surface, the parallel of the
 * meet's Matches tab. Where the meet derives matches from the roster
 * grid, the bracket derives them from the draws: every PlayUnit across
 * every event. The list is a read-only projection (edit the draw in
 * Draw / Events to change matches) grouped by event on the shared
 * BandedTable shell, mirroring the meet's grouped match list; clicking
 * a row (anywhere — the rows hold no editors) opens the shared right-docked
 * MatchInspector. F-UNI-12/F-UNI-17: Bracket supplies identity, snapshot data
 * and its authorized controls; it no longer owns match-detail chrome.
 */
import { useCallback, useMemo, useState } from 'react';
import { Download } from '@phosphor-icons/react';
import type { BracketTournamentDTO, PlayUnitDTO } from '../../api/bracketDto';
import { useBracketApi } from '../../api/bracketClient';
import { useSearchParamState } from '../../hooks/useSearchParamState';
import { useCanEdit } from '../../hooks/useCanEdit';
import {
  ActionsBar,
  DenseDataTable,
  DenseDataToolbar,
  DetailDock,
  EmptyState,
  DEFAULT_DENSE_DATA_STATE,
  MatchStatusFilter,
  BRACKET_MATCH_CELL,
  BRACKET_MATCH_LIST_COLUMNS,
  BRACKET_MATCH_LIST_DOCK_MIN_CONTENT_WIDTH,
  MatchStatus,
  MatchInspector,
  OverflowMenu,
  parseMatchStatusFilter,
  ScoreLane,
  STATUS_LABEL,
  type DenseDataColumn,
  type BracketMatchStatus,
  type MatchInspectorModel,
} from '../../components/control-plane';
import { formatSideName } from '../../lib/names';
import { INTERACTIVE_BASE } from '../../lib/utils';
import { disciplineOrderIndex } from '../../lib/eventColors';
import { formatMatchIdentity } from '../../platform/domain/matchIdentity';
import { matchKey } from '../../platform/domain/match';
import {
  buildPlayUnitIdentities,
  disciplineLabel,
  sideLabel,
} from './bracketLabels';
import {
  BracketMatchContingencyControls,
  BracketMatchPlayerControls,
  type ContingencyReason,
} from './BracketMatchControls';
import { type CommitEventFn } from './BracketPlayerFields';
import { formatBracketSlot } from './formatBracketSlot';
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
  // Preserve the existing shared `?q=` deep-link contract. Other dense table
  // state remains local until the matches route can own a complete query
  // namespace; search is the high-value handoff for this surface.
  const [query, setQuery] = useSearchParamState('q', '');
  const [denseState, setDenseStateLocal] = useState(() => ({ ...DEFAULT_DENSE_DATA_STATE, search: query }));
  const setDenseState = (next: typeof denseState) => {
    setDenseStateLocal(next);
    if (next.search !== query) setQuery(next.search);
  };
  // Status facet (?status=) — the same strip Meet Matches renders.
  const [statusParam, setStatusParam] = useSearchParamState('status', '');
  const statusFilter = parseMatchStatusFilter(statusParam);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Row-menu deep-link into the shared inspector's Bracket action controls (a
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
  // F-UNI-12/F-UNI-17: the list and inspector consume one identity projection
  // from the already-fetched bracket snapshot.
  const identityById = useMemo(() => buildPlayUnitIdentities(data), [data]);
  const labelById = useMemo(
    () => new Map(
      [...identityById].map(([id, identity]) => [id, formatMatchIdentity(identity)]),
    ),
    [identityById],
  );

  // Row form of the label INSIDE its event group (G6): the group band
  // already says "MS", so "MS QF1" rows repeat it — row identity is "QF1".
  // Exports and titles keep the full label.
  const shortLabelById = useMemo(() => {
    // The shared formatter prefixes with the raw discipline CODE — strip
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

  const q = denseState.search.toLowerCase().trim();
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

  const matchColumns = useMemo<DenseDataColumn<NumberedUnit>[]>(() => [
    {
      id: 'match', label: 'Match', accessor: ({ pu }) => shortLabelById.get(pu.id) ?? pu.id,
      className: BRACKET_MATCH_CELL.event, mobile: true, cellTitle: ({ pu }) => pu.id,
      render: (_value, { pu }) => <span className="font-semibold text-foreground sw-num" title={pu.id}>{shortLabelById.get(pu.id) ?? pu.id}</span>,
    },
    {
      id: 'sideA', label: BRACKET_MATCH_LIST_COLUMNS[2].label, accessor: ({ pu }) => resolveSide(pu.side_a), className: BRACKET_MATCH_CELL.side,
      render: (_value, { pu }) => renderSide(pu.side_a, pu.slot_a),
    },
    {
      id: 'sideB', label: BRACKET_MATCH_LIST_COLUMNS[3].label, accessor: ({ pu }) => resolveSide(pu.side_b), className: BRACKET_MATCH_CELL.side,
      render: (_value, { pu }) => renderSide(pu.side_b, pu.slot_b),
    },
    {
      id: 'status', label: BRACKET_MATCH_LIST_COLUMNS[4].label, accessor: ({ pu }) => statusOf(pu.id), align: 'right', className: BRACKET_MATCH_CELL.status,
      render: (_value, { pu }) => {
        const result = resultByPu.get(pu.id);
        const sets = result?.score?.sets ?? [];
        const reason = result?.reason ?? (result?.walkover ? 'walkover' : null);
        return <span data-testid={`bracket-match-status-${pu.id}`} className="inline-flex min-w-0 items-center justify-end">{sets.length > 0 || reason ? <ScoreLane sets={sets} reason={reason} /> : <MatchStatus status={statusOf(pu.id)} />}</span>;
      },
    },
    {
      // SP-OPCON-1 SWP-4: exceptions only. "Unassigned court" is NOT an issue
      // for a bracket match — courts are assigned at play time by Operations
      // (queue scheduling), and a result can be recorded with no assignment at
      // all, so the old predicate stamped every row of a finished event. The
      // one real exception this list can see is an unresolved feeder on an
      // unplayed match. Rows without an issue render NOTHING (X6: a column
      // painting the same word on every row is decoration, not information).
      id: 'issue', label: 'Issues',
      accessor: ({ pu }) =>
        !resultByPu.has(pu.id) && ((pu.side_a?.length ?? 0) === 0 || (pu.side_b?.length ?? 0) === 0)
          ? 'Waiting on draw'
          : '',
      mobile: true,
      render: (value) => value ? <span className="font-medium text-status-warning">{String(value)}</span> : null,
    },
  ], [labelById, resultByPu, shortLabelById]);

  const selected = selectedId
    ? data.play_units.find((pu) => pu.id === selectedId) ?? null
    : null;

  const participantNameById = useMemo(
    () => Object.fromEntries(
      data.participants.map((participant) => [participant.id, participant.name]),
    ),
    [data.participants],
  );
  const selectedInspectorModel = useMemo<MatchInspectorModel | null>(() => {
    if (!selected) return null;
    const identity = identityById.get(selected.id);
    if (!identity) return null;
    const assignment = assignmentByPu.get(selected.id);
    const result = resultByPu.get(selected.id) ?? null;
    const sideValue = (ids: string[] | null, slot: PlayUnitDTO['slot_a']) => {
      if (ids && ids.length > 0) {
        return ids.map((id) => participantById.get(id)?.name ?? id).join(' / ');
      }
      if (slot.feeder_play_unit_id || slot.participant_id) {
        return sideLabel(ids, slot, participantNameById, labelById);
      }
      return 'TBD';
    };
    const sideA = sideValue(selected.side_a, selected.slot_a);
    const sideB = sideValue(selected.side_b, selected.slot_b);
    const winner = result?.winner_side === 'A'
      ? sideA
      : result?.winner_side === 'B'
        ? sideB
        : null;
    const sets = (result?.score?.sets ?? []).filter(
      (set) => typeof set?.sideA === 'number' && typeof set?.sideB === 'number',
    );
    const status: BracketMatchStatus = result
      ? 'done'
      : assignment?.started && !assignment.finished
        ? 'live'
        : assignment
          ? 'ready'
          : 'pending';

    // F-UNI-12/F-UNI-17: the shared model is a pure projection of the one
    // fetched snapshot; MatchInspector performs no Bracket read of its own.
    return {
      key: matchKey('bracket', selected.id),
      id: selected.id,
      identity,
      status: STATUS_LABEL[status],
      sideA,
      sideB,
      assignment: assignment
        ? {
            court: assignment.court_id,
            planned: formatBracketSlot(assignment.slot_id, data),
            actualStart: assignment.actual_start_slot != null
              ? formatBracketSlot(assignment.actual_start_slot, data)
              : null,
            actualEnd: assignment.actual_end_slot != null
              ? formatBracketSlot(assignment.actual_end_slot, data)
              : null,
          }
        : undefined,
      result: result
        ? {
            summary: winner ? `${winner} won` : 'Result recorded.',
            sets,
          }
        : null,
    };
  }, [
    assignmentByPu,
    data,
    identityById,
    labelById,
    participantById,
    participantNameById,
    resultByPu,
    selected,
  ]);

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
              <DenseDataToolbar
                state={denseState}
                onStateChange={setDenseState}
                searchTestId="bracket-matches-search"
                searchPlaceholder="Search event or player…"
              />
              <div className="min-h-0 flex-1 overflow-auto">
                <DenseDataTable
                  columns={matchColumns}
                  rows={groups.flatMap(({ units }) => units)}
                  state={denseState}
                  onStateChange={setDenseState}
                  rowId={({ pu }) => pu.id}
                  rowTestId={({ pu }) => `bracket-match-row-${pu.id}`}
                  onRowClick={({ pu }) => setSelectedId((prev) => (prev === pu.id ? null : pu.id))}
                  activeRowId={selectedId}
                  groupBy={({ pu }) => {
                    const event = data.events.find((candidate) => candidate.id === pu.event_id);
                    return { key: pu.event_id, label: event ? disciplineLabel(event.discipline) : pu.event_id, testId: `bracket-match-group-${pu.event_id}` };
                  }}
                  renderActions={({ pu }) => statusOf(pu.id) !== 'done' && canEdit ? <OverflowMenu label={`Contingency for ${labelById.get(pu.id) ?? pu.id}`} items={(['walkover', 'retired', 'forfeit'] as const).map((reason) => ({ key: reason, label: CONTINGENCY_MENU_LABEL[reason], testId: `bracket-match-menu-${reason}-${pu.id}`, onSelect: () => { setSelectedId(pu.id); setContingency(reason); } }))} /> : null}
                  emptyState="No matches match the current filters."
                />
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
        {selected && selectedInspectorModel ? (
          <MatchInspector
            key={selected.id}
            match={selectedInspectorModel}
            defaultFacet="summary"
            testId="bracket-match-detail"
            onClose={() => {
              setSelectedId(null);
              setContingency(null);
            }}
            supplements={{
              summary: statusOf(selected.id) !== 'done' ? (
                <BracketMatchPlayerControls
                  pu={selected}
                  data={data}
                  labelById={labelById}
                  onCommitEvent={commitEvent}
                  mode="summary"
                />
              ) : undefined,
              result: statusOf(selected.id) === 'done' ? (
                <BracketMatchPlayerControls
                  pu={selected}
                  data={data}
                  labelById={labelById}
                  onCommitEvent={commitEvent}
                  mode="result"
                />
              ) : undefined,
            }}
            actions={{
              summary: canEdit && statusOf(selected.id) !== 'done' ? (
                <BracketMatchContingencyControls
                  sideALabel={sideLabel(
                    selected.side_a,
                    selected.slot_a,
                    participantNameById,
                    labelById,
                  )}
                  sideBLabel={sideLabel(
                    selected.side_b,
                    selected.slot_b,
                    participantNameById,
                    labelById,
                  )}
                  initial={contingency}
                  onRecord={async (reason, winner) => {
                    const next = await api.recordResultCommand({
                      play_unit_id: selected.id,
                      winner_side: winner,
                      reason,
                      seen_version: selected.version,
                    });
                    onData?.(next);
                    setContingency(null);
                  }}
                />
              ) : undefined,
            }}
          />
        ) : null}
        </DetailDock>
      </div>
    </div>
  );
}

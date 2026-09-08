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
import { useDenseDataState } from '../../hooks/useDenseDataState';
import { useListScrollRestore } from '../../hooks/useListScrollRestore';
import { useCanEdit } from '../../hooks/useCanEdit';
import {
  ActionsBar,
  OPERATOR_INVENTORY_PAGE_SIZE,
  DenseDataTable,
  DenseDataToolbar,
  DetailDock,
  EmptyState,
  MatchStatusFilter,
  BRACKET_MATCH_CELL,
  BRACKET_MATCH_LIST_COLUMNS,
  BRACKET_MATCH_LIST_DOCK_MIN_CONTENT_WIDTH,
  MatchInspector,
  ScoreLane,
  formatGamePairs,
  OverflowMenu,
  parseMatchStatusFilter,
  STATUS_LABEL,
  type DenseDataColumn,
  type BracketMatchStatus,
  type MatchInspectorModel,
} from '../../components/control-plane';
import {
  formatSideCondensed,
  formatSideLines,
  resolveFeederReference,
  sideFromWire,
  sideSummaryText,
  type Side,
} from '../../platform/domain/sides';
import { UTILITY_BUTTON } from '../../lib/utils';
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
  const listScrollRef = useListScrollRestore<HTMLDivElement>('bracket-matches', data.play_units.length > 0);
  const canEdit = useCanEdit();
  // Preserve the shared ?q= deep-link contract alongside namespaced table state.
  const [query, setQuery] = useSearchParamState('q', '');
  const [storedDenseState, denseActions] = useDenseDataState(
    { pageSize: OPERATOR_INVENTORY_PAGE_SIZE },
    'bracket-matches',
  );
  const denseState = { ...storedDenseState, search: query };
  const setDenseState = (next: typeof denseState) => {
    denseActions.setState(next);
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

  // D14/D17 — the one side formatter (`platform/domain/sides.ts`), never a
  // hand-rolled split/join. `sideOf` builds a `Side` from the operator wire's
  // structured `sides` (package 10a) when present, falling back to the
  // legacy `side_a`/`side_b` ids + `slot_a`/`slot_b` shape for an older
  // cached payload — same fallback contract the DTO comment documents.
  //
  // A feeder-less empty slot resolves to `undetermined` ("To be decided",
  // match-card §2.1) rather than `bye` — `sideFromWire`/this fallback both
  // read a feeder-less empty slot as "waiting", never as a claim this list
  // cannot verify (BMAT-4): a real bye is only ever signalled by the
  // backend's own `bye` kind on `pu.sides`.
  const legacySide = (
    ids: string[] | null,
    slot: PlayUnitDTO['slot_a'],
  ): Side => {
    if (ids && ids.length > 0) {
      return {
        persons: ids.map((id) => ({ id, name: participantById.get(id)?.name ?? id })),
        unresolved: null,
        seed: null,
        participantKey: ids.length === 1 ? ids[0] : null,
      };
    }
    if (slot?.participant_id) {
      const name = participantById.get(slot.participant_id)?.name ?? slot.participant_id;
      return {
        persons: [{ id: slot.participant_id, name }],
        unresolved: null,
        seed: null,
        participantKey: slot.participant_id,
      };
    }
    if (slot?.feeder_play_unit_id) {
      return {
        persons: [],
        unresolved: {
          kind: slot.feeder_take === 'loser' ? 'loser_of' : 'winner_of',
          reference: slot.feeder_play_unit_id,
        },
        seed: null,
        participantKey: null,
      };
    }
    return { persons: [], unresolved: { kind: 'undetermined' }, seed: null, participantKey: null };
  };

  const sideOf = (pu: PlayUnitDTO, side: 'A' | 'B'): Side => {
    const wire = pu.sides?.[side === 'A' ? 0 : 1];
    const raw = wire
      ? sideFromWire(wire)
      : legacySide(side === 'A' ? pu.side_a : pu.side_b, side === 'A' ? pu.slot_a : pu.slot_b);
    return resolveFeederReference(raw, labelById);
  };

  // Render form of a side: real names ONE PER LINE (match-card §3.1, P3 —
  // the ` / ` condensed join reads as a single name at scan speed and made
  // the two sides of a doubles row impossible to line up); an unresolved side
  // renders its fixed §2.1 label ("Winner of QF1", "To be decided", "Bye"…)
  // in the same muted-italic treatment the list has always used.
  const renderSide = (sideModel: Side) => {
    if (sideModel.persons.length > 0) {
      return formatSideLines(sideModel).map((line, i) => (
        <span key={i} className="block break-words">
          {line}
        </span>
      ));
    }
    return (
      <span className="text-xs italic text-muted-foreground">
        {formatSideLines(sideModel)[0]}
      </span>
    );
  };

  // A side is NAMES ONLY. The games live once, in the centred lane between
  // the two sides (match-card §3.4) — never as two per-side columns the
  // reader has to align across a name to read one game.
  const renderNamedSide = (pu: PlayUnitDTO, side: 'A' | 'B') => {
    const result = resultByPu.get(pu.id);
    const sideModel = sideOf(pu, side);
    // §2.7 rule 4 / §3.5: the match winner comes from the recorded outcome
    // (`winner_side`), never from counting sets — retirement/walkover
    // contradict the point totals by construction, and `winner_side` is only
    // ever set once a result exists (never on an unfinished match).
    const winner = result?.winner_side === side;
    return (
      <span
        className={`flex min-w-0 flex-col justify-center ${winner ? 'font-semibold text-foreground' : ''}`}
        title={sideSummaryText(sideModel)}
      >
        {renderSide(sideModel)}
        {winner ? <span className="sr-only">Winner</span> : null}
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
  const allGroups = useMemo(() => {
    const byEvent = new Map<string, BracketTournamentDTO['play_units']>();
    for (const pu of data.play_units) {
      const arr = byEvent.get(pu.event_id) ?? [];
      arr.push(pu);
      byEvent.set(pu.event_id, arr);
    }
    return data.events
      .slice()
      // Same discipline banding order as Meet Matches (doubles-first
      // dual-meet convention); stable event identifiers break ties.
      .sort(
        (a, b) =>
          disciplineOrderIndex(a.discipline) - disciplineOrderIndex(b.discipline) || a.id.localeCompare(b.id),
      )
      .map((ev) => {
        const units = (byEvent.get(ev.id) ?? [])
          .slice()
          .sort(
            (a, b) =>
              a.round_index - b.round_index || a.match_index - b.match_index || a.id.localeCompare(b.id),
          )
          .map((pu, idx) => ({ pu, n: idx + 1 }));
        return { ev, units };
      });
  }, [data.play_units, data.events]);
  const liveRows = useMemo(() => allGroups.flatMap(({ units }) => units), [allGroups]);
  const groups = useMemo(() => allGroups.map(({ ev, units }) => ({
    ev,
    units: units.filter(({ pu }) => {
      if (statusFilter !== 'all' && statusOf(pu.id) !== statusFilter) return false;
      if (!q) return true;
      const hay = [
        pu.id, ev.id, ev.discipline,
        formatSideCondensed(sideOf(pu, 'A')),
        formatSideCondensed(sideOf(pu, 'B')),
      ].join(' ').toLowerCase();
      return hay.includes(q);
    }),
  })).filter((g) => g.units.length > 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
  [allGroups, q, statusFilter, assignmentByPu, resultByPu, participantById]);

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
      sideA: formatSideCondensed(sideOf(pu, 'A')),
      sideB: formatSideCondensed(sideOf(pu, 'B')),
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
      id: 'sideA', label: BRACKET_MATCH_LIST_COLUMNS[2].label, accessor: ({ pu }) => formatSideCondensed(sideOf(pu, 'A')), className: BRACKET_MATCH_CELL.side,
      render: (_value, { pu }) => renderNamedSide(pu, 'A'),
    },
    {
      // The centred paired lane BETWEEN the opponents (match-card §3.4):
      // "18–21, 21–15, 21–13", first number = Side A, no emphasis on any
      // game. A partial ledger from a walkover/retirement renders WITH its
      // badge; the winner is still the recorded `winner_side`, never the
      // numbers. Nothing recorded → the cell stays empty rather than
      // reserving an invisible marker.
      id: 'score', label: BRACKET_MATCH_LIST_COLUMNS[3].label,
      accessor: ({ pu }) => formatGamePairs(resultByPu.get(pu.id)?.score?.sets ?? []),
      align: 'center', className: BRACKET_MATCH_CELL.score,
      render: (_value, { pu }) => {
        const result = resultByPu.get(pu.id);
        const sets = (result?.score?.sets ?? []).filter(
          (set): set is { sideA: number; sideB: number } =>
            !!set && typeof set.sideA === 'number' && typeof set.sideB === 'number',
        );
        const reason =
          result?.reason === 'retired' || result?.reason === 'forfeit'
            ? result.reason
            : result?.walkover
              ? 'walkover'
              : null;
        return (
          <ScoreLane
            sets={sets}
            reason={reason}
            sideALabel={sideSummaryText(sideOf(pu, 'A'))}
            sideBLabel={sideSummaryText(sideOf(pu, 'B'))}
            data-testid={`bracket-match-score-${pu.id}`}
          />
        );
      },
    },
    {
      id: 'sideB', label: BRACKET_MATCH_LIST_COLUMNS[4].label, accessor: ({ pu }) => formatSideCondensed(sideOf(pu, 'B')), className: BRACKET_MATCH_CELL.side,
      render: (_value, { pu }) => renderNamedSide(pu, 'B'),
    },
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
    const sideA = formatSideCondensed(sideOf(selected, 'A'));
    const sideB = formatSideCondensed(sideOf(selected, 'B'));
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
          title="Export all filtered matches, across every page, to a spreadsheet"
          data-testid="bracket-export-matches"
          className={UTILITY_BUTTON}
        >
          <Download aria-hidden="true" className="h-3.5 w-3.5" />
          Export filtered matches
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
              body="Matches come from the draws. Create and generate a draw in Bracket, then Draws; its matches appear here and feed Operations."
            />
          ) : (
            <>
              <MatchStatusFilter
                counts={statusCounts}
                active={statusFilter}
                onChange={(v) => { denseActions.setPage(1); setStatusParam(v === 'all' ? '' : v); }}
                testIdPrefix="bracket-matches"
              />
              <DenseDataToolbar
                state={denseState}
                onStateChange={setDenseState}
                searchTestId="bracket-matches-search"
                searchPlaceholder="Search event or player…"
              />
              <div ref={listScrollRef} data-list-scroll="bracket-matches" className="min-h-0 flex-1 overflow-auto">
                <DenseDataTable
                  columns={matchColumns}
                  rows={groups.flatMap(({ units }) => units)}
                  liveSource={liveRows}
                  liveScope={JSON.stringify([statusFilter, query])}
                  state={{ ...denseState, search: '' }}
                  onStateChange={(next) => setDenseState({ ...next, search: query })}
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

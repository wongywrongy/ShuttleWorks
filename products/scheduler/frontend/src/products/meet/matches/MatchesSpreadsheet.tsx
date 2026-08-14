/**
 * Flat-row match LIST. No <table>, no card wrapper — each match renders as a
 * flex row with `border-b` only. Column-label row sits above the match rows
 * with the same `px-5` rhythm.
 *
 * THE ROW IS A SUMMARY, NOT AN EDITOR (console-IA §0, §1). It used to carry a
 * live Select, a text input, four player buttons and five delete buttons per
 * match — ten controls a row, each calling `stopPropagation` specifically so
 * the row click could not open the detail pane. That is the surface the owner
 * described as "a direct row replacement", and it is why `✕ remove player`
 * and `✕ remove match` ended up 23px apart at the right edge. Every editor
 * now lives in `MatchDetailPanel`, which the row click opens; what is left
 * here reads, and the only control in a row is the armed match delete.
 *
 * Search/Add-match/Export live in the page-header row owned by
 * `MatchesTab` — those affordances do NOT render here. This component
 * subscribes to the same `?q=` search param as the page header so the
 * URL is the shared source of truth.
 */
import { memo, useEffect, useMemo, useState } from 'react';
import { Warning } from '@phosphor-icons/react';
import {
  BandedTable,
  ColumnHeaderRow,
  DetailDock,
  MatchStatusFilter,
  MEET_MATCH_CELL,
  MEET_MATCH_LIST_COLUMNS,
  MEET_MATCH_LIST_DOCK_MIN_CONTENT_WIDTH,
  parseMatchStatusFilter,
  ScoreLane,
  setsWinner,
  STATUS_LABEL,
  STATUS_PILL_TONE,
  WinnerDot,
  type BandedTableGroup,
  type MatchListStatus,
  type SetPair,
} from '../../../components/control-plane';
import { StatusPill } from '../../../components/StatusPill';
import { formatPlayerName } from '../../../lib/names';
import { useTournamentStore } from '../../../store/tournamentStore';
import { useMatchStateStore } from '../../../store/matchStateStore';
import { usePlayerMap } from '../../../store/selectors';
import type { MatchDTO, PlayerDTO } from '../../../api/dto';
import { useSearchParamState, useSearchParamSet } from '../../../hooks/useSearchParamState';
import { useDisruptions } from './useDisruptions';
import { EVENT_LABEL, EVENT_ORDER } from '../roster/positionGrid/helpers';
import { MatchDetailPanel } from './MatchDetailPanel';
import { meetMatchStatus } from './meetMatchStatus';
import { maxSeverity, type MatchIssue } from './validateMatch';
import { ConfirmDeleteButton } from '../../../components/ConfirmDeleteButton';
import { getActiveAssignments } from '../../../lib/getActiveAssignments';

/** Stable empty-array reference so MatchRow's useMemo deps don't churn
 *  when a match has no disruptions. */
const EMPTY_ISSUES: MatchIssue[] = [];

export function MatchesSpreadsheet({
  pendingFocusId,
  onFocusConsumed,
}: {
  /** Match ID whose detail pane should open after mount. Set by MatchesTab
   *  after "+ Add match" so the operator lands on the new match's editor
   *  instead of hunting for the row. */
  pendingFocusId?: string | null;
  /** Called once the directive is consumed so the parent can clear it. */
  onFocusConsumed?: () => void;
} = {}) {
  const matches = useTournamentStore((s) => s.matches);
  const players = useTournamentStore((s) => s.players);
  const deleteMatch = useTournamentStore((s) => s.deleteMatch);
  const schedule = useTournamentStore((s) => s.schedule);
  const matchStates = useMatchStateStore((s) => s.matchStates);
  const assignedIds = useMemo(
    () => new Set(getActiveAssignments(schedule).map((a) => a.matchId)),
    [schedule],
  );

  // Subscribes to the same URL-backed search the page header writes to.
  const [searchQuery] = useSearchParamState('q', '');
  // Status facet (?status=): the filter strip above the list. Same URL
  // contract as `?q=` — no debounce needed for a click, but consistency
  // beats a second mechanism.
  const [statusParam, setStatusParam] = useSearchParamState('status', '');
  const statusFilter = parseMatchStatusFilter(statusParam);
  // Legacy filter params kept for URL backward compatibility — not
  // currently surfaced in any UI; if the user lands with these set, the
  // matches list still respects them.
  const [eventFilter] = useSearchParamSet('event');
  const [schoolFilter] = useSearchParamSet('school');
  const [typeFilter] = useSearchParamSet('type');

  const playerById = usePlayerMap();

  // One status per match, computed once — feeds the filter strip counts,
  // the status facet, and each row's Status cell.
  const statusById = useMemo(() => {
    const map = new Map<string, MatchListStatus>();
    for (const m of matches) {
      map.set(m.id, meetMatchStatus(m.id, assignedIds, matchStates));
    }
    return map;
  }, [matches, assignedIds, matchStates]);

  const statusCounts = useMemo(() => {
    const counts: Record<MatchListStatus, number> = {
      done: 0,
      live: 0,
      ready: 0,
      pending: 0,
    };
    for (const s of statusById.values()) counts[s] += 1;
    return counts;
  }, [statusById]);

  const filteredMatches = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    const eventActive = eventFilter.size > 0;
    const schoolActive = schoolFilter.size > 0;
    const typeActive = typeFilter.size > 0;
    const statusActive = statusFilter !== 'all';
    if (!q && !eventActive && !schoolActive && !typeActive && !statusActive)
      return matches;

    const playerName = (id: string) =>
      playerById.get(id)?.name?.toLowerCase() ?? '';
    const playerGroup = (id: string) => playerById.get(id)?.groupId;

    return matches.filter((m) => {
      if (q) {
        const hits =
          (m.eventRank?.toLowerCase().includes(q) ?? false) ||
          m.sideA.some((id) => playerName(id).includes(q)) ||
          m.sideB.some((id) => playerName(id).includes(q)) ||
          (m.sideC?.some((id) => playerName(id).includes(q)) ?? false);
        if (!hits) return false;
      }
      if (eventActive) {
        const prefix = (m.eventRank ?? '').match(/^[A-Z]+/)?.[0] ?? '';
        if (!eventFilter.has(prefix)) return false;
      }
      if (schoolActive) {
        const groupIds = new Set(
          [...m.sideA, ...m.sideB, ...(m.sideC ?? [])]
            .map(playerGroup)
            .filter(Boolean) as string[],
        );
        if (!Array.from(schoolFilter).some((id) => groupIds.has(id))) return false;
      }
      if (typeActive) {
        if (!typeFilter.has(m.matchType ?? 'dual')) return false;
      }
      if (statusActive && statusById.get(m.id) !== statusFilter) return false;
      return true;
    });
  }, [
    matches,
    searchQuery,
    eventFilter,
    schoolFilter,
    typeFilter,
    statusFilter,
    statusById,
    playerById,
  ]);

  const disruptions = useDisruptions();

  // Selected match — a click ANYWHERE in a row opens the right-docked match
  // DetailPanel, which is where the match is edited. Derived find so a
  // deleted match auto-dismisses the panel. Memoized so a re-render that
  // doesn't touch `matches`/`selectedId` doesn't re-scan the full match
  // array every time.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedMatch = useMemo(
    () => matches.find((m) => m.id === selectedId) ?? null,
    [matches, selectedId],
  );

  // "+ Add match" lands the operator on the new match's editor. It used to
  // focus the row's own event Select; the editors have moved, so the pane
  // opens instead — same intent, one surface.
  useEffect(() => {
    if (!pendingFocusId) return;
    setSelectedId(pendingFocusId);
    onFocusConsumed?.();
  }, [pendingFocusId, onFocusConsumed]);

  // Group the filtered matches by event prefix so each discipline gets
  // its own collapsible section. Section order follows EVENT_ORDER; any
  // match with no/unknown rank collects into a trailing "Unassigned"
  // group keyed by the '—' sentinel. Collapse state lives inside the
  // shared BandedTable shell (default all-expanded, as before). Memoized
  // (with the regex-per-match grouping pass) so an unrelated re-render
  // doesn't rebuild these on every render — only when `filteredMatches`
  // actually changes.
  const tableGroups = useMemo<BandedTableGroup<MatchDTO>[]>(() => {
    const groupsByPrefix = new Map<string, MatchDTO[]>();
    for (const m of filteredMatches) {
      const prefix = (m.eventRank ?? '').match(/^[A-Z]+/)?.[0] ?? '';
      const key = prefix || '–';
      if (!groupsByPrefix.has(key)) groupsByPrefix.set(key, []);
      groupsByPrefix.get(key)!.push(m);
    }
    const orderedKeys = [
      ...EVENT_ORDER.filter((p) => groupsByPrefix.has(p)),
      ...[...groupsByPrefix.keys()].filter(
        (k) => !(EVENT_ORDER as readonly string[]).includes(k),
      ),
    ];
    return orderedKeys.map((key) => {
      const label = key === '–' ? 'Unassigned' : EVENT_LABEL[key]?.full ?? key;
      return {
        key,
        label,
        code: key === '–' ? undefined : key,
        items: groupsByPrefix.get(key)!,
        testId: `match-group-${label}`,
      };
    });
  }, [filteredMatches]);

  if (matches.length === 0) {
    return (
      <div className="px-5 py-10 text-center text-sm text-muted-foreground">
        No matches yet. Add one manually or use auto-generate above.
      </div>
    );
  }

  const issuesFor = (m: MatchDTO) =>
    disruptions.byMatch.get(m.id) ?? EMPTY_ISSUES;
  const stripeFor = (m: MatchDTO) => {
    const severity = maxSeverity(issuesFor(m));
    return severity === 'error'
      ? 'shadow-[inset_3px_0_0_hsl(var(--destructive))]'
      : severity === 'warning'
        ? 'shadow-[inset_3px_0_0_hsl(var(--status-warning))]'
        : '';
  };

  return (
    <>
      {/* @container/table: the column-priority classes in MEET_MATCH_CELL query
          THIS wrapper's width, so columns collapse as the detail dock takes
          room — not just when the window shrinks. */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col @container/table">
        <MatchStatusFilter
          counts={statusCounts}
          active={statusFilter}
          onChange={(v) => setStatusParam(v === 'all' ? '' : v)}
          testIdPrefix="matches"
        />
        <div className="min-h-0 flex-1 overflow-auto">
        {filteredMatches.length === 0 ? (
          <>
            {/* ColumnHeaderRow publishes role="row"/"columnheader" — they need
                the table they claim to live in even with no rows under them. */}
            <div role="table" aria-colcount={MEET_MATCH_LIST_COLUMNS.length}>
              <div role="rowgroup">
                <ColumnHeaderRow columns={MEET_MATCH_LIST_COLUMNS} />
              </div>
            </div>
            <div className="px-5 py-10 text-center text-sm text-muted-foreground">
              No matches match the current filters.
            </div>
          </>
        ) : (
          <BandedTable
            columns={MEET_MATCH_LIST_COLUMNS}
            groups={tableGroups}
            rowId={(m) => m.id}
            onRowClick={(m) =>
              setSelectedId((prev) => (prev === m.id ? null : m.id))
            }
            selectedId={selectedId}
            rowClassName={(m) => ['group', stripeFor(m)].filter(Boolean).join(' ')}
            rowTestId={(m) => `match-row-${m.id}`}
            rowAttrs={(m) => ({
              'data-severity': maxSeverity(issuesFor(m)) ?? 'none',
            })}
            renderRow={(m) => (
              <MatchRow
                match={m}
                status={statusById.get(m.id) ?? 'pending'}
                sets={matchStates[m.id]?.sets}
                score={matchStates[m.id]?.score}
                players={players}
                issues={issuesFor(m)}
                onDelete={deleteMatch}
              />
            )}
          />
        )}
        </div>
      </div>
      {/* Floor derived from MEET_MATCH_LIST_COLUMNS, not hand-picked: the old 560
          default sat under the 672 `@2xl` tier, so selecting a match deleted
          the `#` and `Status` columns. */}
      <DetailDock
        open={selectedMatch != null}
        minContentWidth={MEET_MATCH_LIST_DOCK_MIN_CONTENT_WIDTH}
      >
        {selectedMatch ? (
          <MatchDetailPanel
            key={selectedMatch.id}
            match={selectedMatch}
            status={statusById.get(selectedMatch.id) ?? 'pending'}
            onClose={() => setSelectedId(null)}
          />
        ) : null}
      </DetailDock>
    </>
  );
}

/* =========================================================================
 * MatchRow — the CELLS of one match row. The row shell (the canonical
 * banded row classes, `group` hover reveals, the disruption accent stripe,
 * click-to-select) is owned by the BandedTable shell in the parent.
 *
 * Every cell here READS. Nothing in it stops click propagation, because
 * there is nothing left that would need to: the whole row, edge to edge, is
 * one target that opens the match's detail pane.
 * ========================================================================= */
// Memoized: with many rows, a search keystroke (or any store write) re-renders
// the parent; without memo every row re-rendered in full. Props are stable
// references (zustand actions, the EMPTY_ISSUES fallback), so unchanged rows
// now skip re-render.
const MatchRow = memo(function MatchRow({
  match,
  status,
  sets,
  score,
  players,
  issues,
  onDelete,
}: {
  match: MatchDTO;
  status: MatchListStatus;
  /** Recorded set scores from the match state — present once finished. On
   *  DONE rows they REPLACE the status pill (G6: scores + winner dot say
   *  "done"; a pill restating it is paid-for redundancy). */
  sets?: SetPair[];
  /** Aggregate sets-won score — the PERSISTED meet result (per-set detail
   *  is session-only until D19 lands). "2-0" in the lane beats a bare
   *  DONE pill, and keeps the meet and bracket status columns speaking
   *  the same language (owner ruling, P4 review). */
  score?: SetPair;
  players: PlayerDTO[];
  /** Pre-computed disruption issues for this match from the global
   *  `useDisruptions` feed. Routing through the hook keeps the
   *  per-row flag and the TabBar badge from drifting out of sync. */
  issues: MatchIssue[];
  onDelete: (id: string) => void;
}) {
  // Per-row disruption surfacing — partner-switch detection, side-count
  // mismatches, cross-side conflicts, stale player references. Issues
  // come from the global `useDisruptions` feed (consumed by the parent),
  // so the per-row Warning icon and the TabBar badge always agree.
  const severity = maxSeverity(issues);
  const laneSets =
    status !== 'done' ? null : sets?.length ? sets : score ? [score] : null;
  const scored = laneSets != null;
  const winner = scored ? setsWinner(laneSets) : null;

  return (
    <>
      <span
        role="cell"
        className={`flex ${MEET_MATCH_CELL.warnGutter} shrink-0 items-center justify-center`}
        title={
          issues.length > 0
            ? issues.map((i) => `• ${i.message}`).join('\n')
            : undefined
        }
      >
        {issues.length > 0 ? (
          <Warning
            aria-label={`${issues.length} issue${issues.length === 1 ? '' : 's'} on this match`}
            weight="fill"
            className={[
              'h-3.5 w-3.5',
              severity === 'error' ? 'text-destructive' : 'text-status-warning',
            ].join(' ')}
          />
        ) : null}
      </span>
      <span
        role="cell"
        className={`${MEET_MATCH_CELL.event} text-2sm font-semibold text-accent sw-num`}
      >
        {match.eventRank?.trim() || (
          <span className="text-xs font-normal italic text-muted-foreground">
            unset
          </span>
        )}
      </span>
      <PlayerCellSummary
        side="Side A"
        ids={match.sideA ?? []}
        players={players}
        winner={winner === 'A'}
      />
      <PlayerCellSummary
        side="Side B"
        ids={match.sideB ?? []}
        players={players}
        winner={winner === 'B'}
      />
      <span
        role="cell"
        data-testid={`match-status-${match.id}`}
        className={`${MEET_MATCH_CELL.status} flex items-center justify-end`}
      >
        {laneSets ? (
          <ScoreLane sets={laneSets} data-testid={`match-score-${match.id}`} />
        ) : (
          <StatusPill tone={STATUS_PILL_TONE[status]} dot={status === 'live'}>
            {STATUS_LABEL[status]}
          </StatusPill>
        )}
      </span>
      {/* Two-click arm: deleting a match used to take one hover-revealed click,
          with no confirm and no undo (audit F1). */}
      <span role="cell" className="contents">
        <ConfirmDeleteButton
          label={match.eventRank ? `match ${match.eventRank}` : 'this match'}
          onConfirm={() => onDelete(match.id)}
          className={MEET_MATCH_CELL.actionGutter}
          testId={`match-delete-${match.id}`}
        />
      </span>
    </>
  );
});


/* =========================================================================
 * PlayerCellSummary — one side, read only: the players' names, comma
 * separated. Names ONLY.
 *
 * The cell used to print each player's SCHOOL beside the name (once after
 * the last name when a doubles pair shared one — the `uniformSchool` rule,
 * which existed solely to de-duplicate it). Owner ruling, 2026-08-12: "the
 * side A and side B name for every row is too much. we dont need to list it.
 * waste of space." It was 31 characters a side, a row, for
 * "Nashville Badminton Association" — a column of identical strings, since a
 * dual meet has exactly two schools and the sides ARE the schools. The
 * school stays one click away, on the player card in the detail pane
 * (`MatchSideSection`), which is where the rest of the player record lives.
 *
 * This cell used to be `PlayerCellEditor`: a name button per player, an
 * inline `✕` per player, a "＋ add" link and a portaled picker, plus a
 * hand-written rule about which clicks inside it were allowed to reach the
 * row. All of that moved to `MatchSideSection` in the detail pane. The cell
 * now holds no controls, so every pixel of it opens the pane.
 * ========================================================================= */
function PlayerCellSummary({
  side,
  ids,
  players,
  winner = false,
}: {
  side: string;
  ids: string[];
  players: PlayerDTO[];
  /** Marks this side as the recorded winner (G6 winner dot). */
  winner?: boolean;
}) {
  const named = ids
    .map((id) => players.find((p) => p.id === id))
    .filter(Boolean) as PlayerDTO[];

  return (
    <span
      role="cell"
      data-testid={`player-cell-${side.replace(/\s+/g, '-').toLowerCase()}`}
      className={`${MEET_MATCH_CELL.side} flex flex-wrap items-baseline gap-x-1 text-2sm leading-relaxed`}
    >
      {winner ? <WinnerDot className="self-center" /> : null}
      {named.length === 0 ? (
        <span className="text-xs italic text-muted-foreground">No players</span>
      ) : (
        named.map((p, i) => (
          <span key={p.id} className="inline-flex items-baseline">
            {/* BWF presentation ("NAKAMURA Kei") — display-only; the stored
                name, search and exports stay as typed. Pairs join with the
                slash the mock (and every draw sheet) uses. */}
            <span className="text-foreground">
              {p.name ? formatPlayerName(p.name) : '–'}
            </span>
            {i < named.length - 1 ? (
              <span className="px-1 text-muted-foreground">/</span>
            ) : null}
          </span>
        ))
      )}
    </span>
  );
}

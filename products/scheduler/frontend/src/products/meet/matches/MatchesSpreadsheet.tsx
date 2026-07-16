/**
 * Flat-row match editor. No <table>, no card wrapper — each match
 * renders as a flex row with `border-b` only. Column-label row sits
 * above the match rows with the same `px-5` rhythm.
 *
 * Player cells: comma-separated underlined names with a small × in
 * muted grey after each, no pills. An inline "＋ add" link opens the
 * picker dropdown for adding more players.
 *
 * Search/Add-match/Export live in the page-header row owned by
 * `MatchesTab` — those affordances do NOT render here. This component
 * subscribes to the same `?q=` search param as the page header so the
 * URL is the shared source of truth.
 */
import { memo, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { Check, Warning } from '@phosphor-icons/react';
import { Select } from '@scheduler/design-system/components';
import {
  BandedTable,
  ColumnHeaderRow,
  DetailDock,
  MATCH_CELL,
  MATCH_LIST_COLUMNS,
  PickerPopover,
  STATUS_CLASS,
  STATUS_LABEL,
  type BandedTableGroup,
  type MatchListStatus,
} from '../../../components/control-plane';
import { useTournamentStore } from '../../../store/tournamentStore';
import { useMatchStateStore } from '../../../store/matchStateStore';
import { usePlayerMap } from '../../../store/selectors';
import type { MatchDTO, PlayerDTO, RosterGroupDTO } from '../../../api/dto';
import { useSearchParamState, useSearchParamSet } from '../../../hooks/useSearchParamState';
import { useDisruptions } from './useDisruptions';
import { EVENT_LABEL, EVENT_ORDER, isDoublesRank } from '../roster/positionGrid/helpers';
import { MatchDetailPanel } from './MatchDetailPanel';
import { meetMatchStatus } from './meetMatchStatus';
import { maxSeverity, type MatchIssue } from './validateMatch';
import { ConfirmDeleteButton } from '../../../components/ConfirmDeleteButton';
import { getActiveAssignments } from '../../../lib/getActiveAssignments';

/** Side capacity derived from the event rank. Singles = 1, doubles =
 *  2, unknown rank = 2 (let the operator fill it; validation will flag
 *  any oversized state). */
function capacityForRank(rank: string | null | undefined): number {
  if (!rank?.trim()) return 2;
  return isDoublesRank(rank) ? 2 : 1;
}

/** Stable empty-array reference so MatchRow's useMemo deps don't churn
 *  when a match has no disruptions. */
const EMPTY_ISSUES: MatchIssue[] = [];

function playerLabel(p: PlayerDTO, groups: RosterGroupDTO[]): string {
  const school = groups.find((g) => g.id === p.groupId)?.name ?? '?';
  return `${p.name || '(unnamed)'} · ${school}`;
}

export function MatchesSpreadsheet({
  pendingFocusId,
  onFocusConsumed,
}: {
  /** Match ID whose row should auto-focus its event field after
   *  mount. Set by MatchesTab after "+ Add match" so the operator can
   *  pick the rank for the new row without hunting for it. */
  pendingFocusId?: string | null;
  /** Called by the row that consumes the focus directive so the
   *  parent can clear `pendingFocusId`. */
  onFocusConsumed?: () => void;
} = {}) {
  const matches = useTournamentStore((s) => s.matches);
  const players = useTournamentStore((s) => s.players);
  const groups = useTournamentStore((s) => s.groups);
  const updateMatch = useTournamentStore((s) => s.updateMatch);
  const deleteMatch = useTournamentStore((s) => s.deleteMatch);
  const schedule = useTournamentStore((s) => s.schedule);
  const matchStates = useMatchStateStore((s) => s.matchStates);
  const assignedIds = useMemo(
    () => new Set(getActiveAssignments(schedule).map((a) => a.matchId)),
    [schedule],
  );

  // Subscribes to the same URL-backed search the page header writes to.
  const [searchQuery] = useSearchParamState('q', '');
  // Legacy filter params kept for URL backward compatibility — not
  // currently surfaced in any UI; if the user lands with these set, the
  // matches list still respects them.
  const [eventFilter] = useSearchParamSet('event');
  const [schoolFilter] = useSearchParamSet('school');
  const [typeFilter] = useSearchParamSet('type');

  const playerById = usePlayerMap();

  const filteredMatches = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    const eventActive = eventFilter.size > 0;
    const schoolActive = schoolFilter.size > 0;
    const typeActive = typeFilter.size > 0;
    if (!q && !eventActive && !schoolActive && !typeActive) return matches;

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
      return true;
    });
  }, [matches, searchQuery, eventFilter, schoolFilter, typeFilter, playerById]);

  const config = useTournamentStore((s) => s.config);
  const disruptions = useDisruptions();

  // Selected match — a click on a row's background/# cell (not its inline
  // editors) opens the right-docked match DetailPanel. Derived find so a
  // deleted match auto-dismisses the panel. Memoized so a re-render that
  // doesn't touch `matches`/`selectedId` doesn't re-scan the full match
  // array every time.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedMatch = useMemo(
    () => matches.find((m) => m.id === selectedId) ?? null,
    [matches, selectedId],
  );

  // Configured event ranks — derived from `config.rankCounts`. Memoized so every
  // row gets a STABLE `configuredRanks` reference (the React Compiler is not
  // enabled here, so without this the array was rebuilt every render and
  // defeated `MatchRow`'s memo on every keystroke).
  const configuredRanks = useMemo<string[]>(() => {
    const ranks: string[] = [];
    if (config?.rankCounts) {
      for (const [prefix, count] of Object.entries(config.rankCounts)) {
        for (let i = 1; i <= (count ?? 0); i++) ranks.push(`${prefix}${i}`);
      }
    }
    return ranks;
  }, [config?.rankCounts]);

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
      const key = prefix || '—';
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
      const label = key === '—' ? 'Unassigned' : EVENT_LABEL[key]?.full ?? key;
      return {
        key,
        label,
        code: key === '—' ? undefined : key,
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
      {/* @container/table: the column-priority classes in MATCH_CELL query
          THIS wrapper's width, so columns collapse as the detail dock takes
          room — not just when the window shrinks. */}
      <div className="min-h-0 min-w-0 flex-1 overflow-auto @container/table">
        {filteredMatches.length === 0 ? (
          <>
            <ColumnHeaderRow columns={MATCH_LIST_COLUMNS} />
            <div className="px-5 py-10 text-center text-sm text-muted-foreground">
              No matches match the current search.
            </div>
          </>
        ) : (
          <BandedTable
            columns={MATCH_LIST_COLUMNS}
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
                index={matches.indexOf(m)}
                status={meetMatchStatus(m.id, assignedIds, matchStates)}
                players={players}
                groups={groups}
                configuredRanks={configuredRanks}
                issues={issuesFor(m)}
                autoFocus={m.id === pendingFocusId}
                onFocusConsumed={onFocusConsumed}
                onUpdate={updateMatch}
                onDelete={deleteMatch}
              />
            )}
          />
        )}
      </div>
      <DetailDock open={selectedMatch != null}>
        {selectedMatch ? (
          <MatchDetailPanel
            key={selectedMatch.id}
            match={selectedMatch}
            status={meetMatchStatus(selectedMatch.id, assignedIds, matchStates)}
            onClose={() => setSelectedId(null)}
          />
        ) : null}
      </DetailDock>
    </>
  );
}

/* =========================================================================
 * MatchRow — the CELLS of one match row. The row shell (the canonical
 * banded row classes, `group` hover reveals, the disruption accent
 * stripe, click-to-select) is owned by the BandedTable shell in the
 * parent; every inline editor here stops click propagation so editing
 * never opens the match detail panel.
 * ========================================================================= */
// Memoized: with many rows, a search keystroke (or any store write) re-renders
// the parent; without memo every row re-rendered in full. Props are stable
// references (zustand actions, memoized configuredRanks, the EMPTY_ISSUES
// fallback), so unchanged rows now skip re-render.
const MatchRow = memo(function MatchRow({
  match,
  index,
  status,
  players,
  groups,
  configuredRanks,
  issues,
  autoFocus,
  onFocusConsumed,
  onUpdate,
  onDelete,
}: {
  match: MatchDTO;
  index: number;
  status: MatchListStatus;
  players: PlayerDTO[];
  groups: RosterGroupDTO[];
  /** Ranks defined in `config.rankCounts` — the select populates from
   *  this list. Empty array → degrade to free-text input. */
  configuredRanks: string[];
  /** Pre-computed disruption issues for this match from the global
   *  `useDisruptions` feed. Routing through the hook keeps the
   *  per-row flag and the TabBar badge from drifting out of sync. */
  issues: MatchIssue[];
  /** When true on mount, focus the event field. Used by the
   *  "+ Add match" flow to land focus on the new row. */
  autoFocus?: boolean;
  onFocusConsumed?: () => void;
  onUpdate: (id: string, patch: Partial<MatchDTO>) => void;
  onDelete: (id: string) => void;
}) {
  // Ref typed loosely — the event field may render as a Radix Select
  // trigger (button, configured ranks present) or an input (free-text
  // fallback). Both inherit `focus()` from HTMLElement.
  const eventFieldRef = useRef<HTMLButtonElement | HTMLInputElement | null>(null);

  useEffect(() => {
    if (!autoFocus) return;
    eventFieldRef.current?.focus();
    onFocusConsumed?.();
    // The directive is a one-shot; ignore changes to onFocusConsumed
    // after the initial mount (avoids re-firing if the parent
    // changes its callback identity).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoFocus]);

  // The current rank may be (a) blank, (b) one of `configuredRanks`,
  // or (c) a legacy free-text value no longer in the configured list.
  // For (c) we keep the existing value visible in the select via a
  // dedicated "current" option so the operator isn't surprised by
  // their data silently disappearing.
  const currentRank = match.eventRank ?? '';
  const rankInConfigured =
    !currentRank || configuredRanks.includes(currentRank);

  // Per-row disruption surfacing — partner-switch detection, side-count
  // mismatches, cross-side conflicts, stale player references. Issues
  // come from the global `useDisruptions` feed (consumed by the parent),
  // so the per-row Warning icon and the TabBar badge always agree.
  const severity = maxSeverity(issues);
  const sideCapacity = capacityForRank(match.eventRank);

  return (
    <>
      <span
        className={`flex ${MATCH_CELL.warnGutter} shrink-0 items-center justify-center`}
        aria-hidden={issues.length === 0}
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
      <span className={`${MATCH_CELL.number} text-xs text-muted-foreground tabular-nums`}>
        {match.matchNumber ?? index + 1}
      </span>
      {configuredRanks.length > 0 ? (
        // `display: contents` wrapper — layout-transparent, but catches
        // clicks from the Select trigger AND its portaled options (React
        // events bubble through the component tree) so picking an event
        // never opens the row's detail panel.
        <span className="contents" onClick={(e) => e.stopPropagation()}>
          <Select
            triggerRef={eventFieldRef as React.RefObject<HTMLButtonElement>}
            value={currentRank}
            onValueChange={(v) =>
              onUpdate(match.id, { eventRank: v || undefined })
            }
            options={[
              ...configuredRanks.map((r) => ({ value: r, label: r })),
              // Surface legacy/unknown current value so it doesn't vanish.
              ...(!rankInConfigured && currentRank
                ? [{ value: currentRank, label: `${currentRank} (legacy)` }]
                : []),
            ]}
            clearable
            size="sm"
            ariaLabel="Event"
            triggerClassName={`${MATCH_CELL.event} border-transparent px-1.5 py-0.5 text-accent font-semibold sw-num hover:border-border/60 focus:bg-card`}
          />
        </span>
      ) : (
        <input
          ref={eventFieldRef as React.RefObject<HTMLInputElement>}
          value={currentRank}
          onChange={(e) =>
            onUpdate(match.id, { eventRank: e.target.value || undefined })
          }
          onClick={(e) => e.stopPropagation()}
          placeholder="MS1, WD2…"
          aria-label="Event"
          className={[
            MATCH_CELL.event,
            'rounded-sm border border-transparent px-1.5 py-0.5 text-sm font-semibold text-accent sw-num outline-none',
            'transition-colors duration-fast ease-brand',
            'hover:border-border/60 focus:border-accent focus:bg-card',
          ].join(' ')}
        />
      )}
      <PlayerCellEditor
        side="Side A"
        selected={match.sideA ?? []}
        onChange={(ids) => onUpdate(match.id, { sideA: ids })}
        players={players}
        groups={groups}
        capacity={sideCapacity}
        eligibleForRank={match.eventRank}
      />
      <PlayerCellEditor
        side="Side B"
        selected={match.sideB ?? []}
        onChange={(ids) => onUpdate(match.id, { sideB: ids })}
        players={players}
        groups={groups}
        capacity={sideCapacity}
        eligibleForRank={match.eventRank}
      />
      <span
        data-testid={`match-status-${match.id}`}
        className={`${MATCH_CELL.status} text-2xs font-semibold uppercase tracking-[0.08em] ${STATUS_CLASS[status]}`}
      >
        {STATUS_LABEL[status]}
      </span>
      {/* Two-click arm: deleting a match used to take one hover-revealed click,
          with no confirm and no undo (audit F1). */}
      <ConfirmDeleteButton
        label={match.eventRank ? `match ${match.eventRank}` : 'this match'}
        onConfirm={() => onDelete(match.id)}
        className={MATCH_CELL.actionGutter}
        testId={`match-delete-${match.id}`}
      />
    </>
  );
});

/* =========================================================================
 * PlayerCellEditor — comma-separated underlined names with inline × per
 * name. No pills, no wrapping element. "＋ add" link opens the picker
 * dropdown for adding more players.
 * ========================================================================= */
/** Single picker entry — shared between "Eligible" and "All other"
 *  sections of the dropdown to keep the option styling identical. */
function PickerRow({
  player,
  groups,
  selected,
  onClick,
}: {
  player: PlayerDTO;
  groups: RosterGroupDTO[];
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'flex w-full items-center justify-between rounded px-1.5 py-0.5 text-left text-xs',
        'transition-colors duration-fast ease-brand',
        selected ? 'bg-accent/10 text-accent' : 'text-foreground hover:bg-muted/40',
      ].join(' ')}
    >
      <span>{playerLabel(player, groups)}</span>
      {selected ? (
        <Check aria-label="Selected" className="h-3.5 w-3.5 text-accent" />
      ) : null}
    </button>
  );
}

function PlayerCellEditor({
  side,
  selected,
  onChange,
  players,
  groups,
  capacity = 2,
  eligibleForRank,
}: {
  side: string;
  selected: string[];
  onChange: (ids: string[]) => void;
  players: PlayerDTO[];
  groups: RosterGroupDTO[];
  /** Max players this side can hold. 1 = singles event (single-select
   *  semantics, picking a new player replaces the current one,
   *  picker auto-closes); 2 = doubles event (multi-select up to 2).
   *  Default 2 lets the editor work for new rows with no event rank
   *  yet — validation will flag any oversized state. */
  capacity?: number;
  /** When set, the picker surfaces players who hold this rank in
   *  their roster `ranks[]` as a top-of-list "Eligible for {rank}"
   *  section. The rest of the rostered players appear below grouped
   *  by school. Ties the match editor to the Roster page — operators
   *  see who's actually configured for the event they're editing
   *  without having to remember. */
  eligibleForRank?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const cellRef = useRef<HTMLDivElement | null>(null);
  const selectedPlayers = useMemo(
    () =>
      selected
        .map((id) => players.find((p) => p.id === id))
        .filter(Boolean) as PlayerDTO[],
    [selected, players],
  );
  const atCapacity = selected.length >= capacity;

  const toggle = (id: string) => {
    if (selected.includes(id)) {
      // Always allow removal.
      onChange(selected.filter((s) => s !== id));
      return;
    }
    // Adding. Enforce capacity:
    //   • singles (capacity = 1) → single-select: replace existing.
    //     Auto-close the picker after the swap — "decisive" UX since
    //     there's nothing else to pick on this side.
    //   • doubles (capacity = 2) → multi-select up to 2: append if
    //     room, no-op otherwise (operator must remove first). Picker
    //     stays open for the partner pick.
    if (capacity === 1) {
      onChange([id]);
      setOpen(false);
      return;
    }
    if (selected.length < capacity) {
      onChange([...selected, id]);
    }
  };

  // Partition players for the picker:
  //   eligible = players whose roster `ranks[]` includes the match's
  //              event rank. Tied to the Roster page — this is the
  //              "what the previous page says" list.
  //   rest     = everyone else, grouped by school as the fallback.
  // When eligibleForRank is undefined, eligible is empty and the
  // picker behaves like before (all-by-school).
  const eligible = useMemo(() => {
    if (!eligibleForRank) return [] as PlayerDTO[];
    return players.filter((p) => (p.ranks ?? []).includes(eligibleForRank));
  }, [players, eligibleForRank]);

  const restByGroup = useMemo(() => {
    const eligibleIds = new Set(eligible.map((p) => p.id));
    const by = new Map<string, PlayerDTO[]>();
    for (const p of players) {
      if (eligibleIds.has(p.id)) continue;
      if (!by.has(p.groupId)) by.set(p.groupId, []);
      by.get(p.groupId)!.push(p);
    }
    return by;
  }, [players, eligible]);

  return (
    // Clicks on the cell's INTERACTIVE content (name buttons, ×, ＋ add,
    // the picker dropdown) must never bubble to the row's open-detail-panel
    // handler — but the cell wrapper is much wider than its content, and a
    // click on its EMPTY space is a row-background click and SHOULD open
    // the panel (SP-D7 live finding: a 536px-wide swallow-all made most of
    // the row read as click-dead). While the picker is open, every click in
    // the cell is editor interaction.
    <div
      ref={cellRef}
      data-testid={`player-cell-${side.replace(/\s+/g, '-').toLowerCase()}`}
      className={`relative ${MATCH_CELL.side}`}
      onClick={(e: ReactMouseEvent<HTMLElement>) => {
        const target = e.target as HTMLElement;
        if (open || target.closest('button, input, [data-player-picker]')) {
          e.stopPropagation();
        }
      }}
    >
      <PickerPopover open={open} onOpenChange={setOpen}>
      <PickerPopover.Anchor asChild>
      <div className="flex flex-wrap items-baseline gap-x-1 text-sm leading-relaxed">
        {selectedPlayers.length === 0 ? (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="text-xs italic text-muted-foreground transition-colors duration-fast ease-brand hover:text-accent"
          >
            ＋ add player
          </button>
        ) : (
          selectedPlayers.map((p, i) => {
            const groupName = groups.find((g) => g.id === p.groupId)?.name ?? '';
            // Doubles partners are (almost) always same-school — repeating
            // the school per name is noise. When every selected player
            // shares one school, show it once, after the last name.
            const uniformSchool =
              selectedPlayers.length > 1 &&
              selectedPlayers.every((sp) => sp.groupId === selectedPlayers[0].groupId);
            const showSchool =
              groupName !== '' && (!uniformSchool || i === selectedPlayers.length - 1);
            return (
            <span key={p.id} className="inline-flex items-baseline">
              <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                className="text-foreground transition-colors duration-fast ease-brand hover:text-accent"
                title={`Click to edit ${side}`}
              >
                {p.name || '—'}
                {showSchool ? (
                  <span className="ml-1 text-2xs text-muted-foreground">{groupName}</span>
                ) : null}
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  toggle(p.id);
                }}
                aria-label={`Remove ${p.name}`}
                // Zero width at rest so the trailing comma hugs the name
                // ("Kim, Novak" not "Kim , Novak"); expands on row hover.
                className="w-0 overflow-hidden text-muted-foreground opacity-0 transition-opacity duration-fast ease-brand hover:text-destructive group-hover:ml-0.5 group-hover:w-auto group-hover:opacity-100"
              >
                ×
              </button>
              {i < selectedPlayers.length - 1 ? (
                <span className="text-muted-foreground">,</span>
              ) : null}
            </span>
            );
          })
        )}
        {selectedPlayers.length > 0 && !atCapacity ? (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-label={`Add player to ${side}`}
            className="text-xs italic text-muted-foreground transition-colors duration-fast ease-brand hover:text-accent"
          >
            ＋ add
          </button>
        ) : null}
      </div>
      </PickerPopover.Anchor>
      <PickerPopover.Panel data-player-picker guardRef={cellRef}>
        <>
          {/* Eligible-for-rank section — these are the players the
              Roster page has configured for this match's event. Top
              of the picker so the natural candidate is one click
              away. Empty when no rank set or none are configured. */}
          {eligible.length > 0 ? (
            <div className="mb-1">
              <div className="mb-0.5 flex items-baseline justify-between px-1 text-3xs font-semibold uppercase tracking-wider text-accent">
                <span>Eligible for {eligibleForRank}</span>
                <span className="text-muted-foreground tabular-nums">
                  {eligible.length}
                </span>
              </div>
              <div className="space-y-0.5">
                {eligible.map((p) => (
                  <PickerRow
                    key={p.id}
                    player={p}
                    groups={groups}
                    selected={selected.includes(p.id)}
                    onClick={() => toggle(p.id)}
                  />
                ))}
              </div>
            </div>
          ) : null}

          {/* "All other rostered" section — partner-switch flexibility
              for cases where a non-eligible player still needs to be
              assigned (mid-tournament reassignments, edge cases). The
              validator will flag the resulting `stale-rank` warning
              so the operator knows they've stepped outside the
              configured roster. */}
          {restByGroup.size > 0 ? (
            <div>
              {eligible.length > 0 ? (
                <div className="mb-0.5 px-1 text-3xs font-semibold uppercase tracking-wider text-muted-foreground">
                  All other rostered
                </div>
              ) : null}
              {[...restByGroup.entries()].map(([groupId, list]) => {
                const g = groups.find((gr) => gr.id === groupId);
                return (
                  <div key={groupId} className="mb-1 last:mb-0">
                    <div className="mb-0.5 px-1 text-3xs font-semibold uppercase tracking-wider text-muted-foreground">
                      {g?.name ?? 'Unassigned'}
                    </div>
                    <div className="space-y-0.5">
                      {list.map((p) => (
                        <PickerRow
                          key={p.id}
                          player={p}
                          groups={groups}
                          selected={selected.includes(p.id)}
                          onClick={() => toggle(p.id)}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : null}

          {players.length === 0 ? (
            <div className="px-1 py-2 text-xs text-muted-foreground">
              No players. Add some in the Roster tab.
            </div>
          ) : null}
        </>
      </PickerPopover.Panel>
      </PickerPopover>
    </div>
  );
}

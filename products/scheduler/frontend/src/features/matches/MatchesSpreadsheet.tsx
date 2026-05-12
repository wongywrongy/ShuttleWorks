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
import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Warning } from '@phosphor-icons/react';
import { useAppStore } from '../../store/appStore';
import { usePlayerMap } from '../../store/selectors';
import type { MatchDTO, PlayerDTO, RosterGroupDTO } from '../../api/dto';
import { useSearchParamState, useSearchParamSet } from '../../hooks/useSearchParamState';
import { useDisruptions } from '../../hooks/useDisruptions';
import { EVENT_LABEL, isDoublesRank } from '../roster/positionGrid/helpers';
import { maxSeverity, type MatchIssue } from './validateMatch';

function eventTintForPrefix(rank: string | null | undefined): string {
  if (!rank) return '';
  const prefix = rank.match(/^[A-Z]+/)?.[0] ?? '';
  return EVENT_LABEL[prefix]?.body ?? '';
}

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
  const matches = useAppStore((s) => s.matches);
  const players = useAppStore((s) => s.players);
  const groups = useAppStore((s) => s.groups);
  const updateMatch = useAppStore((s) => s.updateMatch);
  const deleteMatch = useAppStore((s) => s.deleteMatch);

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

  const config = useAppStore((s) => s.config);
  const disruptions = useDisruptions();

  // Configured event ranks — derived from `config.rankCounts`. These
  // populate the per-row event select so the operator picks from
  // valid options instead of typing free text. Empty when no
  // tournament config exists yet (e.g. brand new install) — the
  // select degrades to free-text input in that case.
  const configuredRanks = useMemo(() => {
    if (!config?.rankCounts) return [] as string[];
    const out: string[] = [];
    for (const [prefix, count] of Object.entries(config.rankCounts)) {
      for (let i = 1; i <= (count ?? 0); i++) out.push(`${prefix}${i}`);
    }
    return out;
  }, [config?.rankCounts]);

  if (matches.length === 0) {
    return (
      <div className="px-5 py-10 text-center text-sm text-muted-foreground">
        No matches yet. Add one manually or use auto-generate above.
      </div>
    );
  }
  if (filteredMatches.length === 0) {
    return (
      <>
        <ColumnHeaderRow />
        <div className="px-5 py-10 text-center text-sm text-muted-foreground">
          No matches match the current search.
        </div>
      </>
    );
  }

  return (
    <>
      <ColumnHeaderRow />
      {filteredMatches.map((m) => (
        <MatchRow
          key={m.id}
          match={m}
          index={matches.indexOf(m)}
          players={players}
          groups={groups}
          configuredRanks={configuredRanks}
          issues={disruptions.byMatch.get(m.id) ?? EMPTY_ISSUES}
          autoFocus={m.id === pendingFocusId}
          onFocusConsumed={onFocusConsumed}
          onUpdate={updateMatch}
          onDelete={deleteMatch}
        />
      ))}
    </>
  );
}

/* =========================================================================
 * ColumnHeaderRow — `padding: 6px 20px`, border-b only, no background.
 * ========================================================================= */
function ColumnHeaderRow() {
  return (
    <div className="flex items-center gap-3 border-b-2 border-border bg-muted/40 px-5 py-1.5 text-2xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
      <span className="w-4" aria-hidden />
      <span className="w-8">#</span>
      <span className="w-20">Event</span>
      <span className="min-w-0 flex-[3]">Side A</span>
      <span className="min-w-0 flex-[3]">Side B</span>
      <span className="w-14">Slots</span>
      <span className="w-8" aria-hidden />
    </div>
  );
}

/* =========================================================================
 * MatchRow — `padding: 0 20px`, `min-height: 44px`, border-b only.
 * ========================================================================= */
function MatchRow({
  match,
  index,
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
  const [durationDraft, setDurationDraft] = useState(
    String(match.durationSlots ?? 1),
  );
  // Ref typed loosely — the event field may render as a select
  // (configured ranks present) or an input (free-text fallback).
  // Both inherit `focus()` from HTMLElement.
  const eventFieldRef = useRef<HTMLSelectElement | HTMLInputElement | null>(null);

  useEffect(
    () => setDurationDraft(String(match.durationSlots ?? 1)),
    [match.durationSlots],
  );

  useEffect(() => {
    if (!autoFocus) return;
    eventFieldRef.current?.focus();
    onFocusConsumed?.();
    // The directive is a one-shot; ignore changes to onFocusConsumed
    // after the initial mount (avoids re-firing if the parent
    // changes its callback identity).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoFocus]);

  const commitDuration = () => {
    const d = Math.max(1, Number(durationDraft) || 1);
    if (d !== match.durationSlots) onUpdate(match.id, { durationSlots: d });
  };

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

  const accentStripe =
    severity === 'error'
      ? 'shadow-[inset_3px_0_0_hsl(var(--destructive))]'
      : severity === 'warning'
        ? 'shadow-[inset_3px_0_0_hsl(var(--status-warning))]'
        : '';

  return (
    <div
      data-testid={`match-row-${match.id}`}
      data-severity={severity ?? 'none'}
      className={[
        'group flex min-h-[44px] items-center gap-3 border-b border-border px-5',
        'transition-colors duration-fast ease-brand hover:bg-muted/30',
        accentStripe,
      ].join(' ')}
    >
      <span
        className="flex w-4 shrink-0 items-center justify-center"
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
      <span className="w-8 text-xs text-muted-foreground tabular-nums">
        {match.matchNumber ?? index + 1}
      </span>
      {configuredRanks.length > 0 ? (
        <select
          ref={eventFieldRef as React.RefObject<HTMLSelectElement>}
          value={currentRank}
          onChange={(e) =>
            onUpdate(match.id, { eventRank: e.target.value || undefined })
          }
          aria-label="Event rank"
          className={[
            'w-20 rounded-sm border border-transparent px-1.5 py-0.5 text-sm font-mono tabular-nums outline-none',
            'transition-colors duration-fast ease-brand cursor-pointer',
            'hover:border-border/60 focus:border-accent focus:bg-card',
            eventTintForPrefix(match.eventRank),
          ].join(' ')}
        >
          <option value="">—</option>
          {configuredRanks.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
          {/* Legacy / unknown current value — surface it so it doesn't
              silently vanish from the dropdown. */}
          {!rankInConfigured && currentRank ? (
            <option value={currentRank}>{currentRank} (legacy)</option>
          ) : null}
        </select>
      ) : (
        <input
          ref={eventFieldRef as React.RefObject<HTMLInputElement>}
          value={currentRank}
          onChange={(e) =>
            onUpdate(match.id, { eventRank: e.target.value || undefined })
          }
          placeholder="MS1, WD2…"
          aria-label="Event rank"
          className={[
            'w-20 rounded-sm border border-transparent px-1.5 py-0.5 text-sm font-mono tabular-nums outline-none',
            'transition-colors duration-fast ease-brand',
            'hover:border-border/60 focus:border-accent focus:bg-card',
            eventTintForPrefix(match.eventRank),
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
      <input
        type="number"
        min={1}
        value={durationDraft}
        onChange={(e) => setDurationDraft(e.target.value)}
        onBlur={commitDuration}
        className="w-14 rounded-sm border border-transparent bg-transparent px-1.5 py-0.5 text-sm tabular-nums outline-none transition-colors duration-fast ease-brand hover:border-border/60 focus:border-accent focus:bg-card"
      />
      <button
        type="button"
        onClick={() => onDelete(match.id)}
        className="w-8 rounded-sm p-1 text-muted-foreground/60 opacity-0 transition-opacity duration-fast ease-brand hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
        title="Delete match"
        aria-label="Delete match"
      >
        ×
      </button>
    </div>
  );
}

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
  const ref = useRef<HTMLDivElement | null>(null);
  const selectedPlayers = useMemo(
    () =>
      selected
        .map((id) => players.find((p) => p.id === id))
        .filter(Boolean) as PlayerDTO[],
    [selected, players],
  );
  const atCapacity = selected.length >= capacity;

  useEffect(() => {
    if (!open) return;
    const click = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', click);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('mousedown', click);
      document.removeEventListener('keydown', key);
    };
  }, [open]);

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
    <div ref={ref} className="relative min-w-0 flex-[3]">
      <div className="flex flex-wrap items-baseline gap-x-1 text-sm leading-relaxed">
        {selectedPlayers.length === 0 ? (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="text-xs italic text-muted-foreground underline decoration-dotted underline-offset-2 hover:text-foreground"
          >
            {side}…
          </button>
        ) : (
          selectedPlayers.map((p, i) => (
            <span key={p.id} className="inline-flex items-baseline">
              <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                className="text-foreground underline decoration-dotted underline-offset-2 hover:decoration-solid"
                title={`Click to edit ${side}`}
              >
                {p.name || '—'}
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  toggle(p.id);
                }}
                aria-label={`Remove ${p.name}`}
                className="ml-0.5 text-muted-foreground/60 hover:text-destructive"
              >
                ×
              </button>
              {i < selectedPlayers.length - 1 ? (
                <span className="text-muted-foreground">,</span>
              ) : null}
            </span>
          ))
        )}
        {selectedPlayers.length > 0 && !atCapacity ? (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-label={`Add player to ${side}`}
            className="text-xs text-muted-foreground/70 underline decoration-dotted underline-offset-2 hover:text-foreground"
          >
            ＋ add
          </button>
        ) : null}
      </div>
      {open ? (
        <div className="motion-enter absolute left-0 top-full z-overlay mt-1 max-h-64 w-64 overflow-y-auto rounded border border-border bg-popover p-2 text-popover-foreground shadow-lg">
          {/* Eligible-for-rank section — these are the players the
              Roster page has configured for this match's event. Top
              of the picker so the natural candidate is one click
              away. Empty when no rank set or none are configured. */}
          {eligible.length > 0 ? (
            <div className="mb-1">
              <div className="mb-0.5 flex items-baseline justify-between px-1 text-[10px] font-semibold uppercase tracking-wider text-accent">
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
                <div className="mb-0.5 px-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  All other rostered
                </div>
              ) : null}
              {[...restByGroup.entries()].map(([groupId, list]) => {
                const g = groups.find((gr) => gr.id === groupId);
                return (
                  <div key={groupId} className="mb-1 last:mb-0">
                    <div className="mb-0.5 px-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
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
        </div>
      ) : null}
    </div>
  );
}

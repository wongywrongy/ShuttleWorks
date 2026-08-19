/**
 * PlayerAvailabilityField / PlayerEventsField — the two roster field blocks
 * that render in BOTH the roster pane and the Matches pane's player cards
 * (SP-D7 S4). One implementation, so an availability or event edit made on
 * either surface writes the CANONICAL roster record via `updatePlayer`.
 *
 * Neither carries a label of its own: whichever pane hosts it names the
 * `DetailPanel.Section` it sits in. Four competing label recipes across
 * thirteen panels is the thing the section grammar exists to end.
 */
import { useState } from 'react';
import type { PlayerDTO } from '../../../api/dto';
import { useTournamentStore } from '../../../store/tournamentStore';
import {
  AvailabilityControl,
  EventPicker,
  type EventPickerOption,
} from '../../../components/control-plane';
import { useRankAssignment } from './positionGrid/useRankAssignment';
import { useRankValidation } from './hooks/useRankValidation';
import { useEventResultsGuard } from './hooks/useEventResultsGuard';
import { isDoublesRank } from './positionGrid/helpers';

export function PlayerAvailabilityField({ player }: { player: PlayerDTO }) {
  const updatePlayer = useTournamentStore((s) => s.updatePlayer);
  const config = useTournamentStore((s) => s.config);
  return (
    <AvailabilityControl
      value={player.availability ?? []}
      dayStart={config?.dayStart ?? '09:00'}
      dayEnd={config?.dayEnd ?? '17:00'}
      onChange={(availability) => updatePlayer(player.id, { availability })}
    />
  );
}

const prefixOf = (code: string) => code.replace(/\d+$/, '') || code;

export function PlayerEventsField({ player }: { player: PlayerDTO }) {
  const { assignRank, unassignRank } = useRankAssignment();
  const { availableRanks, getPlayersWithRank } = useRankValidation(
    player.groupId ?? null,
    player.id,
  );
  const hasResults = useEventResultsGuard();
  // PICK-3: an occupied singles slot is a REPLACE and must say so before it
  // happens. The click parks here (the checkbox stays unticked — `entered`
  // has not changed) until the operator confirms or cancels.
  const [pendingReplace, setPendingReplace] = useState<{
    rank: string;
    names: string;
  } | null>(null);
  const entered = player.ranks ?? [];

  // Grouped by the RAW event prefix, never by a fixed discipline table: a
  // meet's events are its own vocabulary, and the previous chrome offered
  // only MS/WS/MD/WD/XD categories — so a category a meet had not configured
  // expanded to an EMPTY body with no way to enter the player (defect D8),
  // and an operator-defined code had no home at all.
  const options: EventPickerOption[] = Object.entries(availableRanks).flatMap(
    ([prefix, category]) => {
      const rows = category.ranks.map((r) => {
        const doubles = isDoublesRank(r.value);
        const full = r.disabled; // occupancy at capacity, current player excluded
        // PICK-4 (owner-ruled full form): a recorded result locks the row
        // in BOTH directions — unchecking the player's own entry, and a
        // replace that would displace an occupant whose result it is.
        const locked =
          (entered.includes(r.value) && hasResults(player.id, r.value)) ||
          (!doubles &&
            full &&
            getPlayersWithRank(r.value).some((p) => hasResults(p.id, r.value)));
        return {
          id: r.value,
          code: r.value,
          discipline: prefix,
          // FULL slots read occupied (muted, occupant searchable). A
          // half-open doubles seat is still an OPEN slot — its occupant
          // shows via `meta` without the occupied treatment.
          occupiedBy: full ? r.assignedTo : undefined,
          meta: locked
            ? 'result recorded · locked'
            : full
              ? undefined
              : r.assignedTo,
          // A full DOUBLES seat is unpickable; a taken SINGLES seat stays
          // pickable but routes through the explicit replace confirm.
          disabled: (full && doubles) || locked,
        };
      });
      // PICK-2: open slots first, then occupied — stable within each half.
      return [
        ...rows.filter((r) => r.occupiedBy == null),
        ...rows.filter((r) => r.occupiedBy != null),
      ];
    },
  );
  // A rank the config no longer defines is still ON the player: offer it so
  // it stays visible and removable instead of becoming an invisible orphan.
  for (const code of entered) {
    if (options.some((o) => o.id === code)) continue;
    options.push({
      id: code,
      code,
      discipline: prefixOf(code),
      meta: 'legacy',
    });
  }

  if (options.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        Configure positions in Configuration to assign events.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      {pendingReplace ? (
        <div
          data-testid="replace-confirm"
          className="flex flex-wrap items-center gap-1.5 rounded-sm border border-border bg-muted/40 px-2 py-1.5 text-xs text-foreground"
        >
          <span className="min-w-0 flex-1">
            Replace {pendingReplace.names} in{' '}
            <span className="font-semibold sw-num">{pendingReplace.rank}</span>?
          </span>
          <button
            type="button"
            data-testid="replace-confirm-yes"
            onClick={() => {
              assignRank(player.groupId, player.id, pendingReplace.rank);
              setPendingReplace(null);
            }}
            className="rounded-sm bg-accent px-2 py-0.5 text-xs font-medium text-accent-ink shadow-glow transition-[filter] duration-fast ease-brand hover:brightness-110"
          >
            Replace
          </button>
          <button
            type="button"
            onClick={() => setPendingReplace(null)}
            className="rounded-sm border border-border px-2 py-0.5 text-xs hover:bg-muted/40"
          >
            Cancel
          </button>
        </div>
      ) : null}
      <EventPicker
        multiple
        options={options}
        ariaLabel="Events"
        testId="player-events-picker"
        value={entered}
        selectedChips
        collapsedGroups
        defaultOpenGroups={[...new Set(entered.map(prefixOf))]}
        onChange={(next) => {
          // Exactly one option changes per interaction, so this is an add or a
          // remove — never both. Routing each through `useRankAssignment` keeps
          // the singles-displacement invariant in its one home.
          const added = next.find((r) => !entered.includes(r));
          if (added) {
            const occupants = getPlayersWithRank(added);
            if (!isDoublesRank(added) && occupants.length > 0) {
              setPendingReplace({
                rank: added,
                names: occupants.map((p) => p.name || '(unnamed)').join(', '),
              });
              return;
            }
            assignRank(player.groupId, player.id, added);
            return;
          }
          const removed = entered.find((r) => !next.includes(r));
          if (removed) {
            // PICK-4 backstop on the write path — the row and its chip are
            // already disabled, but the invariant lives here, not in CSS.
            if (hasResults(player.id, removed)) return;
            unassignRank(player.id, removed);
          }
        }}
      />
    </div>
  );
}

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
import type { PlayerDTO } from '../../../api/dto';
import { useTournamentStore } from '../../../store/tournamentStore';
import {
  AvailabilityControl,
  EventPicker,
  type EventPickerOption,
} from '../../../components/control-plane';
import { useRankAssignment } from './positionGrid/useRankAssignment';
import { useRankValidation } from './hooks/useRankValidation';
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

export function PlayerEventsField({ player }: { player: PlayerDTO }) {
  const { assignRank, unassignRank } = useRankAssignment();
  const { availableRanks } = useRankValidation(player.groupId ?? null, player.id);
  const entered = player.ranks ?? [];

  // Grouped by the RAW event prefix, never by a fixed discipline table: a
  // meet's events are its own vocabulary, and the previous chrome offered
  // only MS/WS/MD/WD/XD categories — so a category a meet had not configured
  // expanded to an EMPTY body with no way to enter the player (defect D8),
  // and an operator-defined code had no home at all.
  const options: EventPickerOption[] = Object.entries(availableRanks).flatMap(
    ([prefix, category]) =>
      category.ranks.map((r) => ({
        id: r.value,
        code: r.value,
        discipline: prefix,
        // A full DOUBLES seat is unpickable; a taken SINGLES seat stays
        // pickable because assigning displaces the current holder — which
        // is exactly what `meta` names.
        disabled: r.disabled && isDoublesRank(r.value),
        meta: r.assignedTo,
      })),
  );
  // A rank the config no longer defines is still ON the player: offer it so
  // it stays visible and removable instead of becoming an invisible orphan.
  for (const code of entered) {
    if (options.some((o) => o.id === code)) continue;
    options.push({
      id: code,
      code,
      discipline: code.replace(/\d+$/, '') || code,
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
    <EventPicker
      multiple
      options={options}
      ariaLabel="Events"
      testId="player-events-picker"
      value={entered}
      onChange={(next) => {
        // Exactly one option changes per interaction, so this is an add or a
        // remove — never both. Routing each through `useRankAssignment` keeps
        // the singles-displacement invariant in its one home.
        const added = next.find((r) => !entered.includes(r));
        if (added) {
          assignRank(player.groupId, player.id, added);
          return;
        }
        const removed = entered.find((r) => !next.includes(r));
        if (removed) unassignRank(player.id, removed);
      }}
    />
  );
}

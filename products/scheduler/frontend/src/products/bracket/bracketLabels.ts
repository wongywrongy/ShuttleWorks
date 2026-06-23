/**
 * Pure label helpers shared by the bracket Draw / Live surfaces.
 *
 * ``sideLabel`` resolves a play-unit side to operator-readable names:
 * confirmed participants when the side is set, the feeder reference
 * ("Winner of MS-R0-1") while the upstream match is unplayed, or
 * "Bye" for a structural bye slot.
 */
import type { PlayUnitDTO } from '../../api/bracketDto';

export function sideLabel(
  side: string[] | null,
  slot: { participant_id: string | null; feeder_play_unit_id: string | null },
  nameById: Record<string, string>,
): string {
  if (side && side.length > 0) {
    return side.map((id) => nameById[id] ?? id).join(' / ');
  }
  if (slot.participant_id === '__BYE__' || slot.participant_id === null) {
    if (slot.feeder_play_unit_id) {
      return `Winner of ${slot.feeder_play_unit_id}`;
    }
    return 'Bye';
  }
  return nameById[slot.participant_id] ?? slot.participant_id;
}

export function playUnitSideLabels(
  pu: PlayUnitDTO,
  nameById: Record<string, string>,
): { a: string; b: string } {
  return {
    a: sideLabel(pu.side_a, pu.slot_a, nameById),
    b: sideLabel(pu.side_b, pu.slot_b, nameById),
  };
}

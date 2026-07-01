/**
 * Pure derivations for the read-only bracket display. No rendering, no API —
 * just functions over a polled BracketTournamentDTO so the views stay thin
 * and the logic is unit-tested in isolation.
 */
import type {
  BracketTournamentDTO,
  PlayUnitDTO,
  Participant,
} from '../../../api/bracketDto';

/** Resolve a play-unit side to a participant display name. Prefers the
 *  direct slot participant id, falls back to the resolved member ids
 *  (`side_a`/`side_b`), and returns an em dash when the slot is still a
 *  feeder / unfilled. */
export function sideLabel(
  pu: PlayUnitDTO,
  side: 'a' | 'b',
  participants: Participant[],
): string {
  const slot = side === 'a' ? pu.slot_a : pu.slot_b;
  const direct = side === 'a' ? pu.side_a : pu.side_b;
  if (slot.participant_id) {
    const p = participants.find((x) => x.id === slot.participant_id);
    if (p) return p.name;
  }
  if (direct && direct.length) {
    return direct
      .map((id) => participants.find((x) => x.id === id)?.name ?? id)
      .join(' / ');
  }
  return '—';
}

export interface LiveRow {
  puId: string;
  court: number;
  sideA: string;
  sideB: string;
  status: 'on-court' | 'called';
}

/** The bracket matches currently on court (started) or called (assigned,
 *  not yet started), joined to their play_units + participant names and
 *  sorted by court. Finished assignments are excluded. */
export function liveMatches(data: BracketTournamentDTO): LiveRow[] {
  const puById = new Map(data.play_units.map((u) => [u.id, u]));
  return data.assignments
    .filter((a) => !a.finished)
    .map((a): LiveRow | null => {
      const pu = puById.get(a.play_unit_id);
      if (!pu) return null;
      return {
        puId: pu.id,
        court: a.court_id,
        sideA: sideLabel(pu, 'a', data.participants),
        sideB: sideLabel(pu, 'b', data.participants),
        status: a.started ? 'on-court' : 'called',
      };
    })
    .filter((r): r is LiveRow => r !== null)
    .sort((x, y) => x.court - y.court);
}

/** The champion of an event: the winner of its final-round play_unit, when
 *  that round is a single decided match. Returns the participant name, or
 *  null when the event isn't a single-elimination final / isn't decided. */
export function eventChampion(
  data: BracketTournamentDTO,
  eventId: string,
): string | null {
  const event = data.events.find((e) => e.id === eventId);
  const finalRound = event?.rounds.at(-1);
  if (!finalRound || finalRound.length !== 1) return null;
  const puId = finalRound[0];
  const result = data.results.find((r) => r.play_unit_id === puId);
  if (!result || result.winner_side === 'none') return null;
  const pu = data.play_units.find((u) => u.id === puId);
  if (!pu) return null;
  return sideLabel(pu, result.winner_side === 'A' ? 'a' : 'b', data.participants);
}

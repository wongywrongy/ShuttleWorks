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
import { assignLanes } from '../publicDisplay/courtLanes';

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
  status: 'on-court' | 'next';
}

/** What a spectator can see happening: the bracket matches on court right
 *  now, plus the one match each court plays next. Finished assignments are
 *  excluded, and so is everything deeper in a court's queue.
 *
 *  This used to return EVERY unfinished assignment and label the unstarted
 *  ones 'called' — so a freshly generated draw rendered its whole first round
 *  (52 cards, on the audited workspace) as calling to court. A bracket
 *  assignment carries no called state (`AssignmentDTO` has `started` /
 *  `finished` and nothing between), so 'called' was never a fact about the
 *  data; the honest live set is on-court plus imminent.
 *
 *  Lane assignment is the board's own `assignLanes` — the same live-gated
 *  Now/Next/Later rule the meet board's courts run on, so both boards agree
 *  on what "next" means. */
export function liveMatches(data: BracketTournamentDTO): LiveRow[] {
  const puById = new Map(data.play_units.map((u) => [u.id, u]));
  const open = data.assignments.filter((a) => !a.finished);
  const started = new Set(open.filter((a) => a.started).map((a) => a.play_unit_id));
  const lanes = assignLanes(
    open.map((a) => ({ id: a.play_unit_id, court: a.court_id, plannedSlot: a.slot_id })),
    started,
  );
  return open
    .map((a): LiveRow | null => {
      const pu = puById.get(a.play_unit_id);
      const lane = lanes.get(a.play_unit_id);
      if (!pu || (lane !== 'now' && lane !== 'next')) return null;
      return {
        puId: pu.id,
        court: a.court_id,
        sideA: sideLabel(pu, 'a', data.participants),
        sideB: sideLabel(pu, 'b', data.participants),
        status: lane === 'now' ? 'on-court' : 'next',
      };
    })
    .filter((r): r is LiveRow => r !== null)
    .sort((x, y) => x.court - y.court || (x.status === y.status ? 0 : x.status === 'on-court' ? -1 : 1));
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

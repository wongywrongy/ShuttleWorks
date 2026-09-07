/**
 * Pure derivations for the read-only bracket display. No rendering, no API —
 * just functions over a polled BracketTournamentDTO so the views stay thin
 * and the logic is unit-tested in isolation.
 */
import type {
  BracketSetScore,
  BracketTournamentDTO,
  PlayUnitDTO,
  Participant,
} from '../../../api/bracketDto';
import { formatSideCondensed, sideFromWire, type Side } from '../../../platform/domain/sides';

/** The one participant-per-line label the "To be decided" sentinel a board
 *  reader (`isImminentMatch` below) matches against. Kept as a named export
 *  so a caller never has to spell the sides.ts label text itself. */
export const UNDETERMINED_SIDE_LABEL = 'To be decided';

/** Build a `Side` (match-card contract §2.1 / state-and-formatting §6.1)
 *  from a bracket play-unit. The wire's own structured `sides` wins where it
 *  is present (v3 package 29: a doubles pair arrives as TWO persons, and a
 *  pair one member short as `pending_member`); the slot/direct-id derivation
 *  below is the fallback for a payload minted before that field. A resolved
 *  slot participant wins over the direct member list; an unfilled slot with
 *  no direct members is `undetermined` — never a raw `'–'` (D14). */
function sideFromPlayUnit(
  pu: PlayUnitDTO,
  side: 'a' | 'b',
  participants: Participant[],
): Side {
  const wire = pu.sides?.[side === 'a' ? 0 : 1];
  if (wire) return sideFromWire(wire);
  const slot = side === 'a' ? pu.slot_a : pu.slot_b;
  const direct = side === 'a' ? pu.side_a : pu.side_b;
  if (slot.participant_id) {
    const p = participants.find((x) => x.id === slot.participant_id);
    if (p) {
      return { persons: [{ id: p.id, name: p.name }], unresolved: null, seed: null, participantKey: p.id };
    }
  }
  if (direct && direct.length) {
    return {
      persons: direct.map((id) => ({ id, name: participants.find((x) => x.id === id)?.name ?? id })),
      unresolved: null,
      seed: null,
      participantKey: direct.join('|'),
    };
  }
  return { persons: [], unresolved: { kind: 'undetermined' }, seed: null, participantKey: null };
}

/** Resolve a play-unit side to a display string at the board's CONDENSED
 *  density (match-card §3.2): one line, ' / '-joined, using the fixed
 *  unresolved-side label ("To be decided") rather than a raw em dash. */
export function sideLabel(
  pu: PlayUnitDTO,
  side: 'a' | 'b',
  participants: Participant[],
): string {
  return formatSideCondensed(sideFromPlayUnit(pu, side, participants));
}

export interface LiveRow {
  puId: string;
  court: number;
  sideA: string;
  sideB: string;
  status: 'on-court' | 'next' | 'conflict' | 'empty';
  matchRef?: string;
  /** The recorded games for this play unit, when the Bracket engine runs in
   *  Sets mode and a result has been entered. The venue board renders real
   *  scores or none — it never synthesises one (match-card §4.4). Empty
   *  where the result is absent, Simple-mode, or carries no sets. */
  sets: BracketSetScore[];
  /** Whether both sides resolved to real names. The optional Next preview
   *  is omitted when this is false, rather than putting "To be decided"
   *  (or worse, a feeder reference) on the wall. */
  resolved: boolean;
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
  const setsByPuId = new Map(
    data.results.map((r) => [r.play_unit_id, r.score?.sets ?? []]),
  );
  const open = data.assignments.filter((a) => !a.finished);
  const byCourt = new Map<number, typeof open>();
  for (const assignment of open) {
    const list = byCourt.get(assignment.court_id) ?? [];
    list.push(assignment);
    byCourt.set(assignment.court_id, list);
  }
  const rows: LiveRow[] = [];
  for (const court of [...byCourt.keys()].sort((a, b) => a - b)) {
    const assignments = (byCourt.get(court) ?? []).sort((a, b) => a.slot_id - b.slot_id || a.play_unit_id.localeCompare(b.play_unit_id));
    const playing = assignments.filter((a) => a.started);
    const visible = playing.length > 1
      ? playing.map((assignment) => ({ assignment, status: 'conflict' as const }))
      : playing.length === 1
        ? [{ assignment: playing[0], status: 'on-court' as const }, ...(assignments.filter((a) => !a.started).slice(0, 1).map((assignment) => ({ assignment, status: 'next' as const })))]
        : assignments.slice(0, 1).map((assignment) => ({ assignment, status: 'next' as const }));
    for (const { assignment, status } of visible) {
      const pu = puById.get(assignment.play_unit_id);
      if (!pu) continue;
      const sideA = sideLabel(pu, 'a', data.participants);
      const sideB = sideLabel(pu, 'b', data.participants);
      rows.push({
        puId: pu.id,
        court: assignment.court_id,
        sideA,
        sideB,
        status,
        matchRef: assignment.play_unit_id,
        sets: setsByPuId.get(pu.id) ?? [],
        resolved:
          sideA !== UNDETERMINED_SIDE_LABEL && sideB !== UNDETERMINED_SIDE_LABEL,
      });
    }
  }
  return rows;
}

/** "Final" / "Semifinal" / "Quarterfinal" / "Round N" for a round position.
 *
 *  A board-local twin of the operator DrawView's private `roundLabel` — five
 *  lines, versus exporting from a 1100-line file in another product and
 *  taking a cross-product edge for it. */
export function roundLabel(roundIndex: number, roundCount: number): string {
  const fromEnd = roundCount - 1 - roundIndex;
  if (fromEnd === 0) return 'Final';
  if (fromEnd === 1) return 'Semifinal';
  if (fromEnd === 2) return 'Quarterfinal';
  return `Round ${roundIndex + 1}`;
}

/** Whether the board has nothing left to show as live: something has been
 *  decided and no assigned match is still open. Used to pick the opening
 *  view — a finished tournament opening on Live reads as "not started".
 *
 *  A pause between rounds (everything assigned so far is played, the next
 *  round not yet scheduled) reads the same and opens on Results too, which is
 *  the right call anyway: Live would have nothing but its empty state, and it
 *  flips back the moment the next round is assigned. */
export function isComplete(data: BracketTournamentDTO): boolean {
  return (
    data.results.some((r) => r.winner_side !== 'none') &&
    data.assignments.every((a) => a.finished)
  );
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

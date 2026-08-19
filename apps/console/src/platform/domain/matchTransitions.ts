/**
 * The match-state machine, client side — a MIRROR of the backend contract in
 * `backend/services/match_state.py::VALID_TRANSITIONS`.
 *
 * These two tables were once authored independently and drifted: the client
 * offered `started→called`, `finished→started`, and after-the-fact scoring from
 * `scheduled`/`called`, all of which the server refuses. Every such press
 * optimistically applied, 409'd, and surfaced a "version mismatch" toast with a
 * Retry that could never succeed (interaction audit, finding A1).
 *
 * Naming: the wire DTO spells the playing state `started`; the backend enum
 * calls it `playing`. Same state, historical spelling — the backend translates
 * at the route boundary (`_LEGACY_TO_CANONICAL`).
 *
 * Same-state entries (`finished → finished`) are deliberate: the backend PUT
 * route short-circuits a re-assert of the current status *before* the transition
 * guard, which is what lets an operator edit the score of a finished match.
 */
import type { MatchStateDTO } from '../../api/dto';

export type MatchStatus = MatchStateDTO['status'];

export const VALID_TRANSITIONS: Record<MatchStatus, MatchStatus[]> = {
  scheduled: ['called', 'scheduled'],
  called: ['started', 'scheduled', 'called'],
  // Undo of a start returns to `scheduled` (the backend has no playing→called
  // edge); the queue re-offers the match for calling.
  started: ['finished', 'scheduled', 'started'],
  // `finished → started` is the operator's undo of a mis-tapped Finish;
  // `finished → finished` is a score edit. Nothing else re-opens a result.
  finished: ['started', 'finished'],
};

export function isValidTransition(from: MatchStatus, to: MatchStatus): boolean {
  return VALID_TRANSITIONS[from].includes(to);
}

/**
 * The shortest legal sequence of statuses that takes a match from `from` to
 * `to`, or `null` when the target is unreachable.
 *
 * Most transitions are direct and yield a single step. The path exists for the
 * jumps an operator can legitimately ask for but the server won't accept in one
 * hop — recording a score for a match that was never explicitly started
 * (`called → started → finished`). The button's intent stands; we walk the
 * machine rather than fire a request the server will refuse.
 */
export function transitionPath(
  from: MatchStatus,
  to: MatchStatus,
): MatchStatus[] | null {
  if (isValidTransition(from, to)) return [to];

  // BFS over the non-same-state edges — shortest path, no cycles.
  const queue: MatchStatus[][] = [[from]];
  const seen = new Set<MatchStatus>([from]);
  while (queue.length > 0) {
    const path = queue.shift()!;
    const tail = path[path.length - 1];
    for (const next of VALID_TRANSITIONS[tail]) {
      if (next === tail || seen.has(next)) continue;
      const extended = [...path, next];
      if (next === to) return extended.slice(1);
      seen.add(next);
      queue.push(extended);
    }
  }
  return null;
}

/**
 * Cross-engine court coordination — the meet side.
 *
 * Meet and Bracket schedule the SAME physical courts. The backend already
 * coordinates one direction (a bracket solve treats meet-occupied cells as
 * closed windows — `_meet_occupied_windows` in `api/brackets.py`); this is
 * the other: every MEET solve must pass the bracket's currently-occupied
 * cells as `closedCourtWindows` so the CP-SAT engine never places a meet
 * match where a bracket match already sits.
 *
 * One window per bracket assignment, in the wire shape the schedule routes
 * accept: `[court, fromSlot, toSlot)` (half-open). Both engines share the
 * same slot axis (slot k of the day = slot k in both models — see
 * `products/operations/opsBlock.ts`), so no translation is needed.
 */
import type { BracketTournamentDTO } from '../api/bracketDto';

export function bracketOccupiedWindows(
  data: BracketTournamentDTO | null | undefined,
): number[][] {
  return (data?.assignments ?? []).map((a) => [
    a.court_id,
    a.slot_id,
    a.slot_id + a.duration_slots,
  ]);
}

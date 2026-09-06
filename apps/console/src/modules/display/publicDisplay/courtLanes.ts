/**
 * Court lanes — pure Now/Next/Later derivation for the public board.
 *
 * Retires the drifting wall-clock label ("Next · 09:30" reading stale
 * during delays) in favour of relative lanes: the board tells a spectator
 * WHAT'S NOW and WHAT'S NEXT, not a clock time that silently falls out of
 * sync with reality.
 *
 * Deliberately BOARD-LOCAL — not shared with Operations' `deriveCourtLanes`
 * (modules/operations/runtime/runModel.ts), even though that helper also
 * buckets matches into court-scoped now/next/later. The two solve different
 * problems:
 *
 *   - `deriveCourtLanes` ALWAYS gives an occupied court a `now`: a live
 *     (called/playing) match wins, and failing that the earliest non-done
 *     match on the court. That's correct for Operations — it's bookkeeping
 *     for "what does this court's assignment queue look like right now"
 *     (role resolution, free-court finding), so an idle court with only
 *     scheduled matches still gets a `now` there.
 *   - The public board's `now` must be strictly LIVE-gated: a spectator TV
 *     must never label a not-yet-started match "Now". An idle court (no
 *     match started/called) has NO now lane at all — its earliest item is
 *     `next`.
 *
 * That's a different essential input (live status) and a different `now`
 * rule, not merely a coarser vocabulary the way Operations' collapsed
 * `next-later` bucket is — so this stays its own tested pure helper. The
 * live-gating constraint on the board necessitates this separate logic.
 *
 * Court OCCUPANCY (free/occupied/disputed) is not reimplemented here,
 * though (D1): both `currentMatchesByCourt` and `assignLanes` derive their
 * "is this court disputed" answer from the one authority,
 * `platform/domain/courtOccupancy.ts`, over a synthetic `'playing'`/
 * `'scheduled'` status built from the caller-supplied `nowState` set. The
 * caller (`MeetDisplayPage.tsx`) decides what belongs in `nowState` using
 * that same authority's `nowWindow: 'board'` (D19) — this module stays
 * ignorant of the desk/board distinction and only asks "is this id live".
 */

import { deriveCourtStates, deriveDisputes, type OccupancyMatchLike } from '../../../platform/domain/courtOccupancy';

export type CourtLane = 'now' | 'next' | 'later';

export interface LaneItem {
  /** Unique id (matchId) — the `assignLanes` Map key. */
  id: string;
  /** Court this item is assigned to. */
  court: number;
  /** Planned slot (or any orderable time key). Ties break by `id`. */
  plannedSlot: number;
}

/** Build the authority's `OccupancyMatchLike` shape from a lane item, using
 * `nowState` membership as the (already board-windowed) "is this live"
 * fact — everything live reports as the canonical `'playing'` status so
 * `occupiesCourtNow`'s default (`'desk'`) window sees it as occupying,
 * regardless of whether the caller's `nowState` was built with the desk or
 * board window. */
function toOccupancyMatches(
  items: readonly LaneItem[],
  nowState: ReadonlySet<string>,
): OccupancyMatchLike[] {
  return items
    .filter((item) => nowState.has(item.id))
    .map((item) => ({ id: item.id, status: 'playing' as const, court: item.court }));
}

/** Index live/called records by court without selecting a winner. A duplicate
 * current assignment is an Operations conflict and is returned in full so a
 * projection can explain it honestly. Disputed-court derivation redirects to
 * the one authority (D1) — this module keeps no conflict detector of its
 * own. */
export function currentMatchesByCourt(
  items: readonly LaneItem[],
  nowState: ReadonlySet<string>,
): { current: Map<number, string>; conflicts: Map<number, string[]> } {
  const matches = toOccupancyMatches(items, nowState);
  const states = deriveCourtStates(matches);
  const current = new Map<number, string>();
  for (const match of matches) {
    if (match.court != null && states.get(match.court) === 'occupied') {
      current.set(match.court, match.id);
    }
  }
  const conflicts = new Map<number, string[]>();
  for (const dispute of deriveDisputes(matches)) {
    conflicts.set(dispute.courtId, dispute.claims.map((claim) => claim.matchKey));
  }
  return { current, conflicts };
}

/**
 * Per-court Now/Next/Later lane assignment.
 *
 * `nowState` names the ids that are ACTUALLY live (started or called) right
 * now — at most one is expected per court (a court has at most one match in
 * progress). Everything else on the court, sorted by `plannedSlot` then
 * `id`, fills `next` then `later` in order; anything deeper is left
 * unlabeled (the board only ever previews two matches ahead).
 *
 * Pure: no clock read, no side effects. Callers pass only non-finished
 * items — a `done` match has no lane.
 */
export function assignLanes(
  items: readonly LaneItem[],
  nowState: ReadonlySet<string>,
): Map<string, CourtLane> {
  const byCourt = new Map<number, LaneItem[]>();
  for (const item of items) {
    const list = byCourt.get(item.court);
    if (list) list.push(item);
    else byCourt.set(item.court, [item]);
  }

  // Disputed-court derivation redirects to the one authority (D1): a court
  // gets a `now` lane only when the authority calls it `occupied` — exactly
  // one live claim. Two or more live claims on one court is `disputed` and
  // gets none (D19's "the board never shows a `now` for a disputed court"),
  // the same outcome the old ad hoc `liveIndexes.length === 1` check gave,
  // now computed once instead of reimplemented here.
  const occupancyMatches = toOccupancyMatches(items, nowState);
  const courtStates = deriveCourtStates(occupancyMatches);

  const lanes = new Map<string, CourtLane>();
  for (const [court, list] of byCourt) {
    const sorted = [...list].sort(
      (a, b) => a.plannedSlot - b.plannedSlot || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    );
    const liveEntries = sorted.filter((entry) => nowState.has(entry.id));
    const liveIds = new Set(liveEntries.map((entry) => entry.id));
    const upcoming = sorted.filter((entry) => !liveIds.has(entry.id));
    if (courtStates.get(court) === 'occupied') {
      lanes.set(liveEntries[0].id, 'now');
    }
    if (upcoming[0]) lanes.set(upcoming[0].id, 'next');
    if (upcoming[1]) lanes.set(upcoming[1].id, 'later');
  }
  return lanes;
}

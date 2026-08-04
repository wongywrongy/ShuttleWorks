/**
 * Court lanes — pure Now/Next/Later derivation for the public board.
 *
 * Retires the drifting wall-clock label ("Next · 09:30" reading stale
 * during delays) in favour of relative lanes: the board tells a spectator
 * WHAT'S NOW and WHAT'S NEXT, not a clock time that silently falls out of
 * sync with reality.
 *
 * Deliberately BOARD-LOCAL — not shared with Operations' `deriveCourtLanes`
 * (products/operations/runtime/runModel.ts), even though that helper also
 * buckets matches into court-scoped now/next/later. The two solve different
 * problems:
 *
 *   - `deriveCourtLanes` sets `now` POSITIONALLY: the earliest non-done
 *     match assigned to a court, regardless of whether it has actually
 *     started or been called. That's correct for Operations — it's
 *     bookkeeping for "what does this court's assignment queue look like
 *     right now" (role resolution, free-court finding), and an idle court
 *     with only scheduled matches still gets a `now` there.
 *   - The public board's `now` must be strictly LIVE-gated: a spectator TV
 *     must never label a not-yet-started match "Now". An idle court (no
 *     match started/called) has NO now lane at all — its earliest item is
 *     `next`.
 *
 * That's a different essential input (live status) and a different `now`
 * rule, not merely a coarser vocabulary the way Operations' collapsed
 * `next-later` bucket is — so this stays its own tested pure helper. The
 * live-gating constraint on the board necessitates this separate logic.
 */

export type CourtLane = 'now' | 'next' | 'later';

export interface LaneItem {
  /** Unique id (matchId) — the `assignLanes` Map key. */
  id: string;
  /** Court this item is assigned to. */
  court: number;
  /** Planned slot (or any orderable time key). Ties break by `id`. */
  plannedSlot: number;
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

  const lanes = new Map<string, CourtLane>();
  for (const list of byCourt.values()) {
    const sorted = [...list].sort(
      (a, b) => a.plannedSlot - b.plannedSlot || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    );
    const liveIndex = sorted.findIndex((entry) => nowState.has(entry.id));
    let upcoming = sorted;
    if (liveIndex >= 0) {
      lanes.set(sorted[liveIndex].id, 'now');
      upcoming = sorted.filter((_, i) => i !== liveIndex);
    }
    if (upcoming[0]) lanes.set(upcoming[0].id, 'next');
    if (upcoming[1]) lanes.set(upcoming[1].id, 'later');
  }
  return lanes;
}

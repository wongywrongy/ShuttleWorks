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

/** Index live/called records by court without selecting a winner. A duplicate
 * current assignment is an Operations conflict and is returned in full so a
 * projection can explain it honestly. */
export function currentMatchesByCourt(
  items: readonly LaneItem[],
  nowState: ReadonlySet<string>,
): { current: Map<number, string>; conflicts: Map<number, string[]> } {
  const byCourt = new Map<number, string[]>();
  for (const item of items) {
    if (!nowState.has(item.id)) continue;
    const ids = byCourt.get(item.court);
    if (ids) ids.push(item.id);
    else byCourt.set(item.court, [item.id]);
  }
  const current = new Map<number, string>();
  const conflicts = new Map<number, string[]>();
  for (const [court, ids] of byCourt) {
    if (ids.length === 1) current.set(court, ids[0]);
    else conflicts.set(court, ids);
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

  const lanes = new Map<string, CourtLane>();
  for (const list of byCourt.values()) {
    const sorted = [...list].sort(
      (a, b) => a.plannedSlot - b.plannedSlot || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    );
    const liveIndexes = sorted
      .map((entry, index) => (nowState.has(entry.id) ? index : -1))
      .filter((index) => index >= 0);
    // Multiple live records on one court are a source conflict. Do not
    // promote an arbitrary one to NOW on the public projection; the caller's
    // conflict index retains the complete set for an honest message.
    const liveIndex = liveIndexes.length === 1 ? liveIndexes[0] : -1;
    const conflictingIds = new Set(liveIndexes.map((index) => sorted[index].id));
    const upcoming = sorted.filter((entry) => !conflictingIds.has(entry.id));
    if (liveIndexes.length === 1) {
      lanes.set(sorted[liveIndex].id, 'now');
    }
    if (upcoming[0]) lanes.set(upcoming[0].id, 'next');
    if (upcoming[1]) lanes.set(upcoming[1].id, 'later');
  }
  return lanes;
}

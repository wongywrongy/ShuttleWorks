/**
 * Court layout — pure helpers for the director-controlled board arrangement.
 * Consumed by MeetDisplayPage (applies to the real public board), the
 * DisplayLayoutEditor (drag-reorder + hide toggles), and DisplayPreview
 * (column-default only — see its own doc comment for why it does NOT
 * apply hide/order to its fixed sample fixture).
 *
 * ABSOLUTE RULE: hiding a court is presentation-only. Nothing here reads
 * or writes match state, schedule assignments, or Operations' court
 * state — `visibleCourts` is a plain array filter. A hidden court that
 * later gets a live match does NOT auto-reappear (Q9) — see
 * `courtsWithActiveMatch`, which is read-only and used solely to power
 * the editor's "show it?" nudge (operator context only, never rendered
 * on the public board).
 */

/**
 * Manual order first (in the given order, de-duplicated, and dropping any
 * id not present in `courtIds`), then any court NOT listed appended in
 * ascending numeric order. Never drops a court — every id in `courtIds`
 * appears exactly once in the result.
 */
export function orderCourts(
  courtIds: number[],
  courtOrder: number[] | null | undefined
): number[] {
  const known = new Set(courtIds);
  const seen = new Set<number>();
  const manual: number[] = [];
  for (const id of courtOrder ?? []) {
    if (known.has(id) && !seen.has(id)) {
      seen.add(id);
      manual.push(id);
    }
  }
  const unlisted = courtIds.filter((id) => !seen.has(id)).sort((a, b) => a - b);
  return [...manual, ...unlisted];
}

/**
 * Presentation-only filter: removes hidden court ids, preserving the
 * order of whatever was passed in. Never mutates scheduling/live state —
 * callers still see the full unfiltered set wherever hide should not
 * apply (e.g. the editor's own reorder list).
 */
export function visibleCourts(
  courtIds: number[],
  hidden: number[] | null | undefined
): number[] {
  if (!hidden || hidden.length === 0) return courtIds;
  const hiddenSet = new Set(hidden);
  return courtIds.filter((id) => !hiddenSet.has(id));
}

/**
 * Responsive column default for grid mode. `override` (the director's
 * explicit `tvGridColumns` choice) always wins when set; otherwise derive
 * from how many courts are actually on screen: <=3 -> 2, 4-6 -> 3, >=7 -> 4.
 * (The brief's "≥8→4" is illustrative of the top tier, not a literal gap
 * at 7 — 7 rounds up into the same "large" tier as 8+.) Always clamped to
 * 1..4 so a malformed override can never blow up the grid-cols lookup.
 */
export function defaultColumns(
  courtCount: number,
  override: number | null | undefined
): 1 | 2 | 3 | 4 {
  const clamp = (n: number): 1 | 2 | 3 | 4 =>
    Math.min(4, Math.max(1, Math.round(n))) as 1 | 2 | 3 | 4;
  if (override != null) return clamp(override);
  if (courtCount <= 3) return 2;
  if (courtCount <= 6) return 3;
  return 4;
}

/**
 * Read-only: which court ids currently carry an active (started or
 * called) match. Used ONLY to power the editor's "Court N (hidden) has a
 * live match — show it?" nudge (operator context) — never consulted by
 * the public board's rendering, and never writes anything.
 */
export function courtsWithActiveMatch(
  assignments: Array<{ courtId: number; matchId: string }>,
  matchStates: Record<string, { status?: string; actualCourtId?: number | null } | undefined>
): Set<number> {
  const result = new Set<number>();
  for (const a of assignments) {
    const state = matchStates[a.matchId];
    if (state?.status !== 'started' && state?.status !== 'called') continue;
    result.add(state.actualCourtId ?? a.courtId);
  }
  return result;
}

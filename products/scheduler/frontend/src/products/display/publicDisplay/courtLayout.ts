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

/* =========================================================================
 * Auto layout (SP-CONSOLE-2 TV-6) — the board sizes itself to the room.
 *
 * A venue TV is read from across a hall, and the constraint that actually
 * decides legibility is CARD AREA: the 1-inch-per-10-feet rule means a name
 * has a floor below which the board is decoration. The old default picked
 * columns from court count alone and never looked at the viewport, so a
 * 20-court day on a 1080p screen produced 20 unreadable slivers and called
 * it a layout.
 *
 * Auto derives columns from the viewport's aspect ratio and the number of
 * cards it must place — cols ≈ sqrt(N · A / a), where A is the board's
 * aspect and a the card's target aspect — then PAGINATES rather than
 * shrinking past the floor. Twelve cards on a screen is the cap; a
 * thirteenth court starts a second page that the rotation engine cycles to.
 * ========================================================================= */

/** Most cards the board will place on one page. Past this the min-card-area
 *  floor is unreachable at any column count on a 1080p venue screen, so the
 *  layout paginates instead of shrinking. */
export const MAX_CARDS_PER_PAGE = 12;

/** Target card aspect (w/h). Court cards are wider than tall: two stacked
 *  side rows plus a band and a score lane. */
const CARD_ASPECT = 1.6;

export interface AutoLayout {
  /** Columns for the page's grid. */
  columns: 1 | 2 | 3 | 4;
  /** How many pages the visible courts need. */
  pages: number;
  /** Cards on each page (the last may be shorter). */
  perPage: number;
}

/**
 * Columns + pagination for `courtCount` cards in a board of aspect
 * `boardAspect` (width / height). `override` still wins for columns — the
 * director's explicit `tvGridColumns` is a deliberate choice — but never
 * defeats pagination, which exists to keep cards legible.
 */
export function autoLayout(
  courtCount: number,
  boardAspect: number,
  override?: number | null,
): AutoLayout {
  const n = Math.max(0, Math.floor(courtCount));
  if (n === 0) return { columns: 1, pages: 1, perPage: MAX_CARDS_PER_PAGE };

  const pages = Math.max(1, Math.ceil(n / MAX_CARDS_PER_PAGE));
  // Spread evenly rather than filling page 1 and stranding one card alone on
  // page 2 — a page holding a single giant card reads as a bug.
  const perPage = Math.ceil(n / pages);

  const clamp = (v: number): 1 | 2 | 3 | 4 =>
    Math.min(4, Math.max(1, Math.round(v))) as 1 | 2 | 3 | 4;

  if (override != null) return { columns: clamp(override), pages, perPage };

  const aspect = boardAspect > 0 ? boardAspect : 16 / 9;
  return {
    columns: clamp(Math.sqrt((perPage * aspect) / CARD_ASPECT)),
    pages,
    perPage,
  };
}

/**
 * Card area, in square units of the board, that `autoLayout` yields.
 * The property the layout exists to protect: no arrangement may hand a card
 * less than `MIN_CARD_AREA` of the board.
 */
export function cardAreaFraction(layout: AutoLayout): number {
  const rows = Math.ceil(layout.perPage / layout.columns);
  return 1 / (layout.columns * Math.max(1, rows));
}

/** A card must own at least this fraction of the board to stay readable at
 *  venue distance. 12 cards in a 4×3 grid is exactly 1/12. */
export const MIN_CARD_AREA = 1 / MAX_CARDS_PER_PAGE;

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

/**
 * Drag-reorder helper: moves `activeId` to the position of `overId` in the
 * array. If `activeId === overId`, or if either id is not present in `ids`,
 * returns a shallow copy unchanged. Pure function with no dnd-kit dependency.
 *
 * Examples:
 * - reorderIds([1,2,3,4], 1, 3) → [2,3,1,4] (moves 1 to 3's position)
 * - reorderIds([1,2,3], 2, 2) → [1,2,3] (no-op, same id)
 * - reorderIds([1,2,3], 5, 2) → [1,2,3] (5 not in array, unchanged)
 */
export function reorderIds(ids: number[], activeId: number, overId: number): number[] {
  if (activeId === overId) return [...ids];
  const fromIdx = ids.indexOf(activeId);
  const toIdx = ids.indexOf(overId);
  if (fromIdx < 0 || toIdx < 0) return [...ids];

  const result = [...ids];
  result.splice(fromIdx, 1);
  result.splice(toIdx, 0, activeId);
  return result;
}

/**
 * Rotation engine for the venue board (SP-CONSOLE-2 TV-5 / TV-7 / DC-3).
 *
 * The board used to alternate between "the current view" and a full-bleed
 * standings screen on one 15-second timer, and — at six courts or fewer —
 * could instead pin standings to a permanent side panel that took roughly a
 * third of the width from the court grid. A passive TV has one job at a time
 * and no one to scroll it, so the panel was the wrong trade: the courts are
 * what the hall is looking at, and everything else is worth a slide, not a
 * column.
 *
 * So: an ordered slide set, each with its own dwell. Courts is the working
 * slide and holds twice the base dwell (20s against 10s by default) because
 * it is the one people are actually reading; the rest are glances.
 *
 * Pure. The board owns the timer; this module owns what the sequence IS.
 */

export type SlideId = 'courts' | 'standings' | 'upNext';

/** Every slide, in the order they rotate. A configured set is filtered
 *  against this, so an unknown or duplicated id from a stored blob cannot
 *  put the board into a state the renderer has no branch for. */
export const SLIDE_ORDER: readonly SlideId[] = ['courts', 'standings', 'upNext'];

/** Seconds a glance slide holds. The director can change it (DC-3). */
export const DEFAULT_DWELL_SECONDS = 10;

/** Courts is the working slide, not a glance. */
const COURTS_DWELL_MULTIPLIER = 2;

export function dwellSecondsFor(slide: SlideId, baseSeconds: number): number {
  const base = Math.max(1, Math.round(baseSeconds));
  return slide === 'courts' ? base * COURTS_DWELL_MULTIPLIER : base;
}

/**
 * The slides this board will actually rotate through.
 *
 * `configured` is the director's chosen set (null = every slide). `available`
 * is what there is data for right now — a standings slide with no standings
 * is a blank screen on a wall, and an up-next slide with an empty queue is
 * the same. Courts is never dropped: a board with nothing to show still shows
 * the courts, empty, which is information.
 */
export function rotationSlides(
  available: { standings: boolean; upNext: boolean },
  configured?: readonly SlideId[] | null,
): SlideId[] {
  const wanted = new Set<SlideId>(
    configured && configured.length > 0
      ? configured.filter((s): s is SlideId => SLIDE_ORDER.includes(s))
      : SLIDE_ORDER,
  );
  return SLIDE_ORDER.filter((slide) => {
    if (slide === 'courts') return true;
    if (!wanted.has(slide)) return false;
    return slide === 'standings' ? available.standings : available.upNext;
  });
}

/**
 * The slide `elapsedSeconds` into the cycle.
 *
 * Deriving from elapsed time rather than counting timer ticks means a board
 * left running for a week cannot drift, and a re-render never skips a slide.
 */
export function slideAt(slides: readonly SlideId[], elapsedSeconds: number, baseDwell: number): SlideId {
  if (slides.length === 0) return 'courts';
  const durations = slides.map((s) => dwellSecondsFor(s, baseDwell));
  const cycle = durations.reduce((a, b) => a + b, 0);
  if (cycle <= 0) return slides[0];
  let t = ((elapsedSeconds % cycle) + cycle) % cycle;
  for (let i = 0; i < slides.length; i += 1) {
    if (t < durations[i]) return slides[i];
    t -= durations[i];
  }
  return slides[slides.length - 1];
}

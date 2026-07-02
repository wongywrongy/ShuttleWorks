/**
 * availabilityWindows — pure inversion helpers between the two views of
 * a player's day:
 *
 *   ALLOWED (positive) windows — the canonical storage shape
 *     (`PlayerDTO.availability`, already solver-wired). An EMPTY list
 *     means "all day, no restrictions".
 *   BLOCKED (unavailable) windows — the operator-facing UX shape
 *     (`AvailabilityControl` shows "unavailable periods").
 *
 * All windows are `{start, end}` in "HH:mm"; `dayStart`/`dayEnd` are the
 * tournament day bounds (same format, `dayStart < dayEnd` — overnight
 * days are out of scope for these helpers). Every function normalizes:
 * clamp to `[dayStart, dayEnd]`, drop zero/negative-length windows,
 * sort by start, merge overlapping/adjacent windows.
 *
 * Invariants (pinned by availabilityWindows.test.ts):
 *   - `[]` allowed ⇄ `[]` blocked — the empty list ALWAYS means
 *     "all day available". `blockedToAllowed([])` never emits a
 *     full-day allowed window.
 *   - FULL-DAY-BLOCKED semantics: `[]` cannot also mean "available at
 *     no time", so when the blocked windows cover the whole day,
 *     `blockedToAllowed` returns a single ZERO-WIDTH GUARD window
 *     `[{start: dayStart, end: dayStart}]`. It is non-empty (so it
 *     never collides with the all-day meaning of `[]`) and zero-width
 *     (so it allows no actual play time). Symmetrically,
 *     `allowedToBlocked` maps any NON-EMPTY allowed list that
 *     normalizes to nothing back to the full-day blocked window.
 *   - Round-trip: `allowedToBlocked(blockedToAllowed(b)) ===
 *     normalizeWindows(b)` for every blocked list `b`.
 */
import type { AvailabilityWindow } from '../../api/dto';

/** "HH:mm" → minutes since midnight. */
export function timeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

/** Minutes since midnight → "HH:mm". */
export function minutesToTime(minutes: number): string {
  const h = String(Math.floor(minutes / 60)).padStart(2, '0');
  const m = String(minutes % 60).padStart(2, '0');
  return `${h}:${m}`;
}

interface Span {
  start: number;
  end: number;
}

/** Clamp to the day, drop empty/inverted spans, sort, merge
 *  overlapping/adjacent. Minute-space core shared by every helper. */
function normalizeSpans(
  windows: AvailabilityWindow[],
  dayStartMin: number,
  dayEndMin: number,
): Span[] {
  const clamped = windows
    .map((w) => ({
      start: Math.max(timeToMinutes(w.start), dayStartMin),
      end: Math.min(timeToMinutes(w.end), dayEndMin),
    }))
    .filter((s) => s.end > s.start)
    .sort((a, b) => a.start - b.start || a.end - b.end);

  const merged: Span[] = [];
  for (const s of clamped) {
    const last = merged[merged.length - 1];
    // `<=` also merges back-to-back windows (10:00–11:00 + 11:00–12:00).
    if (last && s.start <= last.end) last.end = Math.max(last.end, s.end);
    else merged.push({ ...s });
  }
  return merged;
}

const toWindows = (spans: Span[]): AvailabilityWindow[] =>
  spans.map((s) => ({ start: minutesToTime(s.start), end: minutesToTime(s.end) }));

/**
 * Canonical form of a window list: clamped to `[dayStart, dayEnd]`,
 * zero/negative-length dropped, sorted, overlaps/adjacencies merged.
 */
export function normalizeWindows(
  windows: AvailabilityWindow[],
  dayStart: string,
  dayEnd: string,
): AvailabilityWindow[] {
  return toWindows(
    normalizeSpans(windows, timeToMinutes(dayStart), timeToMinutes(dayEnd)),
  );
}

/**
 * BLOCKED (unavailable) → ALLOWED (positive) windows.
 *
 *   - `[]` blocked (or blocked entirely outside the day) → `[]` allowed
 *     ("all day, no restrictions" — NOT a full-day window).
 *   - Blocked covering the whole day → the zero-width guard
 *     `[{start: dayStart, end: dayStart}]` (see module JSDoc).
 *   - Otherwise → the complement of the blocked windows within
 *     `[dayStart, dayEnd]`.
 */
export function blockedToAllowed(
  blocked: AvailabilityWindow[],
  dayStart: string,
  dayEnd: string,
): AvailabilityWindow[] {
  const ds = timeToMinutes(dayStart);
  const de = timeToMinutes(dayEnd);
  const spans = normalizeSpans(blocked, ds, de);
  if (spans.length === 0) return []; // nothing blocked → all day.

  const allowed: Span[] = [];
  let cursor = ds;
  for (const s of spans) {
    if (s.start > cursor) allowed.push({ start: cursor, end: s.start });
    cursor = Math.max(cursor, s.end);
  }
  if (cursor < de) allowed.push({ start: cursor, end: de });

  // Whole day blocked — emit the zero-width guard instead of [] so the
  // result can't be mistaken for "all day available".
  if (allowed.length === 0) return [{ start: dayStart, end: dayStart }];
  return toWindows(allowed);
}

/**
 * ALLOWED (positive) → BLOCKED (unavailable) windows.
 *
 *   - `[]` allowed → `[]` blocked (all day available, nothing blocked).
 *   - A NON-EMPTY allowed list that normalizes to nothing (e.g. the
 *     zero-width guard) means "available at no time" → the full-day
 *     blocked window `[{start: dayStart, end: dayEnd}]`.
 *   - Otherwise → the complement of the allowed windows within
 *     `[dayStart, dayEnd]`.
 */
export function allowedToBlocked(
  allowed: AvailabilityWindow[],
  dayStart: string,
  dayEnd: string,
): AvailabilityWindow[] {
  if (allowed.length === 0) return []; // all day available.
  const ds = timeToMinutes(dayStart);
  const de = timeToMinutes(dayEnd);
  const spans = normalizeSpans(allowed, ds, de);
  // Non-empty input, no usable window: the zero-width guard (or windows
  // fully outside the day) — the player is available at no time.
  if (spans.length === 0) return [{ start: dayStart, end: dayEnd }];

  const blocked: Span[] = [];
  let cursor = ds;
  for (const s of spans) {
    if (s.start > cursor) blocked.push({ start: cursor, end: s.start });
    cursor = Math.max(cursor, s.end);
  }
  if (cursor < de) blocked.push({ start: cursor, end: de });
  return toWindows(blocked);
}

/**
 * Read-only one-liner for a window list: "09:00 – 10:30, 12:00 – 13:00".
 * `[]` reads "All day" (the canonical empty-availability meaning).
 */
export function formatWindowSummary(windows: AvailabilityWindow[]): string {
  if (windows.length === 0) return 'All day';
  return windows.map((w) => `${w.start} – ${w.end}`).join(', ');
}

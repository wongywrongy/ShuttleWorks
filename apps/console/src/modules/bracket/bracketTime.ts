/**
 * Wall-clock slot helpers for the bracket Live surface.
 *
 * The bracket carries its OWN ``start_time`` (ISO datetime, or null when
 * no real start is pinned) and ``interval_minutes``. The Live "late"
 * ring must derive the current slot from this schedule — not from the
 * meet-side ``TournamentConfig`` the operator never set for a bracket.
 * Sourcing it from the meet config made a bracket with no start_time
 * show every chip ringed "late" off an unrelated wall clock.
 *
 * Time-of-day only (ignores the date), matching the meet's
 * ``getCurrentSlot`` convention: a one-day cockpit's "late" signal is
 * relative to the start hour, not the calendar day.
 */
import { useEffect, useState } from 'react';

export function bracketCurrentSlot(
  startTimeIso: string | null,
  intervalMinutes: number,
  now: Date,
): number {
  if (!startTimeIso) return 0;
  const start = new Date(startTimeIso);
  if (Number.isNaN(start.getTime())) return 0;
  if (!Number.isFinite(intervalMinutes) || intervalMinutes <= 0) return 0;
  const startMin = start.getHours() * 60 + start.getMinutes();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  return Math.max(0, Math.floor((nowMin - startMin) / intervalMinutes));
}

/**
 * The current bracket slot, refreshed once a minute (mirrors
 * ``useCurrentSlot`` but sourced from the bracket's own schedule).
 * Returns 0 when no start_time is pinned — i.e. "late" never fires,
 * which is correct: there's no wall-clock baseline to be late against.
 */
export function useBracketCurrentSlot(
  startTimeIso: string | null,
  intervalMinutes: number,
): number {
  const [slot, setSlot] = useState(() =>
    bracketCurrentSlot(startTimeIso, intervalMinutes, new Date()),
  );
  useEffect(() => {
    setSlot(bracketCurrentSlot(startTimeIso, intervalMinutes, new Date()));
    const id = window.setInterval(
      () => setSlot(bracketCurrentSlot(startTimeIso, intervalMinutes, new Date())),
      60_000,
    );
    return () => window.clearInterval(id);
  }, [startTimeIso, intervalMinutes]);
  return slot;
}

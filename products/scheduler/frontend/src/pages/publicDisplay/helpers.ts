/**
 * Helpers for the Public Display surface — pure functions only.
 *
 * Kept separate from the view components so each can be unit-tested
 * without booting a renderer and to avoid the inevitable temptation to
 * grow each view file with utility logic.
 */

/**
 * Safe parse for the `tournamentDate` config field. Returns null on
 * any malformed / missing input so we don't render "Invalid Date".
 */
export function formatTournamentDate(
  iso: string | null | undefined
): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Render a side roster as "Alice & Bob" (singles → just "Alice"; bye / missing → "—").
 * Caller passes a pre-built `playerNames` Map so the inner lookups stay O(1)
 * across hundreds of matches per render.
 */
export function formatPlayers(
  ids: string[] | undefined,
  playerNames: Map<string, string>
): string {
  if (!ids || ids.length === 0) return '—';
  return ids.map((id) => playerNames.get(id) || id).join(' & ');
}

/**
 * Is the given court closed at the given wall-clock moment? Two paths:
 *   (a) it's in the legacy all-day closedCourts list, or
 *   (b) any time-bounded courtClosures entry covers `now`'s minute.
 *
 * Spectators only need the "now" view; the schedule tab shows future
 * closure windows through normal match rendering.
 */
export function isCourtClosedNow(
  config: {
    closedCourts?: number[] | null;
    courtClosures?: Array<{ courtId: number; fromTime?: string | null; toTime?: string | null }> | null;
  },
  courtId: number,
  now: Date
): boolean {
  if ((config.closedCourts ?? []).includes(courtId)) return true;
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const minToMin = (hhmm?: string | null) =>
    hhmm ? Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5)) : null;
  return (config.courtClosures ?? []).some((c) => {
    if (c.courtId !== courtId) return false;
    const f = minToMin(c.fromTime) ?? 0;
    const t = minToMin(c.toTime) ?? 24 * 60;
    return nowMin >= f && nowMin < t;
  });
}

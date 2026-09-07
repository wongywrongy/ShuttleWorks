/**
 * Helpers for the Public Display surface — pure functions only.
 *
 * Kept separate from the view components so each can be unit-tested
 * without booting a renderer and to avoid the inevitable temptation to
 * grow each view file with utility logic.
 */
import { formatDateTime } from '../../../lib/formatDateTime';
import { meetSideFromIds, formatSideCondensed, formatSideLines, type Side } from '../../../platform/domain/sides';

/**
 * Exact public conflict copy (state-and-formatting contract §4.1 / §9.1,
 * match-card contract §4.4, V3-OC24.1). One constant so the card band, the
 * card body and the list row can never drift apart from each other or from
 * `BracketLiveView`'s copy of the same sentence.
 */
export const COURT_ASSIGNMENT_UNAVAILABLE = 'Court assignment unavailable.';

/**
 * Safe parse for the `tournamentDate` config field. Returns null on
 * any malformed / missing input so we don't render "Invalid Date".
 *
 * Redirects to the `formatDateTime` authority (state-and-formatting §7.3,
 * D13) instead of a local `toLocaleDateString` call. No tournament timezone
 * reaches the display wire today (`TournamentConfig`/`ScheduleDTO`/
 * `BracketTournamentDTO` carry no `timeZone` field — see the package 17
 * report and debt-log.md) so this still renders in UTC; the difference from
 * before is that the UTC assumption now goes through the one formatter that
 * documents and labels it, rather than a second silent copy of the same
 * assumption.
 */
export function formatTournamentDate(
  iso: string | null | undefined,
  timeZone: string = 'UTC',
): string | null {
  return formatDateTime(iso, 'date', timeZone);
}

/** Build a `Side` (match-card contract §2.1, state-and-formatting §6.1)
 *  from the meet engine's raw player ids + a name lookup. Scoped to just
 *  the ids in play so this stays O(ids.length) — typically 1 or 2 — rather
 *  than copying the whole roster map on every call. */
function sideFromIds(
  ids: string[] | undefined,
  playerNames: Map<string, string>,
): Side {
  const list = ids ?? [];
  const nameById: Record<string, string> = {};
  for (const id of list) nameById[id] = playerNames.get(id) ?? id;
  return meetSideFromIds(list, nameById);
}

/**
 * Render a side roster at the board's CONDENSED density: one line, joined
 * ' / ' (match-card §3.2's condensed-density allowance), with the fixed
 * unresolved-side labels ("To be decided", "Bye", …) rather than "TBD" or a
 * blank. Used by the compact list row and the Next/Later idle-court
 * previews, which are single-line by design.
 *
 * Redirects to the `sides.ts` authority (D14) — no more local 'TBD' / ' & '
 * fallback, and no more parsing a joined string back apart (D15).
 */
export function formatPlayers(
  ids: string[] | undefined,
  playerNames: Map<string, string>,
): string {
  return formatSideCondensed(sideFromIds(ids, playerNames));
}

/**
 * Render a side roster as one line PER participant (match-card §3.1: "one
 * participant per line within a pair") for the board's full signage
 * density — the on-court match card, where names read at ≥48px. Each
 * returned string is one line; an unresolved side still returns exactly
 * one line (its fixed label), never a blank line.
 */
export function sideLines(
  ids: string[] | undefined,
  playerNames: Map<string, string>,
): string[] {
  return formatSideLines(sideFromIds(ids, playerNames));
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

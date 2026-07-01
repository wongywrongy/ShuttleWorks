/**
 * Chronological grouping for the Hub list. A tournament director thinks in
 * time — "what's coming up, what's today, what's done" — not in status
 * categories. We partition workspaces by event date into three sections and
 * sort each so the most operationally-relevant events surface first.
 *
 * Pure + `today`-injected so it's unit-testable (no `new Date()` here).
 */
import type { TournamentSummaryDTO } from '../../api/dto';

export type HubGroupId = 'upcoming' | 'undated' | 'past';

export interface HubGroup {
  id: HubGroupId;
  label: string;
  items: TournamentSummaryDTO[];
}

/** The date-only key (YYYY-MM-DD) for an ISO date/datetime string. Comparing
 *  these as strings is a correct chronological compare for ISO dates and
 *  sidesteps timezone drift from `new Date()` round-trips. */
export function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

/** Parse an event date as a *local* calendar date. Event dates are date-only
 *  (YYYY-MM-DD); `new Date('2026-09-15')` would parse as UTC midnight and then
 *  render as the previous day in any behind-UTC timezone. Construct from the
 *  date parts so "Sep 15" always shows as the 15th, anywhere. */
export function eventDate(iso: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(iso);
}

/**
 * Partition + sort workspaces for the Hub:
 *  - **Upcoming**  — event date today or in the future, soonest first.
 *  - **No date set** — never scheduled; ordered by most-recently updated.
 *  - **Past**      — event date before today, most recent first.
 *
 * `todayKey` is the YYYY-MM-DD of "now" (today counts as Upcoming). Groups with
 * no items are omitted by the caller via `.items.length`.
 */
export function groupWorkspaces(
  list: TournamentSummaryDTO[],
  todayKey: string,
): HubGroup[] {
  const upcoming: TournamentSummaryDTO[] = [];
  const undated: TournamentSummaryDTO[] = [];
  const past: TournamentSummaryDTO[] = [];

  for (const t of list) {
    if (!t.tournamentDate) undated.push(t);
    else if (dayKey(t.tournamentDate) >= todayKey) upcoming.push(t);
    else past.push(t);
  }

  upcoming.sort((a, b) => dayKey(a.tournamentDate!).localeCompare(dayKey(b.tournamentDate!)));
  past.sort((a, b) => dayKey(b.tournamentDate!).localeCompare(dayKey(a.tournamentDate!)));
  undated.sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''));

  return [
    { id: 'upcoming', label: 'Upcoming', items: upcoming },
    { id: 'undated', label: 'No date set', items: undated },
    { id: 'past', label: 'Past', items: past },
  ];
}

/**
 * Hub views: **Active · Past**.
 *
 * The strip used to hold eight overlapping lifecycle/status facets (All,
 * Active, Entries, Setup, Ready, Live, Complete, Shared, Needs attention,
 * Archived). A director opening the Hub is asking a much smaller question —
 * *which of my events is running, which is coming, which is done* — and every
 * finer distinction (readiness, entries state, attention) is a fact about ONE
 * workspace that the workspace itself states in full. So the Hub now partitions
 * on TIME only, and operational readiness stays inside the workspace.
 *
 * The three views are derived from the event's date RANGE versus today **in the
 * event's own timezone** (`tournamentDate` … `tournamentEndDate`):
 *   - **Live** — today falls inside the range.
 *   - **Upcoming** — the range starts after today.
 *   - **Past** — the range ended before today.
 *   - **Date not set** — no start date. Not a view: a compact group carried
 *     inside the default view (and reachable from search), because it is an
 *     edge case, not a fourth thing a director thinks about.
 *
 * The Hub offers ONE single-select pair of views: **Active** (live +
 * upcoming + undated — the operationally relevant half of the list) and
 * **Past** (the archive). Each chip's count is the size of the set that view
 * actually shows, so a count can never describe a different list than the one
 * the click produces.
 *
 * Pure + `now`-injected so it is unit-testable.
 */
import type { TournamentSummaryDTO } from '../../api/dto';

/** The two named views. */
export type HubViewId = 'active' | 'past';

export interface HubView {
  id: HubViewId;
  label: string;
}

/** The chips, left to right, in the order an event travels. */
export const HUB_VIEWS: HubView[] = [
  { id: 'active', label: 'Active' },
  { id: 'past', label: 'Past' },
];

export const HUB_VIEW_IDS: ReadonlySet<string> = new Set(HUB_VIEWS.map((v) => v.id));

/** The default view: everything that has not finished. */
export const DEFAULT_HUB_VIEW: HubViewId = 'active';

/** Where a workspace sits in time. `undated` is not a view — see the module
 *  docstring. */
export type HubTimeBucket = 'live' | 'upcoming' | 'past' | 'undated';

/**
 * Today's YYYY-MM-DD in `timeZone`. An event's day boundary is the venue's,
 * not the laptop's: a Sydney tournament is live on the morning its Californian
 * director's browser still calls yesterday. Falls back to the browser's local
 * day when the zone is absent or unusable.
 */
export function todayKeyIn(timeZone: string | undefined, now: Date = new Date()): string {
  if (timeZone) {
    try {
      // en-CA renders ISO-shaped YYYY-MM-DD.
      return new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(now);
    } catch {
      /* fall through to the local day */
    }
  }
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** The event's date range as YYYY-MM-DD keys; `null` when it has no start. */
export function eventRangeOf(
  t: TournamentSummaryDTO,
): { start: string; end: string } | null {
  if (!t.tournamentDate) return null;
  const start = t.tournamentDate.slice(0, 10);
  const end = (t.tournamentEndDate ?? t.tournamentDate).slice(0, 10);
  // A stored end before the start is bad data, not a zero-length event: treat
  // the start as authoritative rather than making the row permanently "past".
  return { start, end: end < start ? start : end };
}

/** Which time bucket a workspace falls in, in ITS OWN timezone. */
export function timeBucketOf(
  t: TournamentSummaryDTO,
  now: Date = new Date(),
): HubTimeBucket {
  const range = eventRangeOf(t);
  if (!range) return 'undated';
  const today = todayKeyIn(t.timeZone, now);
  if (today < range.start) return 'upcoming';
  if (today > range.end) return 'past';
  return 'live';
}

/** Whether a workspace belongs in a view. `active` = live + upcoming, and
 *  carries the undated group so those workspaces stay reachable. */
export function matchesView(
  t: TournamentSummaryDTO,
  view: HubViewId,
  now: Date = new Date(),
): boolean {
  const past = timeBucketOf(t, now) === 'past';
  return view === 'past' ? past : !past;
}

/** Per-view counts over a list (the chips' badges). Each count is the size of
 *  the set its own view shows — undated workspaces are counted by Active,
 *  which is where they appear. */
export function viewCounts(
  list: TournamentSummaryDTO[],
  now: Date = new Date(),
): Record<HubViewId, number> {
  const counts: Record<HubViewId, number> = { active: 0, past: 0 };
  for (const t of list) counts[matchesView(t, 'past', now) ? 'past' : 'active'] += 1;
  return counts;
}

const BUCKET_RANK: Record<HubTimeBucket, number> = {
  live: 0,
  upcoming: 1,
  undated: 2,
  past: 3,
};

/**
 * The Hub's one ordering: **Live first, Upcoming ascending, undated, then Past
 * descending** — the same order in every view, so narrowing to one view never
 * reshuffles what the director just read. Ties break on id for determinism.
 */
export function sortForHub(
  list: TournamentSummaryDTO[],
  now: Date = new Date(),
): TournamentSummaryDTO[] {
  return [...list].sort((a, b) => {
    const ba = timeBucketOf(a, now);
    const bb = timeBucketOf(b, now);
    if (ba !== bb) return BUCKET_RANK[ba] - BUCKET_RANK[bb];
    if (ba === 'undated') {
      return (
        (b.updatedAt ?? '').localeCompare(a.updatedAt ?? '') || a.id.localeCompare(b.id)
      );
    }
    const sa = eventRangeOf(a)!.start;
    const sb = eventRangeOf(b)!.start;
    // Past reads newest-first (an archive); live/upcoming read soonest-first.
    const cmp = ba === 'past' ? sb.localeCompare(sa) : sa.localeCompare(sb);
    return cmp || a.id.localeCompare(b.id);
  });
}

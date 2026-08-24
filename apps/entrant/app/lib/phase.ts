/**
 * Phase-gating pure functions (SP-P6-2 design §6).
 *
 * Everything the redesigned public pages *decide* — which chip a tournament
 * wears, which tabs exist, which panel a `?tab` renders, which cards a filter
 * keeps — is decided here, as pure functions of server-shipped data plus a
 * `now` the caller supplies. No I/O, no `Date.now()`: SSR renders are
 * deterministic and the tests transcribe the design document's state tables
 * verbatim (`tests/phase.test.ts`).
 *
 * **Openness is the server's** (`_event_is_open`, `api/entries_json.py`).
 * Nothing here re-derives `isOpen` from moments — moments feed *display*
 * (countdowns, timelines, date facets) only. The one deliberate consequence:
 * when the server says open but the parsed deadline reads past (clock skew),
 * the chip says "closes today" rather than flipping closed client-side.
 *
 * Owner rulings 2026-08-11 are baked in: the chip has exactly TWO states
 * (`Entries open [— closes in Nd]` / `Entries closed`; G4 declined — no
 * Live/Finished/In-play).
 *
 * SP-P8 replaced the discovery CARD with the season ROW: `GET /e/api/pages`
 * now ships a decided `PageStatus` per tournament, so the tier-side status
 * facet, the card reduction and the multi-key discovery sort are all gone —
 * one read, one server-decided status, and the pure functions below only
 * SELECT, GROUP and LABEL what arrives.
 */
import type { FormEcho } from './echo';

export type Tab = 'overview' | 'events' | 'entrants' | 'draws' | 'seeds' | 'winners';

export type ChipState =
  | { kind: 'entriesOpen'; closesInDays: number | null }
  | { kind: 'entriesClosed' };

export type CtaState = { kind: 'enter'; href: string } | { kind: 'closed' };

/**
 * Where a tournament sits in its life, decided by the SERVER (SP-P8 Task 2,
 * `GET /e/api/pages`). The tier never re-derives it: `in_progress_live` in
 * particular means "the director published draws", which is a publication fact
 * no client-side date arithmetic can see.
 */
export type PageStatus =
  | 'entries_open'
  | 'entries_closed'
  | 'in_progress_live'
  | 'in_progress'
  | 'completed_winners'
  | 'completed';

/**
 * One row of the season list. SP-P8 reversed the G1 decline: the server now
 * ships every field the calendar renders, so `/e/` is ONE read rather than the
 * fan-out `toDiscoveryCard` used to reduce.
 */
export interface SeasonRow {
  slug: string;
  name: string | null;
  organizer: string | null;
  venueName: string | null;
  /** Raw `tournament_date` string — nullable, ISO by convention only. */
  date: string | null;
  eventCount: number;
  status: PageStatus;
  /** Whole days until entries close; server-computed, never 0 (ceil ≥ 1). */
  closesInDays: number | null;
  drawsPublished: boolean;
  winnersPublished: boolean;
}

export interface SeasonList {
  tournaments: SeasonRow[];
  /** Unfiltered, server-side segment counts (§2.3) — the labels never move. */
  counts: { takingEntries: number; completed: number };
  /** The happening-now strip, or null when nothing is in window. */
  now: { slug: string; moreCount: number } | null;
}

/** The three segments of the calendar. A view is navigation, not a filter. */
export type View = 'season' | 'open' | 'completed';

export type DatePreset = '7d' | '30d' | '90d';

export interface Filters {
  view: View;
  preset: DatePreset | null;
  from: string | null;
  to: string | null;
  q: string;
}

/** A month header plus its rows (§2.4). `key` is `year-monthIndex`. */
export interface MonthGroup {
  key: string;
  label: string;
  rows: SeasonRow[];
}

/**
 * What the status column renders for one row (§2.4 table).
 *
 * A closed sum type rather than a string plus optional href: `completed`
 * without published winners has NOWHERE to link (§7 trap 3), and the only way
 * to make that unrepresentable is for the no-link arm to carry no `href`
 * field at all.
 */
export type StatusCell =
  | { kind: 'chip-live'; label: string; href: string }
  | { kind: 'chip-open'; chip: ChipState }
  | { kind: 'chip-muted'; label: string }
  | { kind: 'link'; label: string; href: string }
  | { kind: 'text'; label: string };

export type TotalBarState =
  | { kind: 'unquoted' }
  | { kind: 'quoted'; totalCents: number; eventCount: number }
  | { kind: 'refused'; copy: string };

export interface TimelineMoment {
  label: string;
  /** The source wire string for a single agreed moment; null for a range. */
  at: string | null;
  state: 'past' | 'current' | 'future';
  /** Present when events disagree — render a "varies by event" range line. */
  variance?: 'per-event';
}

/** The slice of `EntryEventDTO` these functions read. */
export interface PhaseEvent {
  isOpen: boolean;
  opensAt: string | null;
  closesAt: string | null;
  withdrawsUntil: string | null;
}

const DAY_MS = 86_400_000;

/**
 * The month words, and the season calendar's month-header vocabulary.
 *
 * They live HERE, not in `format.ts` where the rest of the date-to-words
 * tables sit, for one structural reason: `format.ts` already imports this
 * module's parsers, so a `phase → format` edge would close an import cycle,
 * and `tests/boundaries.test.ts` holds the tier to ZERO depcruise findings —
 * `no-circular` is `warn` severity but that test admits no warnings either.
 * `format.ts` imports the word from here, so there is exactly one table.
 */
const MONTHS_LONG = Object.freeze([
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]);

/** `January`-style month for a zero-based index; out of range → `''`. */
export function monthLong(index: number): string {
  return MONTHS_LONG[index] ?? '';
}

/**
 * Parse the backend's pinned moment format `"%Y-%m-%d %H:%M UTC"`
 * (`_moment`, `api/entries_public.py`). Anything else — including ISO, until
 * G3 lands — is `null`, never a guess. The golden-string tests pin this
 * format on both sides, the `test_form_csrf_cross_tier.py` idiom.
 */
export function parseMoment(s: string | null): Date | null {
  if (s === null) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}) UTC$/.exec(s);
  if (!m) return null;
  const [, y, mo, d, h, min] = m.map(Number);
  const date = new Date(Date.UTC(y, mo - 1, d, h, min));
  // Round-trip check so `2026-13-40 99:99 UTC` is a null, not a rollover.
  return date.getUTCFullYear() === y &&
    date.getUTCMonth() === mo - 1 &&
    date.getUTCDate() === d &&
    date.getUTCHours() === h &&
    date.getUTCMinutes() === min
    ? date
    : null;
}

/** Parse a bare ISO date `YYYY-MM-DD` (the `tournament_date` convention). */
export function parseIsoDate(s: string | null): Date | null {
  if (s === null) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const [, y, mo, d] = m.map(Number);
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d
    ? date
    : null;
}

/** UTC midnight of the day `now` falls in. */
function utcDayStart(now: Date): number {
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
}

/** OR over the server's `isOpen` — the only openness this tier knows. */
export function entriesOpen(events: readonly Pick<PhaseEvent, 'isOpen'>[]): boolean {
  return events.some((event) => event.isOpen);
}

/**
 * Design §6 chip table. `min`, not `max`, over open events' deadlines: the
 * countdown must never overstate the time an entrant has. Skew row: server
 * said open, clock says past → `closesInDays: 0` ("closes today"), never
 * flipped closed here.
 */
export function chipState(
  events: readonly Pick<PhaseEvent, 'isOpen' | 'closesAt'>[],
  now: Date,
): ChipState {
  if (!entriesOpen(events)) return { kind: 'entriesClosed' };
  const deadlines = events
    .filter((event) => event.isOpen)
    .map((event) => parseMoment(event.closesAt))
    .filter((moment): moment is Date => moment !== null)
    .map((moment) => moment.getTime());
  if (deadlines.length === 0) return { kind: 'entriesOpen', closesInDays: null };
  return { kind: 'entriesOpen', closesInDays: countdown(Math.min(...deadlines), now) };
}

/** Whole days until a deadline, rounded UP, floored at 0 (the skew row). */
function countdown(deadlineMs: number, now: Date): number {
  return Math.max(0, Math.ceil((deadlineMs - now.getTime()) / DAY_MS));
}

/**
 * The nearest deadline over currently-OPEN events, as the raw wire string.
 *
 * The deadline half of the retired `toDiscoveryCard` — the entry form still
 * states the deadline it is running against, and that reduction is the only
 * part of the card it ever wanted. `min`, not `max`, for `chipState`'s reason:
 * the page must never overstate the time an entrant has. Closed events are
 * skipped however soon their deadline reads — their window is already spent.
 */
export function nearestCloseAt(
  events: readonly Pick<PhaseEvent, 'isOpen' | 'closesAt'>[],
): string | null {
  return (
    events
      .filter((event) => event.isOpen)
      .map((event) => ({ raw: event.closesAt, at: parseMoment(event.closesAt) }))
      .filter((d): d is { raw: string; at: Date } => d.at !== null)
      .sort((a, b) => a.at.getTime() - b.at.getTime())[0]?.raw ?? null
  );
}

/** The chip's sentence-case public copy — the ruling's exact two states. */
export function chipLabel(state: ChipState): string {
  if (state.kind === 'entriesClosed') return 'Entries closed';
  if (state.closesInDays === null) return 'Entries open';
  if (state.closesInDays === 0) return 'Entries open · closes today';
  return `Entries open · closes in ${state.closesInDays}d`;
}

/** Same predicate as `chipState`; the hero renders a link OR text, never a
 * disabled control (Z8). */
export function ctaState(
  events: readonly Pick<PhaseEvent, 'isOpen'>[],
  slug: string,
): CtaState {
  return entriesOpen(events)
    ? { kind: 'enter', href: `/e/${encodeURIComponent(slug)}/enter` }
    : { kind: 'closed' };
}

/**
 * Design §6 visibleTabs table. A declarative `[tab, predicate]` walk so a
 * future Draws/Schedule/Results tab is a data addition (brief rule 4). The
 * function is total: `[overview, entrants]` is unreachable in practice but
 * still an answer.
 */
export function visibleTabs(
  events: readonly unknown[],
  entrants: readonly unknown[],
  publication?: { entrants: boolean; draws: boolean; results: boolean },
): Tab[] {
  const table: readonly [Tab, boolean][] = [
    ['overview', true],
    ['events', events.length > 0],
    // SP-P7 §4: each public tab exists iff the TD PUBLISHED its data —
    // including published-and-empty, which is a real state ("no confirmed
    // entries yet"), not a placeholder. Unpublished hides the tab entirely
    // (rule 4: a tab whose whole content would be "not yet" is a
    // placeholder in disguise). Seeds ride the DRAWS flag (§3.5: seeds are
    // draw facts); winners ride RESULTS. The parameter is optional only
    // for the pre-SP-P7 callers in old fixtures; absent falls back to the
    // old data-driven entrants rule with no result tabs at all.
    ['entrants', publication ? publication.entrants : entrants.length > 0],
    ['draws', publication?.draws ?? false],
    ['seeds', publication?.draws ?? false],
    ['winners', publication?.results ?? false],
  ];
  return table.filter(([, visible]) => visible).map(([tab]) => tab);
}

/** Requested ∈ visible → requested; anything else → overview. */
export function activeTab(requested: string | null, visible: readonly Tab[]): Tab {
  return visible.includes(requested as Tab) ? (requested as Tab) : 'overview';
}

/** A chain, not a module-scoped Map: the mutable-bindings guard
 * (`tests/helpers/sourceGuards.ts`) rules shared containers out of this
 * process, and three literals do not need a data structure. */
function presetDays(preset: DatePreset): number {
  if (preset === '7d') return 7;
  if (preset === '30d') return 30;
  return 90;
}

/**
 * Conjunction of date-window match and case-folded substring of `q` against
 * name, ORGANIZER and venue (D2 — there is no city on the wire). A custom
 * from/to wins over a preset; a row whose date is unparseable matches only
 * when no date filter is set. The VIEW is not applied here: it selects and
 * orders (`viewRows`), it does not filter the counts.
 */
export function rowMatches(row: SeasonRow, filters: Filters, now: Date): boolean {
  const from = parseIsoDate(filters.from);
  const to = parseIsoDate(filters.to);
  if (from !== null || to !== null || filters.preset !== null) {
    const date = parseIsoDate(row.date);
    if (date === null) return false;
    const t = date.getTime();
    if (from !== null || to !== null) {
      if (from !== null && t < from.getTime()) return false;
      if (to !== null && t > to.getTime()) return false;
    } else {
      const start = utcDayStart(now);
      if (t < start || t > start + presetDays(filters.preset!) * DAY_MS) return false;
    }
  }
  const q = filters.q.trim().toLowerCase();
  if (q !== '') {
    const haystack =
      `${row.name ?? ''} ${row.organizer ?? ''} ${row.venueName ?? ''}`.toLowerCase();
    if (!haystack.includes(q)) return false;
  }
  return true;
}

// Frozen literals — the safe-to-share form the mutable-bindings guard exempts.
const VIEW_CHOICES = Object.freeze<View[]>(['season', 'open', 'completed']);
const PRESET_CHOICES = Object.freeze<DatePreset[]>(['7d', '30d', '90d']);
const COMPLETED_STATUSES = Object.freeze<PageStatus[]>(['completed', 'completed_winners']);

/** D6: the retired status facet's values, mapped onto the new views so a
 * mailing-list link from the old page lands on the equivalent state. */
const LEGACY_STATUS_VIEWS = Object.freeze<Record<string, View>>({
  open: 'open',
  past: 'completed',
  upcoming: 'season',
});

/** The control row's query string → a validated `Filters`. Unknown values fall
 * back to "no filter" rather than erroring — a URL is typeable. */
export function parseFilters(params: URLSearchParams): Filters {
  const view = params.get('view');
  const legacy = params.get('status');
  const preset = params.get('preset');
  return {
    // `Object.hasOwn`, never `legacy in LEGACY_STATUS_VIEWS`: `in` walks the
    // prototype chain, so `?status=toString` would answer true and put
    // `Object.prototype.toString` — a FUNCTION — into `view`. This parses a
    // public URL, which is typeable by anyone.
    view: VIEW_CHOICES.includes(view as View)
      ? (view as View)
      : legacy !== null && Object.hasOwn(LEGACY_STATUS_VIEWS, legacy)
        ? LEGACY_STATUS_VIEWS[legacy]
        : 'season',
    preset: PRESET_CHOICES.includes(preset as DatePreset) ? (preset as DatePreset) : null,
    from: params.get('from') || null,
    to: params.get('to') || null,
    q: params.get('q') ?? '',
  };
}

/** Is a DATE filter active? Drives the chips row and its badge, which say
 * nothing about a text search. The bounds are tested PARSED, the way
 * `rowMatches` reads them: `?from=abc` narrows nothing, so it must not put a
 * "From abc" chip over an unfiltered list. */
export function dateFilterActive(filters: Filters): boolean {
  return (
    filters.preset !== null ||
    parseIsoDate(filters.from) !== null ||
    parseIsoDate(filters.to) !== null
  );
}

/** Is any filter active (drives the "Clear filters" affordance)? The view is
 * deliberately excluded: switching segment is navigation, and offering to
 * "clear" it would name a default the entrant never set. */
export function anyFilterActive(filters: Filters): boolean {
  return dateFilterActive(filters) || filters.q.trim() !== '';
}

/**
 * The rows one segment shows, in that segment's own order (§2.3).
 *
 * `open` leads with the deadline an entrant can still act on — closing
 * soonest first, the SP-P6-2 refinement carried over. `completed` reads most
 * recent first. `season` keeps the server's (date, slug) order verbatim, which
 * is what the month sections are built on.
 */
export function viewRows(rows: readonly SeasonRow[], view: View): SeasonRow[] {
  if (view === 'open') {
    return rows
      .filter((row) => row.status === 'entries_open')
      .sort(
        // Two null countdowns give `Infinity - Infinity` = NaN, which is falsy
        // and therefore falls through to the slug tiebreak — the order this
        // wants, reached by `||` rather than by a branch. Pinned by a test row.
        (a, b) =>
          (a.closesInDays ?? Number.POSITIVE_INFINITY) -
            (b.closesInDays ?? Number.POSITIVE_INFINITY) ||
          a.slug.localeCompare(b.slug),
      );
  }
  if (view === 'completed') {
    return rows
      .filter((row) => COMPLETED_STATUSES.includes(row.status))
      .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '') || a.slug.localeCompare(b.slug));
  }
  return [...rows];
}

/**
 * Group consecutive same-month rows — a walk, not a sort: the caller has
 * already ordered the rows, and re-sorting here would silently overrule it.
 * Undated rows must be filtered out before the call.
 */
function groupByMonth(rows: readonly SeasonRow[]): MonthGroup[] {
  const groups: MonthGroup[] = [];
  for (const row of rows) {
    const date = parseIsoDate(row.date)!;
    const key = `${date.getUTCFullYear()}-${date.getUTCMonth()}`;
    const last = groups[groups.length - 1];
    if (last !== undefined && last.key === key) last.rows.push(row);
    else {
      groups.push({
        key,
        label: `${monthLong(date.getUTCMonth())} ${date.getUTCFullYear()}`,
        rows: [row],
      });
    }
  }
  return groups;
}

/**
 * The Season view's shape (§2.4): active tournaments in ascending month
 * sections, with completed ones and undated ones trailing as their own
 * sections. A tournament with no date is still listed — it is a real state
 * ("date to be confirmed"), not missing data to hide.
 */
export function seasonSections(rows: readonly SeasonRow[]): {
  months: MonthGroup[];
  completed: SeasonRow[];
  undated: SeasonRow[];
} {
  const isCompleted = (row: SeasonRow) => COMPLETED_STATUSES.includes(row.status);
  const active = rows.filter((row) => !isCompleted(row));
  return {
    months: groupByMonth(active.filter((row) => parseIsoDate(row.date) !== null)),
    completed: rows
      .filter(isCompleted)
      .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '') || a.slug.localeCompare(b.slug)),
    undated: active.filter((row) => parseIsoDate(row.date) === null),
  };
}

/**
 * Month sections for the Completed view. Rows arrive already date-descending
 * from `viewRows('completed')`, and grouping preserves that order, so the
 * months come out most-recent-first without a second sort.
 */
export function monthGroupsDesc(rows: readonly SeasonRow[]): MonthGroup[] {
  return groupByMonth(rows.filter((row) => parseIsoDate(row.date) !== null));
}

/**
 * The §2.4 status-column table, one arm per `PageStatus`.
 *
 * Exhaustive over the enum with no default, so adding a status is a compile
 * error here rather than a blank cell in production.
 */
export function statusCell(row: SeasonRow): StatusCell {
  const page = `/e/${encodeURIComponent(row.slug)}`;
  switch (row.status) {
    case 'in_progress_live':
      return { kind: 'chip-live', label: 'In progress · follow live', href: `${page}?tab=draws` };
    case 'in_progress':
      return { kind: 'chip-muted', label: 'In progress' };
    case 'entries_open':
      return { kind: 'chip-open', chip: { kind: 'entriesOpen', closesInDays: row.closesInDays } };
    case 'entries_closed':
      return { kind: 'chip-muted', label: 'Entries closed' };
    case 'completed_winners':
      return { kind: 'link', label: 'Winners', href: `${page}?tab=winners` };
    case 'completed':
      return { kind: 'text', label: 'Completed' };
  }
}

/**
 * How many player blocks one render offers (Z12). The parser accepts more;
 * this only bounds what a single scriptless document lays out.
 * ponytail: hard clamp at 8 blocks — a display bound, not a rule; raise it if
 * a real entry ever needs more players on one form.
 */
export function visibleBlocks(echo: FormEcho, addPlayer: boolean): number {
  return Math.min(8, Math.max(1, echo.players.length) + (addPlayer ? 1 : 0));
}

/** Design §6 totalBar table. Counting ticked boxes from the echo is counting,
 * not fee arithmetic — the total itself is always the server's. */
export function totalBarState(echo: FormEcho): TotalBarState {
  if (echo.refusal !== null) return { kind: 'refused', copy: echo.refusal };
  if (echo.totalCents !== null) {
    return {
      kind: 'quoted',
      totalCents: echo.totalCents,
      eventCount: echo.players.flatMap((player) => player.events).length,
    };
  }
  return { kind: 'unquoted' };
}

/**
 * The Overview timeline (Z9). Per field: absent everywhere → omitted (no
 * placeholder, rule 4); one distinct value → a single moment; disagreement →
 * a per-event variance range. States are against `now`; a range straddling
 * `now` is `current`, as is the tournament day itself.
 */
export function timelineModel(
  events: readonly PhaseEvent[],
  tournamentDate: string | null,
  now: Date,
): TimelineMoment[] {
  const moments: TimelineMoment[] = [];
  const fields: readonly [label: string, key: 'opensAt' | 'closesAt' | 'withdrawsUntil'][] = [
    ['Entries open', 'opensAt'],
    ['Entries close', 'closesAt'],
    ['Withdrawal deadline', 'withdrawsUntil'],
  ];
  for (const [label, key] of fields) {
    const raw = [...new Set(events.map((event) => event[key]).filter((v): v is string => v !== null))];
    const parsed = raw
      .map(parseMoment)
      .filter((moment): moment is Date => moment !== null)
      .map((moment) => moment.getTime());
    if (raw.length === 0 || parsed.length === 0) continue;
    const min = Math.min(...parsed);
    const max = Math.max(...parsed);
    const state = max < now.getTime() ? 'past' : min > now.getTime() ? 'future' : 'current';
    if (raw.length === 1) {
      moments.push({ label, at: raw[0], state });
    } else {
      moments.push({ label, at: null, state, variance: 'per-event' });
    }
  }
  const day = parseIsoDate(tournamentDate);
  if (day !== null) {
    const start = day.getTime();
    const state =
      start + DAY_MS <= now.getTime() ? 'past' : start > now.getTime() ? 'future' : 'current';
    moments.push({ label: 'Tournament', at: tournamentDate, state });
  }
  return moments;
}

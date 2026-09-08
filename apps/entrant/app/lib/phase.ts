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

/**
 * The tournament page's server-rendered panels (ADR 0028): Overview, the
 * merged Draws panel (every event, with its draw and champion once
 * published) and the Players directory. Schedule / Live is a separate route
 * and rides the same bar as a link.
 */
export type Tab = 'overview' | 'draws' | 'players';

export type ChipState =
  | {
      kind: 'entriesOpen';
      closesInDays: number | null;
      /**
       * V3-26-5: set only when `closesInDays` exceeds
       * `CHIP_ABSOLUTE_DATE_THRESHOLD_DAYS` — a pre-formatted, tournament-
       * timezone calendar date (`12 Jan 2035`) that `chipLabel` prefers over
       * the relative count. Computed by `format.ts`'s `capChipCountdown`,
       * not here: this module only counts days, it does not turn instants
       * into words (see the `MONTHS_LONG` note below on why `format.ts`
       * cannot be imported the other way).
       */
      closesAtAbsolute?: string | null;
    }
  | { kind: 'entriesClosed' };

/**
 * V3-26-5 (owner ruling): beyond this many days, "closes in Nd" stops being
 * useful — a fixture's synthetic far-future `closesAt` reads "closes in
 * 3039d" and forces layout overflow at 200% zoom on `StatusChip`
 * (`whitespace-nowrap`/`shrink-0` by design; see V3-26-7's sibling debt
 * row). Past the threshold the chip states the exact date instead.
 */
export const CHIP_ABSOLUTE_DATE_THRESHOLD_DAYS = 99;

export type CtaState = { kind: 'enter'; href: string } | { kind: 'closed' };

/** Public lifecycle supplied by newer page projections. Older projections do
 * not carry this field, so the presentation falls back to publication facts
 * and the server's event-open bit. */
export type TournamentPhase =
  | 'announced'
  | 'entries_open'
  | 'entries_closed'
  | 'draws_published'
  | 'live'
  | 'complete'
  | 'archived';

export function phaseLabel(phase: TournamentPhase): string {
  switch (phase) {
    case 'announced': return 'Announced';
    case 'entries_open': return 'Entries open';
    case 'entries_closed': return 'Entries closed';
    case 'draws_published': return 'Draws published';
    case 'live': return 'Live now';
    case 'complete': return 'Complete';
    case 'archived': return 'Archived';
  }
}

/** Accept the status spellings used by the season projection as an additive
 * compatibility layer. Unknown values intentionally return null. */
export function normalizeTournamentPhase(value: unknown): TournamentPhase | null {
  if (typeof value !== 'string') return null;
  if (value === 'in_progress_live') return 'live';
  if (value === 'in_progress') return 'draws_published';
  if (value === 'completed_winners') return 'complete';
  return Object.prototype.hasOwnProperty.call({
    announced: true, entries_open: true, entries_closed: true,
    draws_published: true, live: true, complete: true, archived: true,
  }, value) ? value as TournamentPhase : null;
}

export function tournamentPhase(input: {
  phase?: unknown;
  status?: unknown;
  publication?: { draws: boolean; results: boolean };
  events?: readonly Pick<PhaseEvent, 'isOpen'>[];
}): TournamentPhase {
  const explicit = normalizeTournamentPhase(input.phase) ?? normalizeTournamentPhase(input.status);
  if (explicit) return explicit;
  if (input.publication?.results) return 'complete';
  if (input.publication?.draws) return 'draws_published';
  if (input.events?.some((event) => event.isOpen)) return 'entries_open';
  return 'entries_closed';
}

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
  /** Calendar end date for multi-day tournaments; legacy rows may omit it. */
  endDate?: string | null;
  eventCount: number;
  status: PageStatus;
  /** Whole days until entries close; server-computed, never 0 (ceil ≥ 1). */
  closesInDays: number | null;
  /**
   * V3-PE01.2: the exact instant `closesInDays` counts down to, as the
   * pinned wire moment (`"%Y-%m-%d %H:%M UTC"`) — present exactly when
   * `closesInDays` is, never on its own. This module cannot format it
   * (a `phase → format` edge would close an import cycle, see the
   * `MONTHS_LONG` note above) — the rendering component pairs this with
   * `timeZone` through `formatMomentInZone`.
   */
  closesAt: string | null;
  /** The tournament's own IANA zone, for rendering `closesAt` in it. */
  timeZone: string;
  /** V3-PE01.3: a best-effort "City, Country" line out of the organizer's
   * free-text venue address; `null` when there is nothing to parse. */
  locality: string | null;
  drawsPublished: boolean;
  winnersPublished: boolean;
}

export interface SeasonList {
  tournaments: SeasonRow[];
  /**
   * Unfiltered, server-side segment counts (§2.3). The discovery page no
   * longer labels its segments with these: the list-pagination contract puts
   * counts on the full FILTERED collection, so the loader derives them from
   * the rows `rowMatches` kept. They stay on the wire as the platform-wide
   * totals.
   */
  counts: { takingEntries: number; completed: number };
  /** The happening-now strip, or null when nothing is in window. */
  now: { slug: string; moreCount: number } | null;
}

/**
 * The season calendar's whole state (P5): WHICH season, and WHAT the reader
 * typed.
 *
 * The lifecycle segments (`?view=season|open|completed|all`) and the date
 * facet (`?preset`/`?from`/`?to`) are retired — one continuous month-grouped
 * season replaced them, so there is no second axis left to keep in the URL.
 * `routes/discovery.tsx` still ANSWERS the retired queries: it canonicalises
 * them away, and the completed segment lands on the past section's anchor.
 */
export interface Filters {
  /**
   * The selected season. `null` is "unspecified" — the loader then picks the
   * season with current work in it, and lets a search run across every season
   * — and `'all'` is the reader deliberately asking for every season at once.
   */
  year: number | 'all' | null;
  q: string;
}

/** A month header plus its rows (§2.4). `key` is `year-monthIndex`. */
export interface MonthGroup {
  key: string;
  label: string;
  rows: SeasonRow[];
}

/**
 * What one calendar row's single right-hand action slot renders (P5).
 *
 * A closed sum type rather than a string plus optional href: a tournament
 * with nothing published has NOWHERE to link (§7 trap 3), and the only way to
 * make that unrepresentable is for the no-link arm to carry no `href` field
 * at all.
 */
export type ActionCell =
  | { kind: 'live'; label: string; href: string }
  // `closesAt`/`timeZone` ride beside the entry link so the renderer can name
  // the closing DAY in the tournament's own zone without this module
  // importing the formatter (see `SeasonRow.closesAt`). No countdown: a "Nd"
  // suffix is not a date a reader can act on, and it goes stale in a
  // screenshot.
  | { kind: 'enter'; href: string; closesAt: string | null; timeZone: string }
  | { kind: 'results'; href: string }
  | { kind: 'text'; label: string };

export type TotalBarState =
  | { kind: 'unquoted' }
  | { kind: 'quoted'; totalCents: number; eventCount: number }
  | { kind: 'refused'; copy: string };

export interface TimelineMoment {
  /** The row label: `Entries`, `Withdrawal deadline`, `Play`. */
  label: string;
  /** The source wire string for a single agreed moment; null for a range. */
  at: string | null;
  state: 'past' | 'current' | 'future';
  /** Present when events disagree — render a "varies by event" range line. */
  variance?: 'per-event';
  /** The word before the date in the value cell — `Closed`, `Closes`,
   *  `Opens`. Absent where the date speaks for itself (`Play`, a withdrawal
   *  deadline). */
  status?: string;
  /** Which moment this is, so a renderer can format it without matching on
   *  the label text: a calendar day for `play`, a venue-local day-month for
   *  the two instants. */
  kind: 'entries' | 'withdrawal' | 'play';
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
  // V3-26-5: the capped, absolute-date form wins whenever it is present —
  // `capChipCountdown` only ever sets it beyond the threshold.
  if (state.closesAtAbsolute) return `Entries open · closes ${state.closesAtAbsolute}`;
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
 * Design §6 visibleTabs table, four-tab form (ADR 0028). A declarative
 * `[tab, predicate]` walk; the function is total: `[overview]` is the minimal
 * answer when no public data exists, but still an answer.
 */
export function visibleTabs(
  events: readonly unknown[],
  entrants: readonly unknown[],
  publication?: { entrants: boolean; draws: boolean; results: boolean },
): Tab[] {
  const table: readonly [Tab, boolean][] = [
    ['overview', true],
    // The Draws panel lists every event from the day the page exists; draws
    // and results join the rows as the organizer publishes them.
    ['draws', events.length > 0],
    // One public roster serves both registered entrants and imported draw
    // players. The API merges those rows; this avoids two competing lists
    // where the draw roster appears to contain only five winners. The
    // parameter is optional for older fixtures and falls back to the legacy
    // entrant-list visibility rule.
    ['players', publication ? publication.entrants || publication.draws : entrants.length > 0],
  ];
  return table.filter(([, visible]) => visible).map(([tab]) => tab);
}

/** Resolve the one canonical section query. An explicit unknown or hidden
 * section is invalid; callers turn it into the route's honest 404 rather than
 * silently rendering a different section. */
export function activeTab(requested: string | null, visible: readonly Tab[]): Tab | null {
  if (requested === null) return 'overview';
  return visible.includes(requested as Tab) ? requested as Tab : null;
}

/**
 * The three retired `?tab` names that were all this one Draws surface
 * (public-visual-fixes P6).
 *
 * `?tab=events` was the event list before the draw index merged into it;
 * `?tab=seeds` and `?tab=winners` were separate panels whose content now
 * rides the draw page and the index rows. All three are ONE destination and
 * three aliases, not four surfaces — the distinction the surface book counts
 * on — and each is in posters, mailing lists and browser history, so a
 * reader following one lands on Draws rather than on a 404. The canonical
 * URL is what the address bar ends up showing: this returns the tab to
 * redirect TO, never a tab to render.
 */
export function legacyDrawsTab(requested: string | null): 'draws' | null {
  return requested === 'events' || requested === 'seeds' || requested === 'winners'
    ? 'draws'
    : null;
}

// Frozen literals — the safe-to-share form the mutable-bindings guard exempts.
const COMPLETED_STATUSES = Object.freeze<PageStatus[]>(['completed', 'completed_winners']);

/**
 * Case-folded substring of `q` against name, ORGANIZER and venue (D2 — there
 * is no city on the wire).
 *
 * The SEASON is deliberately not applied here: it selects (`seasonModel`), so
 * a search reads the same text whichever season is open, and the two pieces of
 * URL state stay independent.
 */
export function rowMatches(row: SeasonRow, q: string): boolean {
  const needle = q.trim().toLowerCase();
  if (needle === '') return true;
  return `${row.name ?? ''} ${row.organizer ?? ''} ${row.venueName ?? ''}`
    .toLowerCase()
    .includes(needle);
}

/**
 * The toolbar's query string → a validated `Filters`. Unknown values fall
 * back to "unspecified" rather than erroring — a URL is typeable, and the
 * retired lifecycle/date queries are simply absent from this vocabulary
 * (`routes/discovery.tsx` redirects them off the URL).
 */
export function parseFilters(params: URLSearchParams): Filters {
  const year = params.get('year');
  return {
    year:
      year === 'all'
        ? 'all'
        : year !== null && /^\d{4}$/.test(year)
          ? Number(year)
          : null,
    q: params.get('q') ?? '',
  };
}

/**
 * The inverse of `parseFilters`: a `Filters` back to the query string that
 * parses to it. One serialiser, shared by the toolbar's links and its hidden
 * form fields, so the two cannot drift.
 */
export function filtersToParams(filters: Filters): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.q.trim() !== '') params.set('q', filters.q);
  if (filters.year !== null) params.set('year', String(filters.year));
  return params;
}

/** Every season the published list actually contains, most recent first.
 * Rows with no parseable date name no season and contribute none. */
export function seasonYears(rows: readonly SeasonRow[]): number[] {
  const years = new Set<number>();
  for (const row of rows) {
    const date = parseIsoDate(row.date);
    if (date !== null) years.add(date.getUTCFullYear());
  }
  return [...years].sort((a, b) => b - a);
}

/**
 * Which season the page is showing — `null` meaning "every season at once".
 *
 * A deliberate `?year=` wins. Otherwise a SEARCH crosses seasons (a reader
 * who types a name is looking for that tournament, not for that tournament in
 * one particular year), and a bare visit lands on the season with current work
 * in it: this calendar year when it has any rows, else the nearest future
 * season, else the most recent past one.
 */
export function resolveSeason(
  rows: readonly SeasonRow[],
  filters: Filters,
  now: Date,
): number | null {
  if (typeof filters.year === 'number') return filters.year;
  if (filters.year === 'all') return null;
  if (filters.q.trim() !== '') return null;
  const years = seasonYears(rows);
  const current = now.getUTCFullYear();
  if (years.includes(current)) return current;
  const future = years.filter((year) => year > current);
  if (future.length > 0) return future[future.length - 1];
  return years[0] ?? current;
}

/**
 * Has this tournament already happened?
 *
 * Publication first (a completed tournament is past whatever its stored date
 * says), then the calendar day — never the other way round, because a date is
 * the one fact on this row a director may not have kept current.
 */
function isPast(row: SeasonRow, now: Date): boolean {
  if (COMPLETED_STATUSES.includes(row.status)) return true;
  const date = parseIsoDate(row.date);
  const endDate = parseIsoDate(row.endDate ?? null) ?? date;
  return endDate !== null && endDate.getTime() < utcDayStart(now);
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

/** One season, as the page renders it (P5). */
export interface SeasonModel {
  /** The season on screen; `null` = every season at once. */
  season: number | null;
  /** Every season the published list contains, most recent first. */
  years: number[];
  /** Ascending month sections — the full-weight half of the page. */
  upcoming: MonthGroup[];
  /** Active tournaments whose date the organizer has not set yet. */
  upcomingUndated: SeasonRow[];
  /** "Earlier this season": descending month sections, muted. */
  past: MonthGroup[];
  /** Past tournaments with no recorded date. */
  pastUndated: SeasonRow[];
  /** How many rows this page lists. */
  listedCount: number;
  /** How many rows the wire carried, before the season and the search. */
  publishedCount: number;
}

const byDateAsc = (a: SeasonRow, b: SeasonRow) =>
  (a.date ?? '').localeCompare(b.date ?? '') || a.slug.localeCompare(b.slug);
const byDateDesc = (a: SeasonRow, b: SeasonRow) =>
  (b.date ?? '').localeCompare(a.date ?? '') || a.slug.localeCompare(b.slug);
const bySlug = (a: SeasonRow, b: SeasonRow) => a.slug.localeCompare(b.slug);
const dated = (row: SeasonRow) => parseIsoDate(row.date) !== null;

/**
 * The whole page shape, from the wire rows plus the URL state (P5).
 *
 * One continuous season: what is still to come, ascending, then what already
 * happened, descending. There are no lifecycle segments to switch between and
 * no archive elsewhere to detour to.
 *
 * **A dateless tournament belongs to no season**, so it is listed in EVERY
 * season rather than hidden in all of them, in its own "date to be confirmed"
 * section. Nothing here invents a date to place a row in a month.
 */
export function seasonModel(
  rows: readonly SeasonRow[],
  filters: Filters,
  now: Date,
): SeasonModel {
  const season = resolveSeason(rows, filters, now);
  const inSeason = rows.filter((row) => {
    if (!rowMatches(row, filters.q)) return false;
    if (season === null) return true;
    const date = parseIsoDate(row.date);
    return date === null || date.getUTCFullYear() === season;
  });
  const upcomingRows = inSeason.filter((row) => !isPast(row, now));
  const pastRows = inSeason.filter((row) => isPast(row, now));
  return {
    season,
    years: seasonYears(rows),
    upcoming: groupByMonth([...upcomingRows.filter(dated)].sort(byDateAsc)),
    upcomingUndated: [...upcomingRows.filter((row) => !dated(row))].sort(bySlug),
    past: groupByMonth([...pastRows.filter(dated)].sort(byDateDesc)),
    pastUndated: [...pastRows.filter((row) => !dated(row))].sort(bySlug),
    listedCount: inSeason.length,
    publishedCount: rows.length,
  };
}

/**
 * The title as the calendar shows it (P5).
 *
 * Organizers commonly stamp the year into the stored name ("2026 Taipei
 * Open"), and under a "July 2026" month header that year is then said twice
 * on one line. The STORED name is untouched — this is a display
 * normalisation, and a deliberately narrow one: exactly one leading or
 * trailing token equal to THIS row's own year, with the separator it sits
 * against, and only when a name is left over. A row with no date has no year
 * to be redundant with, so its name is returned verbatim.
 */
export function displayTitle(row: SeasonRow): string {
  const name = row.name ?? row.slug;
  const date = parseIsoDate(row.date);
  if (date === null) return name;
  const year = String(date.getUTCFullYear());
  const separator = '[\\s\\u2013\\u2014/.:-]+';
  const stripped = name
    .replace(new RegExp(`^${year}${separator}`), '')
    .replace(new RegExp(`${separator}${year}$`), '')
    .trim();
  return stripped === '' ? name : stripped;
}

/**
 * The one right-hand action a calendar row offers (P5).
 *
 * Exhaustive over `PageStatus` with no default, so adding a status is a
 * compile error here rather than a blank slot in production. A PAST row gets
 * the results treatment whatever its stored status says: an event that has
 * happened cannot be entered, and offering the entry flow for it would be a
 * dead end.
 */
export function actionCell(row: SeasonRow, past: boolean): ActionCell {
  const page = `/e/${encodeURIComponent(row.slug)}`;
  // Draws and winners share one public panel (ADR 0028); either publication
  // makes the row link there. Neither means there is nothing to link to, and
  // the arm that says so carries no `href` to grow one by accident.
  const results = (): ActionCell =>
    row.drawsPublished || row.winnersPublished
      ? { kind: 'results', href: `${page}?tab=draws` }
      : { kind: 'text', label: 'Results not published' };
  if (past) return results();
  switch (row.status) {
    case 'in_progress_live':
      return { kind: 'live', label: 'Follow live', href: `${page}?tab=draws` };
    case 'in_progress':
      return { kind: 'text', label: 'In progress' };
    case 'entries_open':
      return {
        kind: 'enter',
        href: `${page}/enter`,
        closesAt: row.closesAt,
        timeZone: row.timeZone,
      };
    case 'entries_closed':
      return { kind: 'text', label: 'Entries closed' };
    case 'completed_winners':
    case 'completed':
      return results();
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
 * The Overview's key dates — the ones that are still a question, and no
 * others (public-visual-fixes P6).
 *
 * The old model printed every window a director had ever set, so a
 * tournament being played today led its Overview with the day entries
 * opened two months ago and the day they closed three weeks ago: four rows
 * of elapsed timestamps above the one date anybody was looking for. What
 * survives is:
 *
 * - **Play** — the tournament's own day, always, and labelled for what it is
 *   rather than "Tournament" on a page that is entirely about a tournament.
 * - **Entries** — one row, not three: `Opens 1 Jun` before the window, then
 *   `Closes 22 Jul`, then `Closed 22 Jul`. The opening timestamp is not a
 *   fact once entries are open, so it is dropped rather than restated.
 * - **Withdrawal deadline** — only while it is still ahead. A passed
 *   deadline is not something a reader can act on.
 *
 * Once the tournament day itself is past, only Play remains: a completed
 * event's entry windows are history, not information.
 *
 * Per field: absent everywhere → omitted (no placeholder, rule 4); one
 * distinct value → a single moment; disagreement → a per-event variance
 * range. States are against `now`; a range straddling `now` is `current`, as
 * is the tournament day itself.
 */
export function timelineModel(
  events: readonly PhaseEvent[],
  tournamentDate: string | null,
  now: Date,
): TimelineMoment[] {
  const moments: TimelineMoment[] = [];
  const day = parseIsoDate(tournamentDate);
  const playState =
    day === null
      ? null
      : day.getTime() + DAY_MS <= now.getTime()
        ? 'past'
        : day.getTime() > now.getTime()
          ? 'future'
          : 'current';

  function field(key: 'opensAt' | 'closesAt' | 'withdrawsUntil') {
    const raw = [...new Set(events.map((event) => event[key]).filter((v): v is string => v !== null))];
    const parsed = raw
      .map(parseMoment)
      .filter((moment): moment is Date => moment !== null)
      .map((moment) => moment.getTime());
    if (raw.length === 0 || parsed.length === 0) return null;
    const min = Math.min(...parsed);
    const max = Math.max(...parsed);
    const state: TimelineMoment['state'] =
      max < now.getTime() ? 'past' : min > now.getTime() ? 'future' : 'current';
    return { at: raw.length === 1 ? raw[0] : null, state, varies: raw.length > 1 };
  }

  const varianceOf = (varies: boolean) =>
    varies ? ({ variance: 'per-event' } as const) : {};

  if (playState !== 'past') {
    const opens = field('opensAt');
    const closes = field('closesAt');
    if (opens !== null && opens.state === 'future') {
      // Entries have not opened yet: the opening date is the live fact and
      // the closing date is not yet worth a row.
      moments.push({
        label: 'Entries',
        at: opens.at,
        state: opens.state,
        status: 'Opens',
        kind: 'entries',
        ...varianceOf(opens.varies),
      });
    } else if (closes !== null) {
      moments.push({
        label: 'Entries',
        at: closes.at,
        state: closes.state,
        status: closes.state === 'past' ? 'Closed' : 'Closes',
        kind: 'entries',
        ...varianceOf(closes.varies),
      });
    }

    const withdraws = field('withdrawsUntil');
    if (withdraws !== null && withdraws.state !== 'past') {
      moments.push({
        label: 'Withdrawal deadline',
        at: withdraws.at,
        state: withdraws.state,
        kind: 'withdrawal',
        ...varianceOf(withdraws.varies),
      });
    }
  }

  if (playState !== null) {
    moments.push({ label: 'Play', at: tournamentDate, state: playState, kind: 'play' });
  }
  return moments;
}

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
 * Live/Finished/In-play), and the status facets are open/upcoming/past with
 * `closed` for undatable closed tournaments (design §6 statusFacet table).
 */
import type { FormEcho } from './echo';

export type Tab = 'overview' | 'events' | 'entrants';

export type ChipState =
  | { kind: 'entriesOpen'; closesInDays: number | null }
  | { kind: 'entriesClosed' };

export type CtaState = { kind: 'enter'; href: string } | { kind: 'closed' };

/** The G1 discovery-list item shape (proposed; mocked in Phase B). */
export interface DiscoveryCard {
  slug: string;
  name: string | null;
  /** Raw `tournament_date` string — nullable, ISO by convention only. */
  tournamentDate: string | null;
  venueName: string | null;
  eventCount: number;
  /** Server-computed OR of `_event_is_open` — never re-derived here. */
  entriesOpen: boolean;
  /** Min `closesAt` over currently-open events, pinned wire format. */
  entriesCloseAt: string | null;
}

export type StatusFacetChoice = 'open' | 'upcoming' | 'past';
export type DatePreset = '7d' | '30d' | '90d';

export interface Filters {
  status: StatusFacetChoice | null;
  preset: DatePreset | null;
  from: string | null;
  to: string | null;
  q: string;
}

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

/** The same chip, computed from a discovery card's G1 fields —
 * `entriesCloseAt` is already the server's min over open events. */
export function cardChipState(
  card: Pick<DiscoveryCard, 'entriesOpen' | 'entriesCloseAt'>,
  now: Date,
): ChipState {
  if (!card.entriesOpen) return { kind: 'entriesClosed' };
  const deadline = parseMoment(card.entriesCloseAt);
  if (deadline === null) return { kind: 'entriesOpen', closesInDays: null };
  return { kind: 'entriesOpen', closesInDays: countdown(deadline.getTime(), now) };
}

/** The chip's sentence-case public copy — the ruling's exact two states. */
export function chipLabel(state: ChipState): string {
  if (state.kind === 'entriesClosed') return 'Entries closed';
  if (state.closesInDays === null) return 'Entries open';
  if (state.closesInDays === 0) return 'Entries open — closes today';
  return `Entries open — closes in ${state.closesInDays}d`;
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
export function visibleTabs(events: readonly unknown[], entrants: readonly unknown[]): Tab[] {
  const table: readonly [Tab, boolean][] = [
    ['overview', true],
    ['events', events.length > 0],
    ['entrants', entrants.length > 0],
  ];
  return table.filter(([, visible]) => visible).map(([tab]) => tab);
}

/** Requested ∈ visible → requested; anything else → overview. */
export function activeTab(requested: string | null, visible: readonly Tab[]): Tab {
  return visible.includes(requested as Tab) ? (requested as Tab) : 'overview';
}

/**
 * Design §6 statusFacet table (G4 declined). `closed` is the undatable
 * remainder: listed, matches no status/date facet, carries no date chip.
 */
export function statusFacet(
  card: Pick<DiscoveryCard, 'entriesOpen' | 'tournamentDate'>,
  now: Date,
): StatusFacetChoice | 'closed' {
  if (card.entriesOpen) return 'open';
  const date = parseIsoDate(card.tournamentDate);
  if (date === null) return 'closed';
  return date.getTime() >= utcDayStart(now) ? 'upcoming' : 'past';
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
 * Conjunction of facet match, date-window match and case-folded substring of
 * `q` against name and venue. A custom from/to wins over a preset; a card
 * whose date is unparseable matches only when no date filter is set.
 */
export function cardMatches(card: DiscoveryCard, filters: Filters, now: Date): boolean {
  if (filters.status !== null && statusFacet(card, now) !== filters.status) return false;

  const from = parseIsoDate(filters.from);
  const to = parseIsoDate(filters.to);
  const hasDateFilter = from !== null || to !== null || filters.preset !== null;
  if (hasDateFilter) {
    const date = parseIsoDate(card.tournamentDate);
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
    const haystack = `${card.name ?? ''} ${card.venueName ?? ''}`.toLowerCase();
    if (!haystack.includes(q)) return false;
  }
  return true;
}

/**
 * Upcoming-first (design §3): parseable today-or-future dates ascending, then
 * undated/unparseable, then past descending. Name then slug as tiebreakers so
 * the order is total and stable across renders.
 */
export function orderCards(cards: readonly DiscoveryCard[], now: Date): DiscoveryCard[] {
  const start = utcDayStart(now);
  const rank = (card: DiscoveryCard): [number, number] => {
    const date = parseIsoDate(card.tournamentDate);
    if (date === null) return [1, 0];
    const t = date.getTime();
    return t >= start ? [0, t] : [2, -t];
  };
  return [...cards].sort((a, b) => {
    const [groupA, keyA] = rank(a);
    const [groupB, keyB] = rank(b);
    if (groupA !== groupB) return groupA - groupB;
    if (keyA !== keyB) return keyA - keyB;
    const nameOrder = (a.name ?? '').localeCompare(b.name ?? '');
    return nameOrder !== 0 ? nameOrder : a.slug.localeCompare(b.slug);
  });
}

// Frozen literals — the safe-to-share form the mutable-bindings guard exempts.
const STATUS_CHOICES = Object.freeze<StatusFacetChoice[]>(['open', 'upcoming', 'past']);
const PRESET_CHOICES = Object.freeze<DatePreset[]>(['7d', '30d', '90d']);

/** The filter GET form's query string → a validated `Filters`. Unknown values
 * fall back to "no filter" rather than erroring — a URL is typeable. */
export function parseFilters(params: URLSearchParams): Filters {
  const status = params.get('status');
  const preset = params.get('preset');
  return {
    status: STATUS_CHOICES.includes(status as StatusFacetChoice)
      ? (status as StatusFacetChoice)
      : null,
    preset: PRESET_CHOICES.includes(preset as DatePreset) ? (preset as DatePreset) : null,
    from: params.get('from') || null,
    to: params.get('to') || null,
    q: params.get('q') ?? '',
  };
}

/** Is any filter active (drives the "Clear filters" affordance)? */
export function anyFilterActive(filters: Filters): boolean {
  return (
    filters.status !== null ||
    filters.preset !== null ||
    filters.from !== null ||
    filters.to !== null ||
    filters.q.trim() !== ''
  );
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

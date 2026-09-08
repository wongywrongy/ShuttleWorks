/**
 * The SP-P6-2 component inventory, state by state — SSR string renders
 * (`react-dom/server`), because there is no client behaviour to test by
 * construction: every component is props → markup, no hooks, no handlers
 * (the structural guards over `app/components/` enforce the posture; these
 * assert the markup each state produces).
 *
 * `.ts`, not `.tsx`, so `createElement` stands in for JSX — this package's
 * vitest include and tsconfig only take `tests/**\/*.ts` (see the deviation
 * note in `entry.render.test.ts`).
 */
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { DateBadge } from '../app/components/DateBadge';
import { EmptyState } from '../app/components/EmptyState';
import { EntrantsList } from '../app/components/EntrantsList';
import { EventRow } from '../app/components/EventRow';
import { HeroHeader } from '../app/components/HeroHeader';
import { MatchCard } from '../app/components/MatchCard';
import { NowStrip } from '../app/components/NowStrip';
import { PlayShell } from '../app/components/PlayShell';
import { SeasonCalendar } from '../app/components/SeasonCalendar';
import { SeasonControls } from '../app/components/SeasonControls';
import { SeasonStatusCell } from '../app/components/SeasonStatusCell';
import { StatusChip } from '../app/components/StatusChip';
import { StickyTotalBar } from '../app/components/StickyTotalBar';
import { TabBar } from '../app/components/TabBar';
import { Breadcrumbs } from '../app/components/Breadcrumbs';
import { SegmentedNav } from '../app/components/SegmentedNav';
import type { FrameTab } from '../app/lib/tournamentFrame';
import {
  capChipCountdown,
  formatDateInZone,
  formatDateLong,
  formatDateTimeInZone,
  formatDayMonthInZone,
  formatDayMonthTimeInZone,
} from '../app/lib/format';
import type { EntryEventDTO } from '../app/lib/entryPage.types';
import type { DrawCardDTO } from '../app/lib/draws.types';
import { actionCell, seasonModel } from '../app/lib/phase';
import type { ChipState, Filters, SeasonRow } from '../app/lib/phase';
import { EntrantSessionContext } from '../app/lib/sessionContext';


const OPEN_CHIP: ChipState = { kind: 'entriesOpen', closesInDays: 4 };
const CLOSED_CHIP: ChipState = { kind: 'entriesClosed' };

/** One row of the SP-P8 season list — the same fixture `phase.test.ts` uses,
 * so both suites describe the payload the same way. */
const row = (over: Partial<SeasonRow> = {}): SeasonRow => ({
  slug: 's', name: 'T', organizer: null, venueName: null, date: null,
  eventCount: 0, status: 'entries_closed', closesInDays: null,
  closesAt: null, timeZone: 'UTC', locality: null,
  drawsPublished: false, winnersPublished: false, ...over,
});

const NO_FILTERS: Filters = { year: null, q: '' };

function event(overrides: Partial<EntryEventDTO> = {}): EntryEventDTO {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    code: 'MS',
    discipline: "Men's Singles",
    feeCents: 1400,
    genderConstraint: 'M',
    opensAt: '2026-06-01 09:00 UTC',
    closesAt: '2026-08-14 23:59 UTC',
    withdrawsUntil: '2026-09-05 18:00 UTC',
    opensAtIso: null,
    closesAtIso: null,
    withdrawsUntilIso: null,
    isOpen: true,
    ageBracketed: false,
    entryCount: 7,
    ...overrides,
  };
}

/**
 * The class tokens of the one element carrying `token`, so a layout
 * assertion names an element by a class it must have rather than by its
 * position in the markup. `[]` when nothing carries it — which is a failing
 * `toContain`, i.e. the right answer for "that element is gone".
 */
function classTokens(html: string, token: string): string[] {
  const attr = (html.match(/class="[^"]*"/g) ?? [])
    .map((a) => a.slice(7, -1).split(/\s+/))
    .find((tokens) => tokens.includes(token));
  return attr ?? [];
}

// ---- StatusChip: every state of the ruled two-state union ------------------

describe('StatusChip', () => {
  it.each([
    [{ kind: 'entriesOpen', closesInDays: 4 } as ChipState, 'Entries open · closes in 4d'],
    [{ kind: 'entriesOpen', closesInDays: 0 } as ChipState, 'Entries open · closes today'],
    [{ kind: 'entriesOpen', closesInDays: null } as ChipState, 'Entries open'],
    [{ kind: 'entriesClosed' } as ChipState, 'Entries closed'],
    // V3-26-5: past the cap threshold with an absolute date already
    // attached (as `capChipCountdown` would set it), StatusChip renders the
    // date form, not "closes in Nd".
    [
      { kind: 'entriesOpen', closesInDays: 3039, closesAtAbsolute: '12 Jan 2035' } as ChipState,
      'Entries open · closes 12 Jan 2035',
    ],
  ])('%o renders its exact ruled copy', (state, copy) => {
    expect(renderToStaticMarkup(h(StatusChip, { state }))).toContain(copy);
  });

  it('never renders the raw "closes in 3039d" fixture value once capped', () => {
    const capped: ChipState = { kind: 'entriesOpen', closesInDays: 3039, closesAtAbsolute: '12 Jan 2035' };
    expect(renderToStaticMarkup(h(StatusChip, { state: capped }))).not.toContain('3039d');
  });

  it('tones open on the live ramp, colour + text only (ADR 0027)', () => {
    const html = renderToStaticMarkup(h(StatusChip, { state: OPEN_CHIP }));
    expect(html).toContain('text-status-live');
    expect(html).not.toContain('aria-hidden');
    expect(html).not.toContain('rounded-full');
  });

  it('tones closed on the done ramp, dotless', () => {
    const html = renderToStaticMarkup(h(StatusChip, { state: CLOSED_CHIP }));
    expect(html).toContain('text-status-done');
    expect(html).not.toContain('aria-hidden');
  });

  it('renders no other vocabulary — Live/Finished/In play are cut (STOP-4)', () => {
    for (const state of [OPEN_CHIP, CLOSED_CHIP]) {
      const html = renderToStaticMarkup(h(StatusChip, { state }));
      expect(html).not.toMatch(/Live|Finished|In play/);
    }
  });
});

// ---- capChipCountdown: V3-26-5's threshold boundary -------------------------

describe('capChipCountdown', () => {
  const CLOSES_AT = '2035-01-12 09:00 UTC';

  it('at the threshold (99d), leaves the relative count alone', () => {
    const state: ChipState = { kind: 'entriesOpen', closesInDays: 99 };
    expect(capChipCountdown(state, CLOSES_AT, 'UTC')).toEqual(state);
  });

  it('just past the threshold (100d), caps to the absolute date', () => {
    const state: ChipState = { kind: 'entriesOpen', closesInDays: 100 };
    expect(capChipCountdown(state, CLOSES_AT, 'UTC')).toEqual({
      kind: 'entriesOpen',
      closesInDays: 100,
      closesAtAbsolute: '12 Jan 2035',
    });
  });

  it('the T030-style extreme (3039d) also caps', () => {
    const state: ChipState = { kind: 'entriesOpen', closesInDays: 3039 };
    expect(capChipCountdown(state, CLOSES_AT, 'UTC').kind).toBe('entriesOpen');
    expect((capChipCountdown(state, CLOSES_AT, 'UTC') as { closesAtAbsolute?: string | null }).closesAtAbsolute).toBe(
      '12 Jan 2035',
    );
  });

  it('renders the tournament zone, not UTC, when they differ', () => {
    // 2035-01-12 09:00 UTC is still 2035-01-12 in Tokyo (+09:00, so 18:00
    // local) — pick a zone/instant pair where the calendar day actually
    // shifts to prove the zone is really being applied.
    const state: ChipState = { kind: 'entriesOpen', closesInDays: 100 };
    const capped = capChipCountdown(state, '2035-01-12 23:30 UTC', 'Pacific/Auckland');
    expect((capped as { closesAtAbsolute?: string | null }).closesAtAbsolute).toBe('13 Jan 2035');
  });

  it('leaves entriesClosed and no-deadline states untouched', () => {
    expect(capChipCountdown({ kind: 'entriesClosed' }, CLOSES_AT, 'UTC')).toEqual({ kind: 'entriesClosed' });
    const noDeadline: ChipState = { kind: 'entriesOpen', closesInDays: 100 };
    expect(capChipCountdown(noDeadline, null, 'UTC')).toEqual(noDeadline);
  });
});

describe('formatDateInZone', () => {
  it('formats a valid moment as a bare calendar date', () => {
    expect(formatDateInZone('2035-01-12 09:00 UTC', 'UTC')).toBe('12 Jan 2035');
  });

  it('is null for an unparseable wire value', () => {
    expect(formatDateInZone('not-a-moment', 'UTC')).toBeNull();
  });
});

/**
 * public-visual-fixes P7: the venue-local conversions, at the two boundaries
 * that break a naive "trim the suffix" implementation — midnight and a
 * cross-zone deadline.
 */
describe('venue-local instants (P7)', () => {
  it('moves a deadline onto the RIGHT calendar day in the venue zone', () => {
    // 15:30 UTC on 31 July is 00:30 on 1 August in Seoul. A day-only
    // rendering that trimmed the suffix off the UTC value would state
    // 31 July — the day before the deadline the director actually set.
    expect(formatDayMonthInZone('2026-07-31 15:30 UTC', 'Asia/Seoul')).toBe('1 Aug');
    expect(formatDayMonthTimeInZone('2026-07-31 15:30 UTC', 'Asia/Seoul')).toBe('1 Aug, 00:30');
    expect(formatDateTimeInZone('2026-07-31 15:30 UTC', 'Asia/Seoul')).toBe('1 Aug 2026, 00:30');
    // The same instant read at the venue in London is still 31 July.
    expect(formatDayMonthTimeInZone('2026-07-31 15:30 UTC', 'Europe/London')).toBe('31 Jul, 16:30');
  });

  it('keeps midnight on its own day and does not roll a 23:30 evening over', () => {
    // Exactly midnight, venue-local: the day is the one the clock reads,
    // never the previous one via a 24:00 spelling.
    expect(formatDayMonthTimeInZone('2026-07-31 15:00 UTC', 'Asia/Seoul')).toBe('1 Aug, 00:00');
    // A 23:30 local match must not shift its day either — the case a
    // UTC-rendered card gets wrong in the other direction.
    expect(formatDayMonthTimeInZone('2026-08-01 14:30 UTC', 'Asia/Seoul')).toBe('1 Aug, 23:30');
    expect(formatDateTimeInZone('2026-08-01 14:30 UTC', 'Asia/Seoul')).toBe('1 Aug 2026, 23:30');
  });

  it('never rounds a real deadline, and never prints a zone or an offset', () => {
    const closes = formatDateTimeInZone('2026-08-14 23:59 UTC', 'Europe/London');
    // 23:59 stays 23:59 (as 00:59 the next day in BST) — not "midnight",
    // not "about 1am", not the 15th at 01:00.
    expect(closes).toBe('15 Aug 2026, 00:59');
    expect(closes).not.toMatch(/UTC|GMT|BST|[+-]\d{2}:?\d{2}|Europe\/London/);
  });

  it('omits an unparseable moment and degrades an unknown zone to UTC', () => {
    expect(formatDayMonthTimeInZone('not-a-moment', 'Asia/Seoul')).toBeNull();
    expect(formatDateTimeInZone('not-a-moment', 'Asia/Seoul')).toBeNull();
    // An unrecognised zone is not a reason to drop a known instant.
    expect(formatDateTimeInZone('2026-08-14 23:59 UTC', 'Mars/Olympus')).toBe('14 Aug 2026, 23:59');
  });
});

// ---- DateBadge -------------------------------------------------------------

describe('DateBadge', () => {
  it('renders the month/day block for a parseable date', () => {
    const html = renderToStaticMarkup(h(DateBadge, { date: '2026-09-19' }));
    expect(html).toContain('Sep');
    expect(html).toContain('19');
    expect(html).not.toContain('TBC');
  });

  it.each([[null], ['sometime soon']])('renders TBC for %o, inventing nothing', (date) => {
    const html = renderToStaticMarkup(h(DateBadge, { date }));
    expect(html).toContain('TBC');
    expect(html).not.toMatch(/Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec/);
  });

  it('is decoration: aria-hidden, since the card text carries the date', () => {
    expect(renderToStaticMarkup(h(DateBadge, { date: '2026-09-19' }))).toContain(
      'aria-hidden="true"',
    );
  });
});

// ---- SeasonStatusCell: the one action slot (P5) -----------------------------
//
// `TournamentCard` and `FilterStrip` used to be asserted here. Both are the
// discovery card/sidebar the season calendar replaced, and both were deleted;
// their describes went with the components rather than being carried as tests
// for markup nothing renders.

describe('SeasonStatusCell', () => {
  it('renders Results as a link and the unpublished case as text (§7 trap 3)', () => {
    const winners = renderToStaticMarkup(
      h(SeasonStatusCell, { cell: actionCell(row({ slug: 'x', status: 'completed_winners', winnersPublished: true }), true) }),
    );
    expect(winners).toContain('href="/e/x?tab=draws"');
    expect(winners).toContain('Results');

    const done = renderToStaticMarkup(
      h(SeasonStatusCell, { cell: actionCell(row({ status: 'completed' }), true) }),
    );
    expect(done).toContain('Results not published');
    expect(done).not.toContain('<a');
  });

  it('gives Follow live the same affordance as Results', () => {
    const live = renderToStaticMarkup(
      h(SeasonStatusCell, { cell: actionCell(row({ slug: 'x', status: 'in_progress_live' }), false) }),
    );
    // P7: the decorative trailing arrow is gone from every action arm — an
    // underlined link already says it leads somewhere, and the glyph rode
    // only two of the four arms.
    expect(live).toContain('Follow live');
    expect(live).not.toContain('→');
  });

  it('lifts every real link above the row-wide stretched link', () => {
    const cells = [
      actionCell(row({ slug: 'x', status: 'in_progress_live' }), false),
      actionCell(row({ slug: 'x', status: 'entries_open' }), false),
      actionCell(row({ slug: 'x', status: 'completed_winners', drawsPublished: true }), true),
    ];
    for (const cell of cells) {
      const html = renderToStaticMarkup(h(SeasonStatusCell, { cell }));
      expect(classTokens(html, 'z-10')).toContain('relative');
    }
  });

  it('links Enter to the real entry flow and names the closing day in the event zone', () => {
    const html = renderToStaticMarkup(
      h(SeasonStatusCell, {
        cell: actionCell(row({
          slug: 'korea', status: 'entries_open',
          // 15:30 UTC on 31 July is already 1 August in Seoul — CONVERSION,
          // not a trimmed suffix (contract §7.1). Trimming would name the
          // wrong day here, which is exactly why the rule exists.
          closesAt: '2026-07-31 15:30 UTC', timeZone: 'Asia/Seoul',
        }), false),
      }),
    );
    expect(html).toContain('href="/e/korea/enter"');
    expect(html).toContain('Enter · closes 1 Aug');
    // No countdown, no offset, no zone spelling.
    expect(html).not.toMatch(/\bd\b|GMT|KST|UTC/);
  });

  it('degrades to a bare Enter when the organizer set no deadline', () => {
    const html = renderToStaticMarkup(
      h(SeasonStatusCell, { cell: actionCell(row({ slug: 'x', status: 'entries_open' }), false) }),
    );
    expect(html).toContain('>Enter</a>');
    expect(html).not.toContain('closes');
  });

  it('says Entries closed where entry status is what matters', () => {
    const html = renderToStaticMarkup(
      h(SeasonStatusCell, { cell: actionCell(row({ status: 'entries_closed' }), false) }),
    );
    expect(html).toContain('Entries closed');
    expect(html).not.toContain('<a');
  });
});

// ---- NowStrip (SP-P8 §2.1) -------------------------------------------------

describe('NowStrip', () => {
  const live = row({
    slug: 'x', name: 'Fall Open', venueName: 'Hall', date: '2026-09-12',
    eventCount: 9, status: 'in_progress_live', drawsPublished: true,
  });

  it('carries the follow-live deep link and NO player count (degraded field)', () => {
    const html = renderToStaticMarkup(h(NowStrip, { row: live, moreCount: 0 }));
    expect(html).toContain('Live today');
    expect(html).toContain('Fall Open');
    expect(html).toContain('href="/e/x?tab=draws"');
    expect(html).not.toMatch(/player/i);
  });

  it('states venue · date · events, and nothing it was not given', () => {
    const html = renderToStaticMarkup(h(NowStrip, { row: live, moreCount: 0 }));
    expect(html).toContain(`Hall · ${formatDateLong('2026-09-12')} · 9 events`);

    const bare = renderToStaticMarkup(
      h(NowStrip, { row: row({ slug: 'x', name: 'Bare', eventCount: 1 }), moreCount: 0 }),
    );
    // Exactly the one part it has — an absent venue leaves no dangling middot.
    expect(bare).toContain('>1 event<');
    expect(bare).not.toContain('null');
  });

  it('appends +N more only when there is more', () => {
    expect(renderToStaticMarkup(h(NowStrip, { row: live, moreCount: 1 }))).toContain('+1 more');
    expect(renderToStaticMarkup(h(NowStrip, { row: live, moreCount: 0 }))).not.toContain('more');
  });

  it('carries live-ness in text and a sweep on the rule, with no tinted band or dot (ADR 0028)', () => {
    const html = renderToStaticMarkup(h(NowStrip, { row: live, moreCount: 0 }));
    expect(html).toContain('text-status-live');
    expect(html).toContain('sw-sweep');
    expect(html).toContain('bg-surface-raised');
    expect(html).not.toContain('bg-surface-inverse');
    expect(html).not.toContain('bg-status-live-bg');
    expect(html).not.toContain('rounded-full');
    expect(html).not.toContain('animate-pulse');
    expect(html).not.toMatch(/#[0-9a-f]{3,8}\b/i);
  });
});

// ---- SeasonCalendar: one continuous season (P5) -----------------------------

/** The model the page hands the calendar, built the same way the loader does. */
const model = (rows: SeasonRow[], filters: Filters = NO_FILTERS, now = new Date(Date.UTC(2026, 7, 11))) =>
  seasonModel(rows, filters, now);

describe('SeasonCalendar', () => {
  it('leads with upcoming months and trails with Earlier this season', () => {
    const html = renderToStaticMarkup(
      h(SeasonCalendar, {
        model: model([
          row({ slug: 'a', name: 'Autumn', status: 'entries_open', date: '2026-09-11' }),
          row({ slug: 'b', name: 'Bygone', status: 'completed', date: '2026-05-30' }),
        ]),
      }),
    );
    expect(html).toContain('September 2026');
    expect(html).toContain('May 2026');
    expect(html).toContain('Earlier this season');
    expect(html).toContain('id="calendar"');
    expect(html).toContain('id="past"');
    expect(html.indexOf('Autumn')).toBeLessThan(html.indexOf('Bygone'));
  });

  it('renders no past heading at all when the season has no past (§2.4)', () => {
    const html = renderToStaticMarkup(
      h(SeasonCalendar, {
        model: model([row({ slug: 'a', name: 'Autumn', status: 'entries_open', date: '2026-09-11' })]),
      }),
    );
    expect(html).not.toContain('Earlier this season');
    expect(html).not.toContain('id="past"');
  });

  it('quiets a past row by what it drops, and offers Results only', () => {
    const html = renderToStaticMarkup(
      h(SeasonCalendar, {
        model: model([
          row({
            slug: 'b', name: 'Bygone', status: 'completed_winners', date: '2026-05-30',
            venueName: 'Riverside Hall', locality: 'Winchester, United Kingdom',
            organizer: 'Wessex BC', winnersPublished: true,
          }),
        ]),
      }),
    );
    expect(html).toContain('Results');
    expect(html).not.toContain('Riverside Hall');
    expect(html).not.toContain('Winchester');
    expect(html).not.toContain('Wessex BC');
    // P7: a completed tournament's NAME stays in normal ink — what makes
    // the past section quieter is the venue/organizer line and the entry
    // action it does NOT carry, not a greyed-out title.
    expect(classTokens(html, 'after:absolute')).toContain('text-foreground');
  });

  it('keeps the venue block on an upcoming row', () => {
    const html = renderToStaticMarkup(
      h(SeasonCalendar, {
        model: model([
          row({
            slug: 'a', name: 'Autumn', status: 'entries_open', date: '2026-09-11',
            venueName: 'Riverside Hall', organizer: 'Wessex BC',
          }),
        ]),
      }),
    );
    expect(html).toContain('Riverside Hall · Wessex BC');
  });

  it('strips a duplicated year stamp from the title the month header already carries', () => {
    const html = renderToStaticMarkup(
      h(SeasonCalendar, {
        model: model([
          row({ slug: 'a', name: '2026 Taipei Open', status: 'entries_open', date: '2026-09-11' }),
        ]),
      }),
    );
    expect(html).toContain('September 2026');
    expect(html).toContain('>Taipei Open<');
    expect(html).not.toContain('2026 Taipei Open');
  });

  it('lists an undated ACTIVE row under its own section, never hidden', () => {
    const html = renderToStaticMarkup(
      h(SeasonCalendar, {
        model: model([row({ slug: 'u', name: 'Undated Cup', status: 'entries_open', date: null })]),
      }),
    );
    expect(html).toContain('Undated Cup');
    expect(html).toContain('Date to be confirmed');
  });

  // Controller ruling 1: the month grouper drops every unparseable date, so a
  // page rendered from it alone silently loses a completed tournament that
  // never got one.
  it('keeps an undated COMPLETED row in the past half (ruling 1)', () => {
    const html = renderToStaticMarkup(
      h(SeasonCalendar, {
        model: model([
          row({ slug: 'd', name: 'Dated Cup', status: 'completed', date: '2026-05-30' }),
          row({ slug: 'u', name: 'Undated Cup', status: 'completed_winners', date: null }),
        ]),
      }),
    );
    expect(html).toContain('Dated Cup');
    expect(html).toContain('Undated Cup');
    expect(html).toContain('Date to be confirmed');
    expect(html.indexOf('Dated Cup')).toBeLessThan(html.indexOf('Undated Cup'));
  });

  it('makes the row one stretched link and carries the date for AT', () => {
    const html = renderToStaticMarkup(
      h(SeasonCalendar, {
        model: model([
          row({
            slug: 'a b', name: 'Autumn', status: 'entries_open', date: '2026-09-11',
            venueName: 'Hall', organizer: 'Wessex CBA', eventCount: 3,
          }),
        ]),
      }),
    );
    expect(html).toContain('href="/e/a%20b"');
    expect(html).toContain('after:absolute after:inset-0');
    expect(html).toContain(formatDateLong('2026-09-11'));
    expect(html).toContain('Hall · Wessex CBA');
    expect(html).not.toContain('events</span>');
  });

  // Task 11 live QA (380x840), R11: the action cell held `min-w-[8rem]
  // shrink-0` UNCONDITIONALLY around a label that cannot wrap, which set the
  // card's min-content width to ~364px inside a 348px content box — the page
  // scrolled sideways and the control row could not wrap. The fixed column is
  // a desktop property; below `sm:` the action drops under the name block.
  it('drops the action under the name block below sm: (R11, 380px)', () => {
    const html = renderToStaticMarkup(
      h(SeasonCalendar, {
        model: model([
          row({
            slug: 'a', name: 'Autumn', status: 'entries_open',
            date: '2026-09-11', venueName: 'Hall', eventCount: 3,
          }),
        ]),
      }),
    );

    // One markup, two layouts: a column on phones, the row anatomy from sm:.
    expect(classTokens(html, 'sm:flex-row')).toEqual(
      expect.arrayContaining(['flex', 'flex-col', 'min-w-0', 'sm:items-center']),
    );
    // Every fixed-width property on the action column is breakpoint-scoped —
    // a bare `min-w-[8rem]`/`shrink-0` token here is the defect returning.
    const status = classTokens(html, 'sm:min-w-[8rem]');
    expect(status).toEqual(
      expect.arrayContaining(['flex', 'sm:shrink-0', 'sm:justify-end']),
    );
    expect(status).not.toContain('min-w-[8rem]');
    expect(status).not.toContain('shrink-0');
    expect(status).not.toContain('justify-end');
    // Event-count texture is intentionally omitted from discovery rows.
    expect(html).not.toContain('events</span>');
  });

  it('renders no sr-only date line for a row with no parseable date', () => {
    const html = renderToStaticMarkup(
      h(SeasonCalendar, {
        model: model([row({ slug: 'u', name: 'Undated', status: 'entries_open', date: null })]),
      }),
    );
    // The only `sr-only` element left is the outline heading; there is no
    // spoken date line, because there is no date to speak.
    expect(html.match(/class="sr-only"/g)).toHaveLength(1);
    expect(html).toContain('>Upcoming tournaments<');
  });
});

// ---- SeasonControls: season selector + search (P5) ---------------------------

describe('SeasonControls', () => {
  it('offers each published season and an all-seasons escape, and no lifecycle segment', () => {
    const html = renderToStaticMarkup(
      h(SeasonControls, { filters: NO_FILTERS, season: 2026, years: [2026, 2025] }),
    );
    expect(html).toContain('aria-label="Season"');
    expect(html).toContain('href="/e/?year=2026#calendar"');
    expect(html).toContain('href="/e/?year=2025#calendar"');
    expect(html).toContain('href="/e/?year=all#calendar"');
    // The retired lifecycle vocabulary leaves nothing behind.
    for (const gone of ['Live &amp; upcoming', 'Entries open ·', 'Completed ·', 'Filters', '<details']) {
      expect(html).not.toContain(gone);
    }
  });

  it('marks the season on screen as current, without making it a dead control', () => {
    const html = renderToStaticMarkup(
      h(SeasonControls, { filters: { year: 2025, q: '' }, season: 2025, years: [2026, 2025] }),
    );
    expect(html).toMatch(/href="\/e\/\?year=2025#calendar" aria-current="true"/);
  });

  it('keeps a season older than the offered ones selectable when a URL named it', () => {
    const years = [2026, 2025, 2024, 2023, 2022, 2021, 2019];
    const html = renderToStaticMarkup(
      h(SeasonControls, { filters: { year: 2019, q: '' }, season: 2019, years }),
    );
    expect(html).toContain('href="/e/?year=2019#calendar"');
    expect(html).not.toContain('2020');
  });

  it('keeps search a GET form aimed at the calendar, carrying the RESOLVED season', () => {
    const html = renderToStaticMarkup(
      h(SeasonControls, { filters: NO_FILTERS, season: 2026, years: [2026] }),
    );
    const form = html.match(/<form[^>]*>/)?.[0] ?? '';
    expect(form).toContain('method="get"');
    expect(form).toContain('action="/e/#calendar"');
    expect(form).toContain('role="search"');
    // Not `filters.year` (null on a bare visit): searching must stay in the
    // season on screen rather than silently widening to every season.
    expect(html).toMatch(/<input type="hidden" name="year" value="2026"/);
  });

  it('carries the all-seasons scope through a search', () => {
    const html = renderToStaticMarkup(
      h(SeasonControls, { filters: { year: 'all', q: 'gold' }, season: null, years: [2026] }),
    );
    expect(html).toMatch(/<input type="hidden" name="year" value="all"/);
    expect(html).toMatch(/name="q"[^>]*value="gold"/);
  });

  it('keeps the search text when the reader switches season', () => {
    const html = renderToStaticMarkup(
      h(SeasonControls, { filters: { year: 2026, q: 'gold' }, season: 2026, years: [2026, 2025] }),
    );
    expect(html).toContain('href="/e/?q=gold&amp;year=2025#calendar"');
  });
});

// ---- EmptyState ------------------------------------------------------------

describe('EmptyState', () => {
  const props = {
    heading: 'Nothing matches those filters',
    body: 'Try widening the dates.',
    action: { label: 'Clear filters', href: '/e/' },
  };

  it('renders heading, body and exactly one action', () => {
    const html = renderToStaticMarkup(h(EmptyState, props));
    expect(html).toContain('Nothing matches those filters');
    expect(html).toContain('Try widening the dates.');
    expect(html.match(/<a /g)).toHaveLength(1);
    expect(html).toMatch(/<a href="\/e\/"[^>]*>Clear filters<\/a>/);
  });

  // SP-P7 §3.8. The dashed outline is the placeholder/drop-target idiom —
  // "something is missing here" — where an empty result set means "this query
  // found nothing", and every other content block on the tier is a card.
  it('wears the card treatment, not a dashed placeholder outline', () => {
    const html = renderToStaticMarkup(h(EmptyState, props));
    const container = html.slice(0, html.indexOf('>') + 1);

    expect(container).toContain('bg-surface-raised');
    expect(container).toContain('border-rule-soft');
    expect(container).toContain('shadow-sm');
    expect(container).not.toContain('border-dashed');
  });

  it('omits the action entirely when there is nothing to offer', () => {
    // What lets discovery use this container for "nothing listed at all",
    // where there is nowhere to send anyone, instead of a bare sentence.
    const html = renderToStaticMarkup(
      h(EmptyState, { heading: 'No tournaments are listed yet', body: 'Check back soon.' }),
    );

    expect(html).toContain('No tournaments are listed yet');
    expect(html).not.toContain('<a ');
    expect(html).not.toContain('<button');
  });
});

// ---- HeroHeader ------------------------------------------------------------

describe('HeroHeader', () => {
  const base = {
    orgName: 'Wessex CBA',
    title: 'Wessex Autumn Gold 2026',
    metaLine: 'Saturday 19 September 2026 · K2 Crawley',
    chip: OPEN_CHIP,
  };

  it('renders ONE CTA: a real link while entries are open', () => {
    const html = renderToStaticMarkup(
      h(HeroHeader, { ...base, cta: { kind: 'enter', href: '/e/spring-open/enter' } }),
    );
    expect(html).toMatch(/<a[^>]*href="\/e\/spring-open\/enter"[^>]*>Enter this tournament<\/a>/);
    expect(html).not.toMatch(/ disabled=""/);
  });

  it('states the closed status ONCE, not a dead control and not twice (E5)', () => {
    const html = renderToStaticMarkup(
      h(HeroHeader, { ...base, chip: CLOSED_CHIP, cta: { kind: 'closed' } }),
    );
    expect(html).not.toContain('Enter this tournament');
    expect(html).not.toContain('<button');
    expect(html).not.toMatch(/ disabled=""/);
    // The chip is the status, and the chip is what the cards use, so it is
    // the one that stays. The CTA slot used to repeat it as plain text —
    // "Entries closed   Entries closed" on one line of the hero.
    expect(html.match(/Entries closed/g)).toHaveLength(1);
    expect(html).toContain('Entries closed');
  });

  it('is a real hero band: h1 + org + meta line + chip', () => {
    const html = renderToStaticMarkup(h(HeroHeader, { ...base, cta: { kind: 'closed' } }));
    expect(html).toMatch(/<h1[^>]*>Wessex Autumn Gold 2026<\/h1>/);
    expect(html).toContain('Wessex CBA');
    expect(html).toContain('Saturday 19 September 2026 · K2 Crawley');
  });

  it('collapses an absent organizer and meta line', () => {
    const html = renderToStaticMarkup(
      h(HeroHeader, { ...base, orgName: null, metaLine: '', cta: { kind: 'closed' } }),
    );
    expect(html).not.toContain('Wessex CBA');
    expect(html).toMatch(/<h1[^>]*>Wessex Autumn Gold 2026<\/h1>/);
  });
});

// ---- TabBar ----------------------------------------------------------------

describe('TabBar', () => {
  // Contract §11: the bar is BUILT by the frame (`frameTabs`) and handed
  // here whole, so every tournament route renders the same one.
  const tabs: FrameTab[] = [
    { id: 'overview', label: 'Overview', href: '/e/s' },
    { id: 'schedule', label: 'Schedule', href: '/e/s/schedule' },
    { id: 'draws', label: 'Draws', href: '/e/s?tab=draws' },
    { id: 'players', label: 'Players', href: '/e/s?tab=players' },
    { id: 'documents', label: 'Documents', href: '/e/s/regulations' },
  ];

  it('renders nothing below two entries — a one-tab bar is a placeholder', () => {
    expect(
      renderToStaticMarkup(h(TabBar, { tabs: tabs.slice(0, 1), active: 'overview' })),
    ).toBe('');
  });

  it('is a labelled nav of links with aria-current on the active one', () => {
    const html = renderToStaticMarkup(h(TabBar, { tabs: tabs.slice(0, 4), active: 'draws' }));
    expect(html).toContain('aria-label="Tournament sections"');
    expect(html.match(/<a /g)).toHaveLength(4);
    const active = html.match(/<a[^>]*aria-current="page"[^>]*>[^<]*/g) ?? [];
    expect(active).toHaveLength(1);
    expect(active[0]).toContain('Draws');
    // Links, not widgets: no ARIA tablist pretending panels switch in place.
    expect(html).not.toContain('role="tab');
    expect(html).not.toContain('disabled');
  });

  it('seats Schedule second and Documents last (ADR 0028 + contract §11.1)', () => {
    const html = renderToStaticMarkup(h(TabBar, { tabs, active: 'documents' }));
    const labels = [...html.matchAll(/>([^<]+)<\/a>/g)].map((m) => m[1]);
    expect(labels).toEqual(['Overview', 'Schedule', 'Draws', 'Players', 'Documents']);
    expect(html).toMatch(/<a href="\/e\/s\/regulations" aria-current="page"/);
  });
});

// ---- Breadcrumbs -----------------------------------------------------------

describe('Breadcrumbs', () => {
  it('links every ancestor and marks the current segment, which is not a link', () => {
    const html = renderToStaticMarkup(
      h(Breadcrumbs, {
        crumbs: [
          { label: 'Tournaments', href: '/e/' },
          { label: 'Korea Masters', href: '/e/korea' },
          { label: 'Draws', href: '/e/korea?tab=draws' },
          { label: "Men's Singles", href: null },
        ],
      }),
    );
    expect(html).toContain('aria-label="Breadcrumb"');
    expect(html.match(/<a /g)).toHaveLength(3);
    expect(html).toContain('href="/e/"');
    expect(html).toContain('href="/e/korea"');
    // The current page is text, never a link back to itself.
    expect(html).toMatch(/<span aria-current="page"[^>]*>Men&#x27;s Singles<\/span>/);
    expect(html).not.toContain('href="/e/korea/draws');
  });

  it('renders nothing when there is no trail to show', () => {
    expect(
      renderToStaticMarkup(h(Breadcrumbs, { crumbs: [{ label: 'Tournaments', href: null }] })),
    ).toBe('');
  });
});

// ---- SegmentedNav ----------------------------------------------------------

describe('SegmentedNav', () => {
  const segments = [
    { label: 'Season', href: '/e/', current: true },
    { label: 'Taking entries', href: '/e/?view=open', count: 2 },
  ];

  it('uses plain links with an underlined active location', () => {
    const html = renderToStaticMarkup(h(SegmentedNav, { label: 'Calendar view', segments, currentAttr: 'true' }));
    expect(html).toContain('aria-label="Calendar view"');
    expect(html.match(/<a /g)).toHaveLength(2);
    expect(html).toMatch(/<a href="\/e\/" aria-current="true"/);
    expect(classTokens(html, 'border-accent')).toContain('font-semibold');
    expect(html).toContain('>2</span>');
  });

  it('does not add a decorative frame or inert width', () => {
    const html = renderToStaticMarkup(h(SegmentedNav, { label: 'x', segments }));
    expect(html).toContain('border-b');
    expect(html).not.toContain('overflow-hidden');
    expect(html).not.toContain('whitespace-nowrap');
    expect(html).not.toContain('rounded-full');
  });
});

// FeeTable was deleted with SP-P7 §3.7: fees left the overview (its only
// consumer) — pricing is quoted on the entry form and receipt only.

// ---- EventRow --------------------------------------------------------------

/** A published draw card, reduced to what this row now reads. */
function card(overrides: Partial<DrawCardDTO> = {}): DrawCardDTO {
  return {
    drawKey: 'MS', eventCode: 'MS', discipline: "Men's Singles", kind: 'se',
    size: 16, drawParticipantCount: 16, hasConsolation: true,
    matchCoverage: { imported: 0, expected: null, missing: null },
    recordScope: 'full_draw', topologyScope: 'full_draw', historical: false,
    sourceUrl: null, roundCount: 4, champions: [], finalists: [],
    remainingMatchCount: 3, progress: null,
    ...overrides,
  } as DrawCardDTO;
}

describe('EventRow (public-visual-fixes P6: name · entrants · progress · Open)', () => {
  it('shows exactly one count, in one unit, once a draw is published (V3-PE04.2)', () => {
    const html = renderToStaticMarkup(
      h(EventRow, {
        event: event({ registrationCount: 7 }),
        draw: card({ size: 8, drawParticipantCount: 6 }),
      }),
    );
    // The draw's own participant count wins over the registration count —
    // never both, and never a zero-looking mismatch between them.
    const countCell = html.match(/<p class="text-sm tabular-nums[^>]*>([^<]*)<\/p>/)?.[1];
    expect(countCell).toBe('6 players');
    expect(html).not.toContain('confirmed registrations');
  });

  it('normalizes legacy underscore event identifiers at the public boundary', () => {
    const html = renderToStaticMarkup(
      h(EventRow, {
        event: event({ code: 'mens_doubles_final', discipline: 'mens_doubles_final' }),
      }),
    );
    expect(html).toContain('Mens Doubles');
    expect(html).not.toContain('mens_doubles_final');
  });

  it('labels registration rows with one unit, never "of M" (G2 declined)', () => {
    const html = renderToStaticMarkup(h(EventRow, { event: event() }));
    expect(html).toContain('7 players');
    expect(html).not.toMatch(/7 of \d/);
  });

  it('states the entry state as progress while there is no draw to describe', () => {
    expect(renderToStaticMarkup(h(EventRow, { event: event() }))).toMatch(
      /text-status-live[^>]*>Entries open</,
    );
    expect(renderToStaticMarkup(h(EventRow, { event: event({ isOpen: false }) }))).toContain(
      'Entries closed',
    );
  });

  it.each([
    [{ state: 'in_play', roundLabel: 'R16', startTime: null }, 'R16 in play'],
    [{ state: 'scheduled', roundLabel: 'Final', startTime: '14:00' }, 'Final 14:00'],
    [{ state: 'to_play', roundLabel: 'QF', startTime: null }, 'QF to play'],
    [{ state: 'complete', roundLabel: null, startTime: null }, 'Complete'],
  ])('states real progress %o as "%s"', (progress, expected) => {
    const html = renderToStaticMarkup(
      h(EventRow, {
        event: event({ isOpen: false }),
        draw: card({ progress: progress as DrawCardDTO['progress'] }),
        drawHref: '/e/s/draws/MS',
        slug: 's',
      }),
    );
    expect(html).toContain(expected);
  });

  it('drops the derivable draw description the index used to repeat', () => {
    const html = renderToStaticMarkup(
      h(EventRow, {
        event: event({ isOpen: false }),
        draw: card(),
        drawHref: '/e/s/draws/MS',
        slug: 's',
      }),
    );
    // Round counts, consolation, eligibility and the publication message are
    // all either derivable from the draw itself or duplicates of the link.
    expect(html).not.toContain('4 rounds');
    expect(html).not.toContain('with consolation');
    expect(html).not.toContain('Open to all');
    expect(html).not.toContain('Draw published');
    // The format is not a distinguishing fact when every row shares it.
    expect(html).not.toContain('Elimination');
  });

  it('shows the format only when the index says the formats differ', () => {
    const html = renderToStaticMarkup(
      h(EventRow, {
        event: event({ isOpen: false }),
        draw: card({ kind: 'rr' }),
        drawHref: '/e/s/draws/MS',
        slug: 's',
        showFormat: true,
      }),
    );
    expect(html).toContain('Round robin');
  });

  it('is ONE native link per row, with a focus ring and no nested link', () => {
    const html = renderToStaticMarkup(
      h(EventRow, {
        event: event({ isOpen: false }),
        draw: card({
          champions: [
            { identity: { id: 'p1', name: 'Ada Lovelace' }, resolution: 'resolved', label: null },
          ],
        }),
        drawHref: '/e/s/draws/MS',
        slug: 's',
      }),
    );
    expect((html.match(/<a /g) ?? []).length).toBe(1);
    expect(html).toContain('href="/e/s/draws/MS"');
    expect(html).toContain('aria-label="Men&#x27;s singles draw"');
    expect(html).toContain('focus-visible:ring-accent');
    expect(html).toContain('>Open<');
    // The champion still reads, as text: a link inside this link is not a
    // link, so no `/players/` route escapes here.
    expect(html).toContain('Ada Lovelace');
    expect(html).not.toContain('/players/');
    // The Entrants button is gone with the second link.
    expect(html).not.toContain('>Entrants</a>');
  });

  it('offers no link at all before a draw is published', () => {
    expect(renderToStaticMarkup(h(EventRow, { event: event() }))).not.toContain('<a ');
  });
});

// ---- EntrantsList ----------------------------------------------------------

describe('EntrantsList (SP-P7 §3.2 — alphabetical, letter-grouped)', () => {
  const entrants = [
    {
      playerKey: 'entry-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      person: { identity: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'Tom Barker' }, resolution: 'resolved' as const, label: null },
      club: 'Riverside BC',
      eventCodes: ['MS', 'XD'],
    },
    {
      playerKey: 'entry-bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      person: { identity: { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', name: 'Priya Radhakrishnan' }, resolution: 'resolved' as const, label: null },
      club: null,
      eventCodes: ['XD'],
    },
    {
      playerKey: 'entry-cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      person: { identity: { id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', name: 'Tessa Ngo' }, resolution: 'resolved' as const, label: null },
      club: 'Northside SC',
      eventCodes: ['WS'],
    },
  ];

  it('one row per person, sorted, under letter headers', () => {
    const html = renderToStaticMarkup(h(EntrantsList, { slug: 'spring-open', entrants }));
    expect(html.match(/Tom Barker/g)).toHaveLength(1);
    // P before T; Ngo before Barker? No — sorted by NAME: Priya, Tessa, Tom.
    expect(html).toMatch(/>P<[\s\S]*Priya[\s\S]*>T<[\s\S]*Tessa Ngo[\s\S]*Tom Barker/);
    // One T section HEADING covers both T names (the A-Z jump nav also
    // links a "T", so this counts `<h3>` headings specifically).
    expect(html.match(/<h3[^>]*>T<\/h3>/g)).toHaveLength(1);
  });

  it('links each name to their player page by person key, never by name', () => {
    const html = renderToStaticMarkup(h(EntrantsList, { slug: 'spring-open', entrants }));
    expect(html).toContain(
      'href="/e/spring-open/players/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"',
    );
    expect(html).not.toContain('/players/Tom');
  });

  it('renders club beneath the name (C4) and the codes on the row', () => {
    const html = renderToStaticMarkup(h(EntrantsList, { slug: 'spring-open', entrants }));
    expect(html).toContain('Riverside BC');
    expect(html).toContain('MS · XD');
    // A clubless row simply has no club line — absent, not empty.
    expect(html).not.toContain('null');
  });

  it('ships the filter substrate: data attributes, the native form, the script', () => {
    const html = renderToStaticMarkup(h(EntrantsList, { slug: 'spring-open', entrants }));
    expect(html).toContain('data-name="tom barker"');
    expect(html).toContain('data-club="riverside bc"');
    expect(html).toContain('id="entrants-filter-root"');
    expect(html).toContain('src="/e/assets/entrants-filter.js"');
    expect(html).toContain('3 entrants');
    // The no-matches line ships hidden while there is a list; only a search
    // that empties it (server- or script-side) reveals it.
    expect(html).toMatch(/<p[^>]*data-no-matches[^>]*hidden/);
  });

  // ---- public-visual-fixes P7 ---------------------------------------------

  it('searches natively: a GET form with an icon, a real sr-only label and no visible Find button', () => {
    const html = renderToStaticMarkup(
      h(EntrantsList, {
        slug: 'spring-open',
        entrants,
        noun: 'player' as const,
        action: '/e/spring-open',
        hidden: [{ name: 'tab', value: 'players' }],
      }),
    );
    // A real form, submitting by GET to the page it is on — Enter works with
    // no script at all, and the query lands in a shareable URL.
    expect(html).toMatch(/<form[^>]*action="\/e\/spring-open"[^>]*method="get"/);
    // The other URL state travels with the search: without this the search
    // would drop the reader back onto the Overview tab.
    expect(html).toContain('<input type="hidden" name="tab" value="players"/>');
    expect(html).toContain('name="q"');
    // The label is REAL and associated — but not a visible "Find a player"
    // repeating the placeholder underneath it.
    expect(html).toMatch(/<label for="entrants-search" class="sr-only">Find a player<\/label>/);
    expect(html).toContain('placeholder="Name or club"');
    // The submit exists for assistive tech and the keyboard, and is invisible.
    expect(html).toMatch(/<button type="submit" class="sr-only">Search<\/button>/);
    expect(html).not.toMatch(/>Find<\/button>/);
    expect(html).not.toMatch(/>Apply<\/button>/);
    // The magnifier is decoration, so it is hidden from the accessibility tree.
    expect(html).toContain('<svg width="16" height="16"');
  });

  it('applies ?q= on the SERVER, so the directory search works with no script', () => {
    const html = renderToStaticMarkup(
      h(EntrantsList, { slug: 'spring-open', entrants, noun: 'player' as const, query: 'northside' }),
    );
    // A club-only match still finds the person (same folding as the script).
    expect(html).toContain('Tessa Ngo');
    expect(html).not.toContain('Tom Barker');
    expect(html).not.toContain('Priya');
    // The count switches register while a query is on, exactly as the
    // script's own count does.
    expect(html).toContain('1 result');
    // The field keeps what was typed.
    expect(html).toContain('value="northside"');
  });

  it('shows the no-matches line when a server-side search empties the list', () => {
    const html = renderToStaticMarkup(
      h(EntrantsList, { slug: 'spring-open', entrants, noun: 'player' as const, query: 'nobody at all' }),
    );
    expect(html).toContain('No players match your search.');
    expect(html).not.toMatch(/<p[^>]*data-no-matches[^>]*hidden/);
    expect(html).toContain('0 results');
  });

  it('still carries no contact data — the strict projection, rendered', () => {
    const html = renderToStaticMarkup(h(EntrantsList, { slug: 'spring-open', entrants }));
    expect(html).not.toContain('@');
  });

  it('offers a compact A-Z jump index tied to every present letter section, with no JS (V3-PE05.1)', () => {
    const html = renderToStaticMarkup(h(EntrantsList, { slug: 'spring-open', entrants }));
    const nav = html.match(/<nav aria-label="Jump to letter"[\s\S]*?<\/nav>/)?.[0] ?? '';
    expect(nav).not.toBe('');
    // Priya (P), Tessa/Tom (T) — exactly the letters actually present.
    expect(nav).toContain('href="#dir-P"');
    expect(nav).toContain('href="#dir-T"');
    expect(nav).not.toContain('href="#dir-A"');
    // The target section exists with that same id — a plain in-page anchor,
    // functional without any script.
    expect(html).toContain('id="dir-P"');
    expect(html).toContain('id="dir-T"');
    // The long event-code explanation this replaced is gone.
    expect(html).not.toContain('Events:');
  });

  it('renders exactly one result count, ready for the filter script to update in place (V3-PE05.2)', () => {
    const html = renderToStaticMarkup(h(EntrantsList, { slug: 'spring-open', entrants }));
    expect(html.match(/data-search-count/g)).toHaveLength(1);
    expect(html).toContain('3 entrants');
  });

  it('composes the count, the search mount and the A-Z index into ONE sticky toolbar (P2)', () => {
    const html = renderToStaticMarkup(h(EntrantsList, { slug: 'spring-open', entrants }));
    const toolbar = html.match(/<div[^>]*data-directory-toolbar[\s\S]*?<\/nav><\/div>/)?.[0] ?? '';
    expect(toolbar).not.toBe('');
    // All three live inside it, so they cannot scroll apart on a long page.
    expect(toolbar).toContain('data-search-count');
    expect(toolbar).toContain('id="entrants-filter-root"');
    expect(toolbar).toContain('aria-label="Jump to letter"');
    // Sticky, with the offset stated (nothing else on this tier is sticky).
    expect(toolbar).toMatch(/class="[^"]*\bsticky\b[^"]*\btop-0\b/);
  });

  it('makes every letter jump a keyboard jump that clears the sticky toolbar', () => {
    const html = renderToStaticMarkup(h(EntrantsList, { slug: 'spring-open', entrants }));
    const section = html.match(/<section[^>]*id="dir-P"[^>]*>/)?.[0] ?? '';
    expect(section).not.toBe('');
    // Focus follows the fragment only if the target can hold focus.
    expect(section).toContain('tabindex="-1"');
    // ...and lands below the bar it was clicked in, not underneath it.
    expect(section).toContain('scroll-mt-28');
    // The index link names its destination for anyone who arrives on it by
    // keyboard — a bare "P" is not a destination.
    expect(html).toContain('aria-label="Jump to P"');
    expect(html).toContain('data-letter-jump="dir-P"');
  });

  it('writes accent-folded search text, so a plain-ASCII query still finds the person', () => {
    const html = renderToStaticMarkup(
      h(EntrantsList, {
        slug: 'spring-open',
        entrants: [
          {
            playerKey: 'entry-dddddddd-dddd-4ddd-8ddd-dddddddddddd',
            person: { identity: { id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', name: 'Rasmus Kjær' }, resolution: 'resolved' as const, label: null },
            club: 'Nørrebro BK',
            eventCodes: ['MD'],
          },
        ],
      }),
    );
    // The DISPLAYED name keeps its diacritics; only the search key is folded.
    expect(html).toContain('Rasmus Kjær');
    expect(html).toContain('Nørrebro BK');
    expect(html).toContain('data-name="rasmus kjaer"');
    expect(html).toContain('data-club="norrebro bk"');
  });

  it('renders no A-Z index for a single-letter roster (nothing useful to jump between)', () => {
    const html = renderToStaticMarkup(
      h(EntrantsList, { slug: 'spring-open', entrants: [entrants[0]] }),
    );
    expect(html).not.toContain('aria-label="Jump to letter"');
  });
});

// ---- StickyTotalBar --------------------------------------------------------

describe('StickyTotalBar', () => {
  const base = {
    chip: OPEN_CHIP,
    deadline: '2026-08-14 23:59 UTC',
    // P7: the bar converts the deadline into the tournament's own zone.
    timeZone: 'Europe/London',
    quoteAction: '/e/api/quote/spring-open',
  };

  it('unquoted: says the prices are per event and offers Update total', () => {
    const html = renderToStaticMarkup(
      h(StickyTotalBar, { ...base, state: { kind: 'unquoted' } }),
    );
    expect(html).toContain('Update total');
    expect(html).toContain('Prices are per event');
    expect(html).not.toContain('Quoted total');
  });

  it('quoted: renders the SERVER total and the ticked-event count', () => {
    const html = renderToStaticMarkup(
      h(StickyTotalBar, { ...base, state: { kind: 'quoted', totalCents: 3800, eventCount: 3 } }),
    );
    expect(html).toContain('38.00');
    expect(html).toContain('3 events');
    expect(html).toContain('Quoted total');
  });

  it('refused: renders the fixed local copy as a warning', () => {
    const html = renderToStaticMarkup(
      h(StickyTotalBar, { ...base, state: { kind: 'refused', copy: 'Too many events.' } }),
    );
    expect(html).toContain('Too many events.');
  });

  it('restates the nearest deadline inside the bar (refinement 3)', () => {
    const html = renderToStaticMarkup(
      h(StickyTotalBar, { ...base, state: { kind: 'unquoted' } }),
    );
    expect(html).toContain('Entries open · closes in 4d');
    // P7: CONVERTED into the tournament's zone, and with no zone spelling —
    // 23:59 UTC on 14 August is 00:59 on the 15th in London (BST), which is
    // exactly why trimming the suffix off a UTC rendering is not a fix.
    expect(html).toContain('15 Aug 2026, 00:59');
    expect(html).not.toContain('UTC');
  });

  it('omits the moment when no deadline is known, and the countdown when closed', () => {
    const noDeadline = renderToStaticMarkup(
      h(StickyTotalBar, {
        ...base,
        deadline: null,
        chip: { kind: 'entriesOpen', closesInDays: null },
        state: { kind: 'unquoted' },
      }),
    );
    expect(noDeadline).toContain('Entries open');
    expect(noDeadline).not.toContain('UTC</p>');
  });

  it('is slim enough for a phone: one button row, tighter padding (E5)', () => {
    // At 390px the bar was costing about a third of the screen — two
    // full-width stacked buttons, `p-4`, and four separate text rows. The
    // buttons share a row below `lg:` and go back to stacked in the side
    // rail, where the width is 18rem and there is room.
    //
    // 2026-08-11 design audit, finding #3: `p-3`/`gap-2` still left the bar
    // sticking from initial paint (its containing block is taller than the
    // viewport, so `sticky bottom-0` engages almost immediately with only
    // ONE default player block above it) at ~176px, ~21% of a 390px-wide
    // phone's viewport, for the entire scroll journey. `p-2.5`/`gap-1.5`
    // tighten it further on top of E5's earlier pass.
    const html = renderToStaticMarkup(
      h(StickyTotalBar, {
        state: { kind: 'unquoted' },
        chip: OPEN_CHIP,
        deadline: '2026-08-14 23:59 UTC',
        timeZone: 'Europe/London',
        quoteAction: '/e/api/quote/spring-open',
      }),
    );

    expect(classTokens(html, 'sticky')).toEqual(
      expect.arrayContaining(['p-2.5', 'lg:p-4', 'gap-1.5']),
    );
    expect(classTokens(html, 'grid-cols-2')).toContain('lg:grid-cols-1');
  });

  it('reads as a deliberate bottom sheet, not an accidental overlay (finding #3)', () => {
    // Since a native-CSS-only `position: sticky` cannot be told to wait
    // until it would otherwise leave the viewport (it engages the moment
    // its containing block exceeds the viewport height, which one default
    // player block already does), the alternative the finding offers is
    // this one: read as intentional chrome. `shadow-frame` is the design
    // system's existing overlay-elevation token (`tokens.css`) — reused
    // here rather than inventing a bespoke shadow.
    const html = renderToStaticMarkup(
      h(StickyTotalBar, { ...base, state: { kind: 'unquoted' } }),
    );
    const tokens = classTokens(html, 'sticky');

    expect(tokens).toContain('shadow-frame');
    expect(tokens).not.toContain('shadow-lg');
    // The side rail (`lg:`) isn't an overlay — it sits beside the content,
    // so it keeps its original, quieter elevation.
    expect(tokens).toContain('lg:shadow-sm');
  });

  it('is the G0 landing: id="total", a labelled landmark', () => {
    const html = renderToStaticMarkup(
      h(StickyTotalBar, { ...base, state: { kind: 'unquoted' } }),
    );
    expect(html).toMatch(/<section id="total" aria-label="Total and submit"/);
    expect(html).toContain('sticky bottom-0');
  });

  it('carries two submits: the quote formAction and the plain submit', () => {
    const html = renderToStaticMarkup(
      h(StickyTotalBar, { ...base, state: { kind: 'unquoted' } }),
    );
    const quote = html.match(/<button[^>]*formaction="\/e\/api\/quote\/spring-open"[^>]*>/i)?.[0];
    expect(quote).toBeTruthy();
    expect(quote).toContain('value="filter"');
    expect(quote).toMatch(/formnovalidate/i);
    expect(html).toContain('Submit entry');
  });
});

// ---- MatchCard -------------------------------------------------------------

describe('MatchCard', () => {
  const match = {
    eventCode: 'MS',
    roundLabel: 'Final',
    sides: [
      { persons: [], placeholder: 'Player A', winner: false },
      { persons: [], placeholder: 'Player B', winner: false },
    ],
    score: null,
    decided: false,
    scheduledTime: null,
    court: null,
    status: 'scheduled' as const,
    durationMinutes: null,
    updatedAt: null,
  };

  it('suppresses the source link for an internal demo source, but still states the honest schedule time', () => {
    // Contract §3.2: a missing time always reads "Time to be confirmed" —
    // unconditionally, not behind a placeholder flag — so the footer is
    // never truly empty for an unscheduled match; only the source link is
    // demo-suppressed here.
    const html = renderToStaticMarkup(h(MatchCard, {
      match: {
        ...match,
        sourceUrl: 'https://example.test/source',
        sourceRef: 'demo-generated:T001:MS:F:00',
      },
      slug: 'spring-open',
    }));
    expect(html).toContain('<footer');
    expect(html).toContain('Time to be confirmed');
    expect(html).not.toContain('Match source');
  });

  it('renders a public source with a leading separator when other footer content exists', () => {
    const html = renderToStaticMarkup(h(MatchCard, {
      match: {
        ...match,
        sourceUrl: 'https://example.test/source',
        sourceRef: 'archive-42',
      },
      slug: 'spring-open',
    }));
    expect(html).toContain('<footer');
    expect(html).toContain('Match source');
    expect(html).toContain('<span aria-hidden="true"> · </span>');
  });

  it('never renders a placeholder apology: missing time is "Time to be confirmed" and a missing court line is omitted entirely', () => {
    // D9: the old `showAssignmentPlaceholders` flag and its three footer
    // apologies ("Date to be confirmed", "Time not assigned", "Court
    // information unavailable") are deleted outright.
    const html = renderToStaticMarkup(h(MatchCard, { match, slug: 'spring-open' }));
    expect(html).toContain('Time to be confirmed');
    expect(html).not.toContain('Time not assigned');
    expect(html).not.toContain('Date to be confirmed');
    expect(html).not.toContain('Court information unavailable');
    expect(html).not.toContain('Court not assigned');
    expect(html).not.toContain('Court pending');
    // No court line at all when the court is unknown.
    expect(html).not.toContain('Court ');
  });

  it('omits only the court line when the time is approved but the court is not', () => {
    const html = renderToStaticMarkup(h(MatchCard, {
      match: { ...match, scheduledTime: '09:00' },
      slug: 'spring-open',
    }));
    expect(html).toContain('09:00');
    expect(html).not.toContain('Time to be confirmed');
    expect(html).not.toContain('Court ');
  });

  it('renders the approved court once the court is known', () => {
    const html = renderToStaticMarkup(h(MatchCard, {
      match: { ...match, scheduledTime: '09:00', court: 3 },
      slug: 'spring-open',
    }));
    expect(html).toContain('Court 3');
  });

  it('renders no state chip for an unrecognised status', () => {
    const html = renderToStaticMarkup(h(MatchCard, {
      match: { ...match, status: null },
      slug: 'spring-open',
    }));
    expect(html).not.toContain('Scheduled');
    expect(html).not.toContain('Live');
    expect(html).not.toContain('Completed');
  });
});

// ---- PlayShell -------------------------------------------------------------

describe('PlayShell', () => {
  const html = renderToStaticMarkup(h(PlayShell, { children: h('main', null, 'X') }));

  it('carries the wordmark home link and the sign-in link', () => {
    // The wordmark sits inside the Console banner chip (nested spans since
    // 2026-08-13) — assert the home link still wraps it, not adjacency.
    const home = html.match(/<a href="\/e\/"[^>]*>[\s\S]*?<\/a>/)?.[0] ?? '';
    expect(home).toContain('ShuttleWorks');
    expect(html).toContain('by Yunavero');
    expect(html).toMatch(/<a href="\/e\/login"[^>]*>Sign in<\/a>/);
  });

  // SP-P8 §4: the header sheds its search. It sat on all ~16 pages to serve
  // one of them, and the calendar now carries a search that also carries the
  // rest of the filter state — two boxes searching the same list, one of them
  // dropping the reader's filters, was the defect.
  it('renders no search landmark at all, on any page (SP-P8 §4)', () => {
    expect(html).not.toContain('role="search"');
    expect(html).not.toContain('type="search"');
    // The `#results` fragment went with the form — the calendar's anchor is
    // `#calendar` and nothing on this tier points at `#results` any more.
    expect(html).not.toContain('#results');
  });

  it('offers exactly one session link (§3.8), now that nothing sits between them', () => {
    const session = [...html.matchAll(/href="(\/e\/login|\/e\/me\/entries)"/g)];
    expect(session).toHaveLength(1);
  });

  it('links nothing into a FastAPI prefix', () => {
    const links = [...html.matchAll(/href="([^"]*)"/g)].map((m) => m[1]);
    expect(links.filter((l) => l.startsWith('/e/account/') || l.startsWith('/e/api/'))).toEqual(
      [],
    );
  });

  it('states the exact brand line, identical on every page (V3-PE02.1)', () => {
    // "ShuttleWorks · tournament entries · by Yunavero" mislabeled results
    // and draw pages as entry management and read like assembled metadata.
    // `BRAND_SIGNATURE` is the one shared string every page renders.
    expect(html).toContain('ShuttleWorks by Yunavero');
    expect(html).not.toContain('tournament entries');
    const signedIn = renderToStaticMarkup(
      h(EntrantSessionContext.Provider, { value: true }, h(PlayShell, { children: h('main', null, 'X') })),
    );
    expect(signedIn).toContain('ShuttleWorks by Yunavero');
  });
});

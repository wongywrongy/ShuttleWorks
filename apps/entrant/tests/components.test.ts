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
import { NowStrip } from '../app/components/NowStrip';
import { PlayShell } from '../app/components/PlayShell';
import { SeasonCalendar } from '../app/components/SeasonCalendar';
import { SeasonControls } from '../app/components/SeasonControls';
import { SeasonStatusCell } from '../app/components/SeasonStatusCell';
import { StatusChip } from '../app/components/StatusChip';
import { StickyTotalBar } from '../app/components/StickyTotalBar';
import { TabBar } from '../app/components/TabBar';
import { TimelineCard } from '../app/components/TimelineCard';
import { formatDateLong, formatMoment } from '../app/lib/format';
import type { EntryEventDTO } from '../app/lib/entryPage.types';
import { statusCell } from '../app/lib/phase';
import type { ChipState, Filters, SeasonRow, TimelineMoment } from '../app/lib/phase';

/** 2026-08-11 12:00 UTC — the same fixture clock `phase.test.ts` pins. */
const NOW = new Date(Date.UTC(2026, 7, 11, 12, 0));

const OPEN_CHIP: ChipState = { kind: 'entriesOpen', closesInDays: 4 };
const CLOSED_CHIP: ChipState = { kind: 'entriesClosed' };

/** One row of the SP-P8 season list — the same fixture `phase.test.ts` uses,
 * so both suites describe the payload the same way. */
const row = (over: Partial<SeasonRow> = {}): SeasonRow => ({
  slug: 's', name: 'T', organizer: null, venueName: null, date: null,
  eventCount: 0, status: 'entries_closed', closesInDays: null,
  drawsPublished: false, winnersPublished: false, ...over,
});

const NO_FILTERS: Filters = { view: 'season', preset: null, from: null, to: null, q: '' };

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
  ])('%o renders its exact ruled copy', (state, copy) => {
    expect(renderToStaticMarkup(h(StatusChip, { state }))).toContain(copy);
  });

  it('tones open on the live ramp with an aria-hidden dot', () => {
    const html = renderToStaticMarkup(h(StatusChip, { state: OPEN_CHIP }));
    expect(html).toContain('text-status-live');
    expect(html).toMatch(/<span aria-hidden="true"[^>]*bg-status-live/);
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

// ---- SeasonStatusCell (SP-P8 §2.4) -----------------------------------------
//
// `TournamentCard` and `FilterStrip` used to be asserted here. Both are the
// discovery card/sidebar the season calendar replaces, and both are deleted in
// the task after this one; their describes went with the components rather
// than being carried as tests for markup nothing renders.

describe('SeasonStatusCell', () => {
  it('renders Winners as a link and bare Completed as text (§7 trap 3)', () => {
    const winners = renderToStaticMarkup(
      h(SeasonStatusCell, { cell: statusCell(row({ slug: 'x', status: 'completed_winners' })) }),
    );
    expect(winners).toContain('href="/e/x?tab=winners"');
    expect(winners).toContain('Winners');

    const done = renderToStaticMarkup(
      h(SeasonStatusCell, { cell: statusCell(row({ status: 'completed' })) }),
    );
    expect(done).toContain('Completed');
    expect(done).not.toContain('<a');
  });

  it('lifts every real link above the row-wide stretched link', () => {
    for (const status of ['in_progress_live', 'completed_winners'] as const) {
      const html = renderToStaticMarkup(
        h(SeasonStatusCell, { cell: statusCell(row({ slug: 'x', status, drawsPublished: true })) }),
      );
      expect(classTokens(html, 'z-10')).toContain('relative');
    }
  });

  it('takes the chip vocabulary that already exists for an open row', () => {
    const html = renderToStaticMarkup(
      h(SeasonStatusCell, { cell: statusCell(row({ status: 'entries_open', closesInDays: 4 })) }),
    );
    expect(html).toContain('Entries open · closes in 4d');
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
    expect(html).toContain('Now playing');
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

  it('sits on the inverse band tokens, never a literal colour', () => {
    const html = renderToStaticMarkup(h(NowStrip, { row: live, moreCount: 0 }));
    expect(html).toContain('bg-surface-inverse');
    expect(html).toContain('text-surface-inverse-ink');
    expect(html).not.toMatch(/#[0-9a-f]{3,8}\b/i);
  });
});

// ---- SeasonCalendar (SP-P8 §2.4) -------------------------------------------

describe('SeasonCalendar', () => {
  it('renders month headers and a trailing Completed section under Season', () => {
    const html = renderToStaticMarkup(
      h(SeasonCalendar, {
        view: 'season',
        rows: [
          row({ slug: 'a', name: 'Autumn', status: 'entries_open', date: '2026-09-11' }),
          row({ slug: 'b', name: 'Bygone', status: 'completed', date: '2026-05-30' }),
        ],
      }),
    );
    expect(html).toContain('September 2026');
    expect(html).toContain('Completed');
    expect(html).toContain('id="calendar"');
    // Order: the live month leads, the completed section trails.
    expect(html.indexOf('Autumn')).toBeLessThan(html.indexOf('Bygone'));
  });

  it('lists an undated ACTIVE row under its own section, never hidden', () => {
    const html = renderToStaticMarkup(
      h(SeasonCalendar, {
        view: 'season',
        rows: [row({ slug: 'u', name: 'Undated Cup', status: 'entries_open', date: null })],
      }),
    );
    expect(html).toContain('Undated Cup');
    expect(html).toContain('Date to be confirmed');
  });

  // Controller ruling 1: `monthGroupsDesc` drops every unparseable date, so
  // the Completed view rendered from it alone silently loses a completed
  // tournament that never got a date — the row the Season view does show.
  it('keeps an undated COMPLETED row in the Completed view (ruling 1)', () => {
    const html = renderToStaticMarkup(
      h(SeasonCalendar, {
        view: 'completed',
        rows: [
          row({ slug: 'd', name: 'Dated Cup', status: 'completed', date: '2026-05-30' }),
          row({ slug: 'u', name: 'Undated Cup', status: 'completed_winners', date: null }),
        ],
      }),
    );
    expect(html).toContain('Dated Cup');
    expect(html).toContain('Undated Cup');
    expect(html).toContain('Date to be confirmed');
    expect(html.indexOf('Dated Cup')).toBeLessThan(html.indexOf('Undated Cup'));
  });

  it('renders one ungrouped list under Taking entries — no month headers', () => {
    const html = renderToStaticMarkup(
      h(SeasonCalendar, {
        view: 'open',
        rows: [row({ slug: 'a', name: 'Autumn', status: 'entries_open', date: '2026-09-11' })],
      }),
    );
    expect(html).toContain('Autumn');
    // No section header at all — the `sr-only` long date carries the month
    // words on every row, so the header ELEMENT is what "ungrouped" means.
    expect(html).not.toContain('<h3');
  });

  it('makes the row one stretched link and carries the date for AT', () => {
    const html = renderToStaticMarkup(
      h(SeasonCalendar, {
        view: 'open',
        rows: [
          row({
            slug: 'a b', name: 'Autumn', status: 'entries_open', date: '2026-09-11',
            venueName: 'Hall', organizer: 'Wessex CBA', eventCount: 3,
          }),
        ],
      }),
    );
    expect(html).toContain('href="/e/a%20b"');
    expect(html).toContain('after:absolute after:inset-0');
    expect(html).toContain(formatDateLong('2026-09-11'));
    expect(html).toContain('Hall · Wessex CBA');
    expect(classTokens(html, 'sm:block')).toContain('hidden');
  });

  it('renders no sr-only date line for a row with no parseable date', () => {
    const html = renderToStaticMarkup(
      h(SeasonCalendar, {
        view: 'open',
        rows: [row({ slug: 'u', name: 'Undated', status: 'entries_open', date: null })],
      }),
    );
    expect(classTokens(html, 'sr-only')).toEqual([]);
  });
});

// ---- SeasonControls (SP-P8 §2.3) -------------------------------------------

describe('SeasonControls', () => {
  const counts = { takingEntries: 2, completed: 3 };

  it('renders live counts on the segments', () => {
    const html = renderToStaticMarkup(h(SeasonControls, { filters: NO_FILTERS, counts }));
    expect(html).toContain('Taking entries · 2');
    expect(html).toContain('Completed · 3');
    expect(html).toContain('Season');
  });

  it('keeps search a GET form aimed at the calendar, carrying the date filters', () => {
    const html = renderToStaticMarkup(
      h(SeasonControls, { filters: { ...NO_FILTERS, preset: '7d', view: 'completed' }, counts }),
    );
    const form = html.match(/<form[^>]*>/)?.[0] ?? '';
    expect(form).toContain('method="get"');
    expect(form).toContain('action="/e/#calendar"');
    expect(html).toMatch(/<input type="hidden" name="preset" value="7d"/);
    expect(html).toMatch(/<input type="hidden" name="view" value="completed"/);
  });

  it('segments preserve the search text and the date filters, and drop the default view', () => {
    const html = renderToStaticMarkup(
      h(SeasonControls, { filters: { ...NO_FILTERS, q: 'gold', preset: '7d' }, counts }),
    );
    expect(html).toContain('href="/e/?q=gold&amp;view=open&amp;preset=7d#calendar"');
    // Season is `parseFilters`' default, so its link names no view at all.
    expect(html).toContain('href="/e/?q=gold&amp;preset=7d#calendar"');
  });

  it('hides the date filters behind a native details panel — no client JS', () => {
    const html = renderToStaticMarkup(h(SeasonControls, { filters: NO_FILTERS, counts }));
    expect(html).toContain('<details');
    expect(html).toContain('<summary');
    expect(html).toContain('Filters');
    expect(html).not.toContain('onclick');
    // The three presets and the free range, as native controls.
    // "This season" is the checked default, and its value is empty so the
    // loader's `canonicalQuery` drops it from the submitted URL entirely.
    expect(html).toMatch(/<input[^>]*name="preset"[^>]*checked=""[^>]*value=""/);
    expect(html).toContain('Next 7 days');
    expect(html).toContain('Next 3 months');
    expect(html).toMatch(/<input[^>]*type="date"[^>]*name="from"/);
    expect(html).toMatch(/<input[^>]*type="date"[^>]*name="to"/);
  });

  it('badges the summary with the count of active date filters only', () => {
    expect(renderToStaticMarkup(h(SeasonControls, { filters: NO_FILTERS, counts }))).not.toContain(
      'Filters · ',
    );
    const two = renderToStaticMarkup(
      h(SeasonControls, {
        filters: { ...NO_FILTERS, from: '2026-09-01', to: '2026-09-30', q: 'gold' },
        counts,
      }),
    );
    expect(two).toContain('Filters · 2');
  });

  it('renders ZERO chips and no chip row in the default state (§7 trap 4)', () => {
    const html = renderToStaticMarkup(
      h(SeasonControls, { filters: NO_FILTERS, counts: { takingEntries: 0, completed: 0 } }),
    );
    expect(html).not.toContain('data-chip-row');
  });

  it('renders a dismissible chip per active date filter', () => {
    const html = renderToStaticMarkup(
      h(SeasonControls, {
        filters: { ...NO_FILTERS, preset: '7d' },
        counts: { takingEntries: 0, completed: 0 },
      }),
    );
    expect(html).toContain('data-chip-row');
    expect(html).toContain('Next 7 days');
    expect(html).toContain('Clear all');
    // Dismissing one chip is a link to the same query minus that param.
    expect(html).toContain('href="/e/#calendar"');
  });

  it('labels a legacy 30d link honestly, though no radio offers it (D6)', () => {
    const html = renderToStaticMarkup(
      h(SeasonControls, {
        filters: { ...NO_FILTERS, preset: '30d' },
        counts: { takingEntries: 0, completed: 0 },
      }),
    );
    expect(html).toContain('Next 30 days');
  });

  it('names both custom bounds as their own chips', () => {
    const html = renderToStaticMarkup(
      h(SeasonControls, {
        filters: { ...NO_FILTERS, from: '2026-09-01', to: '2026-09-30' },
        counts: { takingEntries: 0, completed: 0 },
      }),
    );
    expect(html).toContain('From 2026-09-01');
    expect(html).toContain('To 2026-09-30');
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
  const hrefFor = (tab: string) => (tab === 'overview' ? '/e/s' : `/e/s?tab=${tab}`);

  it('renders nothing below two tabs — a one-tab bar is a placeholder', () => {
    expect(
      renderToStaticMarkup(h(TabBar, { tabs: ['overview'], active: 'overview', hrefFor })),
    ).toBe('');
  });

  it('is a labelled nav of links with aria-current on the active one', () => {
    const html = renderToStaticMarkup(
      h(TabBar, { tabs: ['overview', 'events', 'entrants'], active: 'events', hrefFor }),
    );
    expect(html).toContain('aria-label="Tournament sections"');
    expect(html.match(/<a /g)).toHaveLength(3);
    const active = html.match(/<a[^>]*aria-current="page"[^>]*>[^<]*/g) ?? [];
    expect(active).toHaveLength(1);
    expect(active[0]).toContain('Events');
    // Links, not widgets: no ARIA tablist pretending panels switch in place.
    expect(html).not.toContain('role="tab');
    expect(html).not.toContain('disabled');
  });
});

// ---- TimelineCard ----------------------------------------------------------

describe('TimelineCard', () => {
  const moments: TimelineMoment[] = [
    { label: 'Entries open', at: '2026-06-01 09:00 UTC', state: 'past' },
    { label: 'Entries close', at: null, state: 'current', variance: 'per-event' },
    { label: 'Withdrawal deadline', at: '2026-09-05 18:00 UTC', state: 'future' },
    { label: 'Tournament', at: '2026-09-19', state: 'future' },
  ];

  it('renders an ordered list with the current position marked in text', () => {
    const html = renderToStaticMarkup(
      h(TimelineCard, { moments, now: NOW, eventsHref: '/e/s?tab=events' }),
    );
    expect(html).toContain('<ol');
    expect(html).toContain('← you are here');
  });

  it('renders a per-event variance as a range line linking to Events', () => {
    const html = renderToStaticMarkup(
      h(TimelineCard, { moments, now: NOW, eventsHref: '/e/s?tab=events' }),
    );
    expect(html).toContain('Varies by event');
    expect(html).toContain('href="/e/s?tab=events"');
  });

  it('formats the tournament day long and the moments as UTC instants', () => {
    const html = renderToStaticMarkup(
      h(TimelineCard, { moments, now: NOW, eventsHref: '#' }),
    );
    expect(html).toContain(formatDateLong('2026-09-19'));
    expect(html).toContain(formatMoment('2026-09-05 18:00 UTC'));
  });

  it('inserts the standalone marker before the first future moment when nothing straddles now', () => {
    const allKnown: TimelineMoment[] = [
      { label: 'Entries open', at: '2026-06-01 09:00 UTC', state: 'past' },
      { label: 'Entries close', at: '2026-08-14 23:59 UTC', state: 'future' },
    ];
    const html = renderToStaticMarkup(
      h(TimelineCard, { moments: allKnown, now: NOW, eventsHref: '#' }),
    );
    const markerAt = html.indexOf('You are here');
    expect(markerAt).toBeGreaterThan(html.indexOf('Entries open'));
    expect(markerAt).toBeLessThan(html.indexOf('Entries close'));
  });

  it('renders no placeholder for an omitted moment — the model already dropped it', () => {
    const html = renderToStaticMarkup(
      h(TimelineCard, { moments: [], now: NOW, eventsHref: '#' }),
    );
    expect(html).not.toContain('TBD');
    expect(html).not.toContain('Entries close');
  });
});

// FeeTable was deleted with SP-P7 §3.7: fees left the overview (its only
// consumer) — pricing is quoted on the entry form and receipt only.

// ---- EventRow --------------------------------------------------------------

describe('EventRow', () => {
  it('says "N entered" — never "of M", G2 was declined', () => {
    const html = renderToStaticMarkup(h(EventRow, { event: event(), entrantsHref: null }));
    expect(html).toContain('7 entered');
    expect(html).not.toMatch(/7 of \d/);
  });

  it('labels the constraints and the open state as text + tone', () => {
    const html = renderToStaticMarkup(
      h(EventRow, { event: event({ ageBracketed: true }), entrantsHref: null }),
    );
    expect(html).toContain('Men');
    expect(html).toContain('Age-restricted');
    expect(html).toMatch(/text-status-live[^>]*>Open</);
  });

  it.each([
    [null, 'Open to all'],
    ['F', 'Women'],
    ['mixed', 'mixed'],
  ])('labels constraint %o as %s', (genderConstraint, label) => {
    const html = renderToStaticMarkup(
      h(EventRow, { event: event({ genderConstraint }), entrantsHref: null }),
    );
    expect(html).toContain(label);
  });

  it('marks a closed event with the done tone', () => {
    const html = renderToStaticMarkup(
      h(EventRow, { event: event({ isOpen: false }), entrantsHref: null }),
    );
    expect(html).toMatch(/text-status-done[^>]*>Closed</);
  });

  it('links into the entrants anchor when given one and entries exist', () => {
    const html = renderToStaticMarkup(
      h(EventRow, { event: event(), entrantsHref: '/e/s?tab=entrants#event-MS' }),
    );
    expect(html).toContain('href="/e/s?tab=entrants#event-MS"');
    expect(html).toContain('See entrants');
  });

  it('offers no link when the entrants tab is hidden or nobody entered', () => {
    expect(
      renderToStaticMarkup(h(EventRow, { event: event(), entrantsHref: null })),
    ).not.toContain('<a ');
    expect(
      renderToStaticMarkup(
        h(EventRow, { event: event({ entryCount: 0 }), entrantsHref: '/e/s?tab=entrants' }),
      ),
    ).not.toContain('<a ');
  });
});

// ---- EntrantsList ----------------------------------------------------------

describe('EntrantsList (SP-P7 §3.2 — alphabetical, letter-grouped)', () => {
  const entrants = [
    {
      personKey: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      name: 'Tom Barker',
      club: 'Riverside BC',
      eventCodes: ['MS', 'XD'],
    },
    {
      personKey: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      name: 'Priya Radhakrishnan',
      club: null,
      eventCodes: ['XD'],
    },
    {
      personKey: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      name: 'Tessa Ngo',
      club: 'Northside SC',
      eventCodes: ['WS'],
    },
  ];

  it('one row per person, sorted, under letter headers', () => {
    const html = renderToStaticMarkup(h(EntrantsList, { slug: 'spring-open', entrants }));
    expect(html.match(/Tom Barker/g)).toHaveLength(1);
    // P before T; Ngo before Barker? No — sorted by NAME: Priya, Tessa, Tom.
    expect(html).toMatch(/>P<[\s\S]*Priya[\s\S]*>T<[\s\S]*Tessa Ngo[\s\S]*Tom Barker/);
    // One T header covers both T names.
    expect(html.match(/>T</g)).toHaveLength(1);
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

  it('ships the filter substrate: data attributes, mount point, script', () => {
    const html = renderToStaticMarkup(h(EntrantsList, { slug: 'spring-open', entrants }));
    expect(html).toContain('data-name="tom barker"');
    expect(html).toContain('data-club="riverside bc"');
    expect(html).toContain('id="entrants-filter-root"');
    expect(html).toContain('src="/e/assets/entrants-filter.js"');
    expect(html).toContain('3 entrants');
    // The no-matches line ships hidden; only the script reveals it.
    expect(html).toMatch(/<p[^>]*data-no-matches[^>]*hidden/);
  });

  it('still carries no contact data — the strict projection, rendered', () => {
    const html = renderToStaticMarkup(h(EntrantsList, { slug: 'spring-open', entrants }));
    expect(html).not.toContain('@');
  });
});

// ---- StickyTotalBar --------------------------------------------------------

describe('StickyTotalBar', () => {
  const base = {
    chip: OPEN_CHIP,
    deadline: '2026-08-14 23:59 UTC',
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
    expect(html).toContain('14 Aug 2026, 23:59 UTC');
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

// ---- PlayShell -------------------------------------------------------------

describe('PlayShell', () => {
  const html = renderToStaticMarkup(h(PlayShell, { q: 'gold', children: h('main', null, 'X') }));

  it('carries the wordmark home link, the search landmark and the sign-in link', () => {
    // The wordmark sits inside the Console banner chip (nested spans since
    // 2026-08-13) — assert the home link still wraps it, not adjacency.
    const home = html.match(/<a href="\/e\/"[^>]*>[\s\S]*?<\/a>/)?.[0] ?? '';
    expect(home).toContain('ShuttleWorks');
    const search = html.match(/<form[^>]*role="search"[^>]*>/)?.[0] ?? '';
    expect(search).toContain('method="get"');
    expect(search).toContain('action="/e/#results"');
    const q = html.match(/<input[^>]*type="search"[^>]*>/)?.[0] ?? '';
    expect(q).toContain('name="q"');
    expect(q).toContain('value="gold"');
    expect(html).toMatch(/<a href="\/e\/login"[^>]*>Sign in<\/a>/);
  });

  // 2026-08-11 design audit, finding #5: the header search box is ~208px
  // (18rem minus the "Search" button and the gap), ~184px of that usable
  // after `px-3` padding — and the OLD placeholder, "Search tournaments or
  // venues" (29 chars), needs ~230px, so it clipped to "Search tournaments
  // or venu" with no ellipsis on every page at every width. The accessible
  // name (`aria-label`) is not visually rendered, so it can stay the fuller
  // sentence without clipping anything.
  it('keeps the visible placeholder short enough not to clip in the ~184px box (finding #5)', () => {
    const q = html.match(/<input[^>]*type="search"[^>]*>/)?.[0] ?? '';
    const placeholder = q.match(/placeholder="([^"]*)"/)?.[1] ?? '';
    const ariaLabel = q.match(/aria-label="([^"]*)"/)?.[1] ?? '';

    // ~8px/char average for this font — the audit's own measured figure.
    expect(placeholder.length).toBeLessThanOrEqual(23);
    // The accessible name still says what the box searches, unclipped.
    expect(ariaLabel).toBe('Search tournaments or venues');
  });

  it('links nothing into a FastAPI prefix', () => {
    const links = [...html.matchAll(/href="([^"]*)"/g)].map((m) => m[1]);
    expect(links.filter((l) => l.startsWith('/e/account/') || l.startsWith('/e/api/'))).toEqual(
      [],
    );
  });
});

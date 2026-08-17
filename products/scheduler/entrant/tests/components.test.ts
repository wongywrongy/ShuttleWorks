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
import { FeeTable } from '../app/components/FeeTable';
import { FilterStrip } from '../app/components/FilterStrip';
import { HeroHeader } from '../app/components/HeroHeader';
import { PlayShell } from '../app/components/PlayShell';
import { StatusChip } from '../app/components/StatusChip';
import { StickyTotalBar } from '../app/components/StickyTotalBar';
import { TabBar } from '../app/components/TabBar';
import { TimelineCard } from '../app/components/TimelineCard';
import { TournamentCard } from '../app/components/TournamentCard';
import { formatDateLong, formatMoment } from '../app/lib/format';
import type { EntryEventDTO } from '../app/lib/entryPage.types';
import type { ChipState, DiscoveryCard, Filters, TimelineMoment } from '../app/lib/phase';

/** 2026-08-11 12:00 UTC — the same fixture clock `phase.test.ts` pins. */
const NOW = new Date(Date.UTC(2026, 7, 11, 12, 0));

const OPEN_CHIP: ChipState = { kind: 'entriesOpen', closesInDays: 4 };
const CLOSED_CHIP: ChipState = { kind: 'entriesClosed' };

function card(overrides: Partial<DiscoveryCard> = {}): DiscoveryCard {
  return {
    slug: 'spring-open',
    name: 'Spring Open',
    tournamentDate: '2026-09-19',
    venueName: 'Kingsway Centre',
    eventCount: 4,
    entriesOpen: true,
    entriesCloseAt: '2026-08-14 23:59 UTC',
    ...overrides,
  };
}

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

function filters(overrides: Partial<Filters> = {}): Filters {
  return { status: null, preset: null, from: null, to: null, q: '', ...overrides };
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

// ---- TournamentCard --------------------------------------------------------

describe('TournamentCard', () => {
  it('has the fixed anatomy: badge · name link · venue · count · chip', () => {
    const html = renderToStaticMarkup(h(TournamentCard, { card: card(), now: NOW }));
    expect(html).toContain('Sep'); // the badge
    expect(html).toMatch(/<a href="\/e\/spring-open"[^>]*>Spring Open<\/a>/);
    expect(html).toContain('Kingsway Centre');
    expect(html).toContain('4 events');
    expect(html).toContain('Entries open · closes in 4d');
  });

  it('is one link, stretched over the whole card', () => {
    const html = renderToStaticMarkup(h(TournamentCard, { card: card(), now: NOW }));
    expect(html.match(/<a /g)).toHaveLength(1);
    expect(html).toContain('after:absolute after:inset-0');
  });

  it('pins the chip to a fixed right-aligned column FROM sm: UP (refinement 2)', () => {
    const html = renderToStaticMarkup(h(TournamentCard, { card: card(), now: NOW }));
    const chip = classTokens(html, 'sm:float-right');

    // A float, still: one vertical line of chips down the list, while long
    // names keep the full card width and wrap under the chip. What changed
    // is that it is now breakpoint-scoped — the desktop property is intact.
    expect(chip).toContain('sm:float-right');
    // …and the chip precedes the name in the markup (floats must), so at
    // desktop widths it is structurally not a bottom row.
    expect(html.indexOf('sm:float-right')).toBeLessThan(html.indexOf('Spring Open'));
    // The defect: an UNCONDITIONAL float. At 390px a long name wrapped
    // around the chip ("2026 Bay" / "Badminton Late Summer Open"), against
    // this component's own docstring. A bare `float-right` token here is
    // that defect returning.
    expect(chip).not.toContain('float-right');
  });

  it('keeps the chip the bottom row on phones, as the docstring always said', () => {
    const html = renderToStaticMarkup(h(TournamentCard, { card: card(), now: NOW }));

    // Native, no duplicated markup and no second copy for a screen reader:
    // below `sm:` the content column is a flex column and the chip is
    // `order-last`, so it lays out last while staying first in the DOM
    // (which the float requires). From `sm:` up the column is `display:
    // block` again, `order` goes inert and the float takes over.
    expect(classTokens(html, 'sm:float-right')).toContain('order-last');
    expect(classTokens(html, 'flex-col')).toEqual(
      expect.arrayContaining(['flex', 'sm:block']),
    );
  });

  it('collapses absent fields without breaking the anatomy order', () => {
    const bare = card({ venueName: null, tournamentDate: null, eventCount: 1 });
    const html = renderToStaticMarkup(h(TournamentCard, { card: bare, now: NOW }));
    expect(html).toContain('TBC');
    expect(html).toContain('1 event');
    expect(html).not.toContain('Kingsway');
  });

  it('encodes the slug into the href', () => {
    const html = renderToStaticMarkup(
      h(TournamentCard, { card: card({ slug: 'a b' }), now: NOW }),
    );
    expect(html).toContain('href="/e/a%20b"');
  });

  // 2026-08-11 design audit (T1 / finding #2): `DateBadge`'s own comment
  // claimed "the card's text carries the date for AT", and nothing on the
  // card did — the badge is `aria-hidden` and nothing else named the date.
  // This is the fix: an `sr-only` text carrying it, outside the stretched
  // link (so the single-link/anatomy tests above stay exactly true).
  it('carries the date as sr-only text, since the badge is aria-hidden decoration', () => {
    const html = renderToStaticMarkup(h(TournamentCard, { card: card(), now: NOW }));
    expect(html).toContain(formatDateLong('2026-09-19'));
    const srOnly = classTokens(html, 'sr-only');
    expect(srOnly).toContain('sr-only');
  });

  it('renders no sr-only date paragraph when there is no parseable date', () => {
    const html = renderToStaticMarkup(
      h(TournamentCard, { card: card({ tournamentDate: null }), now: NOW }),
    );
    expect(classTokens(html, 'sr-only')).toEqual([]);
  });

  it('transitions border-color WITH box-shadow, both on ease-brand (MOTION.md anti-pattern #1)', () => {
    // The defect: `transition-shadow` alone, no `ease-brand` — the
    // Tailwind-default flat curve MOTION.md forbids by name — while
    // `hover:border-rule-control` changes a property (`border-color`) the
    // `transition-shadow` shorthand never covers, so the border snapped.
    const html = renderToStaticMarkup(h(TournamentCard, { card: card(), now: NOW }));
    const li = html.match(/<li class="[^"]*"/)?.[0] ?? '';
    expect(li).toContain('ease-brand');
    expect(li).toMatch(/transition-\[[^\]]*border-color[^\]]*box-shadow[^\]]*\]/);
  });
});

// ---- FilterStrip (refinement 4: always visible; P1.1: facets are links) ----

describe('FilterStrip', () => {
  it('keeps one GET form, aimed at the results fragment, for the date range', () => {
    const html = renderToStaticMarkup(h(FilterStrip, { filters: filters() }));
    const form = html.match(/<form[^>]*>/)?.[0] ?? '';
    expect(form).toContain('method="get"');
    expect(form).toContain('action="/e/#results"');
  });

  it('has no disclosure toggle of any kind — the strip is always visible', () => {
    const html = renderToStaticMarkup(h(FilterStrip, { filters: filters() }));
    expect(html).not.toContain('filters-toggle');
    expect(html).not.toContain('peer-checked');
    expect(html).not.toContain('<details');
    expect(html).not.toMatch(/\bhidden\b/);
  });

  // P1.1: a facet is a LINK carrying the whole current query with that one
  // facet swapped — instant apply as plain GET navigation, zero client JS.
  it('renders each facet as a link that swaps only its own facet', () => {
    const html = renderToStaticMarkup(
      h(FilterStrip, { filters: filters({ status: 'open', q: 'gold' }) }),
    );
    // Picking a preset keeps the chosen status and the search text.
    expect(html).toMatch(
      /<a href="\/e\/\?q=gold&(amp;)?status=open&(amp;)?preset=30d#results"/,
    );
    // Picking "All tournaments" drops status but keeps the search text.
    expect(html).toMatch(/<a href="\/e\/\?q=gold#results"/);
  });

  it('echoes the chosen facets back as the selected link (aria-current)', () => {
    const html = renderToStaticMarkup(
      h(FilterStrip, { filters: filters({ status: 'open', preset: '30d' }) }),
    );
    expect(html).toMatch(/<a[^>]*aria-current="true"[^>]*>Entries open<\/a>/);
    expect(html).toMatch(/<a[^>]*aria-current="true"[^>]*>Next month<\/a>/);
    expect(html).not.toMatch(/<a[^>]*aria-current="true"[^>]*>Upcoming<\/a>/);
  });

  it('carries chosen facets into the date form as hidden fields', () => {
    const html = renderToStaticMarkup(
      h(FilterStrip, { filters: filters({ status: 'open', preset: '30d' }) }),
    );
    expect(html).toMatch(/<input type="hidden" name="status" value="open"/);
    expect(html).toMatch(/<input type="hidden" name="preset" value="30d"/);
  });

  it('offers the custom range as two native date inputs', () => {
    const html = renderToStaticMarkup(
      h(FilterStrip, { filters: filters({ from: '2026-09-01', to: '2026-09-30' }) }),
    );
    expect(html).toMatch(/<input[^>]*type="date"[^>]*name="from"[^>]*value="2026-09-01"/);
    expect(html).toMatch(/<input[^>]*type="date"[^>]*name="to"[^>]*value="2026-09-30"/);
  });

  it('keeps the header search text as a hidden q field', () => {
    const html = renderToStaticMarkup(h(FilterStrip, { filters: filters({ q: 'gold' }) }));
    expect(html).toMatch(/<input type="hidden" name="q" value="gold"/);
  });

  it('renders Clear only when something is active', () => {
    expect(renderToStaticMarkup(h(FilterStrip, { filters: filters() }))).not.toContain(
      'Clear',
    );
    expect(
      renderToStaticMarkup(h(FilterStrip, { filters: filters({ status: 'open' }) })),
    ).toContain('Clear');
  });

  it('groups each facet under a labelled nav', () => {
    const html = renderToStaticMarkup(h(FilterStrip, { filters: filters() }));
    expect(html).toContain('<nav aria-label="Status"');
    expect(html).toContain('<nav aria-label="Dates"');
  });

  // 2026-08-11 design audit, finding #6 (carried from the radio rows):
  // `py-0.5` (2px) on a `text-sm` row sat at exactly the WCAG 2.2 AA
  // target-size floor (24px) with zero margin, for a mobile-heavy audience.
  it('gives each facet link row more than the bare 24px target-size floor', () => {
    const html = renderToStaticMarkup(h(FilterStrip, { filters: filters() }));
    const link = html.match(/<a[^>]*>All tournaments<\/a>/)?.[0] ?? '';
    expect(link).not.toMatch(/\bpy-0\.5\b/);
    expect(link).toMatch(/\bpy-1(\.5)?\b/);
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

// ---- FeeTable --------------------------------------------------------------

describe('FeeTable', () => {
  it('renders the bundle tiers sorted, per-player framed', () => {
    const html = renderToStaticMarkup(
      h(FeeTable, { feeSchedule: { '2': 2400, '1': 1400 }, events: [event()] }),
    );
    expect(html.indexOf('1 event')).toBeLessThan(html.indexOf('2 events'));
    expect(html).toContain('14.00');
    expect(html).toContain('24.00');
    expect(html).toContain('Per player');
  });

  it('falls back to per-event prices when no schedule exists', () => {
    const html = renderToStaticMarkup(
      h(FeeTable, { feeSchedule: {}, events: [event({ feeCents: 1500 })] }),
    );
    expect(html).toMatch(/Men(&#x27;|')s Singles/);
    expect(html).toContain('15.00');
  });

  it('renders nothing at all when neither exists (rule 4)', () => {
    expect(
      renderToStaticMarkup(h(FeeTable, { feeSchedule: {}, events: [event({ feeCents: null })] })),
    ).toBe('');
  });
});

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

describe('EntrantsList', () => {
  const events = [
    event({ code: 'MS', discipline: "Men's Singles" }),
    event({ id: '22222222-2222-4222-8222-222222222222', code: 'XD', discipline: 'Mixed Doubles' }),
    event({ id: '33333333-3333-4333-8333-333333333333', code: 'WS', discipline: "Women's Singles" }),
  ];
  const entrants = [
    { name: 'Tom Barker', eventCodes: ['MS', 'XD'] },
    { name: 'Priya Radhakrishnan', eventCodes: ['XD'] },
  ];

  it('groups by event: a two-event player appears under both, one row each', () => {
    const html = renderToStaticMarkup(h(EntrantsList, { events, entrants }));
    expect(html.match(/Tom Barker/g)).toHaveLength(2);
    expect(html.match(/Priya Radhakrishnan/g)).toHaveLength(1);
  });

  it('carries counts per group and the anchor ids EventRow links to', () => {
    const html = renderToStaticMarkup(h(EntrantsList, { events, entrants }));
    expect(html).toContain('id="event-MS"');
    expect(html).toContain('id="event-XD"');
    expect(html).toMatch(/Men(&#x27;|')s Singles[\s\S]*?1 entered/);
    expect(html).toMatch(/Mixed Doubles[\s\S]*?2 entered/);
  });

  it('renders no group for an event nobody entered — absent, not empty', () => {
    const html = renderToStaticMarkup(h(EntrantsList, { events, entrants }));
    expect(html).not.toContain('id="event-WS"');
    expect(html).not.toMatch(/Women(&#x27;|')s Singles/);
  });

  it('renders names and nothing else — no club, no contact (G5b declined)', () => {
    const html = renderToStaticMarkup(h(EntrantsList, { events, entrants }));
    expect(html).not.toMatch(/club/i);
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

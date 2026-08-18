/**
 * The phase-gating pure functions, held to the design document's state tables
 * (SP-P6-2 design §6) — transcribed, not paraphrased. Everything the public
 * pages decide (chip, CTA, tabs, facets, filters, ordering, total bar,
 * timeline) is a pure function of data + `now`, so these are plain
 * input/output tables with no server in the loop.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  activeTab,
  anyFilterActive,
  cardChipState,
  cardMatches,
  chipLabel,
  chipState,
  ctaState,
  entriesOpen,
  orderCards,
  parseFilters,
  parseIsoDate,
  parseMoment,
  statusFacet,
  timelineModel,
  toDiscoveryCard,
  totalBarState,
  visibleBlocks,
  visibleTabs,
  type DiscoveryCard,
  type Filters,
  type PhaseEvent,
} from '../app/lib/phase';
import type { FormEcho } from '../app/lib/echo';

/** 2026-08-11 12:00 UTC — the fixture clock the mock pages also pin. */
const NOW = new Date(Date.UTC(2026, 7, 11, 12, 0));

function event(overrides: Partial<PhaseEvent> = {}): PhaseEvent {
  return {
    isOpen: true,
    opensAt: '2026-06-01 09:00 UTC',
    closesAt: '2026-08-14 23:59 UTC',
    withdrawsUntil: '2026-09-05 18:00 UTC',
    ...overrides,
  };
}

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

function filters(overrides: Partial<Filters> = {}): Filters {
  return { status: null, preset: null, from: null, to: null, q: '', ...overrides };
}

function echo(overrides: Partial<FormEcho> = {}): FormEcho {
  return { players: [], showAllEvents: false, totalCents: null, refusal: null, ...overrides };
}

// ---- parseMoment: the pinned cross-tier wire format ------------------------

describe('parseMoment', () => {
  it('parses exactly the backend _moment format', () => {
    expect(parseMoment('2026-08-14 23:59 UTC')).toEqual(new Date(Date.UTC(2026, 7, 14, 23, 59)));
  });

  it.each([
    ['ISO (pre-G3)', '2026-08-14T23:59:00Z'],
    ['missing the UTC suffix', '2026-08-14 23:59'],
    ['a rollover date', '2026-13-01 00:00 UTC'],
    ['a rollover time', '2026-08-14 24:00 UTC'],
    ['prose', 'closes soon'],
  ])('refuses %s as null, never a guess', (_label, raw) => {
    expect(parseMoment(raw)).toBeNull();
  });

  it('treats null as null', () => {
    expect(parseMoment(null)).toBeNull();
  });

  it('pins the format against the Python side (the cross-tier idiom)', () => {
    // `_moment` (backend/api/entries_public.py) is the producer. If its
    // strftime format ever changes, this line goes red HERE, where the parser
    // that assumed it lives — the `test_form_csrf_cross_tier.py` argument.
    const source = readFileSync(
      new URL('../../backend/api/entries_public.py', import.meta.url),
      'utf8',
    );
    expect(source).toContain('"%Y-%m-%d %H:%M UTC"');
  });
});

describe('parseIsoDate', () => {
  it('parses the tournament_date convention', () => {
    expect(parseIsoDate('2026-09-19')).toEqual(new Date(Date.UTC(2026, 8, 19)));
  });

  it.each([['2026-02-30'], ['19/09/2026'], ['2026-09-19 09:00 UTC'], ['TBC']])(
    'refuses %s',
    (raw) => {
      expect(parseIsoDate(raw)).toBeNull();
    },
  );
});

// ---- chipState / ctaState: the §6 table, row by row ------------------------

describe('chipState (the two ruled states, nothing else)', () => {
  it('row 1: no open event — including no events at all — is entriesClosed', () => {
    expect(chipState([], NOW)).toEqual({ kind: 'entriesClosed' });
    expect(chipState([event({ isOpen: false })], NOW)).toEqual({ kind: 'entriesClosed' });
  });

  it('row 2: open with no parseable deadline is open without a countdown', () => {
    expect(chipState([event({ closesAt: null })], NOW)).toEqual({
      kind: 'entriesOpen',
      closesInDays: null,
    });
  });

  it('row 3: the countdown is ceil() of the NEAREST open deadline', () => {
    // 2026-08-14 23:59 is 3.49 days out from the fixture noon — rounded UP.
    expect(chipState([event()], NOW)).toEqual({ kind: 'entriesOpen', closesInDays: 4 });
    // min, not max: an event closing later never stretches the countdown.
    expect(
      chipState([event(), event({ closesAt: '2026-09-30 23:59 UTC' })], NOW),
    ).toEqual({ kind: 'entriesOpen', closesInDays: 4 });
  });

  it('row 4 (skew): server says open, clock says past — closes today, never closed', () => {
    expect(chipState([event({ closesAt: '2026-08-10 09:00 UTC' })], NOW)).toEqual({
      kind: 'entriesOpen',
      closesInDays: 0,
    });
  });

  it('ignores the deadlines of closed events', () => {
    // A closed event whose deadline already passed (the fixture's WD) must
    // not drag the countdown to zero.
    expect(
      chipState([event(), event({ isOpen: false, closesAt: '2026-08-01 23:59 UTC' })], NOW),
    ).toEqual({ kind: 'entriesOpen', closesInDays: 4 });
  });
});

describe('chipLabel', () => {
  it.each([
    [{ kind: 'entriesClosed' } as const, 'Entries closed'],
    [{ kind: 'entriesOpen', closesInDays: null } as const, 'Entries open'],
    [{ kind: 'entriesOpen', closesInDays: 0 } as const, 'Entries open · closes today'],
    [{ kind: 'entriesOpen', closesInDays: 4 } as const, 'Entries open · closes in 4d'],
  ])('%o → %s', (state, label) => {
    expect(chipLabel(state)).toBe(label);
  });
});

describe('ctaState', () => {
  it('is a link to the enter route while entries are open', () => {
    expect(ctaState([event()], 'spring-open')).toEqual({
      kind: 'enter',
      href: '/e/spring-open/enter',
    });
  });

  it('is the closed state — status text, no control — otherwise', () => {
    expect(ctaState([event({ isOpen: false })], 'spring-open')).toEqual({ kind: 'closed' });
  });

  it('agrees with chipState on the predicate', () => {
    for (const events of [[], [event()], [event({ isOpen: false })]]) {
      expect(ctaState(events, 's').kind === 'enter').toBe(entriesOpen(events));
      expect(chipState(events, NOW).kind === 'entriesOpen').toBe(entriesOpen(events));
    }
  });
});

describe('cardChipState (the same chip from G1 card fields)', () => {
  it.each([
    [card({ entriesOpen: false, entriesCloseAt: null }), { kind: 'entriesClosed' }],
    [card({ entriesCloseAt: null }), { kind: 'entriesOpen', closesInDays: null }],
    [card(), { kind: 'entriesOpen', closesInDays: 4 }],
    [card({ entriesCloseAt: '2026-08-11 09:00 UTC' }), { kind: 'entriesOpen', closesInDays: 0 }],
  ])('%o', (input, expected) => {
    expect(cardChipState(input, NOW)).toEqual(expected);
  });
});

// ---- visibleTabs / activeTab: the §6 tables --------------------------------

describe('visibleTabs (a tab exists only when its data does)', () => {
  it.each([
    [0, 0, ['overview']],
    [2, 0, ['overview', 'events']],
    [0, 3, ['overview', 'entrants']],
    [2, 3, ['overview', 'events', 'entrants']],
  ])('%i events, %i entrants → %j (no publication arg: legacy rule)', (events, entrants, expected) => {
    expect(visibleTabs(Array(events).fill({}), Array(entrants).fill({}))).toEqual(expected);
  });

  // SP-P7 §4: with a publication block, each public tab is the TD's flag,
  // not the payload length — published-and-empty is a real tab, and
  // unpublished hides one however much sits behind the gate.
  it.each([
    [
      { entrants: false, draws: false, results: false },
      ['overview', 'events'],
    ],
    [
      { entrants: true, draws: false, results: false },
      ['overview', 'events', 'entrants'],
    ],
    [
      { entrants: true, draws: true, results: false },
      ['overview', 'events', 'entrants', 'draws', 'seeds'],
    ],
    [
      { entrants: true, draws: true, results: true },
      ['overview', 'events', 'entrants', 'draws', 'seeds', 'winners'],
    ],
    [
      // Independent flags render coherently: winners without draws is a
      // legal (odd) combination and answers exactly what was published.
      { entrants: false, draws: false, results: true },
      ['overview', 'events', 'winners'],
    ],
  ])('publication %j → %j', (publication, expected) => {
    expect(visibleTabs(Array(2).fill({}), [], publication)).toEqual(expected);
  });

  it('published entrants beats an empty list; unpublished beats a full one', () => {
    const on = { entrants: true, draws: false, results: false };
    const off = { entrants: false, draws: false, results: false };
    expect(visibleTabs([], [], on)).toContain('entrants');
    expect(visibleTabs([], Array(9).fill({}), off)).not.toContain('entrants');
  });
});

describe('activeTab', () => {
  const visible = ['overview', 'events'] as const;

  it.each([
    ['a visible tab', 'events', 'events'],
    ['null', null, 'overview'],
    ['an unknown string', 'draws', 'overview'],
    ['a data-hidden tab', 'entrants', 'overview'],
  ])('%s → %s', (_label, requested, expected) => {
    expect(activeTab(requested, [...visible])).toBe(expected);
  });
});

// ---- statusFacet / cardMatches / orderCards --------------------------------

describe('statusFacet (G4 declined — the date-derived vocabulary)', () => {
  it.each([
    ['open whatever the date says', card(), 'open'],
    ['open even undated', card({ tournamentDate: null }), 'open'],
    ['closed + future date', card({ entriesOpen: false }), 'upcoming'],
    ['closed + today', card({ entriesOpen: false, tournamentDate: '2026-08-11' }), 'upcoming'],
    ['closed + past date', card({ entriesOpen: false, tournamentDate: '2026-05-02' }), 'past'],
    ['closed + no date', card({ entriesOpen: false, tournamentDate: null }), 'closed'],
    ['closed + unparseable date', card({ entriesOpen: false, tournamentDate: 'sept' }), 'closed'],
  ])('%s → %s', (_label, input, expected) => {
    expect(statusFacet(input, NOW)).toBe(expected);
  });
});

describe('cardMatches', () => {
  it('matches everything when no filter is set', () => {
    expect(cardMatches(card(), filters(), NOW)).toBe(true);
  });

  it('applies the status facet', () => {
    expect(cardMatches(card(), filters({ status: 'open' }), NOW)).toBe(true);
    expect(cardMatches(card(), filters({ status: 'past' }), NOW)).toBe(false);
  });

  it('applies a preset window from today', () => {
    // 2026-09-19 is 39 days out: inside 90d, outside 30d.
    expect(cardMatches(card(), filters({ preset: '90d' }), NOW)).toBe(true);
    expect(cardMatches(card(), filters({ preset: '30d' }), NOW)).toBe(false);
  });

  it('lets a custom range win over a preset', () => {
    const both = filters({ preset: '7d', from: '2026-09-01', to: '2026-09-30' });
    expect(cardMatches(card(), both, NOW)).toBe(true);
    expect(
      cardMatches(card({ tournamentDate: '2026-10-05' }), both, NOW),
    ).toBe(false);
  });

  it('excludes an unparseable date from any date filter, and only then', () => {
    const undated = card({ tournamentDate: null });
    expect(cardMatches(undated, filters({ preset: '90d' }), NOW)).toBe(false);
    expect(cardMatches(undated, filters({ from: '2026-01-01' }), NOW)).toBe(false);
    expect(cardMatches(undated, filters(), NOW)).toBe(true);
  });

  it('searches name and venue, case-folded', () => {
    expect(cardMatches(card(), filters({ q: 'SPRING' }), NOW)).toBe(true);
    expect(cardMatches(card(), filters({ q: 'kingsway' }), NOW)).toBe(true);
    expect(cardMatches(card(), filters({ q: 'crawley' }), NOW)).toBe(false);
  });

  it('is a conjunction', () => {
    expect(cardMatches(card(), filters({ status: 'open', q: 'nowhere' }), NOW)).toBe(false);
  });
});

describe('orderCards (actionable first, then upcoming-first — refinement 1)', () => {
  it('leads with the card that can be acted on', () => {
    // The Phase B sign-off example verbatim: a closed tournament happening
    // sooner must not outrank one an entrant can still enter for 4 more days.
    const closedSooner = card({
      slug: 'closed-sooner',
      entriesOpen: false,
      entriesCloseAt: null,
      tournamentDate: '2026-08-29',
    });
    const openFourDays = card({ slug: 'open-4d', tournamentDate: '2026-09-19' });

    expect(orderCards([closedSooner, openFourDays], NOW).map((c) => c.slug)).toEqual([
      'open-4d',
      'closed-sooner',
    ]);
  });

  it('orders open cards by their nearest deadline, closing soonest first', () => {
    const later = card({
      slug: 'later',
      entriesCloseAt: '2026-10-30 23:59 UTC',
      tournamentDate: '2026-08-20',
    });
    const sooner = card({
      slug: 'sooner',
      entriesCloseAt: '2026-08-14 23:59 UTC',
      tournamentDate: '2026-11-14',
    });
    // Open but no parseable deadline: still actionable, but with nothing to
    // count down to it follows every card whose urgency is knowable.
    const noDeadline = card({
      slug: 'no-deadline',
      entriesCloseAt: null,
      tournamentDate: '2026-08-15',
    });

    expect(orderCards([later, noDeadline, sooner], NOW).map((c) => c.slug)).toEqual([
      'sooner',
      'later',
      'no-deadline',
    ]);
  });

  it('sorts closed cards future ascending, then undated, then past descending', () => {
    const closed = { entriesOpen: false, entriesCloseAt: null };
    const future1 = card({ ...closed, slug: 'a', tournamentDate: '2026-08-29' });
    const future2 = card({ ...closed, slug: 'b', tournamentDate: '2026-09-19' });
    const undated = card({ ...closed, slug: 'c', tournamentDate: null });
    const past1 = card({ ...closed, slug: 'd', tournamentDate: '2026-05-02' });
    const past2 = card({ ...closed, slug: 'e', tournamentDate: '2026-07-30' });

    expect(
      orderCards([past1, undated, future2, past2, future1], NOW).map((c) => c.slug),
    ).toEqual(['a', 'b', 'c', 'e', 'd']);
  });

  it('breaks deadline ties by name so the order is stable', () => {
    const one = card({ slug: 'z', name: 'Beta Open' });
    const two = card({ slug: 'y', name: 'Alpha Open' });
    expect(orderCards([one, two], NOW).map((c) => c.slug)).toEqual(['y', 'z']);
  });
});

describe('toDiscoveryCard (the G1 decline path — derived, N+1, tier-side)', () => {
  const projection = {
    tournament: { name: 'Spring Open', date: '2026-09-19' },
    venue: { name: 'Kingsway Centre' },
    page: { slug: 'spring-open' },
    events: [
      { isOpen: true, closesAt: '2026-08-20 23:59 UTC' },
      { isOpen: true, closesAt: '2026-08-14 23:59 UTC' },
      { isOpen: false, closesAt: '2026-08-01 23:59 UTC' },
    ],
  };

  it('reduces the projection to the card', () => {
    expect(toDiscoveryCard(projection)).toEqual({
      slug: 'spring-open',
      name: 'Spring Open',
      tournamentDate: '2026-09-19',
      venueName: 'Kingsway Centre',
      eventCount: 3,
      entriesOpen: true,
      entriesCloseAt: '2026-08-14 23:59 UTC',
    });
  });

  it('takes the NEAREST open deadline, ignoring closed events', () => {
    // The closed event's 2026-08-01 is sooner than every open deadline and
    // must not become the countdown — its window is already spent.
    expect(toDiscoveryCard(projection).entriesCloseAt).toBe('2026-08-14 23:59 UTC');
  });

  it('is open-without-deadline when no open event has a parseable one', () => {
    const card = toDiscoveryCard({
      ...projection,
      events: [{ isOpen: true, closesAt: null }],
    });
    expect(card.entriesOpen).toBe(true);
    expect(card.entriesCloseAt).toBeNull();
  });

  it('is closed when the server says no event is open — never re-derived', () => {
    const card = toDiscoveryCard({
      ...projection,
      events: [{ isOpen: false, closesAt: '2099-01-01 00:00 UTC' }],
    });
    expect(card.entriesOpen).toBe(false);
    expect(card.entriesCloseAt).toBeNull();
  });

  it('collapses a missing venue to null', () => {
    expect(toDiscoveryCard({ ...projection, venue: null }).venueName).toBeNull();
  });
});

// ---- parseFilters ----------------------------------------------------------

describe('parseFilters', () => {
  it('reads the whole vocabulary', () => {
    expect(
      parseFilters(new URLSearchParams('status=open&preset=7d&from=2026-09-01&to=2026-09-30&q=gold')),
    ).toEqual({ status: 'open', preset: '7d', from: '2026-09-01', to: '2026-09-30', q: 'gold' });
  });

  it('drops unknown values instead of erroring — a URL is typeable', () => {
    expect(parseFilters(new URLSearchParams('status=live&preset=1y&from=&to='))).toEqual(
      filters(),
    );
  });

  it('reports whether anything is active', () => {
    expect(anyFilterActive(filters())).toBe(false);
    expect(anyFilterActive(filters({ q: '  ' }))).toBe(false);
    expect(anyFilterActive(filters({ status: 'open' }))).toBe(true);
  });
});

// ---- visibleBlocks / totalBarState -----------------------------------------

describe('visibleBlocks', () => {
  const player = { name: 'A', gender: '', club: '', birthYear: '', remarks: '', events: [] };

  it.each([
    ['an empty echo shows one block', echo(), false, 1],
    ['echoed players keep their blocks', echo({ players: [player, player] }), false, 2],
    ['addPlayer adds exactly one', echo({ players: [player, player] }), true, 3],
    ['the display clamp holds at 8', echo({ players: Array(9).fill(player) }), true, 8],
  ])('%s', (_label, input, addPlayer, expected) => {
    expect(visibleBlocks(input, addPlayer)).toBe(expected);
  });
});

describe('totalBarState', () => {
  const players = [
    { name: 'P', gender: 'F', club: '', birthYear: '', remarks: '', events: ['0:a', '0:b'] },
    { name: 'D', gender: 'M', club: '', birthYear: '', remarks: '', events: ['1:c'] },
  ];

  it('is unquoted with no total and no refusal', () => {
    expect(totalBarState(echo({ players }))).toEqual({ kind: 'unquoted' });
  });

  it('shows the server total and counts the ticked events', () => {
    expect(totalBarState(echo({ players, totalCents: 3800 }))).toEqual({
      kind: 'quoted',
      totalCents: 3800,
      eventCount: 3,
    });
  });

  it('a refusal wins over a stale total', () => {
    expect(totalBarState(echo({ players, totalCents: 3800, refusal: 'No.' }))).toEqual({
      kind: 'refused',
      copy: 'No.',
    });
  });
});

// ---- timelineModel ---------------------------------------------------------

describe('timelineModel', () => {
  it('renders agreed moments singly, disagreements as per-event variance', () => {
    const events = [
      event(),
      event({ isOpen: false, closesAt: '2026-08-01 23:59 UTC' }), // closed early
    ];

    expect(timelineModel(events, '2026-09-19', NOW)).toEqual([
      { label: 'Entries open', at: '2026-06-01 09:00 UTC', state: 'past' },
      // The two deadlines straddle the fixture clock, so the range is where
      // "now" lives.
      { label: 'Entries close', at: null, state: 'current', variance: 'per-event' },
      { label: 'Withdrawal deadline', at: '2026-09-05 18:00 UTC', state: 'future' },
      { label: 'Tournament', at: '2026-09-19', state: 'future' },
    ]);
  });

  it('omits a moment that exists nowhere — no placeholders (rule 4)', () => {
    const bare = [event({ opensAt: null, withdrawsUntil: null })];
    expect(timelineModel(bare, null, NOW).map((m) => m.label)).toEqual(['Entries close']);
  });

  it('marks the tournament day itself as current, and a finished one as past', () => {
    const events = [event()];
    expect(timelineModel(events, '2026-08-11', NOW).at(-1)).toEqual({
      label: 'Tournament',
      at: '2026-08-11',
      state: 'current',
    });
    expect(timelineModel(events, '2026-08-10', NOW).at(-1)).toEqual({
      label: 'Tournament',
      at: '2026-08-10',
      state: 'past',
    });
  });
});

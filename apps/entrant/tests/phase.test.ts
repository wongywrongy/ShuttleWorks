/**
 * The phase-gating pure functions, held to the design documents' state tables
 * (SP-P6-2 §6, SP-P8 §2) — transcribed, not paraphrased. Everything the public
 * pages decide (chip, CTA, tabs, filters, segment views, month sections, the
 * status cell, total bar, timeline) is a pure function of data + `now`, so
 * these are plain input/output tables with no server in the loop.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  actionCell,
  activeTab,
  chipLabel,
  chipState,
  ctaState,
  displayTitle,
  entriesOpen,
  filtersToParams,
  nearestCloseAt,
  parseFilters,
  parseIsoDate,
  parseMoment,
  resolveSeason,
  rowMatches,
  seasonModel,
  seasonYears,
  timelineModel,
  normalizeTournamentPhase,
  phaseLabel,
  tournamentPhase,
  totalBarState,
  visibleBlocks,
  visibleTabs,
  type Filters,
  type PageStatus,
  type PhaseEvent,
  type SeasonRow,
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

/** One row of the SP-P8 `GET /e/api/pages` season list. */
const row = (over: Partial<SeasonRow>): SeasonRow => ({
  slug: 's', name: 'T', organizer: null, venueName: null, date: null,
  eventCount: 0, status: 'entries_closed', closesInDays: null,
  closesAt: null, timeZone: 'UTC', locality: null,
  drawsPublished: false, winnersPublished: false, ...over,
});

const NO_FILTERS: Filters = { year: null, q: '' };

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
    // `_moment` (apps/api/src/entries/entries_public.py) is the producer. If its
    // strftime format ever changes, this line goes red HERE, where the parser
    // that assumed it lives — the `test_form_csrf_cross_tier.py` argument.
    const source = readFileSync(
      new URL('../../../apps/api/src/entries/entries_public.py', import.meta.url),
      'utf8',
    );
    expect(source).toContain('"%Y-%m-%d %H:%M UTC"');
  });
});

describe('PageStatus', () => {
  it('pins the six statuses against the Python side (the cross-tier idiom)', () => {
    // `PAGE_STATUSES` (apps/api/src/entries/entries_public.py) is the producer,
    // and `statusCell` switches on it exhaustively with NO default arm — so a
    // SERVER-side seventh value would return `undefined` and TypeError the whole
    // /e/ render. tsc cannot see that; this line can. A TS-side seventh is the
    // compiler's job (the switch goes red); this pin is the other direction.
    const source = readFileSync(
      new URL('../../../apps/api/src/entries/entries_public.py', import.meta.url),
      'utf8',
    );
    const block = /PAGE_STATUSES = frozenset\(\{([^}]*)\}\)/.exec(source);
    expect(block).not.toBeNull();
    const python = new Set([...block![1].matchAll(/"([a-z_]+)"/g)].map((m) => m[1]));
    // Typed, so dropping or renaming a union member is a compile error here too.
    const ts: PageStatus[] = [
      'entries_open',
      'entries_closed',
      'in_progress_live',
      'in_progress',
      'completed_winners',
      'completed',
    ];
    expect(python).toEqual(new Set(ts));
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
    // V3-26-5: a huge relative count with no absolute date attached yet
    // (e.g. `capChipCountdown` couldn't format one) still falls back to the
    // relative form — never `undefined`/blank.
    [{ kind: 'entriesOpen', closesInDays: 3039 } as const, 'Entries open · closes in 3039d'],
    // `closesAtAbsolute` wins outright once `capChipCountdown` has set it.
    [
      { kind: 'entriesOpen', closesInDays: 3039, closesAtAbsolute: '12 Jan 2035' } as const,
      'Entries open · closes 12 Jan 2035',
    ],
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

describe('nearestCloseAt (the deadline reduction toDiscoveryCard used to carry)', () => {
  const events = [
    { isOpen: true, closesAt: '2026-08-20 23:59 UTC' },
    { isOpen: true, closesAt: '2026-08-14 23:59 UTC' },
    // Sooner than every open deadline, and must not become the countdown —
    // this event's window is already spent.
    { isOpen: false, closesAt: '2026-08-01 23:59 UTC' },
  ];

  it('takes the NEAREST open deadline as its raw wire string', () => {
    expect(nearestCloseAt(events)).toBe('2026-08-14 23:59 UTC');
  });

  it('is null when no open event has a parseable deadline', () => {
    expect(nearestCloseAt([{ isOpen: true, closesAt: null }])).toBeNull();
    expect(nearestCloseAt([{ isOpen: false, closesAt: '2099-01-01 00:00 UTC' }])).toBeNull();
    expect(nearestCloseAt([])).toBeNull();
  });
});

// ---- visibleTabs / activeTab: the §6 tables --------------------------------

describe('visibleTabs (a tab exists only when its data does)', () => {
  it.each([
    [0, 0, ['overview']],
    [2, 0, ['overview', 'draws']],
    [0, 3, ['overview', 'players']],
    [2, 3, ['overview', 'draws', 'players']],
  ])('%i events, %i entrants → %j (no publication arg: legacy rule)', (events, entrants, expected) => {
    expect(visibleTabs(Array(events).fill({}), Array(entrants).fill({}))).toEqual(expected);
  });

  // SP-P7 §4: with a publication block, the Players tab is the TD's flag,
  // not the payload length — published-and-empty is a real tab, and
  // unpublished hides one however much sits behind the gate. ADR 0028: the
  // Draws panel exists from the first event; draws and results publication
  // change what its rows carry, never whether the tab exists.
  it.each([
    [
      { entrants: false, draws: false, results: false },
      ['overview', 'draws'],
    ],
    [
      { entrants: true, draws: false, results: false },
      ['overview', 'draws', 'players'],
    ],
    [
      { entrants: true, draws: true, results: false },
      ['overview', 'draws', 'players'],
    ],
    [
      { entrants: true, draws: true, results: true },
      ['overview', 'draws', 'players'],
    ],
    [
      { entrants: false, draws: false, results: true },
      ['overview', 'draws'],
    ],
  ])('publication %j → %j', (publication, expected) => {
    expect(visibleTabs(Array(2).fill({}), [], publication)).toEqual(expected);
  });

  it('published entrants beats an empty list; unpublished beats a full one', () => {
    const on = { entrants: true, draws: false, results: false };
    const off = { entrants: false, draws: false, results: false };
    expect(visibleTabs([], [], on)).toContain('players');
    expect(visibleTabs([], Array(9).fill({}), off)).not.toContain('players');
  });
});

describe('activeTab', () => {
  const visible = ['overview', 'draws'] as const;

  it.each([
    ['a visible tab', 'draws', 'draws'],
    ['null', null, 'overview'],
    ['an unknown string', 'results', null],
    ['a data-hidden tab', 'entrants', null],
  ])('%s → %s', (_label, requested, expected) => {
    expect(activeTab(requested, [...visible])).toBe(expected);
  });

  it.each(['events', 'entrants', 'seeds', 'winners'])('rejects removed %s tabs', (removed) => {
    expect(activeTab(removed, ['overview', 'draws', 'players'])).toBeNull();
  });
});

// ---- the season list: filters, the season model, the action cell -----------

describe('parseFilters (P5: the calendar carries two things, and only two)', () => {
  it('is unspecified when the URL names nothing', () => {
    expect(parseFilters(new URLSearchParams())).toEqual({ year: null, q: '' });
  });
  it('reads a four-digit season and the deliberate all-seasons scope', () => {
    expect(parseFilters(new URLSearchParams('year=2026')).year).toBe(2026);
    expect(parseFilters(new URLSearchParams('year=all')).year).toBe('all');
  });
  it('drops a year it cannot read rather than filtering by a guess', () => {
    for (const bad of ['banana', '26', '20266', '']) {
      expect(parseFilters(new URLSearchParams(`year=${bad}`)).year).toBeNull();
    }
  });
  it.each([['toString'], ['constructor'], ['__proto__'], ['hasOwnProperty']])(
    'ignores unknown query values safely: %s',
    (key) => {
      // A public-tier URL is attacker-typeable and the toolbar echoes state
      // back into a hidden form input, so nothing here may reach a prototype
      // member.
      expect(parseFilters(new URLSearchParams(`year=${key}&status=${key}`))).toEqual({
        year: null, q: '',
      });
    },
  );
  it('reads the search text verbatim', () => {
    expect(parseFilters(new URLSearchParams('q=gold')).q).toBe('gold');
  });
  it('ignores the retired lifecycle and date vocabulary', () => {
    expect(
      parseFilters(new URLSearchParams('view=completed&preset=30d&from=2026-09-01&to=&page=2')),
    ).toEqual({ year: null, q: '' });
  });
});

describe('filtersToParams (the inverse, so the toolbar cannot drift)', () => {
  it.each([
    [{ year: null, q: '' }, ''],
    [{ year: 2026, q: '' }, 'year=2026'],
    [{ year: 'all' as const, q: '' }, 'year=all'],
    [{ year: 2026, q: 'gold' }, 'q=gold&year=2026'],
    [{ year: null, q: '   ' }, ''],
  ])('%o serialises to %s', (filters, expected) => {
    const params = filtersToParams(filters as Filters);
    expect(params.toString()).toBe(expected);
    // The round trip is the property: whatever it writes must parse back.
    if (expected !== '') {
      expect(parseFilters(new URLSearchParams(expected))).toMatchObject({
        year: (filters as Filters).year,
      });
    }
  });
});

describe('rowMatches (search is text, and only text)', () => {
  it('searches name, organizer and venue (D2 — there is no city)', () => {
    const r = row({ name: 'Fall Open', organizer: 'Balboa BC', venueName: 'Riverside Hall' });
    for (const q of ['fall', 'balboa', 'riverside']) {
      expect(rowMatches(r, q)).toBe(true);
    }
    expect(rowMatches(r, 'zurich')).toBe(false);
  });
  it('matches everything for an empty or whitespace query', () => {
    expect(rowMatches(row({}), '')).toBe(true);
    expect(rowMatches(row({}), '   ')).toBe(true);
  });
});

describe('seasonYears / resolveSeason', () => {
  const rows = [
    row({ slug: 'a', date: '2026-09-11' }),
    row({ slug: 'b', date: '2026-10-01' }),
    row({ slug: 'c', date: '2024-03-02' }),
    row({ slug: 'tbc', date: null }),
  ];
  it('names each season once, most recent first, and never invents one', () => {
    expect(seasonYears(rows)).toEqual([2026, 2024]);
    expect(seasonYears([row({ date: null })])).toEqual([]);
  });
  it('honours a deliberate season and the deliberate all-seasons scope', () => {
    expect(resolveSeason(rows, { year: 2024, q: '' }, NOW)).toBe(2024);
    expect(resolveSeason(rows, { year: 'all', q: '' }, NOW)).toBeNull();
  });
  it('lets a typed search cross every season', () => {
    expect(resolveSeason(rows, { year: null, q: 'fall' }, NOW)).toBeNull();
  });
  it('lands a bare visit on this calendar year when it has rows', () => {
    expect(resolveSeason(rows, NO_FILTERS, NOW)).toBe(2026);
  });
  it('falls forward to the nearest future season, then back to the latest past one', () => {
    const future = [row({ date: '2028-01-01' }), row({ date: '2030-01-01' })];
    expect(resolveSeason(future, NO_FILTERS, NOW)).toBe(2028);
    const past = [row({ date: '2019-01-01' }), row({ date: '2021-01-01' })];
    expect(resolveSeason(past, NO_FILTERS, NOW)).toBe(2021);
  });
  it('answers this year when nothing is published at all', () => {
    expect(resolveSeason([], NO_FILTERS, NOW)).toBe(2026);
  });
});

describe('seasonModel (P5: one season, upcoming ascending then past descending)', () => {
  // NOW is 2026-08-11.
  const rows = [
    row({ slug: 'sep', status: 'entries_open', date: '2026-09-11' }),
    row({ slug: 'aug-later', status: 'entries_closed', date: '2026-08-20' }),
    row({ slug: 'oct', status: 'entries_open', date: '2026-10-03' }),
    row({ slug: 'jul', status: 'completed_winners', date: '2026-07-04' }),
    row({ slug: 'jun', status: 'entries_closed', date: '2026-06-01' }),
    row({ slug: 'last-year', status: 'completed', date: '2025-11-01' }),
    row({ slug: 'tbc', status: 'entries_open', date: null }),
  ];

  it('orders upcoming months ascending and past months descending', () => {
    const model = seasonModel(rows, NO_FILTERS, NOW);
    expect(model.season).toBe(2026);
    expect(model.upcoming.map((m) => m.label)).toEqual([
      'August 2026', 'September 2026', 'October 2026',
    ]);
    expect(model.upcoming.flatMap((m) => m.rows).map((r) => r.slug)).toEqual([
      'aug-later', 'sep', 'oct',
    ]);
    expect(model.past.map((m) => m.label)).toEqual(['July 2026', 'June 2026']);
    expect(model.past.flatMap((m) => m.rows).map((r) => r.slug)).toEqual(['jul', 'jun']);
  });

  it('treats a completed tournament as past whatever its stored date says', () => {
    const model = seasonModel(
      [row({ slug: 'done', status: 'completed', date: '2026-12-01' })],
      { year: 2026, q: '' },
      NOW,
    );
    expect(model.upcoming).toEqual([]);
    expect(model.past.flatMap((m) => m.rows).map((r) => r.slug)).toEqual(['done']);
  });

  it('bounds the page to one season, and says how much it left out', () => {
    const model = seasonModel(rows, NO_FILTERS, NOW);
    expect(model.publishedCount).toBe(7);
    // Six 2026 rows plus the dateless one; last year's is not on this page.
    expect(model.listedCount).toBe(6);
    const slugs = [
      ...model.upcoming.flatMap((m) => m.rows),
      ...model.upcomingUndated,
      ...model.past.flatMap((m) => m.rows),
      ...model.pastUndated,
    ].map((r) => r.slug);
    expect(slugs).not.toContain('last-year');
    expect(model.years).toEqual([2026, 2025]);
  });

  it('lists a dateless tournament in every season rather than hiding it in all of them', () => {
    for (const year of [2026, 2025] as const) {
      const model = seasonModel(rows, { year, q: '' }, NOW);
      expect(model.upcomingUndated.map((r) => r.slug)).toEqual(['tbc']);
    }
    // And it is never given a month it does not have.
    expect(
      seasonModel(rows, NO_FILTERS, NOW).upcoming.flatMap((m) => m.rows).map((r) => r.slug),
    ).not.toContain('tbc');
  });

  it('keeps a dateless PAST tournament in the past half', () => {
    const model = seasonModel(
      [row({ slug: 'old-tbc', status: 'completed', date: null })],
      NO_FILTERS,
      NOW,
    );
    expect(model.pastUndated.map((r) => r.slug)).toEqual(['old-tbc']);
    expect(model.upcomingUndated).toEqual([]);
  });

  it('applies the search inside the season, and across seasons when asked', () => {
    const named = [
      row({ slug: 'a', name: 'Harbour Cup', status: 'entries_open', date: '2026-09-01' }),
      row({ slug: 'b', name: 'Harbour Cup', status: 'completed', date: '2019-09-01' }),
    ];
    expect(seasonModel(named, { year: 2026, q: 'harbour' }, NOW).listedCount).toBe(1);
    expect(seasonModel(named, { year: 'all', q: 'harbour' }, NOW).listedCount).toBe(2);
    expect(seasonModel(named, { year: 'all', q: 'zurich' }, NOW).listedCount).toBe(0);
  });
});

describe('displayTitle (P5: the grouping says the year, so the title need not)', () => {
  it.each([
    ['2026 Taipei Open', '2026-07-31', 'Taipei Open'],
    ['Taipei Open 2026', '2026-07-31', 'Taipei Open'],
    ['Taipei Open - 2026', '2026-07-31', 'Taipei Open'],
    // A year that is not THIS row's year is part of the name, not a stamp.
    ['1992 Memorial Cup', '2026-07-31', '1992 Memorial Cup'],
    // Never leave an empty title behind.
    ['2026', '2026-07-31', '2026'],
    // Mid-name years are untouched: this is a stamp remover, not a scrubber.
    ['The 2026 Cup', '2026-07-31', 'The 2026 Cup'],
  ])('%s on %s reads as %s', (name, date, expected) => {
    expect(displayTitle(row({ name, date }))).toBe(expected);
  });

  it('leaves a dateless row alone — there is no year to be redundant with', () => {
    expect(displayTitle(row({ name: '2026 Taipei Open', date: null }))).toBe('2026 Taipei Open');
  });

  it('falls back to the slug when the organizer published no name', () => {
    expect(displayTitle(row({ slug: 'x', name: null, date: '2026-07-31' }))).toBe('x');
  });
});

describe('actionCell — one action slot, one arm per enum case', () => {
  it('offers the real entry flow while entries are open, with the closing instant', () => {
    expect(actionCell(row({
      slug: 'x', status: 'entries_open',
      closesAt: '2026-08-14 23:59 UTC', timeZone: 'Asia/Seoul',
    }), false)).toEqual({
      kind: 'enter', href: '/e/x/enter',
      closesAt: '2026-08-14 23:59 UTC', timeZone: 'Asia/Seoul',
    });
  });
  it('carries no countdown at all — the deadline is a date, not a duration', () => {
    const cell = actionCell(row({ status: 'entries_open', closesInDays: 5 }), false);
    expect(JSON.stringify(cell)).not.toContain('5');
  });
  it('in_progress_live deep-links to draws', () => {
    expect(actionCell(row({ slug: 'x', status: 'in_progress_live' }), false)).toEqual({
      kind: 'live', label: 'Follow live', href: '/e/x?tab=draws',
    });
  });
  it('in_progress without published draws is plain text — no link', () => {
    expect(actionCell(row({ status: 'in_progress' }), false)).toEqual({
      kind: 'text', label: 'In progress',
    });
  });
  it('entries_closed says so where entry status is what matters', () => {
    expect(actionCell(row({ status: 'entries_closed' }), false)).toEqual({
      kind: 'text', label: 'Entries closed',
    });
  });
  it('a PAST row gets Results only, whatever its stored status says', () => {
    for (const status of ['entries_open', 'entries_closed', 'in_progress_live'] as const) {
      expect(actionCell(row({ slug: 'x', status, drawsPublished: true }), true)).toEqual({
        kind: 'results', href: '/e/x?tab=draws',
      });
    }
  });
  it('links Results whether draws or winners were published (ADR 0028)', () => {
    expect(actionCell(row({ slug: 'x', status: 'completed', drawsPublished: true }), true)).toEqual({
      kind: 'results', href: '/e/x?tab=draws',
    });
    expect(actionCell(row({ slug: 'x', status: 'completed_winners', winnersPublished: true }), true)).toEqual({
      kind: 'results', href: '/e/x?tab=draws',
    });
  });
  it('a past row with nothing published is TEXT — never a dead link (§7 trap 3)', () => {
    const cell = actionCell(row({ status: 'completed' }), true);
    expect(cell).toEqual({ kind: 'text', label: 'Results not published' });
    expect('href' in cell).toBe(false);
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

describe('public tournament lifecycle', () => {
  it('normalizes newer and season-projection status names', () => {
    expect(normalizeTournamentPhase('in_progress_live')).toBe('live');
    expect(normalizeTournamentPhase('completed_winners')).toBe('complete');
    expect(normalizeTournamentPhase('unknown')).toBeNull();
    expect(phaseLabel('draws_published')).toBe('Draws published');
  });

  it('falls back to publication and entry facts when lifecycle is absent', () => {
    expect(tournamentPhase({ publication: { draws: true, results: false }, events: [] })).toBe('draws_published');
    expect(tournamentPhase({ publication: { draws: false, results: false }, events: [{ isOpen: true }] })).toBe('entries_open');
    expect(tournamentPhase({ publication: { draws: false, results: false }, events: [] })).toBe('entries_closed');
  });
});

describe('timelineModel (public-visual-fixes P6: currently relevant dates only)', () => {
  it('states one entries row, the deadline still ahead, and the play day', () => {
    const events = [
      event(),
      event({ isOpen: false, closesAt: '2026-08-01 23:59 UTC' }), // closed early
    ];

    expect(timelineModel(events, '2026-09-19', NOW)).toEqual([
      // The two deadlines straddle the fixture clock, so the range is where
      // "now" lives — and the elapsed OPENING date is gone entirely: entries
      // being open is not news once they are.
      { label: 'Entries', at: null, state: 'current', status: 'Closes', kind: 'entries', variance: 'per-event' },
      { label: 'Withdrawal deadline', at: '2026-09-05 18:00 UTC', state: 'future', kind: 'withdrawal' },
      { label: 'Play', at: '2026-09-19', state: 'future', kind: 'play' },
    ]);
  });

  it('says "Closed" once the window has passed, and drops a passed withdrawal deadline', () => {
    const closed = [
      event({
        isOpen: false,
        opensAt: '2026-06-01 09:00 UTC',
        closesAt: '2026-07-22 23:59 UTC',
        withdrawsUntil: '2026-07-30 18:00 UTC',
      }),
    ];
    expect(timelineModel(closed, '2026-09-19', NOW)).toEqual([
      { label: 'Entries', at: '2026-07-22 23:59 UTC', state: 'past', status: 'Closed', kind: 'entries' },
      { label: 'Play', at: '2026-09-19', state: 'future', kind: 'play' },
    ]);
  });

  it('leads with the opening date while entries have not opened yet', () => {
    const upcoming = [
      event({ isOpen: false, opensAt: '2026-09-01 09:00 UTC', closesAt: '2026-09-20 23:59 UTC' }),
    ];
    expect(timelineModel(upcoming, null, NOW)[0]).toEqual({
      label: 'Entries',
      at: '2026-09-01 09:00 UTC',
      state: 'future',
      status: 'Opens',
      kind: 'entries',
    });
  });

  it('omits a moment that exists nowhere — no placeholders (rule 4)', () => {
    const bare = [event({ opensAt: null, withdrawsUntil: null })];
    expect(timelineModel(bare, null, NOW).map((m) => m.label)).toEqual(['Entries']);
  });

  it('marks the play day itself as current, and leaves a finished event only its play date', () => {
    const events = [event()];
    expect(timelineModel(events, '2026-08-11', NOW).at(-1)).toEqual({
      label: 'Play',
      at: '2026-08-11',
      state: 'current',
      kind: 'play',
    });
    // Past: the entry windows are history, so the only row left is the day
    // it was played.
    expect(timelineModel(events, '2026-08-10', NOW)).toEqual([
      { label: 'Play', at: '2026-08-10', state: 'past', kind: 'play' },
    ]);
  });
});

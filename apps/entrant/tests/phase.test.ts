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
  activeTab,
  anyFilterActive,
  chipLabel,
  chipState,
  ctaState,
  dateFilterActive,
  entriesOpen,
  monthGroupsDesc,
  nearestCloseAt,
  parseFilters,
  parseIsoDate,
  parseMoment,
  rowMatches,
  seasonSections,
  statusCell,
  timelineModel,
  totalBarState,
  viewRows,
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
  drawsPublished: false, winnersPublished: false, ...over,
});

const NO_FILTERS: Filters = { view: 'season', preset: null, from: null, to: null, q: '' };

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
      ['overview', 'events', 'entrants', 'players', 'draws', 'seeds'],
    ],
    [
      { entrants: true, draws: true, results: true },
      ['overview', 'events', 'entrants', 'players', 'draws', 'seeds', 'winners'],
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

// ---- the SP-P8 season list: filters, views, sections, the status cell -------

describe('parseFilters (SP-P8 §2.3 + old-deep-link compatibility)', () => {
  it('defaults to the season view', () => {
    expect(parseFilters(new URLSearchParams()).view).toBe('season');
  });
  it('reads ?view=', () => {
    expect(parseFilters(new URLSearchParams('view=completed')).view).toBe('completed');
  });
  it('maps the legacy ?status=open onto Taking entries', () => {
    expect(parseFilters(new URLSearchParams('status=open')).view).toBe('open');
  });
  it('maps ?status=past to Completed and ?status=upcoming to Season (D6)', () => {
    expect(parseFilters(new URLSearchParams('status=past')).view).toBe('completed');
    expect(parseFilters(new URLSearchParams('status=upcoming')).view).toBe('season');
  });
  it('?view= wins over a legacy ?status=', () => {
    expect(parseFilters(new URLSearchParams('view=season&status=open')).view).toBe('season');
  });
  it('keeps legacy presets valid so old preset links still filter', () => {
    expect(parseFilters(new URLSearchParams('preset=30d')).preset).toBe('30d');
  });
  it.each([['toString'], ['constructor'], ['__proto__'], ['hasOwnProperty']])(
    'reads ?status=%s off the legacy map WITHOUT its prototype chain',
    (key) => {
      // `key in map` would answer true for every Object.prototype member and
      // put a FUNCTION in `view` — a public-tier URL is attacker-typeable, and
      // Task 7 echoes `view` back into a hidden form input.
      expect(parseFilters(new URLSearchParams(`status=${key}`)).view).toBe('season');
    },
  );
  it('reads the rest of the vocabulary, dropping unknown values', () => {
    expect(
      parseFilters(new URLSearchParams('preset=1y&from=2026-09-01&to=&q=gold')),
    ).toEqual({ view: 'season', preset: null, from: '2026-09-01', to: null, q: 'gold' });
  });
});

describe('anyFilterActive / dateFilterActive (a view is not a filter)', () => {
  it.each([
    ['nothing set', NO_FILTERS, false, false],
    ['whitespace-only q', { ...NO_FILTERS, q: '  ' }, false, false],
    // The SP-P8 semantics change: switching segment is navigation, so it must
    // not light the "Clear filters" affordance or the date badge.
    ['a non-default view', { ...NO_FILTERS, view: 'completed' as const }, false, false],
    ['a preset', { ...NO_FILTERS, preset: '7d' as const }, true, true],
    ['a custom from', { ...NO_FILTERS, from: '2026-09-01' }, true, true],
    ['a custom to', { ...NO_FILTERS, to: '2026-09-30' }, true, true],
    // `rowMatches` parses from/to and ignores what it cannot parse, so an
    // unparseable one filters NOTHING — and must not claim a chip either.
    ['an unparseable from', { ...NO_FILTERS, from: 'abc' }, false, false],
    // q is a filter, but not a DATE filter — only the latter drives the chips.
    ['a query', { ...NO_FILTERS, q: 'gold' }, true, false],
  ])('%s → any %s, date %s', (_label, f, any, date) => {
    expect(anyFilterActive(f)).toBe(any);
    expect(dateFilterActive(f)).toBe(date);
  });
});

describe('rowMatches', () => {
  const now = new Date(Date.UTC(2026, 8, 12));
  it('searches name, organizer and venue (D2 — there is no city)', () => {
    const r = row({ name: 'Fall Open', organizer: 'Balboa BC', venueName: 'Riverside Hall' });
    for (const q of ['fall', 'balboa', 'riverside']) {
      expect(rowMatches(r, { ...NO_FILTERS, q }, now)).toBe(true);
    }
    expect(rowMatches(r, { ...NO_FILTERS, q: 'zurich' }, now)).toBe(false);
  });
  it('custom from/to wins over a preset', () => {
    const r = row({ date: '2026-12-01' });
    const f = { ...NO_FILTERS, preset: '7d' as const, from: '2026-11-01', to: '2026-12-31' };
    expect(rowMatches(r, f, now)).toBe(true);
  });
  it('an undated row fails any date filter', () => {
    expect(rowMatches(row({}), { ...NO_FILTERS, preset: '7d' as const }, now)).toBe(false);
  });
  it('applies a preset window forward from today', () => {
    // 2026-10-21 is 39 days out: inside 90d, outside 30d.
    const r = row({ date: '2026-10-21' });
    expect(rowMatches(r, { ...NO_FILTERS, preset: '90d' as const }, now)).toBe(true);
    expect(rowMatches(r, { ...NO_FILTERS, preset: '30d' as const }, now)).toBe(false);
  });
  it('matches everything when no filter is set', () => {
    expect(rowMatches(row({}), NO_FILTERS, now)).toBe(true);
  });
});

describe('viewRows', () => {
  it('open: entries_open only, closing soonest first', () => {
    const rows = [
      row({ slug: 'b', status: 'entries_open', closesInDays: 9 }),
      row({ slug: 'a', status: 'entries_open', closesInDays: 2 }),
      row({ slug: 'c', status: 'completed' }),
    ];
    expect(viewRows(rows, 'open').map((r) => r.slug)).toEqual(['a', 'b']);
  });
  it('open: two deadline-less rows fall through to the slug tiebreak (the NaN arm)', () => {
    const rows = [
      row({ slug: 'b', status: 'entries_open', closesInDays: null }),
      row({ slug: 'a', status: 'entries_open', closesInDays: null }),
    ];
    expect(viewRows(rows, 'open').map((r) => r.slug)).toEqual(['a', 'b']);
  });
  it('completed: both completed statuses, most recent first', () => {
    const rows = [
      row({ slug: 'old', status: 'completed', date: '2026-05-30' }),
      row({ slug: 'new', status: 'completed_winners', date: '2026-08-16' }),
      row({ slug: 'open', status: 'entries_open' }),
    ];
    expect(viewRows(rows, 'completed').map((r) => r.slug)).toEqual(['new', 'old']);
  });
  it('season: everything, in the server order', () => {
    const rows = [row({ slug: 'a' }), row({ slug: 'b' })];
    expect(viewRows(rows, 'season')).toEqual(rows);
  });
});

describe('seasonSections (§2.4: active months ascending, Completed trailing)', () => {
  it('groups active rows by month and trails completed + undated', () => {
    const rows = [
      row({ slug: 'done', status: 'completed', date: '2026-05-30' }),
      row({ slug: 'sep1', status: 'entries_open', date: '2026-09-11' }),
      row({ slug: 'sep2', status: 'entries_closed', date: '2026-09-19' }),
      row({ slug: 'oct', status: 'entries_open', date: '2026-10-03' }),
      row({ slug: 'tbc', status: 'entries_closed', date: null }),
    ];
    const s = seasonSections(rows);
    expect(s.months.map((m) => m.label)).toEqual(['September 2026', 'October 2026']);
    expect(s.months[0].rows.map((r) => r.slug)).toEqual(['sep1', 'sep2']);
    expect(s.completed.map((r) => r.slug)).toEqual(['done']);
    expect(s.undated.map((r) => r.slug)).toEqual(['tbc']);
  });
});

describe('monthGroupsDesc (the Completed view keeps its incoming order)', () => {
  it('groups date-descending rows into most-recent-first months', () => {
    const rows = viewRows(
      [
        row({ slug: 'may', status: 'completed', date: '2026-05-30' }),
        row({ slug: 'aug2', status: 'completed_winners', date: '2026-08-02' }),
        row({ slug: 'aug1', status: 'completed', date: '2026-08-16' }),
        row({ slug: 'undated', status: 'completed', date: null }),
      ],
      'completed',
    );
    expect(monthGroupsDesc(rows).map((m) => m.label)).toEqual(['August 2026', 'May 2026']);
    expect(monthGroupsDesc(rows)[0].rows.map((r) => r.slug)).toEqual(['aug1', 'aug2']);
  });
});

describe('statusCell — the §2.4 table, one arm per enum case', () => {
  it('in_progress_live is a live chip deep-linking to draws', () => {
    expect(statusCell(row({ slug: 'x', status: 'in_progress_live' }))).toEqual({
      kind: 'chip-live', label: 'In progress · follow live', href: '/e/x?tab=draws',
    });
  });
  it('in_progress without published draws is a plain chip — no link', () => {
    expect(statusCell(row({ status: 'in_progress' }))).toEqual({
      kind: 'chip-muted', label: 'In progress',
    });
  });
  it('entries_open carries the countdown chip', () => {
    expect(statusCell(row({ status: 'entries_open', closesInDays: 3 }))).toEqual({
      kind: 'chip-open', chip: { kind: 'entriesOpen', closesInDays: 3 },
    });
  });
  it('entries_closed is the gray chip', () => {
    expect(statusCell(row({ status: 'entries_closed' }))).toEqual({
      kind: 'chip-muted', label: 'Entries closed',
    });
  });
  it('completed links to Draws first, then Winners when draws are unavailable', () => {
    expect(statusCell(row({ slug: 'x', status: 'completed', drawsPublished: true }))).toEqual({
      kind: 'link', label: 'Draws', href: '/e/x?tab=draws',
    });
    expect(statusCell(row({ slug: 'x', status: 'completed_winners', winnersPublished: true }))).toEqual({
      kind: 'link', label: 'Winners', href: '/e/x?tab=winners',
    });
  });
  it('completed without winners is TEXT — never a dead link (§7 trap 3)', () => {
    const cell = statusCell(row({ status: 'completed' }));
    expect(cell).toEqual({ kind: 'text', label: 'Completed' });
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

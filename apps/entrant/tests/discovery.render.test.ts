/**
 * `/e/` — the season calendar, asserted on real server-rendered HTML (SP-P8
 * §2, P5).
 *
 * The G1 decline is over: `GET /e/api/pages` ships every field the calendar
 * renders, so this page is ONE backend read and the old per-slug fan-out is
 * gone. That call count is pinned below, because "one read" is the property
 * the whole task bought.
 *
 * P5 replaced the three lifecycle segments with ONE continuous season: what is
 * still to come, ascending, then "Earlier this season" descending. Which half
 * a row lands in is decided against `now`, so this suite pins the CLOCK
 * (`Date` only — nothing else is faked) rather than writing 2026 literals that
 * quietly turn into past tournaments. The pinned-`now` state tables live in
 * `phase.test.ts`; this file asserts the wiring.
 */
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createServer } from 'vite';
import { createRequestHandler, type ServerBuild } from 'react-router';

import type { PageStatus, SeasonList, SeasonRow } from '../app/lib/phase';

const MASTHEAD =
  'Badminton tournaments taking entries through ShuttleWorks. Every entry is confirmed by the organizer.';

/** V3-PE01.1: the season's body sentence — a plain browsing cue, not a
 * platform description ("Explore Badminton tournaments … through
 * ShuttleWorks" read like assembled metadata and over-capitalized the sport).
 * Distinct from `MASTHEAD`, which only the `<meta name="description">`
 * carries now. */
const SEASON_INTRO = 'Find badminton tournaments, schedules, and results.';

/** The render clock. Mid-season on purpose: the fixture has real months on
 * both sides of it. */
const CLOCK = new Date('2026-08-11T12:00:00Z');
const THIS_SEASON = 2026;
const LAST_SEASON = 2025;

function row(slug: string, name: string, status: PageStatus, overrides: Partial<SeasonRow> = {}): SeasonRow {
  return {
    slug,
    name,
    organizer: 'Wessex BC',
    venueName: 'Some Hall',
    date: '2026-09-12',
    eventCount: 3,
    status,
    closesInDays: null,
    closesAt: null,
    timeZone: 'UTC',
    locality: null,
    drawsPublished: false,
    winnersPublished: false,
    ...overrides,
  };
}

/** One row per `PageStatus`: four still to come, two already played. */
const SEASON: SeasonList = {
  tournaments: [
    row('wessex-open', 'Wessex Autumn Gold', 'entries_open', {
      date: '2026-08-31',
      closesInDays: 5,
      closesAt: '2026-08-30 12:00 UTC',
      timeZone: 'Europe/London',
      locality: 'Winchester, United Kingdom',
    }),
    row('meadowbank-closed', 'Meadowbank Masters', 'entries_closed', { date: '2026-09-26' }),
    row('harbour-live', 'Harbour Invitational', 'in_progress_live', {
      date: '2026-08-11',
      drawsPublished: true,
    }),
    row('granite-progress', 'Granite City Open', 'in_progress', { date: '2026-08-12' }),
    row('sussex-winners', 'Sussex Spring Restricted', 'completed_winners', {
      date: '2026-05-02',
      winnersPublished: true,
    }),
    row('triangle-done', 'Triangle Trophy', 'completed', { date: '2026-04-11' }),
  ],
  counts: { takingEntries: 1, completed: 2 },
  now: { slug: 'harbour-live', moreCount: 2 },
};

/** The same season with nothing happening now — the strip is the server's
 *  call, so switching it off is a payload change, never a filter. */
const NO_NOW: SeasonList = { ...SEASON, now: null };

/** Two seasons, so the selector has something to select. */
const TWO_SEASONS: SeasonList = {
  ...NO_NOW,
  tournaments: [
    ...NO_NOW.tournaments,
    row('bygone-cup', 'Bygone Cup', 'completed_winners', {
      date: '2025-06-14',
      winnersPublished: true,
    }),
  ],
};

const EMPTY: SeasonList = {
  tournaments: [],
  counts: { takingEntries: 0, completed: 0 },
  now: null,
};

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
afterAll(() => vite.close());

const called: string[] = [];

beforeEach(() => {
  called.length = 0;
  process.env.API_BASE_URL = 'http://backend:8000';
  // `Date` ONLY: the season split is a comparison against today, and nothing
  // else in this render may be frozen (vite's SSR loader is async).
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(CLOCK);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

async function respond(path: string, season: SeasonList = SEASON): Promise<Response> {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input instanceof Request ? input.url : input);
      called.push(url);
      return new Response(JSON.stringify(season), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }),
  );
  const build = (await vite.ssrLoadModule(
    'virtual:react-router/server-build',
  )) as unknown as ServerBuild;
  return createRequestHandler(build, 'development')(new Request(`http://entrant.test${path}`));
}

async function render(path = '/e/', season: SeasonList = SEASON): Promise<string> {
  return (await respond(path, season)).text();
}

describe('the front door', () => {
  it('answers the basename with the season calendar, not a blank 200 or a 404', async () => {
    const res = await respond('/e/');
    const html = await res.text();

    expect(res.status).toBe(200);
    // Not `toContain('Tournaments')`: the shell's wordmark carries that word.
    expect(html).toMatch(new RegExp(`<h1[^>]*>\\s*${THIS_SEASON} season\\s*</h1>`));
    expect(html).toContain(MASTHEAD);
    expect(html).toContain(SEASON_INTRO);
    expect(html).toContain('Wessex Autumn Gold');
  });

  it('is ONE backend read — the N+1 fan-out is retired', async () => {
    await render();

    expect(called).toEqual(['http://backend:8000/e/api/pages']);
  });

  it('puts nothing between the masthead and the control row', async () => {
    const html = await render();
    // From the intro sentence in the BODY, not the `<meta name="description">`
    // that carries a longer platform sentence in the head.
    const start = html.indexOf(SEASON_INTRO, html.indexOf('<h1')) + SEASON_INTRO.length;
    const between = html.slice(start, html.indexOf('name="q"', start));

    expect(between).not.toMatch(/<h2|<ul/);
    expect(between).toContain('aria-label="Season"');
  });

  it('ships zero script tags and mints nothing', async () => {
    const res = await respond('/e/');
    const html = await res.text();

    expect(html).not.toContain('<script');
    expect(res.headers.get('set-cookie')).toBeNull();
    expect(html).not.toContain('name="_csrf"');
  });
});

describe('one season, upcoming then earlier (P5)', () => {
  it('reads top to bottom as time does, with the past on the same page', async () => {
    const html = await render('/e/', NO_NOW);

    expect(html).toContain('August 2026');
    expect(html).toContain('September 2026');
    expect(html).toContain('Earlier this season');
    expect(html).toContain('May 2026');
    // Upcoming first, in full weight; the past below it.
    expect(html.indexOf('Wessex Autumn Gold')).toBeLessThan(html.indexOf('Earlier this season'));
    expect(html.indexOf('Earlier this season')).toBeLessThan(html.indexOf('Sussex Spring Restricted'));
    // Ascending on top, descending below.
    expect(html.indexOf('Harbour Invitational')).toBeLessThan(html.indexOf('Meadowbank Masters'));
    expect(html.indexOf('Sussex Spring Restricted')).toBeLessThan(html.indexOf('Triangle Trophy'));
  });

  it('shows no lifecycle tabs, facet counts or archive detour anywhere', async () => {
    const html = await render('/e/', NO_NOW);

    for (const gone of [
      'Live &amp; upcoming',
      'Entries open ·',
      'Completed ·',
      'Looking for past results?',
      'View completed tournaments',
      'Tournament pages',
      'aria-label="Calendar view"',
    ]) {
      expect(html).not.toContain(gone);
    }
  });

  it('mutes the past rows, drops their venue line and offers Results only', async () => {
    const html = await render('/e/', NO_NOW);
    const past = html.slice(html.indexOf('Earlier this season'));

    expect(past).toContain('Sussex Spring Restricted');
    expect(past).not.toContain('Some Hall');
    expect(past).toMatch(/<a href="\/e\/sussex-winners\?tab=draws"/);
    // Nothing published on the other one, so nowhere to link (§7 trap 3).
    expect(past).toContain('Results not published');
    expect(past).not.toContain('/e/triangle-done?tab=');
  });

  it('names the season boundary in the count line', async () => {
    const html = await render('/e/', NO_NOW);
    expect(html).toContain(`6 tournaments in the ${THIS_SEASON} season`);
  });
});

describe('the entry action (P5)', () => {
  it('links Enter to the real entry flow and names the closing day', async () => {
    const html = await render('/e/', NO_NOW);

    expect(html).toContain('href="/e/wessex-open/enter"');
    // 12:00 UTC on 30 August is 13:00 in London, still the 30th.
    expect(html).toContain('Enter · closes 30 Aug');
  });

  it('carries no countdown, no offset and no zone spelling', async () => {
    const html = await render('/e/', NO_NOW);

    expect(html).not.toContain('closes in 5d');
    expect(html).not.toContain('· 5d');
    expect(html).not.toContain('GMT+1');
    expect(html).not.toContain('Europe/London');
  });

  it('says Entries closed where entry status is what matters', async () => {
    const html = await render('/e/', NO_NOW);
    expect(html).toContain('Entries closed');
  });
});

describe('the NOW strip (§2.1)', () => {
  it('renders the band the server picked, with its jump into the calendar', async () => {
    const html = await render();

    expect(html).toContain('aria-label="Now playing"');
    expect(html).toContain('Harbour Invitational');
    // React splits interpolated text with `<!-- -->` markers in SSR output.
    expect(html).toMatch(/href="#calendar"[^>]*>\+(<!-- -->)?2(<!-- -->)? more</);
  });

  it('is ABSENT — no band, no placeholder — when the server picked nothing', async () => {
    const html = await render('/e/', NO_NOW);

    expect(html).not.toContain('Now playing');
  });

  it('never re-derives "happening now" from a date: in_progress in window, no strip', async () => {
    // §7 trap 1, frontend half. `in_progress` means the director has NOT
    // published draws; only the server can know that, so a row dated today
    // must not conjure a band the payload does not carry.
    const html = await render('/e/', {
      tournaments: [row('granite-progress', 'Granite City Open', 'in_progress', { date: '2026-08-11' })],
      counts: { takingEntries: 0, completed: 0 },
      now: null,
    });

    expect(html).toContain('Granite City Open');
    expect(html).not.toContain('Now playing');
  });

  it('steps aside for a search, which is a deliberate question about something else', async () => {
    const html = await render('/e/?q=Triangle&year=all');
    expect(html).not.toContain('Now playing');
  });
});

describe('the toolbar: season selector + search (P5)', () => {
  it('offers each published season and an all-seasons escape', async () => {
    const html = await render('/e/', TWO_SEASONS);

    expect(html).toContain('aria-label="Season"');
    expect(html).toContain(`href="/e/?year=${THIS_SEASON}#calendar"`);
    expect(html).toContain(`href="/e/?year=${LAST_SEASON}#calendar"`);
    expect(html).toContain('href="/e/?year=all#calendar"');
  });

  it('bounds the page to one season — last season is not rendered', async () => {
    const html = await render('/e/', TWO_SEASONS);
    expect(html).not.toContain('Bygone Cup');
  });

  it('shows another season when the URL names it, and says so in the h1', async () => {
    const html = await render(`/e/?year=${LAST_SEASON}`, TWO_SEASONS);

    expect(html).toMatch(new RegExp(`<h1[^>]*>\\s*${LAST_SEASON} season\\s*</h1>`));
    expect(html).toContain('Bygone Cup');
    expect(html).not.toContain('Wessex Autumn Gold');
  });

  it('lists every season at once when the reader asks for it', async () => {
    const html = await render('/e/?year=all', TWO_SEASONS);

    expect(html).toMatch(/<h1[^>]*>\s*All tournaments\s*<\/h1>/);
    expect(html).toContain('Bygone Cup');
    expect(html).toContain('Wessex Autumn Gold');
    expect(html).toContain('Earlier tournaments');
  });

  it('searches name, organizer and venue, and stays in the season on screen', async () => {
    const html = await render(`/e/?q=granite&year=${THIS_SEASON}`, NO_NOW);

    expect(html).toContain('Granite City Open');
    expect(html).not.toContain('Wessex Autumn Gold');
    expect(html).toContain(`1 tournament in the ${THIS_SEASON} season match`);
  });

  it('lets a shared bare search URL cross every season', async () => {
    const html = await render('/e/?q=Bygone', TWO_SEASONS);

    expect(html).toContain('Bygone Cup');
    expect(html).toContain('every season');
  });

  it('returns 404 for the removed ?status= route alias', async () => {
    const html = await render('/e/?status=open', NO_NOW);

    expect(html).toContain('This page is not available');
  });
});

describe('the two empty states', () => {
  it('says so honestly when nothing is published at all — no dead action', async () => {
    const html = await render('/e/', EMPTY);

    expect(html).toContain('No tournaments on the calendar yet');
    expect(html).not.toContain('id="calendar"');
    expect(html).not.toContain('Clear filters');
  });

  it('offers the wider search when a query matched nothing in the season on screen', async () => {
    const html = await render(`/e/?q=zzz-no-such&year=${THIS_SEASON}`);

    expect(html).toContain('No tournaments match');
    expect(html).toMatch(/<a href="\/e\/\?q=zzz-no-such&amp;year=all#calendar"/);
    expect(html).toContain('Search all seasons');
  });

  it('offers no wider search when the query already crossed every season', async () => {
    const html = await render('/e/?q=zzz-no-such');

    expect(html).toContain('No tournaments match');
    expect(html).not.toContain('Search all seasons');
    expect(html).toContain('Back to the calendar');
  });

  it('takes the same arm for an empty SEASON — never a bare empty calendar', async () => {
    // §2.4: a conditional element disappears cleanly. A season is a selection
    // too, so `?year=2019` over a list with nothing in 2019 has zero rows.
    const html = await render('/e/?year=2019', NO_NOW);

    expect(html).toContain('No tournaments match');
    expect(html).toContain('Choose another season above');
    expect(html).not.toContain('id="calendar"');
  });
});

describe('E5/P5: the URL carries the season and the search, and nothing else', () => {
  it.each([
    // The retired page-two of a two-item list.
    ['/e/?page=2', '/e/'],
    // The retired date facet.
    ['/e/?preset=7d&from=2026-09-01&to=2026-09-30', '/e/'],
    // The retired lifecycle segments. `completed` named the archive, so it
    // lands on the past section rather than nowhere.
    ['/e/?view=open', '/e/'],
    ['/e/?view=all&q=Gold', '/e/?q=Gold'],
    ['/e/?view=completed', '/e/#past'],
    ['/e/?view=completed&year=2026', '/e/?year=2026#past'],
    // Blank fields a native GET form submits.
    ['/e/?q=&year=', '/e/'],
    // A year nothing can read narrows nothing, so it does not stay in a URL
    // describing a filter the list is not under.
    ['/e/?year=banana', '/e/'],
  ])('canonicalises %s to %s', async (path, expected) => {
    const response = await respond(path);
    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe(expected);
    const destination = await respond(expected.split('#')[0]);
    expect(destination.status).toBe(200);
  });

  it('keeps the two live parameters, in one canonical order', async () => {
    const res = await respond(`/e/?year=${THIS_SEASON}&q=gold`);
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe(`/e/?q=gold&year=${THIS_SEASON}`);
  });

  it('answers an already-clean URL directly — no redirect, no loop', async () => {
    // The half that makes the canonicalisation safe: the redirect target must
    // itself be answered 200, or every visit is an infinite bounce.
    for (const path of ['/e/', '/e/?q=gold', `/e/?year=${THIS_SEASON}`, '/e/?year=all']) {
      expect((await respond(path)).status).toBe(200);
    }
  });
});

describe('the retired sidebar and facets leave nothing behind', () => {
  it('renders no status facet, no date popover and no second search landmark', async () => {
    const html = await render('/e/', NO_NOW);

    expect(html).not.toContain('aria-label="Status"');
    expect(html).not.toContain('aria-label="Dates"');
    expect(html).not.toContain('<details');
    expect(html).not.toContain('data-active-filter-row');
    // Exactly one, and since SP-P8 §4 it is the toolbar's search form, not the
    // shell's — the header sheds its search and this page owns it.
    expect(html.match(/role="search"/g)).toHaveLength(1);
    expect(html).not.toMatch(/<a[^>]*>Entries open<\/a>/);
  });
});

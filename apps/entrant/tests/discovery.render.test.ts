/**
 * `/e/` — the season calendar, asserted on real server-rendered HTML (SP-P8 §2).
 *
 * The G1 decline is over: `GET /e/api/pages` ships every field the calendar
 * renders, so this page is ONE backend read and the old per-slug fan-out is
 * gone. That call count is pinned below, because "one read" is the property the
 * whole task bought.
 *
 * Dates are fixed 2026 strings: nothing this page decides reads the clock
 * (no date filter is set in these fixtures, and the views neither filter nor
 * order by `now`), so the real-clock renders stay deterministic. The pinned-
 * `now` state tables live in `phase.test.ts`; this file asserts the wiring.
 */
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createServer } from 'vite';
import { createRequestHandler, type ServerBuild } from 'react-router';

import type { PageStatus, SeasonList, SeasonRow } from '../app/lib/phase';

const MASTHEAD =
  'Badminton tournaments taking entries through ShuttleWorks. Every entry is confirmed by the organizer.';

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
    drawsPublished: false,
    winnersPublished: false,
    ...overrides,
  };
}

/** One row per `PageStatus`, plus the NOW pick. */
const SEASON: SeasonList = {
  tournaments: [
    row('wessex-open', 'Wessex Autumn Gold', 'entries_open', { closesInDays: 5 }),
    row('meadowbank-closed', 'Meadowbank Masters', 'entries_closed', { date: '2026-09-26' }),
    row('harbour-live', 'Harbour Invitational', 'in_progress_live', {
      date: '2026-10-03',
      drawsPublished: true,
    }),
    row('granite-progress', 'Granite City Open', 'in_progress', { date: '2026-10-04' }),
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
});
afterEach(() => {
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
    expect(html).toMatch(/<h1[^>]*>\s*Tournaments\s*<\/h1>/);
    expect(html).toContain(MASTHEAD);
    expect(html).toContain('Wessex Autumn Gold');
  });

  it('is ONE backend read — the N+1 fan-out is retired', async () => {
    await render();

    expect(called).toEqual(['http://backend:8000/e/api/pages']);
  });

  it('puts nothing between the masthead and the control row', async () => {
    const html = await render();
    // From the masthead in the BODY, not the `<meta name="description">` that
    // carries the same sentence in the head.
    const start = html.indexOf(MASTHEAD, html.indexOf('<h1')) + MASTHEAD.length;
    const between = html.slice(start, html.indexOf('name="q"', start));

    expect(between).not.toMatch(/<h2|<section|<ul|<a\s/);
  });

  it('ships zero script tags and mints nothing', async () => {
    const res = await respond('/e/');
    const html = await res.text();

    expect(html).not.toContain('<script');
    expect(res.headers.get('set-cookie')).toBeNull();
    expect(html).not.toContain('name="_csrf"');
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
    const today = new Date().toISOString().slice(0, 10);
    const html = await render('/e/', {
      tournaments: [row('granite-progress', 'Granite City Open', 'in_progress', { date: today })],
      counts: { takingEntries: 0, completed: 0 },
      now: null,
    });

    expect(html).toContain('Granite City Open');
    expect(html).not.toContain('Now playing');
  });
});

describe('the control row (§2.3)', () => {
  it('has no chip row at all in the default state (§7 trap 4)', async () => {
    const html = await render();

    expect(html).not.toContain('data-chip-row');
  });

  it("labels the segments with the server's unfiltered counts, verbatim", async () => {
    const html = await render();

    expect(html).toContain('Taking entries · 1');
    expect(html).toContain('Completed · 2');
  });

  it('maps a legacy ?status= link onto the equivalent view (§7 trap 5)', async () => {
    const html = await render('/e/?status=open', NO_NOW);

    expect(html).toContain('Wessex Autumn Gold');
    expect(html).not.toContain('Meadowbank Masters');
    expect(html).not.toContain('Harbour Invitational');
  });

  it('searches name, organizer and venue', async () => {
    const html = await render('/e/?q=granite', NO_NOW);

    expect(html).toContain('Granite City Open');
    expect(html).not.toContain('Wessex Autumn Gold');
  });
});

describe('the calendar (§2.4)', () => {
  it('sections the active rows under their month header', async () => {
    const html = await render();

    expect(html).toContain('September 2026');
  });

  it('links Winners where they are published and says Completed where they are not (§7 trap 3)', async () => {
    const html = await render();

    expect(html).toMatch(/<a href="\/e\/sussex-winners\?tab=winners"/);
    expect(html).toContain('Winners');
    expect(html).toMatch(/text-muted-foreground">Completed<\/span>/);
    expect(html).not.toContain('/e/triangle-done?tab=winners');
  });
});

describe('the two empty states', () => {
  it('says so honestly when the calendar is empty — no dead Clear action', async () => {
    const html = await render('/e/', EMPTY);

    expect(html).toContain('No tournaments on the calendar yet');
    expect(html).toContain('No tournament is taking entries right now');
    expect(html).not.toContain('Clear filters');
  });

  it('offers Clear filters when a query matched nothing', async () => {
    const html = await render('/e/?q=zzz-no-such');

    expect(html).toContain('No tournaments match');
    expect(html).toMatch(/<a href="\/e\/"[^>]*>Clear filters<\/a>/);
  });

  it('takes the same arm for an empty SEGMENT — never a bare empty calendar', async () => {
    // §2.4: a conditional element disappears cleanly. A view is a selection
    // too, so `?view=completed` over a season with nothing completed has zero
    // rows and no filter set — the old `anyFilterActive` gate let that fall
    // through to an empty bordered card, which is the "empty band" the rule
    // forbids.
    const html = await render('/e/?view=completed', {
      tournaments: [row('wessex-open', 'Wessex Autumn Gold', 'entries_open')],
      counts: { takingEntries: 1, completed: 0 },
      now: null,
    });

    expect(html).toContain('No tournaments match');
    expect(html).toMatch(/<a href="\/e\/"[^>]*>Clear filters<\/a>/);
    expect(html).not.toContain('id="calendar"');
  });
});

describe('E5: empty filter fields never survive into a shareable URL', () => {
  it('drops empty filter fields from the URL instead of echoing them', async () => {
    // A native GET form submits every named control, including the ones left
    // blank — so an empty submit produced `/e/?q=&preset=&from=&to=`, which is
    // the URL an entrant then copies out of the address bar and sends to a
    // club mailing list. No markup can suppress a blank field without script.
    const res = await respond('/e/?q=&preset=&from=&to=');

    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('/e/');
  });

  it('keeps the filters that carry a value while dropping the blanks', async () => {
    const res = await respond('/e/?q=&view=open&preset=&from=2026-01-01&to=');

    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('/e/?view=open&from=2026-01-01');
  });

  it('answers an already-clean URL directly — no redirect, no loop', async () => {
    // The half that makes the canonicalisation safe: the redirect target must
    // itself be answered 200, or every visit is an infinite bounce.
    for (const path of ['/e/', '/e/?view=open']) {
      expect((await respond(path)).status).toBe(200);
    }
  });
});

describe('the retired sidebar leaves nothing behind', () => {
  it('renders no FilterStrip status facet and no second search landmark', async () => {
    const html = await render();

    expect(html).not.toContain('aria-label="Status"');
    expect(html).not.toContain('aria-label="Dates"');
    // Exactly one, and since SP-P8 §4 it is the control row's search form,
    // not the shell's — the header sheds its search and this page owns it.
    // The popover (dates/view) form carries no role, which is what keeps the
    // count at one.
    expect(html.match(/role="search"/g)).toHaveLength(1);
    // The facet LINK is gone; the chip that says the same words lives on.
    expect(html).not.toMatch(/<a[^>]*>Entries open<\/a>/);
  });
});

/**
 * `/e/{slug}` — the tournament page, asserted on real server-rendered HTML
 * (SP-P6-2 §2): hero band, phase-gated tabs, exactly one panel per request,
 * and rule 4's negative controls — no placeholder, disabled tab or
 * coming-soon of any species, under any state.
 *
 * Same shape as the rest of this directory: the REAL @react-router/dev
 * pipeline through `createRequestHandler`, request in, bytes out. The chip
 * countdown is rendered against the real clock, so assertions match the
 * chip's KIND, never a day count.
 */
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createServer } from 'vite';
import { createRequestHandler, type ServerBuild } from 'react-router';

import entryPageFixture from './helpers/entryPage.fixture.json';

const PAGE = {
  ...entryPageFixture,
  viewer: { signedIn: false, email: null, formCsrf: '' },
};

/** The same tournament with every entry window shut — the server's word. */
const CLOSED = {
  ...PAGE,
  events: PAGE.events.map((event) => ({ ...event, isOpen: false })),
};

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
afterAll(() => vite.close());

beforeEach(() => {
  process.env.API_BASE_URL = 'http://backend:8000';
});
afterEach(() => {
  vi.restoreAllMocks();
});

async function respond(body: unknown, status: number, path: string): Promise<Response> {
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async (request: Request | string) => {
        const requestUrl = typeof request === 'string' ? request : request.url;
        const isPlayersProjection = /\/api\/page\/[^/]+\/players(?:$|[/?])/.test(requestUrl);
        const payload = isPlayersProjection
          ? ((body as { players?: unknown }).players ?? {
              published: true,
              players: [],
              referencedPlayerCount: 0,
              missingNameCount: 0,
            })
          : body;
        return new Response(status === 200 ? JSON.stringify(payload) : 'Not found', {
          status,
          headers: { 'content-type': status === 200 ? 'application/json' : 'text/plain' },
        });
      },
    ),
  );
  const build = (await vite.ssrLoadModule(
    'virtual:react-router/server-build',
  )) as unknown as ServerBuild;
  return createRequestHandler(build, 'development')(
    new Request(`http://entrant.test${path}`),
  );
}

async function render(body: unknown = PAGE, path = '/e/spring-open'): Promise<string> {
  return (await respond(body, 200, path)).text();
}

describe('the hero band', () => {
  it('renders organizer, name, date · venue line and the status chip', async () => {
    const html = await render();

    expect(html).toMatch(/<h1[^>]*>Spring Open<\/h1>/);
    expect(html).toContain('Kingsway BC');
    expect(html).toContain('Saturday 12 September 2026');
    // Overview presents venue name and address as labelled facts rather than
    // repeating a combined hero metadata string (PE03.3).
    expect(html).toContain('Kingsway Centre');
    expect(html).toContain('4 Kingsway');
    expect(html).toContain('Entries open');
  });

  it('renders ONE phase-dependent CTA: a link while open (Z8)', async () => {
    const html = await render();

    expect(html).toMatch(
      /<a[^>]*href="\/e\/spring-open\/enter"[^>]*>Enter this tournament<\/a>/,
    );
  });

  it('renders status text, never a dead button, when entries are closed', async () => {
    const html = await render(CLOSED);

    expect(html).toContain('Entries closed');
    expect(html).not.toContain('Enter this tournament');
    expect(html).not.toContain('href="/e/spring-open/enter"');
    expect(html).not.toMatch(/ disabled=""/);
  });
});

describe('the tab bar and its panels (Z6)', () => {
  it('renders the public sections as links with aria-current on the active one', async () => {
    const html = await render();

    const nav = html.match(/<nav aria-label="Tournament sections"[\s\S]*?<\/nav>/)?.[0] ?? '';
    expect(nav).not.toBe('');
    expect(nav).toContain('>Overview<');
    expect(nav).toContain('>Schedule<');
    expect(nav).toContain('>Draws<');
    expect(nav).toContain('>Players<');
    expect(nav).not.toContain('>Events<');
    const active = nav.match(/<a[^>]*aria-current="page"[^>]*>[^<]*/g) ?? [];
    expect(active).toHaveLength(1);
    expect(active[0]).toContain('Overview');
    // Links, not widgets — no ARIA tablist promising same-page switching.
    expect(nav).not.toContain('role="tab');
  });

  it('renders exactly one panel, chosen by a validated ?tab', async () => {
    const draws = await render(PAGE, '/e/spring-open?tab=draws');

    // The Draws panel is on the page…
    expect(draws).toContain('7 confirmed registrations');
    // …and the Overview panel is not.
    expect(draws).not.toContain('Key dates');
    expect(draws).not.toContain('Bank transfer on the day.');
  });

  it('folds the retired Events bookmark onto the Draws panel (ADR 0028)', async () => {
    const html = await render(PAGE, '/e/spring-open?tab=events');
    const nav = html.match(/<nav aria-label="Tournament sections"[\s\S]*?<\/nav>/)?.[0] ?? '';
    expect(nav).toMatch(/aria-current="page"[^>]*>Draws<\/a>/);
    expect(html).toContain('7 confirmed registrations');
  });

  it('maps a legacy Entrants bookmark to the unified Players panel', async () => {
    const html = await render(PAGE, '/e/spring-open?tab=entrants');
    const nav = html.match(/<nav aria-label="Tournament sections"[\s\S]*?<\/nav>/)?.[0] ?? '';
    expect(nav).toMatch(/aria-current="page"[^>]*>Players<\/a>/);
    expect(html).toContain('No players published yet.');
  });

  it('renders Overview for an unknown or gate-hidden ?tab', async () => {
    const unknown = await render(PAGE, '/e/spring-open?tab=results');
    expect(unknown).toContain('Key dates');

    // SP-P7 §4: the entrants tab is the PUBLICATION's, not the list
    // length's — unpublished hides the tab and folds its ?tab to Overview,
    // even when confirmed entrants exist behind the gate.
    const unpublished = {
      ...PAGE,
      publication: { ...PAGE.publication, entrants: false },
      entrants: [],
    };
    const hidden = await render(unpublished, '/e/spring-open?tab=entrants');
    expect(hidden).toContain('Key dates');
    expect(hidden).not.toContain('>Entrants<');
  });

  it('a published-but-empty player list is a real tab with a plain answer', async () => {
    const roster = { published: true, players: [], referencedPlayerCount: 0, missingNameCount: 0 };
    const html = await render(
      { ...PAGE, entrants: [], players: roster },
      '/e/spring-open?tab=players',
    );
    expect(html).toContain('>Players<');
    expect(html).toContain('No players published yet.');
  });

  it('does not link entrant-only event chips to unpublished draws', async () => {
    const roster = {
      published: true,
      players: [
        {
          playerKey: 'entry-ada',
          person: { identity: { id: 'ada', name: 'Ada Lovelace' }, resolution: 'resolved', label: null },
          club: 'Analytical BC',
          eventCodes: ['MS'],
        },
      ],
      referencedPlayerCount: 1,
      missingNameCount: 0,
    };
    const html = await render(
      { ...PAGE, players: roster },
      '/e/spring-open?tab=players',
    );
    expect(html).toContain('Ada Lovelace');
    expect(html).not.toContain('?tab=draws#draw-MS');
  });

  it('keeps Schedule / Live reachable even when no data tabs apply', async () => {
    const html = await render({
      ...PAGE,
      events: [],
      entrants: [],
      publication: { ...PAGE.publication, entrants: false },
    });

    expect(html).toContain('Tournament sections');
    expect(html).toContain('href="/e/spring-open/schedule"');
    expect(html).toContain('>Schedule<');
    expect(html).not.toContain('?tab=');
  });

  it.each([
    ['open', PAGE, '/e/spring-open'],
    ['closed', CLOSED, '/e/spring-open'],
    ['draws tab', PAGE, '/e/spring-open?tab=draws'],
    ['players tab', PAGE, '/e/spring-open?tab=players'],
    ['no events/entrants', { ...PAGE, events: [], entrants: [] }, '/e/spring-open'],
  ])(
    'renders no placeholder, disabled tab or coming-soon in the %s state (rule 4)',
    async (_label, body, path) => {
      const html = await render(body, path);

      expect(html).not.toMatch(/No draws/i);
      expect(html).not.toMatch(/coming soon/i);
      expect(html).not.toMatch(/ disabled=""/);
      expect(html).not.toMatch(/aria-disabled/);
    },
  );
});

describe('the panels', () => {
  it('Overview: key-date rows, fees pointer, regulations document row, venue (SP-P7 §3.7, ADR 0028)', async () => {
    const html = await render();

    // Key dates are plain label/value rows now; the timeline rail and its
    // "you are here" marker went with the entrant-site port.
    expect(html).toContain('Key dates');
    expect(html).not.toMatch(/you are here/i);
    expect(html).toContain('Entries open');
    expect(html).toContain('Withdrawal deadline');
    // The fixture's XD event closes earlier than MS/WD, so "Entries close"
    // is a per-event range, pointing at the Draws panel.
    expect(html).toContain('Varies by event');
    expect(html).toContain('href="/e/spring-open?tab=draws"');
    expect(html).toContain('4 Kingsway');

    // FEES LEFT THE OVERVIEW (Kyle's mockup-review ruling): no price, no
    // payment prose — a pointer row into the entry flow instead. The
    // receipt keeps the payment instructions (`receipt.tsx`).
    expect(html).not.toContain('25.00');
    expect(html).not.toContain('Bank transfer on the day.');
    expect(html).toContain('Quoted on the entry form before you submit');
    expect(html).toContain('href="/e/spring-open/enter"');

    // Regulations became a DOCUMENT ROW: identity + version + updated date
    // + a link to the routed reader — the text itself no longer inlines.
    expect(html).toContain('Tournament regulations');
    expect(html).toContain('Version 3');
    expect(html).toContain('href="/e/spring-open/regulations"');
    expect(html).not.toContain('BWF laws apply.');
    expect(html).not.toContain('<details');
  });

  it('renders no document row when the director wrote no regulations (rule 4)', async () => {
    const html = await render({
      ...PAGE,
      page: { ...PAGE.page, regulationsText: null },
    });

    expect(html).not.toContain('Tournament regulations');
    expect(html).not.toContain('/regulations"');
  });

  it('Draws: one row per event with counts ("N entered", G2 declined) and an Entrants button', async () => {
    const html = await render(PAGE, '/e/spring-open?tab=draws');

    expect(html).toContain('7 confirmed registrations');
    expect(html).not.toMatch(/7 of \d/);
    // The by-event anchors died with the by-event grouping (SP-P7 §3.2):
    // the Entrants button links to the alphabetical tab itself.
    expect(html).toContain('href="/e/spring-open?tab=players"');
    expect(html).toContain('>Entrants</a>');
    expect(html).not.toContain('#event-MS');
    expect(html).toContain('>Open<');
    expect(html).toContain('>Closed<');
    // Draws are published in the fixture but this render stubs no draw
    // index, so no row grows a Draw button it cannot honour.
    expect(html).not.toContain('>Draw</a>');
  });

  it('Players: public directory, one row per person (SP-P7 §3.2)', async () => {
    const roster = {
      published: true,
      players: PAGE.entrants.map((row) => ({
        playerKey: `entry-${row.person.identity.id}`,
        person: row.person,
        club: row.club,
        eventCodes: row.eventCodes,
      })),
      referencedPlayerCount: PAGE.entrants.length,
      missingNameCount: 0,
    };
    const html = await render({ ...PAGE, players: roster }, '/e/spring-open?tab=players');

    // One row per person now — Ada's two events ride HER row as codes.
    expect(html.match(/Ada Lovelace/g)).toHaveLength(1);
    expect(html).toContain('MS · WD');
    expect(html).not.toContain('rounded-full">MS');
    // Letter headers, alphabetical: Ada under A, Grace under G, Katherine under K.
    expect(html).toMatch(/>A<[\s\S]*Ada Lovelace[\s\S]*>G<[\s\S]*Grace Hopper[\s\S]*>K<[\s\S]*Katherine Johnson/);
    // Names link to player pages, keyed by person — never by name.
    expect(html).toContain(
      'href="/e/spring-open/players/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"',
    );
    // Club beneath the name (C4), and the filter's data attributes + mount.
    expect(html).toContain('Analytical BC');
    expect(html).toContain('data-name="ada lovelace"');
    expect(html).toContain('data-club="analytical bc"');
    expect(html).toContain('3 players');
  });
});

describe('the poster-page posture', () => {
  it('ships zero script tags and mints nothing', async () => {
    const res = await respond(PAGE, 200, '/e/spring-open');
    const html = await res.text();

    expect(html).not.toContain('<script');
    expect(html).not.toContain('name="_csrf"');
    expect(res.headers.get('set-cookie')).toBeNull();
  });

  it('answers an unknown slug and a closed page byte-identically (uniform 404)', async () => {
    async function documentFor(code: string): Promise<[number, string]> {
      vi.stubGlobal(
        'fetch',
        vi.fn(
          async () =>
            new Response(JSON.stringify({ detail: { code, message: code } }), {
              status: 404,
              headers: { 'content-type': 'application/json' },
            }),
        ),
      );
      const build = (await vite.ssrLoadModule(
        'virtual:react-router/server-build',
      )) as unknown as ServerBuild;
      const res = await createRequestHandler(build, 'development')(
        new Request('http://entrant.test/e/whatever'),
      );
      return [res.status, await res.text()];
    }

    const [unknownStatus, unknownBody] = await documentFor('TOURNAMENT_NOT_FOUND');
    const [closedStatus, closedBody] = await documentFor('ENTRY_PAGE_CLOSED');

    expect(unknownStatus).toBe(404);
    expect(closedStatus).toBe(404);
    expect(unknownBody).toBe(closedBody);
    expect(unknownBody).toContain('This entry page is not available');
    expect(unknownBody).not.toContain('TOURNAMENT_NOT_FOUND');
  });
});

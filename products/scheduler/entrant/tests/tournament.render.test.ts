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
      async () =>
        new Response(status === 200 ? JSON.stringify(body) : 'Not found', {
          status,
          headers: { 'content-type': status === 200 ? 'application/json' : 'text/plain' },
        }),
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
    expect(html).toContain('Kingsway Centre, 4 Kingsway');
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
  it('renders the three tabs as links with aria-current on the active one', async () => {
    const html = await render();

    const nav = html.match(/<nav aria-label="Tournament sections"[\s\S]*?<\/nav>/)?.[0] ?? '';
    expect(nav).not.toBe('');
    expect(nav).toContain('>Overview<');
    expect(nav).toContain('>Events<');
    expect(nav).toContain('>Entrants<');
    const active = nav.match(/<a[^>]*aria-current="page"[^>]*>[^<]*/g) ?? [];
    expect(active).toHaveLength(1);
    expect(active[0]).toContain('Overview');
    // Links, not widgets — no ARIA tablist promising same-page switching.
    expect(nav).not.toContain('role="tab');
  });

  it('renders exactly one panel, chosen by a validated ?tab', async () => {
    const events = await render(PAGE, '/e/spring-open?tab=events');

    // The Events panel is on the page…
    expect(events).toContain('7 entered');
    // …and the Overview panel is not.
    expect(events).not.toContain('Key dates');
    expect(events).not.toContain('Bank transfer on the day.');
  });

  it('renders Overview for an unknown or data-hidden ?tab', async () => {
    const unknown = await render(PAGE, '/e/spring-open?tab=draws');
    expect(unknown).toContain('Key dates');

    // Entrants hidden (empty list) → its tab neither renders nor answers.
    const noEntrants = { ...PAGE, entrants: [] };
    const hidden = await render(noEntrants, '/e/spring-open?tab=entrants');
    expect(hidden).toContain('Key dates');
    expect(hidden).not.toContain('>Entrants<');
  });

  it('renders no tab bar at all below two tabs', async () => {
    const html = await render({ ...PAGE, events: [], entrants: [] });

    expect(html).not.toContain('Tournament sections');
    expect(html).not.toContain('?tab=');
  });

  it.each([
    ['open', PAGE, '/e/spring-open'],
    ['closed', CLOSED, '/e/spring-open'],
    ['events tab', PAGE, '/e/spring-open?tab=events'],
    ['entrants tab', PAGE, '/e/spring-open?tab=entrants'],
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
  it('Overview: timeline with the current position, fees, payment, regulations, venue', async () => {
    const html = await render();

    expect(html).toContain('Key dates');
    // Inline ("← you are here") or standalone ("You are here — …") depending
    // on where the real clock falls between the fixture's moments — the
    // marker itself must exist either way.
    expect(html).toMatch(/you are here/i);
    expect(html).toContain('Entries open');
    // The fixture's XD event closes earlier than MS/WD, so "Entries close"
    // is a per-event range, pointing at the Events tab.
    expect(html).toContain('Varies by event');
    expect(html).toContain('2 events');
    expect(html).toContain('25.00');
    expect(html).toContain('Bank transfer on the day.');
    // Short regulations render open and plain — no disclosure for one line.
    expect(html).toContain('BWF laws apply.');
    expect(html).not.toContain('<details');
    expect(html).toContain('Regulations · v3');
    expect(html).toContain('4 Kingsway');
  });

  it('collapses long regulations behind a native disclosure (Z10)', async () => {
    const html = await render({
      ...PAGE,
      page: { ...PAGE.page, regulationsText: 'All play is governed. '.repeat(30) },
    });

    expect(html).toContain('<details');
    expect(html).toContain('Read the regulations');
  });

  it('Events: rows with counts ("N entered", G2 declined) linking into Entrants', async () => {
    const html = await render(PAGE, '/e/spring-open?tab=events');

    expect(html).toContain('7 entered');
    expect(html).not.toMatch(/7 of \d/);
    expect(html).toContain('href="/e/spring-open?tab=entrants#event-MS"');
    expect(html).toContain('>Open<');
    expect(html).toContain('>Closed<');
  });

  it('Entrants: grouped by event, one row per person per group (G5a)', async () => {
    const html = await render(PAGE, '/e/spring-open?tab=entrants');

    expect(html).toContain('id="event-MS"');
    expect(html).toContain('id="event-WD"');
    // Ada is in MS and WD — she appears once in each group.
    expect(html.match(/Ada Lovelace/g)).toHaveLength(2);
    expect(html.match(/Grace Hopper/g)).toHaveLength(1);
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

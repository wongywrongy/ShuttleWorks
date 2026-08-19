/**
 * `/e/` — discovery, asserted on real server-rendered HTML (SP-P6-2 §1).
 *
 * The loader is the G1 decline path: `GET /e/api/pages` lists `{slug}` only,
 * so one `GET /e/api/page/{slug}` follows per listed tournament — correct,
 * N+1, and pinned here so the call pattern is a contract rather than an
 * accident. Filtering is the Z1 GET form, server-side, with checked state
 * echoed back.
 *
 * Date fixtures sit far in the past/future (2000/2099) because these render
 * against the real clock — the pure-function tables with a pinned `now` live
 * in `phase.test.ts`; this file asserts the wiring.
 */
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createServer } from 'vite';
import { createRequestHandler, type ServerBuild } from 'react-router';

function page(
  slug: string,
  name: string,
  overrides: {
    date?: string | null;
    venue?: string | null;
    open?: boolean;
    closesAt?: string | null;
    eventCount?: number;
  } = {},
) {
  const { date = '2099-06-05', venue = 'Some Hall', open = true, closesAt = null, eventCount = 3 } =
    overrides;
  return {
    tournament: { name, date },
    org: null,
    venue: venue === null ? null : { name: venue, address: null },
    page: {
      slug,
      introText: null,
      regulationsText: null,
      regulationsVersion: 1,
      paymentInstructions: null,
      feeSchedule: {},
    },
    policy: { maxEventsPerPerson: null, disciplineCaps: null, collectPhone: false, waiverRequired: false },
    events: Array.from({ length: eventCount }, (_, i) => ({
      id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
      code: `E${i}`,
      discipline: `Event ${i}`,
      feeCents: null,
      genderConstraint: null,
      opensAt: null,
      closesAt,
      withdrawsUntil: null,
      opensAtIso: null,
      closesAtIso: null,
      withdrawsUntilIso: null,
      isOpen: open,
      ageBracketed: false,
      entryCount: 0,
    })),
    entrants: [],
    viewer: { signedIn: false, email: null, formCsrf: '' },
  };
}

/** Three listed tournaments across states: open-with-deadline, closed
 * upcoming, closed past — plus per-test extras. */
const PAGES: Record<string, unknown> = {
  'wessex-open': page('wessex-open', 'Wessex Autumn Gold', {
    closesAt: '2099-01-01 00:00 UTC',
  }),
  'meadowbank-upcoming': page('meadowbank-upcoming', 'Meadowbank Masters', {
    open: false,
    date: '2099-08-29',
  }),
  'sussex-past': page('sussex-past', 'Sussex Spring Restricted', {
    open: false,
    date: '2000-05-02',
    venue: 'Triangle LC',
  }),
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

async function respond(
  path: string,
  pages: Record<string, unknown> = PAGES,
): Promise<Response> {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input instanceof Request ? input.url : input);
      called.push(url);
      if (url.endsWith('/e/api/pages')) {
        return new Response(
          JSON.stringify(Object.keys(pages).map((slug) => ({ slug }))),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      const slug = decodeURIComponent(url.split('/e/api/page/')[1] ?? '');
      const body = pages[slug];
      if (body === undefined) {
        return new Response(
          JSON.stringify({ detail: { code: 'TOURNAMENT_NOT_FOUND', message: 'x' } }),
          { status: 404, headers: { 'content-type': 'application/json' } },
        );
      }
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }),
  );
  const build = (await vite.ssrLoadModule(
    'virtual:react-router/server-build',
  )) as unknown as ServerBuild;
  return createRequestHandler(build, 'development')(
    new Request(`http://entrant.test${path}`),
  );
}

async function render(path = '/e/', pages: Record<string, unknown> = PAGES): Promise<string> {
  return (await respond(path, pages)).text();
}

describe('the front door', () => {
  it('answers the basename with a real page, not a blank 200 or a 404', async () => {
    const res = await respond('/e/');
    const html = await res.text();

    expect(res.status).toBe(200);
    expect(html).toContain('Find a tournament');
    expect(html).toContain('3 tournaments');
  });

  it('fans out one projection call per listed slug — the G1 decline path', async () => {
    await render();

    expect(called[0]).toBe('http://backend:8000/e/api/pages');
    expect(called.slice(1).sort()).toEqual([
      'http://backend:8000/e/api/page/meadowbank-upcoming',
      'http://backend:8000/e/api/page/sussex-past',
      'http://backend:8000/e/api/page/wessex-open',
    ]);
  });

  it('drops a slug that closed between the list and the read, and still renders', async () => {
    const racy = { ...PAGES, 'gone-mid-flight': undefined } as Record<string, unknown>;
    const res = await respond('/e/', racy);
    const html = await res.text();

    expect(res.status).toBe(200);
    expect(html).toContain('3 tournaments');
  });

  it('ships zero script tags and mints nothing', async () => {
    const res = await respond('/e/');
    const html = await res.text();

    expect(html).not.toContain('<script');
    expect(res.headers.get('set-cookie')).toBeNull();
    expect(html).not.toContain('name="_csrf"');
  });
});

describe('the cards', () => {
  it('renders the fixed anatomy and leads with the actionable card (refinement 1)', async () => {
    const html = await render();

    // The open tournament leads; the closed-but-sooner one must not outrank
    // it (Phase B sign-off, refinement 1).
    const openAt = html.indexOf('Wessex Autumn Gold');
    const upcomingAt = html.indexOf('Meadowbank Masters');
    const pastAt = html.indexOf('Sussex Spring Restricted');
    expect(openAt).toBeGreaterThan(-1);
    expect(openAt).toBeLessThan(upcomingAt);
    expect(upcomingAt).toBeLessThan(pastAt);

    // Anatomy: name link to the tournament page, venue, count, chip.
    expect(html).toMatch(/<a href="\/e\/wessex-open"[^>]*>Wessex Autumn Gold<\/a>/);
    expect(html).toContain('Some Hall');
    expect(html).toContain('3 events');
    expect(html).toContain('Entries open');
    expect(html).toContain('Entries closed');
  });

  it('renders only the two ruled chip states — no Live, Finished or In play', async () => {
    const html = await render();

    expect(html).not.toMatch(/>Live</);
    expect(html).not.toMatch(/Finished/);
    expect(html).not.toMatch(/In play/);
  });
});

describe('the filters (Z1 — one GET form, refinement 4: always visible)', () => {
  it('filters server-side and echoes the choice back as the selected link', async () => {
    const html = await render('/e/?status=open');

    expect(html).toContain('Wessex Autumn Gold');
    expect(html).not.toContain('Meadowbank Masters');
    expect(html).toContain('1 of 3 tournaments');
    // P1.1: facets are instant-apply links; the chosen one carries aria-current.
    expect(html).toMatch(/<a[^>]*aria-current="true"[^>]*>Entries open<\/a>/);
  });

  it('searches name and venue from the header form vocabulary', async () => {
    const html = await render('/e/?q=triangle');

    expect(html).toContain('Sussex Spring Restricted');
    expect(html).not.toContain('Wessex Autumn Gold');
  });

  it('has no disclosure toggle at any width — the strip is always in the document', async () => {
    const html = await render();

    expect(html).not.toContain('filters-toggle');
    expect(html).not.toContain('peer-checked');
    expect(html).not.toContain('<details');
  });

  it('renders the EmptyState with its one action when nothing matches', async () => {
    const html = await render('/e/?q=zzz-no-such');

    expect(html).toContain('Nothing matches those filters');
    expect(html).toMatch(/<a href="\/e\/"[^>]*>Clear filters<\/a>/);
  });

  it('drops empty filter fields from the URL instead of echoing them (E5)', async () => {
    // A native GET form submits every named control, including the ones
    // left blank — so pressing "Apply filters" with nothing chosen produced
    // `/e/?q=&status=&preset=&from=&to=`, which is what an entrant then
    // copies out of the address bar and sends to a club mailing list. No
    // form markup can suppress a blank field without script, so the loader
    // canonicalises: empty values are dropped and the browser is redirected
    // once to the clean URL. Nothing about which cards match changes —
    // `parseFilters` already read `''` as "no filter".
    const res = await respond('/e/?status=&preset=&from=&to=');

    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('/e/');
  });

  it('keeps the filters that carry a value while dropping the blanks (E5)', async () => {
    const res = await respond('/e/?q=&status=open&preset=&from=2099-01-01&to=');

    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('/e/?status=open&from=2099-01-01');
  });

  it('answers an already-clean URL directly — no redirect, no loop (E5)', async () => {
    // The half that makes the canonicalisation safe: the redirect target
    // must itself be answered 200, or every visit is an infinite bounce.
    for (const path of ['/e/', '/e/?status=open']) {
      const res = await respond(path);
      expect(res.status).toBe(200);
    }
  });

  it('says so honestly when nothing is listed at all — no dead Clear action', async () => {
    const html = await render('/e/', {});

    expect(html).toContain('No tournament is taking entries right now');
    expect(html).not.toContain('Clear filters');
  });
});

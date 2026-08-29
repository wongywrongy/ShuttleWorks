/**
 * Per-route meta/OG tags for `/e/{slug}` — carried over from the SP-P6-1
 * entry page when the tournament page took the URL (SP-P6-2).
 *
 * Rendered through the same real @react-router/dev pipeline as the render
 * suites — request in, bytes out — so everything asserted here is true of
 * the document a crawler or a link unfurler actually receives.
 *
 * I6 (the public entry page shows names and events only — never emails or
 * contact data) applies to the document HEAD with more force than to the
 * body: an OG tag is read by crawlers and chat-client unfurlers without ever
 * loading the page. The `viewer` block must never reach a `<meta>` tag —
 * and neither may a minted CSRF digest. The tournament page mints nothing
 * (it has no form), which is asserted; the enter page's mint is confined to
 * its `_csrf` fields.
 */
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createServer } from 'vite';
import { createRequestHandler, type ServerBuild } from 'react-router';

import { readAppSource } from './helpers/sourceGuards';

const MS = '11111111-1111-4111-8111-111111111111';

/** The real nested `GET /e/api/page/{slug}` projection, kept local (each
 * render-tier suite owns its fixture, per prior art in this directory). */
const PAGE = {
  tournament: { name: 'Spring Open', date: '2026-09-12' },
  org: { name: 'Kingsway BC' },
  venue: { name: 'Kingsway Centre', address: '4 Kingsway' },
  page: {
    slug: 'spring-open',
    introText: 'Entries close on the 1st.',
    regulationsText: 'BWF laws apply.',
    regulationsVersion: 3,
    paymentInstructions: 'Bank transfer on the day.',
    feeSchedule: { '2': 2500 },
  },
  policy: { maxEventsPerPerson: 2, disciplineCaps: null, collectPhone: false, waiverRequired: false },
  events: [
    {
      id: MS,
      code: 'MS',
      discipline: "Men's Singles",
      feeCents: 1500,
      genderConstraint: 'M',
      opensAt: null,
      closesAt: null,
      withdrawsUntil: null,
      opensAtIso: null,
      closesAtIso: null,
      withdrawsUntilIso: null,
      isOpen: true,
      ageBracketed: false,
      entryCount: 7,
    },
  ],
  publication: { entrants: true, draws: false, results: false },
  entrants: [{ name: 'Ada Lovelace', eventCodes: ['MS'] }],
  // The email below is a deliberately distinctive marker string that must
  // never appear ANYWHERE in the rendered document. `signedIn` is fed `true`
  // as the impossible-projection shape, on purpose, to prove nothing about it
  // leaks — the marker comment is `test_entrant_ssr_contract.py`'s documented
  // opt-out.
  viewer: { /* impossible-projection */ signedIn: true, email: 'LEAK-MARKER-EMAIL@example.com', formCsrf: '' },
};

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
afterAll(() => vite.close());

beforeEach(() => {
  process.env.API_BASE_URL = 'http://backend:8000';
});
afterEach(() => {
  vi.restoreAllMocks();
});

async function renderResponse(
  body: unknown,
  status: number,
  path = '/e/spring-open',
): Promise<Response> {
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

async function render(body: unknown = PAGE): Promise<string> {
  return (await renderResponse(body, 200)).text();
}

/** Pull just the `<head>…</head>` slice — meta tags belong there. */
function head(html: string): string {
  return html.match(/<head[^>]*>[\s\S]*?<\/head>/)?.[0] ?? '';
}

/** The `meta` export's own body, extracted from source text. Shared by the
 * structural guard and its non-vacuity case so BOTH exercise this regex. */
function metaSource(source: string): string | null {
  return source.match(/export const meta[\s\S]*?\n};/)?.[0] ?? null;
}

describe('per-route meta/OG tags on /e/{slug}', () => {
  it('titles the document with the tournament name', async () => {
    const html = await render();
    expect(head(html)).toContain('<title>Spring Open · Enter now</title>');
  });

  it('labels a closed published historical page as results, not an invitation to enter', async () => {
    const html = await render({
      ...PAGE,
      publication: { entrants: false, draws: true, results: true },
      events: PAGE.events.map((event) => ({ ...event, isOpen: false })),
    });
    expect(head(html)).toContain('<title>Spring Open · Results</title>');
    expect(head(html)).not.toContain('Enter now');
  });

  it('uses a neutral tournament title when entries are closed and results are unpublished', async () => {
    const html = await render({
      ...PAGE,
      publication: { entrants: false, draws: false, results: false },
      events: PAGE.events.map((event) => ({ ...event, isOpen: false })),
    });
    expect(head(html)).toContain('<title>Spring Open · Tournament</title>');
  });

  it('sets og:title from the same data, and og:type', async () => {
    const html = await render();
    const h = head(html);
    expect(h).toMatch(/<meta property="og:title" content="[^"]*Spring Open[^"]*"/);
    expect(h).toMatch(/<meta property="og:type" content="website"/);
  });

  it('sets a description drawn from director-authored fields (date, venue, intro)', async () => {
    const html = await render();
    const h = head(html);
    expect(h).toMatch(/<meta name="description" content="[^"]*"/);
    const descTag = h.match(/<meta name="description" content="([^"]*)"/)?.[1] ?? '';
    expect(descTag).toContain('Kingsway Centre');
    const ogDescTag = h.match(/<meta property="og:description" content="([^"]*)"/)?.[1] ?? '';
    expect(ogDescTag).toContain('Kingsway Centre');
  });

  // ---------------------------------------------------------------------
  // I6: nothing from `viewer`, and no secret, may ever reach the document.
  // ---------------------------------------------------------------------
  describe('viewer data and secrets never reach the documents (I6)', () => {
    it('the tournament page carries no viewer email and no secret at all', async () => {
      // The poster page has NO form, so it must carry NEITHER half of a
      // double-submit: no minted cookie, no `_csrf` field, and certainly no
      // viewer email — whole document, not just the head.
      const res = await renderResponse(PAGE, 200);
      const html = await res.text();

      expect(html).not.toContain('LEAK-MARKER-EMAIL@example.com');
      expect(html).not.toContain('name="_csrf"');
      expect(res.headers.get('set-cookie')).toBeNull();
    });

    it('the enter page confines the minted digest to its _csrf fields', async () => {
      // The LIVE pair is what `mintFormCsrf()` minted on THIS response — a
      // random nonce and its 64-hex digest, which no hand-listed fixture
      // string can stand in for.
      const res = await renderResponse(PAGE, 200, '/e/spring-open/enter');
      const html = await res.text();

      expect(html).not.toContain('LEAK-MARKER-EMAIL@example.com');

      const nonce = /sw_play_csrf=([^;]+)/.exec(res.headers.get('set-cookie') ?? '')?.[1];
      const digest = /name="_csrf" value="([0-9a-f]{64})"/.exec(html)?.[1];
      expect(nonce).toBeTruthy();
      expect(digest).toBeTruthy();

      // The NONCE is the secret half: `Set-Cookie` only, no byte of the body.
      expect(html).not.toContain(nonce as string);

      // The DIGEST is the half that is SUPPOSED to be in the document — as
      // the value of a `_csrf` hidden input (the entry form and the footer's
      // sign-out form, minted from this one response) and nowhere else. A
      // third copy in a meta tag, an attribute, a link or a comment fails.
      const occurrences = html.split(digest as string).length - 1;
      const inCsrfFields = html.split(`name="_csrf" value="${digest}"`).length - 1;
      expect(inCsrfFields).toBeGreaterThan(0);
      expect(occurrences).toBe(inCsrfFields);
    });

    // The structural half, stated as a POSITIVE allowlist (`data.page` and
    // nothing else off `data`) rather than a denylist of today's sensitive
    // field names — `data.formCsrf` sits directly on the enter loader's
    // payload, so a `\bviewer\b`-only ban would let `content: data.formCsrf`
    // through untouched. Both meta-bearing routes are held to it.
    it.each(['routes/tournament.tsx', 'routes/enter.tsx'])(
      'the meta() export of %s reads only `data.page`, and names no secret',
      (file) => {
        const metaFn = metaSource(readAppSource(file));
        expect(metaFn).not.toBeNull();
        const reads = metaFn!.match(/\bdata\.\w+/g) ?? [];
        expect(reads.length).toBeGreaterThan(0);
        expect([...new Set(reads)]).toEqual(['data.page']);
        expect(metaFn!).not.toMatch(/\bviewer\b|\bformCsrf\b|\bidempotencyKey\b/);
      },
    );

    it('is not vacuous: the guard’s own pipeline reddens on a tainted body', () => {
      // Fixture of the exact defect this guard exists to prevent, run through
      // the SAME extraction the guard above uses — so this pins the
      // extraction regex too.
      const tainted = `export const meta: Route.MetaFunction = ({ data }) => {
  return [{ property: 'og:csrf', content: data.formCsrf }];
};`;
      const extracted = metaSource(tainted);
      expect(extracted).not.toBeNull();
      expect([...new Set(extracted!.match(/\bdata\.\w+/g) ?? [])]).not.toEqual(['data.page']);
      expect(extracted!).toMatch(/\bviewer\b|\bformCsrf\b|\bidempotencyKey\b/);
    });
  });

  // ---------------------------------------------------------------------
  // Uniform 404 inheritance: the meta path must not leak a title for a
  // page that never opened.
  // ---------------------------------------------------------------------
  describe('a closed/unknown page renders no tournament data in its meta (uniform 404)', () => {
    it('titles the 404 document generically, never with a guessed tournament name', async () => {
      const html = await (await renderResponse(null, 404)).text();
      const h = head(html);
      expect(h).not.toContain('Spring Open');
      // Some title must still exist — an empty <title> is itself a defect —
      // but it must not be data-derived.
      expect(h).toMatch(/<title>[^<]+<\/title>/);
    });
  });

  // ---------------------------------------------------------------------
  // Escaping: director-supplied strings must not break out of an attribute.
  // ---------------------------------------------------------------------
  describe('director-supplied strings cannot break out of a meta attribute', () => {
    it('escapes quotes, angle brackets and ampersands in the tournament and venue names', async () => {
      const hostile = '"><script>alert(1)</script> & Cup';
      const html = await render({
        ...PAGE,
        tournament: { ...PAGE.tournament, name: hostile },
        venue: { ...PAGE.venue, name: hostile },
      });
      const h = head(html);

      expect(h).not.toContain('"><script>alert(1)</script>');
      expect(h).toContain('&quot;');
      expect(h).toContain('&amp;');
      expect(h).toMatch(/<meta property="og:title" content="[^"]*&quot;[^"]*"/);
    });
  });
});

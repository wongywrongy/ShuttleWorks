/**
 * Per-route meta/OG tags for `/e/{slug}` (Task 25).
 *
 * Rendered through the same real @react-router/dev pipeline as
 * `entry.render.test.ts` — request in, bytes out, no component mocking — so
 * everything asserted here is true of the document a crawler or a link
 * unfurler actually receives. No second backend call: the fixture below is
 * the SAME projection the loader already fetches (`GET /e/api/page/{slug}`),
 * proven by `apiFetch.server.test.ts`'s one-fetch-per-render contract, which
 * this file does not re-prove.
 *
 * I6 (the public entry page shows names and events only — never emails or
 * contact data) applies to the document HEAD with more force than to the
 * body: an OG tag is read by crawlers and chat-client unfurlers, and is
 * visible to anyone who views source, without ever loading the page. The
 * `viewer` block (`email`, `formCsrf`) must never reach a `<meta>` tag. And
 * neither may the loader's OWN `formCsrf` — the live double-submit digest
 * `mintFormCsrf()` mints on this very response. That is the one worth
 * guarding: `viewer.formCsrf` is structurally `''` on every server render,
 * so it could not do harm even if it leaked, while the minted digest is a
 * working token. Putting a mint in a `<meta>` disclosed to every crawler
 * and link-unfurler would defeat the reason it exists.
 */
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createServer } from 'vite';
import { createRequestHandler, type ServerBuild } from 'react-router';

import { readAppSource } from './helpers/sourceGuards';

const MS = '11111111-1111-4111-8111-111111111111';

/** Same shape as `entry.render.test.ts`'s `PAGE` — the real nested
 * `GET /e/api/page/{slug}` projection. Kept local rather than imported: the
 * sibling file exports nothing, by design (each render-tier suite owns its
 * fixture, per prior art in this directory). */
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
      isOpen: true,
      ageBracketed: false,
      entryCount: 7,
    },
  ],
  entrants: [{ name: 'Ada Lovelace' }],
  // The email below is a deliberately distinctive marker string that must
  // never appear ANYWHERE in the rendered document's <head>. `signedIn` is
  // fed `true` for the same reason `entry.render.test.ts:216` does: it is
  // the impossible-projection shape the OLD fixtures claimed, fed on purpose
  // to prove nothing about it leaks — not a projection the backend can
  // return (node's fetch is credential-free, so `signedIn` is always `false`
  // in reality). `formCsrf` is left `''` — a marker value there would prove
  // nothing (see the comment on the live nonce/digest check below, which is
  // the real CSRF-leak proof) and `tests/test_entrant_ssr_contract.py`
  // forbids a non-empty one with no exception. The `impossible-projection`
  // marker is that guard's documented opt-out for `signedIn: true` — see
  // that file for why it is loud rather than silent.
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
    new Request('http://entrant.test/e/spring-open'),
  );
}

async function render(body: unknown = PAGE): Promise<string> {
  return (await renderResponse(body, 200)).text();
}

/** Pull just the `<head>…</head>` slice — meta tags belong there, and
 * scoping the assertions to it means a marker string appearing in the
 * FORM (an entrant's own name, say) cannot masquerade as a head leak. */
function head(html: string): string {
  return html.match(/<head[^>]*>[\s\S]*?<\/head>/)?.[0] ?? '';
}

/** The `meta` export's own body, extracted from source text. Shared by the
 * structural guard and its non-vacuity case so BOTH exercise this regex —
 * it is the part that can silently stop matching (a rewrite to
 * `export function meta` would make the guard pass by finding nothing). */
function metaSource(source: string): string | null {
  return source.match(/export const meta[\s\S]*?\n};/)?.[0] ?? null;
}

describe('per-route meta/OG tags on /e/{slug}', () => {
  it('titles the document with the tournament name', async () => {
    const html = await render();
    expect(head(html)).toMatch(/<title>[^<]*Spring Open[^<]*<\/title>/);
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
    // Not asserting one exact join grammar — the fields that must appear.
    expect(h).toMatch(/<meta name="description" content="[^"]*"/);
    const descTag = h.match(/<meta name="description" content="([^"]*)"/)?.[1] ?? '';
    expect(descTag).toContain('Kingsway Centre');
    const ogDescTag = h.match(/<meta property="og:description" content="([^"]*)"/)?.[1] ?? '';
    expect(ogDescTag).toContain('Kingsway Centre');
  });

  // ---------------------------------------------------------------------
  // I6: nothing from `viewer` may ever reach the document head.
  // ---------------------------------------------------------------------
  describe('viewer data never reaches a meta tag (I6)', () => {
    it('the whole document never contains the email or the live nonce, and confines the digest', async () => {
      const res = await renderResponse(PAGE, 200);
      const html = await res.text();

      // **WHOLE DOCUMENT, not `<head>`.** These three assertions were scoped
      // to the head out of necessity, not judgement: the loader's full payload
      // — `viewer` included — streamed into `<Scripts/>`'s hydration
      // `<script>` in `<body>`, so a whole-document assertion would have
      // failed on behaviour that was pre-existing and correct. `app/root.tsx`
      // renders no `<Scripts/>`, that payload does not exist, and the
      // narrowing has outlived its reason. A meta tag is the worst place for a
      // leak, not the only one.
      expect(html).not.toContain('LEAK-MARKER-EMAIL@example.com');

      // **There is no `formCsrf` marker to check here.** `viewer.formCsrf`
      // is structurally `''` on every server render (node's projection fetch
      // carries no credential), so a fixture marker for it would prove
      // nothing about the token that can actually do harm. The LIVE pair is
      // what `mintFormCsrf()` minted on THIS response — a random nonce and its
      // 64-hex digest, which no hand-listed fixture string can stand in for —
      // pulled off THIS response by the same extraction `entry.loader.test.ts`
      // uses on the wire.
      const nonce = /sw_play_csrf=([^;]+)/.exec(res.headers.get('set-cookie') ?? '')?.[1];
      const digest = /name="_csrf" value="([0-9a-f]{64})"/.exec(html)?.[1];
      expect(nonce).toBeTruthy();
      expect(digest).toBeTruthy();

      // The NONCE is the secret half. It belongs in `Set-Cookie` and in no
      // byte of the body — a document that echoes it has handed both halves of
      // a double-submit pair to anyone who can read the page.
      expect(html).not.toContain(nonce as string);

      // The DIGEST is the half that is SUPPOSED to be in the document — that
      // is what double-submit means — so the honest widening is confinement,
      // not absence: every occurrence must be the value of a `_csrf` hidden
      // input. There are two (the entry form and the footer's sign-out form),
      // both minted from this one response. A third copy in a meta tag, an
      // attribute, a link or a comment fails here.
      const occurrences = html.split(digest as string).length - 1;
      const inCsrfFields = html.split(`name="_csrf" value="${digest}"`).length - 1;
      expect(inCsrfFields).toBeGreaterThan(0);
      expect(occurrences).toBe(inCsrfFields);
    });

    // The structural half. A behavioural assertion alone can pass by luck —
    // e.g. if a token happened to collide with another rendered string — so
    // this reads the `meta` export's own source. Stated as a POSITIVE
    // allowlist (`data.page` and nothing else off `data`) rather than a
    // denylist of today's sensitive field names: `data.formCsrf` is the live
    // double-submit digest and sits directly on the loader payload, so the
    // old `\bviewer\b`-only ban would have let
    // `content: data.formCsrf` through untouched. Mutation transcript in the
    // task report.
    it('the meta() export reads only `data.page`, and names no secret', () => {
      const metaFn = metaSource(readAppSource('routes/entry.tsx'));
      expect(metaFn).not.toBeNull();
      const reads = metaFn!.match(/\bdata\.\w+/g) ?? [];
      expect(reads.length).toBeGreaterThan(0);
      expect([...new Set(reads)]).toEqual(['data.page']);
      expect(metaFn!).not.toMatch(/\bviewer\b|\bformCsrf\b|\bidempotencyKey\b/);
    });

    it('is not vacuous: the guard’s own pipeline reddens on a tainted body', () => {
      // Fixture of the exact defect this guard exists to prevent, run through
      // the SAME extraction the guard above uses — so this pins the
      // extraction regex too, not just the forbidden-word regex. A rewrite of
      // `meta` to `export function meta` would make `metaSource` return null
      // here and fail, instead of silently making the real guard vacuous.
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

      // The literal payload must never appear unescaped: that would mean it
      // broke out of the attribute (or closed the tag) rather than being
      // rendered as attribute text.
      expect(h).not.toContain('"><script>alert(1)</script>');
      // React's serializer escapes to HTML entities; assert the escaped form
      // landed rather than merely asserting absence (which a silently
      // dropped field would also satisfy).
      expect(h).toContain('&quot;');
      expect(h).toContain('&amp;');
      expect(h).toMatch(/<meta property="og:title" content="[^"]*&quot;[^"]*"/);
    });
  });
});

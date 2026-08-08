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
 * `viewer` block (`email`, `formCsrf`) must never reach a `<meta>` tag —
 * `formCsrf` in particular is a CSRF token, and putting a mint in a `<meta>`
 * disclosed to every crawler would defeat the reason it exists.
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
  entrants: [{ name: 'Ada Lovelace', eventId: MS }],
  // The marker values below are deliberately distinctive strings that must
  // never appear ANYWHERE in the rendered document's <head>. A real
  // `formCsrf` off this projection is always `''` (see entry.render.test.ts)
  // — populated here with an unmistakable value specifically so a leak is
  // provable rather than merely absent-by-coincidence with an empty string.
  viewer: { signedIn: true, email: 'LEAK-MARKER-EMAIL@example.com', formCsrf: 'LEAK-MARKER-CSRF-TOKEN' },
};

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
afterAll(() => vite.close());

beforeEach(() => {
  process.env.API_BASE_URL = 'http://backend:8000';
});
afterEach(() => {
  vi.restoreAllMocks();
});

async function renderStatus(
  body: unknown,
  status: number,
): Promise<string> {
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
  const res = await createRequestHandler(build, 'development')(
    new Request('http://entrant.test/e/spring-open'),
  );
  return res.text();
}

function render(body: unknown = PAGE): Promise<string> {
  return renderStatus(body, 200);
}

/** Pull just the `<head>…</head>` slice — meta tags belong there, and
 * scoping the assertions to it means a marker string appearing in the
 * FORM (an entrant's own name, say) cannot masquerade as a head leak. */
function head(html: string): string {
  return html.match(/<head[^>]*>[\s\S]*?<\/head>/)?.[0] ?? '';
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
    it('the rendered head never contains the email or the CSRF marker', async () => {
      const html = await render();
      const h = head(html);
      expect(h).not.toContain('LEAK-MARKER-EMAIL@example.com');
      expect(h).not.toContain('LEAK-MARKER-CSRF-TOKEN');
      // Scoped to <head> deliberately, not the whole document: the loader's
      // FULL payload — viewer included — legitimately streams into the
      // hydration `<script>` in <body> (see entry.render.test.ts's
      // "impossible-projection" fixture); that is a client-hydration
      // concern this task does not touch, not a meta-tag leak. Asserting
      // against the whole document would fail on that pre-existing, correct
      // behaviour rather than on anything this task adds.
    });

    // The structural half. A behavioural assertion alone can pass by luck —
    // e.g. if `viewer.email` happened to collide with another rendered
    // string — so this reads the `meta` export's own source and requires it
    // never names `viewer` at all. Mutation: add `data.page.viewer.email` to
    // the meta function and this goes red; see the task report for the
    // real red/green transcript.
    it('the meta() export never references `viewer` in its own source', () => {
      const source = readAppSource('routes/entry.tsx');
      const metaFn = source.match(/export const meta[\s\S]*?\n};/);
      expect(metaFn).not.toBeNull();
      expect(metaFn![0]).not.toMatch(/\bviewer\b/);
    });

    it('is not vacuous: a meta() body that DOES read viewer.email is caught', () => {
      // Fixture of the exact defect this guard exists to prevent.
      const tainted = `export const meta: Route.MetaFunction = ({ data }) => {
  return [{ property: 'og:email', content: data.page.viewer.email }];
};`;
      expect(tainted).toMatch(/\bviewer\b/);
    });
  });

  // ---------------------------------------------------------------------
  // Uniform 404 inheritance: the meta path must not leak a title for a
  // page that never opened.
  // ---------------------------------------------------------------------
  describe('a closed/unknown page renders no tournament data in its meta (uniform 404)', () => {
    it('titles the 404 document generically, never with a guessed tournament name', async () => {
      const html = await renderStatus(null, 404);
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

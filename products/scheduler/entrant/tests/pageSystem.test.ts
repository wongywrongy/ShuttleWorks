/**
 * Every page on this tier wears the same shell (E1).
 *
 * The SP-P6-2 redesign gave discovery, the tournament page and the entry
 * flow a page system — `PlayShell`'s header, its search, its footer — and
 * left four documents outside it: sign-in, sign-up, the receipt and the
 * not-found state. The demo walk found them: no header, no footer, no way
 * back to the listing, and a 404 rendered in default browser typography at
 * the top-left of an otherwise empty page, which reads as broken rather than
 * as informative. Brief §4 asked for the opposite — "re-skinned into the
 * same system: auth pages as small centered cards".
 *
 * So this file asserts the property across every page at once, derived from
 * one list rather than four copies of the same three lines: the shell's
 * footer line is on the document, and the document offers a way back to the
 * listing. It renders through the REAL @react-router/dev pipeline, request
 * in, bytes out, exactly like the rest of this directory.
 *
 * The uniform-404 property (an unknown slug and a closed page answer
 * byte-identically) lives in `tournament.render.test.ts` and is untouched by
 * this: what the boundary renders is fixed copy, so it cannot vary by cause.
 */
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createServer } from 'vite';
import { createRequestHandler, type ServerBuild } from 'react-router';

import entryPageFixture from './helpers/entryPage.fixture.json';

const PAGE = { ...entryPageFixture, viewer: { signedIn: false, email: null, formCsrf: '' } };
const CONFIG = { turnstileSiteKey: '3x00000000000000000000FF', authMode: 'cloud' };
const SUBMISSION = '3f1c2a44-5d6e-4f70-8a91-b2c3d4e5f607';

/** The one line only `PlayShell`'s footer renders — the shell's fingerprint. */
const SHELL_FOOTER = 'Every entry is confirmed by the organiser.';

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
afterAll(() => vite.close());

beforeEach(() => {
  process.env.API_BASE_URL = 'http://backend:8000';
});
afterEach(() => {
  vi.restoreAllMocks();
});

/** One upstream stub for every page here: the public projection, the entrant
 * config, and a uniform 404 for the slug the not-found cases ask for. */
function stubUpstream() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : (input as Request).url;
      const json = (body: unknown, status = 200) =>
        new Response(JSON.stringify(body), {
          status,
          headers: { 'content-type': 'application/json' },
        });
      if (url.endsWith('/e/api/config')) return json(CONFIG);
      if (url.endsWith('/e/api/page/spring-open')) return json(PAGE);
      return json({ detail: { code: 'TOURNAMENT_NOT_FOUND', message: 'x' } }, 404);
    }),
  );
}

async function fetchPath(path: string): Promise<Response> {
  stubUpstream();
  const build = (await vite.ssrLoadModule(
    'virtual:react-router/server-build',
  )) as unknown as ServerBuild;
  return createRequestHandler(build, 'development')(new Request(`http://entrant.test${path}`));
}

const hrefs = (html: string) => [...html.matchAll(/href="([^"]*)"/g)].map((m) => m[1]);

/** The four documents the page system missed, plus the two it already had as
 * the non-vacuity control: if the shell marker stopped being rendered at all,
 * these two would fail too and the list above would be passing over nothing. */
const PAGES: [name: string, path: string][] = [
  ['sign-in', '/e/login'],
  ['sign-up', '/e/signup'],
  ['receipt', `/e/spring-open/receipt/${SUBMISSION}?totalCents=3500`],
  ['not-found', '/e/no-such-tournament'],
  ['discovery', '/e/'],
  ['tournament', '/e/spring-open'],
];

describe('every page wears the same shell', () => {
  it.each(PAGES)('the %s page renders the shell header and footer', async (_name, path) => {
    const html = await (await fetchPath(path)).text();

    expect(html).toContain(SHELL_FOOTER);
    // The way back to the listing — the complaint the demo walk actually
    // made was "no way back", so the link is the assertion, not the chrome.
    expect(hrefs(html)).toContain('/e/');
  });

  it.each(PAGES)('the %s page leads with one real heading', async (_name, path) => {
    const html = await (await fetchPath(path)).text();

    // Default browser typography at the top-left of an empty page was the
    // 404's whole defect. A styled `<h1>` is the cheapest proof it is gone.
    expect(html).toMatch(/<h1[^>]*class="[^"]+"/);
  });
});

describe('the not-found page', () => {
  it('is a page, not a bare heading: shell, copy and one action', async () => {
    const res = await fetchPath('/e/no-such-tournament');
    const html = await res.text();

    expect(res.status).toBe(404);
    expect(html).toContain('This entry page is not available');
    expect(html).toContain(SHELL_FOOTER);
    // One action, and it is the listing — a mistyped poster URL should not
    // be a dead end.
    expect(hrefs(html)).toContain('/e/');
  });

  it('answers an unmatched path with the same page, not the framework default', async () => {
    // `/e/a/b/c` matches no route at all, so React Router's own "Unhandled
    // Thrown Response!" document was the public answer — default typography
    // and an INLINE `<script>` this tier's CSP (`script-src 'self'`) blocks.
    const res = await fetchPath('/e/a/b/c');
    const html = await res.text();

    expect(res.status).toBe(404);
    expect(html).toContain(SHELL_FOOTER);
    expect(html).not.toContain('Unhandled Thrown Response');
    expect(html).not.toContain('<script');
    // …and it is a DOCUMENT. A root error boundary renders INSTEAD of the
    // root component, so while the `<html>` lived in that component this
    // came back as a bare `<div>` — no doctype, no `<head>`, and therefore
    // no stylesheet: the shell markup was all there and none of it was
    // styled. The shell moved into `Layout`, which React Router renders
    // around the boundary too.
    expect(html).toMatch(/^<!DOCTYPE html>/i);
    expect(html).toContain('rel="stylesheet"');
  });
});

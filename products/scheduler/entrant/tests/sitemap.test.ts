/**
 * `GET /e/sitemap.xml`, driven through the real route table (`routes.ts`),
 * the real loader, and the real `lib/sitemapCache.server.ts` — not a
 * hand-built stand-in. Same shape as `tests/health.test.ts`.
 */
import { afterAll, afterEach, beforeEach, expect, test, vi } from 'vitest';
import { createServer } from 'vite';
import { createRequestHandler, type ServerBuild } from 'react-router';

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
afterAll(() => vite.close());

const sent: Request[] = [];

function stubPages(slugs: string[]) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    sent.push(new Request(input as RequestInfo, init));
    return new Response(JSON.stringify(slugs.map((slug) => ({ slug }))), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  });
}

beforeEach(() => {
  sent.length = 0;
  process.env.API_BASE_URL = 'http://backend:8000';
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function fetchEntrant(origin: string, path: string): Promise<Response> {
  const build = (await vite.ssrLoadModule(
    'virtual:react-router/server-build',
  )) as unknown as ServerBuild;
  return createRequestHandler(build, 'development')(new Request(`${origin}${path}`));
}

// `lib/sitemapCache.server.ts`'s cache is real module-scoped state that
// survives for the lifetime of this one `vite` instance — i.e. for this whole
// file, across every test in it — and its window is an hour of REAL time,
// which these route-level tests cannot inject a clock into. So the tests below
// run in declaration order against ONE warming cache, and say so where it
// matters. (The cold-start, window-boundary and call-counting properties are
// asserted precisely, with an injected clock, in `tests/sitemapCache.test.ts`.)
//
// This used to read "a DISTINCT origin per test keeps each test's cache slot
// empty when it starts" — true only while `baseUrl` was part of the cache key,
// which was the very defect fixed here: one slot keyed on origin meant a
// second Host EVICTED the first, so rotating the Host header defeated the
// cache entirely. The origin is now a render input, not a key.

test('GET /e/sitemap.xml renders XML built from GET /e/api/pages', async () => {
  vi.stubGlobal('fetch', stubPages(['spring-open', 'summer-invitational']));

  const res = await fetchEntrant('http://render.test', '/e/sitemap.xml');

  expect(res.status).toBe(200);
  expect(res.headers.get('content-type')).toContain('application/xml');

  const body = await res.text();
  expect(body).toContain('<?xml version="1.0" encoding="UTF-8"?>');
  expect(body).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
  expect(body).toContain('http://render.test/e/spring-open');
  expect(body).toContain('http://render.test/e/summer-invitational');
  expect(body).toContain('</urlset>');

  // The backend call it took: exactly the public list route, nothing that
  // could carry a credential.
  expect(sent).toHaveLength(1);
  expect(sent[0].url).toBe('http://backend:8000/e/api/pages');
  expect(sent[0].headers.get('cookie')).toBeNull();
});

test('a rotating Host header cannot defeat the cache, and never crosses origins', async () => {
  // Runs against the cache the test above just warmed (one real backend call,
  // well inside the one-hour window), which is what makes ZERO the right
  // number here rather than one.
  //
  // The defect this pins: the cache was a single slot KEYED on `baseUrl`, so
  // every one of these requests was a miss AND evicted the previous entry —
  // an attacker rotating the Host header turned a crawl-hotspot cache into a
  // guaranteed backend call per request, and apex + www, or a monitor hitting
  // the container name, did it by accident. Three distinct origins, zero
  // backend calls.
  const fetchMock = stubPages(['spring-open']);
  vi.stubGlobal('fetch', fetchMock);

  const bodies = [];
  for (const origin of ['http://a.test', 'http://b.test', 'http://c.test']) {
    bodies.push(await fetchEntrant(origin, '/e/sitemap.xml').then((r) => r.text()));
  }

  expect(fetchMock).toHaveBeenCalledTimes(0);
  // And sharing the slug list across origins is not sharing the DOCUMENT:
  // each response carries its own origin's `<loc>`s and no one else's.
  expect(bodies[0]).toContain('http://a.test/e/spring-open');
  expect(bodies[0]).not.toContain('b.test');
  expect(bodies[2]).toContain('http://c.test/e/spring-open');
  expect(bodies[2]).not.toContain('a.test');
});

test('is mounted under the /e/ basename, not at the root', async () => {
  vi.stubGlobal('fetch', stubPages([]));

  const res = await fetchEntrant('http://root-check.test', '/sitemap.xml');

  expect(res.status).toBe(404);
});

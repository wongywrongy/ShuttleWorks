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

// A DISTINCT origin per test. `lib/sitemapCache.server.ts`'s cache is real
// module-scoped state that survives for the lifetime of this one `vite`
// instance — i.e. for this whole test file, across every test in it, exactly
// the property the caching tests below rely on. Reusing one origin across
// tests would make an EARLIER test's cache hit silently satisfy a LATER
// test's "does it cache" assertion for the wrong reason; a distinct origin
// per test keeps each test's cache slot empty when it starts.

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

test('a second request for the same origin does not call the backend again', async () => {
  const fetchMock = stubPages(['spring-open']);
  vi.stubGlobal('fetch', fetchMock);

  await fetchEntrant('http://cache-hit.test', '/e/sitemap.xml');
  await fetchEntrant('http://cache-hit.test', '/e/sitemap.xml');

  // Both requests hit the same node process, hence the same module-scoped
  // cache — the property under test. Two page loads, one backend call.
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

test('is mounted under the /e/ basename, not at the root', async () => {
  vi.stubGlobal('fetch', stubPages([]));

  const res = await fetchEntrant('http://root-check.test', '/sitemap.xml');

  expect(res.status).toBe(404);
});

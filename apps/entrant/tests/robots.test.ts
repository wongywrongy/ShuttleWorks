/**
 * `GET /e/robots.txt`, driven through the real route table (`routes.ts`)
 * and the real loader — not a hand-built stand-in. Same shape as
 * `tests/sitemap.test.ts` and `tests/health.test.ts`.
 */
import { afterAll, expect, test } from 'vitest';
import { createServer } from 'vite';
import { createRequestHandler, type ServerBuild } from 'react-router';

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
afterAll(() => vite.close());

async function fetchEntrant(origin: string, path: string): Promise<Response> {
  const build = (await vite.ssrLoadModule(
    'virtual:react-router/server-build',
  )) as unknown as ServerBuild;
  return createRequestHandler(build, 'development')(new Request(`${origin}${path}`));
}

test('GET /e/robots.txt disallows the backend prefixes and allows /e/', async () => {
  const res = await fetchEntrant('http://render.test', '/e/robots.txt');

  expect(res.status).toBe(200);
  expect(res.headers.get('content-type')).toContain('text/plain');

  const body = await res.text();
  expect(body).toContain('User-agent: *');
  expect(body).toContain('Allow: /e/');
  expect(body).toContain('Disallow: /e/api/');
  expect(body).toContain('Disallow: /e/account/');
  expect(body).toContain('Sitemap: http://render.test/e/sitemap.xml');
});

test('darkens the origin root and re-allows only /e/, in that order', async () => {
  // The defect this pins: the body used to carry `Allow: /e/` with no
  // `Disallow: /`. robots.txt defaults to ALLOW for anything unmatched, so
  // once ingress hoists this file to the origin root (Task 22) that body
  // affirmatively declares the Access-fronted operator SPA at `/`
  // crawlable — the inverse of what is wanted — and `Allow: /e/` is a pure
  // no-op besides, having nothing above it to carve out of.
  //
  // Asserted as INDEXES, not as two `.toContain`s: RFC 9309 §2.2.2 resolves
  // a conflict by longest matching path, but a reader (and some
  // non-conforming crawlers) read top-down, and `Disallow: /` placed AFTER
  // `Allow: /e/` is the shape most likely to be "tidied" into existence.
  // Dropping the `Disallow: /` line reddens the first assertion; moving it
  // below the allow reddens the second.
  const body = await fetchEntrant('http://order.test', '/e/robots.txt').then((r) => r.text());
  const lines = body.split('\n');

  const disallowRoot = lines.indexOf('Disallow: /');
  const allowEntrant = lines.indexOf('Allow: /e/');

  expect(disallowRoot).toBeGreaterThanOrEqual(0);
  expect(allowEntrant).toBeGreaterThan(disallowRoot);
  // And `Disallow: /` is the exact line, not a prefix of a longer rule that
  // happens to start that way — `indexOf` on the split array already gives
  // exactness, so this pins the count: exactly one such directive.
  expect(lines.filter((line) => line === 'Disallow: /')).toHaveLength(1);
});

test('is mounted under the /e/ basename, not at the root', async () => {
  const res = await fetchEntrant('http://root-check.test', '/robots.txt');

  expect(res.status).toBe(404);
});

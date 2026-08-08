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

test('is mounted under the /e/ basename, not at the root', async () => {
  const res = await fetchEntrant('http://root-check.test', '/robots.txt');

  expect(res.status).toBe(404);
});

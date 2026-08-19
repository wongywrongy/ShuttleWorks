import { afterAll, expect, test } from 'vitest';
import { createServer } from 'vite';
import { createRequestHandler, type ServerBuild } from 'react-router';

// One Vite server per test file, middleware mode, no HTTP listener. The React
// Router plugin publishes the whole app as the virtual module below, so this
// exercises the real routes.ts + entry.server.tsx + loaders — not a hand-built
// stand-in.
const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
afterAll(() => vite.close());

async function fetchEntrant(path: string): Promise<Response> {
  const build = (await vite.ssrLoadModule(
    'virtual:react-router/server-build',
  )) as unknown as ServerBuild;
  return createRequestHandler(build, 'development')(new Request(`http://entrant.test${path}`));
}

test('GET /e/health renders server-side', async () => {
  const res = await fetchEntrant('/e/health');
  expect(res.status).toBe(200);

  const body = await res.text();
  // Asserted on the SERVER response, before any hydration: this is the no-JS
  // posture of spec §7 held to the wall from the first commit.
  expect(body).toContain('<h1 data-testid="entrant-health">entrant tier is up</h1>');
  expect(body).toContain('<p data-testid="entrant-tier">entrant</p>');
});

test('the app is mounted under the /e/ basename, not at the root', async () => {
  // nginx routes /e/ to this tier (spec §2). A route reachable at "/health"
  // would mean the basename is not applied and every link the app emits would
  // point outside its own prefix.
  const res = await fetchEntrant('/health');
  expect(res.status).toBe(404);
});

/**
 * `/e/me/entries` and `/e/{slug}/regulations` — the two SP-P7 Phase 2
 * documents, asserted on real server-rendered HTML (the
 * `tournament.render.test.ts` harness: the REAL @react-router/dev pipeline,
 * request in, bytes out).
 *
 * My Entries' server half only observes the entrant cookie's presence (R8-D):
 * signed-out documents say how to sign in without mounting the credentialed
 * script, while signed-in documents carry the mount point and one external
 * script. No private fetch occurs during either SSR render.
 */
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createServer } from 'vite';
import { createRequestHandler, type ServerBuild } from 'react-router';

import entryPageFixture from './helpers/entryPage.fixture.json';

const PAGE = {
  ...entryPageFixture,
  viewer: { signedIn: false, email: null, formCsrf: '' },
};

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
afterAll(() => vite.close());

beforeEach(() => {
  process.env.API_BASE_URL = 'http://backend:8000';
});
afterEach(() => {
  vi.restoreAllMocks();
});

async function respond(
  body: unknown,
  status: number,
  path: string,
  cookie?: string,
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
    new Request(`http://entrant.test${path}`, cookie ? { headers: { cookie } } : undefined),
  );
}

describe('/e/me/entries — the session-aware shell', () => {
  it('renders a sign-in action for signed-out visitors', async () => {
    const response = await respond(PAGE, 200, '/e/me/entries');
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain('My entries');
    expect(html).toContain('Sign in to see your entries');
    expect(html).toContain('href="/e/login?next=/e/me/entries"');
    expect(html).not.toContain('id="my-entries-root"');
    expect(html).not.toContain('/e/assets/my-entries.js');
    // No inline script anywhere: the root's no-hydration posture holds on
    // the one page that ships browser behaviour.
    expect(html).not.toMatch(/<script(?![^>]*src=)/);
  });

  it('does not request private data for signed-out visitors', async () => {
    await respond(PAGE, 200, '/e/me/entries');
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });

  it('loads the private browser module only when a session is present', async () => {
    const html = await (
      await respond(PAGE, 200, '/e/me/entries', 'sw_play_session=session-value')
    ).text();
    expect(html).toContain('id="my-entries-root"');
    expect(html).toContain('Loading your entries.');
    expect(html).toContain('<script type="module" src="/e/assets/my-entries.js">');
    expect(html).toContain('<noscript>');
  });

  it('says nothing personal in the document itself', async () => {
    const html = await (await respond(PAGE, 200, '/e/me/entries')).text();
    expect(html).not.toContain('@');
    expect(html).not.toMatch(/signed in as/i);
  });
});

describe('/e/{slug}/regulations — the reader (§3.7)', () => {
  it('renders the full text with version, updated date and a way back', async () => {
    const html = await (await respond(PAGE, 200, '/e/spring-open/regulations')).text();

    expect(html).toContain('Tournament regulations');
    expect(html).toContain('BWF laws apply.');
    expect(html).toContain('Version 3');
    expect(html).toContain('12 August 2026');
    expect(html).toContain('href="/e/spring-open"');
    expect(html).toContain('<title>Regulations · Spring Open</title>');
  });

  it('answers the uniform 404 when the director wrote no regulations', async () => {
    const response = await respond(
      { ...PAGE, page: { ...PAGE.page, regulationsText: null } },
      200,
      '/e/spring-open/regulations',
    );
    expect(response.status).toBe(404);
    const html = await response.text();
    expect(html).toContain('These regulations are not available');
  });

  it('answers the uniform 404 for an unknown slug', async () => {
    const response = await respond(PAGE, 404, '/e/ghost-open/regulations');
    expect(response.status).toBe(404);
  });
});

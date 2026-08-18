/**
 * `/e/me/entries` and `/e/{slug}/regulations` — the two SP-P7 Phase 2
 * documents, asserted on real server-rendered HTML (the
 * `tournament.render.test.ts` harness: the REAL @react-router/dev pipeline,
 * request in, bytes out).
 *
 * My Entries' server half is deliberately empty (R8-D): the assertions here
 * are that the shell says nothing personal, carries the mount point and the
 * ONE external script — and that no loader ran at all (the fetch stub
 * stays uncalled, which is the structural no-relay claim made behavioural).
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

async function respond(body: unknown, status: number, path: string): Promise<Response> {
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

describe('/e/me/entries — the anonymous shell', () => {
  it('renders heading, mount point, noscript and the one external script', async () => {
    const response = await respond(PAGE, 200, '/e/me/entries');
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain('My entries');
    expect(html).toContain('id="my-entries-root"');
    expect(html).toContain('Loading your entries.');
    expect(html).toContain('<script type="module" src="/e/assets/my-entries.js">');
    expect(html).toContain('<noscript>');
    // No inline script anywhere: the root's no-hydration posture holds on
    // the one page that ships browser behaviour.
    expect(html).not.toMatch(/<script(?![^>]*src=)/);
  });

  it('runs NO loader: the API is never called for this document', async () => {
    await respond(PAGE, 200, '/e/me/entries');
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
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

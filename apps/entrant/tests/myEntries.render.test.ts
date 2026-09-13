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
    // V3-PE38.1: the gate states the requirement once, with one action —
    // no separate card heading duplicating "My entries" and no repeated
    // "available after sign in" sentence.
    expect(html).toContain('Sign in to view and manage your tournament entries.');
    expect(html).not.toContain('Sign in to see your entries');
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
    // V3-PE38.1: the sorting/organizer-confirmation explanation appears
    // beside the actual list, not ahead of a gate that might not show one.
    expect(html).toContain('grouped into active and past.');
  });

  it('does not show the list explanation ahead of the sign-in gate', async () => {
    const html = await (await respond(PAGE, 200, '/e/me/entries')).text();
    expect(html).not.toContain('grouped into active and past.');
  });

  it('says nothing personal in the document itself', async () => {
    const html = await (await respond(PAGE, 200, '/e/me/entries')).text();
    expect(html).not.toContain('@');
    expect(html).not.toMatch(/signed in as/i);
  });
});

describe('/e/me/settings — the account settings shell (refinement 2026-09-12)', () => {
  it('gates a signed-out visitor and returns them here after sign-in', async () => {
    const response = await respond(PAGE, 200, '/e/me/settings');
    const html = await response.text();
    expect(response.status).toBe(200);
    expect(html).toContain('Account settings');
    expect(html).toContain('href="/e/login?next=/e/me/settings"');
    expect(html).not.toContain('id="my-account-root"');
    expect(html).not.toContain('/e/assets/my-entries.js');
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });

  it('mounts the account controls and loads the same module only with a session present', async () => {
    const html = await (
      await respond(PAGE, 200, '/e/me/settings', 'sw_play_session=session-value')
    ).text();
    expect(html).toContain('id="my-account-root"');
    expect(html).not.toContain('id="my-entries-root"');
    expect(html).toContain('<script type="module" src="/e/assets/my-entries.js">');
    expect(html).not.toMatch(/<script(?![^>]*src=)/);
    // The list page no longer carries the settings section; it links here.
    const entries = await (
      await respond(PAGE, 200, '/e/me/entries', 'sw_play_session=session-value')
    ).text();
    expect(entries).not.toContain('id="my-account-root"');
    expect(entries).toContain('href="/e/me/settings"');
  });
});

describe('/e/{slug}/regulations — the reader (§3.7)', () => {
  it('renders the full text with version, updated date and a way back', async () => {
    const html = await (await respond(PAGE, 200, '/e/spring-open/regulations')).text();

    // public-visual-fixes P6: the document's own heading is "Regulations" —
    // once. The tournament name is the frame's `h1` above it, and the words
    // "Tournament regulations" used to appear three times before a reader
    // reached a single rule.
    expect(html).toContain('>Regulations<');
    expect(html).toContain('BWF laws apply.');
    expect(html).toContain('Version 3');
    expect(html).toContain('12 August 2026');
    expect(html).toContain('href="/e/spring-open"');
    expect(html).toContain('<title>Regulations · Spring Open</title>');
    // The document actions say what they do; "Download" saves the text.
    expect(html).toContain('>Download<');
    expect(html).not.toContain('Download text');
    expect(html).not.toMatch(/save as pdf/i);
    // Print output is decided by a page-scoped print stylesheet, not by the
    // shared screen cascade.
    expect(html).toContain('href="/e/assets/regulations-print.css"');
    expect(html).toContain('media="print"');
  });

  it('escapes authored markup instead of rendering it, and links a bare address', async () => {
    const authored = {
      ...PAGE,
      page: {
        ...PAGE.page,
        regulationsText:
          'ELIGIBILITY\n<script>alert(1)</script>\nSee https://example.org/rules/entry_conditions for detail.\n- Bring photo ID\n- Arrive 30 minutes early',
      },
    };
    const html = await (await respond(authored, 200, '/e/spring-open/regulations')).text();

    // Uploaded markup is CONTENT, never markup: it reads as the characters
    // the organizer typed.
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
    // A real link, with a readable label, and the address still resolvable.
    expect(html).toContain('href="https://example.org/rules/entry_conditions"');
    expect(html).toContain('>entry conditions<');
    // Bullets render as a list, not as a wall of soft-wrapped lines.
    expect(html).toContain('<ul');
    expect(html).toContain('Bring photo ID');
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

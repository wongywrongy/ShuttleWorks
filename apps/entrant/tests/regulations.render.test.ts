/**
 * The no-JS contract of `/e/{slug}/regulations`, on real server-rendered
 * HTML — same pipeline as `enter.render.test.ts`.
 *
 * V3-PE15.2: the sidebar nav links must match the destination's own label
 * (`TabBar`'s "Overview"/"Draws"/"Players"), not a paraphrase, and a source
 * citation embedded in organizer text must render as a link rather than a
 * raw URL paragraph — without altering the organizer's own words.
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

async function render(body: unknown = PAGE, path = '/e/spring-open/regulations'): Promise<string> {
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(JSON.stringify(body), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    ),
  );
  const build = (await vite.ssrLoadModule(
    'virtual:react-router/server-build',
  )) as unknown as ServerBuild;
  const response = await createRequestHandler(build, 'development')(
    new Request(`http://entrant.test${path}`),
  );
  return response.text();
}

describe('the regulations reader, unhydrated', () => {
  it('names sidebar links after the destination, not a paraphrase', async () => {
    const html = await render();

    expect(html).toContain('>Overview<');
    expect(html).toContain('>Draws<');
    expect(html).toContain('>Players<');
    expect(html).not.toContain('View events');
    expect(html).not.toContain('View entrants');
    expect(html).not.toContain('Tournament overview');
  });

  it('does not assert that contact details are unpublished, and does not repeat provenance', async () => {
    const html = await render();

    expect(html).not.toContain('Contact details are not published');
    // The organizer field appears once, in the document header dl — not
    // restated in a footer provenance line.
    expect((html.match(/Kingsway BC/g) ?? []).length).toBe(1);
  });

  it('turns an organizer-authored source citation into a readable link, verbatim otherwise', async () => {
    const withSource = {
      ...PAGE,
      page: {
        ...PAGE.page,
        regulationsText:
          'Fictional operational demo. Source reference: https://en.wikipedia.org/wiki/2026_BWF_World_Tour.',
      },
    };
    const html = await render(withSource);

    // No raw URL sitting in the text as a bare paragraph...
    expect(html).not.toMatch(/>[^<]*https:\/\/en\.wikipedia\.org[^<]*</);
    // ...but a real link carrying it, with a readable label.
    expect(html).toContain('href="https://en.wikipedia.org/wiki/2026_BWF_World_Tour"');
    expect(html).toContain('>2026 BWF World Tour<');
    // The organizer's own sentence is untouched.
    expect(html).toContain('Fictional operational demo.');
    expect(html).toContain('Source reference:');
  });

  it('renders organizer text verbatim when it carries no source citation', async () => {
    const html = await render();

    expect(html).toContain('BWF laws apply.');
  });
});

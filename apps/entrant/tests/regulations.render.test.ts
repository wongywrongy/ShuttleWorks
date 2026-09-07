/**
 * The no-JS contract of `/e/{slug}/regulations`, on real server-rendered
 * HTML — same pipeline as `enter.render.test.ts`.
 *
 * Public P1 (contract §11.1): the reader's own left navigation is GONE. It
 * duplicated the tab bar with a second set of names, which is exactly the
 * "second, competing navigation" the frame rule forbids; the reader now
 * reaches Overview/Draws/Players through the shared tab bar and gets back
 * through the breadcrumb. What survives from V3-PE15.2 is the reason those
 * links were named after their destinations in the first place, now
 * satisfied structurally: there is only one set of names on the page.
 *
 * The rest of the file is unchanged: a source citation embedded in organizer
 * text must render as a link rather than a raw URL paragraph, without
 * altering the organizer's own words.
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
  it('navigates through the shared tab bar only, with no second link list of its own', async () => {
    const html = await render();

    const nav = html.match(/<nav aria-label="Tournament sections"[\s\S]*?<\/nav>/)?.[0] ?? '';
    expect(nav).toContain('>Overview<');
    expect(nav).toContain('>Draws<');
    expect(nav).toContain('>Players<');
    expect(nav).toMatch(/<a href="\/e\/spring-open\/regulations" aria-current="page"/);
    expect(html).not.toContain('View events');
    expect(html).not.toContain('View entrants');
    expect(html).not.toContain('Tournament overview');
    // One occurrence each: the removed aside listed the same three again.
    for (const label of ['>Overview<', '>Draws<', '>Players<']) {
      expect((html.match(new RegExp(label, 'g')) ?? []).length, label).toBe(1);
    }
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

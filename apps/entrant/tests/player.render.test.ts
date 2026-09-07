/**
 * `/e/{slug}/players/{personKey}` — the player page (SP-P7 §3.3), on real
 * server-rendered HTML (the `tournament.render.test.ts` harness).
 *
 * The loader makes TWO public reads (page, then player), so the fetch stub
 * answers by URL. The §3.3 binding order — "Coming up" ABOVE "Played" — is
 * pinned positionally, because it is a product decision someone could
 * "fix" by alphabetizing the sections.
 */
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createServer } from 'vite';
import { createRequestHandler, type ServerBuild } from 'react-router';

import entryPageFixture from './helpers/entryPage.fixture.json';

const PAGE = {
  ...entryPageFixture,
  viewer: { signedIn: false, email: null, formCsrf: '' },
};

const ref = (id: string, name: string) => ({ identity: { id, name }, resolution: 'resolved', label: null });

const HISTORY = [
  {
    slug: 'spring-open',
    tournamentName: 'Spring Open',
    date: '2026-09-19',
    endDate: '2026-09-20',
    playerKey: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    current: true,
    eventCodes: ['MS'],
    drawsPublished: true,
    resultsPublished: true,
  },
  {
    slug: 'winter-classic',
    tournamentName: 'Winter Classic',
    date: '2026-01-10',
    endDate: null,
    playerKey: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    current: false,
    eventCodes: ['MS', 'XD'],
    drawsPublished: true,
    resultsPublished: true,
  },
];

const PLAYER = {
  person: ref('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Ada Lovelace'),
  club: 'Analytical BC',
  history: HISTORY,
  events: [{ code: 'MS', discipline: "Men's Singles", partner: null, seed: 1, drawPath: [] }],
  matches: [
    {
      eventCode: 'MS',
      roundLabel: 'Final',
      sides: [
        { persons: [ref('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Ada Lovelace')], placeholder: null, winner: false },
        { persons: [], placeholder: 'Winner of SF 2', winner: false },
      ],
      score: null,
      decided: false,
      scheduledTime: '14:30',
      court: 1,
      status: 'scheduled',
    },
    {
      eventCode: 'MS',
      roundLabel: 'Semifinals',
      sides: [
        { persons: [ref('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Ada Lovelace')], placeholder: null, winner: true },
        { persons: [ref('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Grace Hopper')], placeholder: null, winner: false },
      ],
      score: [
        [21, 15],
        [21, 12],
      ],
      decided: true,
      scheduledTime: '10:30',
      court: 2,
      status: 'completed',
    },
  ],
};

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
afterAll(() => vite.close());

beforeEach(() => {
  process.env.API_BASE_URL = 'http://backend:8000';
});
afterEach(() => {
  vi.restoreAllMocks();
});

function stubApi(player: unknown, playerStatus = 200) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: RequestInfo | URL) => {
      const path = String(url);
      if (path.includes('/players/')) {
        return new Response(
          playerStatus === 200 ? JSON.stringify(player) : 'Not found',
          { status: playerStatus, headers: { 'content-type': 'application/json' } },
        );
      }
      return new Response(JSON.stringify(PAGE), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }),
  );
}

async function render(path: string): Promise<Response> {
  const build = (await vite.ssrLoadModule(
    'virtual:react-router/server-build',
  )) as unknown as ServerBuild;
  return createRequestHandler(build, 'development')(
    new Request(`http://entrant.test${path}`),
  );
}

const URL_PATH = '/e/spring-open/players/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

describe('the header card', () => {
  it('renders the linked name, club and events', async () => {
    stubApi(PLAYER);
    const html = await (await render(URL_PATH)).text();

    // Contract §11.1: the document's one `h1` is the TOURNAMENT, rendered by
    // the shared frame; the person's name is this page's section heading.
    expect(html).toMatch(/<h1[^>]*id="tournament-title"[^>]*>Spring Open<\/h1>/);
    expect(html).toMatch(/<h2[^>]*>[\s\S]*href="\/e\/spring-open\/players\/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"[\s\S]*Ada Lovelace[\s\S]*<\/h2>/);
    expect(html).toContain('Analytical BC');
    expect(html).toContain('Men&#x27;s Singles');
    expect(html).not.toContain('2-0');
    expect(html).not.toContain('of 2 played');
    expect(html).toContain('<title>Ada Lovelace · Spring Open</title>');
  });

});

describe('the match groups', () => {
  it('renders Coming up ABOVE Played — the binding §3.3 order', async () => {
    stubApi(PLAYER);
    const html = await (await render(URL_PATH)).text();

    expect(html).toContain('Coming up');
    expect(html).toContain('Played');
    expect(html.indexOf('Coming up')).toBeLessThan(html.indexOf('Played'));
  });

  it('renders the card anatomy: round, placeholder side, scores, winner mark', async () => {
    stubApi(PLAYER);
    const html = await (await render(URL_PATH)).text();

    expect(html).toContain('MS · Final');
    expect(html).toContain('Winner of SF 2');
    expect(html).toContain('14:30');
    expect(html).toContain('Court 1');
    // The played SF: aligned scores; the winner reads by weight and by the
    // `sr-only` word, not by a glyph (ADR 0028 restyle of MatchCard).
    expect(html).toContain('MS · Semifinals');
    expect(html).toContain('21');
    expect(html).toContain('15');
    expect(html).toContain('Winner: ');
    expect(html).toContain('font-[650]');
    expect(html).not.toContain('✓');
  });

  it('says plainly when there is nothing to show', async () => {
    stubApi({ ...PLAYER, matches: [] });
    const html = await (await render(URL_PATH)).text();
    expect(html).toContain('No matches to show yet.');
  });
});

describe('tournament history (profile v1)', () => {
  it('links each past tournament to THAT tournament page for the same person', async () => {
    stubApi(PLAYER);
    const html = await (await render(URL_PATH)).text();

    expect(html).toContain('Tournament history');
    // The link is built from slug + that workspace's own player key — the
    // one shared link-target resolver, never a name.
    expect(html).toContain(
      'href="/e/winter-classic/players/cccccccc-cccc-4ccc-8ccc-cccccccccccc"',
    );
    expect(html).toContain('Winter Classic');
    expect(html).not.toContain('/players/Ada');
  });

  it('names the current tournament without linking back to itself', async () => {
    stubApi(PLAYER);
    const html = await (await render(URL_PATH)).text();

    // Scoped to the history section: "Spring Open" is also the breadcrumb
    // and the hero title, and neither is what this claim is about.
    const section = html.slice(html.indexOf('Tournament history'));
    const row = section.match(/<li[^>]*>(?:(?!<\/li>)[\s\S])*Spring Open(?:(?!<\/li>)[\s\S])*<\/li>/)?.[0] ?? '';
    expect(row).not.toBe('');
    expect(row).toContain('aria-current="page"');
    expect(row).not.toContain('href="/e/spring-open/players/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"');
  });

  it('renders no history section at all on a payload minted before profile v1', async () => {
    const legacy: Record<string, unknown> = { ...PLAYER };
    delete legacy.history;
    stubApi(legacy);
    const html = await (await render(URL_PATH)).text();
    expect(html).not.toContain('Tournament history');
    // ...and the rest of the page is unaffected.
    expect(html).toContain('Ada Lovelace');
  });
});

describe('the gates', () => {
  it('a 404 from the player projection is this page 404ing', async () => {
    stubApi(PLAYER, 404);
    const response = await render(URL_PATH);
    expect(response.status).toBe(404);
    expect(await response.text()).toContain('This player page is not available');
  });
});

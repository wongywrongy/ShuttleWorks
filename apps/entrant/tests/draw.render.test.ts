/**
 * SP-P7 §3.4–3.6 on real server-rendered HTML: the Draws/Seeded entries/
 * Winners tabs and the draw page itself (RR standings + rounds, the
 * elimination columns, the consolation link-pills).
 *
 * The loaders make URL-distinguished reads, so the fetch stub answers by
 * path — the `player.render.test.ts` idiom.
 */
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createServer } from 'vite';
import { createRequestHandler, type ServerBuild } from 'react-router';

import entryPageFixture from './helpers/entryPage.fixture.json';

const PAGE = {
  ...entryPageFixture,
  publication: { entrants: true, draws: true, results: true },
  viewer: { signedIn: false, email: null, formCsrf: '' },
};

const DRAWS_INDEX = {
  published: true,
  resultsPublished: true,
  draws: [
    {
      drawKey: 'MS',
      eventCode: 'MS',
      discipline: "Men's Singles",
      kind: 'se',
      size: 4,
      hasConsolation: false,
    },
    {
      drawKey: 'WS',
      eventCode: 'WS',
      discipline: "Women's Singles",
      kind: 'rr',
      size: 3,
      hasConsolation: false,
    },
  ],
  divisions: [],
};

const SEEDS = {
  published: true,
  events: [
    {
      eventCode: 'MS',
      discipline: "Men's Singles",
      seeds: [
        { seed: 1, names: ['Ada Lovelace'], club: 'Analytical BC' },
        { seed: 2, names: ['Grace Hopper'], club: null },
      ],
    },
  ],
};

const WINNERS = {
  published: true,
  events: [
    {
      eventCode: 'MS',
      discipline: "Men's Singles",
      decided: true,
      winner: { names: ['Ada Lovelace'], club: 'Analytical BC' },
      runnerUp: { names: ['Grace Hopper'], club: null },
      semifinalists: [{ names: ['Katherine Johnson'], club: 'Orbit SC' }],
    },
    {
      eventCode: 'WS',
      discipline: "Women's Singles",
      decided: false,
      winner: null,
      runnerUp: null,
      semifinalists: [],
    },
  ],
};

const SE_DRAW = {
  drawKey: 'MS',
  eventCode: 'MS',
  discipline: "Men's Singles",
  kind: 'se',
  size: 4,
  resultsPublished: true,
  teams: [
    { participantKey: 'p1', names: ['Ada Lovelace'], club: 'Analytical BC', seed: 1 },
    { participantKey: 'p2', names: ['Grace Hopper'], club: null, seed: null },
    { participantKey: 'p3', names: ['Katherine Johnson'], club: 'Orbit SC', seed: 2 },
  ],
  segments: [
    {
      id: 'MAIN',
      label: 'Draw',
      rounds: [
        {
          label: 'Semifinals',
          matches: [
            {
              nodeKey: 'sf1',
              position: 1,
              sides: [
                { participantKey: 'p1', placeholder: null, bye: false },
                { participantKey: 'p2', placeholder: null, bye: false },
              ],
              result: {
                winnerSide: 'A',
                score: [
                  [21, 15],
                  [21, 12],
                ],
                walkover: false,
              },
              scheduledTime: '10:30',
              court: 1,
            },
            {
              nodeKey: 'sf2',
              position: 2,
              sides: [
                { participantKey: 'p3', placeholder: null, bye: false },
                { participantKey: null, placeholder: null, bye: true },
              ],
              result: null,
              scheduledTime: null,
              court: null,
            },
          ],
        },
        {
          label: 'Final',
          matches: [
            {
              nodeKey: 'f1',
              position: 1,
              sides: [
                { participantKey: 'p1', placeholder: null, bye: false },
                { participantKey: null, placeholder: 'Winner of SF 2', bye: false },
              ],
              result: null,
              scheduledTime: '14:30',
              court: 1,
            },
          ],
        },
      ],
    },
    { id: 'C', label: 'Consolation', rounds: [{ label: 'Final', matches: [] }] },
  ],
  standings: null,
};

const RR_DRAW = {
  drawKey: 'WS',
  eventCode: 'WS',
  discipline: "Women's Singles",
  kind: 'rr',
  size: 3,
  resultsPublished: true,
  teams: [
    { participantKey: 'a', names: ['Ann Ito'], club: 'North BC', seed: null },
    { participantKey: 'b', names: ['Bea Osei'], club: null, seed: null },
  ],
  segments: [
    {
      id: 'MAIN',
      label: '',
      rounds: [
        {
          label: 'Round 1',
          matches: [
            {
              nodeKey: 'r1m1',
              position: 1,
              sides: [
                { participantKey: 'a', placeholder: null, bye: false },
                { participantKey: 'b', placeholder: null, bye: false },
              ],
              result: { winnerSide: 'A', score: [[21, 10]], walkover: false },
              scheduledTime: '09:00',
              court: 2,
            },
          ],
        },
      ],
    },
  ],
  standings: [
    {
      position: 1,
      participantKey: 'a',
      played: 1,
      wins: 1,
      losses: 0,
      gamesWon: 1,
      gamesLost: 0,
      pointsWon: 21,
      pointsLost: 10,
      history: ['W'],
    },
    {
      position: 2,
      participantKey: 'b',
      played: 1,
      wins: 0,
      losses: 1,
      gamesWon: 0,
      gamesLost: 1,
      pointsWon: 10,
      pointsLost: 21,
      history: ['L'],
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

function stubApi(routes: Record<string, unknown>) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: RequestInfo | URL) => {
      const path = new URL(String(url)).pathname;
      for (const [suffix, body] of Object.entries(routes)) {
        if (path.endsWith(suffix)) {
          return new Response(JSON.stringify(body), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
      }
      return new Response(JSON.stringify(PAGE), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }),
  );
}

async function render(path: string): Promise<string> {
  const build = (await vite.ssrLoadModule(
    'virtual:react-router/server-build',
  )) as unknown as ServerBuild;
  const response = await createRequestHandler(build, 'development')(
    new Request(`http://entrant.test${path}`),
  );
  return response.text();
}

describe('the tab bar under full publication', () => {
  it('carries the §3.7 order: Overview · Events · Entrants · Draws · Seeded entries · Winners', async () => {
    stubApi({});
    const html = await render('/e/spring-open');
    const nav = html.match(/<nav aria-label="Tournament sections"[\s\S]*?<\/nav>/)?.[0] ?? '';
    const labels = [...nav.matchAll(/>([^<]+)<\/a>/g)].map((m) => m[1]);
    expect(labels).toEqual([
      'Overview',
      'Events',
      'Entrants',
      'Draws',
      'Seeded entries',
      'Winners',
    ]);
  });
});

describe('the Draws tab (§3.4)', () => {
  it('lists draw cards with kind, size and links into each draw', async () => {
    stubApi({ '/draws': DRAWS_INDEX });
    const html = await render('/e/spring-open?tab=draws');

    expect(html).toContain('href="/e/spring-open/draws/MS"');
    expect(html).toContain('MS · Elimination · 4 entries');
    expect(html).toContain('WS · Round robin · 3 entries');
  });

  it('says plainly when a published tier has no draws', async () => {
    stubApi({
      '/draws': { published: true, resultsPublished: false, draws: [], divisions: [] },
    });
    const html = await render('/e/spring-open?tab=draws');
    expect(html).toContain('No draws yet.');
  });

  // F-DM-33 (P7b-NC9): the two causes of an empty `draws` list are told apart
  // HERE, at the tier that renders them, not only on the wire. Above and below
  // are the same empty list; only `divisions` differs.
  it('says a meet is a meet instead of telling it to wait for a draw', async () => {
    stubApi({
      '/draws': {
        published: true,
        resultsPublished: false,
        draws: [],
        divisions: ['MD', 'MS', 'WS'],
      },
    });
    const html = await render('/e/spring-open?tab=draws');

    expect(html).toContain('Played as a meet, not by draws.');
    expect(html).toContain('MD, MS, WS');
    expect(html).not.toContain('No draws yet.');
  });
});

describe('the Seeded entries tab (§3.5)', () => {
  it('renders ordered seed lines with [n], names and clubs', async () => {
    stubApi({ '/seeds': SEEDS });
    const html = await render('/e/spring-open?tab=seeds');

    expect(html).toContain('[1]');
    expect(html).toContain('Ada Lovelace');
    expect(html).toContain('Analytical BC');
    expect(html.indexOf('[1]')).toBeLessThan(html.indexOf('[2]'));
  });
});

describe('the Winners tab (§3.6)', () => {
  it('renders honors per decided event and the partial-state header', async () => {
    stubApi({ '/winners': WINNERS });
    const html = await render('/e/spring-open?tab=winners');

    expect(html).toContain('1 of 2 events decided');
    expect(html).toContain('Winner');
    expect(html).toContain('Runner-up');
    expect(html).toContain('Semifinalists');
    expect(html).toContain('Not decided yet.');
  });
});

describe('the elimination draw page', () => {
  it('renders rounds as columns with seeds, byes, placeholders and results', async () => {
    stubApi({ '/draws/MS': SE_DRAW });
    const html = await render('/e/spring-open/draws/MS');

    expect(html).toContain('Semifinals');
    expect(html).toContain('Final');
    expect(html).toContain('Ada Lovelace [1]');
    expect(html).toContain('Katherine Johnson [2]');
    expect(html).toContain('Bye');
    expect(html).toContain('Winner of SF 2');
    expect(html).toContain('21');
    expect(html).toContain('10:30 · Court 1');
    // Wide content scrolls in its own container (R11).
    expect(html).toContain('overflow-x-auto');
  });

  it('offers the Draw / Consolation link-pills and honors ?segment=', async () => {
    stubApi({ '/draws/MS': SE_DRAW });
    const main = await render('/e/spring-open/draws/MS');
    expect(main).toContain('?segment=C');
    expect(main).toContain('Consolation');

    const consolation = await render('/e/spring-open/draws/MS?segment=C');
    // The consolation segment has no matches: the main tree's names are
    // gone; the pills remain for the way back.
    expect(consolation).not.toContain('Ada Lovelace [1]');
    expect(consolation).toContain('?segment=MAIN');
  });
});

describe('the round-robin draw page', () => {
  it('renders the standings table with the adapted columns and history pills', async () => {
    stubApi({ '/draws/WS': RR_DRAW });
    const html = await render('/e/spring-open/draws/WS');

    for (const heading of ['Pos', 'Player', 'PL', 'W', 'L', 'GM', 'PTS', 'History']) {
      expect(html).toContain(`>${heading}</th>`);
    }
    expect(html).toContain('Ann Ito');
    expect(html).toContain('21-10');
    expect(html).toMatch(/>W<\/span>/);
    // And the round list beneath, on the shared card anatomy.
    expect(html).toContain('Round 1');
    expect(html).toContain('09:00 · Court 2');
  });
});

describe('the gates, upstream', () => {
  it('a 404 from the draw projection is this page 404ing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: RequestInfo | URL) =>
        String(url).includes('/draws/')
          ? new Response('Not found', { status: 404 })
          : new Response(JSON.stringify(PAGE), {
              status: 200,
              headers: { 'content-type': 'application/json' },
            }),
      ),
    );
    const build = (await vite.ssrLoadModule(
      'virtual:react-router/server-build',
    )) as unknown as ServerBuild;
    const response = await createRequestHandler(build, 'development')(
      new Request('http://entrant.test/e/spring-open/draws/MS'),
    );
    expect(response.status).toBe(404);
    expect(await response.text()).toContain('This draw is not available');
  });
});

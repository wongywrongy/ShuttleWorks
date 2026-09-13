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

import { eventProgress } from '../app/routes/player';
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
    expect(html).toMatch(/<h1[^>]*>Ada Lovelace<\/h1>/);
    expect(html).toContain('href="/e/spring-open"');
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

    expect(html).toContain('Next match');
    expect(html).toContain('Played');
    expect(html.indexOf('Next match')).toBeLessThan(html.indexOf('Played'));
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

describe('the draw path (P6 structured round steps)', () => {
  const WITH_PATH = {
    ...PLAYER,
    events: [
      {
        code: 'MD',
        discipline: "Men's Doubles",
        partner: ref('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'Kim Park'),
        seed: 3,
        drawPath: [
          {
            roundLabel: 'Round of 32',
            opponents: [ref('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'Rin Sato')],
            outcome: 'won',
            score: [
              [21, 15],
              [21, 12],
            ],
            reference: 'MD R32\u00b79',
          },
          {
            roundLabel: 'Round of 16',
            opponents: [ref('ffffffff-ffff-4fff-8fff-ffffffffffff', 'Lee Chen')],
            outcome: null,
            score: null,
            reference: 'MD R16\u00b75',
          },
        ],
      },
    ],
  };

  it('links the current event to its full draw without duplicating the progression', async () => {
    stubApi(WITH_PATH);
    const html = await (await render(URL_PATH)).text();
    expect(html).toContain('/e/spring-open/draws/MD');
    expect(html).toContain('player=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
    expect(html).not.toContain('Round of 32');
    expect(html).not.toContain('\u2192');
  });

  it('names the partner and links the event draw pinned on this person', async () => {
    stubApi(WITH_PATH);
    const html = await (await render(URL_PATH)).text();

    expect(html).toContain('Kim Park');
    expect(html).toContain(
      'href="/e/spring-open/draws/MD?view=path&amp;player=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"',
    );
    // The visible label is a name, never the identity value in the URL.
    expect(html).toContain('View draw');
  });
});

describe('per-event progress and one draw action (refinement 2026-09-12)', () => {
  it('states progress per event from its own steps, never one tournament-wide status', () => {
    const won = { roundLabel: 'Round of 32', opponents: [], outcome: 'won' as const };
    const lost = { roundLabel: 'Round of 16', opponents: [], outcome: 'lost' as const };
    const open = { roundLabel: 'Round of 16', opponents: [], outcome: null };
    expect(eventProgress([won, lost])).toBe('Lost R16');
    expect(eventProgress([won, open])).toBe('In R16');
    expect(eventProgress([won])).toBe('Won R32');
    expect(eventProgress([{ roundLabel: 'Final', opponents: [], outcome: null }])).toBe('In F');
    // Results withheld or no steps: nothing is claimed.
    expect(eventProgress([])).toBeNull();
  });

  it('offers ONE draw action per event, opened on this person, and no second path link', async () => {
    stubApi(PLAYER);
    const html = await (await render(URL_PATH)).text();
    expect(html).not.toContain('View path');
    expect((html.match(/>View draw</g) ?? []).length).toBe(1);
    expect(html).toContain(
      'href="/e/spring-open/draws/MS?view=path&amp;player=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"',
    );
  });

  it('lists played and upcoming matches as aligned rows that name their own day', async () => {
    stubApi(PLAYER);
    const html = await (await render(URL_PATH)).text();
    const played = html.slice(html.indexOf('>Played<'));
    expect(played).toContain('data-match-row');
    expect(played).not.toContain('data-match-variant="card"');
    // The featured match stays the one prominent card above.
    expect(html.slice(0, html.indexOf('>Played<'))).toContain('data-match-variant="card"');
  });
});

describe('tournament history (profile v1)', () => {
  it('links each past tournament to THAT tournament page for the same person', async () => {
    stubApi(PLAYER);
    const html = await (await render(URL_PATH)).text();

    expect(html).toContain('Other tournaments');
    // The link is built from slug + that workspace's own player key — the
    // one shared link-target resolver, never a name.
    expect(html).toContain(
      'href="/e/winter-classic/players/cccccccc-cccc-4ccc-8ccc-cccccccccccc"',
    );
    expect(html).toContain('Winter Classic');
    expect(html).not.toContain('/players/Ada');
  });

  it('keeps the current tournament in context and excludes it from Other tournaments', async () => {
    stubApi(PLAYER);
    const html = await (await render(URL_PATH)).text();
    expect(html).toContain('href="/e/spring-open"');
    const section = html.slice(html.indexOf('Other tournaments'));
    expect(section).toContain('Winter Classic');
    expect(section).not.toContain('href="/e/spring-open/players/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"');
  });

  it('renders no history section at all on a payload minted before profile v1', async () => {
    const legacy: Record<string, unknown> = { ...PLAYER };
    delete legacy.history;
    stubApi(legacy);
    const html = await (await render(URL_PATH)).text();
    expect(html).not.toContain('Other tournaments');
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

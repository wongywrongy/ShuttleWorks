/**
 * The one tournament frame, asserted across every tournament-scoped route at
 * once (contract `state-and-formatting.md` §11, public plan P1).
 *
 * This is the property the seven routes could not previously state: Overview
 * and Schedule each built their OWN hero (different metadata, a freshness
 * line only one of them had), and the draw detail, the player page and the
 * regulations reader had no hero at all — they led with a floating
 * `← Tournament` / `← Tournament · Draws` link and, in the regulations case,
 * a second navigation of their own. Asserting "the tournament page has a
 * hero" per file is exactly how that drifted, so the assertion here is the
 * SAME frame on every route, driven from one table.
 *
 * Same harness as the rest of this directory: the real `@react-router/dev`
 * pipeline through `createRequestHandler`, request in, bytes out, and
 * regex over the HTML string (this tier has no jsdom in its tree).
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

const ref = (id: string | null, name: string) => ({
  identity: { id, name },
  resolution: id ? 'resolved' : 'dead',
  label: null,
});

const PERSON_ID = '11111111-1111-4111-8111-111111111111';

const MATCHES = {
  published: true,
  items: [
    {
      matchKey: 'MS:m1',
      source: 'bracket',
      eventCode: 'MS',
      discipline: "Men's Singles",
      roundLabel: 'Semifinals',
      status: 'live',
      scheduledDate: '2026-09-12',
      scheduledTime: '10:30',
      court: 1,
      sides: [
        { participantKey: 'a', persons: [ref(PERSON_ID, 'Ada Lovelace')], placeholder: null },
        { participantKey: 'b', persons: [ref('b', 'Grace Hopper')], placeholder: null },
      ],
      score: [[21, 19]],
      walkover: false,
      updatedAt: '2026-09-12T10:35:00+00:00',
    },
  ],
  facets: { days: [{ day: '2026-09-12', count: 1 }], events: ['MS'], courts: [1], states: ['live'] },
  page: 1,
  pageSize: 25,
  total: 1,
  timeZone: 'Asia/Seoul',
  updatedAt: '2026-09-12T10:35:00+00:00',
  revision: 'abc123',
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
      matchCoverage: { imported: 1, expected: 1, missing: 0 },
      recordScope: 'full_draw',
      topologyScope: 'full_draw',
      historical: false,
      sourceUrl: null,
      roundCount: 1,
      champions: [],
      finalists: [],
      remainingMatchCount: 0,
    },
  ],
  divisions: [],
};

const SE_DRAW = {
  drawKey: 'MS',
  eventCode: 'MS',
  discipline: "Men's Singles",
  kind: 'se',
  size: 4,
  resultsPublished: true,
  matchCoverage: { imported: 1, expected: 1, missing: 0 },
  recordScope: 'full_draw',
  topologyScope: 'full_draw',
  historical: false,
  sourceUrl: null,
  identityScope: null,
  teams: [
    { participantKey: 'p1', persons: [ref(PERSON_ID, 'Ada Lovelace')], club: 'Analytical BC', seed: 1 },
    { participantKey: 'p2', persons: [ref('p2', 'Grace Hopper')], club: null, seed: null },
  ],
  segments: [
    {
      id: 'MAIN',
      label: 'Draw',
      rounds: [
        {
          label: 'Final',
          matches: [
            {
              nodeKey: 'f1',
              position: 1,
              sides: [
                { participantKey: 'p1', placeholder: null, bye: false, feederNodeKey: null, feederTake: null },
                { participantKey: 'p2', placeholder: null, bye: false, feederNodeKey: null, feederTake: null },
              ],
              result: { winnerSide: 'A', score: [[21, 15], [21, 12]], walkover: false },
              scheduledTime: '10:30',
              court: 1,
              playedOn: '2026-08-01',
            },
          ],
        },
      ],
    },
  ],
};

const PLAYERS = {
  published: true,
  players: [{ playerKey: PERSON_ID, person: ref(PERSON_ID, 'Ada Lovelace'), eventCodes: ['MS'] }],
  referencedPlayerCount: 1,
  missingNameCount: 0,
};

const PLAYER = {
  person: ref(PERSON_ID, 'Ada Lovelace'),
  club: 'Analytical BC',
  events: [{ code: 'MS', discipline: "Men's Singles", partner: null, seed: 1, drawPath: [] }],
  matches: [],
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
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input instanceof Request ? input.url : input);
      for (const [suffix, body] of Object.entries(routes)) {
        if (url.includes(suffix)) {
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

const TAB_LABELS = ['Overview', 'Schedule', 'Draws', 'Players', 'Documents'];

function tabNav(html: string): string {
  return html.match(/<nav aria-label="Tournament sections"[\s\S]*?<\/nav>/)?.[0] ?? '';
}
function crumbNav(html: string): string {
  return html.match(/<nav aria-label="Breadcrumb"[\s\S]*?<\/nav>/)?.[0] ?? '';
}
function labels(nav: string): string[] {
  return [...nav.matchAll(/>([^<]+)<\/a>/g)].map((match) => match[1]);
}

interface FrameCase {
  name: string;
  path: string;
  routes: Record<string, unknown>;
  /** The tab that must be `aria-current` — the PARENT tab on a nested page. */
  activeTab: string;
  /** The whole breadcrumb trail, ancestors first, current page last. */
  crumbs: string[];
}

const CASES: FrameCase[] = [
  { name: 'Overview', path: '/e/spring-open', routes: {}, activeTab: 'Overview', crumbs: ['Tournaments', 'Spring Open'] },
  {
    name: 'Schedule',
    path: '/e/spring-open/schedule',
    routes: { '/matches': MATCHES },
    activeTab: 'Schedule',
    crumbs: ['Tournaments', 'Spring Open', 'Schedule'],
  },
  {
    name: 'Draws index',
    path: '/e/spring-open?tab=draws',
    routes: { '/draws': DRAWS_INDEX },
    activeTab: 'Draws',
    crumbs: ['Tournaments', 'Spring Open', 'Draws'],
  },
  {
    name: 'draw detail',
    path: '/e/spring-open/draws/MS',
    routes: { '/draws/MS': SE_DRAW },
    activeTab: 'Draws',
    crumbs: ['Tournaments', 'Spring Open', 'Draws', "Men's Singles"],
  },
  {
    name: 'Players',
    path: '/e/spring-open?tab=players',
    routes: { '/players': PLAYERS },
    activeTab: 'Players',
    crumbs: ['Tournaments', 'Spring Open', 'Players'],
  },
  {
    name: 'player detail',
    path: `/e/spring-open/players/${PERSON_ID}`,
    routes: { [`/players/${PERSON_ID}`]: PLAYER },
    activeTab: 'Players',
    crumbs: ['Tournaments', 'Spring Open', 'Players', 'Ada Lovelace'],
  },
  {
    name: 'Regulations',
    path: '/e/spring-open/regulations',
    routes: {},
    activeTab: 'Documents',
    crumbs: ['Tournaments', 'Spring Open', 'Documents'],
  },
];

describe.each(CASES)('the tournament frame on $name', ({ path, routes, activeTab, crumbs }) => {
  it('renders the one hero: the tournament is the document heading, stated once', async () => {
    stubApi(routes);
    const html = await render(path);

    expect(html).toMatch(/<h1[^>]*id="tournament-title"[^>]*>Spring Open<\/h1>/);
    expect((html.match(/<h1[\s>]/g) ?? []).length).toBe(1);
    // §11.1: the hero carries the tournament's identity at every depth.
    expect(html).toContain('Kingsway BC');
    expect(html).toContain('Saturday 12 September 2026 · Kingsway Centre');
    // §7.1: the venue-time rule is stated once per frame, never per card.
    expect((html.match(/All times local to the venue/g) ?? []).length).toBe(1);
  });

  it('renders the same tab bar with the right parent tab current', async () => {
    stubApi(routes);
    const nav = tabNav(await render(path));

    expect(labels(nav)).toEqual(TAB_LABELS);
    const current = nav.match(/<a[^>]*aria-current="page"[^>]*>([^<]*)/g) ?? [];
    expect(current).toHaveLength(1);
    expect(current[0]).toContain(activeTab);
  });

  it('renders one breadcrumb trail whose ancestors are links and whose last segment is the current page', async () => {
    stubApi(routes);
    const html = await render(path);
    const nav = crumbNav(html);

    expect(nav).not.toBe('');
    const ancestors = labels(nav);
    const current = [...nav.matchAll(/<span aria-current="page"[^>]*>([^<]*)<\/span>/g)].map(
      (match) => match[1],
    );
    expect(current).toHaveLength(1);
    // Compared after HTML entity decoding of the one apostrophe the fixture
    // discipline carries.
    const decode = (value: string) => value.replace(/&#x27;/g, "'");
    expect([...ancestors, ...current].map(decode)).toEqual(crumbs);
    // Ancestors are native links, in order, and the first is the listing.
    expect(nav).toContain('href="/e/"');
    expect((nav.match(/<ol/g) ?? []).length).toBe(1);
  });

  it('carries no floating text-arrow back link and no second navigation', async () => {
    stubApi(routes);
    const html = await render(path);

    // The controls the breadcrumb replaced (§11.1 "no floating back links").
    expect(html).not.toContain('← Spring Open');
    expect(html).not.toContain('← Tournament');
    expect(html).not.toContain('Tournament page');
    // Exactly one section navigation and one breadcrumb on the document.
    expect((html.match(/aria-label="Tournament sections"/g) ?? []).length).toBe(1);
    expect((html.match(/aria-label="Breadcrumb"/g) ?? []).length).toBe(1);
    expect(html).not.toContain('aria-label="Document navigation"');
  });
});

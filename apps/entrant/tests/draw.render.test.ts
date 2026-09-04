/**
 * SP-P7 §3.4–3.6 on real server-rendered HTML: the Draws/Seeded entries/
 * Winners tabs and the draw page itself (RR standings + rounds, the
 * elimination columns, the consolation link-pills).
 *
 * The loaders make URL-distinguished reads, so the fetch stub answers by
 * path — the `player.render.test.ts` idiom.
 */
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { createServer } from "vite";
import { createRequestHandler, type ServerBuild } from "react-router";

import entryPageFixture from "./helpers/entryPage.fixture.json";

const PAGE = {
  ...entryPageFixture,
  publication: { entrants: true, draws: true, results: true },
  viewer: { signedIn: false, email: null, formCsrf: "" },
};
const ref = (id: string | null, name: string) => ({ identity: { id, name }, resolution: id ? 'resolved' : 'dead', label: null });

const DRAWS_INDEX = {
  published: true,
  resultsPublished: true,
  draws: [
    {
      drawKey: "MS",
      eventCode: "MS",
      discipline: "Men's Singles",
      kind: "se",
      size: 4,
      hasConsolation: false,
      matchCoverage: { imported: 3, expected: 3, missing: 0 },
      recordScope: "full_draw",
      topologyScope: "full_draw",
      historical: false,
      sourceUrl: null,
      roundCount: 2,
      champions: [],
      finalists: [],
      remainingMatchCount: 1,
    },
    {
      drawKey: "WS",
      eventCode: "WS",
      discipline: "Women's Singles",
      kind: "rr",
      size: 3,
      hasConsolation: false,
      matchCoverage: { imported: 3, expected: 3, missing: 0 },
      recordScope: "full_draw",
      topologyScope: "full_draw",
      historical: false,
      sourceUrl: null,
      roundCount: 1,
      champions: [],
      finalists: [],
      remainingMatchCount: 3,
    },
  ],
  divisions: [],
};

const PLAYERS = {
  published: true,
  players: [
    { playerKey: "p2", person: ref(null, "Bea Osei"), eventCodes: ["WS"] },
    { playerKey: "p1", person: ref('11111111-1111-4111-8111-111111111111', "Ada Lovelace"), eventCodes: ["MS", "XD"] },
  ],
  referencedPlayerCount: 3,
  missingNameCount: 1,
};

const SE_DRAW = {
  drawKey: "MS",
  eventCode: "MS",
  discipline: "Men's Singles",
  kind: "se",
  size: 4,
  resultsPublished: true,
  matchCoverage: { imported: 3, expected: 3, missing: 0 },
  recordScope: "full_draw",
  topologyScope: "full_draw",
  historical: false,
  sourceUrl: null,
  identityScope: null,
  teams: [
    {
      participantKey: "p1",
      persons: [ref('11111111-1111-4111-8111-111111111111', "Ada Lovelace")],
      club: "Analytical BC",
      seed: 1,
    },
    { participantKey: "p2", persons: [ref(null, "Grace Hopper")], club: null, seed: null },
    {
      participantKey: "p3",
      persons: [ref(null, "Katherine Johnson")],
      club: "Orbit SC",
      seed: 2,
    },
  ],
  segments: [
    {
      id: "MAIN",
      label: "Draw",
      rounds: [
        {
          label: "Semifinals",
          matches: [
            {
              nodeKey: "sf1",
              position: 1,
              sides: [
                {
                  participantKey: "p1",
                  placeholder: null,
                  bye: false,
                  feederNodeKey: null,
                  feederTake: null,
                },
                {
                  participantKey: "p2",
                  placeholder: null,
                  bye: false,
                  feederNodeKey: null,
                  feederTake: null,
                },
              ],
              result: {
                winnerSide: "A",
                score: [
                  [21, 15],
                  [21, 12],
                ],
                walkover: false,
              },
              scheduledTime: "10:30",
              court: 1,
              playedOn: "2026-08-01",
              sourceUrl: "https://example.test/archive",
              sourceRef: "demo-generated:T001:MS:SF:00",
            },
            {
              nodeKey: "sf2",
              position: 2,
              sides: [
                {
                  participantKey: "p3",
                  placeholder: null,
                  bye: false,
                  feederNodeKey: null,
                  feederTake: null,
                },
                {
                  participantKey: null,
                  placeholder: null,
                  bye: true,
                  feederNodeKey: null,
                  feederTake: null,
                },
              ],
              result: null,
              scheduledTime: null,
              court: null,
            },
          ],
        },
        {
          label: "Final",
          matches: [
            {
              nodeKey: "f1",
              position: 1,
              sides: [
                {
                  participantKey: "p1",
                  placeholder: null,
                  bye: false,
                  feederNodeKey: "sf1",
                  feederTake: "winner",
                },
                {
                  participantKey: null,
                  placeholder: "Winner of SF 2",
                  bye: false,
                  feederNodeKey: "sf2",
                  feederTake: "winner",
                },
              ],
              result: null,
              scheduledTime: "14:30",
              court: 1,
            },
          ],
        },
      ],
    },
    {
      id: "C",
      label: "Consolation",
      rounds: [{ label: "Final", matches: [] }],
    },
  ],
  standings: null,
};

const RR_DRAW = {
  drawKey: "WS",
  eventCode: "WS",
  discipline: "Women's Singles",
  kind: "rr",
  size: 3,
  resultsPublished: true,
  matchCoverage: { imported: 3, expected: null, missing: null },
  recordScope: "full_draw",
  topologyScope: "full_draw",
  historical: false,
  sourceUrl: null,
  identityScope: null,
  teams: [
    { participantKey: "a", persons: [ref(null, "Ann Ito")], club: "North BC", seed: null },
    { participantKey: "b", persons: [ref(null, "Bea Osei")], club: null, seed: null },
  ],
  segments: [
    {
      id: "MAIN",
      label: "",
      rounds: [
        {
          label: "Round 1",
          matches: [
            {
              nodeKey: "r1m1",
              position: 1,
              sides: [
                {
                  participantKey: "a",
                  placeholder: null,
                  bye: false,
                  feederNodeKey: null,
                  feederTake: null,
                },
                {
                  participantKey: "b",
                  placeholder: null,
                  bye: false,
                  feederNodeKey: null,
                  feederTake: null,
                },
              ],
              result: { winnerSide: "A", score: [[21, 10]], walkover: false },
              scheduledTime: "09:00",
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
      participantKey: "a",
      played: 1,
      wins: 1,
      losses: 0,
      gamesWon: 1,
      gamesLost: 0,
      pointsWon: 21,
      pointsLost: 10,
      history: ["W"],
    },
    {
      position: 2,
      participantKey: "b",
      played: 1,
      wins: 0,
      losses: 1,
      gamesWon: 0,
      gamesLost: 1,
      pointsWon: 10,
      pointsLost: 21,
      history: ["L"],
    },
  ],
};

const vite = await createServer({
  server: { middlewareMode: true },
  appType: "custom",
});
afterAll(() => vite.close());

beforeEach(() => {
  process.env.API_BASE_URL = "http://backend:8000";
});
afterEach(() => {
  vi.restoreAllMocks();
});

function stubApi(routes: Record<string, unknown>) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: RequestInfo | URL) => {
      const path = new URL(String(url)).pathname;
      for (const [suffix, body] of Object.entries(routes)) {
        if (path.endsWith(suffix)) {
          return new Response(JSON.stringify(body), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
      }
      return new Response(JSON.stringify(PAGE), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }),
  );
}

async function render(path: string): Promise<string> {
  const build = (await vite.ssrLoadModule(
    "virtual:react-router/server-build",
  )) as unknown as ServerBuild;
  const response = await createRequestHandler(
    build,
    "development",
  )(new Request(`http://entrant.test${path}`));
  return response.text();
}

describe("the tab bar under full publication", () => {
  it("renders the four ADR 0028 entries: Overview · Schedule · Draws · Players", async () => {
    stubApi({});
    const html = await render("/e/spring-open");
    const nav =
      html.match(/<nav aria-label="Tournament sections"[\s\S]*?<\/nav>/)?.[0] ??
      "";
    const labels = [...nav.matchAll(/>([^<]+)<\/a>/g)].map((m) => m[1]);
    expect(labels).toEqual(["Overview", "Schedule", "Draws", "Players"]);
  });
});

describe("the Players tab", () => {
  it("lists every named draw roster person in the public directory", async () => {
    stubApi({ "/players": PLAYERS });
    const html = await render("/e/spring-open?tab=players");
    expect(html).toContain("Ada Lovelace");
    expect(html).toContain("MS");
    expect(html).toContain("XD");
    expect(html).not.toContain("unavailable");
    expect(html).not.toContain("source roster");
    expect(html).not.toContain("/players/p1");
  });
});

describe("the Draws panel (§3.4, ADR 0028)", () => {
  it("lists every event with its draw facts and a Draw button into each draw", async () => {
    stubApi({ "/draws": DRAWS_INDEX });
    const html = await render("/e/spring-open?tab=draws");

    expect(html).toContain('href="/e/spring-open/draws/MS"');
    expect(html).toContain(">Draw</a>");
    expect(html).toContain("Elimination");
    expect(html).toContain("4 players");
    expect(html).toContain("2 rounds");
  });

  it("names the champion on a decided row, as a person link beside the Draw button", async () => {
    const champion = ref(
      '11111111-1111-4111-8111-111111111111',
      'Ada Lovelace',
    );
    stubApi({
      "/draws": {
        ...DRAWS_INDEX,
        draws: [
          {
            ...DRAWS_INDEX.draws[0],
            champions: [champion],
            remainingMatchCount: null,
          },
        ],
      },
    });
    const html = await render("/e/spring-open?tab=draws");

    expect(html).toContain("Champion");
    expect(html).toContain('/players/11111111-1111-4111-8111-111111111111');
    expect(html).toContain('aria-label="Men&#x27;s Singles draw"');
  });

  it("says plainly when a published tier has no draws", async () => {
    stubApi({
      "/draws": {
        published: true,
        resultsPublished: false,
        draws: [],
        divisions: [],
      },
    });
    const html = await render("/e/spring-open?tab=draws");
    expect(html).toContain("No draws yet.");
  });

  // F-DM-33 (P7b-NC9): the two causes of an empty `draws` list are told apart
  // HERE, at the tier that renders them, not only on the wire. Above and below
  // are the same empty list; only `divisions` differs.
  it("says a meet is a meet instead of telling it to wait for a draw", async () => {
    stubApi({
      "/draws": {
        published: true,
        resultsPublished: false,
        draws: [],
        divisions: ["MD", "MS", "WS"],
      },
    });
    const html = await render("/e/spring-open?tab=draws");

    expect(html).toContain("Played as a meet, not by draws.");
    expect(html).toContain("MD, MS, WS");
    expect(html).not.toContain("No draws yet.");
  });

  // ADR 0028: Seeded entries and Winners are no longer tabs. Seeds ride the
  // draw page as `[n]`; the champion rides the Draws row. Their bookmarks
  // land on the Draws panel rather than on Overview.
  it.each(["seeds", "winners"])("folds the retired %s bookmark onto Draws", async (legacy) => {
    stubApi({ "/draws": DRAWS_INDEX });
    const html = await render(`/e/spring-open?tab=${legacy}`);
    const nav =
      html.match(/<nav aria-label="Tournament sections"[\s\S]*?<\/nav>/)?.[0] ?? "";
    expect(nav).toMatch(/aria-current="page"[^>]*>Draws<\/a>/);
    expect(html).toContain('href="/e/spring-open/draws/MS"');
  });
});

describe("the elimination draw page", () => {
  it("renders rounds as columns with seeds, byes, placeholders and results", async () => {
    stubApi({ "/draws/MS": SE_DRAW });
    const html = await render("/e/spring-open/draws/MS");

    expect(html).toContain("Semifinals");
    expect(html).toContain("Final");
    expect(html).toMatch(/Ada Lovelace[\s\S]*\[.*1.*\]/);
    expect(html).toMatch(/Katherine Johnson[\s\S]*\[.*2.*\]/);
    expect(html).toContain("Bye");
    expect(html).toContain("Winner of SF 2");
    expect(html).toContain("21");
    expect(html).not.toContain("10:30 · Court 1");
    expect(html).not.toContain("2026-08-01");
    expect(html).not.toContain("demo-generated:");
    // Wide content scrolls in its own container (R11).
    expect(html).toContain("overflow-x-auto");
    expect(html).toContain('data-testid="public-bracket-canvas"');
    expect(html).toContain("w-max min-w-full");
    expect(html).toContain('data-match-variant="bracket-node"');
    expect(html).toContain('data-bracket-links="true"');
    expect(html).toContain('src="/e/assets/bracket-path.js"');
    expect(html).not.toContain("/e/assets/bracket-connectors.js");
    expect((html.match(/<article/g) ?? []).length).toBe(3);

    const list = await render("/e/spring-open/draws/MS?view=list");
    expect(list).toContain("2026-08-01");
    expect(list).toContain("10:30 · Court 1");
  });

  it("offers the Draw / Consolation link-pills and honors ?segment=", async () => {
    stubApi({ "/draws/MS": SE_DRAW });
    const main = await render("/e/spring-open/draws/MS");
    expect(main).toContain("?segment=C");
    expect(main).toContain("Consolation");

    const consolation = await render("/e/spring-open/draws/MS?segment=C");
    // The consolation segment has no matches: the main tree's names are
    // gone; the pills remain for the way back.
    expect(consolation).not.toContain("Ada Lovelace [1]");
    expect(consolation).toContain("?segment=MAIN");
  });
});

describe("the round-robin draw page", () => {
  it("renders the standings table with the adapted columns and history pills", async () => {
    stubApi({ "/draws/WS": RR_DRAW });
    const html = await render("/e/spring-open/draws/WS");

    for (const heading of [
      "Pos",
      "Player",
      "PL",
      "W",
      "L",
      "GM",
      "PTS",
      "History",
    ]) {
      expect(html).toContain(`>${heading}</th>`);
    }
    expect(html).toContain("Ann Ito");
    expect(html).toContain("21-10");
    expect(html).toMatch(/>W<\/span>/);
    // And the round list beneath, on the shared card anatomy.
    expect(html).toContain("Round 1");
    expect(html).toContain("09:00 · Court 2");
    expect(html).not.toContain('aria-label="Draw view"');
  });

  it("ignores unsupported view modes instead of showing no-op controls", async () => {
    stubApi({ "/draws/WS": RR_DRAW });
    const html = await render("/e/spring-open/draws/WS?view=path&player=Ann");

    expect(html).toContain("Ann Ito");
    expect(html).not.toContain('aria-label="Draw view"');
    expect(html).not.toContain('id="draw-player"');
  });
});

describe("the gates, upstream", () => {
  it("a 404 from the draw projection is this page 404ing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: RequestInfo | URL) =>
        String(url).includes("/draws/")
          ? new Response("Not found", { status: 404 })
          : new Response(JSON.stringify(PAGE), {
              status: 200,
              headers: { "content-type": "application/json" },
            }),
      ),
    );
    const build = (await vite.ssrLoadModule(
      "virtual:react-router/server-build",
    )) as unknown as ServerBuild;
    const response = await createRequestHandler(
      build,
      "development",
    )(new Request("http://entrant.test/e/spring-open/draws/MS"));
    expect(response.status).toBe(404);
    expect(await response.text()).toContain("This draw is not available");
  });
});

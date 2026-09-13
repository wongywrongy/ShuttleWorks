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
              reference: "MS SF1",
              shortReference: "SF1",
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
              reference: "MS SF2",
              shortReference: "SF2",
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
              reference: "MS F",
              shortReference: "F",
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
                  // The wire's legacy prose twin still says "Winner of …";
                  // the renderer reads the DISCRIMINANT (contract §2.1) and,
                  // since public-visual-fixes P3, renders the public tier's
                  // empty slot + muted feeder line from it.
                  placeholder: "Winner of SF2",
                  bye: false,
                  feederNodeKey: "sf2",
                  feederTake: "winner",
                  unresolved: { kind: "winner_of", reference: "SF2" },
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
              reference: "WS R1·1",
              shortReference: "R1·1",
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
  // Contract §11.1: Documents joins the ADR 0028 four whenever the organizer
  // published regulations, and it is how the reader reaches them — the
  // regulations reader no longer carries a navigation of its own.
  it("renders Overview · Schedule · Draws · Players · Documents", async () => {
    stubApi({});
    const html = await render("/e/spring-open");
    const nav =
      html.match(/<nav aria-label="Tournament sections"[\s\S]*?<\/nav>/)?.[0] ??
      "";
    const labels = [...nav.matchAll(/>([^<]+)<\/a>/g)].map((m) => m[1]);
    expect(labels).toEqual(["Overview", "Schedule", "Draws", "Players", "Documents"]);
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
  // public-visual-fixes P6: the row is name · entrants · progress · Open,
  // and the WHOLE row is the link into the draw. The facts line it used to
  // carry (format, eligibility, round count) described the draw's shape,
  // which the draw page itself states.
  it("lists every event as one row-wide link into its draw", async () => {
    stubApi({ "/draws": DRAWS_INDEX });
    const html = await render("/e/spring-open?tab=draws");

    expect(html).toContain('href="/e/spring-open/draws/MS"');
    expect(html).toContain(">Open<");
    expect(html).toContain("4 players");
    expect(html).not.toContain(">View draw</a>");
    expect(html).not.toContain("2 rounds");
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
    // P6: the row IS a link, so the champion reads as text inside it — a
    // link inside a link is not a link.
    expect(html).toContain("Ada Lovelace");
    expect(html).not.toContain('/players/11111111-1111-4111-8111-111111111111');
    expect(html).toContain('aria-label="Men&#x27;s singles draw"');
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

  // P6: `?tab=seeds` and `?tab=winners` were panels of this same Draws
  // surface, and both URLs are still in circulation — they canonicalise onto
  // it rather than 404ing.
  it.each(["events", "seeds", "winners"])("redirects the retired %s tab URL onto Draws", async (alias) => {
    stubApi({ "/draws": DRAWS_INDEX });
    const build = (await vite.ssrLoadModule(
      "virtual:react-router/server-build",
    )) as unknown as ServerBuild;
    const response = await createRequestHandler(build, "development")(
      new Request(`http://entrant.test/e/spring-open?tab=${alias}`),
    );
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/e/spring-open?tab=draws");
  });
});

describe("the elimination draw page", () => {
  // Rewritten for public-visual-fixes P4 / contract §4.3: there is ONE tree
  // in the response now, at every width. "Round" stopped being a page mode
  // (it is navigation inside the bracket), so the pair of CSS-toggled
  // blocks that shipped the whole draw twice — and the previous/next round
  // pager that repeated the round heading on the page it was already on —
  // are both gone. The bracket is the default; List is the other mode.
  it("renders one bracket, in its own named scroll region, at every width", async () => {
    stubApi({ "/draws/MS": SE_DRAW });
    const html = await render("/e/spring-open/draws/MS");

    expect(html).toContain("Semifinals");
    expect(html).toContain("Final");
    expect(html).toMatch(/Ada Lovelace[\s\S]*\[.*1.*\]/);
    expect(html).toMatch(/Katherine Johnson[\s\S]*\[.*2.*\]/);
    expect(html).toContain("Bye");
    // public-visual-fixes P3: an unresolved side is an empty slot with a
    // muted feeder line naming the SHARED reference — never "Winner of".
    expect(html).toContain("TBD");
    expect(html).not.toContain("Winner of");
    expect(html).toContain("21");
    expect(html).not.toContain("demo-generated:");
    // The two CSS-toggled copies of the draw are gone.
    expect(html).not.toContain('<div class="md:hidden">');
    expect(html).not.toContain('<div class="hidden md:block">');
    // ...and so is the round pager that duplicated the round heading.
    expect(html).not.toContain("Previous round");
    expect(html).not.toContain("Next round");
    // The tree scrolls in its own region: bounded, named, keyboard-reachable
    // (§4.3), and snapped by round on narrow screens.
    expect(html).toContain('data-testid="public-bracket-canvas"');
    expect(html).toContain("data-bracket-scroll");
    expect(html).toMatch(/role="region"[^>]*tabindex="0"/);
    expect(html).toContain('aria-label="Men&#x27;s Singles bracket"');
    expect(html).toContain("bracket-scroll");
    expect(html).toContain("overflow-auto");
    expect(html).toContain("snap-x snap-mandatory");
    expect(html).toContain("w-max min-w-full");
    // Round headers stay in view inside that region.
    expect(html).toContain("bracket-round-header");
    expect(html).toContain('data-match-variant="bracket-node"');
    expect(html).toContain('data-bracket-links="true"');
    expect(html).toContain('src="/e/assets/bracket-path.js"');
    expect(html).not.toContain("/e/assets/bracket-connectors.js");
    // Three nodes: the whole draw, once.
    expect((html.match(/<article/g) ?? []).length).toBe(3);
    // V3-PE10.1 / §6.1 (P3): every bracket node carries the SHARED match
    // reference — the same string the operator's match list shows — and no
    // surface renumbers locally as "Match n".
    expect(html).not.toContain("Match 1");
    expect(html).not.toContain("Match 2");

    // The two modes on offer are Bracket and List — Round is not a mode.
    const nav = html.match(/<nav aria-label="Draw view"[\s\S]*?<\/nav>/)?.[0] ?? "";
    expect([...nav.matchAll(/>([^<]+)</g)].map((m) => m[1])).toEqual([
      "Bracket",
      "List",
    ]);

    const list = await render("/e/spring-open/draws/MS?view=list");
    // D12: the raw ISO date is never in prose — humanized instead.
    expect(list).not.toContain("2026-08-01");
    expect(list).toContain("Saturday, August 1");
    expect(list).toContain("10:30 · Court 1");
    expect(list).not.toContain('data-testid="public-bracket-canvas"');
  });

  it("offers R32 · R16 · QF · SF · F round controls as native anchors into the columns", async () => {
    stubApi({ "/draws/MS": SE_DRAW });
    const html = await render("/e/spring-open/draws/MS");
    const nav = html.match(/<nav aria-label="Rounds"[\s\S]*?<\/nav>/)?.[0] ?? "";
    // Adapted to this draw's own format: a two-round draw is SF · F.
    expect(nav).toContain(">SF<");
    expect(nav).toContain(">F<");
    // Native anchors into ids the columns actually carry — no JS required.
    expect(nav).toContain('href="#draw-round-semifinals"');
    expect(nav).toContain('href="#draw-round-final"');
    expect(html).toContain('id="draw-round-semifinals"');
    expect(html).toContain('id="draw-round-final"');
    // ...and the mount point the enhancement builds its controls into.
    expect(html).toContain("data-bracket-toolbar");
  });

  it("keeps legacy ?view=round links working by positioning the requested round", async () => {
    stubApi({ "/draws/MS": SE_DRAW });
    const html = await render("/e/spring-open/draws/MS?view=round&round=1");
    // The bracket answers the old URL...
    expect(html).toContain('data-testid="public-bracket-canvas"');
    // ...positioned at the round it asked for, and marked in the controls.
    expect(html).toContain('data-initial-round="draw-round-final"');
    expect(html).toMatch(/aria-current="true"[^>]*>[\s\S]{0,80}>F</);
    // The duplicate "Round 2 of 2" heading and its pager are gone.
    expect(html).not.toMatch(/Round[\s\S]{0,20}2[\s\S]{0,20}of[\s\S]{0,20}2/);
  });

  it("keeps a ?view=path link lighting the selected player with no JavaScript", async () => {
    stubApi({ "/draws/MS": SE_DRAW });
    const html = await render(
      "/e/spring-open/draws/MS?view=path&player=11111111-1111-4111-8111-111111111111",
    );
    // The path is painted SERVER-side: the classes the script would add are
    // already on the document, so the fallback shows the same thing.
    expect(html).toContain("has-person-path");
    expect(html).toContain("is-person-path");
    expect(html).toContain('data-pinned-person="11111111-1111-4111-8111-111111111111"');
    // ...with the selected player named, and a reset that needs no script.
    expect(html).toContain("Ada Lovelace");
    expect(html).toContain("Clear path");
  });

  it("resolves ?player= by stable identity, and treats a typed name as a search only", async () => {
    stubApi({ "/draws/MS": SE_DRAW });
    // An id: this IS the person, so the path pins and the banner names her.
    const byId = await render(
      "/e/spring-open/draws/MS?player=11111111-1111-4111-8111-111111111111",
    );
    expect(byId).toContain('data-pinned-person="11111111-1111-4111-8111-111111111111"');
    // Refinement 2026-09-12: a resolved person is stated ONCE, in the path
    // summary (name · count · profile · one clear), not as a search result.
    const summary = byId.match(/<p[^>]*data-path-summary[\s\S]*?<\/p>/)?.[0] ?? '';
    expect(summary).toMatch(/Path:[\s\S]{0,200}Ada Lovelace/);
    expect(summary).toMatch(/\d+ match(?:es)?</);
    expect(summary).toContain('href="/e/spring-open/players/11111111-1111-4111-8111-111111111111"');
    expect(summary).toContain('Clear path');
    expect(byId).not.toContain('found for');
    expect(byId).not.toContain('Clear search');
    expect((byId.match(/Clear path/g) ?? []).length).toBe(1);

    // A name: a search. It highlights and filters, but asserts no identity —
    // nobody's path is pinned and no full name is printed as if the reader
    // had chosen it (the P2-flagged substring resolution).
    const byName = await render("/e/spring-open/draws/MS?view=list&player=ada");
    expect(byName).not.toContain("data-pinned-person");
    expect(byName).toMatch(/found for[\s\S]{0,60}>ada</);
    expect(byName).toMatch(/font-semibold underline decoration-2/);
    // The only way a name becomes an identity: the reader picks it from an
    // offer — which is also the no-JavaScript way into a pinned path.
    expect(byName).toContain(
      "view=path&amp;player=11111111-1111-4111-8111-111111111111",
    );
    expect(byName).toMatch(/Show[\s\S]{0,60}Ada Lovelace[\s\S]{0,40}s path/);

    // Accent- and case-blind, through the tier's one folding.
    const folded = await render("/e/spring-open/draws/MS?view=list&player=LOVELACE");
    // Both of Ada's matches, from an all-caps query.
    expect(folded).toMatch(/>2<[\s\S]{0,60}matches[\s\S]{0,40}found for/);
  });

  // P8: a minted person key resolves inside ONE draw. Pointed at a draw the
  // person is not in, the page used to echo the 71-character key into the
  // search box and into "0 matches found for '<key>'" - the raw-identifier
  // leak the surface book recorded on S44.
  it("never echoes a person key that belongs to another draw", async () => {
    stubApi({ "/draws/MS": SE_DRAW });
    const key = "player-b61e72b4391ee25a74ac2bc312736fa6ed87cd6fe653425994067699c123e1dc";
    const html = await render(`/e/spring-open/draws/MS?player=${key}`);

    expect(html).toContain("That player is not in this draw.");
    // Never as VISIBLE text: not in the search box, not in the status line.
    // (The key still rides the view/segment hrefs - that is the URL the
    // reader arrived on, and "Clear search" is the way out of it.)
    expect(html).toContain('name="player" value=""');
    expect(html).not.toContain(`>${key}<`);
    expect(html).not.toMatch(/found for/);
  });

  // ---- public-visual-fixes P3 -----------------------------------------

  it("uses the event-code-dropped reference in this single-event view", async () => {
    // §6.1: a draw page has ONE event, so the compact line reads
    // `SF1 · … · 10:30 · Court 1` — the same match the operator's list calls
    // `MS SF1`, minus the code the page already states in its own subtitle.
    stubApi({ "/draws/MS": SE_DRAW });
    const list = await render("/e/spring-open/draws/MS?view=list");
    expect(list).toContain("SF1 · Saturday, August 1 · Scheduled 10:30 · Court 1");
    expect(list).not.toContain("MS SF1");
    // ...and the node carries the same string.
    const bracket = await render("/e/spring-open/draws/MS?view=bracket");
    expect(bracket).toContain(">SF1<");
    expect(bracket).toContain(">F<");
  });

  it("gives each side its own aligned game column on the node (P1)", async () => {
    // **Operator/public remediation P1 supersedes public-visual-fixes P4.**
    // A bracket node is a stacked layout, so the number beside a name
    // belongs to that name: two games x two sides = four cells on the one
    // decided node, and no per-game emphasis on any of them. The paired
    // spelling survives only in the node's accessible summary.
    stubApi({ "/draws/MS": SE_DRAW });
    const bracket = await render("/e/spring-open/draws/MS?view=bracket");
    expect((bracket.match(/place-items-center/g) ?? []).length).toBe(4);
    expect(bracket).toContain("Score 21–15, 21–12");
    // The node's own metadata line carries the reference alone now.
    expect(bracket).not.toContain('<span class="tabular-nums">21–15, 21–12</span>');
  });

  it("leaves an unreached slot empty with a muted feeder line", async () => {
    stubApi({ "/draws/MS": SE_DRAW });
    const bracket = await render("/e/spring-open/draws/MS?view=bracket");
    expect(bracket).toContain("data-feeder-slot");
    expect(bracket).toContain("TBD");
    expect(bracket).not.toContain("Winner of");
    // Never a machine identifier in visible prose (§4.3).
    expect(bracket).not.toMatch(/>sf2</);
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

  // V3-PE12.1: the banner names the actual behaviour — a plural-aware count
  // of what was found for the query — rather than the old "Showing matches
  // for X." wording, which did not say whether that was filtering,
  // highlighting, or the whole draw. "Clear player filter" is renamed
  // "Clear search" for the same reason (plan §3's ruled recommendation).
  it('makes a player-path search visibly identifiable and preserves its view context', async () => {
    stubApi({ "/draws/MS": SE_DRAW });
    const html = await render('/e/spring-open/draws/MS?view=list&segment=MAIN&player=Ada');
    expect(html).toMatch(/matches[\s\S]{0,20}found for/);
    expect(html).toContain('Ada Lovelace');
    expect(html).not.toContain('Showing matches for');
    expect(html).toContain('Clear search');
    expect(html).not.toContain('Clear player filter');
    expect(html).toContain('view=list');
    expect(html).toMatch(/font-semibold underline decoration-2/);
    expect(html).toContain('Find a player or pair');
  });

  // public-visual-fixes P8: the two draw sizes the product actually ships at
  // scale. The fixture above is a 4 draw, so before this nothing rendered a
  // full R16 or R32 tree through the route — the round labels, the column
  // count and the node count all adapt to `size`, and adapting wrongly at 32
  // is invisible in a two-round fixture.
  function sizedDraw(size: number) {
    const labels = ["Round of 32", "Round of 16", "Quarterfinals", "Semifinals", "Final"];
    const shortNames = ["R32", "R16", "QF", "SF", "F"];
    const roundCount = Math.log2(size);
    const first = labels.length - roundCount;
    const rounds = [];
    for (let round = 0; round < roundCount; round++) {
      const width = size / 2 ** (round + 1);
      const short = shortNames[first + round];
      rounds.push({
        label: labels[first + round],
        matches: Array.from({ length: width }, (_, slot) => ({
          nodeKey: `${short}-${slot + 1}`,
          position: slot + 1,
          reference: `MS ${short}${width > 4 ? "\u00b7" : ""}${slot + 1}`,
          shortReference: `${short}${width > 4 ? "\u00b7" : ""}${slot + 1}`,
          sides: [0, 1].map((side) => ({
            participantKey: round === 0 ? `p${slot * 2 + side + 1}` : null,
            placeholder: null,
            bye: false,
            feederNodeKey: round === 0 ? null : `${shortNames[first + round - 1]}-${slot * 2 + side + 1}`,
            feederTake: round === 0 ? null : "winner",
            unresolved:
              round === 0
                ? null
                : {
                    kind: "winner_of",
                    reference: `${shortNames[first + round - 1]}${
                      size / 2 ** round > 4 ? "\u00b7" : ""
                    }${slot * 2 + side + 1}`,
                  },
          })),
          result: null,
          scheduledTime: null,
          court: null,
          playedOn: null,
          localTime: null,
          courtLabel: null,
          sourceUrl: null,
          sourceRef: null,
        })),
      });
    }
    return {
      ...SE_DRAW,
      size,
      matchCoverage: { imported: size - 1, expected: size - 1, missing: 0 },
      teams: Array.from({ length: size }, (_, index) => ({
        participantKey: `p${index + 1}`,
        persons: [
          ref(
            null,
            // A long, real-shaped name in every slot: the column width is set
            // by its longest row, and a short-name fixture measures a tree
            // nobody has.
            `Muhammad Reza Pahlevi Isfahani ${index + 1}`,
          ),
        ],
        club: "Northgate Badminton Club",
        seed: index < 8 ? index + 1 : null,
      })),
      segments: [{ id: "MAIN", label: "Draw", rounds }],
    };
  }

  it.each([
    [16, ["Round of 16", "Quarterfinals", "Semifinals", "Final"], 15],
    [32, ["Round of 32", "Round of 16", "Quarterfinals", "Semifinals", "Final"], 31],
  ])("renders every round of a %i draw, once", async (size, labels, nodes) => {
    stubApi({ "/draws/MS": sizedDraw(size) });
    const html = await render("/e/spring-open/draws/MS");

    for (const label of labels) expect(html).toContain(label);
    // One column per round, one node per match, and the whole tree once —
    // not the two CSS-toggled copies P4 removed.
    const columns = [...html.matchAll(/<section id="draw-round-/g)].length;
    expect(columns).toBe(labels.length);
    expect((html.match(/<article/g) ?? []).length).toBe(nodes);
    // Long names are carried whole; nothing is truncated to make a column fit.
    expect(html).toContain("Muhammad Reza Pahlevi Isfahani 1");
    expect(html).not.toContain("text-ellipsis");
    // Every unreached slot names the node it waits on, in the shared grammar.
    expect(html).toContain("data-feeder-slot");
    expect(html).not.toContain("Winner of");
    expect(html).not.toContain("Match 1");
  });

});

/**
 * Path selection across the shapes a real draw has (refinement 2026-09-12,
 * checklist §5): a win then a loss, a bye, a doubles pair, an unplayed later
 * round, and a person who is not in the draw. Built as an 8-draw so there
 * is a round after the selected person's last match.
 */
function pathDraw() {
  const side = (participantKey: string | null, extra: Record<string, unknown> = {}) => ({
    participantKey,
    placeholder: null,
    bye: false,
    feederNodeKey: null,
    feederTake: null,
    ...extra,
  });
  const feeder = (from: string) =>
    side(null, { feederNodeKey: from, feederTake: "winner", unresolved: { kind: "winner_of", reference: from.toUpperCase() } });
  const node = (nodeKey: string, sides: unknown[], result: unknown = null) => ({
    nodeKey,
    position: 1,
    reference: `MS ${nodeKey.toUpperCase()}`,
    shortReference: nodeKey.toUpperCase(),
    sides,
    result,
    scheduledTime: null,
    court: null,
    playedOn: null,
    localTime: null,
    courtLabel: null,
    sourceUrl: null,
    sourceRef: null,
  });
  return {
    ...SE_DRAW,
    size: 8,
    matchCoverage: { imported: 7, expected: 7, missing: 0 },
    teams: [
      { participantKey: "t1", persons: [ref("p1", "Ada Lovelace")], club: null, seed: 1 },
      { participantKey: "t2", persons: [ref("p2", "Grace Hopper")], club: null, seed: null },
      { participantKey: "t3", persons: [ref("p3", "Katherine Johnson")], club: null, seed: 2 },
      // A doubles pair in a singles fixture is a shape test, not a rule: the
      // pair selects by EITHER partner's id.
      { participantKey: "t5", persons: [ref("d1", "Mary Jackson"), ref("d2", "Dorothy Vaughan")], club: null, seed: null },
      { participantKey: "t6", persons: [ref("p6", "Annie Easley")], club: null, seed: null },
      { participantKey: "t7", persons: [ref("p7", "Margaret Hamilton")], club: null, seed: null },
      { participantKey: "t8", persons: [ref("p8", "Evelyn Boyd")], club: null, seed: null },
    ],
    segments: [
      {
        id: "MAIN",
        label: "Draw",
        rounds: [
          {
            label: "Quarterfinals",
            matches: [
              // p1 beats p2.
              node("qf1", [side("t1"), side("t2")], { winnerSide: "A", score: [[21, 15], [21, 12]], walkover: false }),
              // p3 has a bye: the bye side is settled, p3 advances.
              node("qf2", [side("t3"), side(null, { bye: true })], { winnerSide: "A", score: null, walkover: false }),
              // The doubles pair's match, unplayed.
              node("qf3", [side("t5"), side("t6")]),
              node("qf4", [side("t7"), side("t8")]),
            ],
          },
          {
            label: "Semifinals",
            matches: [
              // p3 beats p1 — p1's path ends here.
              node("sf1", [side("t1", { feederNodeKey: "qf1", feederTake: "winner" }), side("t3", { feederNodeKey: "qf2", feederTake: "winner" })], { winnerSide: "B", score: [[18, 21], [19, 21]], walkover: false }),
              node("sf2", [feeder("qf3"), feeder("qf4")]),
            ],
          },
          {
            label: "Final",
            // p3 is standing in the final; nobody has played it.
            matches: [node("f1", [side("t3", { feederNodeKey: "sf1", feederTake: "winner" }), feeder("sf2")])],
          },
        ],
      },
    ],
  };
}

/** The opening tag of one match slot, by node key. */
function slotTag(html: string, nodeKey: string): string {
  return html.match(new RegExp(`<div[^>]*data-node-key="${nodeKey}"[^>]*>`))?.[0] ?? "";
}
/** The connector overlay edge that arrives at `destination` from `feeder`. */
function edgeTag(html: string, feeder: string): string {
  return html.match(new RegExp(`<span[^>]*data-feeder-node="${feeder}"[^>]*>`))?.[0] ?? "";
}
const lit = (tag: string) => tag.includes("is-person-path");
const sideOf = (tag: string) => tag.match(/data-selected-side="([ab])"/)?.[1] ?? null;

describe("path selection (§5: wins, elimination, byes, doubles, later rounds)", () => {
  const draw = pathDraw();
  const render_ = (player: string) => {
    stubApi({ "/draws/MS": draw });
    return render(`/e/spring-open/draws/MS?view=path&player=${player}`);
  };

  it("a win then a loss lights the two matches played and the edge between them, and nothing after", async () => {
    const html = await render_("p1");
    expect(lit(slotTag(html, "qf1"))).toBe(true);
    expect(sideOf(slotTag(html, "qf1"))).toBe("a");
    // The upper feeder edge into SF1: p1 stands on SF1's side A.
    expect(lit(edgeTag(html, "qf1"))).toBe(true);
    expect(lit(slotTag(html, "sf1"))).toBe(true);
    expect(sideOf(slotTag(html, "sf1"))).toBe("a");
    // Eliminated: the final is not p1's, and neither is p3's feeder edge.
    expect(lit(slotTag(html, "f1"))).toBe(false);
    expect(lit(edgeTag(html, "sf1"))).toBe(false);
    expect(lit(edgeTag(html, "qf2"))).toBe(false);
    // The sibling branch is untouched: no over-highlighting of the whole
    // brace (the old defect is gone, and this is the evidence).
    expect(lit(slotTag(html, "qf2"))).toBe(false);
    expect(lit(slotTag(html, "sf2"))).toBe(false);
    expect(lit(slotTag(html, "qf3"))).toBe(false);
    expect(html).toMatch(/data-path-summary[\s\S]*?2 matches/);
  });

  it("a bye counts as the match reached, and an unplayed later round lights only the slot the person stands in", async () => {
    const html = await render_("p3");
    expect(lit(slotTag(html, "qf2"))).toBe(true);
    expect(sideOf(slotTag(html, "qf2"))).toBe("a");
    expect(lit(slotTag(html, "sf1"))).toBe(true);
    expect(sideOf(slotTag(html, "sf1"))).toBe("b");
    expect(lit(edgeTag(html, "qf2"))).toBe(true);
    // Actual participation: p3 is in the final's side A already; the
    // opponent's feeder edge (from SF2) is potential, not lit.
    expect(lit(slotTag(html, "f1"))).toBe(true);
    expect(sideOf(slotTag(html, "f1"))).toBe("a");
    expect(lit(edgeTag(html, "sf1"))).toBe(true);
    expect(lit(edgeTag(html, "sf2"))).toBe(false);
    expect(lit(slotTag(html, "qf1"))).toBe(false);
  });

  it("either partner of a doubles pair selects the pair's path, and only that pair's", async () => {
    for (const partner of ["d1", "d2"]) {
      const html = await render_(partner);
      expect(lit(slotTag(html, "qf3"))).toBe(true);
      expect(sideOf(slotTag(html, "qf3"))).toBe("a");
      // Unplayed: nothing beyond the pair's own match.
      expect(lit(slotTag(html, "sf2"))).toBe(false);
      expect(lit(edgeTag(html, "qf3"))).toBe(false);
      expect(lit(slotTag(html, "qf4"))).toBe(false);
      expect(html).toMatch(/data-path-summary[\s\S]*?1 match</);
    }
  });

  it("a person who is not in this draw lights nothing and names nobody", async () => {
    const html = await render_("player-0000000000000000000000000000000000000000000000000000000000000000");
    expect(html).not.toContain("has-person-path");
    expect(html).not.toContain("is-person-path");
    expect(html).not.toContain("data-path-summary");
    expect(html).toContain("That player is not in this draw.");
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

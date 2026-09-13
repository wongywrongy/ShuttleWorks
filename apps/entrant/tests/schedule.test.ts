/** Schedule / Live is a public, URL-backed document. */
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
import { formatScheduleUpdated, loader } from "../app/routes/schedule";

const PAGE = {
  ...entryPageFixture,
  publication: { entrants: true, draws: true, results: true },
  viewer: { signedIn: false, email: null, formCsrf: "" },
};

const MATCHES = {
  published: true,
  items: [
    {
      matchKey: "MS:m1",
      source: "bracket",
      eventCode: "MS",
      discipline: "Men's Singles",
      roundLabel: "Semifinals",
      status: "live",
      scheduledDate: "2026-09-12",
      scheduledTime: "10:30",
      court: 1,
      sides: [
        {
          participantKey: "ada",
          persons: [{ identity: { id: "ada", name: "Ada Lovelace" }, resolution: "resolved", label: null }],
          placeholder: null,
        },
        {
          participantKey: "grace",
          persons: [{ identity: { id: "grace", name: "Grace Hopper" }, resolution: "resolved", label: null }],
          placeholder: null,
        },
      ],
      score: [[21, 19]],
      walkover: false,
      winnerSide: null,
      reference: "MS SF1",
      shortReference: "SF1",
      updatedAt: "2026-09-12T10:35:00+00:00",
    },
  ],
  facets: {
    days: [{ day: "2026-09-12", count: 1 }],
    events: ["MS"],
    courts: [1],
    states: ["live"],
  },
  page: 1,
  pageSize: 25,
  total: 1,
  timeZone: "Asia/Seoul",
  updatedAt: "2026-09-12T10:35:00+00:00",
  revision: "abc123",
};

describe("schedule freshness", () => {
  it("converts the update instant into venue-local time, with no zone in the prose", () => {
    const formatted = formatScheduleUpdated("2026-09-12T10:35:00+00:00", "Asia/Seoul");
    // Converted, not merely stripped: 10:35 UTC is 19:35 in Seoul. P7: in
    // the tier's own day-first, 24-hour vocabulary — this line used to be
    // the one American, 12-hour date on the public site.
    expect(formatted).toBe("12 Sep 2026, 19:35");
    expect(formatted).not.toContain("GMT");
    expect(formatted).not.toContain("Asia/Seoul");
  });

  it("preserves an unparseable server value instead of inventing a date", () => {
    expect(formatScheduleUpdated("unknown", "Asia/Seoul")).toBe("unknown");
  });
});

const vite = await createServer({
  server: { middlewareMode: true },
  appType: "custom",
});
afterAll(() => vite.close());
beforeEach(() => {
  process.env.API_BASE_URL = "http://backend:8000";
  vi.stubGlobal(
    "fetch",
    vi.fn(async (request: Request | string) => {
      const url = typeof request === "string" ? request : request.url;
      if (url.endsWith("/matches") || url.includes("/matches?")) {
        return new Response(JSON.stringify(MATCHES), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response(JSON.stringify(PAGE), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }),
  );
});
afterEach(() => vi.restoreAllMocks());

async function render(
  path = "/e/spring-open/schedule",
  matches: unknown = MATCHES,
): Promise<string> {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (request: Request | string) => {
      const url = typeof request === "string" ? request : request.url;
      const body = url.includes("/matches") ? matches : PAGE;
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }),
  );
  const build = (await vite.ssrLoadModule(
    "virtual:react-router/server-build",
  )) as unknown as ServerBuild;
  return (
    await createRequestHandler(
      build,
      "development",
    )(new Request(`http://entrant.test${path}`))
  ).text();
}

describe("Schedule / Live", () => {
  it("renders a mobile-readable match card with explicit state and timezone", async () => {
    const html = await render();
    // public-visual-fixes P7: the route's own "Schedule" heading and its
    // "Find matches by day, time, or court." sentence are GONE — the frame's
    // breadcrumb, its current tab and the browser tab already name the page,
    // and the sentence described the controls directly beneath it. The
    // landmark keeps the accessible name.
    expect(html).toMatch(/<main[^>]*aria-label="Schedule"/);
    expect(html).not.toMatch(/id="schedule-title"/);
    expect(html).not.toContain("Find matches by day, time, or court.");
    expect(html).not.toContain("Schedule / Live");
    expect(html).toContain("Live now");
    expect(html).toContain("Ada Lovelace");
    expect(html).toContain("Grace Hopper");
    expect(html).toContain("Court 1");
    // Contract §7.1/§11.1: the frame states the venue-time rule ONCE, and
    // public prose then carries no IANA identifier, offset or zone
    // abbreviation. This page used to print "Asia/Seoul" three times.
    expect(html).toContain("All times local to the venue");
    expect(html).not.toContain("Asia/Seoul");
    expect(html).not.toMatch(/GMT[+-]\d|KST/);
    expect(html).toContain("10:30");
    expect(html).toContain("/players/ada");
  });

  // ---- public-visual-fixes P3 -----------------------------------------

  it("names the match with the SHARED reference, in its own column of the row", () => {
    // §6.1: a whole-day schedule is a MIXED-event view, so the event code
    // stays — the same string the operator's match list shows. The old bare
    // "Match n" is gone from the tier entirely. Refinement 2026-09-12: the
    // listing is aligned ROWS, so the reference sits in the event column and
    // the time and court in the first column, not on one joined footer line.
    return render().then((html) => {
      const row = html.match(/<li data-match-row[\s\S]*?<\/li>/)?.[0] ?? "";
      expect(row).not.toBe("");
      expect(row).toContain("MS SF1");
      expect(row).toContain("10:30");
      expect(row).toContain("Court 1");
      expect(row).toContain("MS · Semifinals");
      expect(html).not.toContain("MS SF1 · Scheduled 10:30 · Court 1");
      expect(html).not.toMatch(/>Match \d/);
      // The column header aligns with the rows and is decoration.
      expect(html).toMatch(/aria-hidden="true" class="hidden [^"]*md:grid[^"]*"[^>]*>[\s\S]*?Time · court/);
      // No card grid remains in the main listing.
      expect(html).not.toContain('data-match-variant="card"');
    });
  });

  it("renders the games beside each side, and the running points of a live game in play", async () => {
    const running = {
      ...MATCHES,
      items: [{ ...MATCHES.items[0], score: null, liveScore: [15, 12] }],
    };
    const html = await render("/e/spring-open/schedule", running);
    const cells = [...html.matchAll(/data-live-score[^>]*>(\d+)</g)].map((m) => m[1]);
    expect(cells).toEqual(["15", "12"]);
    expect(html).toContain("In play 15\u201312");
    // With recorded games the ledger, not the running figure, is shown.
    const withGames = await render();
    expect(withGames).not.toContain("data-live-score");
    expect(withGames).toMatch(/text-right text-foreground">21</);
    expect(withGames).toMatch(/text-right text-foreground">19</);
    // A live match with no score of any kind invents none.
    const bare = await render("/e/spring-open/schedule", {
      ...MATCHES,
      items: [{ ...MATCHES.items[0], score: null }],
    });
    expect(bare).not.toContain("data-live-score");
    expect(bare).toMatch(/text-status-live">On court/);
  });

  it("makes no promise to update scores it cannot update", async () => {
    // The tier ships no client framework and no polling; the document is
    // what the server rendered. The freshness line below the list is the
    // honest version of the same idea.
    const html = await render();
    expect(html).not.toContain("Scores update");
    expect(html).toContain("Updated ");
  });

  it("never calls a courtless live record \"On court\"", async () => {
    const html = await render("/e/spring-open/schedule", {
      ...MATCHES,
      items: [{ ...MATCHES.items[0], court: null }],
      facets: { ...MATCHES.facets, courts: [] },
    });
    // §4.2: an absent court is an absent claim. The band still says the
    // group is live; the CARD makes no assertion it cannot support. (The
    // state filter's own <option> still spells the state — that is a
    // control naming a filter value, not a claim about this match.)
    expect(html).toContain("Live now");
    expect(html).not.toMatch(/text-status-live">On court/);
    expect(html).not.toContain("Court null");
    // Positive control: with a court approved, the card says both.
    const withCourt = await render();
    expect(withCourt).toMatch(/text-status-live">On court/);
    expect(withCourt).toContain("Court 1");
  });

  it("takes the winner from the authoritative outcome, never from the ledger", async () => {
    // §5.1 rule 3: a retirement's ledger routinely favours the side that
    // did NOT win. Counting games — what this adapter used to do — gets it
    // exactly backwards, and the wire now carries the real answer.
    const retired = {
      ...MATCHES,
      items: [
        {
          ...MATCHES.items[0],
          status: "retired",
          score: [[21, 15], [3, 11]],
          winnerSide: "A",
        },
      ],
      facets: { ...MATCHES.facets, states: ["retired"] },
    };
    const html = await render("/e/spring-open/schedule", retired);
    expect(html).toMatch(/Winner: <\/span>[\s\S]{0,400}Ada Lovelace/);
    // The exceptional outcome reads as one small leading cue.
    expect(html).toContain("Retired");
  });

  it("sends URL-backed filters to the public matches projection", async () => {
    const fetchMock = vi.fn(async (request: Request | string) => {
      const url = typeof request === "string" ? request : request.url;
      const body = url.includes("/matches") ? MATCHES : PAGE;
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    await loader({
      request: new Request(
        "http://entrant.test/e/spring-open/schedule?day=2026-09-12&event=MS&player=Ada%20Lovelace&court=1&state=live&page=2",
      ),
      params: { slug: "spring-open" },
    });
    const matchesRequest =
      fetchMock.mock.calls
        .map(([request]) => String(request))
        .find((url) => url.includes("/matches?")) ?? "";
    expect(matchesRequest).toContain("day=2026-09-12");
    expect(matchesRequest).toContain("event=MS");
    expect(matchesRequest).toContain("player=Ada+Lovelace");
    expect(matchesRequest).toContain("court=1");
    expect(matchesRequest).toContain("state=live");
    expect(matchesRequest).toContain("page=2");
  });

  it("keeps filters while switching to the court queue", async () => {
    const html = await render(
      "/e/spring-open/schedule?day=2026-09-12&event=MS&player=Ada%20Lovelace&court=1&state=live&organization=court",
    );
    expect(html).toContain("By court");
    expect(html).toContain("organization=court");
    expect(html).toContain("Court 1");
  });

  // ---- public-visual-fixes P7 -----------------------------------------

  it("puts the days, the organisation, the search and the filters in ONE sticky band", async () => {
    const html = await render();
    const row =
      html.match(/<div class="sticky top-0[\s\S]*?<\/form>/)?.[0] ?? "";
    expect(row).not.toBe("");
    // The controls the critique asked for, in that order, in one band: the
    // days on their own single-row strip (short labels, a count each), then
    // the organisation, the search and the secondary filters.
    expect(row).toContain('aria-label="Schedule days"');
    expect(row).toMatch(/Sat 12 Sep<span class="ms-2 tabular-nums[^"]*">1</);
    expect(row).not.toContain("Saturday, September 12 · 1 match");
    expect(row.indexOf('aria-label="Schedule days"')).toBeLessThan(row.indexOf('aria-label="Schedule organization"'));
    expect(row.indexOf('aria-label="Schedule organization"')).toBeLessThan(row.indexOf('name="player"'));
    // The secondary filters are a disclosure that is OPEN in the document
    // (a reader without script sees them; the script closes it on a phone
    // when none is active) and inline from md: up (summary hidden).
    expect(row).toMatch(/<details data-schedule-more="true" open=""/);
    expect(row).toMatch(/<summary[^>]*md:hidden[^>]*>[\s\S]*?Filters/);
    expect(row).not.toContain("More filters");
    expect(row).toContain('name="event"');
    expect(row).toContain('name="court"');
    expect(row).toContain('name="state"');
    // An active secondary filter is counted in the summary label.
    const active = await render("/e/spring-open/schedule?event=MS&state=live");
    expect(active).toContain("Filters · 2");
    // Exactly one control card: the old day/organisation band plus filter
    // grid was two stacked panels.
    expect(html.match(/data-schedule-filters/g)).toHaveLength(1);
  });

  it("submits natively on Enter and keeps the other active filters in the URL", async () => {
    const html = await render(
      "/e/spring-open/schedule?day=2026-09-12&organization=court&event=MS",
    );
    const form = html.match(/<form[^>]*data-schedule-filters[\s\S]*?<\/form>/)?.[0] ?? "";
    expect(form).not.toBe("");
    expect(form).toMatch(/action="\/e\/spring-open\/schedule"[^>]*method="get"/);
    // The state a search must not silently drop travels as hidden fields.
    expect(form).toContain('<input type="hidden" name="organization" value="court"/>');
    expect(form).toContain('<input type="hidden" name="day" value="2026-09-12"/>');
    // The typed query survives the round trip in the field itself.
    expect(form).toContain('name="event"');
  });

  it("has no visible Apply or Find button — the submits are sr-only", async () => {
    const html = await render();
    expect(html).not.toMatch(/>\s*Apply\s*<\/button>/);
    expect(html).not.toMatch(/>\s*Find\s*<\/button>/);
    expect(html).toMatch(/<button type="submit" class="sr-only">Search matches<\/button>/);
    expect(html).toMatch(/<button type="submit" class="sr-only">Apply filters<\/button>/);
    // The search field carries a real, associated label and a magnifier.
    expect(html).toMatch(/<label for="schedule-player" class="sr-only">Search matches by player<\/label>/);
  });

  it("changes the day and the view without JavaScript, and enhances the selects", async () => {
    const html = await render();
    // Days and organisation are LINKS — a full document load, no script.
    expect(html).toMatch(/<a href="\/e\/spring-open\/schedule\?day=2026-09-12"/);
    expect(html).toContain("organization=court");
    // The enhancement is one page-scoped module, and it is additive.
    expect(html).toContain('src="/e/assets/schedule-filters.js"');
  });

  it("falls back to a native day SELECT once the run of days is long or gappy", async () => {
    const days = [
      "2026-09-12", "2026-09-13", "2026-09-14",
      "2026-10-01", "2026-10-02", "2026-11-20",
    ].map((day) => ({ day, count: 2 }));
    const html = await render("/e/spring-open/schedule", {
      ...MATCHES,
      facets: { ...MATCHES.facets, days },
    });
    // The month-grouped block of dozens of anchors this replaces could not
    // live in one row; a select can, and it still needs no script (the
    // sr-only submit applies it).
    expect(html).toMatch(/<select id="schedule-day" name="day"/);
    expect(html).toMatch(/<label class="sr-only" for="schedule-day">Day<\/label>/);
    expect(html).toContain('value="2026-11-20"');
    expect(html).not.toContain('aria-label="Schedule days"');
  });

  it("drops the trailing arrows from pagination", async () => {
    const html = await render("/e/spring-open/schedule", {
      ...MATCHES,
      total: 60,
      pageSize: 25,
    });
    expect(html).toContain(">Next</a>");
    expect(html).not.toContain("Next →");
    expect(html).not.toContain("← Previous");
  });

  it("explains an unpublished and an empty schedule", async () => {
    const unpublished = await render("/e/spring-open/schedule", {
      ...MATCHES,
      published: false,
      items: [],
      total: 0,
    });
    expect(unpublished).toContain("Schedule is not published yet");
    const empty = await render("/e/spring-open/schedule?state=cancelled", {
      ...MATCHES,
      items: [],
      total: 0,
    });
    expect(empty).toContain("No matches found");
    expect(empty).toContain("Clear filters");
  });
});

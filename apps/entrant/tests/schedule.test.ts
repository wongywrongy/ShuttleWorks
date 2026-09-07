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
    // Converted, not merely stripped: 10:35 UTC is 19:35 in Seoul.
    expect(formatted).toContain("Sep 12, 2026, 7:35 PM");
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
    // Plan §4: the page title matches its navigation destination ("Schedule"),
    // not a slash-assembled compound.
    // v3-consolidated work package 26b: `h2`, not `h1` — `HeroHeader`
    // already renders the document's one `<h1 id="tournament-title">`
    // (the tournament name); a second `h1` here failed the plan §6
    // "Accessibility" heading-order check. `tournament.tsx`'s own panel
    // headings (`Overview`, `Draws`) were already `h2`; this brings
    // Schedule in line with that convention.
    expect(html).toMatch(/<h2[^>]*id="schedule-title"[^>]*>\s*Schedule\s*<\/h2>/);
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

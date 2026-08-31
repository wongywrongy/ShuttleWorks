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
import { loader } from "../app/routes/schedule";

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
    expect(html).toContain("Schedule / Live");
    expect(html).toContain("Live now");
    expect(html).toContain("Ada Lovelace");
    expect(html).toContain("Grace Hopper");
    expect(html).toContain("Court 1");
    expect(html).toContain("Asia/Seoul");
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

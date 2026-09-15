/**
 * Contract §10 (Scheduling row): `MatchCard` renders no time, date or court
 * line when the corresponding field is null — no "Time not assigned",
 * "Date to be confirmed", "Court information unavailable", "Court pending"
 * anywhere in the tree — and the schedule domain's public state is exactly
 * one of "Scheduled" / "Time to be confirmed" (`.ts`, not `.tsx`: see the
 * deviation note in `entry.render.test.ts` — this package's vitest include
 * only takes `tests/**\/*.ts`, so `createElement` stands in for JSX).
 */
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { MatchCard } from "../app/components/MatchCard";
import { pageNumbers } from "../app/routes/schedule";
import {
  schedulePublicState,
  schedulePublicStateLabel,
  scheduleStateLabel,
} from "../app/lib/schedule.types";

const BANNED = [
  "Time not assigned",
  "Date to be confirmed",
  "Court information unavailable",
  "Court not assigned",
  "Court pending",
];

const baseMatch = {
  eventCode: "MS",
  roundLabel: "Round 1",
  sides: [
    { persons: [], placeholder: "Player A", winner: false },
    { persons: [], placeholder: "Player B", winner: false },
  ],
  score: null,
  decided: false,
  scheduledTime: null as string | null,
  court: null as number | null,
  status: "scheduled" as const,
  durationMinutes: null,
  updatedAt: null,
};

describe("schedulePublicState", () => {
  it("is 'scheduled' exactly when an approved time exists, independent of the sides", () => {
    expect(schedulePublicState({ scheduledTime: "14:00" })).toBe("scheduled");
    expect(schedulePublicState({ scheduledTime: null })).toBe("time_tbc");
  });

  it("has exactly two labels and no third spelling", () => {
    expect(schedulePublicStateLabel("scheduled")).toBe("Scheduled");
    expect(schedulePublicStateLabel("time_tbc")).toBe("Time to be confirmed");
  });
});

describe("scheduleStateLabel", () => {
  it("renders no label for an unrecognised status (contract §2.2)", () => {
    expect(scheduleStateLabel(null)).toBeNull();
    expect(scheduleStateLabel(undefined)).toBeNull();
  });
});

describe("MatchCard schedule rendering — no placeholder apology", () => {
  it("shows no time, date, or court line, and never a banned placeholder string, when every field is null", () => {
    const html = renderToStaticMarkup(
      h(MatchCard, { match: baseMatch, slug: "spring-open" }),
    );
    for (const phrase of BANNED) {
      expect(html).not.toContain(phrase);
    }
    expect(html).toContain("Time to be confirmed");
    expect(html).not.toContain("Court ");
  });

  it("omits only the court line when the time is approved", () => {
    const html = renderToStaticMarkup(
      h(MatchCard, {
        match: { ...baseMatch, scheduledTime: "09:00" },
        slug: "spring-open",
      }),
    );
    expect(html).toContain("09:00");
    expect(html).not.toContain("Time to be confirmed");
    expect(html).not.toContain("Court ");
    for (const phrase of BANNED) {
      expect(html).not.toContain(phrase);
    }
  });

  it("shows the real court once approved", () => {
    const html = renderToStaticMarkup(
      h(MatchCard, {
        match: { ...baseMatch, scheduledTime: "09:00", court: 5 },
        slug: "spring-open",
      }),
    );
    expect(html).toContain("Court 5");
  });

  it("renders no state chip and no schedule-state word for an unrecognised status", () => {
    const html = renderToStaticMarkup(
      h(MatchCard, {
        match: { ...baseMatch, status: null },
        slug: "spring-open",
      }),
    );
    expect(html).not.toContain("Scheduled");
    expect(html).not.toContain("Called");
    expect(html).not.toContain("Live now");
    expect(html).not.toContain("Completed");
    expect(html).not.toContain("Retired");
  });

  it("never upgrades a called match to a live/on-court reading", () => {
    const html = renderToStaticMarkup(
      h(MatchCard, {
        match: { ...baseMatch, status: "called" as const },
        slug: "spring-open",
      }),
    );
    expect(html).toContain("Called");
    expect(html).not.toContain("Live now");
  });
});

// ---- B-19: the numbered page window ---------------------------------------

describe("pageNumbers", () => {
  it("renders nothing at all for a single page", () => {
    // A paginator for one page is furniture.
    expect(pageNumbers(1, 1)).toEqual([]);
    expect(pageNumbers(1, 0)).toEqual([]);
  });

  it("lists every page contiguously while they fit the window", () => {
    expect(pageNumbers(1, 5).map((entry) => entry.page)).toEqual([1, 2, 3, 4, 5]);
    expect(pageNumbers(1, 5).some((entry) => entry.gapBefore)).toBe(false);
  });

  it("keeps first, last and the current page with two either side", () => {
    expect(pageNumbers(10, 40).map((entry) => entry.page)).toEqual([
      1, 8, 9, 10, 11, 12, 40,
    ]);
  });

  it("clamps the run at the ends rather than shrinking it", () => {
    // `current ± 2` trimmed at the edge gave "1 2 3 | 40" on page one — a
    // gap mark whose whole job was hiding pages 4 and 5.
    expect(pageNumbers(1, 40).map((entry) => entry.page)).toEqual([1, 2, 3, 4, 5, 40]);
    expect(pageNumbers(40, 40).map((entry) => entry.page)).toEqual([
      1, 36, 37, 38, 39, 40,
    ]);
  });

  it("marks exactly the entries that do not follow their predecessor", () => {
    // The mark is drawn as a rule rather than an ellipsis: this tier's
    // no-truncation contract bans the character, and a page list is not a
    // value somebody cut.
    expect(
      pageNumbers(10, 40)
        .filter((entry) => entry.gapBefore)
        .map((entry) => entry.page),
    ).toEqual([8, 40]);
  });

  it("stays bounded however many pages there are", () => {
    // The whole point: a seven-page day and a seven-hundred-page one render
    // the same amount of chrome, so the row never wraps on a phone.
    expect(pageNumbers(350, 700).length).toBeLessThanOrEqual(7);
    expect(pageNumbers(1, 700).length).toBeLessThanOrEqual(7);
    expect(pageNumbers(700, 700).length).toBeLessThanOrEqual(7);
  });

  it("never names a page outside the range", () => {
    for (const entry of pageNumbers(1, 3)) {
      expect(entry.page).toBeGreaterThanOrEqual(1);
      expect(entry.page).toBeLessThanOrEqual(3);
    }
  });
});

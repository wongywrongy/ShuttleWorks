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

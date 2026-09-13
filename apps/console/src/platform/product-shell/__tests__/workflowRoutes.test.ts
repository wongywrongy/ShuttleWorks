import { describe, expect, it } from "vitest";
import {
  WORKFLOW_ROUTES,
  buildWorkflowNavigation,
  workflowHref,
  workflowPathForSegment,
  workflowRouteForPath,
  workflowSectionOfPath,
} from "../workspaceNav";
import { MODULE_LABELS } from "../types";

describe("workflow-first workspace route registry", () => {
  it("contains every approved top-level workflow section", () => {
    const sections = new Set(WORKFLOW_ROUTES.map((route) => route.section));
    expect([...sections]).toEqual([
      "overview",
      "setup",
      "participants",
      "meet",
      "bracket",
      "operations",
      "display",
      "administration",
    ]);
  });

  it("keeps shared paths adaptive to the tournament engine", () => {
    expect(workflowRouteForPath("setup/details", "bracket")?.tab).toBe("setup");
    expect(workflowRouteForPath("participants/people", "meet")?.tab).toBe(
      "roster",
    );
    expect(workflowRouteForPath("participants/people", "bracket")?.tab).toBe(
      "bracket-roster",
    );
    expect(workflowRouteForPath("operations/live", "meet")?.tab).toBe("live");
    expect(workflowRouteForPath("operations/live", "bracket")?.tab).toBe(
      "bracket-live",
    );
  });

  it("gives each engine its own matches destination", () => {
    expect(workflowRouteForPath("meet/matches")?.tab).toBe("matches");
    expect(workflowRouteForPath("bracket/matches")?.tab).toBe("bracket-matches");
    expect(workflowPathForSegment("matches")).toBe("meet/matches");
    expect(workflowPathForSegment("bracket-matches")).toBe("bracket/matches");
  });

  it("maps existing destinations to stable organizer-facing URLs", () => {
    expect(workflowPathForSegment("setup")).toBe("setup/details");
    expect(workflowPathForSegment("bracket-setup")).toBe("bracket/settings");
    expect(workflowPathForSegment("bracket-draw")).toBe("bracket/draw");
    expect(workflowPathForSegment("ws-modules")).toBe("administration/modules");
    expect(workflowPathForSegment("ws-sharing")).toBe("setup/public-site");
    expect(workflowPathForSegment("display-config")).toBe("display/board");
    expect(workflowHref("spring finals", "schedule")).toBe(
      "/tournaments/spring%20finals/operations/plan",
    );
  });

  it("keeps the selected draw inside Bracket without adding a duplicate rail item", () => {
    const nav = buildWorkflowNavigation("bracket", new Set(["bracket"]));
    expect(workflowRouteForPath("bracket/draw", "bracket")?.tab).toBe(
      "bracket-draw",
    );
    expect(workflowSectionOfPath(nav, "bracket/draw")).toBe("bracket");
    expect(
      nav.sections
        .find((section) => section.id === "bracket")
        ?.items.map((row) => row.label),
    ).toEqual(["Draws", "Matches", "Draw settings"]);
  });

  it("returns null for paths outside the canonical registry", () => {
    expect(workflowRouteForPath("unknown/thing")).toBeNull();
  });

  it("uses the requested section vocabulary in the visible rail", () => {
    const nav = buildWorkflowNavigation(
      "meet",
      new Set(["meet", "entries", "display"]),
    );
    expect(nav.sections.map((section) => section.label)).toEqual([
      "Setup",
      "Participants",
      "Meet",
      "Operations",
      "Display",
    ]);
    expect(nav.admin.label).toBe("Settings");
    expect(nav.sections.map((section) => section.label)).not.toContain(
      "Competition",
    );
    expect(nav.sections.map((section) => section.label)).not.toContain(
      "Publish",
    );
  });

  it("consolidates Setup into four destinations and no checklist page", () => {
    const nav = buildWorkflowNavigation("meet", new Set(["meet"]));
    const setup = nav.sections.find((section) => section.id === "setup");
    expect(setup?.items.map((row) => row.label)).toEqual([
      "Details",
      "Entries",
      "Scoring",
      "Public site",
    ]);
    expect(setup?.items.map((row) => row.path)).toEqual([
      "setup/details",
      "setup/entries",
      "setup/scoring",
      "setup/public-site",
    ]);
    // Overview owns the readiness checklist, once.
    expect(workflowRouteForPath("setup")).toBeNull();
  });

  it("does not strand a Meet workspace behind a Bracket-only section", () => {
    const meet = buildWorkflowNavigation("meet", new Set(["meet"]));
    expect(meet.sections.map((section) => section.id)).toContain("meet");
    expect(meet.sections.map((section) => section.id)).not.toContain("bracket");
    const hybrid = buildWorkflowNavigation(
      "meet",
      new Set(["meet", "bracket"]),
    );
    expect(hybrid.sections.map((section) => section.id)).toEqual(
      expect.arrayContaining(["meet", "bracket"]),
    );
  });

  it("has no compatibility aliases outside the canonical route registry", () => {
    for (const legacy of ["setup/general", "competition/matches", "publish/site", "bracket"]) {
      expect(workflowRouteForPath(legacy)).toBeNull();
    }
  });

  it("uses workflow ownership instead of per-item module badges", () => {
    const nav = buildWorkflowNavigation(
      "meet",
      new Set(["meet", "bracket", "entries", "display"]),
    );
    const rows = nav.sections.flatMap((section) => section.items);
    expect(rows.every((row) => !("module" in row))).toBe(true);
    expect(nav.sections.find((section) => section.id === "operations")?.label).toBe(
      MODULE_LABELS.operations,
    );
    expect(
      nav.sections
        .find((section) => section.id === "operations")
        ?.items.map((row) => row.path),
    ).toEqual(["operations/plan", "operations/live"]);
  });

  it("gives every visible category and child a concrete destination", () => {
    const nav = buildWorkflowNavigation(
      "bracket",
      new Set(["bracket", "display", "entries"]),
    );
    expect(nav.sections.every((section) => section.items.length > 0)).toBe(true);
    expect(nav.sections.every((section) => section.items[0]?.path)).toBe(true);
    expect(nav.sections.flatMap((section) => section.items).every((row) => row.path)).toBe(true);
    expect(nav.admin.items.every((row) => row.path)).toBe(true);
  });

  it("does not advertise duplicate routes as separate destinations", () => {
    const nav = buildWorkflowNavigation(
      "bracket",
      new Set(["bracket", "entries"]),
    );
    const labels = nav.sections.flatMap((section) =>
      section.items.map((row) => row.label),
    );
    expect(labels).not.toContain("Partners and pairs");
    expect(labels).not.toContain("Eligibility and payment");
    expect(labels).not.toContain("Results and corrections");
    expect(labels).not.toContain("Checklist");
  });
});

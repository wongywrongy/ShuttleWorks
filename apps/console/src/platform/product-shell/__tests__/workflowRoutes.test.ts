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
      "competition",
      "operations",
      "publish",
      "administration",
    ]);
  });

  it("keeps shared paths adaptive to the tournament engine", () => {
    expect(workflowRouteForPath("setup/venue", "bracket")?.tab).toBe("setup");
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
    expect(workflowRouteForPath("competition/draws", "meet")?.tab).toBe(
      "bracket-draws",
    );
  });

  it("maps existing destinations to stable organizer-facing URLs", () => {
    expect(workflowPathForSegment("bracket-setup")).toBe("setup/general");
    expect(workflowPathForSegment("bracket-draw")).toBe("competition/draw");
    expect(workflowPathForSegment("ws-modules")).toBe("administration/modules");
    expect(workflowHref("spring finals", "schedule")).toBe(
      "/tournaments/spring%20finals/operations/plan",
    );
  });

  it("keeps the selected draw inside Competition without adding a duplicate rail item", () => {
    const nav = buildWorkflowNavigation("bracket", new Set(["bracket"]));
    expect(workflowRouteForPath("competition/draw", "bracket")?.tab).toBe(
      "bracket-draw",
    );
    expect(workflowSectionOfPath(nav, "competition/draw")).toBe("competition");
    expect(
      nav.sections
        .find((section) => section.id === "competition")
        ?.items.map((row) => row.label),
    ).toEqual(["Draws", "Matches"]);
  });

  it("returns null for paths outside the canonical registry", () => {
    expect(workflowRouteForPath("unknown/thing")).toBeNull();
  });

  it("uses the stable operator workflow in the visible rail", () => {
    const nav = buildWorkflowNavigation(
      "meet",
      new Set(["meet", "entries", "display"]),
    );
    expect(nav.sections.map((section) => section.label)).toEqual([
      "Setup",
      "Participants",
      "Competition",
      "Operations",
      "Publish",
    ]);
    expect(nav.admin.label).toBe("Administration");
    expect(
      nav.sections
        .find((section) => section.id === "operations")
        ?.items.map((row) => row.label),
    ).toEqual(["Plan", "Live day"]);
  });

  it("adapts tools inside workflows without changing the workflow labels", () => {
    const meet = buildWorkflowNavigation("meet", new Set(["meet"]));
    const bracket = buildWorkflowNavigation("bracket", new Set(["bracket"]));
    expect(meet.sections.map((section) => section.label)).toEqual(
      bracket.sections.map((section) => section.label),
    );
    expect(
      meet.sections
        .find((section) => section.id === "participants")
        ?.items.map((row) => row.label),
    ).toEqual(["Roster"]);
    expect(
      bracket.sections
        .find((section) => section.id === "participants")
        ?.items.map((row) => row.label),
    ).toEqual(["Roster"]);
    expect(
      bracket.sections
        .find((section) => section.id === "competition")
        ?.items.map((row) => row.label),
    ).toEqual(["Draws", "Matches"]);
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
  });
});

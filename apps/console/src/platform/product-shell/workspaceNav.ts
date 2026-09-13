/**
 * The workspace left-sidebar navigation model — the single source of truth for
 * the workflow-first IA: Setup, Participants, Meet, Bracket, Operations,
 * Display, and Settings, with Overview as the workspace landing.
 * Enabled modules adapt the tools within those stable categories.
 *
 * Competition and Publish are gone as visible categories: a match belongs to
 * the engine that produced it (Meet or Bracket), and publication belongs
 * beside the public content it governs (Setup · Public site) or beside the
 * board it drives (Display). Module identity is shown in the catalog and in
 * operational data where provenance matters; the workflow rail stays focused
 * on the operator's task rather than repeating implementation badges.
 *
 * Canonical workflow URLs stay separate from the AppTab render keys. That
 * separation lets surfaces move without coupling the URL to renderer names.
 */
import type { AppTab } from "../../store/uiStore";
import { MODULE_LABELS, type ModuleId } from "./types";

export type WsKind = "meet" | "bracket" | null;
/** The architectural anatomy: intake → engine → emit. `intake` is new with
 *  Entries (SP-E1-1). Reusing `shared` would have been cheaper and would have
 *  lied — Operations is shared *between* the engines; Entries feeds them.
 *  Model-only since G2: the sidebar badge is gone; the taxonomy reads out in
 *  the Modules catalog descriptions. */
export type SectionRole = "intake" | "engine" | "shared" | "output";

export interface WsNavItem {
  segment: AppTab;
  label: string;
  /** Canonical organizer-facing path. Omitted by the legacy module-contract
   * model; required by the workflow navigation model. */
  path?: string;
  /** Extra paths this item OWNS in the rail. A destination that carries its
   * own internal tabs (Settings · Workspace: settings, backups, the
   * activity log) is one rail item over several URLs; without this the rail
   * would show no active item on two of its own tabs. */
  matchPaths?: readonly string[];
}
export interface WsSection {
  id: "entries" | "meet" | "bracket" | "operations" | "display";
  label: string;
  role: SectionRole;
  items: WsNavItem[];
}
export interface WorkspaceNav {
  overview: WsNavItem;
  sections: WsSection[];
  admin: { label: string; items: WsNavItem[] };
}

export interface WorkflowNavSection {
  id: Exclude<WorkflowSection, "overview" | "administration">;
  label: string;
  items: WsNavItem[];
}

export interface WorkflowNavigation {
  overview: WsNavItem;
  sections: WorkflowNavSection[];
  admin: { label: string; items: WsNavItem[] };
}

/** The stable, organizer-facing route vocabulary. `tab` is deliberately an
 * implementation detail: it is the existing surface that renders for the
 * route until each Setup/Participants/Competition slice is rebuilt. */
export type WorkflowSection =
  | "overview"
  | "setup"
  | "participants"
  | "meet"
  | "bracket"
  | "operations"
  | "display"
  | "administration";

export interface WorkflowRoute {
  path:
    `${WorkflowSection}` | `${Exclude<WorkflowSection, "overview">}/${string}`;
  section: WorkflowSection;
  tab: AppTab;
  /** Renderer override for the bracket engine when a shared workflow path
   *  points at a module-specific legacy surface. */
  bracketTab?: AppTab;
  /** A hint used before the tournament summary has loaded. */
  kind?: "meet" | "bracket";
}

/**
 * Canonical paths are intentionally data, not scattered strings in buttons.
 * This list is the SURFACE inventory: one entry per destination an operator
 * can actually land on. This is the sole source of truth for workspace URLs.
 *
 * Several paths share a legacy renderer (the four Setup pages all mount
 * `SetupProduct`, which selects its own consolidated page from the URL).
 */
export const WORKFLOW_ROUTES: readonly WorkflowRoute[] = [
  { path: "overview", section: "overview", tab: "overview" },
  // Four Setup destinations, one per job. The readiness checklist is NOT one
  // of them: Overview owns it, once.
  { path: "setup/details", section: "setup", tab: "setup" },
  { path: "setup/entries", section: "setup", tab: "setup" },
  { path: "setup/scoring", section: "setup", tab: "setup" },
  { path: "setup/public-site", section: "setup", tab: "setup" },
  { path: "participants/entries", section: "participants", tab: "entries" },
  {
    path: "participants/people",
    section: "participants",
    tab: "roster",
    bracketTab: "bracket-roster",
  },
  // Meet-specific destinations. A Meet workspace must never reach its own
  // matches through a Bracket-guarded route.
  { path: "meet/matches", section: "meet", tab: "matches", kind: "meet" },
  {
    path: "meet/team-structure",
    section: "meet",
    tab: "roster",
    kind: "meet",
  },
  {
    path: "bracket/draws",
    section: "bracket",
    tab: "bracket-draws",
    kind: "bracket",
  },
  // The selected draw is opened from the Draws table, so it does not need a
  // second rail item. It does need a canonical workflow route: otherwise the
  // canvas falls back to the legacy module URL and Bracket loses context.
  {
    path: "bracket/draw",
    section: "bracket",
    tab: "bracket-draw",
    kind: "bracket",
  },
  {
    path: "bracket/matches",
    section: "bracket",
    tab: "bracket-matches",
    kind: "bracket",
  },
  // Event definitions, draw format and draw size live here (moved out of
  // Setup): they are structural properties of the draws this section owns.
  {
    path: "bracket/settings",
    section: "bracket",
    tab: "bracket-setup",
    kind: "bracket",
  },
  {
    path: "operations/plan",
    section: "operations",
    tab: "schedule",
    bracketTab: "bracket-schedule",
  },
  {
    path: "operations/live",
    section: "operations",
    tab: "live",
    bracketTab: "bracket-live",
  },
  // Venue-board configuration and its links (moved out of Publish).
  { path: "display/board", section: "display", tab: "display-config" },
  { path: "display/preview", section: "display", tab: "tv" },
  { path: "administration/team", section: "administration", tab: "ws-members" },
  {
    path: "administration/modules",
    section: "administration",
    tab: "ws-modules",
  },
  { path: "administration/backups", section: "administration", tab: "ws-sync" },
  {
    path: "administration/activity",
    section: "administration",
    tab: "ws-sync",
  },
  {
    path: "administration/lifecycle",
    section: "administration",
    tab: "ws-settings",
  },
] as const;

const WORKFLOW_BY_PATH = new Map<string, WorkflowRoute>(
  WORKFLOW_ROUTES.map((route) => [route.path, route]),
);

/** Resolve a trailing workspace path to the current renderer. Kind-specific
 * routes retain their renderer on a mismatched workspace so the normal module
 * guard can explain that the capability is unavailable; routing to a generic
 * 404 would hide the actionable resolution. */
export function workflowRouteForPath(
  path: string,
  kind: WsKind = null,
): WorkflowRoute | null {
  const route = WORKFLOW_BY_PATH.get(path);
  if (!route) return null;
  if (kind === "bracket" && route.bracketTab)
    return { ...route, tab: route.bracketTab };
  return route;
}

/** Organizer-facing URL for a nav destination. The AppTab is not exposed in
 * links, so internal renderer renames do not invalidate operator bookmarks. */
export function workflowPathForSegment(segment: AppTab): string {
  const route = WORKFLOW_ROUTES.find(
    (candidate) => candidate.tab === segment || candidate.bracketTab === segment,
  );
  if (route) return route.path;

  // These renderer keys are deliberate aliases inside shared products, not
  // additional URLs. They have no standalone WorkflowRoute because they are
  // rendered by an existing canonical destination.
  const rendererDefaults: Partial<Record<AppTab, string>> = {
    "bracket-events": "bracket/draws",
    "ws-venue": "setup/details",
    "ws-sharing": "setup/public-site",
  };
  const fallback = rendererDefaults[segment];
  if (fallback) return fallback;
  throw new Error(`No canonical workflow route for renderer tab: ${segment}`);
}

export function workflowHref(tid: string, segment: AppTab): string {
  return `/tournaments/${encodeURIComponent(tid)}/${workflowPathForSegment(segment)}`;
}

export function workflowItemHref(tid: string, item: WsNavItem): string {
  return `/tournaments/${encodeURIComponent(tid)}/${item.path ?? workflowPathForSegment(item.segment)}`;
}

const item = (
  path: string,
  segment: AppTab,
  label: string,
  matchPaths?: readonly string[],
): WsNavItem => ({
  path,
  segment,
  label,
  ...(matchPaths ? { matchPaths } : {}),
});

/** Stable operator navigation. Capabilities change the tools listed inside a
 * workflow, never the organizer's top-level mental model. The older
 * `buildWorkspaceNav` remains below as an architectural module-ownership
 * projection; it is no longer the visible rail. */
export function buildWorkflowNavigation(
  kind: WsKind,
  enabled: Set<ModuleId>,
): WorkflowNavigation {
  const bracketPrimary =
    kind === "bracket" || (!enabled.has("meet") && enabled.has("bracket"));
  const peopleTab: AppTab = bracketPrimary ? "bracket-roster" : "roster";
  const participants: WsNavItem[] = [];
  if (enabled.has("entries")) {
    participants.push(
      item("participants/entries", "entries", MODULE_LABELS.entries),
    );
  }
  // One link per distinct surface. Pairs, teams, eligibility, and payments
  // remain tools inside Roster / Entries until they own an actual view;
  // separate labels that render the same page create false destinations.
  participants.push(item("participants/people", peopleTab, "Roster"));

  const sections: WorkflowNavSection[] = [
    {
      id: "setup",
      label: "Setup",
      items: [
        item("setup/details", "setup", "Details"),
        item("setup/entries", "setup", "Entries"),
        item("setup/scoring", "setup", "Scoring"),
        item("setup/public-site", "setup", "Public site"),
      ],
    },
    { id: "participants", label: "Participants", items: participants },
  ];

  // Each engine lists its OWN destinations. A hybrid workspace gets both, so
  // Meet-only work is never reachable only through a Bracket-guarded route.
  if (enabled.has("meet")) {
    sections.push({
      id: "meet",
      label: MODULE_LABELS.meet,
      // D4/O5: "Team structure" rendered the SAME component as Participants ·
      // Roster — identity, positions and lineup are one screen — which is the
      // false destination this file's own rule above forbids. The rail lists
      // it once; `meet/team-structure` stays a valid route, so bookmarks and
      // the surface book's alias still land on it.
      items: [item("meet/matches", "matches", "Matches")],
    });
  }
  if (enabled.has("bracket")) {
    sections.push({
      id: "bracket",
      label: MODULE_LABELS.bracket,
      items: [
        item("bracket/draws", "bracket-draws", "Draws"),
        item("bracket/matches", "bracket-matches", "Matches"),
        item("bracket/settings", "bracket-setup", "Draw settings"),
      ],
    });
  }

  sections.push({
    id: "operations",
    label: MODULE_LABELS.operations,
    items: [
      item("operations/plan", bracketPrimary ? "bracket-schedule" : "schedule", "Plan"),
      item("operations/live", bracketPrimary ? "bracket-live" : "live", "Live day"),
    ],
  });

  if (enabled.has("display")) {
    sections.push({
      id: "display",
      label: MODULE_LABELS.display,
      items: [
        item("display/board", "display-config", "Board"),
        item("display/preview", "tv", "Preview"),
      ],
    });
  }

  return {
    overview: item("overview", "overview", "Overview"),
    sections,
    admin: {
      // "Settings" (D2): the section was called Administration while every
      // other surface, the header action and the Hub's row menu called the
      // same destination settings. Routes are unchanged — the /administration
      // prefix stays, so old bookmarks still land.
      label: "Settings",
      // Three destinations: Team · Modules · Workspace. Backups and the
      // activity log are not separate administrations — they are things you
      // look at ABOUT this workspace, so they are tabs inside Workspace
      // (which also owns archive/delete). Their URLs are unchanged, so old
      // bookmarks land on exactly the tab they named.
      items: [
        item("administration/team", "ws-members", "Team"),
        item("administration/modules", "ws-modules", "Modules"),
        item("administration/lifecycle", "ws-settings", "Workspace", [
          "administration/backups",
          "administration/activity",
        ]),
      ],
    },
  };
}

export function workflowSectionOfPath(
  nav: WorkflowNavigation,
  path: string,
): WorkflowNavSection["id"] | null {
  const registered = WORKFLOW_BY_PATH.get(path)?.section;
  if (
    registered &&
    registered !== "overview" &&
    registered !== "administration" &&
    nav.sections.some((section) => section.id === registered)
  ) {
    return registered;
  }
  return (
    nav.sections.find((section) =>
      section.items.some((navItem) => navItem.path === path),
    )?.id ?? null
  );
}

/** Admin (WORKSPACE) segments — also drive the top-bar gear "active" indicator. */
const ADMIN_SEGMENTS: ReadonlySet<AppTab> = new Set<AppTab>([
  "ws-venue",
  "ws-members",
  "ws-sharing",
  "ws-modules",
  "ws-sync",
  "ws-settings",
]);

/** The page title for a shell-rendered segment.
 *
 *  Settings and Overview used to render with NO page-title bar at all
 *  while every module surface carried an `ActionsBar` — so the title baseline
 *  moved as soon as the director crossed into Settings. Titles here are
 *  the SAME words the rail uses; a destination that renames itself on arrival
 *  reads as a different place. */
export const SHELL_SEGMENT_TITLE: Partial<Record<AppTab, string>> = {
  overview: "Overview",
  "ws-venue": "Venue",
  "ws-members": "Team",
  "ws-sharing": "Site",
  "ws-modules": "Modules",
  "ws-sync": "Workspace",
  "ws-settings": "Workspace",
};

/** Segments rendered by the shell itself (Overview / Display config / admin). */
export const SHELL_SEGMENTS: ReadonlySet<AppTab> = new Set<AppTab>([
  "overview",
  "display-config",
  ...ADMIN_SEGMENTS,
]);

/** Segments owned by the Entries module (SP-E1-1). Exported so the router and
 *  the kind-guess both read one list instead of hand-repeating the literal. */
export const ENTRIES_SEGMENTS: ReadonlySet<AppTab> = new Set<AppTab>([
  "entries",
]);

export function isAdminSegment(tab: AppTab): boolean {
  return ADMIN_SEGMENTS.has(tab);
}

export function buildWorkspaceNav(
  kind: WsKind,
  enabled: Set<ModuleId>,
): WorkspaceNav {
  const sections: WsSection[] = [];

  // Intake sits FIRST — it is where the workspace's people come from, and the
  // anatomy reads intake → engine → emit down the rail. Absent entirely
  // unless the module is enabled, which in local mode it can never be
  // (ruling D2), so a laptop-only director never sees a module they cannot
  // use (ADR 0005).
  if (enabled.has("entries")) {
    sections.push({
      id: "entries",
      label: MODULE_LABELS.entries,
      role: "intake",
      items: [{ segment: "entries", label: "Desk" }],
    });
  }
  if (enabled.has("meet")) {
    sections.push({
      id: "meet",
      label: MODULE_LABELS.meet,
      role: "engine",
      items: [
        { segment: "roster", label: "Roster" },
        { segment: "matches", label: "Matches" },
        { segment: "setup", label: "Configuration" },
      ],
    });
  }
  if (enabled.has("bracket")) {
    sections.push({
      id: "bracket",
      label: MODULE_LABELS.bracket,
      role: "engine",
      items: [
        { segment: "bracket-roster", label: "Roster" },
        { segment: "bracket-draws", label: "Draws" },
        { segment: "bracket-matches", label: "Matches" },
        { segment: "bracket-setup", label: "Configuration" },
      ],
    });
  }
  if (enabled.has("meet") || enabled.has("bracket")) {
    const opsBracket =
      kind === "bracket" || (!enabled.has("meet") && enabled.has("bracket"));
    sections.push({
      id: "operations",
      label: MODULE_LABELS.operations,
      role: "shared",
      items: opsBracket
        ? [
            { segment: "bracket-schedule", label: "Plan" },
            { segment: "bracket-live", label: "Live day" },
          ]
        : [
            { segment: "schedule", label: "Plan" },
            { segment: "live", label: "Live day" },
          ],
    });
  }
  if (enabled.has("display")) {
    sections.push({
      id: "display",
      label: MODULE_LABELS.display,
      role: "output",
      items: [
        { segment: "tv", label: "Preview" },
        { segment: "display-config", label: "Configuration" },
      ],
    });
  }

  return {
    overview: { segment: "overview", label: "Overview" },
    sections,
    admin: {
      label: "Workspace",
      items: [
        { segment: "ws-venue", label: "Venue" },
        { segment: "ws-members", label: "Team" },
        { segment: "ws-sharing", label: "Site" },
        { segment: "ws-modules", label: "Modules" },
        { segment: "ws-sync", label: "Backups" },
        { segment: "ws-settings", label: "Workspace settings" },
      ],
    },
  };
}

/** The id of the section containing a segment (for accordion auto-open), or
 *  null when the segment is Overview / admin / not in a section. */
export function sectionOfSegment(
  nav: WorkspaceNav,
  segment: AppTab,
): WsSection["id"] | null {
  return (
    nav.sections.find((s) => s.items.some((it) => it.segment === segment))
      ?.id ?? null
  );
}

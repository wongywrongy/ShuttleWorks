/**
 * The workspace left-sidebar navigation model — the single source of truth for
 * the workflow-first IA: Setup, Participants, Competition, Operations,
 * Publish, and Administration. Enabled modules adapt the tools within those
 * stable categories. Module identity is shown in the catalog and in
 * operational data where provenance matters; the workflow rail stays focused
 * on the operator's task rather than repeating implementation badges.
 *
 * Canonical workflow URLs stay separate from the legacy AppTab render keys.
 * That separation lets surfaces move without breaking old bookmarks or module
 * guards.
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
  | "competition"
  | "operations"
  | "publish"
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
 * Several paths currently share a legacy renderer (for example Setup rules
 * and General both open the existing configuration surface); this is a safe
 * migration seam and makes the eventual section-specific pages additive.
 */
export const WORKFLOW_ROUTES: readonly WorkflowRoute[] = [
  { path: "overview", section: "overview", tab: "overview" },
  // Bare /setup is a real destination, not a redirect: the readiness
  // checklist renders ONCE, on this landing (SP-OPCON-1 RDY-3); section
  // pages carry a one-line strip linking back to it.
  { path: "setup", section: "setup", tab: "setup" },
  { path: "setup/general", section: "setup", tab: "setup" },
  { path: "setup/dates", section: "setup", tab: "setup" },
  { path: "setup/venue", section: "setup", tab: "setup" },
  { path: "setup/events", section: "setup", tab: "setup" },
  { path: "setup/rules", section: "setup", tab: "setup" },
  { path: "setup/entries", section: "setup", tab: "setup" },
  { path: "setup/people", section: "setup", tab: "setup" },
  { path: "setup/public-info", section: "setup", tab: "setup" },
  { path: "participants/entries", section: "participants", tab: "entries" },
  {
    path: "participants/people",
    section: "participants",
    tab: "roster",
    bracketTab: "bracket-roster",
  },
  {
    path: "participants/pairs",
    section: "participants",
    tab: "roster",
    bracketTab: "bracket-roster",
  },
  {
    path: "participants/teams",
    section: "participants",
    tab: "roster",
    bracketTab: "bracket-roster",
  },
  { path: "participants/review", section: "participants", tab: "entries" },
  {
    path: "competition/draws",
    section: "competition",
    tab: "bracket-draws",
    kind: "bracket",
  },
  // The selected draw is opened from the Draws table, so it does not need a
  // second rail item. It does need a canonical workflow route: otherwise the
  // canvas falls back to the legacy module URL and Competition loses context.
  {
    path: "competition/draw",
    section: "competition",
    tab: "bracket-draw",
    kind: "bracket",
  },
  {
    path: "competition/team-structure",
    section: "competition",
    tab: "roster",
    kind: "meet",
  },
  {
    path: "competition/matches",
    section: "competition",
    tab: "matches",
    bracketTab: "bracket-matches",
  },
  {
    path: "competition/results",
    section: "competition",
    tab: "matches",
    bracketTab: "bracket-matches",
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
  { path: "publish/site", section: "publish", tab: "ws-sharing" },
  { path: "publish/draws-results", section: "publish", tab: "ws-sharing" },
  { path: "publish/displays", section: "publish", tab: "display-config" },
  { path: "publish/links", section: "publish", tab: "ws-sharing" },
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
  switch (segment) {
    case "overview":
      return "overview";
    case "entries":
      return "participants/entries";
    case "roster":
    case "bracket-roster":
      return "participants/people";
    case "matches":
    case "bracket-matches":
      return "competition/matches";
    case "bracket-draws":
      return "competition/draws";
    case "bracket-draw":
      return "competition/draw";
    case "bracket-events":
      return "competition/team-structure";
    case "setup":
    case "bracket-setup":
      return "setup/general";
    case "schedule":
    case "bracket-schedule":
      return "operations/plan";
    case "live":
    case "bracket-live":
      return "operations/live";
    case "tv":
    case "display-config":
      return "publish/displays";
    case "ws-venue":
      return "setup/venue";
    case "ws-members":
      return "administration/team";
    case "ws-sharing":
      return "publish/site";
    case "ws-modules":
      return "administration/modules";
    case "ws-sync":
      return "administration/backups";
    case "ws-settings":
      return "administration/lifecycle";
    default:
      return "overview";
  }
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
): WsNavItem => ({
  path,
  segment,
  label,
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
  const matchesTab: AppTab = bracketPrimary ? "bracket-matches" : "matches";
  const planTab: AppTab = bracketPrimary ? "bracket-schedule" : "schedule";
  const liveTab: AppTab = bracketPrimary ? "bracket-live" : "live";
  const participants: WsNavItem[] = [];
  if (enabled.has("entries")) {
    participants.push(item("participants/entries", "entries", MODULE_LABELS.entries));
  }
  // One link per distinct surface. Pairs, teams, eligibility, and payments
  // remain tools inside Roster / Entries until they own an actual view;
  // separate labels that render the same page create false destinations.
  participants.push(
    item("participants/people", peopleTab, "Roster"),
  );

  const competition: WsNavItem[] = [];
  if (enabled.has("bracket")) {
    competition.push(
      item("competition/draws", "bracket-draws", "Draws"),
    );
  }
  competition.push(
    item("competition/matches", matchesTab, "Matches"),
  );

  const publishing: WsNavItem[] = [item("publish/site", "ws-sharing", "Site")];
  if (enabled.has("bracket")) {
    publishing.push(
      item(
        "publish/draws-results",
        "bracket-draws",
        "Draws & results",
      ),
    );
  }
  if (enabled.has("display")) {
    publishing.push(
      item("publish/displays", "display-config", "Displays"),
    );
  }
  publishing.push(item("publish/links", "ws-sharing", "Links and embeds"));

  return {
    overview: item("overview", "overview", "Overview"),
    sections: [
      {
        id: "setup",
        label: "Setup",
        items: [
          item("setup", "setup", "Checklist"),
          item("setup/general", "setup", "General"),
          item("setup/dates", "setup", "Dates"),
          item("setup/venue", "setup", "Venue"),
          item("setup/events", "setup", "Events"),
          item("setup/rules", "setup", "Rules"),
          ...(enabled.has("entries")
            ? [item("setup/entries", "setup", "Entry rules")]
            : []),
          item("setup/people", "setup", "Staff"),
          item("setup/public-info", "setup", "Public info"),
        ],
      },
      { id: "participants", label: "Participants", items: participants },
      { id: "competition", label: "Competition", items: competition },
      {
        id: "operations",
        label: MODULE_LABELS.operations,
        items: [
          item("operations/plan", planTab, "Plan"),
          item("operations/live", liveTab, "Live day"),
        ],
      },
      { id: "publish", label: "Publish", items: publishing },
    ],
    admin: {
      label: "Administration",
      items: [
        item("administration/team", "ws-members", "Team"),
        item("administration/modules", "ws-modules", "Modules"),
        item("administration/backups", "ws-sync", "Backups"),
        item("administration/activity", "ws-sync", "Activity"),
        // SP-OPCON-1 SWP-7: same name in nav and H1 ("Workspace settings",
        // `GeneralSettingsTab`'s heading). "Lifecycle" described one row of
        // the page. The URL segment stays — bookmarks outlive labels.
        item("administration/lifecycle", "ws-settings", "Workspace settings"),
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

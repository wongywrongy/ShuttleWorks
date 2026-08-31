/**
 * Per-tournament wrapper. Mounted at ``/tournaments/:id/*`` in
 * ``App.tsx``. Reads ``id`` from URL params, sets it on the UI store so
 * module-level helpers (``forceSaveNow``) can resolve the active
 * tournament, then renders the existing ``AppShell``.
 *
 * Syncs the URL trailing segment into ``uiStore.activeTab`` so deep
 * links and refresh land on the right tab. Bundle 3 made this 1:1 —
 * every tab id is a URL segment (``/setup``, ``/bracket-events``, …);
 * the reverse direction (tab click → URL) is wired in ``TabBar.tsx``
 * with ``{ replace: true }`` semantics so back-button doesn't
 * accumulate per-tab stops. Legacy ``/bracket`` URLs are handled by a
 * ``<Navigate>`` route in ``App.tsx`` that redirects to ``/bracket-setup``
 * before this page mounts.
 *
 * Hooks inside ``AppShell`` (``useTournamentState``, ``useAdvisories``,
 * ``useSuggestions``, etc.) read the same id via ``useParams`` /
 * ``useTournamentId`` — no prop drilling required.
 */
import { useEffect, useLayoutEffect, type ReactNode } from "react";
import { Link, Navigate, useLocation, useParams } from "react-router-dom";
import { AppShell } from "../app/AppShell";
import { useTournamentKind } from "../hooks/useTournamentKind";
import { useUiStore, type AppTab } from "../store/uiStore";
import { MEET_TAB_IDS, BRACKET_TAB_IDS } from "../lib/bracketTabs";
import {
  SHELL_SEGMENTS,
  ENTRIES_SEGMENTS,
  workflowRouteForPath,
} from "../platform/product-shell/workspaceNav";

// URL-routable trailing segments: every meet tab id + every bracket tab id +
// the workspace-shell segments (overview / display-config / ws-* admin).
// Legacy `/bracket` is handled by an explicit <Navigate> route in App.tsx;
// by the time we reach this layoutEffect the URL is already /bracket-setup.
const _TAB_SEGMENTS: ReadonlySet<AppTab> = new Set<AppTab>([
  ...MEET_TAB_IDS,
  ...BRACKET_TAB_IDS,
  ...SHELL_SEGMENTS,
  // Entries (SP-E1-1) belongs to neither engine's tab list — it is a module
  // segment of its own. Without it here the URL /tournaments/:id/entries
  // would leave `activeTab` on whatever it was, and a poster-following
  // operator would land on the wrong surface with a correct-looking URL.
  ...ENTRIES_SEGMENTS,
]);

/** Kind-agnostic module segments: the URL says nothing about whether this is
 *  a meet or a bracket, so the optimistic-kind guess below must skip them and
 *  let `useTournamentKind`'s fetch be the only source of truth. */
const KIND_AGNOSTIC: ReadonlySet<AppTab> = new Set<AppTab>([
  ...SHELL_SEGMENTS,
  ...ENTRIES_SEGMENTS,
]);

// `setup` is absent deliberately: bare /setup is the readiness-checklist
// landing (a registered WORKFLOW_ROUTES entry), not a section root.
const WORKFLOW_SECTION_DEFAULTS: Readonly<Record<string, string>> = {
  participants: "participants/people",
  competition: "competition/matches",
  operations: "operations/plan",
  publish: "publish/site",
  administration: "administration/team",
};

export function TournamentPage() {
  const params = useParams<{ id?: string }>();
  const location = useLocation();
  const tid = params.id ?? null;
  const activeTournamentKind = useUiStore(
    (state) => state.activeTournamentKind,
  );
  // The trailing segment IS the surface key. `pop()` on the bare
  // /tournaments/{id} URL returns the id itself — that's "no segment", not a
  // bad one, and keeps rendering the workspace.
  const pathParts = location.pathname.split("/").filter(Boolean);
  const tournamentIndex = tid ? pathParts.indexOf(tid) : -1;
  const trailingParts =
    tournamentIndex >= 0 ? pathParts.slice(tournamentIndex + 1) : [];
  const workflowPath = trailingParts.join("/");
  const sectionRootDestination =
    WORKFLOW_SECTION_DEFAULTS[workflowPath] ?? null;
  const workflowRoute = workflowRouteForPath(
    workflowPath,
    activeTournamentKind,
  );
  const segment = trailingParts[trailingParts.length - 1] ?? "";
  const isBareTournamentPath = trailingParts.length === 0;
  const routeTab = workflowRoute?.tab;
  const unknownSegment =
    !isBareTournamentPath &&
    !sectionRootDestination &&
    !workflowRoute &&
    !_TAB_SEGMENTS.has(segment as AppTab);

  // Load the tournament's kind so the AppShell + TabBar can render
  // meet-style or bracket-style chrome. The hook is a no-op when tid
  // is null and clears the store on unmount. It also reports the uniform
  // 404 — see the not-found branch below.
  const workspaceNotFound = useTournamentKind(tid);

  useEffect(() => {
    useUiStore.getState().setActiveTournamentId(tid);
    return () => {
      useUiStore.getState().setActiveTournamentId(null);
    };
  }, [tid]);

  // Sync the URL trailing segment into activeTab + optimistic kind
  // BEFORE the first paint, so the AppShell never flashes meet tabs
  // on a tournament-kind page (or vice versa). ``useLayoutEffect``
  // runs after DOM mutations but before the browser paints, so the
  // synchronous Zustand update + re-render lands before the user
  // sees anything. ``useTournamentKind``'s async fetch corrects the
  // optimistic guess if the URL lies (e.g. someone hand-edits the
  // URL to ``/bracket`` on a meet-kind tournament).
  useLayoutEffect(() => {
    // An unrecognised segment renders not-found below; it must not leave a
    // stale tab (or a guessed kind) behind it.
    if (!tid || unknownSegment) return;
    if (routeTab) {
      useUiStore.getState().setActiveTab(routeTab);
    } else if (segment && _TAB_SEGMENTS.has(segment as AppTab)) {
      // Legacy segment IS the tab id, 1:1. No translation.
      useUiStore.getState().setActiveTab(segment as AppTab);
    } else if (isBareTournamentPath) {
      useUiStore.getState().setActiveTab("overview");
    }
    // Optimistic kind: any bracket-* segment → bracket; otherwise meet. Skip
    // for kind-agnostic shell segments (overview / ws-* / display-config) —
    // there ``useTournamentKind``'s async fetch is the only source of truth, so
    // we don't flash the wrong engine's groups on a bracket workspace.
    if (segment && !workflowRoute && !KIND_AGNOSTIC.has(segment as AppTab)) {
      const optimisticKind: "meet" | "bracket" = segment.startsWith("bracket-")
        ? "bracket"
        : "meet";
      useUiStore.getState().setActiveTournamentKind(optimisticKind);
    }
  }, [
    tid,
    segment,
    routeTab,
    workflowRoute,
    workflowPath,
    isBareTournamentPath,
    unknownSegment,
  ]);

  // No kind-based snap: a tab whose module isn't enterable for this workspace
  // is preserved so the AppShell guard can show the unavailable panel (rather
  // than silently routing away), and a valid multi-module tab is never snapped
  // to the wrong kind's home. The legacy ``/bracket`` URL is redirected to
  // ``/bracket-setup`` by a route in ``App.tsx`` before this page mounts.

  if (!tid) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">
        Tournament id missing in URL.
      </div>
    );
  }

  // A workspace we cannot see is a not-found, not a blank one. The API answers
  // ONE uniform 404 whether it never existed or simply isn't ours — that is
  // the tenancy guarantee working, and it must not read as a bug. Before this,
  // the 404 was only logged and the SPA fell through to client defaults: an
  // "Untitled" workspace, a module sidebar, and a Configuration form with a
  // Save button on it (2026-08-10 full-scale browser pass). Same shape as the
  // public tier's dead display link, which has always got this right.
  //
  // Checked BEFORE the segment guard so a bad segment on an inaccessible
  // workspace reports the bigger truth.
  if (workspaceNotFound) {
    return (
      <NotFound title="Workspace not found">
        <p className="text-sm text-muted-foreground">
          This workspace has been deleted, or it isn&rsquo;t shared with your
          account. Ask whoever runs it for an invite.
        </p>
        <Link
          to="/"
          replace
          className="text-sm text-accent underline underline-offset-2"
        >
          Go to your workspaces
        </Link>
      </NotFound>
    );
  }

  // Section labels are navigational landmarks. A copied or hand-entered root
  // should land on that workflow's first real surface, not a 404 or a page
  // with no active child in the sidebar.
  if (sectionRootDestination) {
    return (
      <Navigate
        to={`/tournaments/${encodeURIComponent(tid)}/${sectionRootDestination}`}
        replace
      />
    );
  }

  // A segment nothing owns is a not-found, not a silent fallback. Without this
  // the URL simply left `activeTab` at its default and the shell rendered the
  // Meet Configuration page under any nonsense path (2026-08-10 browser pass).
  if (unknownSegment) {
    return (
      <NotFound title="Page not found">
        <p className="text-sm text-muted-foreground">
          This workspace has no <span className="sw-num">{segment}</span> page.
        </p>
        <Link
          to={`/tournaments/${tid}/overview`}
          replace
          className="text-sm text-accent underline underline-offset-2"
        >
          Go to the workspace overview
        </Link>
      </NotFound>
    );
  }

  return <AppShell />;
}

/** The one honest dead-end in the workspace route: a heading, what happened,
 *  and a way out. Shared by both cases so they cannot drift apart. */
function NotFound({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div
      data-testid="workspace-not-found"
      className="min-h-screen flex flex-col items-center justify-center gap-2 p-6 text-center"
    >
      <div className="text-sm font-semibold text-foreground">{title}</div>
      {children}
    </div>
  );
}

/**
 * Per-tournament wrapper. Mounted at ``/tournaments/:id/*`` in
 * ``App.tsx``. Reads ``id`` from URL params, sets it on the UI store so
 * module-level helpers (``forceSaveNow``) can resolve the active
 * tournament, then renders the existing ``AppShell``.
 *
 * Syncs canonical workflow paths into ``uiStore.activeTab`` so deep links and
 * refresh land on the right renderer. Workflow paths are registered in
 * ``workspaceNav.ts`` and emitted by the shell navigation helpers.
 *
 * Hooks inside ``AppShell`` (``useTournamentState``, ``useAdvisories``,
 * ``useSuggestions``, etc.) read the same id via ``useParams`` /
 * ``useTournamentId`` — no prop drilling required.
 */
import { useEffect, useLayoutEffect, type ReactNode } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { AppShell } from "../app/AppShell";
import { useTournamentKind } from "../hooks/useTournamentKind";
import { useUiStore } from "../store/uiStore";
import { workflowRouteForPath } from "../platform/product-shell/workspaceNav";

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
  const workflowRoute = workflowRouteForPath(
    workflowPath,
    activeTournamentKind,
  );
  const segment = trailingParts[trailingParts.length - 1] ?? "";
  const isBareTournamentPath = trailingParts.length === 0;
  const routeTab = workflowRoute?.tab;
  const unknownSegment =
    !isBareTournamentPath &&
    !workflowRoute;

  // Load the tournament's kind so the AppShell can render
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

  // Sync the canonical route into activeTab before the first paint.
  useLayoutEffect(() => {
    // An unrecognised segment renders not-found below; it must not leave a
    // stale tab behind it.
    if (!tid || unknownSegment) return;
    if (routeTab) {
      useUiStore.getState().setActiveTab(routeTab);
    } else if (isBareTournamentPath) {
      useUiStore.getState().setActiveTab("overview");
    }
  }, [
    tid,
    routeTab,
    workflowRoute,
    workflowPath,
    isBareTournamentPath,
    unknownSegment,
  ]);

  // A route whose module is unavailable remains visible so the AppShell guard
  // can explain the missing capability and offer its supported next step.

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

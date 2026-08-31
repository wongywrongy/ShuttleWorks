/**
 * Workflow-first workspace navigation. A section name is a real destination;
 * the adjacent disclosure button only shows or hides its child links. The
 * current section is deliberately quieter than the current page so operators
 * can distinguish "where I am" from "what belongs to this category".
 */
import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { CaretRight } from "@phosphor-icons/react";
import { ActiveChoice } from "../../components/ActiveChoice";
import type { AppTab } from "../../store/uiStore";
import type { ModuleId, WorkspaceModule } from "./types";
import {
  buildWorkflowNavigation,
  workflowItemHref,
  workflowSectionOfPath,
  type WsKind,
  type WsNavItem,
} from "./workspaceNav";

interface WorkspaceSidebarProps {
  tid: string;
  kind: WsKind;
  modules: WorkspaceModule[];
  /** The module catalog failed to load. `modules` is then empty for want of
   *  an answer, not because the workspace has none — and rendering an empty
   *  rail would state the second. */
  modulesUnknown?: boolean;
  onRetryModules?: () => void;
  activeTab: AppTab;
  /** Called after a nav item navigates. The off-canvas host passes a close
   *  handler — a drawer that stays open over the surface it just navigated to
   *  hides the thing it was asked for. */
  onNavigate?: () => void;
}

export function WorkspaceSidebar({
  tid,
  kind,
  modules,
  modulesUnknown,
  onRetryModules,
  activeTab,
  onNavigate,
}: WorkspaceSidebarProps) {
  const location = useLocation();
  // Stable key so the memo doesn't recompute on every render (Set identity).
  const enabledKey = modules
    .filter((m) => m.status === "enabled")
    .map((m) => m.id)
    .sort()
    .join(",");
  const nav = useMemo(
    () =>
      buildWorkflowNavigation(
        kind,
        new Set<ModuleId>(
          enabledKey ? (enabledKey.split(",") as ModuleId[]) : [],
        ),
      ),
    [kind, enabledKey],
  );

  const pathParts = location.pathname.split("/").filter(Boolean);
  // React Router gives us a decoded param while `location.pathname` retains
  // percent-encoding. Compare like with like so workspace names/ids containing
  // spaces keep their active section and item state.
  const tournamentIndex = pathParts.findIndex((part) => {
    try {
      return decodeURIComponent(part) === tid;
    } catch {
      return part === tid;
    }
  });
  const workflowPath =
    tournamentIndex >= 0 ? pathParts.slice(tournamentIndex + 1).join("/") : "";
  const activeSection = workflowSectionOfPath(nav, workflowPath);
  const adminActive = workflowPath.startsWith("administration/");
  // Independent open state — any number of sections can be open at once.
  const [openSections, setOpenSections] = useState<Set<string>>(
    () => new Set(activeSection ? [activeSection] : []),
  );
  // Navigating into a section auto-opens it (without closing the others).
  useEffect(() => {
    if (activeSection) {
      setOpenSections((prev) =>
        prev.has(activeSection) ? prev : new Set(prev).add(activeSection),
      );
    }
  }, [activeSection]);

  const toggle = (id: string) =>
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // The active page carries the strongest treatment. Workflow groups provide
  // ownership context; default-state module marks add noise and are omitted.
  const NavItem = ({ item, nested }: { item: WsNavItem; nested?: boolean }) => {
    const active = item.path
      ? item.path === workflowPath
      : item.segment === activeTab;
    return (
      <ActiveChoice
        to={workflowItemHref(tid, item)}
        active={active}
        geometry="row"
        semantics="page"
        data-testid={`ws-nav-${(item.path ?? item.segment).replaceAll("/", "-")}`}
        onClick={onNavigate}
        className={[
          "flex h-8 min-w-0 items-center gap-2 px-2.5 py-0 text-[13px] leading-none",
          nested ? "w-full" : "mx-2 w-auto",
        ].join(" ")}
      >
        <span className="min-w-0 flex-1 break-words">{item.label}</span>
      </ActiveChoice>
    );
  };

  return (
    <nav
      aria-label="Workspace"
      className="flex h-full w-52 shrink-0 flex-col overflow-y-auto border-r border-border bg-card py-2"
    >
      {/* Tier 3 — Overview (always, top) */}
      <NavItem item={nav.overview} />

      {/* Tier 1 + 2 — sections (independent open state), or a plain statement
          that we don't know what they are. Overview and the Workspace admin
          items below are shell-owned, so they stay reachable either way — the
          Modules admin page is in fact the place to go from here. */}
      {modulesUnknown ? (
        <div
          data-testid="ws-modules-unknown"
          className="mx-2 mt-2 rounded-sm border border-status-warning-fg/40 bg-status-warning-bg px-2 py-2 text-status-warning-fg"
        >
          <p className="text-xs font-medium">Modules didn&rsquo;t load</p>
          <p className="mt-0.5 text-2xs">
            This workspace&rsquo;s modules are unknown right now, so none are
            listed. They have not been turned off.
          </p>
          {onRetryModules ? (
            <button
              type="button"
              onClick={onRetryModules}
              className="mt-1.5 rounded-sm border border-current px-1.5 py-0.5 text-2xs font-medium hover:bg-current/10"
            >
              Retry
            </button>
          ) : null}
        </div>
      ) : null}
      <div className="mt-2 space-y-1">
        {nav.sections.map((s) => {
          const open = openSections.has(s.id);
          const containsCurrent = activeSection === s.id;
          const linksId = `ws-section-${s.id}-links`;
          return (
            <div key={s.id}>
              <div
                data-testid={`ws-section-${s.id}`}
                data-active={containsCurrent ? "true" : undefined}
                className={[
                  "mx-2 flex h-8 items-center rounded-sm",
                  containsCurrent
                    ? "bg-muted/60 text-foreground"
                    : "text-muted-foreground",
                ].join(" ")}
              >
                <Link
                  to={workflowItemHref(tid, s.items[0])}
                  onClick={onNavigate}
                  className={[
                    "flex h-8 min-w-0 flex-1 items-center rounded-sm px-2 text-xs font-semibold leading-none",
                    containsCurrent
                      ? "text-foreground"
                      : "hover:bg-muted/50 hover:text-foreground",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                  ].join(" ")}
                >
                  {s.label}
                </Link>
                <button
                  type="button"
                  data-testid={`ws-section-${s.id}-toggle`}
                  aria-label={`${open ? "Hide" : "Show"} ${s.label} links`}
                  aria-expanded={open}
                  aria-controls={linksId}
                  onClick={() => toggle(s.id)}
                  className="inline-flex size-8 shrink-0 items-center justify-center self-center rounded-sm leading-none text-muted-foreground hover:bg-muted/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                >
                  <CaretRight
                    aria-hidden
                    className={`size-3.5 transition-transform ${open ? "rotate-90" : ""}`}
                  />
                </button>
              </div>
              {open ? (
                <div
                  id={linksId}
                  className="ml-5 mr-2 mt-0.5 border-l border-border py-0.5 pl-1.5"
                >
                  {s.items.map((it) => (
                    <NavItem key={it.path ?? it.segment} item={it} nested />
                  ))}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      {/* Administration uses the same parent/children weight and guide, but
          stays expanded: module recovery must remain reachable. */}
      <div className="my-2 border-t border-border" />
      <Link
        to={workflowItemHref(tid, nav.admin.items[0])}
        data-testid="ws-nav-administration"
        data-active={adminActive ? "true" : undefined}
        className={[
          "mx-2 flex h-9 items-center rounded-sm px-2 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
          adminActive
            ? "bg-muted/60 text-foreground"
            : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
        ].join(" ")}
        onClick={onNavigate}
      >
        {nav.admin.label}
      </Link>
      <div className="ml-5 mr-2 border-l border-border py-0.5 pl-1.5">
        {nav.admin.items.map((it) => (
          <NavItem key={it.path ?? it.segment} item={it} nested />
        ))}
      </div>
    </nav>
  );
}

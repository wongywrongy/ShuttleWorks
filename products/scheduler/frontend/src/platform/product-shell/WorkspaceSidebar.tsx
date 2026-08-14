/**
 * The workspace left sidebar — primary in-workspace navigation, in three tiers:
 *  - Tier 1: section triggers (uppercase label + role badge + chevron). Clicking
 *    toggles that section open/closed; sections are independent — any number can
 *    be open at once. Navigating into a section auto-opens it. Triggers don't
 *    navigate.
 *  - Tier 2: the nav items inside a section. No per-item icons — a left category
 *    guide-line shows membership; the active item gets a left-edge accent bar.
 *  - Tier 3: Overview (always, top) and Workspace admin (always, bottom, below
 *    a divider) — top-level items, never inside a collapsible section.
 */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CaretRight } from '@phosphor-icons/react';
import type { AppTab } from '../../store/uiStore';
import type { ModuleId, WorkspaceModule } from './types';
import {
  buildWorkspaceNav,
  roleBadge,
  sectionOfSegment,
  type WsKind,
  type WsNavItem,
} from './workspaceNav';

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
  const navigate = useNavigate();
  // Stable key so the memo doesn't recompute on every render (Set identity).
  const enabledKey = modules
    .filter((m) => m.status === 'enabled')
    .map((m) => m.id)
    .sort()
    .join(',');
  const nav = useMemo(
    () => buildWorkspaceNav(kind, new Set<ModuleId>(enabledKey ? (enabledKey.split(',') as ModuleId[]) : [])),
    [kind, enabledKey],
  );

  const activeSection = sectionOfSegment(nav, activeTab);
  // Independent open state — any number of sections can be open at once.
  const [openSections, setOpenSections] = useState<Set<string>>(
    () => new Set(activeSection ? [activeSection] : []),
  );
  // Navigating into a section auto-opens it (without closing the others).
  useEffect(() => {
    if (activeSection) {
      setOpenSections((prev) => (prev.has(activeSection) ? prev : new Set(prev).add(activeSection)));
    }
  }, [activeSection]);

  const go = (segment: AppTab) => {
    navigate(`/tournaments/${tid}/${segment}`, { replace: true });
    onNavigate?.();
  };

  const toggle = (id: string) =>
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // Console grammar: full-bleed rows, the active item reads as a filled state
  // (accent tint + accent text + a 3px left bar), nested items sit flush —
  // the section header above them is the grouping, not an indent guide.
  const NavItem = ({ item, nested }: { item: WsNavItem; nested?: boolean }) => {
    const active = item.segment === activeTab;
    return (
      <button
        type="button"
        data-testid={`ws-nav-${item.segment}`}
        aria-current={active ? 'page' : undefined}
        onClick={() => go(item.segment)}
        className={[
          'relative flex w-full items-center py-[7px] pr-2 text-left text-[13px] leading-none',
          nested ? 'pl-5' : 'pl-3.5',
          active
            ? 'bg-accent-bg font-semibold text-accent'
            : 'text-ink-3 hover:bg-muted/40 hover:text-foreground',
        ].join(' ')}
      >
        {active ? (
          <span aria-hidden className="absolute inset-y-0 left-0 w-[3px] bg-accent" />
        ) : null}
        {item.label}
      </button>
    );
  };

  return (
    <nav
      aria-label="Workspace"
      className="flex h-full w-48 shrink-0 flex-col overflow-y-auto border-r border-border bg-card py-2"
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
      <div className="mt-2 space-y-0.5">
        {nav.sections.map((s) => {
          const open = openSections.has(s.id);
          return (
            <div key={s.id}>
              <button
                type="button"
                data-testid={`ws-section-${s.id}`}
                aria-expanded={open}
                onClick={() => toggle(s.id)}
                className="flex w-full items-center justify-between gap-2 px-3.5 pb-0.5 pt-2.5 text-left hover:bg-muted/40"
              >
                <span className="flex items-center gap-1.5">
                  <span className="text-3xs font-bold uppercase tracking-[0.08em] text-muted-foreground">
                    {s.label}
                  </span>
                  <span className="rounded-sm border border-border px-1 text-[9px] font-medium uppercase tracking-wide text-muted-foreground">
                    {roleBadge(s.role)}
                  </span>
                </span>
                <CaretRight
                  aria-hidden
                  className={`h-3 w-3 shrink-0 text-muted-foreground transition-transform ${open ? 'rotate-90' : ''}`}
                />
              </button>
              {open ? (
                // Items sit flush under the section header (Console grammar).
                // No open animation: a nav disclosure is high-frequency
                // during setup (MOTION.md §2) and `sw-rail-expand` animated
                // max-height, which §10.2 forbids outright.
                <div className="mt-0.5">
                  {s.items.map((it) => (
                    <NavItem key={it.segment} item={it} nested />
                  ))}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      {/* Tier 3 — Workspace admin (always, bottom) */}
      <div className="my-2 border-t border-border" />
      <div className="px-3.5 pb-0.5 text-3xs font-bold uppercase tracking-[0.08em] text-muted-foreground">
        {nav.admin.label}
      </div>
      <div>
        {nav.admin.items.map((it) => (
          <NavItem key={it.segment} item={it} />
        ))}
      </div>
    </nav>
  );
}

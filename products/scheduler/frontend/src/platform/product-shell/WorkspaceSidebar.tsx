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
import { EYEBROW_CLASS } from '../../lib/utils';
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

  const NavItem = ({ item, nested }: { item: WsNavItem; nested?: boolean }) => {
    const active = item.segment === activeTab;
    return (
      <button
        type="button"
        data-testid={`ws-nav-${item.segment}`}
        aria-current={active ? 'page' : undefined}
        onClick={() => go(item.segment)}
        className={[
          'relative flex w-full items-center rounded-sm py-1.5 pr-2 text-left text-xs',
          nested ? 'pl-4' : 'pl-3',
          active
            ? 'font-medium text-foreground'
            : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground',
        ].join(' ')}
      >
        {/* Active marker sits on the category guide-line for nested items, or at
            the item's left edge for top-level (Overview / admin) items. */}
        {active ? (
          <span
            aria-hidden
            className={`absolute bottom-1 top-1 w-0.5 rounded-full bg-accent ${nested ? '-left-px' : 'left-0'}`}
          />
        ) : null}
        {item.label}
      </button>
    );
  };

  return (
    <nav
      aria-label="Workspace"
      className="flex h-full w-56 shrink-0 flex-col overflow-y-auto border-r border-border bg-card/40 p-2"
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
          className="mt-2 rounded-sm border border-status-warning-fg/40 bg-status-warning-bg px-2 py-2 text-status-warning-fg"
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
                className="flex w-full items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-left hover:bg-muted/40"
              >
                <span className="flex items-center gap-1.5">
                  <span className={`${EYEBROW_CLASS} text-muted-foreground`}>
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
                // Category guide-line: a single left border shows the items
                // belong to this section (replaces per-item icons).
                // No open animation: a nav disclosure is high-frequency
                // during setup (MOTION.md §2) and `sw-rail-expand` animated
                // max-height, which §10.2 forbids outright.
                <div className="ml-3 mt-0.5 space-y-0.5 border-l border-rule-soft">
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
      <div className={`px-2 pb-1 ${EYEBROW_CLASS} text-muted-foreground`}>
        {nav.admin.label}
      </div>
      <div className="space-y-0.5">
        {nav.admin.items.map((it) => (
          <NavItem key={it.segment} item={it} />
        ))}
      </div>
    </nav>
  );
}

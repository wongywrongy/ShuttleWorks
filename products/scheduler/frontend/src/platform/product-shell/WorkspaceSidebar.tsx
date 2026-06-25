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
} from '../../app/workspace/workspaceNav';

interface WorkspaceSidebarProps {
  tid: string;
  kind: WsKind;
  modules: WorkspaceModule[];
  activeTab: AppTab;
}

export function WorkspaceSidebar({ tid, kind, modules, activeTab }: WorkspaceSidebarProps) {
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

  const go = (segment: AppTab) =>
    navigate(`/tournaments/${tid}/${segment}`, { replace: true });

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

      {/* Tier 1 + 2 — sections (independent open state) */}
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
                  <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/70">
                    {s.label}
                  </span>
                  <span className="rounded-sm border border-border px-1 text-[9px] font-medium uppercase tracking-wide text-muted-foreground/60">
                    {roleBadge(s.role)}
                  </span>
                </span>
                <CaretRight
                  aria-hidden
                  className={`h-3 w-3 shrink-0 text-muted-foreground/50 transition-transform ${open ? 'rotate-90' : ''}`}
                />
              </button>
              {open ? (
                // Category guide-line: a single left border shows the items
                // belong to this section (replaces per-item icons).
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
      <div className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/70">
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

import { useEffect, useState, type ReactNode } from 'react';
import { GearSix, List } from '@phosphor-icons/react';
import { Modal } from '@scheduler/design-system';
import { WorkspaceIdentityBar } from './WorkspaceIdentityBar';
import { WorkspaceSidebar } from './WorkspaceSidebar';
import type { WorkspaceModule, WorkspaceIdentity } from './types';
import type { AppTab } from '../../store/uiStore';
import { useViewportBelow } from '../../hooks/useViewportBelow';
import type { WsKind } from './workspaceNav';

/**
 * Below this viewport width the workspace rail becomes an off-canvas drawer.
 *
 * The number is derived, not picked: the global rail is 56px and the
 * workspace rail 224px, so a persistent rail costs 280px of every viewport.
 * `DetailDock` already declares 560px as the floor below which a pane squeezes
 * its sibling into uselessness — 280 + 560 = 840px is therefore the narrowest
 * viewport that can host BOTH the rail and a working surface. 1024 is the
 * nearest standard step above it (Tailwind `lg`), which also keeps a 768px
 * tablet — the stated operator scene — on the drawer rather than 1px above
 * the cliff.
 */
export const SHELL_RAIL_MIN_WIDTH = 1024;

interface WorkspaceShellProps {
  identity: WorkspaceIdentity;
  modules: WorkspaceModule[];
  /** The module catalog could not be read, so `modules` is not a fact about
   *  this workspace — it is empty for want of an answer. The sidebar says so
   *  rather than rendering a rail that reads as "no modules here". */
  modulesUnknown?: boolean;
  onRetryModules?: () => void;
  tid: string;
  kind: WsKind;
  activeTab: AppTab;
  /** Whether a WORKSPACE admin section is active (drives the gear highlight). */
  adminActive: boolean;
  onOpenAdmin: () => void;
  onBackToHub: () => void;
  statusSlot?: ReactNode;
  children: ReactNode;
}

/** The stable workspace chrome: an identity-only top bar (name · date · status)
 *  with a workspace-admin gear + operational status pill, over a body split into
 *  the grouped left sidebar and the active surface.
 *
 *  Below `SHELL_RAIL_MIN_WIDTH` the sidebar moves into an off-canvas drawer
 *  behind a trigger in that top bar, and the surface gets the full width. A
 *  drawer rather than an icon rail because the nav is deliberately
 *  ICON-FREE (see WorkspaceSidebar) — a rail would mean inventing a glyph per
 *  segment, i.e. a second nav vocabulary to keep in step with the first. */
export function WorkspaceShell({
  identity,
  modules,
  modulesUnknown,
  onRetryModules,
  tid,
  kind,
  activeTab,
  adminActive,
  onOpenAdmin,
  onBackToHub,
  statusSlot,
  children,
}: WorkspaceShellProps) {
  const compact = useViewportBelow(SHELL_RAIL_MIN_WIDTH);
  const [navOpen, setNavOpen] = useState(false);
  // Widening back past the breakpoint hands the rail back; a drawer left open
  // over a surface that already shows its nav is a dead scrim.
  useEffect(() => {
    if (!compact) setNavOpen(false);
  }, [compact]);

  const sidebar = (onNavigate?: () => void) => (
    <WorkspaceSidebar
      tid={tid}
      kind={kind}
      modules={modules}
      modulesUnknown={modulesUnknown}
      onRetryModules={onRetryModules}
      activeTab={activeTab}
      onNavigate={onNavigate}
    />
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="sticky top-0 z-chrome flex h-12 flex-shrink-0 items-center justify-between gap-3 border-b border-border bg-card px-4">
        {compact ? (
          <button
            type="button"
            data-testid="workspace-nav-trigger"
            aria-label="Workspace sections"
            aria-expanded={navOpen}
            onClick={() => setNavOpen(true)}
            className="-ml-1 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <List aria-hidden className="h-5 w-5" />
          </button>
        ) : null}
        <WorkspaceIdentityBar identity={identity} onBackToHub={onBackToHub} />
        <div className="flex items-center gap-2">
          <button
            type="button"
            data-testid="workspace-admin-gear"
            aria-label="Workspace administration"
            aria-pressed={adminActive}
            title="Workspace administration"
            onClick={onOpenAdmin}
            className={[
              'inline-flex h-7 w-7 items-center justify-center rounded transition-colors',
              adminActive
                ? 'bg-accent/10 text-accent'
                : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground',
            ].join(' ')}
          >
            <GearSix aria-hidden className="h-4 w-4" />
          </button>
          {statusSlot}
        </div>
      </div>
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {compact ? null : sidebar()}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">{children}</div>
      </div>

      {/* Off-canvas nav. `Modal` (not a hand-rolled panel) for the focus trap,
          Escape, backdrop dismiss and focus restore it already implements;
          `fixed` on the panel overrides its centred default so the drawer
          hangs off the left edge instead of the wrapper's padding box. */}
      {compact && navOpen ? (
        <Modal
          onClose={() => setNavOpen(false)}
          titleId="workspace-nav-heading"
          panelClassName="fixed inset-y-0 left-0 flex w-56 max-w-[85vw] flex-col overflow-hidden bg-card focus:outline-none"
        >
          <h2 id="workspace-nav-heading" className="sr-only">
            Workspace sections
          </h2>
          {sidebar(() => setNavOpen(false))}
        </Modal>
      ) : null}
    </div>
  );
}

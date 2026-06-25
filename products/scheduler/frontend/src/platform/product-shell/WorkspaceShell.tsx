import type { ReactNode } from 'react';
import { GearSix } from '@phosphor-icons/react';
import { WorkspaceIdentityBar } from './WorkspaceIdentityBar';
import { WorkspaceSidebar } from './WorkspaceSidebar';
import type { WorkspaceModule, WorkspaceIdentity } from './types';
import type { AppTab } from '../../store/uiStore';
import type { WsKind } from '../../app/workspace/workspaceNav';

interface WorkspaceShellProps {
  identity: WorkspaceIdentity;
  modules: WorkspaceModule[];
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
 *  the grouped left sidebar and the active surface. */
export function WorkspaceShell({
  identity,
  modules,
  tid,
  kind,
  activeTab,
  adminActive,
  onOpenAdmin,
  onBackToHub,
  statusSlot,
  children,
}: WorkspaceShellProps) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="sticky top-0 z-chrome flex h-12 flex-shrink-0 items-center justify-between gap-3 border-b border-border bg-card px-4">
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
        <WorkspaceSidebar tid={tid} kind={kind} modules={modules} activeTab={activeTab} />
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
      </div>
    </div>
  );
}

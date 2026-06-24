import type { ReactNode } from 'react';
import { ModuleDock } from './ModuleDock';
import { WorkspaceIdentityBar } from './WorkspaceIdentityBar';
import type { ModuleId, WorkspaceModule, WorkspaceIdentity } from './types';

interface WorkspaceShellProps {
  identity: WorkspaceIdentity;
  modules: WorkspaceModule[];
  activeModule: ModuleId;
  onSelectModule: (id: ModuleId) => void;
  onEnableModule?: (id: ModuleId) => void;
  onBackToHub: () => void;
  statusSlot?: ReactNode;
  children: ReactNode;
}

/** The stable workspace chrome: a top bar with identity, the Module Dock,
 *  and a status/connection slot, hosting the active module below. */
export function WorkspaceShell({
  identity,
  modules,
  activeModule,
  onSelectModule,
  onEnableModule,
  onBackToHub,
  statusSlot,
  children,
}: WorkspaceShellProps) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="sticky top-0 z-chrome flex h-12 flex-shrink-0 items-center justify-between gap-3 border-b border-border bg-card px-4">
        <WorkspaceIdentityBar identity={identity} onBackToHub={onBackToHub} />
        <ModuleDock
          modules={modules}
          active={activeModule}
          onSelect={onSelectModule}
          onEnable={onEnableModule}
        />
        <div className="flex items-center gap-2">{statusSlot}</div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
    </div>
  );
}

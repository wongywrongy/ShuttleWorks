/**
 * The workspace left sidebar — primary in-workspace navigation (replaces the
 * top ModuleDock + horizontal TabBar). Grouped sections (Meet / Bracket /
 * Operations / Display / Workspace) with non-interactive uppercase labels and
 * indented items; the active item gets a left-edge accent bar.
 */
import { useNavigate } from 'react-router-dom';
import type { AppTab } from '../../store/uiStore';
import type { ModuleId, WorkspaceModule } from './types';
import { buildWorkspaceNav, type WsKind } from '../../app/workspace/workspaceNav';

interface WorkspaceSidebarProps {
  tid: string;
  kind: WsKind;
  modules: WorkspaceModule[];
  activeTab: AppTab;
}

export function WorkspaceSidebar({ tid, kind, modules, activeTab }: WorkspaceSidebarProps) {
  const navigate = useNavigate();
  const enabled = new Set<ModuleId>(
    modules.filter((m) => m.status === 'enabled').map((m) => m.id),
  );
  const groups = buildWorkspaceNav(kind, enabled);

  return (
    <nav
      aria-label="Workspace"
      className="flex h-full w-52 shrink-0 flex-col gap-3 overflow-y-auto border-r border-border bg-card/40 p-3"
    >
      {groups.map((g) => (
        <div key={g.id} className="space-y-0.5">
          {g.label ? (
            <div className="px-2 pb-1 text-2xs font-semibold uppercase tracking-[0.1em] text-muted-foreground/70">
              {g.label}
            </div>
          ) : null}
          {g.items.map((it) => {
            const active = it.segment === activeTab;
            return (
              <button
                key={it.segment}
                type="button"
                data-testid={`ws-nav-${it.segment}`}
                aria-current={active ? 'page' : undefined}
                onClick={() => navigate(`/tournaments/${tid}/${it.segment}`, { replace: true })}
                className={[
                  'relative block w-full rounded-sm py-1.5 pl-3 pr-2 text-left text-sm',
                  active
                    ? 'bg-accent/10 font-medium text-accent'
                    : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground',
                ].join(' ')}
              >
                {active ? (
                  <span
                    aria-hidden
                    className="absolute bottom-1 left-0 top-1 w-0.5 rounded-full bg-accent"
                  />
                ) : null}
                {it.label}
              </button>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

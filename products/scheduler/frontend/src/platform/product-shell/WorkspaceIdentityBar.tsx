import { ArrowLeft } from '@phosphor-icons/react';
import { StatusPill } from '@scheduler/design-system';
import { INTERACTIVE_BASE } from '../../lib/utils';
import type { WorkspaceIdentity } from './types';

interface WorkspaceIdentityBarProps {
  identity: WorkspaceIdentity;
  onBackToHub: () => void;
}

function statusTone(status: WorkspaceIdentity['status']) {
  if (status === 'active') return 'green' as const;
  if (status === 'archived') return 'idle' as const;
  return 'done' as const;
}

/** Back-to-Hub control + workspace name · date · status badge. */
export function WorkspaceIdentityBar({ identity, onBackToHub }: WorkspaceIdentityBarProps) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <button
        type="button"
        onClick={onBackToHub}
        aria-label="Back to workspaces"
        title="Back to workspaces"
        className={[
          INTERACTIVE_BASE,
          'inline-flex h-7 w-7 items-center justify-center rounded-sm border border-border text-muted-foreground',
          'hover:bg-muted/40 hover:text-foreground',
        ].join(' ')}
      >
        <ArrowLeft size={14} aria-hidden="true" />
      </button>
      <div className="flex min-w-0 items-baseline gap-2">
        <span className="truncate text-sm font-semibold text-foreground">
          {identity.name || 'Untitled'}
        </span>
        {identity.date ? (
          <span className="text-xs text-muted-foreground tabular-nums">{identity.date}</span>
        ) : null}
        {identity.status ? (
          <StatusPill tone={statusTone(identity.status)}>{identity.status}</StatusPill>
        ) : null}
      </div>
    </div>
  );
}

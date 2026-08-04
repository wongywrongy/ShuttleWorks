import { ArrowLeft } from '@phosphor-icons/react';
import { StatusPill } from '@scheduler/design-system';
import { INTERACTIVE_BASE } from '../../lib/utils';
import { lifecycleBadge } from '../domain/lifecycle';
import type { WorkspaceIdentity } from './types';

interface WorkspaceIdentityBarProps {
  identity: WorkspaceIdentity;
  onBackToHub: () => void;
}

/** Format the workspace's ISO date (`2026-10-01`) as `Oct 1, 2026`, matching
 *  the Hub/Overview presentation instead of leaking raw ISO into the shell.
 *  Parsed from date parts so a date-only string never drifts a day across
 *  timezones. Falls back to the raw string if it isn't a plain ISO date. */
function formatWorkspaceDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

/** Maps a workspace status to a StatusPill tone (the pill text still shows the
 *  literal status). active → green; archived → idle (muted); draft / null →
 *  `done`, the design-system's neutral grey tone (NOT "finished") — matching the
 *  Hub row/inspector pills. */
function statusTone(status: WorkspaceIdentity['status']) {
  if (status === 'active') return 'green' as const;
  if (status === 'archived') return 'idle' as const;
  return 'done' as const;
}

/** The badge the shell actually shows: the shared lifecycle precedence
 *  (archived > live > complete — see platform/domain/lifecycle.ts), falling
 *  back to the raw operator status pill when neither applies. */
function shellBadge(
  identity: WorkspaceIdentity,
): { text: string; tone: 'green' | 'idle' | 'done' } | null {
  const badge = lifecycleBadge(identity.phase, identity.status);
  if (badge) return badge;
  if (identity.status) return { text: identity.status, tone: statusTone(identity.status) };
  return null;
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
          <span className="text-xs text-muted-foreground tabular-nums">
            {formatWorkspaceDate(identity.date)}
          </span>
        ) : null}
        {(() => {
          const badge = shellBadge(identity);
          return badge ? <StatusPill tone={badge.tone}>{badge.text}</StatusPill> : null;
        })()}
      </div>
    </div>
  );
}

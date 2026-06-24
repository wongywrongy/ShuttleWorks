import { Button, StatusPill } from '@scheduler/design-system';
import type { TournamentSummaryDTO } from '../../api/dto';
import {
  modulesForWorkspace,
  modulesFromDto,
} from '../../platform/domain/moduleModel';
import {
  workspaceHealth,
  readinessOf,
  attentionReasons,
  collaborationOf,
  moduleCountsOf,
  healthDotClass,
} from './hubSignals';

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString();
}

function statusTone(status: TournamentSummaryDTO['status']) {
  return status === 'active' ? 'green' : status === 'archived' ? 'idle' : 'done';
}

interface InspectorProps {
  tournament: TournamentSummaryDTO | null;
  onOpen: (id: string) => void;
  onSettings: (id: string) => void;
}

/** Right-side inspector: the selected workspace's server-computed signal
 *  (health, readiness, attention reasons, collaboration counts) + its full
 *  module catalog (real `modules[]` when present, else kind-derived). */
export function WorkspaceInspector({ tournament, onOpen, onSettings }: InspectorProps) {
  if (!tournament) {
    return (
      <aside className="hidden w-80 shrink-0 flex-col border-l border-border bg-card/40 lg:flex">
        <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-muted-foreground/70">
          Select a workspace to see its modules and details.
        </div>
      </aside>
    );
  }

  const modules = tournament.modules
    ? modulesFromDto(tournament.modules)
    : modulesForWorkspace(tournament.kind);
  const health = workspaceHealth(tournament);
  const readiness = readinessOf(tournament);
  const reasons = attentionReasons(tournament);
  const collab = collaborationOf(tournament);
  const moduleCounts = moduleCountsOf(tournament);

  return (
    <aside className="hidden w-80 shrink-0 flex-col overflow-y-auto border-l border-border bg-card/40 lg:flex">
      <div className="border-b border-border p-4">
        <div className="text-2xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          WORKSPACE
        </div>
        <h2 className="mt-1 truncate text-base font-semibold text-foreground">
          {tournament.name || 'Untitled'}
        </h2>
        <div className="mt-2 flex items-center gap-2">
          <StatusPill tone={statusTone(tournament.status)}>{tournament.status}</StatusPill>
          <span className="text-xs capitalize text-muted-foreground">
            {tournament.role ?? '—'}
          </span>
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-x-3 gap-y-2 border-b border-border p-4 text-xs">
        <dt className="text-muted-foreground">Date</dt>
        <dd className="text-right tabular-nums text-foreground">{fmtDate(tournament.tournamentDate)}</dd>
        <dt className="text-muted-foreground">Owner</dt>
        <dd className="truncate text-right text-foreground">{tournament.ownerName ?? '—'}</dd>
        <dt className="text-muted-foreground">Updated</dt>
        <dd className="text-right tabular-nums text-foreground">{fmtDate(tournament.updatedAt)}</dd>
      </dl>

      <div className="space-y-3 border-b border-border p-4">
        <div className="flex items-center justify-between">
          <span className="text-2xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            SIGNAL
          </span>
          <span
            data-testid="inspector-health"
            className="inline-flex items-center gap-1.5 text-xs capitalize text-foreground"
          >
            <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${healthDotClass(health)}`} />
            {health}
            {readiness ? (
              <span className="tabular-nums text-muted-foreground">
                {' · '}
                {readiness.ready}/{readiness.total} ready
              </span>
            ) : null}
          </span>
        </div>
        {reasons.length > 0 ? (
          <ul data-testid="inspector-attention" className="space-y-1">
            {reasons.map((r) => (
              <li key={r.code} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                <span aria-hidden className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-status-warning" />
                {r.label}
              </li>
            ))}
          </ul>
        ) : null}
        {collab ? (
          <div
            data-testid="inspector-collab"
            className="flex items-center gap-4 text-xs text-muted-foreground"
          >
            <span>
              <span className="tabular-nums text-foreground">{collab.memberCount}</span>{' '}
              member{collab.memberCount === 1 ? '' : 's'}
            </span>
            <span>
              <span className="tabular-nums text-foreground">{collab.activeInviteCount}</span>{' '}
              active invite{collab.activeInviteCount === 1 ? '' : 's'}
            </span>
          </div>
        ) : null}
      </div>

      <div className="border-b border-border p-4">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-2xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            MODULES
          </span>
          {moduleCounts ? (
            <span data-testid="inspector-module-counts" className="text-2xs tabular-nums text-muted-foreground">
              {moduleCounts.enabled} enabled · {moduleCounts.available} available
            </span>
          ) : null}
        </div>
        <ul className="space-y-1.5">
          {modules.map((m) => (
            <li key={m.id} className="flex items-center justify-between gap-2" title={m.note}>
              <span className="text-sm text-foreground">{m.label}</span>
              <span
                className={[
                  'rounded-sm px-1.5 py-0.5 text-2xs font-medium capitalize',
                  m.status === 'enabled'
                    ? 'bg-accent/10 text-accent'
                    : m.status === 'available'
                      ? 'border border-border text-muted-foreground'
                      : 'border border-dashed border-border text-muted-foreground/60',
                ].join(' ')}
              >
                {m.status.replace('-', ' ')}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div className="p-4">
        <Button className="w-full" onClick={() => onOpen(tournament.id)}>
          Open workspace
        </Button>
        <Button
          variant="ghost"
          className="mt-2 w-full"
          onClick={() => onSettings(tournament.id)}
        >
          Settings
        </Button>
      </div>
    </aside>
  );
}

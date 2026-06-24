/**
 * A single workspace row in the Hub control-plane list. Shows a health dot +
 * name, module chips, the signal-metrics cluster, role/owner/updated columns,
 * a status pill, the primary next-action button (derived from signals), and an
 * overflow menu carrying Settings + (owner-only) Delete. Destructive actions
 * live in the overflow, never inline on the row surface.
 */
import type { TournamentSummaryDTO } from '../../api/dto';
import { Button, StatusPill } from '@scheduler/design-system';
import { HealthDot, OverflowMenu, type OverflowItem } from '../../components/control-plane';
import {
  modulesForWorkspace,
  modulesFromDto,
} from '../../platform/domain/moduleModel';
import {
  workspaceHealth,
  readinessOf,
  attentionReasons,
  collaborationOf,
} from './hubSignals';
import { nextActionFor } from './nextAction';

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString();
}

/** Module chips for a workspace row. Reads the real persisted `modules` from the
 *  summary DTO when present, else falls back to the kind-derived catalog. Omits a
 *  coming-soon foreign operator to keep the row clean, but keeps Display's
 *  coming-soon as an informative chip. */
function ModuleChips({ tournament }: { tournament: TournamentSummaryDTO }) {
  const all = tournament.modules
    ? modulesFromDto(tournament.modules)
    : modulesForWorkspace(tournament.kind);
  const chips = all.filter((m) => m.status !== 'coming-soon' || m.id === 'display');
  return (
    <div className="flex flex-wrap items-center gap-1">
      {chips.map((m) => {
        const soon = m.status === 'coming-soon';
        return (
          <span
            key={m.id}
            title={soon ? m.note : undefined}
            data-testid={`chip-${m.id}`}
            className={[
              'inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-2xs font-medium',
              m.status === 'enabled'
                ? 'bg-accent/10 text-accent'
                : soon
                  ? 'border border-dashed border-border text-muted-foreground/60'
                  : 'border border-border text-muted-foreground',
            ].join(' ')}
          >
            <span
              aria-hidden
              className={[
                'h-1 w-1 shrink-0 rounded-full',
                m.status === 'enabled'
                  ? 'bg-accent'
                  : m.status === 'available'
                    ? 'border border-accent'
                    : 'border border-muted-foreground/40',
              ].join(' ')}
            />
            {m.label}
            {soon ? ' · soon' : ''}
          </span>
        );
      })}
    </div>
  );
}

interface RowProps {
  tournament: TournamentSummaryDTO;
  selected: boolean;
  onSelect: () => void;
  onOpen: () => void;
  onSettings: () => void;
  onDelete?: () => void;
}

export function WorkspaceRow({ tournament, selected, onSelect, onOpen, onSettings, onDelete }: RowProps) {
  const health = workspaceHealth(tournament);
  const readiness = readinessOf(tournament);
  const reasons = attentionReasons(tournament);
  const collab = collaborationOf(tournament);
  const action = nextActionFor(tournament);

  const overflowItems: OverflowItem[] = [
    { key: 'settings', label: 'Settings', onSelect: onSettings },
    ...(onDelete
      ? [{ key: 'delete', label: 'Delete', onSelect: onDelete, destructive: true, testId: 'overflow-delete' } as OverflowItem]
      : []),
  ];

  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
      className={[
        'flex cursor-pointer items-center gap-4 px-4 py-3 text-sm',
        selected ? 'bg-accent/5' : 'hover:bg-muted/40',
      ].join(' ')}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <HealthDot health={health} />
          <span className="truncate font-medium text-foreground">
            {tournament.name || 'Untitled'}
          </span>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
          <ModuleChips tournament={tournament} />
          {readiness || reasons.length > 0 || collab ? (
            <span
              data-testid="row-metrics"
              className="flex items-center gap-3 text-2xs tabular-nums text-muted-foreground"
            >
              {readiness ? (
                <span>
                  {readiness.ready}/{readiness.total} ready
                </span>
              ) : null}
              {reasons.length > 0 ? (
                <span className="text-status-warning">{reasons.length} to address</span>
              ) : null}
              {collab ? (
                <span>
                  {collab.memberCount} member{collab.memberCount === 1 ? '' : 's'}
                </span>
              ) : null}
              {collab && collab.activeInviteCount > 0 ? (
                <span>{collab.activeInviteCount} pending</span>
              ) : null}
            </span>
          ) : null}
        </div>
      </div>
      <span className="hidden w-20 text-right text-xs capitalize text-muted-foreground sm:block">
        {tournament.role ?? '—'}
      </span>
      <span className="hidden w-40 truncate text-right text-xs text-muted-foreground md:block">
        {tournament.ownerName ?? '—'}
      </span>
      <span className="hidden w-24 text-right text-xs tabular-nums text-muted-foreground lg:block">
        {formatDate(tournament.updatedAt)}
      </span>
      <StatusPill
        tone={
          tournament.status === 'active'
            ? 'green'
            : tournament.status === 'archived'
              ? 'idle'
              : 'done'
        }
      >
        {tournament.status}
      </StatusPill>
      <Button
        variant="ghost"
        onClick={(e) => {
          e.stopPropagation();
          onOpen();
        }}
      >
        {action.label}
      </Button>
      <OverflowMenu items={overflowItems} />
    </div>
  );
}

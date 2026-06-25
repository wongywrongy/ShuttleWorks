/**
 * A single workspace row in the time-oriented Hub list. The event date is the
 * anchor (left, prominent); then the workspace name, its module chips, and a
 * single plain-language next action. The health indicator is secondary (a small
 * dot by the name), not the lead. Destructive actions live in an overflow menu
 * that reveals on hover/focus — never inline on the row surface.
 *
 * Deliberately omits owner/identity, raw status badges, and aggregate metrics:
 * the time section + health dot carry that, and the detail lives in the
 * inspector.
 */
import type { TournamentSummaryDTO } from '../../api/dto';
import { Button } from '@scheduler/design-system';
import { HealthDot, OverflowMenu, type OverflowItem } from '../../components/control-plane';
import { modulesForWorkspace, modulesFromDto } from '../../platform/domain/moduleModel';
import { workspaceHealth } from './hubSignals';
import { rowActionFor } from './nextAction';
import { eventDate, type HubGroupId } from './hubGrouping';

/** Calendar-style date anchor: month / big day / year. Undated reads as a muted
 *  placeholder so the column still aligns. */
function DateAnchor({ iso, receded }: { iso: string | null; receded: boolean }) {
  if (!iso) {
    return (
      <div className="w-14 shrink-0 text-center font-mono text-2xs uppercase text-muted-foreground/50">
        No date
      </div>
    );
  }
  const d = eventDate(iso);
  const valid = !Number.isNaN(d.getTime());
  const mon = valid ? d.toLocaleDateString(undefined, { month: 'short' }) : '';
  const day = valid ? d.toLocaleDateString(undefined, { day: 'numeric' }) : iso.slice(0, 10);
  const year = valid ? d.toLocaleDateString(undefined, { year: 'numeric' }) : '';
  return (
    <div className={`w-14 shrink-0 text-center ${receded ? 'text-muted-foreground' : ''}`}>
      <div className="font-mono text-2xs uppercase tracking-[0.06em] text-muted-foreground">{mon}</div>
      <div className="text-xl font-semibold leading-none tabular-nums">{day}</div>
      <div className="font-mono text-2xs tabular-nums text-muted-foreground/70">{year}</div>
    </div>
  );
}

/** Only the *enabled* modules — the row reflects what is actually active in the
 *  workspace, nothing more. Available/disabled modules are not shown. */
function ModuleChips({ tournament }: { tournament: TournamentSummaryDTO }) {
  const all = tournament.modules
    ? modulesFromDto(tournament.modules)
    : modulesForWorkspace(tournament.kind);
  const chips = all.filter((m) => m.status === 'enabled');
  if (chips.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1">
      {chips.map((m) => (
        <span
          key={m.id}
          data-testid={`chip-${m.id}`}
          className="inline-flex items-center gap-1 rounded-sm bg-accent/10 px-1.5 py-0.5 text-2xs font-medium text-accent"
        >
          <span aria-hidden className="h-1 w-1 shrink-0 rounded-full bg-accent" />
          {m.label}
        </span>
      ))}
    </div>
  );
}

interface RowProps {
  tournament: TournamentSummaryDTO;
  group: HubGroupId;
  selected: boolean;
  onSelect: () => void;
  onOpen: () => void;
  onSetDate: () => void;
  onSettings: () => void;
  onDelete?: () => void;
}

export function WorkspaceRow({
  tournament,
  group,
  selected,
  onSelect,
  onOpen,
  onSetDate,
  onSettings,
  onDelete,
}: RowProps) {
  const health = workspaceHealth(tournament);
  const action = rowActionFor(tournament, group);
  const receded = group === 'past';

  const overflowItems: OverflowItem[] = [
    { key: 'settings', label: 'Settings', onSelect: onSettings },
    ...(onDelete
      ? [{ key: 'delete', label: 'Delete', onSelect: onDelete, destructive: true, testId: 'overflow-delete' } as OverflowItem]
      : []),
  ];

  return (
    // A plain clickable region for selecting the row (populates the inspector).
    // Not a role=button/option: it embeds interactive children (the action
    // button + overflow menu), which ARIA forbids inside a widget role.
    <div
      onClick={onSelect}
      className={[
        'group flex cursor-pointer items-center gap-4 px-4 py-3 text-sm',
        receded ? 'opacity-60 hover:opacity-100' : '',
        selected ? 'bg-accent/5' : 'hover:bg-muted/40',
      ].join(' ')}
    >
      <DateAnchor iso={tournament.tournamentDate} receded={receded} />

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate font-medium text-foreground">
            {tournament.name || 'Untitled'}
          </span>
          <HealthDot health={health} />
        </div>
        <div className="mt-1">
          <ModuleChips tournament={tournament} />
        </div>
      </div>

      <Button
        variant={receded ? 'ghost' : action.kind === 'open' ? 'outline' : 'ghost'}
        onClick={(e) => {
          e.stopPropagation();
          if (action.kind === 'set-date') onSetDate();
          else onOpen();
        }}
      >
        {action.label}
      </Button>

      <span className="opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
        <OverflowMenu items={overflowItems} />
      </span>
    </div>
  );
}

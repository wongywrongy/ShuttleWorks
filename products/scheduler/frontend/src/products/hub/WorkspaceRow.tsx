/**
 * A single workspace row in the Hub's dense list — the handoff prototype's
 * "Hub — workspace dashboard" table grammar: a tabular DATE column, the
 * workspace NAME (health dot secondary), and one plain-language NEXT ACTION
 * as quiet text (amber when it needs input). Nothing else rides the row —
 * the old stacked calendar block, per-row module chips and per-row action
 * buttons were extraneous chrome (2026-07-02 redesign); modules/metrics/
 * buttons live in the inspector. Destructive actions stay in an overflow
 * menu that reveals on hover/focus — never inline on the row surface.
 */
import type { TournamentSummaryDTO } from '../../api/dto';
import { HealthDot, OverflowMenu, type OverflowItem } from '../../components/control-plane';
import { workspaceHealth } from './hubSignals';
import { rowActionFor } from './nextAction';
import { eventDate, type HubGroupId } from './hubGrouping';

/** Tabular date cell — "Jul 12" (year only when it isn't this year); undated
 *  reads as a muted em-dash so the column still aligns. */
function DateCell({ iso, receded }: { iso: string | null; receded: boolean }) {
  if (!iso) {
    return (
      <span className="w-14 shrink-0 text-2xs sw-num text-muted-foreground/50">—</span>
    );
  }
  const d = eventDate(iso);
  const valid = !Number.isNaN(d.getTime());
  const sameYear = valid && d.getFullYear() === new Date().getFullYear();
  const label = valid
    ? d.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        ...(sameYear ? {} : { year: '2-digit' }),
      })
    : iso.slice(0, 10);
  return (
    <span
      className={`w-14 shrink-0 text-2xs sw-num ${receded ? 'text-muted-foreground/60' : 'text-muted-foreground'}`}
    >
      {label}
    </span>
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
  // "Set date" (and any reason-coded setup step) is the attention-y next
  // action — it warms to amber; Open/View results stay quiet.
  const attention = action.kind === 'set-date';

  const overflowItems: OverflowItem[] = [
    { key: 'settings', label: 'Settings', onSelect: onSettings },
    ...(onDelete
      ? [{ key: 'delete', label: 'Delete', onSelect: onDelete, destructive: true, testId: 'overflow-delete' } as OverflowItem]
      : []),
  ];

  return (
    // A plain clickable region for selecting the row (populates the inspector).
    // Not a role=button/option: it embeds interactive children (the action
    // text-button + overflow menu), which ARIA forbids inside a widget role.
    <div
      onClick={onSelect}
      className={[
        'group flex min-h-[40px] cursor-pointer items-center gap-3 px-4 py-2 text-sm',
        'transition-colors duration-fast ease-brand',
        receded ? 'opacity-60 hover:opacity-100' : '',
        selected
          ? 'bg-bg-elev shadow-[inset_2px_0_0_hsl(var(--accent))]'
          : 'hover:bg-muted/40',
      ].join(' ')}
    >
      <DateCell iso={tournament.tournamentDate} receded={receded} />

      <span className="flex min-w-0 flex-1 items-center gap-1.5">
        <span className="truncate font-medium text-foreground">
          {tournament.name || 'Untitled'}
        </span>
        <HealthDot health={health} />
      </span>

      {/* NEXT ACTION — quiet text, not a boxed button. Still a real button
          (same accessible name + click behavior as before the redesign). */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          if (action.kind === 'set-date') onSetDate();
          else onOpen();
        }}
        className={[
          'w-40 shrink-0 truncate text-left text-xs',
          'transition-colors duration-fast ease-brand',
          attention
            ? 'text-status-warning hover:brightness-110'
            : 'text-muted-foreground hover:text-accent',
        ].join(' ')}
      >
        {action.label}
      </button>

      <span className="opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
        <OverflowMenu items={overflowItems} />
      </span>
    </div>
  );
}

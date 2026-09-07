/**
 * A single workspace row in the Hub's dense list.
 *
 * The row reads left → right as **who / when**, then **what it runs / what to
 * do next**:
 *
 *   [•] Name  2026-07-28 → 08-03            M B D   Open live day   ⋯
 *
 * Left: an attention DOT (only when something is wrong) and the workspace
 * name, followed by the numeric event date. The dot replaced a column of
 * multi-line attention prose — a paragraph per row, wrapping, on the one
 * surface whose job is to say *which* workspace needs the director. The dot
 * says THAT; the inspector says what, in full. It is a real button with an
 * accessible label, so touch and keyboard reach it (a bare tinted span reached
 * neither).
 *
 * Right: module glyphs (each with an accessible name), the plain-language next
 * action, and the overflow menu. Destructive actions never sit inline.
 */
import type { TournamentSummaryDTO } from '../../api/dto';
import {
  OverflowMenu,
  COL_PRIORITY_CLASS,
  type OverflowItem,
} from '../../components/control-plane';
import { lifecycleChip } from '../../platform/domain/lifecycle';
import { modulesForWorkspace, modulesFromDto } from '../../platform/domain/moduleModel';
import { attentionReasons, workspaceHealth } from './hubSignals';
import { rowActionFor } from './nextAction';
import { type HubGroupId } from './hubGrouping';
import { displayWorkspaceName, formatEventRange } from './workspaceLabel';

/** The attention dot. Silent when nothing is wrong — a calm list is the point.
 *  When something is, it is a focusable control whose accessible name states
 *  the leading reason and how many more there are; activating it opens the
 *  inspector, where every reason is listed. */
function AttentionDot({
  tournament,
  onOpenDetails,
}: {
  tournament: TournamentSummaryDTO;
  onOpenDetails: () => void;
}) {
  const reasons = attentionReasons(tournament);
  if (workspaceHealth(tournament) !== 'attention') return null;
  const first = reasons[0];
  const extra = Math.max(0, reasons.length - 1);
  const label = first
    ? `Needs attention: ${first.label}${extra > 0 ? ` and ${extra} more issue${extra === 1 ? '' : 's'}` : ''}. Open details.`
    : 'Needs attention. Open details.';
  return (
    <button
      type="button"
      data-testid="row-attention"
      aria-label={label}
      title={reasons.map((r) => r.label).join(' · ') || 'Needs attention'}
      onClick={(e) => {
        e.stopPropagation();
        onOpenDetails();
      }}
      // 24px hit area around a 8px dot: a touch target, not a decoration.
      className="-m-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
    >
      <span aria-hidden className="h-2 w-2 rounded-full bg-status-warning" />
    </button>
  );
}

/** Enabled-module glyphs. One letter each, every one with an accessible name —
 *  a lone "M" is meaningless to a screen reader and to a new operator. */
function ModuleGlyphs({ tournament }: { tournament: TournamentSummaryDTO }) {
  const modules = (
    tournament.modules ? modulesFromDto(tournament.modules) : modulesForWorkspace(tournament.kind)
  ).filter((m) => m.status === 'enabled');
  if (modules.length === 0) return null;
  return (
    <span
      data-testid="row-modules"
      aria-label="Enabled modules"
      className={['flex shrink-0 items-center gap-1', COL_PRIORITY_CLASS[3]].join(' ')}
    >
      {modules.map((m) => (
        <span
          key={m.id}
          role="img"
          aria-label={m.label}
          title={m.label}
          className="flex h-4 w-4 items-center justify-center rounded-xs bg-surface-chip text-2xs font-semibold uppercase text-muted-foreground"
        >
          {m.label.slice(0, 1)}
        </span>
      ))}
    </span>
  );
}

interface RowProps {
  tournament: TournamentSummaryDTO;
  group: HubGroupId;
  /** False when NO visible row has a date — the whole date slot is hidden
   *  instead of rendering a rail of muted em-dashes (2026-07 cleanup). */
  showDate?: boolean;
  selected: boolean;
  /** False when every visible row would carry the SAME lifecycle chip — the
   *  view already states it once, so repeating it per row is decoration. */
  showLifecycleBadge?: boolean;
  onSelect: () => void;
  onOpen: (segment?: string) => void;
  onSetDate: () => void;
  onSettings: () => void;
  onDelete?: () => void;
}

export function WorkspaceRow({
  tournament,
  group,
  showDate = true,
  selected,
  showLifecycleBadge = true,
  onSelect,
  onOpen,
  onSetDate,
  onSettings,
  onDelete,
}: RowProps) {
  const action = rowActionFor(tournament, group);
  const badge = showLifecycleBadge
    ? lifecycleChip(tournament.signals?.phase, tournament.status)
    : null;
  const dateLabel = formatEventRange(tournament);
  // "Set date" (and any reason-coded setup step) is the attention-y next
  // action — it warms to amber; Open/View results stay quiet.
  const attention = action.kind === 'set-date';

  const overflowItems: OverflowItem[] = [
    {
      key: 'settings',
      label: 'Open administration',
      to: `/tournaments/${encodeURIComponent(tournament.id)}/administration/lifecycle`,
      onSelect: onSettings,
    },
    ...(onDelete
      ? [{ key: 'delete', label: 'Delete', onSelect: onDelete, destructive: true, separator: true, testId: 'overflow-delete' } as OverflowItem]
      : []),
  ];

  return (
    // A plain clickable region for selecting the row (populates the inspector).
    // Not a role=button/option: it embeds interactive children (the action
    // text-button + overflow menu), which ARIA forbids inside a widget role.
    <div
      onClick={onSelect}
      className={[
        'group flex min-h-[40px] cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-2sm @container/table',
        'transition-colors duration-fast ease-brand',
        selected
          ? 'bg-bg-elev shadow-[inset_2px_0_0_hsl(var(--accent))]'
          : 'hover:bg-muted/40',
      ].join(' ')}
    >
      {/* NAME + DATE lead: the two facts the director scans a Hub for. */}
      <span className="flex min-w-[12rem] flex-1 items-center gap-2.5">
        <AttentionDot tournament={tournament} onOpenDetails={onSelect} />
        <span className="min-w-0 break-words text-2sm font-semibold text-foreground">
          {displayWorkspaceName(tournament)}
        </span>
        {showDate && dateLabel ? (
          <span
            data-testid="row-date"
            className="shrink-0 text-2xs sw-num text-muted-foreground"
          >
            {dateLabel}
          </span>
        ) : null}
        {badge ? (
          <span data-testid="row-lifecycle" className="shrink-0 text-xs text-muted-foreground">
            {badge.text}
          </span>
        ) : null}
      </span>

      <ModuleGlyphs tournament={tournament} />

      {/* NEXT ACTION — the point of the control-plane model, so it reads as
          the row's call to action rather than as another metadata column. */}
      <button
        type="button"
        data-testid="row-next-action"
        onClick={(e) => {
          e.stopPropagation();
          if (action.kind === 'set-date') onSetDate();
          else onOpen(action.segment);
        }}
        className={[
          'flex w-40 shrink-0 items-center justify-between gap-1 rounded-sm px-2 py-1 text-left text-xs',
          'transition-colors duration-fast ease-brand',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
          attention
            ? 'text-status-warning group-hover:bg-status-warning/10'
            : 'text-accent group-hover:bg-action-selected-bg group-hover:text-action-selected-foreground',
        ].join(' ')}
      >
        <span className="min-w-0 break-words">{action.label}</span>
        <span
          aria-hidden
          className="shrink-0 opacity-0 transition-opacity duration-fast ease-brand group-hover:opacity-100"
        >
          &rsaquo;
        </span>
      </button>

      {/* Quiet at rest, not absent: `:hover` never fires on a touch device. */}
      <span className="opacity-60 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
        <OverflowMenu items={overflowItems} />
      </span>
    </div>
  );
}

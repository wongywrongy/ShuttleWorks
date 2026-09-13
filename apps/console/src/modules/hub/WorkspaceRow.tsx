/**
 * A single workspace row in the Hub's dense list.
 *
 * The Hub answers one question — *which tournament do I want to open?* — so
 * the row is a plain table row in one fixed column order (D2):
 *
 *   [•] Tournament                2026-07-28 – 08-03   Live    [Open]   ⋯
 *
 * - **Tournament** is flexible width and carries the stored name verbatim,
 *   with no appended date (the Dates column owns that).
 * - **Dates** has a stable width, so a long name or a missing status can never
 *   shift it.
 * - **Status** is readable text — Draft / Upcoming / Live / Completed /
 *   Archived, never blank (see workspaceStatus.ts for the precedence).
 * - **Open** has the SAME label and the same destination on every row (the
 *   workspace Overview). It used to be a per-row "next action" whose words and
 *   landing surface changed row to row, which made the one thing a list is for
 *   — a predictable click — unpredictable.
 * - **Actions** holds Settings and, separated, the destructive Delete.
 *
 * The attention DOT stays on the name: it says THAT something is wrong without
 * spending a column on prose, and the preview panel says what.
 *
 * Selecting the row opens the preview panel; it never navigates.
 */
import type { TournamentSummaryDTO } from '../../api/dto';
import { Button } from '@scheduler/design-system';
import {
  OverflowMenu,
  COL_PRIORITY_CLASS,
  type OverflowItem,
} from '../../components/control-plane';
import { attentionReasons, workspaceHealth } from './hubSignals';
import { formatEventRange } from './workspaceLabel';
import { workspaceStatusClass, workspaceStatusLabel } from './workspaceStatus';

/** The attention dot. Silent when nothing is wrong — a calm list is the point.
 *  When something is, it is a focusable control whose accessible name states
 *  the leading reason and how many more there are; activating it opens the
 *  preview panel, where the exception is named. */
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

interface RowProps {
  tournament: TournamentSummaryDTO;
  /** "Now", injected so the derived status is testable and matches the list. */
  now: Date;
  selected: boolean;
  onSelect: () => void;
  onOpen: () => void;
  onSettings: () => void;
  onDelete?: () => void;
}

export function WorkspaceRow({
  tournament,
  now,
  selected,
  onSelect,
  onOpen,
  onSettings,
  onDelete,
}: RowProps) {
  const dateLabel = formatEventRange(tournament);
  const status = workspaceStatusLabel(tournament, now);

  const overflowItems: OverflowItem[] = [
    {
      key: 'settings',
      label: 'Open settings',
      to: `/tournaments/${encodeURIComponent(tournament.id)}/administration/lifecycle`,
      onSelect: onSettings,
    },
    ...(onDelete
      ? [{ key: 'delete', label: 'Delete', onSelect: onDelete, destructive: true, separator: true, testId: 'overflow-delete' } as OverflowItem]
      : []),
  ];

  return (
    // A plain clickable region for selecting the row (populates the preview
    // panel). Not a role=button/option: it embeds interactive children (Open
    // and the overflow menu), which ARIA forbids inside a widget role.
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
      {/* TOURNAMENT — flexible; the stored name, unedited, with no date. */}
      <span className="flex min-w-[12rem] flex-1 items-center gap-2.5">
        <AttentionDot tournament={tournament} onOpenDetails={onSelect} />
        <span className="min-w-0 break-words text-2sm font-semibold text-foreground">
          {(tournament.name ?? '').trim() || 'Untitled'}
        </span>
      </span>

      {/* DATES — stable width, so neither a long name nor a long status can
          move it. `sw-num` keeps the digits aligned down the column. */}
      <span
        data-testid="row-date"
        className={['w-36 shrink-0 text-2xs sw-num', dateLabel ? 'text-muted-foreground' : 'text-ink-faint', COL_PRIORITY_CLASS[2]].join(' ')}
      >
        {dateLabel ?? 'No date set'}
      </span>

      {/* STATUS — always a word, never a blank cell. */}
      <span
        data-testid="row-status"
        className={`w-24 shrink-0 text-xs ${workspaceStatusClass(status)}`}
      >
        {status}
      </span>

      {/* OPEN — one label, one destination, on every row. */}
      <Button
        size="xs"
        variant="outline"
        data-testid="row-open"
        onClick={(e) => {
          e.stopPropagation();
          onOpen();
        }}
        className="shrink-0"
      >
        Open
      </Button>

      {/* Quiet at rest, not absent: `:hover` never fires on a touch device. */}
      <span className="opacity-60 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
        <OverflowMenu items={overflowItems} />
      </span>
    </div>
  );
}

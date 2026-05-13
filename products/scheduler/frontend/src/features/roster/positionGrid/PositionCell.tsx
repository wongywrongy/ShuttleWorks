/**
 * One cell in the position grid. Owns the chip rendering (grouped pair
 * for filled doubles, standalone chips for singles or half-filled
 * doubles), the drag-drop droppable target wiring, and the inline
 * search picker that opens on click. Visual chip highlighting when the
 * selected player matches an occupant.
 *
 * The displacement logic on singles assignment lives here — singles
 * cells must NEVER have more than one occupant, so assigning a new
 * player to a singles rank strips the rank from any other holder in
 * the same school before adding it to the picked player.
 */
import { useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { useAppStore } from '../../../store/appStore';
import type { PlayerDTO } from '../../../api/dto';
import { EVENT_LABEL } from './helpers';
import { PlayerSearchPicker } from './PlayerSearchPicker';

export function PositionCell({
  schoolId,
  rank,
  eventPrefix,
  doubles,
  disabled,
  occupants,
  highlightedPlayerId,
}: {
  schoolId: string;
  rank: string;
  eventPrefix: string;
  doubles: boolean;
  disabled: boolean;
  occupants: PlayerDTO[];
  highlightedPlayerId?: string | null;
}) {
  const players = useAppStore((s) => s.players);
  const updatePlayer = useAppStore((s) => s.updatePlayer);
  const capacity = doubles ? 2 : 1;
  const isFull = occupants.length >= capacity;

  const [pickerOpen, setPickerOpen] = useState(false);

  const { setNodeRef, isOver, active } = useDroppable({
    id: `cell:${schoolId}:${rank}`,
    data: { schoolId, rank, doubles, capacity },
    disabled: disabled || isFull,
  });

  const removeRank = (playerId: string) => {
    const p = occupants.find((o) => o.id === playerId);
    if (!p) return;
    updatePlayer(p.id, {
      ranks: (p.ranks ?? []).filter((r) => r !== rank),
    });
  };

  const assignPlayer = (playerId: string) => {
    const p = players.find((x) => x.id === playerId);
    if (!p) return;
    if ((p.ranks ?? []).includes(rank)) return;

    if (!doubles) {
      // Displace any existing singles occupant — enforces the
      // ≤1-player-per-singles-rank invariant at the assignment site.
      for (const other of players) {
        if (
          other.id !== p.id &&
          other.groupId === schoolId &&
          (other.ranks ?? []).includes(rank)
        ) {
          updatePlayer(other.id, {
            ranks: (other.ranks ?? []).filter((r) => r !== rank),
          });
        }
      }
    } else if (occupants.length >= capacity) {
      return;
    }
    updatePlayer(p.id, { ranks: [...(p.ranks ?? []), rank] });
  };

  const dragIsEligible =
    active?.data.current?.schoolId === schoolId &&
    !isFull &&
    !disabled &&
    !occupants.some((o) => o.id === active?.data.current?.playerId);
  const dragHover = isOver && dragIsEligible;
  const dragReject = isOver && !dragIsEligible;
  const isDragging = active !== null;

  const bodyTint = EVENT_LABEL[eventPrefix]?.body ?? '';

  return (
    <td
      ref={setNodeRef}
      data-testid={`pos-cell-${schoolId}-${rank}`}
      className={[
        'relative align-top border-b border-r border-border last:border-r-0 transition-colors min-w-[160px]',
        disabled ? 'bg-muted/60 text-muted-foreground/70' : bodyTint,
        isDragging && !disabled ? 'ring-1 ring-inset ring-border' : '',
        dragHover
          ? 'bg-emerald-100 ring-[3px] ring-inset ring-emerald-500 shadow-inner'
          : '',
        dragReject
          ? 'bg-red-100 ring-[3px] ring-inset ring-red-500 shadow-inner'
          : '',
      ].join(' ')}
    >
      {disabled ? (
        <span className="block px-1 py-1 text-3xs italic opacity-50">—</span>
      ) : (
        <button
          type="button"
          onClick={(e) => {
            if ((e.target as HTMLElement).dataset.noPicker) return;
            setPickerOpen((v) => !v);
          }}
          data-testid={`pos-cell-btn-${schoolId}-${rank}`}
          className="block w-full rounded px-1 py-1 text-left hover:bg-card/70 focus:outline-none focus:bg-card"
        >
          <div className="flex flex-col gap-1">
            <CellChips
              occupants={occupants}
              doubles={doubles}
              highlightedPlayerId={highlightedPlayerId}
              onRemove={removeRank}
              rank={rank}
            />
            {doubles && occupants.length === 1 ? (
              <span className="rounded-[6px] border border-dashed border-border px-2 py-0.5 text-3xs italic text-muted-foreground">
                ＋ add partner
              </span>
            ) : null}
            {occupants.length === 0 ? (
              <span className="inline-flex items-center gap-1 text-2xs italic text-muted-foreground">
                <span aria-hidden>＋</span>
                {doubles ? 'add pair' : 'add player'}
              </span>
            ) : null}
          </div>
        </button>
      )}

      {pickerOpen ? (
        <PlayerSearchPicker
          schoolId={schoolId}
          rank={rank}
          doubles={doubles}
          occupants={occupants}
          onAssign={assignPlayer}
          onClose={() => setPickerOpen(false)}
        />
      ) : null}
    </td>
  );
}

/**
 * Chip rendering inside a PositionCell — three shapes:
 *   • Doubles cell with 2 occupants → single bordered container,
 *     rows stack flush with a 0.5px hairline divider. Border + bg
 *     on the container so the pair reads as one unit (intended team).
 *   • Singles cell (or doubles with one seat filled, or singles
 *     accidentally holding multiple occupants) → each occupant as
 *     its own standalone bordered chip stacked vertically. Singles
 *     cells must NEVER group regardless of occupant count — grouping
 *     implies "this is a pair" which is wrong for singles.
 *   • 0 occupants → returns null; the parent shows a "＋ add" hint.
 */
function CellChips({
  occupants,
  doubles,
  highlightedPlayerId,
  onRemove,
  rank,
}: {
  occupants: PlayerDTO[];
  doubles: boolean;
  highlightedPlayerId?: string | null;
  onRemove: (playerId: string) => void;
  rank: string;
}) {
  const renderPlayerRow = (p: PlayerDTO) => (
    <div
      key={p.id}
      className="group flex items-center justify-between gap-1 px-2 py-0.5 text-2xs font-medium leading-tight"
    >
      <span className="break-words">{p.name || '(unnamed)'}</span>
      <span
        role="button"
        tabIndex={0}
        data-no-picker="true"
        onClick={(e) => {
          e.stopPropagation();
          onRemove(p.id);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.stopPropagation();
            e.preventDefault();
            onRemove(p.id);
          }
        }}
        aria-label={`Unassign ${p.name} from ${rank}`}
        className="cursor-pointer text-muted-foreground opacity-0 transition-opacity duration-fast ease-brand group-hover:opacity-100 hover:text-destructive"
      >
        ×
      </span>
    </div>
  );

  const groupHighlighted =
    !!highlightedPlayerId &&
    occupants.some((o) => o.id === highlightedPlayerId);
  const containerBase = 'transition-colors duration-fast ease-brand';
  const containerHighlight = groupHighlighted
    ? 'border-accent bg-accent/10'
    : 'border-border bg-card';

  if (doubles && occupants.length >= 2) {
    return (
      <div
        data-highlighted={groupHighlighted ? 'true' : 'false'}
        className={[
          'overflow-hidden rounded-[6px] border text-foreground',
          'divide-y-[0.5px] divide-border/40',
          containerBase,
          containerHighlight,
        ].join(' ')}
      >
        {occupants.map(renderPlayerRow)}
      </div>
    );
  }
  if (occupants.length >= 1) {
    return (
      <>
        {occupants.map((p) => {
          const chipHighlighted = p.id === highlightedPlayerId;
          return (
            <div
              key={p.id}
              data-highlighted={chipHighlighted ? 'true' : 'false'}
              className={[
                'rounded-[6px] border text-foreground',
                containerBase,
                chipHighlighted
                  ? 'border-accent bg-accent/10'
                  : 'border-border bg-card',
              ].join(' ')}
            >
              {renderPlayerRow(p)}
            </div>
          );
        })}
      </>
    );
  }
  return null;
}

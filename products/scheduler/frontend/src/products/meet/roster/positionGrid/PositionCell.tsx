/**
 * One cell in the position grid. Owns the drag-drop droppable target
 * wiring and the inline search picker that opens on click; the chip
 * rendering (grouped pair for filled doubles, standalone chips for
 * singles or half-filled doubles, highlighting) lives in `CellChips`.
 *
 * The singles-displacement invariant lives in `useRankAssignment` —
 * assigning a player to a singles rank strips that rank from any other
 * holder in the same school. Doubles capacity (≤2) is guarded here at
 * the call site before delegating to the hook.
 */
import { useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import type { PlayerDTO } from '../../../../api/dto';
import { EVENT_LABEL } from './helpers';
import { useRankAssignment } from './useRankAssignment';
import { CellChips } from './CellChips';
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
  const { assignRank, unassignRank } = useRankAssignment();
  const capacity = doubles ? 2 : 1;
  const isFull = occupants.length >= capacity;

  const [pickerOpen, setPickerOpen] = useState(false);

  const { setNodeRef, isOver, active } = useDroppable({
    id: `cell:${schoolId}:${rank}`,
    data: { schoolId, rank, doubles, capacity },
    disabled: disabled || isFull,
  });

  const removeRank = (playerId: string) => {
    unassignRank(playerId, rank);
  };

  const assignPlayer = (playerId: string) => {
    // Doubles capacity guard stays at the call site; the singles
    // displacement invariant + the add live in useRankAssignment.
    if (doubles && occupants.length >= capacity) return;
    assignRank(schoolId, playerId, rank);
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
          ? 'bg-status-done-bg ring-[3px] ring-inset ring-status-done shadow-inner'
          : '',
        dragReject
          ? 'bg-destructive/10 ring-[3px] ring-inset ring-destructive shadow-inner'
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
              schoolId={schoolId}
              highlightedPlayerId={highlightedPlayerId}
              onRemove={removeRank}
              rank={rank}
            />
            {doubles && occupants.length === 1 ? (
              <span className="rounded-md border border-dashed border-border px-2 py-0.5 text-3xs italic text-muted-foreground">
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

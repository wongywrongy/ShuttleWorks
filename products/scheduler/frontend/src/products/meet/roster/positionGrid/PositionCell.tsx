/**
 * One cell in the position grid. Owns the drag-drop droppable target
 * (pool→cell assign), the inline reassign picker, and the click model:
 *
 *   - filled cell, click a name    → open the position's detail pane
 *   - filled cell, the pencil button → reassign picker
 *   - empty cell, single click     → assign picker
 *
 * Reassign USED TO BE a double-click on a `<div>`: no keyboard path at all
 * (console-IA defect D13), and it forced a 220ms timer on the single click so
 * the two gestures could be told apart — every pane open paid that delay. The
 * pencil is now a real `<button>`, so the gestures land on different targets,
 * keyboard reaches it by Tab (focus-visible reveals it), and the debounce is
 * gone: a click on a name opens the pane immediately.
 *
 * The singles-displacement invariant lives in `useRankAssignment`; doubles
 * capacity (≤2) is guarded here before delegating to the hook. Unassigning is
 * NOT here — it lives in the pane, armed (finding 1.1); see `CellChips`.
 */
import { useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { PencilSimple } from '@phosphor-icons/react';
import type { PlayerDTO } from '../../../../api/dto';
import { useRankAssignment } from './useRankAssignment';
import { CellChips } from './CellChips';
import { PlayerSearchPicker } from './PlayerSearchPicker';

export function PositionCell({
  schoolId,
  rank,
  doubles,
  disabled,
  occupants,
  selected,
  onSelectPosition,
}: {
  schoolId: string;
  rank: string;
  doubles: boolean;
  disabled: boolean;
  occupants: PlayerDTO[];
  /** This cell's position is the one open in the detail drawer. */
  selected?: boolean;
  /** Single-click a filled cell → open the position detail for this rank. */
  onSelectPosition?: (rank: string) => void;
}) {
  const { assignRank } = useRankAssignment();
  const capacity = doubles ? 2 : 1;
  const isFull = occupants.length >= capacity;

  const [pickerOpen, setPickerOpen] = useState(false);

  // Selects the whole position (this rank), not one player, so the detail
  // pane can show every occupant of a doubles cell.
  const handleSelect = () => onSelectPosition?.(rank);

  const { setNodeRef, isOver, active } = useDroppable({
    id: `cell:${schoolId}:${rank}`,
    data: { schoolId, rank, doubles, capacity },
    disabled: disabled || isFull,
  });

  const assignPlayer = (playerId: string) => {
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

  return (
    <td
      ref={setNodeRef}
      data-testid={`pos-cell-${schoolId}-${rank}`}
      className={[
        'group/cell relative align-top border-b border-r border-border last:border-r-0 transition-colors',
        disabled ? 'bg-muted/60 text-muted-foreground/70' : '',
        selected && !disabled ? 'bg-accent/5 ring-2 ring-inset ring-accent/50' : '',
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
        <span className="block px-1.5 py-1 text-3xs italic opacity-50">–</span>
      ) : occupants.length > 0 ? (
        // Filled cell: names open the pane; the pencil button reassigns.
        <div className="px-1.5 py-1">
          <CellChips
            occupants={occupants}
            doubles={doubles}
            onSelect={handleSelect}
          />
          {doubles && occupants.length === 1 ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setPickerOpen(true);
              }}
              className="mt-0.5 inline-flex items-center gap-1 rounded-sm border border-dashed border-border px-1.5 py-0.5 text-3xs italic text-muted-foreground transition-colors duration-fast ease-brand hover:border-accent hover:text-accent"
            >
              ＋ add partner
            </button>
          ) : null}
          {/* The reassign gesture, as a real control: reachable by Tab (and
              revealed by focus-visible), not a double-click on a div. */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setPickerOpen(true);
            }}
            data-testid={`pos-cell-reassign-${schoolId}-${rank}`}
            aria-label={`Reassign ${rank}`}
            title={`Reassign ${rank}`}
            className="absolute right-0.5 top-0.5 rounded-sm p-0.5 text-muted-foreground opacity-0 transition-opacity duration-fast ease-brand hover:text-accent focus-visible:opacity-100 group-hover/cell:opacity-100"
          >
            <PencilSimple aria-hidden className="h-3 w-3" />
          </button>
        </div>
      ) : (
        // Empty cell: single click assigns.
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          data-testid={`pos-cell-btn-${schoolId}-${rank}`}
          className="flex w-full items-center gap-1 px-1.5 py-1 text-left text-xs italic text-muted-foreground transition-colors duration-fast ease-brand hover:text-accent"
        >
          <span aria-hidden>＋</span>
          {doubles ? 'add pair' : 'add player'}
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

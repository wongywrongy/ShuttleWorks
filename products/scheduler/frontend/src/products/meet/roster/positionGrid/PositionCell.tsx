/**
 * One cell in the position grid. Owns the drag-drop droppable target
 * (pool→cell assign), the inline reassign picker, and the click model:
 *
 *   - filled cell, single click on a name → open that player's detail
 *     panel (debounced so a double-click doesn't also fire it)
 *   - filled cell, double click           → enter edit mode (reassign picker)
 *   - empty cell, single click            → assign picker
 *
 * A faint pencil glyph appears on hover of a filled cell to signal that
 * double-click reassigns; the names are `cursor-pointer` to signal that a
 * single click views detail.
 *
 * The singles-displacement invariant lives in `useRankAssignment`; doubles
 * capacity (≤2) is guarded here before delegating to the hook.
 */
import { useEffect, useRef, useState } from 'react';
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
  const { assignRank, unassignRank } = useRankAssignment();
  const capacity = doubles ? 2 : 1;
  const isFull = occupants.length >= capacity;

  const [pickerOpen, setPickerOpen] = useState(false);

  // Single-click opens detail, double-click opens the reassign picker.
  // A short timer suppresses the single-click action when a double-click
  // follows, so the two gestures stay cleanly separated.
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (clickTimer.current) clearTimeout(clickTimer.current);
    },
    [],
  );
  // Single-click selects the whole position (this rank), not one player,
  // so the detail drawer can show every occupant of a doubles cell.
  const handleSelect = () => {
    if (clickTimer.current) clearTimeout(clickTimer.current);
    clickTimer.current = setTimeout(() => {
      onSelectPosition?.(rank);
      clickTimer.current = null;
    }, 220);
  };
  const handleEdit = () => {
    if (clickTimer.current) {
      clearTimeout(clickTimer.current);
      clickTimer.current = null;
    }
    setPickerOpen(true);
  };

  const { setNodeRef, isOver, active } = useDroppable({
    id: `cell:${schoolId}:${rank}`,
    data: { schoolId, rank, doubles, capacity },
    disabled: disabled || isFull,
  });

  const removeRank = (playerId: string) => {
    unassignRank(playerId, rank);
  };

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
        <span className="block px-1.5 py-1 text-3xs italic opacity-50">—</span>
      ) : occupants.length > 0 ? (
        // Filled cell: names view-on-click; double-click anywhere reassigns.
        <div
          onDoubleClick={handleEdit}
          className="px-1.5 py-1"
        >
          <CellChips
            occupants={occupants}
            doubles={doubles}
            onSelect={handleSelect}
            onRemove={removeRank}
          />
          {doubles && occupants.length === 1 ? (
            <button
              type="button"
              data-no-picker="true"
              onClick={(e) => {
                e.stopPropagation();
                setPickerOpen(true);
              }}
              className="mt-0.5 inline-flex items-center gap-1 rounded-sm border border-dashed border-border px-1.5 py-0.5 text-3xs italic text-muted-foreground transition-colors duration-fast ease-brand hover:border-accent hover:text-accent"
            >
              ＋ add partner
            </button>
          ) : null}
          {/* Hover affordance: signals double-click reassigns. */}
          <PencilSimple
            aria-hidden
            className="pointer-events-none absolute right-1 top-1 h-3 w-3 text-muted-foreground/40 opacity-0 transition-opacity duration-fast ease-brand group-hover/cell:opacity-100"
          />
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

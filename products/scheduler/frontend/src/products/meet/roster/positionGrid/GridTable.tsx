/**
 * The position-grid `<table>` shell — composes GridHeader + GridBody and
 * owns the column-reorder DndContext.
 *
 * The DndContext is deliberately hoisted to wrap the `<table>` (not the
 * header `<tr>`): dnd-kit emits hidden accessibility nodes, and inside a
 * `<tr>` those render as phantom cells under `table-layout: fixed`,
 * stealing a column's worth of width on the right. Wrapping the table
 * keeps those nodes outside the row so the columns fill the full width.
 */
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
} from '@dnd-kit/sortable';
import type { PlayerDTO } from '../../../../api/dto';
import { GridHeader, type GridEvent } from './GridHeader';
import { GridBody } from './GridBody';
import { usePositionGridColumns } from './usePositionGridColumns';

export function GridTable({
  events,
  maxRows,
  schoolId,
  byRank,
  highlightedRank,
  onSelectPosition,
}: {
  events: GridEvent[];
  maxRows: number;
  schoolId: string;
  byRank: Map<string, PlayerDTO[]>;
  highlightedRank?: string | null;
  onSelectPosition?: (rank: string) => void;
}) {
  const { allConfiguredEvents, reorderColumns } = usePositionGridColumns();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );
  const visibleOrder = events.map((e) => e.prefix);

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = visibleOrder.indexOf(String(active.id));
    const to = visibleOrder.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    const nextVisible = arrayMove(visibleOrder, from, to);
    // Preserve configured-but-hidden events at the end so a reorder of the
    // visible columns never drops them from eventOrder.
    const stillHidden = allConfiguredEvents.filter((p) => !visibleOrder.includes(p));
    reorderColumns([...nextVisible, ...stillHidden]);
  };

  return (
    <div className="h-full overflow-auto bg-card">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={onDragEnd}
      >
        <SortableContext items={visibleOrder} strategy={horizontalListSortingStrategy}>
          {/* border-collapse so the per-cell borders merge into clean grid
              lines. `table-fixed` + w-full spreads the columns evenly across
              the full width; the low min-width lets them shrink to fit a
              narrowed pane. `h-full` lets GridBody's filler row fill the
              height while the real rows stay compact. */}
          <table
            className="h-full w-full min-w-[480px] table-fixed border-collapse text-sm"
            data-testid="position-grid-table"
          >
            <GridHeader events={events} />
            <GridBody
              events={events}
              maxRows={maxRows}
              schoolId={schoolId}
              byRank={byRank}
              highlightedRank={highlightedRank}
              onSelectPosition={onSelectPosition}
            />
          </table>
        </SortableContext>
      </DndContext>
    </div>
  );
}

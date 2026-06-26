/**
 * Position-grid header row — the `#` row-number stub plus one `<th>` per
 * visible event, carrying the event's identity color (EVENT_LABEL) and a
 * doubles/singles subtitle.
 *
 * Event columns are draggable to reorder directly in the grid (writes
 * `config.eventOrder` via reorderColumns). This uses a NESTED DndContext +
 * horizontal SortableContext — DOM-less providers, so the `<tr>` still
 * contains only `<th>` — isolated from the parent chip-drag context (its
 * IDs are raw event prefixes, distinct from `cell:`/`player:`/`chip:`).
 * Show/hide + reset still live in the Columns menu (those aren't drags).
 */
import type { CSSProperties } from 'react';
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
  useSortable,
  horizontalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { EVENT_LABEL, isDoubles } from './helpers';
import { usePositionGridColumns } from './usePositionGridColumns';

export interface GridEvent {
  prefix: string;
  count: number;
}

function SortableHeaderCell({ ev }: { ev: GridEvent }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: ev.prefix });
  const label = EVENT_LABEL[ev.prefix];
  const style: CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  return (
    <th
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      // dnd-kit's sortable attributes set role="button"; restore the table
      // header semantics (it stays keyboard-draggable via the listeners +
      // aria-roledescription="sortable").
      role="columnheader"
      className={`cursor-grab touch-none border-b-2 border-r border-border px-3 py-1.5 text-left text-xs font-bold tracking-wide last:border-r-0 active:cursor-grabbing ${label?.header ?? 'bg-muted text-foreground'}`}
      title={label?.full ? `${label.full} — drag to reorder` : 'Drag to reorder'}
    >
      {ev.prefix}
      <span className="ml-2 text-3xs font-medium opacity-70">
        {isDoubles(ev.prefix) ? 'doubles' : 'singles'}
      </span>
    </th>
  );
}

export function GridHeader({ events }: { events: GridEvent[] }) {
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
    // Preserve any configured-but-hidden events (rare) at the end so the
    // reorder of visible columns never drops them from eventOrder.
    const hidden = allConfiguredEvents.filter((p) => !visibleOrder.includes(p));
    reorderColumns([...nextVisible, ...hidden]);
  };

  return (
    <thead>
      <tr>
        <th className="w-12 border-b-2 border-r border-border bg-muted py-1.5 text-3xs font-semibold uppercase tracking-wider text-muted-foreground">
          #
        </th>
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={onDragEnd}
        >
          <SortableContext items={visibleOrder} strategy={horizontalListSortingStrategy}>
            {events.map((ev) => (
              <SortableHeaderCell key={ev.prefix} ev={ev} />
            ))}
          </SortableContext>
        </DndContext>
      </tr>
    </thead>
  );
}

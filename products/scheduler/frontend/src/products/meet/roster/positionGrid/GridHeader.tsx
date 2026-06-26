/**
 * Position-grid header row. Neutral theme (no per-event colors) to match
 * the site. All column management lives in the grid itself — no separate
 * menu:
 *   - REORDER: drag a header (a horizontal SortableContext in a nested,
 *     DOM-less DndContext, isolated from the chip-drag context — its IDs
 *     are raw event prefixes, distinct from cell:/player:/chip:).
 *   - HIDE: hover a header → eye-slash button (toggleVisible).
 *   - RESTORE / RESET: the `#` corner cell shows dashed chips for hidden
 *     events (click to show) and a reset control when order/visibility is
 *     customized.
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
import { EyeSlash, ArrowCounterClockwise } from '@phosphor-icons/react';
import { EVENT_LABEL, EVENT_ORDER, isDoubles } from './helpers';
import { usePositionGridColumns } from './usePositionGridColumns';

export interface GridEvent {
  prefix: string;
  count: number;
}

function SortableHeaderCell({
  ev,
  onHide,
}: {
  ev: GridEvent;
  onHide: (prefix: string) => void;
}) {
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
      className="group relative border-b-2 border-r border-border bg-muted px-2 py-1.5 text-left text-xs font-bold tracking-wide text-foreground last:border-r-0"
    >
      {/* Drag handle is the label span (not the whole th) so the hide
          button stays clickable and the th keeps its columnheader role. */}
      <span
        {...attributes}
        {...listeners}
        className="inline-flex cursor-grab touch-none items-baseline gap-2 active:cursor-grabbing"
        title={label?.full ? `${label.full} — drag to reorder` : 'Drag to reorder'}
      >
        {ev.prefix}
        <span className="text-3xs font-medium text-muted-foreground">
          {isDoubles(ev.prefix) ? 'doubles' : 'singles'}
        </span>
      </span>
      <button
        type="button"
        onClick={() => onHide(ev.prefix)}
        aria-label={`Hide ${ev.prefix} column`}
        title={`Hide ${ev.prefix}`}
        className="absolute right-1 top-1 rounded p-0.5 text-muted-foreground/50 opacity-0 transition-opacity duration-fast ease-brand hover:text-foreground focus:opacity-100 group-hover:opacity-100"
      >
        <EyeSlash aria-hidden className="h-3 w-3" />
      </button>
    </th>
  );
}

export function GridHeader({ events }: { events: GridEvent[] }) {
  const { allConfiguredEvents, reorderColumns, toggleVisible, resetColumns, eventVisible } =
    usePositionGridColumns();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );
  const visibleOrder = events.map((e) => e.prefix);
  const hidden = allConfiguredEvents.filter((p) => eventVisible?.[p] === false);
  const canonical = EVENT_ORDER.filter((p) => allConfiguredEvents.includes(p));
  const reordered = JSON.stringify(allConfiguredEvents) !== JSON.stringify(canonical);
  const customized = hidden.length > 0 || reordered;

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = visibleOrder.indexOf(String(active.id));
    const to = visibleOrder.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    const nextVisible = arrayMove(visibleOrder, from, to);
    // Preserve any configured-but-hidden events (rare) at the end so the
    // reorder of visible columns never drops them from eventOrder.
    const stillHidden = allConfiguredEvents.filter((p) => !visibleOrder.includes(p));
    reorderColumns([...nextVisible, ...stillHidden]);
  };

  return (
    <thead>
      <tr>
        <th className="w-9 border-b-2 border-r border-border bg-muted px-1 py-1.5 align-top text-center text-3xs font-semibold uppercase tracking-wider text-muted-foreground">
          <div className="flex flex-col items-center gap-1">
            <span>#</span>
            {hidden.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => toggleVisible(p)}
                aria-label={`Show ${p} column`}
                title={`Show ${p}`}
                className="rounded border border-dashed border-border px-1 font-mono text-3xs lowercase text-muted-foreground transition-colors duration-fast ease-brand hover:border-accent hover:text-accent"
              >
                {p}
              </button>
            ))}
            {customized ? (
              <button
                type="button"
                onClick={resetColumns}
                aria-label="Reset columns"
                title="Reset column order &amp; visibility"
                className="rounded p-0.5 text-muted-foreground/60 transition-colors duration-fast ease-brand hover:text-foreground"
              >
                <ArrowCounterClockwise aria-hidden className="h-3 w-3" />
              </button>
            ) : null}
          </div>
        </th>
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={onDragEnd}
        >
          <SortableContext items={visibleOrder} strategy={horizontalListSortingStrategy}>
            {events.map((ev) => (
              <SortableHeaderCell key={ev.prefix} ev={ev} onHide={toggleVisible} />
            ))}
          </SortableContext>
        </DndContext>
      </tr>
    </thead>
  );
}

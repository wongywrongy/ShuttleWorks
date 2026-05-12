/**
 * Column manager popover — reorder + show/hide events on the position
 * grid. Settings persist on `config.eventOrder` and
 * `config.eventVisible` (per-tournament). Reset returns to the
 * canonical MD/WD/XD/WS/MS order with everything visible.
 *
 * Renders a `[⚙ Columns ▾]` trigger button plus a dropdown popover with
 * a sortable list (drag handle + ▲/▼ keyboard fallbacks + eye toggle).
 * Nested DndContext is safe because the popover's drag IDs use the
 * raw event prefix and can't collide with the parent's `cell:..` /
 * `player:..` namespaces.
 */
import { useEffect, useRef, useState } from 'react';
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  closestCenter,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  CaretDown,
  Eye,
  EyeSlash,
  DotsSixVertical,
  GearSix,
} from '@phosphor-icons/react';
import { EVENT_LABEL } from './helpers';
import { INTERACTIVE_BASE, INTERACTIVE_BASE_QUIET } from '../../../lib/utils';

export function ColumnManager({
  order,
  visible,
  onMove,
  onReorder,
  onToggle,
  onReset,
}: {
  order: string[];
  visible: Record<string, boolean> | undefined;
  onMove: (prefix: string, direction: -1 | 1) => void;
  onReorder: (nextOrder: string[]) => void;
  onToggle: (prefix: string) => void;
  onReset: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = order.indexOf(String(active.id));
    const to = order.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    onReorder(arrayMove(order, from, to));
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="dialog"
        className={[
          INTERACTIVE_BASE,
          'inline-flex items-center gap-1 rounded border border-border bg-card px-2 py-1 text-2xs font-medium text-muted-foreground hover:bg-muted/40 hover:text-foreground',
        ].join(' ')}
      >
        <GearSix aria-hidden="true" className="h-3 w-3" />
        Columns
        <CaretDown aria-hidden="true" className="h-3 w-3" />
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="Manage columns"
          className="absolute right-0 top-full z-popover mt-1 w-72 rounded border border-border bg-popover p-2 text-xs text-popover-foreground shadow-lg"
        >
          <div className="mb-1.5 flex items-center justify-between border-b border-border/60 pb-1.5">
            <span className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
              Drag to reorder · click{' '}
              <Eye
                aria-hidden="true"
                className="inline h-3 w-3 align-text-bottom"
              />{' '}
              to hide
            </span>
            <button
              type="button"
              onClick={onReset}
              className={`${INTERACTIVE_BASE_QUIET} rounded px-1.5 py-0.5 text-2xs text-muted-foreground hover:text-foreground`}
            >
              Reset
            </button>
          </div>
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={order} strategy={verticalListSortingStrategy}>
              <ul className="space-y-0.5">
                {order.map((prefix, i) => (
                  <SortableEventRow
                    key={prefix}
                    prefix={prefix}
                    index={i}
                    total={order.length}
                    isVisible={visible?.[prefix] !== false}
                    label={EVENT_LABEL[prefix]?.full}
                    onMove={onMove}
                    onToggle={onToggle}
                  />
                ))}
              </ul>
            </SortableContext>
          </DndContext>
        </div>
      )}
    </div>
  );
}

/**
 * One sortable row inside the ColumnManager popover. Drag handle is the
 * DotsSixVertical glyph at the left; ▲/▼ remain as keyboard-friendly
 * fallbacks; eye toggle on the right hides/shows the column.
 */
function SortableEventRow({
  prefix,
  index,
  total,
  isVisible,
  label,
  onMove,
  onToggle,
}: {
  prefix: string;
  index: number;
  total: number;
  isVisible: boolean;
  label: string | undefined;
  onMove: (prefix: string, direction: -1 | 1) => void;
  onToggle: (prefix: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: prefix });
  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };
  return (
    <li
      ref={setNodeRef}
      style={style}
      className={[
        'flex items-center gap-1 rounded px-1 py-0.5',
        isDragging ? 'bg-muted/40 shadow-md ring-1 ring-ring' : 'hover:bg-muted/50',
      ].join(' ')}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label={`Drag ${prefix} to reorder`}
        className={`${INTERACTIVE_BASE_QUIET} cursor-grab active:cursor-grabbing rounded p-0.5 text-muted-foreground/70 hover:text-foreground`}
      >
        <DotsSixVertical aria-hidden="true" className="h-3 w-3" />
      </button>
      <span className="w-7 font-mono text-2xs">{prefix}</span>
      <span className="flex-1 truncate text-2xs text-muted-foreground">
        {label ?? prefix}
      </span>
      <button
        type="button"
        onClick={() => onMove(prefix, -1)}
        disabled={index === 0}
        aria-label={`Move ${prefix} up`}
        className={`${INTERACTIVE_BASE_QUIET} rounded p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30`}
      >
        <span aria-hidden>▲</span>
      </button>
      <button
        type="button"
        onClick={() => onMove(prefix, 1)}
        disabled={index === total - 1}
        aria-label={`Move ${prefix} down`}
        className={`${INTERACTIVE_BASE_QUIET} rounded p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30`}
      >
        <span aria-hidden>▼</span>
      </button>
      <button
        type="button"
        onClick={() => onToggle(prefix)}
        aria-label={isVisible ? `Hide ${prefix}` : `Show ${prefix}`}
        aria-pressed={!isVisible}
        className={`${INTERACTIVE_BASE_QUIET} rounded p-0.5 ${isVisible ? 'text-foreground' : 'text-muted-foreground/50'}`}
        title={isVisible ? 'Visible' : 'Hidden'}
      >
        {isVisible ? (
          <Eye aria-hidden="true" className="h-3 w-3" />
        ) : (
          <EyeSlash aria-hidden="true" className="h-3 w-3" />
        )}
      </button>
    </li>
  );
}

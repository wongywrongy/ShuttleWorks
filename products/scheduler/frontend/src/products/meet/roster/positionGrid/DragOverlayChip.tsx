/**
 * The floating chip rendered inside dnd-kit's <DragOverlay> while a drag is
 * in progress. Rendering the preview in a portal overlay (instead of
 * translating the source node) lets a chip be dragged out of the grid's
 * overflow-auto scroll container without clipping.
 */
import { DotsSixVertical } from '@phosphor-icons/react';

export function DragOverlayChip({ name }: { name: string }) {
  return (
    <div className="inline-flex items-center gap-1.5 rounded-md border border-primary bg-card px-2 py-1 text-sm shadow-lg ring-2 ring-primary/40">
      <DotsSixVertical
        aria-hidden
        weight="bold"
        className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70"
      />
      <span className="truncate">{name || '(unnamed)'}</span>
    </div>
  );
}

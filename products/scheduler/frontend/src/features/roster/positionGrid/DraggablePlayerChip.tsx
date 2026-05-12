/**
 * Draggable chip for a player in the pool. Wraps `useDraggable` so the
 * chip itself is the drag source, with the school id + player id passed
 * via `data` so the drop target (PositionCell) can decide eligibility
 * based on school match.
 */
import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import type { PlayerDTO } from '../../../api/dto';

export function DraggablePlayerChip({
  player,
  schoolId,
}: {
  player: PlayerDTO;
  schoolId: string;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `player:${player.id}`,
    data: { schoolId, playerId: player.id },
  });
  const style = transform
    ? { transform: CSS.Translate.toString({ x: transform.x, y: transform.y, scaleX: 1, scaleY: 1 }) }
    : undefined;
  const eventCount = (player.ranks ?? []).length;
  const heavy = eventCount >= 4;
  return (
    <button
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      style={style}
      data-testid={`pool-chip-${player.id}`}
      className={[
        'inline-flex w-full items-center gap-1.5 rounded border border-border bg-card px-2 py-1 text-left text-sm shadow-sm transition-[transform,box-shadow,border-color,opacity] duration-150 ease-brand',
        isDragging
          ? 'z-popover shadow-lg ring-2 ring-primary cursor-grabbing opacity-90 scale-[1.02]'
          : 'cursor-grab hover:border-primary',
      ].join(' ')}
    >
      <span aria-hidden className="text-muted-foreground/70">⠿</span>
      <span className="flex-1 truncate">{player.name || '(unnamed)'}</span>
      <span
        className={[
          'inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full px-1 text-[10px] tabular-nums',
          heavy
            ? 'bg-status-warning-bg text-status-warning ring-1 ring-status-warning/40'
            : 'text-muted-foreground',
        ].join(' ')}
        title={
          heavy
            ? `High event load — ${eventCount} events`
            : `${eventCount} event${eventCount === 1 ? '' : 's'}`
        }
        aria-label={heavy ? `High event load: ${eventCount} events` : undefined}
      >
        {eventCount}
      </span>
    </button>
  );
}

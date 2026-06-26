/**
 * Draggable chip for a player in the pool. Wraps `useDraggable` so the
 * chip itself is the drag source, with the school id + player id passed
 * via `data` so the drop target (PositionCell) can decide eligibility
 * based on school match.
 */
import { useDraggable } from '@dnd-kit/core';
import { DotsSixVertical } from '@phosphor-icons/react';
import type { PlayerDTO } from '../../../../api/dto';

export function DraggablePlayerChip({
  player,
  schoolId,
}: {
  player: PlayerDTO;
  schoolId: string;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `player:${player.id}`,
    data: { schoolId, playerId: player.id },
  });
  const eventCount = (player.ranks ?? []).length;
  const heavy = eventCount >= 4;
  // Flat, chrome-free row content — the parent list <li> carries the row
  // background / active state so player rows read at the same density and
  // weight as the school-list rows (one component family). This element is
  // just the drag source + the name + the event-count badge.
  return (
    <button
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      data-testid={`pool-chip-${player.id}`}
      className={[
        'inline-flex w-full items-center gap-2 bg-transparent px-0 py-0 text-left text-sm transition-opacity duration-fast ease-brand',
        isDragging ? 'opacity-40' : 'cursor-grab',
      ].join(' ')}
    >
      <DotsSixVertical
        aria-hidden
        weight="bold"
        className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50"
      />
      <span className="flex-1 truncate">{player.name || '(unnamed)'}</span>
      <span
        className={[
          'inline-flex h-4 min-w-[1rem] items-center justify-center rounded-sm px-1 text-3xs tabular-nums',
          heavy
            ? 'bg-status-warning-bg text-status-warning ring-1 ring-status-warning/40'
            : 'text-muted-foreground/70',
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

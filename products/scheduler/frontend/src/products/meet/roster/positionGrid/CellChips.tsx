/**
 * Chip rendering inside a PositionCell — three shapes:
 *   • Doubles cell with 2 occupants → single bordered container,
 *     rows stack flush with a 0.5px hairline divider. Border + bg
 *     on the container so the pair reads as one unit (intended team).
 *   • Singles cell (or doubles with one seat filled, or singles
 *     accidentally holding multiple occupants) → each occupant as
 *     its own standalone bordered chip stacked vertically. Singles
 *     cells must NEVER group regardless of occupant count — grouping
 *     implies "this is a pair" which is wrong for singles.
 *   • 0 occupants → returns null; the parent shows a "＋ add" hint.
 *
 * Each occupant row carries a small drag handle (useDraggable, id
 * `chip:{schoolId}:{playerId}:{rank}`) so an assigned player can be
 * dragged to another cell. The handle is the only drag source; the rest
 * of the chip still bubbles a click to the cell (opens the picker) and
 * the × still unassigns.
 */
import { useDraggable } from '@dnd-kit/core';
import { DotsSixVertical } from '@phosphor-icons/react';
import type { PlayerDTO } from '../../../../api/dto';

function CellChipRow({
  player,
  schoolId,
  rank,
  onRemove,
}: {
  player: PlayerDTO;
  schoolId: string;
  rank: string;
  onRemove: (playerId: string) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `chip:${schoolId}:${player.id}:${rank}`,
    data: { schoolId, playerId: player.id, sourceRank: rank },
  });
  return (
    <div
      className={[
        'group flex items-center justify-between gap-1 px-1.5 py-0.5 text-2xs font-medium leading-tight',
        isDragging ? 'opacity-40' : '',
      ].join(' ')}
    >
      <span className="flex min-w-0 items-center gap-1">
        <span
          ref={setNodeRef}
          {...listeners}
          {...attributes}
          data-no-picker="true"
          onClick={(e) => e.stopPropagation()}
          aria-label={`Drag ${player.name || 'player'}`}
          className="shrink-0 cursor-grab text-muted-foreground/40 transition-colors duration-fast ease-brand hover:text-muted-foreground"
        >
          <DotsSixVertical
            aria-hidden
            weight="bold"
            className="pointer-events-none h-3 w-3"
          />
        </span>
        <span className="break-words">{player.name || '(unnamed)'}</span>
      </span>
      <span
        role="button"
        tabIndex={0}
        data-no-picker="true"
        onClick={(e) => {
          e.stopPropagation();
          onRemove(player.id);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.stopPropagation();
            e.preventDefault();
            onRemove(player.id);
          }
        }}
        aria-label={`Unassign ${player.name} from ${rank}`}
        className="cursor-pointer text-muted-foreground opacity-0 transition-opacity duration-fast ease-brand group-hover:opacity-100 hover:text-destructive"
      >
        ×
      </span>
    </div>
  );
}

export function CellChips({
  occupants,
  doubles,
  schoolId,
  highlightedPlayerId,
  onRemove,
  rank,
}: {
  occupants: PlayerDTO[];
  doubles: boolean;
  schoolId: string;
  highlightedPlayerId?: string | null;
  onRemove: (playerId: string) => void;
  rank: string;
}) {
  const renderRow = (p: PlayerDTO) => (
    <CellChipRow
      key={p.id}
      player={p}
      schoolId={schoolId}
      rank={rank}
      onRemove={onRemove}
    />
  );

  const groupHighlighted =
    !!highlightedPlayerId &&
    occupants.some((o) => o.id === highlightedPlayerId);
  const containerBase = 'transition-colors duration-fast ease-brand';
  const containerHighlight = groupHighlighted
    ? 'border-accent bg-accent/10'
    : 'border-border bg-card';

  if (doubles && occupants.length >= 2) {
    return (
      <div
        data-highlighted={groupHighlighted ? 'true' : 'false'}
        className={[
          'overflow-hidden rounded-md border text-foreground',
          'divide-y-[0.5px] divide-border/40',
          containerBase,
          containerHighlight,
        ].join(' ')}
      >
        {occupants.map(renderRow)}
      </div>
    );
  }
  if (occupants.length >= 1) {
    return (
      <>
        {occupants.map((p) => {
          const chipHighlighted = p.id === highlightedPlayerId;
          return (
            <div
              key={p.id}
              data-highlighted={chipHighlighted ? 'true' : 'false'}
              className={[
                'rounded-md border text-foreground',
                containerBase,
                chipHighlighted
                  ? 'border-accent bg-accent/10'
                  : 'border-border bg-card',
              ].join(' ')}
            >
              {renderRow(p)}
            </div>
          );
        })}
      </>
    );
  }
  return null;
}

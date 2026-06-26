/**
 * Plain-text occupant rendering inside a PositionCell.
 *
 *   • Singles cell  → one name on its own line.
 *   • Doubles cell  → up to two names stacked (the pair reads as two
 *     lines; no bordered "card" — keep it compact and chrome-free).
 *   • 0 occupants   → returns null; the parent shows a "＋ add" hint.
 *
 * Per the roster spec these are PLAIN TEXT lines — no chips, borders,
 * avatars, or handle icons. The name text itself is the drag source
 * (useDraggable, id `chip:{schoolId}:{playerId}:{rank}`) so an assigned
 * player can still be dragged to another cell; the × (a sibling of the
 * name, NOT inside the drag node) unassigns on hover. A plain click on
 * the name bubbles to the cell to open the picker; a drag moves the
 * player. Selection highlight is carried by text colour, not a box.
 */
import { useDraggable } from '@dnd-kit/core';
import type { PlayerDTO } from '../../../../api/dto';

function CellChipRow({
  player,
  schoolId,
  rank,
  highlighted,
  onRemove,
}: {
  player: PlayerDTO;
  schoolId: string;
  rank: string;
  highlighted: boolean;
  onRemove: (playerId: string) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `chip:${schoolId}:${player.id}:${rank}`,
    data: { schoolId, playerId: player.id, sourceRank: rank },
  });
  return (
    <div
      className={[
        'group flex items-center justify-between gap-1 leading-tight',
        isDragging ? 'opacity-40' : '',
      ].join(' ')}
    >
      {/* Drag source is the name span only, so a pointer-down on the ×
          (a sibling) never starts a player drag. */}
      <span
        ref={setNodeRef}
        {...listeners}
        {...attributes}
        title={player.name || '(unnamed)'}
        className={[
          'min-w-0 cursor-grab break-words text-2xs font-medium',
          highlighted ? 'text-accent' : 'text-foreground',
        ].join(' ')}
      >
        {player.name || '(unnamed)'}
      </span>
      <span
        role="button"
        tabIndex={0}
        data-no-picker="true"
        onPointerDown={(e) => e.stopPropagation()}
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
        className="shrink-0 cursor-pointer text-2xs text-muted-foreground opacity-0 transition-opacity duration-fast ease-brand group-hover:opacity-100 hover:text-destructive"
      >
        ×
      </span>
    </div>
  );
}

export function CellChips({
  occupants,
  schoolId,
  highlightedPlayerId,
  onRemove,
  rank,
}: {
  occupants: PlayerDTO[];
  /** Retained for call-site compatibility; pair vs. singles no longer
   *  changes the (now chrome-free) rendering. */
  doubles?: boolean;
  schoolId: string;
  highlightedPlayerId?: string | null;
  onRemove: (playerId: string) => void;
  rank: string;
}) {
  if (occupants.length === 0) return null;
  return (
    <div className="flex flex-col gap-0.5">
      {occupants.map((p) => (
        <CellChipRow
          key={p.id}
          player={p}
          schoolId={schoolId}
          rank={rank}
          highlighted={p.id === highlightedPlayerId}
          onRemove={onRemove}
        />
      ))}
    </div>
  );
}

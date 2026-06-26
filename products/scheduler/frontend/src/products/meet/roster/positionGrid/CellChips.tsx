/**
 * Plain-text occupant rendering inside a PositionCell.
 *
 *   • Singles cell  → one name on its own line.
 *   • Doubles cell  → up to two names stacked.
 *   • 0 occupants   → returns null; the parent shows a "＋ add" hint.
 *
 * Per the roster spec these are PLAIN TEXT lines — no chips, borders,
 * avatars, or handle icons. Interaction model (owned by PositionCell):
 *   - single click an occupant name → open that player's detail panel
 *     (debounced in PositionCell so it doesn't fire on a double-click)
 *   - double click the cell        → enter edit mode (reassign picker)
 *   - × (a sibling, not the name)  → unassign
 * In-cell drag was removed in favour of double-click-to-reassign; the
 * pool→cell drag from the left list remains the primary assign gesture.
 * Selection highlight is carried by text colour, not a box.
 */
import type { PlayerDTO } from '../../../../api/dto';

function CellChipRow({
  player,
  highlighted,
  onSelect,
  onRemove,
}: {
  player: PlayerDTO;
  highlighted: boolean;
  onSelect: (playerId: string) => void;
  onRemove: (playerId: string) => void;
}) {
  return (
    <div className="group/row flex items-center justify-between gap-1 leading-tight">
      <button
        type="button"
        onClick={() => onSelect(player.id)}
        title={`${player.name || 'player'} — click to view, double-click to reassign`}
        className={[
          'min-w-0 flex-1 cursor-pointer truncate text-left text-xs font-medium',
          highlighted ? 'text-accent' : 'text-foreground hover:text-accent',
        ].join(' ')}
      >
        {player.name || '(unnamed)'}
      </button>
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
        aria-label={`Unassign ${player.name}`}
        className="shrink-0 cursor-pointer text-xs text-muted-foreground opacity-0 transition-opacity duration-fast ease-brand hover:text-destructive group-hover/row:opacity-100"
      >
        ×
      </span>
    </div>
  );
}

export function CellChips({
  occupants,
  highlightedPlayerId,
  onSelect,
  onRemove,
}: {
  occupants: PlayerDTO[];
  /** Retained for call-site compatibility; pair vs. singles no longer
   *  changes the (now chrome-free) rendering. */
  doubles?: boolean;
  highlightedPlayerId?: string | null;
  onSelect: (playerId: string) => void;
  onRemove: (playerId: string) => void;
}) {
  if (occupants.length === 0) return null;
  return (
    <div className="flex flex-col gap-0.5">
      {occupants.map((p) => (
        <CellChipRow
          key={p.id}
          player={p}
          highlighted={p.id === highlightedPlayerId}
          onSelect={onSelect}
          onRemove={onRemove}
        />
      ))}
    </div>
  );
}

/**
 * Plain-text occupant rendering inside a PositionCell.
 *
 *   • Singles cell  → one name on its own line.
 *   • Doubles cell  → up to two names stacked.
 *   • 0 occupants   → returns null; the parent shows a "＋ add" hint.
 *
 * Per the roster spec these are PLAIN TEXT lines — no chips, borders,
 * avatars, or handle icons. A name's click is the SAFE gesture and the
 * only one: it opens the position pane.
 *
 * NO UNASSIGN LIVES HERE ANY MORE. Every seat used to carry an inline `×`
 * about 4px from its name button — 24 immediate, unconfirmed, un-undoable
 * destroy targets on one screen, inside a cell whose click means "just show
 * me this" (console-IA finding 1.1). Unassigning is now a two-click armed
 * control in the position pane that the same click already opens, which is
 * the one place the operator can see what they are about to remove.
 *
 * Interaction model (owned by PositionCell):
 *   - click an occupant name → open the position's detail pane
 *   - the cell's pencil button → reassign picker (mouse OR keyboard)
 * In-cell drag was removed in favour of the reassign picker; the pool→cell
 * drag from the left list remains the primary assign gesture.
 * Selection highlight is carried by text colour, not a box.
 */
import type { PlayerDTO } from '../../../../api/dto';

export function CellChips({
  occupants,
  onSelect,
}: {
  occupants: PlayerDTO[];
  /** Retained for call-site compatibility; pair vs. singles no longer
   *  changes the (now chrome-free) rendering. */
  doubles?: boolean;
  onSelect: (playerId: string) => void;
}) {
  if (occupants.length === 0) return null;
  return (
    <div className="flex flex-col gap-0.5">
      {occupants.map((p) => (
        <button
          key={p.id}
          type="button"
          onClick={() => onSelect(p.id)}
          title={`${p.name || 'player'}: open position details`}
          className="w-full cursor-pointer break-normal text-left text-xs font-medium leading-tight text-foreground hover:text-accent"
        >
          {p.name || '(unnamed)'}
        </button>
      ))}
    </div>
  );
}

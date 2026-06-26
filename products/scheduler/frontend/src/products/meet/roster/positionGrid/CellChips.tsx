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
 */
import type { PlayerDTO } from '../../../../api/dto';

export function CellChips({
  occupants,
  doubles,
  highlightedPlayerId,
  onRemove,
  rank,
}: {
  occupants: PlayerDTO[];
  doubles: boolean;
  highlightedPlayerId?: string | null;
  onRemove: (playerId: string) => void;
  rank: string;
}) {
  const renderPlayerRow = (p: PlayerDTO) => (
    <div
      key={p.id}
      className="group flex items-center justify-between gap-1 px-2 py-0.5 text-2xs font-medium leading-tight"
    >
      <span className="break-words">{p.name || '(unnamed)'}</span>
      <span
        role="button"
        tabIndex={0}
        data-no-picker="true"
        onClick={(e) => {
          e.stopPropagation();
          onRemove(p.id);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.stopPropagation();
            e.preventDefault();
            onRemove(p.id);
          }
        }}
        aria-label={`Unassign ${p.name} from ${rank}`}
        className="cursor-pointer text-muted-foreground opacity-0 transition-opacity duration-fast ease-brand group-hover:opacity-100 hover:text-destructive"
      >
        ×
      </span>
    </div>
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
        {occupants.map(renderPlayerRow)}
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
              {renderPlayerRow(p)}
            </div>
          );
        })}
      </>
    );
  }
  return null;
}

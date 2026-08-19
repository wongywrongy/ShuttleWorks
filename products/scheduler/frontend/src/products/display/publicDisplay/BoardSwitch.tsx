/**
 * Board switch — the one control a HYBRID workspace's board needs.
 *
 * A workspace with both operator modules enabled has two boards' worth of
 * content and one screen. This chip sits in each board's header tab row and
 * flips `?board=`, so the other engine is reachable from the board itself
 * rather than only by hand-editing the URL. It is absent entirely on
 * single-engine workspaces — nothing to switch to.
 *
 * Chrome comes from the caller (`className`) so the chip is the same object
 * as the view tabs it sits beside on whichever board is hosting it.
 */
import { useSearchParams } from 'react-router-dom';

export function BoardSwitch({ to, className }: { to: 'meet' | 'bracket'; className: string }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const label = to === 'bracket' ? 'Bracket' : 'Meet';

  return (
    <button
      type="button"
      data-testid={`board-switch-${to}`}
      aria-label={`Show the ${label.toLowerCase()} board`}
      className={className}
      onClick={() => {
        const next = new URLSearchParams(searchParams);
        next.set('board', to);
        // `view` belongs to the board being left — carrying it over would
        // hand the other board a view id it doesn't have.
        next.delete('view');
        setSearchParams(next, { replace: true });
      }}
    >
      {label}
    </button>
  );
}

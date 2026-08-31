/**
 * Board switch — the one control a HYBRID workspace's board needs.
 *
 * A workspace with both operator modules enabled has two boards' worth of
 * content and one screen. This chip sits in each board's header tab row and
 * flips `?board=`, so the other engine is reachable from the board itself
 * rather than only by hand-editing the URL. It is absent entirely on
 * single-engine workspaces — nothing to switch to.
 *
 * It uses the same shared segment primitive as the adjacent view choices.
 */
import { useSearchParams } from 'react-router-dom';
import { MODULE_LABELS } from '../../../platform/product-shell/types';
import { ActiveChoice } from '../../../components/ActiveChoice';

export function BoardSwitch({ to }: { to: 'meet' | 'bracket' }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const label = MODULE_LABELS[to];

  return (
    <ActiveChoice
      active={false}
      geometry="segment"
      semantics="pressed"
      data-testid={`board-switch-${to}`}
      aria-label={`Show the ${label.toLowerCase()} board`}
      className="px-4 py-2 text-base font-semibold"
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
    </ActiveChoice>
  );
}

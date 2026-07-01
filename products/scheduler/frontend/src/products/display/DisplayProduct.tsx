import { lazy, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowSquareOut, GearSix } from '@phosphor-icons/react';
import { useTournamentId } from '../../hooks/useTournamentId';
import { TabSkeleton } from '../../components/TabSkeleton';
import { ActionsBar } from '../../components/control-plane';
import { INTERACTIVE_BASE } from '../../lib/utils';

const PublicDisplayPage = lazy(() =>
  import('./PublicDisplayPage').then((m) => ({ default: m.PublicDisplayPage })),
);

/** Display product mode: the venue public-display surface, live in-shell,
 *  with a "Configure display" shortcut and an "Open fullscreen" affordance. */
export function DisplayProduct() {
  const navigate = useNavigate();
  const tid = useTournamentId();
  return (
    <div className="flex h-full min-h-0 flex-col">
      <ActionsBar
        title="Preview"
        status={
          <span className="text-xs text-muted-foreground">
            The venue TV for this workspace
          </span>
        }
      >
        <button
          type="button"
          onClick={() => navigate(`/tournaments/${tid}/setup?section=display`)}
          className={`${INTERACTIVE_BASE} inline-flex h-7 items-center gap-1.5 rounded-sm border border-border bg-card px-2.5 text-xs text-card-foreground hover:bg-muted/40 hover:text-foreground`}
        >
          <GearSix aria-hidden="true" className="h-3.5 w-3.5" />
          Configure display
        </button>
        <a
          href={`/display?id=${tid}`}
          target="_blank"
          rel="noopener noreferrer"
          className={`${INTERACTIVE_BASE} inline-flex h-7 items-center gap-1.5 rounded-sm bg-primary px-2.5 text-xs font-medium text-primary-foreground hover:opacity-90`}
        >
          <ArrowSquareOut aria-hidden="true" className="h-3.5 w-3.5" />
          Open fullscreen
        </a>
      </ActionsBar>
      <div className="relative min-h-0 flex-1 overflow-hidden bg-card">
        <div className="absolute inset-0 overflow-auto">
          <Suspense fallback={<TabSkeleton tab="tv" />}>
            <PublicDisplayPage />
          </Suspense>
        </div>
      </div>
    </div>
  );
}

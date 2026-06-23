import { lazy, Suspense } from 'react';
import { ArrowSquareOut, GearSix } from '@phosphor-icons/react';
import { useUiStore } from '../../store/uiStore';
import { TabSkeleton } from '../../components/TabSkeleton';
import { INTERACTIVE_BASE } from '../../lib/utils';

const PublicDisplayPage = lazy(() =>
  import('../../pages/PublicDisplayPage').then((m) => ({ default: m.PublicDisplayPage })),
);

/** Display product mode: the venue public-display surface, live in-shell,
 *  with a "Configure display" shortcut and an "Open fullscreen" affordance. */
export function DisplayProduct() {
  const setActiveTab = useUiStore((s) => s.setActiveTab);
  return (
    <div className="mx-auto flex h-full max-w-[1400px] flex-col gap-4 px-4 py-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">Public display</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            The venue TV for this workspace. Open fullscreen on the display device.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setActiveTab('setup');
              const url = new URL(window.location.href);
              url.searchParams.set('section', 'display');
              window.history.replaceState({}, '', url.toString());
            }}
            className={`${INTERACTIVE_BASE} inline-flex items-center gap-1.5 rounded border border-border bg-card px-3 py-1.5 text-sm text-card-foreground hover:bg-muted/40 hover:text-foreground`}
          >
            <GearSix aria-hidden="true" className="h-4 w-4" />
            Configure display
          </button>
          <a
            href="/display"
            target="_blank"
            rel="noopener noreferrer"
            className={`${INTERACTIVE_BASE} inline-flex items-center gap-1.5 rounded bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90`}
          >
            <ArrowSquareOut aria-hidden="true" className="h-4 w-4" />
            Open fullscreen
          </a>
        </div>
      </header>
      <div className="relative min-h-0 flex-1 overflow-hidden border border-border bg-card">
        <div className="absolute inset-0 overflow-auto">
          <Suspense fallback={<TabSkeleton tab="tv" />}>
            <PublicDisplayPage />
          </Suspense>
        </div>
      </div>
    </div>
  );
}

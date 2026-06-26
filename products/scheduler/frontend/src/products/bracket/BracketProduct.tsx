import { lazy, Suspense } from 'react';
import { TabSkeleton } from '../../components/TabSkeleton';
import { useUiStore } from '../../store/uiStore';

const BracketTab = lazy(() =>
  import('./BracketTab').then((m) => ({ default: m.BracketTab })),
);

/** Bracket product mode: the bracket tab strip + the bracket surface. */
export function BracketProduct() {
  const activeTab = useUiStore((s) => s.activeTab);
  return (
    // h-full (not just flex-1): the AppShell <main> is a block, so flex-1
    // can't stretch us — h-full fills its definite height so the bracket
    // surfaces (the pan/zoom draw canvas in particular) use the screen.
    <div className="flex h-full min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-auto bg-card">
        <Suspense fallback={<TabSkeleton tab={activeTab} />}>
          <div key="bracket" className="h-full animate-block-in">
            <BracketTab />
          </div>
        </Suspense>
      </div>
    </div>
  );
}

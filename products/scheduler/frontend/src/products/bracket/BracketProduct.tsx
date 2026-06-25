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
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-auto">
        <Suspense fallback={<TabSkeleton tab={activeTab} />}>
          <div key="bracket" className="h-full animate-block-in">
            <BracketTab />
          </div>
        </Suspense>
      </div>
    </div>
  );
}

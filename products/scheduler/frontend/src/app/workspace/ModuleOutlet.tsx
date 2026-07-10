import { lazy, Suspense } from 'react';
import { useUiStore } from '../../store/uiStore';
import { moduleForTab } from '../../platform/domain/moduleModel';
import { TabSkeleton } from '../../components/TabSkeleton';
import { isOperationsSegment } from '../../products/operations/operationsSegments';

// Lazy-load the four module products so entering a workspace parses only
// the active module's code. Previously all four were statically imported
// here — Operations in particular has no internal lazy boundaries, so its
// entire live surface loaded on every workspace entry regardless of tab
// (PERF_FINDINGS.md §1, FIX A). Each product already lazy-loads its own
// sub-pages; this defers the product wrappers themselves.
const MeetProduct = lazy(() =>
  import('../../products/meet/MeetProduct').then((m) => ({ default: m.MeetProduct })),
);
const BracketProduct = lazy(() =>
  import('../../products/bracket/BracketProduct').then((m) => ({ default: m.BracketProduct })),
);
const DisplayProduct = lazy(() =>
  import('../../products/display/DisplayProduct').then((m) => ({ default: m.DisplayProduct })),
);
const OperationsProduct = lazy(() =>
  import('../../products/operations/OperationsProduct').then((m) => ({
    default: m.OperationsProduct,
  })),
);

interface ModuleOutletProps {
  /** True only when BOTH Meet and Bracket are enabled (resolved from the
   *  real module catalog in `AppShell`). Drives the unified Operations
   *  surface; defaults to false so a single-engine workspace — and any
   *  caller without enablement state — keeps today's engine-specific
   *  Operations views. */
  bothEnginesEnabled?: boolean;
}

/** Mounts the module that owns the current active tab. When both engines
 *  are enabled and the active tab is an Operations segment, the unified
 *  cross-engine Operations surface takes over (one Courts + one Live view
 *  with mixed-source rows); otherwise the owning engine renders as before. */
export function ModuleOutlet({ bothEnginesEnabled = false }: ModuleOutletProps) {
  const activeTab = useUiStore((s) => s.activeTab);
  const kind = useUiStore((s) => s.activeTournamentKind);
  const module = moduleForTab(activeTab, kind);

  const child =
    bothEnginesEnabled && isOperationsSegment(activeTab) ? (
      <OperationsProduct />
    ) : module === 'bracket' ? (
      <BracketProduct />
    ) : module === 'display' ? (
      <DisplayProduct />
    ) : (
      <MeetProduct />
    );

  return <Suspense fallback={<TabSkeleton tab={activeTab} />}>{child}</Suspense>;
}

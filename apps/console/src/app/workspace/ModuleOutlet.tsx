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
const EntriesProduct = lazy(() =>
  import('../../products/entries/EntriesProduct').then((m) => ({
    default: m.EntriesProduct,
  })),
);

interface ModuleOutletProps {
  /** Which engines this workspace runs (resolved from the real module
   *  catalog in `AppShell`). Every Operations segment routes to the unified
   *  `OperationsProduct` since the SP-CONSOLE-4 B3 flip — this only decides
   *  which engine's actions it renders. Defaults to both. */
  engines?: { meet: boolean; bracket: boolean };
}

/** Mounts the module that owns the current active tab. Operations segments
 *  render the unified Operations surface (single- or cross-engine, per
 *  `engines`); every other tab renders its owning module's product. The
 *  `VITE_LEGACY_OPS` fallback died with the legacy pages at SP-CONSOLE-4 B4. */
export function ModuleOutlet({ engines }: ModuleOutletProps) {
  const activeTab = useUiStore((s) => s.activeTab);
  const kind = useUiStore((s) => s.activeTournamentKind);
  const module = moduleForTab(activeTab, kind);

  const child =
    isOperationsSegment(activeTab) ? (
      <OperationsProduct engines={engines} />
    ) : module === 'bracket' ? (
      <BracketProduct />
    ) : module === 'display' ? (
      <DisplayProduct />
    ) : module === 'entries' ? (
      <EntriesProduct />
    ) : (
      <MeetProduct />
    );

  return <Suspense fallback={<TabSkeleton tab={activeTab} />}>{child}</Suspense>;
}

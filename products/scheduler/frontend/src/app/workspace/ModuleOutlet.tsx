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

/** The `VITE_LEGACY_OPS` escape hatch (SP-CONSOLE-4 B3): build with
 *  `VITE_LEGACY_OPS=1` to restore the pre-flip routing, where a
 *  single-engine workspace's Operations segments render the engine's own
 *  legacy pages. Build-time (the `VITE_ERROR_HARNESS` precedent), default
 *  off, deleted with the legacy pages at B4. */
const legacyOps = () => import.meta.env.VITE_LEGACY_OPS === '1';

/** Mounts the module that owns the current active tab. Operations segments
 *  render the unified Operations surface (single- or cross-engine, per
 *  `engines`); every other tab renders its owning module's product. */
export function ModuleOutlet({ engines }: ModuleOutletProps) {
  const activeTab = useUiStore((s) => s.activeTab);
  const kind = useUiStore((s) => s.activeTournamentKind);
  const module = moduleForTab(activeTab, kind);

  const bothEngines = !!engines?.meet && !!engines?.bracket;
  const child =
    isOperationsSegment(activeTab) && (bothEngines || !legacyOps()) ? (
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

import { lazy, Suspense } from 'react';
import { useUiStore } from '../../store/uiStore';
import { moduleForTab } from '../../platform/domain/moduleModel';
import { TabSkeleton } from '../../components/TabSkeleton';
import { isOperationsSegment } from '../../modules/operations/operationsSegments';
import { useTournamentIdOrNull } from '../../hooks/useTournamentId';

// Lazy-load the four module products so entering a workspace parses only
// the active module's code. Previously all four were statically imported
// here — Operations in particular has no internal lazy boundaries, so its
// entire live surface loaded on every workspace entry regardless of tab
// (PERF_FINDINGS.md §1, FIX A). Each product already lazy-loads its own
// sub-pages; this defers the product wrappers themselves.
const MeetProduct = lazy(() =>
  import('../../modules/meet/MeetProduct').then((m) => ({ default: m.MeetProduct })),
);
const BracketProduct = lazy(() =>
  import('../../modules/bracket/BracketProduct').then((m) => ({ default: m.BracketProduct })),
);
const DisplayProduct = lazy(() =>
  import('../../modules/display/DisplayProduct').then((m) => ({ default: m.DisplayProduct })),
);
const OperationsProduct = lazy(() =>
  import('../../modules/operations/OperationsProduct').then((m) => ({
    default: m.OperationsProduct,
  })),
);
const EntriesProduct = lazy(() =>
  import('../../modules/entries/EntriesProduct').then((m) => ({
    default: m.EntriesProduct,
  })),
);
const SetupProduct = lazy(() =>
  import('../../modules/setup/SetupProduct').then((m) => ({ default: m.SetupProduct })),
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
  const tid = useTournamentIdOrNull();
  const module = moduleForTab(activeTab, kind);

  const child =
    activeTab === 'setup' && tid ? (
      <SetupProduct tid={tid} />
    ) : isOperationsSegment(activeTab) ? (
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

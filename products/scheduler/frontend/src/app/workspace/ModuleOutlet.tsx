import { useUiStore } from '../../store/uiStore';
import { moduleForTab } from '../../platform/domain/moduleModel';
import { MeetProduct } from '../../products/meet/MeetProduct';
import { BracketProduct } from '../../products/bracket/BracketProduct';
import { DisplayProduct } from '../../products/display/DisplayProduct';
import { OperationsProduct } from '../../products/operations/OperationsProduct';
import { isOperationsSegment } from '../../products/operations/operationsSegments';

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
  if (bothEnginesEnabled && isOperationsSegment(activeTab)) return <OperationsProduct />;
  const module = moduleForTab(activeTab, kind);
  if (module === 'bracket') return <BracketProduct />;
  if (module === 'display') return <DisplayProduct />;
  return <MeetProduct />;
}

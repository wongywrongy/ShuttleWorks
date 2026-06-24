import { useUiStore } from '../../store/uiStore';
import { moduleForTab } from '../../platform/domain/moduleModel';
import { MeetProduct } from '../../products/meet/MeetProduct';
import { BracketProduct } from '../../products/bracket/BracketProduct';
import { DisplayProduct } from '../../products/display/DisplayProduct';

/** Mounts the module that owns the current active tab. */
export function ModuleOutlet() {
  const activeTab = useUiStore((s) => s.activeTab);
  const kind = useUiStore((s) => s.activeTournamentKind);
  const module = moduleForTab(activeTab, kind);
  if (module === 'bracket') return <BracketProduct />;
  if (module === 'display') return <DisplayProduct />;
  return <MeetProduct />;
}

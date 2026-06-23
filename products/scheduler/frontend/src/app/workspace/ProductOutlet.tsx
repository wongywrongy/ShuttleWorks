import { useUiStore } from '../../store/uiStore';
import { productForTab } from '../../platform/domain/productModel';
import { MeetProduct } from '../../products/meet/MeetProduct';
import { BracketProduct } from '../../products/bracket/BracketProduct';
import { DisplayProduct } from '../../products/display/DisplayProduct';

/** Mounts the product module that owns the current active tab. */
export function ProductOutlet() {
  const activeTab = useUiStore((s) => s.activeTab);
  const kind = useUiStore((s) => s.activeTournamentKind);
  const product = productForTab(activeTab, kind);
  if (product === 'bracket') return <BracketProduct />;
  if (product === 'display') return <DisplayProduct />;
  return <MeetProduct />;
}

import type { ReactNode } from 'react';
import { ProductSwitcher } from './ProductSwitcher';
import { WorkspaceIdentityBar } from './WorkspaceIdentityBar';
import type { ProductId, ProductSwitcherItem, WorkspaceIdentity } from './types';

interface WorkspaceShellProps {
  identity: WorkspaceIdentity;
  products: ProductSwitcherItem[];
  activeProduct: ProductId;
  onSelectProduct: (id: ProductId) => void;
  onBackToHub: () => void;
  statusSlot?: ReactNode;
  children: ReactNode;
}

/** The stable workspace chrome: a top bar with identity, product switcher,
 *  and a status/connection slot, hosting the active product module below. */
export function WorkspaceShell({
  identity,
  products,
  activeProduct,
  onSelectProduct,
  onBackToHub,
  statusSlot,
  children,
}: WorkspaceShellProps) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="sticky top-0 z-chrome flex h-12 flex-shrink-0 items-center justify-between gap-3 border-b border-border bg-card px-4">
        <WorkspaceIdentityBar identity={identity} onBackToHub={onBackToHub} />
        <ProductSwitcher products={products} active={activeProduct} onSelect={onSelectProduct} />
        <div className="flex items-center gap-2">{statusSlot}</div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
    </div>
  );
}

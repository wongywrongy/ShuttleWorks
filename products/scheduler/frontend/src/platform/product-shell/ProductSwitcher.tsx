import { INTERACTIVE_BASE } from '../../lib/utils';
import type { ProductId, ProductSwitcherItem } from './types';

interface ProductSwitcherProps {
  products: ProductSwitcherItem[];
  active: ProductId;
  onSelect: (id: ProductId) => void;
}

/** Segmented control over the workspace's product modes. Unavailable
 *  products render disabled with their reason as a tooltip. */
export function ProductSwitcher({ products, active, onSelect }: ProductSwitcherProps) {
  return (
    <div role="tablist" aria-label="Products" className="flex items-center gap-0.5">
      {products.map((p) => {
        const isActive = p.id === active;
        return (
          <button
            key={p.id}
            type="button"
            role="tab"
            disabled={!p.available}
            aria-selected={isActive}
            aria-disabled={!p.available || undefined}
            title={!p.available ? p.disabledReason : undefined}
            data-testid={`product-${p.id}`}
            onClick={() => {
              if (p.available) onSelect(p.id);
            }}
            className={[
              INTERACTIVE_BASE,
              'rounded-sm px-3 py-1.5 text-sm font-medium tracking-tight',
              !p.available
                ? 'cursor-not-allowed text-muted-foreground/40'
                : isActive
                  ? 'bg-accent/10 text-accent font-semibold'
                  : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground',
            ].join(' ')}
          >
            {p.label}
          </button>
        );
      })}
    </div>
  );
}

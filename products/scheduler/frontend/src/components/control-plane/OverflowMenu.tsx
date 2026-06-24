import { Menu, MenuButton, MenuItems, MenuItem } from '@headlessui/react';
import { DotsThree } from '@phosphor-icons/react';

export interface OverflowItem {
  key: string;
  label: string;
  onSelect: () => void;
  destructive?: boolean;
  testId?: string;
}

/** A compact accessible "…" action menu (Headless UI Menu v2). Anchored to the
 *  bottom-end of the trigger; items are buttons that close the menu on select. */
export function OverflowMenu({ label, items }: { label?: string; items: OverflowItem[] }) {
  return (
    <Menu>
      <MenuButton
        aria-label={label ?? 'More actions'}
        onClick={(e) => e.stopPropagation()}
        className="inline-flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-muted/40 hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
      >
        <DotsThree aria-hidden weight="bold" className="h-5 w-5" />
      </MenuButton>
      <MenuItems
        anchor="bottom end"
        className="z-modal min-w-40 rounded-md border border-border bg-card py-1 shadow-md focus:outline-none"
      >
        {items.map((item) => (
          <MenuItem key={item.key}>
            <button
              type="button"
              data-testid={item.testId}
              onClick={(e) => {
                e.stopPropagation();
                item.onSelect();
              }}
              className={[
                'block w-full px-3 py-1.5 text-left text-sm',
                'data-[focus]:bg-muted/60',
                item.destructive ? 'text-destructive' : 'text-foreground',
              ].join(' ')}
            >
              {item.label}
            </button>
          </MenuItem>
        ))}
      </MenuItems>
    </Menu>
  );
}

import { Fragment } from 'react';
import { Menu, MenuButton, MenuItems, MenuItem } from '@headlessui/react';
import { DotsThree } from '@phosphor-icons/react';

export interface OverflowItem {
  key: string;
  label: string;
  onSelect: () => void;
  destructive?: boolean;
  testId?: string;
  /** Locked: the action is not available in this state.
   *
   *  The item stays FOCUSABLE and keyboard-reachable — it is marked
   *  `aria-disabled`, not `disabled`, and activation is blocked in the
   *  click handler. That is deliberate: the native `disabled` attribute
   *  drops the item out of the tab order, so a keyboard or screen-reader
   *  user meets an item that isn't there rather than one that explains
   *  itself. `disabledReason` is folded into the accessible name.
   *
   *  Callers should ALSO render the reason visibly — and note that
   *  clicking a disabled item still closes the menu (Headless UI closes
   *  on select), so a caller relying on the menu staying open needs to
   *  handle that itself. */
  disabled?: boolean;
  disabledReason?: string;
  /** Draw a rule ABOVE this item, separating it from the group before it.
   *
   *  For the case this exists to answer: a destructive item sitting flush
   *  against a routine one. The Hub row's menu put `Settings` and `Delete`
   *  as adjacent 32px targets with no gap and no rule, so a 32px slip took
   *  the operator from one to the other. A rule does not make the slip
   *  impossible; it makes the boundary visible, which is what a menu owes
   *  before its last item deletes a workspace. */
  separator?: boolean;
}

/** A compact accessible "…" action menu (Headless UI Menu v2). Anchored to the
 *  bottom-end of the trigger; items are buttons that close the menu on select. */
export function OverflowMenu({ label, items }: { label?: string; items: OverflowItem[] }) {
  return (
    <Menu>
      <MenuButton
        aria-label={label ?? 'More actions'}
        onClick={(e) => e.stopPropagation()}
        className="inline-flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-muted/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <DotsThree aria-hidden weight="bold" className="h-5 w-5" />
      </MenuButton>
      <MenuItems
        anchor="bottom end"
        className="z-modal min-w-40 rounded-md border border-border bg-card py-1 shadow-md focus:outline-none"
      >
        {items.map((item) => (
          // Deliberately NOT `disabled` on MenuItem: that drops the item
          // out of keyboard navigation entirely, so the reason it exists
          // never reaches anyone navigating by keyboard.
          <Fragment key={item.key}>
          {item.separator ? (
            // Presentational: the grouping is already carried by the rule
            // being visible, and a separator role here would add an
            // announcement without adding information.
            <div aria-hidden className="my-1 border-t border-border" />
          ) : null}
          <MenuItem>
            <button
              type="button"
              data-testid={item.testId}
              // `aria-disabled`, NOT the `disabled` attribute. A disabled
              // control is removed from the tab order and goes
              // unannounced, so a keyboard or screen-reader user meets an
              // item that simply isn't there rather than one that
              // explains itself. Activation is blocked in the handler
              // below instead.
              aria-disabled={item.disabled || undefined}
              // Fold the reason into the accessible name so it is spoken
              // on focus. The tooltip stays for pointer users, but
              // callers should ALSO render the reason visibly — nobody
              // hovers a control they don't believe is live.
              aria-label={
                item.disabled && item.disabledReason
                  ? `${item.label} unavailable: ${item.disabledReason}`
                  : undefined
              }
              title={item.disabled ? item.disabledReason : undefined}
              onClick={(e) => {
                e.stopPropagation();
                if (item.disabled) return;
                item.onSelect();
              }}
              className={[
                'block w-full px-3 py-1.5 text-left text-sm',
                'data-[focus]:bg-muted/60',
                item.disabled
                  ? 'cursor-not-allowed text-muted-foreground opacity-60'
                  : item.destructive
                    ? 'text-destructive'
                    : 'text-foreground',
              ].join(' ')}
            >
              {item.label}
            </button>
          </MenuItem>
          </Fragment>
        ))}
      </MenuItems>
    </Menu>
  );
}

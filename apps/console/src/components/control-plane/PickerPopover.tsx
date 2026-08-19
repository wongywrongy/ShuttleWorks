/**
 * PickerPopover — shared anchored picker chrome (Radix Popover).
 *
 * The panel is portaled to the document body and anchored to the cell via
 * floating-ui, so it can never be clipped by an `overflow-auto` scroll
 * ancestor (the bug this replaces: the match player picker rendered
 * `absolute` INSIDE the matches scroll container and clipped near the
 * viewport bottom) and it flips above the anchor when there's no room below.
 * Use this for stay-open pickers (multi-select, grouped option rows); use
 * `OverflowMenu` for close-on-select action menus.
 *
 * Radix (not Headless UI Menu/Popover) because pickers here have SEVERAL
 * toggling triggers per cell (name chips, "＋ add") and programmatic close
 * rules (singles auto-close) — that needs a controlled `open`/`onOpenChange`,
 * which Headless popovers don't offer. Open-state and trigger wiring stay in
 * the consumer; this component owns anchoring, portal, collision handling,
 * and Esc/outside-pointer dismissal (veto anchor-area pointerdowns with
 * `onPointerDownOutside` so trigger toggles don't close-then-reopen).
 */
import type { RefObject } from 'react';
import * as RadixPopover from '@radix-ui/react-popover';
import { cn } from '@scheduler/design-system/lib/utils';

export function PickerPopover(props: RadixPopover.PopoverProps) {
  return <RadixPopover.Root {...props} />;
}

PickerPopover.Anchor = RadixPopover.Anchor;

function PickerPopoverPanel({
  className,
  children,
  guardRef,
  onPointerDownOutside,
  ...rest
}: RadixPopover.PopoverContentProps & {
  /** Region whose pointerdowns must NOT dismiss the popover — pass the
   *  trigger/anchor wrapper. Without it, a pointerdown on a toggle button
   *  dismisses first and the button's own toggle then REOPENS (a flicker
   *  every consumer would otherwise have to guard by hand). */
  guardRef?: RefObject<HTMLElement | null>;
}) {
  return (
    <RadixPopover.Portal>
      <RadixPopover.Content
        side="bottom"
        align="start"
        sideOffset={4}
        collisionPadding={8}
        // Radix's default open-autofocus (first tabbable in the panel) is
        // load-bearing: the panel is PORTALED to the body, so without moving
        // focus a keyboard user tabbing from the trigger can never reach the
        // options. Mouse multi-add is unaffected (clicks don't need focus)
        // and Radix restores focus to the trigger on close.
        onPointerDownOutside={(e) => {
          if (guardRef?.current?.contains(e.target as Node)) {
            e.preventDefault();
            return;
          }
          onPointerDownOutside?.(e);
        }}
        className={cn(
          'motion-enter z-modal max-h-64 w-64 overflow-y-auto rounded border border-border bg-popover p-2 text-popover-foreground shadow-lg focus:outline-none',
          className,
        )}
        {...rest}
      >
        {children}
      </RadixPopover.Content>
    </RadixPopover.Portal>
  );
}

PickerPopover.Panel = PickerPopoverPanel;

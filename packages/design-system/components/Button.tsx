import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '../lib/utils';

/**
 * Button — the system's only button.
 *
 * Ported from the curated Claude Design library (`components/actions/Button`
 * + `ButtonIcon`, ADR 0027): one construction across every style — a 1px
 * border, the `--shadow-hard` (0 3px 0) offset so it reads as pressable,
 * and a press state that sinks it 3px onto its shadow. Quiet styles
 * (`ghost`, `link`, `toolbar`) have no offset and do not sink. The
 * signature glow is gone; intent is carried by fill, not by light.
 *
 * Variant vocabulary (the shadcn-style API is preserved so existing call
 * sites are unchanged):
 * - `default` / `brand` — the azure accent. Reserve for the ONE primary
 *   action on a surface. (`default` is the curated `brand`; the code base
 *   has always spelled its primary action `default`.)
 * - `ink` — the curated library's `default`: solid ink fill. For an
 *   emphasised action that is not the accent (e.g. active tab-like states).
 * - `destructive`, `outline`, `secondary` — offset + sink.
 * - `toolbar` — sunken chip chrome for page-header tool rows.
 * - `ghost`, `link` — no chrome.
 *
 * Sizes: xs 28 / sm 36 / default 40 / lg 44; icon 36 / icon-sm 28 /
 * icon-xs 24. Radius follows size: 6px on xs and the small icons, 8px
 * otherwise, 9px on lg. Compact sizes keep an invisible 44×44 hit area
 * via `::before` so touch targets meet WCAG 2.5.5.
 *
 * Motion: 120ms (`duration-fast`) on transform/shadow with the
 * over-shoot-resistant `ease-out-quick`, exactly the curated press.
 */
const HARD = 'shadow active:translate-y-[3px] active:shadow-none';
const HIT = "relative before:absolute before:-inset-2 before:content-['']";

const buttonVariants = cva(
  'inline-flex select-none items-center justify-center whitespace-nowrap border font-semibold leading-none tracking-[0.01em] ' +
    'transition-[transform,box-shadow,background-color,color] duration-fast ease-out-quick ' +
    'ring-offset-surface-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 ' +
    'disabled:pointer-events-none disabled:opacity-50 disabled:shadow-none ' +
    '[&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: `border-action-primary-hover bg-accent text-accent-ink hover:bg-action-primary-hover ${HARD}`,
        brand: `border-action-primary-hover bg-brand text-brand-ink hover:bg-action-primary-hover ${HARD}`,
        ink: `border-primary bg-primary text-primary-foreground hover:bg-primary/90 ${HARD}`,
        destructive: `border-destructive bg-destructive text-destructive-foreground hover:bg-destructive/90 ${HARD}`,
        outline: `border-border-control bg-card text-text-primary hover:bg-surface-hover ${HARD}`,
        secondary: `border-rule bg-secondary text-secondary-foreground hover:bg-surface-chip ${HARD}`,
        toolbar:
          'border-rule bg-surface-sunken text-text-secondary hover:bg-surface-chip hover:text-text-primary',
        ghost: 'border-transparent text-text-primary hover:bg-surface-hover',
        link: 'border-transparent text-action-primary underline underline-offset-[3px] hover:text-action-primary-hover',
      },
      size: {
        xs: `h-7 gap-1.5 rounded-sm px-2.5 text-xs [&_svg]:size-3.5 ${HIT}`,
        sm: 'h-9 gap-2 rounded px-3 text-sm',
        default: 'h-10 gap-2 rounded px-3.5 text-sm',
        lg: 'h-11 gap-2 rounded-md px-[18px] text-sm',
        icon: 'h-9 w-9 rounded',
        'icon-sm': `h-7 w-7 rounded-sm [&_svg]:size-3.5 ${HIT}`,
        'icon-xs': `h-6 w-6 rounded-sm [&_svg]:size-3 ${HIT} before:-inset-[10px]`,
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = 'Button';

export { Button, buttonVariants };

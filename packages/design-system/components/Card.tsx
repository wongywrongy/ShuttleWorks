import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '../lib/utils';

/**
 * Card — the canonical surface primitive.
 *
 * Ported from the curated Claude Design library (`components/data/Card`,
 * ADR 0027). A card is a *container*, so it takes the 8px container
 * radius (`rounded` → `--radius`); 6px is reserved for anything pressable.
 *
 * Variants:
 * - `bare` — a sunken well (`--surface-sunken`) with no hairline or
 *   shadow, for dense in-context grouping (divide-y rows, inline editors).
 *   The transparent border keeps its box the same size as `frame`.
 * - `frame` (default) — raised surface + hairline + `--shadow-card`.
 * - `elevated` — overlay surface + hairline + `--shadow-md`, for
 *   popover-tier emphasis.
 *
 * Light mode carries elevation with real Gaussian shadows; dark mode
 * resolves the same shadow tokens to luminance-only depth (see
 * `tokens.css`), so the classes are identical in both themes.
 */
const cardVariants = cva('rounded text-text-primary', {
  variants: {
    variant: {
      bare: 'border border-transparent bg-surface-sunken',
      frame: 'border border-rule bg-surface-raised shadow-card',
      elevated: 'border border-rule bg-surface-overlay shadow-md',
    },
  },
  defaultVariants: { variant: 'frame' },
});

export interface CardProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof cardVariants> {}

const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, variant, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(cardVariants({ variant }), className)}
      {...props}
    />
  )
);
Card.displayName = 'Card';

// Card padding is the 16px step (`--space-5`): "card padding / grid gap"
// in the spacing ladder. Header/Content/Footer share it so a composed
// card reads as one 16px inset.
const CardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn('flex flex-col space-y-1.5 p-4', className)}
    {...props}
  />
));
CardHeader.displayName = 'CardHeader';

// CardTitle is intentionally NOT display-tier — display type is for
// marquee headers only. The card sample is 14/600 over 12/18 secondary.
const CardTitle = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn('text-sm font-semibold leading-tight', className)}
    {...props}
  />
));
CardTitle.displayName = 'CardTitle';

const CardDescription = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn('text-xs leading-[18px] text-text-secondary', className)}
    {...props}
  />
));
CardDescription.displayName = 'CardDescription';

const CardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('p-4 pt-0', className)} {...props} />
));
CardContent.displayName = 'CardContent';

const CardFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn('flex items-center p-4 pt-0', className)}
    {...props}
  />
));
CardFooter.displayName = 'CardFooter';

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardDescription,
  CardContent,
};

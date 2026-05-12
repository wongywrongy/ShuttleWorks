import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '../lib/utils';

/**
 * Card — the canonical surface primitive.
 *
 * Variants:
 * - `bare` strips chrome for dense, in-context grouping (divide-y rows,
 *   inline editors).
 * - `frame` (default) — the historical look: border + bg-card. No shadow
 *   per BRAND.md §6 (brutalism rejects soft shadow; substrate elevation
 *   via `bg-card` is the depth signal).
 * - `elevated` — same as `frame` but uses `--bg-elev` substrate for
 *   popover-tier emphasis without adding a shadow.
 *
 * Radii: BRAND.md §3 forces 90° corners on cards. The shadcn-canonical
 * `rounded-lg` is dropped; cards are sharp-cornered.
 */
const cardVariants = cva('text-card-foreground', {
  variants: {
    variant: {
      bare: 'bg-transparent',
      frame: 'border bg-card',
      elevated: 'border bg-card',
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

const CardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn('flex flex-col space-y-1.5 p-6', className)}
    {...props}
  />
));
CardHeader.displayName = 'CardHeader';

// CardTitle is intentionally NOT display-tier — BRAND.md keeps display
// type for marquee headers only. Cards rely on weight + tracking, not
// raw scale, for hierarchy.
const CardTitle = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      'text-base font-semibold leading-tight tracking-tight',
      className
    )}
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
    className={cn('text-sm text-muted-foreground', className)}
    {...props}
  />
));
CardDescription.displayName = 'CardDescription';

const CardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('p-6 pt-0', className)} {...props} />
));
CardContent.displayName = 'CardContent';

const CardFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn('flex items-center p-6 pt-0', className)}
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

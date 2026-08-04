import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '../lib/utils';

/**
 * Button — the canonical button primitive.
 *
 * "Warmed-B blue-glow" language: THE primary action carries the signature
 * azure glow (`default`/`brand` — accent fill + accent-ink + shadow-glow);
 * secondary actions are quiet (outline / secondary / ghost / toolbar). Glow
 * marks intent, not decoration, so reserve `default`/`brand` for the single
 * primary action on a surface. The shadcn-style API is preserved for swap
 * compatibility — existing `<Button variant="ghost">` call-sites are unchanged.
 * Focus ring is the accent via `--ring`.
 */
const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded text-sm font-medium ' +
    'ring-offset-background ' +
    'transition-[background-color,color,box-shadow,transform,opacity,filter] duration-150 ease-brand ' +
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ' +
    'active:scale-[0.97] ' +
    'disabled:pointer-events-none disabled:opacity-50 ' +
    'select-none ' +
    '[&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        // Primary = the azure glow button (accent fill, dark ink, signature glow).
        default: 'bg-accent text-accent-ink shadow-glow hover:brightness-110',
        destructive:
          'bg-destructive text-destructive-foreground hover:bg-destructive/90',
        outline:
          'border border-border-control bg-card text-foreground hover:bg-muted/40',
        secondary:
          'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        ghost: 'text-muted-foreground hover:bg-muted/40 hover:text-foreground',
        // `link` uses the accent so links stand out from body text.
        link: 'text-accent underline-offset-4 hover:underline',
        // `brand` — alias of the primary glow button (explicit intent).
        brand: 'bg-brand text-brand-ink shadow-glow hover:brightness-110',
        // Toolbar chip — hairline + bg-card chrome shared across page headers
        // (Export, Director, Disruption, Re-optimize, Generate).
        toolbar:
          'border border-border bg-card text-card-foreground hover:bg-muted/40 hover:text-foreground',
      },
      size: {
        // xs / icon-xs / icon-sm get an invisible 44x44 hit area via a
        // ::before pseudo-element so the visual chrome stays compact
        // while touch / pointer targets meet WCAG 2.5.5 (Level AAA).
        xs: "relative h-7 rounded-sm px-2 text-xs gap-1 [&_svg]:size-3.5 before:absolute before:-inset-2 before:content-['']",
        default: 'h-10 px-4 py-2',
        sm: 'h-9 rounded px-3',
        lg: 'h-11 rounded-md px-8',
        icon: 'h-10 w-10',
        'icon-sm':
          "relative h-8 w-8 [&_svg]:size-4 before:absolute before:-inset-2 before:content-['']",
        'icon-xs':
          "relative h-7 w-7 [&_svg]:size-3.5 before:absolute before:-inset-[10px] before:content-['']",
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

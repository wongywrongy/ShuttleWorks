import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '../lib/utils';

/** Shared buttons use fill and borders for hierarchy. No routine elevation or
 * moving hit targets. Compact controls retain their actual, non-overlapping box. */
const buttonVariants = cva(
  'inline-flex select-none items-center justify-center whitespace-nowrap border font-semibold leading-none tracking-[0.01em] ' +
    'transition-colors duration-fast ease-out-quick ' +
    'ring-offset-surface-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 ' +
    'disabled:pointer-events-none disabled:cursor-not-allowed disabled:saturate-0 ' +
    '[&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: `border-action-primary-hover bg-accent text-accent-ink hover:bg-action-primary-hover`,
        brand: `border-action-primary-hover bg-brand text-brand-ink hover:bg-action-primary-hover`,
        ink: `border-primary bg-primary text-primary-foreground hover:bg-primary/90`,
        destructive: `border-destructive bg-destructive text-destructive-foreground hover:bg-destructive/90`,
        outline: `border-border-control bg-card text-text-primary hover:bg-surface-hover`,
        secondary: `border-rule bg-secondary text-secondary-foreground hover:bg-surface-chip`,
        toolbar:
          'border-rule bg-surface-sunken text-text-secondary hover:bg-surface-chip hover:text-text-primary',
        ghost: 'border-transparent text-text-primary hover:bg-surface-hover',
        link: 'border-transparent text-action-primary underline underline-offset-[3px] hover:text-action-primary-hover',
      },
      size: {
        xs: `h-8 gap-1.5 rounded-sm px-2.5 text-xs [&_svg]:size-3.5`,
        sm: 'h-9 gap-2 rounded px-3 text-sm',
        default: 'h-10 gap-2 rounded px-3.5 text-sm',
        lg: 'h-11 gap-2 rounded-md px-[18px] text-sm',
        icon: 'h-9 w-9 rounded',
        'icon-sm': `h-8 w-8 rounded-sm [&_svg]:size-3.5`,
        'icon-xs': `h-8 w-8 rounded-sm [&_svg]:size-3 `,
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

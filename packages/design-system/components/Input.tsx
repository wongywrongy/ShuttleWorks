import * as React from 'react';

import { cn } from '../lib/utils';

/**
 * Input — the canonical text input primitive.
 *
 * Radius: `rounded-sm` (2px) per BRAND.md §3 — interactive form
 * controls are the only place 2px corners are allowed; cards/panels
 * stay 90°.
 *
 * Focus: `ring-ring` resolves to brand Signal Orange via the canonical
 * `--ring → --accent` chain in tokens.css.
 */
const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<'input'>>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          'flex h-10 w-full rounded-sm border border-input bg-background px-3 py-2 text-base ring-offset-background',
          'file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground',
          'placeholder:text-muted-foreground',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          'disabled:cursor-not-allowed disabled:opacity-50',
          'md:text-sm',
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = 'Input';

export { Input };

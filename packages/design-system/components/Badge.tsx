import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '../lib/utils';

/**
 * Badge — a rectangular count / label chip in the rationed tones.
 *
 * Ported from the curated Claude Design library (`components/data/Badge`,
 * ADR 0027). 4px radius (`rounded-xs`), never fully round; 22px tall by
 * default (`h-badge`, density-aware) or 18px for the `sm` size; tinted
 * ground + text-grade ink; tabular numerals so counts line up.
 *
 * `Badge` is for counts and neutral labels ("12", "3 pending"). Operational
 * match state is `StatusPill`; the two share a silhouette but not a
 * vocabulary — status hues never decorate neutral content.
 */
const badgeVariants = cva(
  'inline-flex items-center whitespace-nowrap rounded-xs border font-semibold leading-none tracking-[0.01em] tabular-nums',
  {
    variants: {
      tone: {
        default: 'border-rule bg-surface-chip text-text-secondary',
        info: 'border-transparent bg-status-info-bg text-status-info-fg',
        success: 'border-transparent bg-status-success-bg text-status-success-fg',
        warning: 'border-transparent bg-status-warning-bg text-status-warning-fg',
        danger: 'border-transparent bg-status-danger-bg text-status-danger-fg',
        accent: 'border-transparent bg-accent-bg text-accent',
      },
      size: {
        default: 'h-badge px-2 text-2xs',
        sm: 'h-[18px] px-1.5 text-3xs',
      },
    },
    defaultVariants: { tone: 'default', size: 'default' },
  }
);

export type BadgeTone = NonNullable<VariantProps<typeof badgeVariants>['tone']>;
export type BadgeSize = NonNullable<VariantProps<typeof badgeVariants>['size']>;

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, tone, size, ...props }, ref) => (
    <span
      ref={ref}
      className={cn(badgeVariants({ tone, size }), className)}
      {...props}
    />
  )
);
Badge.displayName = 'Badge';

export { Badge, badgeVariants };

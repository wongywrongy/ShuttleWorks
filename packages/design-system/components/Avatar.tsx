import * as React from 'react';

import { cn } from '../lib/utils';

/**
 * Avatar — a square person marker.
 *
 * Ported from the curated Claude Design library (`components/data/Avatar`,
 * ADR 0027). 6px radius (the control radius, `rounded-sm`), one hairline,
 * five sizes. Three renders, picked from what you pass:
 *
 * - `src`       → the image, cover-fitted;
 * - `initials`  → ink fill (`--primary`) with the initials in Geist 600
 *                 at ~36% of the box;
 * - neither     → sunken placeholder glyph in muted ink.
 *
 * `variant` forces one of the three when inference is wrong (e.g. a known
 * user with no photo *and* no name yet should still read as a person).
 */

export type AvatarSize = 'xs' | 'sm' | 'default' | 'lg' | 'xl';
export type AvatarVariant = 'initials' | 'placeholder' | 'image';

// Box (24/32/40/48/64) + initials size (round(box × 0.36)).
const SIZE: Record<AvatarSize, string> = {
  xs: 'size-6 text-[9px]',
  sm: 'size-8 text-xs',
  default: 'size-10 text-sm',
  lg: 'size-12 text-[17px]',
  xl: 'size-16 text-[23px]',
};

// Placeholder glyph is half the box.
const GLYPH: Record<AvatarSize, string> = {
  xs: 'size-3',
  sm: 'size-4',
  default: 'size-5',
  lg: 'size-6',
  xl: 'size-8',
};

export interface AvatarProps extends React.HTMLAttributes<HTMLSpanElement> {
  size?: AvatarSize;
  variant?: AvatarVariant;
  /** Initials to render (e.g. "JW"). */
  initials?: string;
  /** Image source; renders the `image` variant when present. */
  src?: string;
  /** Accessible name for the image. Decorative when omitted. */
  alt?: string;
}

const Avatar = React.forwardRef<HTMLSpanElement, AvatarProps>(
  (
    { className, size = 'default', variant, initials, src, alt = '', ...props },
    ref
  ) => {
    const mode: AvatarVariant =
      variant ?? (src ? 'image' : initials ? 'initials' : 'placeholder');
    const showImage = mode === 'image' && src;
    const isInitials = mode === 'initials';
    return (
      <span
        ref={ref}
        className={cn(
          'inline-flex shrink-0 items-center justify-center overflow-hidden rounded-sm border border-rule font-semibold leading-none tracking-[0.02em]',
          isInitials
            ? 'bg-primary text-primary-foreground'
            : 'bg-surface-sunken text-text-muted',
          SIZE[size],
          className
        )}
        {...props}
      >
        {showImage ? (
          <img src={src} alt={alt} className="block h-full w-full object-cover" />
        ) : isInitials ? (
          initials
        ) : (
          <svg
            viewBox="0 0 16 16"
            fill="none"
            aria-hidden="true"
            className={GLYPH[size]}
          >
            <rect x="5" y="2" width="6" height="6" rx="1" fill="currentColor" />
            <path
              d="M2 15 C2 11.5 4.5 10 8 10 C11.5 10 14 11.5 14 15 Z"
              fill="currentColor"
            />
          </svg>
        )}
      </span>
    );
  }
);
Avatar.displayName = 'Avatar';

export { Avatar };

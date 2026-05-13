import type { ReactNode } from 'react';

import { cn } from '../lib/utils';

/**
 * StatusPill — semantic status badge.
 *
 * Pick a `tone` (semantic state) and optionally show a `dot` and a
 * `pulse` animation. Body text is `children`.
 *
 * Tone mapping to the design system's --status-* palette:
 *   green  → status-live    (emerald — match in progress)
 *   blue   → status-started (sky      — operator started clock)
 *   amber  → status-called  (amber    — called to court)
 *   yellow → status-warning (amber    — soft violation)
 *   red    → status-blocked (red      — hard rule conflict)
 *
 * Routing through `--status-*` keeps every pill on the same hue ladder
 * as the Gantt blocks, toast borders, and TabBar app-status chip.
 *
 * BRAND.md §3 — `rounded` becomes `rounded-none` per brutalist default.
 * The pill is a square-cornered badge with mono-uppercase children for
 * the brutalist style. Tournament's `.pill` CSS class will be replaced
 * with `<StatusPill>` in Phase 6.
 */

export type PillTone = 'green' | 'yellow' | 'red' | 'blue' | 'amber';

const TONE_BG: Record<PillTone, string> = {
  green:  'bg-status-live-bg text-status-live border border-status-live/40',
  yellow: 'bg-status-warning-bg text-status-warning border border-status-warning/40',
  red:    'bg-status-blocked-bg text-status-blocked border border-status-blocked/40',
  blue:   'bg-status-started-bg text-status-started border border-status-started/40',
  amber:  'bg-status-called-bg text-status-called border border-status-called/40',
};

const TONE_DOT: Record<PillTone, string> = {
  green:  'bg-status-live',
  yellow: 'bg-status-warning',
  red:    'bg-status-blocked',
  blue:   'bg-status-started',
  amber:  'bg-status-called',
};

interface Props {
  tone: PillTone;
  dot?: boolean;
  pulse?: boolean;
  className?: string;
  title?: string;
  children: ReactNode;
}

export function StatusPill({
  tone,
  dot,
  pulse,
  className,
  title,
  children,
}: Props) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-1.5 py-0.5 text-2xs font-mono font-medium uppercase tracking-wider',
        TONE_BG[tone],
        className
      )}
      title={title}
    >
      {dot && (
        <span
          className={cn(
            'h-1 w-1 rounded-full',
            TONE_DOT[tone],
            pulse ? 'animate-pulse' : ''
          )}
        />
      )}
      {children}
    </span>
  );
}

import type { ReactNode } from 'react';

import { cn } from '../lib/utils';
import { STATUS_TONE, type StatusToneName } from './statusTone';

/**
 * StatusPill — semantic status badge.
 *
 * Pick a `tone` (semantic state) and optionally show a `dot` and a
 * `pulse` animation. Body text is `children`.
 *
 * Tone mapping to the design system's --status-* palette:
 *   green  → status-live    (emerald — match in progress)
 *   blue   → status-started (sky     — operator started clock)
 *   amber  → status-called  (amber   — called to court)
 *   yellow → status-warning (amber   — soft violation)
 *   red    → status-blocked (red     — hard rule conflict)
 *   idle   → status-idle    (slate-muted — scheduled but not yet active)
 *   done   → status-done    (slate   — finished / archived)
 *
 * Routing through `--status-*` keeps every pill on the same hue ladder
 * as the Gantt blocks, toast borders, and app-status chip.
 *
 * "Warmed-B blue-glow" language: a soft-cornered (`rounded-sm`) badge with a
 * leading swatch dot and an UPPERCASE Geist micro-label (one family — no mono).
 * A live pill breathes via `sw-pulse`.
 */

export type PillTone = 'green' | 'yellow' | 'red' | 'blue' | 'amber' | 'idle' | 'done';

/** The legacy pill vocabulary, aliased onto the shared tone source
 *  (`statusTone.ts`, ADR 0020) so both registers draw one palette. */
const TONE_NAME: Record<PillTone, StatusToneName> = {
  green: 'live',
  yellow: 'warning',
  red: 'blocked',
  blue: 'started',
  amber: 'called',
  idle: 'idle',
  done: 'done',
};

// Composed at module scope in the pill's historical order — the rendered
// strings are byte-identical to the previous inline tables.
const TONE_BG = Object.fromEntries(
  (Object.keys(TONE_NAME) as PillTone[]).map((t) => {
    const s = STATUS_TONE[TONE_NAME[t]];
    return [t, `${s.bg} ${s.text} border ${s.border}`];
  }),
) as Record<PillTone, string>;

const TONE_DOT = Object.fromEntries(
  (Object.keys(TONE_NAME) as PillTone[]).map((t) => [t, STATUS_TONE[TONE_NAME[t]].dot]),
) as Record<PillTone, string>;

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
        'inline-flex items-center gap-1.5 rounded-sm px-2 py-0.5 text-2xs font-semibold uppercase tracking-[0.04em]',
        TONE_BG[tone],
        className
      )}
      title={title}
    >
      {dot && (
        <span
          className={cn(
            'h-1.5 w-1.5 rounded-full',
            TONE_DOT[tone],
            pulse ? 'sw-pulse' : ''
          )}
        />
      )}
      {children}
    </span>
  );
}

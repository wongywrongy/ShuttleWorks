import type { ReactNode } from 'react';

import { cn } from '../lib/utils';
import { STATUS_TONE, type StatusToneName } from './statusTone';

/**
 * StatusPill — operational match state.
 *
 * Ported from the curated Claude Design library (`components/data/StatusPill`,
 * ADR 0027): a 22px, 4px-radius chip (`rounded-xs`, the "tiny mark"
 * radius) with a tinted ground and text-grade ink, Geist 600 uppercase at
 * 12px tracked +0.06em (raised from 10px — v3 consolidated plan R1, the
 * 12px caption floor). Status is carried by **colour + text only** — the
 * curated design draws no marks inside the chip, and the border is
 * transparent (the 1px keeps the box the same size as `Badge`).
 *
 * Pick a `tone` by MEANING. The legacy colour names are aliases onto the
 * shared tone source (`statusTone.ts`, ADR 0020) so this register and the
 * entrant `StatusChip` draw one palette:
 *   green  → live     (match in progress)
 *   blue   → started  (operator started the clock)
 *   amber  → called   (called to court)
 *   yellow → warning  (soft violation)
 *   red    → blocked  (hard rule conflict)
 *   idle   → idle     (scheduled, not yet active)
 *   done   → done     (finished / archived)
 *
 * There is no dot and no pulse: the owner ruled (ADR 0027) that the
 * dotted, fully-round pill is a telltale of generated UI. Live state on
 * the Display board is carried by the LIVE text itself (MOTION.md §8.3).
 *
 * `tone="routine"` (v3 consolidated plan, package 07, R3) is the escape
 * hatch for an ordinary domain fact — scheduled, completed, active, on —
 * that does not need a tinted container to be noticed. It renders the same
 * label at the same size with no ground and no border, in the plain ink
 * ladder, so a caller can swap between "this needs a container" and "this
 * is just a fact" without touching layout. Reach for it instead of writing
 * a bespoke `<span>` next to a `StatusPill` for the states that DO chip —
 * one component keeps both treatments from drifting apart. Pills/tints stay
 * reserved for exceptions: needs attention, conflict, overdue, error.
 */
export type PillTone = 'green' | 'yellow' | 'red' | 'blue' | 'amber' | 'idle' | 'done' | 'routine';

/** `PillTone` minus the plain-text `routine` escape hatch — the tinted-chip
 *  subset. Exported for callers (e.g. `StatusBar`) that only ever chip. */
export type ChipTone = Exclude<PillTone, 'routine'>;

const TONE_NAME: Record<ChipTone, StatusToneName> = {
  green: 'live',
  yellow: 'warning',
  red: 'blocked',
  blue: 'started',
  amber: 'called',
  idle: 'idle',
  done: 'done',
};

// Ground + ink only (no tone border — the curated chip has none).
const TONE_BG = Object.fromEntries(
  (Object.keys(TONE_NAME) as ChipTone[]).map((t) => {
    const s = STATUS_TONE[TONE_NAME[t]];
    return [t, `${s.bg} ${s.text}`];
  }),
) as Record<ChipTone, string>;

interface Props {
  tone: PillTone;
  className?: string;
  title?: string;
  children: ReactNode;
}

export function StatusPill({
  tone,
  className,
  title,
  children,
}: Props) {
  // `routine` is the R3 plain-text escape hatch — same size and case, no
  // ground, no border: a fact, not a container.
  if (tone === 'routine') {
    return (
      <span
        className={cn(
          'inline-flex items-center whitespace-nowrap text-xs font-semibold uppercase leading-none tracking-[0.06em] text-muted-foreground',
          className
        )}
        title={title}
      >
        {children}
      </span>
    );
  }
  return (
    <span
      className={cn(
        'inline-flex h-badge items-center gap-1.5 whitespace-nowrap rounded-xs border border-transparent px-2 text-xs font-semibold uppercase leading-none tracking-[0.06em]',
        TONE_BG[tone],
        className
      )}
      title={title}
    >
      {children}
    </span>
  );
}

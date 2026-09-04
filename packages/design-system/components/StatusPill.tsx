import type { ReactNode } from 'react';

import { cn } from '../lib/utils';
import { STATUS_TONE, type StatusToneName } from './statusTone';

/**
 * StatusPill — operational match state.
 *
 * Ported from the curated Claude Design library (`components/data/StatusPill`,
 * ADR 0027): a 22px, 4px-radius chip (`rounded-xs`, the "tiny mark"
 * radius) with a tinted ground and text-grade ink, Geist 600 uppercase at
 * 10px tracked +0.06em. Status is carried by **colour + text only** — the
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
 */

export type PillTone = 'green' | 'yellow' | 'red' | 'blue' | 'amber' | 'idle' | 'done';

const TONE_NAME: Record<PillTone, StatusToneName> = {
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
  (Object.keys(TONE_NAME) as PillTone[]).map((t) => {
    const s = STATUS_TONE[TONE_NAME[t]];
    return [t, `${s.bg} ${s.text}`];
  }),
) as Record<PillTone, string>;

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
  return (
    <span
      className={cn(
        'inline-flex h-badge items-center gap-1.5 whitespace-nowrap rounded-xs border border-transparent px-2 text-3xs font-semibold uppercase leading-none tracking-[0.06em]',
        TONE_BG[tone],
        className
      )}
      title={title}
    >
      {children}
    </span>
  );
}

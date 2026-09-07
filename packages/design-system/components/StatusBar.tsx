import { cn } from '../lib/utils';
// StatusBar tallies a fixed count vocabulary (DONE/LIVE/READY/PEND) that
// always chips — `routine`'s plain-text escape hatch (R3) has no meaning in
// a tally strip, so it uses `ChipTone` (PillTone minus `routine`) rather
// than a dead branch.
import type { ChipTone } from './StatusPill';

/**
 * StatusBar — a row of uppercase micro-label status counts.
 *
 * Telemetry strip for surfaces that need an at-a-glance state tally
 * (e.g. the bracket chrome's DONE / LIVE / READY / PEND counters). Each
 * cell is a `StatusCount`: a `--status-*`-coloured micro-label
 * (tracking-[0.06em]) next to an `sw-num` tabular count — the one-family
 * Geist data treatment, not a separate mono face.
 *
 * Pure presentational — the consumer maps its own domain state onto
 * `tone` / `label` / `count`. Tones route through the same `PillTone`
 * ladder as `StatusPill` so the same semantic state reads the same
 * colour everywhere (DESIGN.md §4).
 */

const TONE_TEXT: Record<ChipTone, string> = {
  green:  'text-status-live',
  yellow: 'text-status-warning',
  red:    'text-status-blocked',
  blue:   'text-status-started',
  amber:  'text-status-called',
  idle:   'text-status-idle',
  done:   'text-status-done',
};

/** Tint behind each token. Every pair here is a `-fg` on its own `-bg`, which
 *  is what the contrast gate already checks — no new unchecked combination. */
const TONE_BG: Record<ChipTone, string> = {
  green:  'bg-status-live-bg',
  yellow: 'bg-status-warning-bg',
  red:    'bg-status-blocked-bg',
  blue:   'bg-status-started-bg',
  amber:  'bg-status-called-bg',
  idle:   'bg-status-idle-bg',
  done:   'bg-status-done-bg',
};

export interface StatusCountItem {
  tone: ChipTone;
  label: string;
  count: number;
}

/**
 * One tally token, as a discrete tinted chip.
 *
 * It used to be bare colored text on the page background, so a four-token
 * strip ("DONE 8 LIVE 1 READY 4 PENDING 3") ran together as one dense string
 * and the only thing separating adjacent tokens was their hue — which is no
 * separation at all for the two neutral tones, or for anyone who cannot tell
 * them apart (SP-CONSOLE-2 DRW-1). The tint makes each token an object.
 */
export function StatusCount({ tone, label, count }: StatusCountItem) {
  return (
    <span
      className={cn(
        'inline-flex items-baseline gap-1 rounded-sm px-1.5 py-px',
        TONE_BG[tone]
      )}
    >
      <span
        className={cn(
          'text-xs font-semibold uppercase tracking-[0.06em]',
          TONE_TEXT[tone]
        )}
      >
        {label}
      </span>
      <span className={cn('sw-num text-xs', TONE_TEXT[tone])}>{count}</span>
    </span>
  );
}

interface StatusBarProps {
  items: StatusCountItem[];
  className?: string;
}

export function StatusBar({ items, className }: StatusBarProps) {
  return (
    <div className={cn('flex items-center gap-2', className)}>
      {items.map((item) => (
        <StatusCount key={item.label} {...item} />
      ))}
    </div>
  );
}

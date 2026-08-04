/**
 * Shared timeline encoding — the ONE color language for the meet
 * timelines (Run's GanttChart and Plan's DragGantt), per
 * SPEC_AMENDMENT_timeline_encoding:
 *
 *   - Lifecycle by INTENSITY (the single appearance channel):
 *     scheduled quiet neutral · called subtle warm hint · in progress
 *     the one accent, filled · finished dimmed neutral.
 *   - Exceptions are the only hues, always paired with a glyph/dash:
 *     late/overrun → warning + Warning glyph · blocked → danger +
 *     WarningOctagon glyph · postponed → dashed ghost.
 *   - selected → the neutral canon focus ring (interaction, not data).
 *
 * Extracted from GanttChart in Phase 4 so Plan adopts the identical
 * vocabulary instead of re-implementing it (build-for-both rule).
 */
import { Warning, WarningOctagon } from '@phosphor-icons/react';
import type { MatchStateDTO } from '../../api/dto';

export type Lifecycle = 'scheduled' | 'called' | 'started' | 'finished';

export const LIFECYCLE_STYLES: Record<
  Lifecycle,
  { bg: string; border: string; text: string }
> = {
  scheduled: { bg: 'bg-muted/30', border: 'border-border', text: 'text-foreground' },
  called: { bg: 'bg-status-called-bg/60', border: 'border-status-called/40', text: 'text-foreground' },
  started: {
    bg: 'bg-accent/15 shadow-[inset_0_0_0_1px_hsl(var(--accent)/0.5)]',
    border: 'border-accent/70',
    text: 'text-accent',
  },
  finished: { bg: 'bg-muted/20', border: 'border-border/50', text: 'text-muted-foreground' },
};

export function lifecycleOf(state: MatchStateDTO | undefined): Lifecycle {
  return (state?.status as Lifecycle) || 'scheduled';
}

/** The one exception treatment for a block: border override + glyph.
 *  Priority: blocked (danger) > postponed (ghost) > late (warning). */
export function exceptionFor(opts: {
  isBlocked?: boolean;
  isPostponed?: boolean;
  isLate?: boolean;
  baseBorder: string;
}): {
  border: string;
  extra: string;
  Glyph: typeof Warning | null;
  glyphTone: string;
} {
  if (opts.isBlocked) {
    return {
      border: 'border-status-blocked',
      extra: '',
      Glyph: WarningOctagon,
      glyphTone: 'text-status-blocked',
    };
  }
  if (opts.isPostponed) {
    return { border: 'border-dashed border-status-idle', extra: 'opacity-70', Glyph: null, glyphTone: '' };
  }
  if (opts.isLate) {
    return {
      border: 'border-status-warning',
      extra: '',
      Glyph: Warning,
      glyphTone: 'text-status-warning',
    };
  }
  return { border: opts.baseBorder, extra: '', Glyph: null, glyphTone: '' };
}

/** Neutral canon focus ring — selection is interaction, not data. */
export const SELECTION_RING = 'ring-2 ring-inset ring-ring';

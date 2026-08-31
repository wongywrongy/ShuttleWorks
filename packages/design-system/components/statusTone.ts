/**
 * statusTone — the ONE tone→class source for status badges (ADR 0020).
 *
 * Two registers consume it and must not drift:
 *   - `StatusPill` (operator register: uppercase micro-label, rounded-sm)
 *   - `apps/entrant/app/components/StatusChip.tsx` (public register:
 *     sentence case, rounded-full)
 *
 * The map is PER-PART (`bg` / `text` / `border` / `dot`) rather than one
 * composed string because the two consumers compose the same classes in
 * different orders, and each rendered string is pinned byte-for-byte by
 * that tier's tests. Compose at the call site; do not reorder there.
 *
 * Plain data, no React — safe for the SSR-only entrant tier. This file
 * must stay under `components/` (not `lib/`): both apps' Tailwind content
 * globs scan only `packages/design-system/components/**`, so class
 * literals defined elsewhere would silently emit nothing.
 */

export type StatusToneName =
  | 'live'
  | 'started'
  | 'called'
  | 'warning'
  | 'blocked'
  | 'idle'
  | 'done';

export interface StatusToneParts {
  /** Tinted ground, e.g. `bg-status-live-bg`. */
  bg: string;
  /** Foreground ink, e.g. `text-status-live`. */
  text: string;
  /** 40%-alpha border color, e.g. `border-status-live/40` (the `border`
   *  width utility itself is composed by the consumer). */
  border: string;
  /** Solid swatch-dot fill, e.g. `bg-status-live`. */
  dot: string;
}

export const STATUS_TONE: Record<StatusToneName, StatusToneParts> = {
  live: {
    bg: 'bg-status-live-bg',
    text: 'text-status-live',
    border: 'border-status-live/40',
    dot: 'bg-status-live',
  },
  started: {
    bg: 'bg-status-started-bg',
    text: 'text-status-started',
    border: 'border-status-started/40',
    dot: 'bg-status-started',
  },
  called: {
    bg: 'bg-status-called-bg',
    text: 'text-status-called',
    border: 'border-status-called/40',
    dot: 'bg-status-called',
  },
  warning: {
    bg: 'bg-status-warning-bg',
    text: 'text-status-warning',
    border: 'border-status-warning/40',
    dot: 'bg-status-warning',
  },
  blocked: {
    bg: 'bg-status-blocked-bg',
    text: 'text-status-blocked',
    border: 'border-status-blocked/40',
    dot: 'bg-status-blocked',
  },
  idle: {
    bg: 'bg-status-idle-bg',
    text: 'text-status-idle',
    border: 'border-status-idle/40',
    dot: 'bg-status-idle',
  },
  done: {
    bg: 'bg-status-done-bg',
    text: 'text-status-done',
    border: 'border-status-done/40',
    dot: 'bg-status-done',
  },
};

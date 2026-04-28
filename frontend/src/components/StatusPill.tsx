/**
 * Shared status pill — collapses ~5 hand-rolled badge JSX blocks
 * across MatchDetailsPanel, WorkflowPanel rows, and the public TV.
 *
 * Pick a ``tone`` (semantic colour) and optionally show a ``dot`` and
 * ``pulse``ing animation. Body text is the children.
 */
import type { ReactNode } from 'react';

export type PillTone = 'green' | 'yellow' | 'red' | 'blue' | 'amber';

const TONE_BG: Record<PillTone, string> = {
  green:  'bg-green-50 text-green-700 dark:bg-green-500/15 dark:text-green-300',
  yellow: 'bg-yellow-50 text-yellow-700 dark:bg-yellow-500/15 dark:text-yellow-200',
  red:    'bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-200',
  blue:   'bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300',
  amber:  'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-200',
};

const TONE_DOT: Record<PillTone, string> = {
  green:  'bg-green-500',
  yellow: 'bg-yellow-500',
  red:    'bg-red-500',
  blue:   'bg-blue-500',
  amber:  'bg-amber-500',
};

interface Props {
  tone: PillTone;
  dot?: boolean;
  pulse?: boolean;
  className?: string;
  title?: string;
  children: ReactNode;
}

export function StatusPill({ tone, dot, pulse, className = '', title, children }: Props) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium ${TONE_BG[tone]} ${className}`}
      title={title}
    >
      {dot && <span className={`h-1 w-1 rounded-full ${TONE_DOT[tone]} ${pulse ? 'animate-pulse' : ''}`} />}
      {children}
    </span>
  );
}

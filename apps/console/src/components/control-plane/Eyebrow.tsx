import type { ReactNode } from 'react';
import { EYEBROW_CLASS } from '../../lib/utils';

/**
 * Eyebrow — the micro-label overline: `EYEBROW_CLASS` plus a tone.
 *
 * A plain UPPERCASE micro-label in Geist (one family; tracking does the work).
 * (The old brutalist `[ … ]` ASCII framing, and the no-op `framed` prop that
 * survived it, are both gone.)
 *
 * The treatment lives in `EYEBROW_CLASS` rather than here because most uses
 * can't be a `<span>`: table group rows, `<h3>` panel headings, and
 * state-coloured pills all need the same type step with different elements or
 * colours. Use this component when a span and a tone are enough.
 */
export function Eyebrow({
  children,
  tone = 'muted',
  className = '',
}: {
  children: ReactNode;
  tone?: 'muted' | 'accent' | 'destructive';
  className?: string;
}) {
  const toneClass =
    tone === 'accent'
      ? 'text-accent'
      : tone === 'destructive'
        ? 'text-destructive'
        : 'text-muted-foreground';
  // Uppercase the *text content* (not just via CSS) so the DOM matches the
  // visual and text queries resolve the plain label.
  const content = typeof children === 'string' ? children.toUpperCase() : children;
  return (
    <span
      className={`${EYEBROW_CLASS} ${toneClass} ${className}`}
    >
      {content}
    </span>
  );
}

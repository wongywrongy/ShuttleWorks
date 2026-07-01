import type { ReactNode } from 'react';

/**
 * Eyebrow — the design-system section overline.
 *
 * "Warmed-B blue-glow" language: a plain UPPERCASE micro-label in Geist (one
 * family; tabular tracking does the work). The old brutalist `[ … ]` ASCII
 * framing is retired — the `framed` prop is kept for API compatibility but is
 * now a no-op (renders the same plain label), so existing call-sites don't break.
 */
export function Eyebrow({
  children,
  tone = 'muted',
  className = '',
}: {
  children: ReactNode;
  /** @deprecated `[ … ]` framing was retired; this prop is now a no-op. */
  framed?: boolean;
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
      className={`text-2xs font-semibold uppercase tracking-[0.08em] ${toneClass} ${className}`}
    >
      {content}
    </span>
  );
}

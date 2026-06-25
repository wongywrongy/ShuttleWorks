import type { ReactNode } from 'react';

/**
 * Eyebrow — the design-system section overline.
 *
 * The brand grammar uses an UPPERCASE *mono* overline (not a sans small-caps
 * label, which reads as generic SaaS). Mirrors `globals.css .eyebrow` and the
 * Design-project `Eyebrow` component. `framed` wraps the label in the brand's
 * `[ … ]` ASCII syntax — reserve it for section headers, keep dense inline
 * labels unframed.
 */
export function Eyebrow({
  children,
  framed = false,
  tone = 'muted',
  className = '',
}: {
  children: ReactNode;
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
  // visual — mirrors the design-system Eyebrow and keeps framed labels a
  // single text node ("[ MODULES ]") for the DOM and text queries.
  const isString = typeof children === 'string';
  const text = isString ? children.toUpperCase() : children;
  const content = framed
    ? isString
      ? `[ ${text as string} ]`
      : (
          <>
            {'[ '}
            {children}
            {' ]'}
          </>
        )
    : text;
  return (
    <span
      className={`font-mono text-2xs font-semibold uppercase tracking-[0.08em] ${toneClass} ${className}`}
    >
      {content}
    </span>
  );
}

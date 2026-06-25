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
  // Keep framed string labels as a single text node so they read as one
  // token ("[ MODULES ]") to the DOM and to text queries.
  const content =
    framed && typeof children === 'string'
      ? `[ ${children} ]`
      : framed
        ? (
            <>
              {'[ '}
              {children}
              {' ]'}
            </>
          )
        : children;
  return (
    <span
      className={`font-mono text-2xs font-semibold uppercase tracking-[0.08em] ${toneClass} ${className}`}
    >
      {content}
    </span>
  );
}

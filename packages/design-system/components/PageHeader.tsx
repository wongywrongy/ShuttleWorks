import type { ReactNode } from 'react';

import { cn } from '../lib/utils';

/**
 * PageHeader — display-tier lockup for top-level operator pages.
 *
 * Three slots:
 *   • eyebrow  — uppercase micro-tag identifying the section
 *   • title    — the page heading (rendered as `<h1>`, must be unique
 *               per page)
 *   • description — optional one-sentence positioning copy
 *
 * Right-side `actions` slot is for inline page-level CTAs so the
 * page-header lockup stays the visual anchor regardless of how many
 * buttons live alongside it.
 *
 * BRAND.md §2 — the eyebrow uses mono uppercase with the brutalist
 * `tracking-[0.2em]` — kept in scheduler's existing visual style for
 * compat. Phase 6 may swap the eyebrow into the `.eyebrow` utility
 * class from globals.css.
 */

interface PageHeaderProps {
  eyebrow: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <header
      className={cn(
        'mb-4 flex flex-wrap items-end justify-between gap-3',
        className
      )}
    >
      <div className="min-w-0">
        <div className="text-2xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          {eyebrow}
        </div>
        <h1 className="mt-0.5 text-xl font-semibold leading-tight tracking-tight text-foreground">
          {title}
        </h1>
        {description ? (
          <p className="mt-1 max-w-[65ch] text-sm text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex flex-shrink-0 items-center gap-2">{actions}</div>
      ) : null}
    </header>
  );
}

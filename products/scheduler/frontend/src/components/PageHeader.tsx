/**
 * PageHeader — display-tier lockup for top-level operator pages.
 *
 * Three slots:
 *   • eyebrow  (mandatory) — uppercase micro-tag identifying the section
 *                          ("Schedule", "Roster", "Live ops") in
 *                          `text-2xs / tracking-[0.2em]` so the eye lands
 *                          on it before the title.
 *   • title    (mandatory) — the actual page heading, in `text-xl` semibold
 *                          tight tracking. Carried by weight + tracking,
 *                          not raw scale, per the loaded product taste rules.
 *   • description (optional) — one short sentence positioning the page.
 *
 * Right-side ``actions`` slot is for inline page-level CTAs (Generate,
 * Export, Configure) so the page-header lockup stays the visual anchor
 * regardless of how many buttons live next to it.
 *
 * The title is rendered as <h1> exactly once per page; <main> already
 * carries the landmark, so this is the document outline anchor.
 */
import type { ReactNode } from 'react';

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
  className = '',
}: PageHeaderProps) {
  return (
    <header
      className={`mb-4 flex flex-wrap items-end justify-between gap-3 ${className}`}
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

/**
 * The frame's one breadcrumb trail (contract §11.1).
 *
 * Rendered by the frame, above the hero, once — never by a route. Ancestor
 * segments are native links; the current segment is plain text carrying
 * `aria-current="page"` rather than a link back to the page the reader is
 * already on. It replaces the per-page floating `← Tournament` /
 * `← Tournament · Draws` controls, which said where you could go without
 * ever saying where you were.
 *
 * Below two segments it renders nothing: a single "Tournaments" crumb is a
 * breadcrumb with no trail, which is the placeholder shape rule 4 bans
 * elsewhere on this tier.
 *
 * The separator is `aria-hidden` and lives outside the link text, so a
 * screen reader hears the list, not a run of chevrons.
 */
import type { Crumb } from '../lib/tournamentFrame';

export function Breadcrumbs({ crumbs }: { crumbs: readonly Crumb[] }) {
  if (crumbs.length < 2) return null;
  return (
    <nav aria-label="Breadcrumb" className="min-w-0">
      <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-muted-foreground">
        {crumbs.map((crumb, index) => (
          <li key={`${crumb.label}-${index}`} className="flex min-w-0 items-center gap-1.5">
            {index > 0 ? (
              <span aria-hidden className="text-muted-foreground">
                ›
              </span>
            ) : null}
            {crumb.href === null ? (
              <span aria-current="page" className="break-words font-medium text-foreground">
                {crumb.label}
              </span>
            ) : (
              <a
                href={crumb.href}
                className="break-words underline-offset-4 hover:text-foreground hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                {crumb.label}
              </a>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

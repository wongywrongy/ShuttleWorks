/**
 * The discovery filters — server-filtered, zero client JS (Z1).
 *
 * The status and date-preset facets are LINKS, not radios (SP-CONSOLE-REFINE
 * P1.1): each carries the whole current query with that one facet swapped, so
 * choosing a facet applies instantly as a plain GET navigation — the same
 * `?tab=` idiom the tournament page uses, and the only instant-apply this
 * tier's zero-JS floor permits (a radio auto-submit needs script). The free
 * date-range inputs keep the GET form and its explicit Apply; the chosen
 * facets and the header search's `q` ride along as hidden fields so applying
 * a range keeps them.
 *
 * Refinement 4 (Phase B sign-off): **always visible at every width.** The
 * Phase B mockup put this behind a native checkbox-disclosure on phones —
 * it worked, but announced as "Filters, checkbox", the weakest thing on an
 * otherwise clean page. At phone widths it is now a compact strip (the two
 * facet groups side by side on a sunken panel); from `md:` up it is the
 * rail. No toggle, no trick, nothing hidden.
 */
import { Button } from '@scheduler/design-system/components';

import { anyFilterActive, type Filters } from '../lib/phase';

const ACTION = '/e/#results';

/** The current filters with one facet swapped, as the shareable URL the GET
 *  form would produce (same query vocabulary, empty values dropped). */
function facetHref(
  filters: Filters,
  patch: Partial<Pick<Filters, 'status' | 'preset'>>,
): string {
  const next = { ...filters, ...patch };
  const params = new URLSearchParams();
  if (next.q.trim() !== '') params.set('q', next.q);
  if (next.status !== null) params.set('status', next.status);
  if (next.preset !== null) params.set('preset', next.preset);
  if (next.from !== null && next.from !== '') params.set('from', next.from);
  if (next.to !== null && next.to !== '') params.set('to', next.to);
  const query = params.toString();
  return query === '' ? ACTION : `/e/?${query}#results`;
}

function FacetLink({
  href,
  label,
  selected,
}: {
  href: string;
  label: string;
  selected: boolean;
}) {
  return (
    // 2026-08-11 design audit, finding #6 carried over from the radio rows:
    // `py-1.5` keeps each row well clear of the WCAG 2.2 AA 24px target-size
    // floor for a mobile-heavy audience.
    <a
      href={href}
      aria-current={selected ? 'true' : undefined}
      className={`rounded px-1 py-1.5 text-sm underline-offset-4 ${
        selected ? 'font-semibold text-accent' : 'text-foreground hover:underline'
      }`}
    >
      {label}
    </a>
  );
}

export function FilterStrip({ filters }: { filters: Filters }) {
  return (
    <div className="grid gap-4 rounded-lg border border-rule-soft bg-surface-sunken p-4 md:gap-5 md:rounded-none md:border-0 md:bg-transparent md:p-0">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-1 md:gap-5">
        <nav aria-label="Status" className="grid content-start gap-1.5">
          <div className="mb-1.5 text-sm font-semibold text-foreground">Status</div>
          <FacetLink
            href={facetHref(filters, { status: null })}
            label="All tournaments"
            selected={filters.status === null}
          />
          <FacetLink
            href={facetHref(filters, { status: 'open' })}
            label="Entries open"
            selected={filters.status === 'open'}
          />
          <FacetLink
            href={facetHref(filters, { status: 'upcoming' })}
            label="Upcoming"
            selected={filters.status === 'upcoming'}
          />
          <FacetLink
            href={facetHref(filters, { status: 'past' })}
            label="Past"
            selected={filters.status === 'past'}
          />
        </nav>

        <nav aria-label="Dates" className="grid content-start gap-1.5">
          <div className="mb-1.5 text-sm font-semibold text-foreground">Dates</div>
          <FacetLink
            href={facetHref(filters, { preset: null })}
            label="Any time"
            selected={filters.preset === null}
          />
          <FacetLink
            href={facetHref(filters, { preset: '7d' })}
            label="Next 7 days"
            selected={filters.preset === '7d'}
          />
          <FacetLink
            href={facetHref(filters, { preset: '30d' })}
            label="Next month"
            selected={filters.preset === '30d'}
          />
          <FacetLink
            href={facetHref(filters, { preset: '90d' })}
            label="Next 3 months"
            selected={filters.preset === '90d'}
          />
        </nav>
      </div>

      <form method="get" action={ACTION} className="grid gap-2">
        {/* Everything already chosen rides along, so applying a range keeps
            the facets and the header search's text — two GET surfaces, one
            query-string vocabulary. */}
        {filters.q.trim() === '' ? null : <input type="hidden" name="q" value={filters.q} />}
        {filters.status === null ? null : (
          <input type="hidden" name="status" value={filters.status} />
        )}
        {filters.preset === null ? null : (
          <input type="hidden" name="preset" value={filters.preset} />
        )}

        <label className="grid gap-1 text-xs font-medium text-muted-foreground">
          From
          <input
            type="date"
            name="from"
            defaultValue={filters.from ?? ''}
            className="h-9 min-w-0 rounded border border-rule-control bg-bg-elev px-2 text-sm text-foreground"
          />
        </label>
        <label className="grid gap-1 text-xs font-medium text-muted-foreground">
          To
          <input
            type="date"
            name="to"
            defaultValue={filters.to ?? ''}
            className="h-9 min-w-0 rounded border border-rule-control bg-bg-elev px-2 text-sm text-foreground"
          />
        </label>

        <div className="mt-1 flex items-center gap-3">
          <Button type="submit" size="sm">
            Apply dates
          </Button>
          {anyFilterActive(filters) ? (
            <a href="/e/" className="text-sm text-accent underline-offset-4 hover:underline">
              Clear
            </a>
          ) : null}
        </div>
      </form>
    </div>
  );
}

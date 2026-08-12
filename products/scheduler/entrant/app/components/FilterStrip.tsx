/**
 * The discovery filters — one GET form, filtered server-side and echoed back
 * as checked state (Z1). `Clear` is a plain link to the bare route; `Apply`
 * is an explicit submit; the header search's `q` rides along as a hidden
 * field so applying a facet keeps the typed search.
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

function Radio({
  name,
  value,
  label,
  checked,
}: {
  name: string;
  value: string;
  label: string;
  checked: boolean;
}) {
  return (
    // 2026-08-11 design audit, finding #6: `py-0.5` (2px) put this row at
    // exactly the WCAG 2.2 AA 24px target-size floor with zero margin.
    // `py-1.5` clears it with real room (~32px) for a mobile-heavy audience.
    <label className="flex cursor-pointer items-center gap-2 rounded px-1 py-1.5 text-sm text-foreground">
      <input type="radio" name={name} value={value} defaultChecked={checked} />
      {label}
    </label>
  );
}

export function FilterStrip({ filters }: { filters: Filters }) {
  return (
    <form
      method="get"
      action={ACTION}
      className="grid gap-4 rounded-lg border border-rule-soft bg-surface-sunken p-4 md:gap-5 md:rounded-none md:border-0 md:bg-transparent md:p-0"
    >
      {/* Keep the header search's text when a facet is applied — two GET
          forms, one query-string vocabulary. */}
      {filters.q.trim() === '' ? null : <input type="hidden" name="q" value={filters.q} />}

      <div className="grid grid-cols-2 gap-4 md:grid-cols-1 md:gap-5">
        <fieldset className="grid content-start gap-1.5">
          <legend className="mb-1.5 text-sm font-semibold text-foreground">Status</legend>
          <Radio name="status" value="" label="All tournaments" checked={filters.status === null} />
          <Radio name="status" value="open" label="Entries open" checked={filters.status === 'open'} />
          <Radio name="status" value="upcoming" label="Upcoming" checked={filters.status === 'upcoming'} />
          <Radio name="status" value="past" label="Past" checked={filters.status === 'past'} />
        </fieldset>

        <fieldset className="grid content-start gap-1.5">
          <legend className="mb-1.5 text-sm font-semibold text-foreground">Dates</legend>
          <Radio name="preset" value="" label="Any time" checked={filters.preset === null} />
          <Radio name="preset" value="7d" label="Next 7 days" checked={filters.preset === '7d'} />
          <Radio name="preset" value="30d" label="Next month" checked={filters.preset === '30d'} />
          <Radio name="preset" value="90d" label="Next 3 months" checked={filters.preset === '90d'} />
          <div className="mt-2 grid gap-2">
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
          </div>
        </fieldset>
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" size="sm">
          Apply filters
        </Button>
        {anyFilterActive(filters) ? (
          <a href="/e/" className="text-sm text-accent underline-offset-4 hover:underline">
            Clear
          </a>
        ) : null}
      </div>
    </form>
  );
}

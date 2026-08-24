/**
 * §2.3: the one control row above the calendar — search, the three view
 * segments, the date-filter panel, and the chips that say what is active.
 *
 * Zero client JS, four native mechanisms (Z1): search and the date range are
 * GET forms; each segment is a LINK carrying the whole current query with the
 * view swapped (the retired `FilterStrip`'s facet idiom, reimplemented here
 * because it dies with that file); the filter panel is a `<details>`, styled
 * as an anchored popover from `sm:` up and as a bottom sheet below it, in CSS
 * alone; each chip is a link to the same URL minus one parameter.
 *
 * **The chips row exists only when a DATE filter is set** (§7 trap 4). A
 * default page has nothing to dismiss, and a row of "all dates"-style chips
 * describing a state the entrant never chose is chrome pretending to be
 * feedback. The search text is deliberately not a chip: it is visible in the
 * box it was typed into.
 *
 * The segment COUNTS are the server's, unfiltered: the labels answer "what is
 * on this platform", not "what survived my current query", so they do not
 * move as the entrant types.
 */
import { Button } from '@scheduler/design-system/components';

import { dateFilterActive, type DatePreset, type Filters, type View } from '../lib/phase';

const ACTION = '/e/#calendar';

/**
 * Every preset a URL can carry, labelled. `30d` has no radio in the panel —
 * the design offers three choices — but the retired sidebar's links are in
 * mailing lists and posters, so a `?preset=30d` URL still filters and still
 * gets named honestly rather than rendering an unlabelled chip (D6-adjacent).
 */
const PRESET_LABELS: Readonly<Record<DatePreset, string>> = Object.freeze({
  '7d': 'Next 7 days',
  '30d': 'Next 30 days',
  '90d': 'Next 3 months',
});

/** The panel's three choices, in order; `''` is "no date filter at all". */
const PRESET_CHOICES: readonly { value: '' | DatePreset; label: string }[] = Object.freeze([
  { value: '', label: 'This season' },
  { value: '7d', label: PRESET_LABELS['7d'] },
  { value: '90d', label: PRESET_LABELS['90d'] },
]);

const SEGMENTS: readonly View[] = Object.freeze(['season', 'open', 'completed']);

/**
 * The current query with some fields swapped, as the URL the GET forms would
 * produce: empty values dropped, and `view=season` dropped because it is what
 * `parseFilters` answers for a URL that names no view.
 */
function queryHref(filters: Filters, patch: Partial<Filters>): string {
  const next = { ...filters, ...patch };
  const params = new URLSearchParams();
  if (next.q.trim() !== '') params.set('q', next.q);
  if (next.view !== 'season') params.set('view', next.view);
  if (next.preset !== null) params.set('preset', next.preset);
  if (next.from !== null && next.from !== '') params.set('from', next.from);
  if (next.to !== null && next.to !== '') params.set('to', next.to);
  const query = params.toString();
  return query === '' ? ACTION : `/e/?${query}#calendar`;
}

const NO_DATES: Partial<Filters> = Object.freeze({ preset: null, from: null, to: null });

/** The fields a form must carry so submitting it does not silently clear the
 * state the entrant set somewhere else in this row. */
function Hidden({ name, value }: { name: string; value: string | null }) {
  return value === null || value === '' ? null : (
    <input type="hidden" name={name} value={value} />
  );
}

/** One dismissible chip: the label, and an `×` link to this query minus it. */
function FilterChip({ label, href }: { label: string; href: string }) {
  return (
    <a
      href={href}
      className="inline-flex items-center gap-1.5 rounded-full border border-rule-control bg-surface-raised px-2.5 py-1 text-xs text-foreground hover:border-rule-control hover:bg-surface-sunken"
    >
      {label}
      <span aria-hidden className="text-muted-foreground">
        ×
      </span>
      <span className="sr-only">(remove)</span>
    </a>
  );
}

export function SeasonControls({
  filters,
  counts,
}: {
  filters: Filters;
  counts: { takingEntries: number; completed: number };
}) {
  const labels: Readonly<Record<View, string>> = {
    season: 'Season',
    open: `Taking entries · ${counts.takingEntries}`,
    completed: `Completed · ${counts.completed}`,
  };
  const activeDates = [filters.preset, filters.from, filters.to].filter(
    (value) => value !== null && value !== '',
  ).length;

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-3">
        {/* Search: a GET form landing on the calendar, carrying the dates and
            the view so searching does not reset the rest of the row. */}
        <form method="get" action={ACTION} className="flex min-w-0 flex-1 items-center gap-2">
          <Hidden name="view" value={filters.view === 'season' ? null : filters.view} />
          <Hidden name="preset" value={filters.preset} />
          <Hidden name="from" value={filters.from} />
          <Hidden name="to" value={filters.to} />
          <input
            type="search"
            name="q"
            defaultValue={filters.q}
            placeholder="Search tournaments"
            aria-label="Search tournaments, organizers or venues"
            className="h-9 w-full min-w-0 max-w-sm rounded border border-rule-control bg-bg-elev px-3 text-sm text-foreground placeholder:text-muted-foreground"
          />
          <Button type="submit" size="sm">
            Search
          </Button>
        </form>

        {/* The panel is last in the row and `ml-auto` on it would fight the
            wrap at 380px, so the segments and the panel simply flow. */}
        <details className="relative">
          <summary className="inline-flex h-9 cursor-pointer list-none items-center rounded border border-rule-control px-3 text-sm text-foreground hover:bg-surface-sunken [&::-webkit-details-marker]:hidden">
            {activeDates === 0 ? 'Filters' : `Filters · ${activeDates}`}
          </summary>
          {/* Anchored popover from `sm:` up, bottom sheet below it — the
              same markup, two layouts, no script (D3). */}
          <div className="absolute right-0 z-20 mt-2 w-72 rounded-lg border border-rule-soft bg-surface-raised p-4 shadow-md max-sm:fixed max-sm:inset-x-0 max-sm:bottom-0 max-sm:mt-0 max-sm:w-full max-sm:rounded-b-none">
            <form method="get" action={ACTION} className="grid gap-3">
              <Hidden name="q" value={filters.q.trim() === '' ? null : filters.q} />
              <Hidden name="view" value={filters.view === 'season' ? null : filters.view} />

              <fieldset className="grid gap-1.5">
                <legend className="mb-1 text-xs font-semibold text-muted-foreground">
                  When
                </legend>
                {PRESET_CHOICES.map((choice) => (
                  <label key={choice.value} className="flex items-center gap-2 py-1 text-sm">
                    <input
                      type="radio"
                      name="preset"
                      value={choice.value}
                      defaultChecked={(filters.preset ?? '') === choice.value}
                    />
                    {choice.label}
                  </label>
                ))}
              </fieldset>

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
                <a
                  href={queryHref(filters, NO_DATES)}
                  className="text-sm text-accent underline-offset-4 hover:underline"
                >
                  Reset
                </a>
              </div>
            </form>
          </div>
        </details>
      </div>

      {/* The segments: navigation, not a filter — which is why they carry no
          "clear" and why the counts beside them never move. */}
      <nav aria-label="Calendar view" className="inline-flex gap-0.5 self-start rounded-lg bg-surface-sunken p-0.5">
        {SEGMENTS.map((view) => (
          <a
            key={view}
            href={queryHref(filters, { view })}
            aria-current={view === filters.view ? 'true' : undefined}
            className={`rounded-md px-3 py-1.5 text-sm ${
              view === filters.view
                ? 'bg-surface-raised font-semibold text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {labels[view]}
          </a>
        ))}
      </nav>

      {dateFilterActive(filters) ? (
        <div data-chip-row="" className="flex flex-wrap items-center gap-2">
          {filters.preset === null ? null : (
            <FilterChip
              label={PRESET_LABELS[filters.preset]}
              href={queryHref(filters, { preset: null })}
            />
          )}
          {filters.from === null ? null : (
            <FilterChip label={`From ${filters.from}`} href={queryHref(filters, { from: null })} />
          )}
          {filters.to === null ? null : (
            <FilterChip label={`To ${filters.to}`} href={queryHref(filters, { to: null })} />
          )}
          <a
            href={queryHref(filters, NO_DATES)}
            className="text-sm text-accent underline-offset-4 hover:underline"
          >
            Clear all
          </a>
        </div>
      ) : null}
    </div>
  );
}

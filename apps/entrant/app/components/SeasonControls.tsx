/**
 * P5: the control rows above the calendar — a season selector and a search
 * box, and (since the 2026-09-12 public refinement) the lifecycle slice:
 * All · Upcoming · Live · Past, with the count each one holds.
 *
 * The slice is a FILTER over the one continuous season, not a return of the
 * page shapes P5 retired: the month grouping, the ordering and the "Earlier
 * this season" half are unchanged under every value, and `?show=` selects
 * which of them render. A reader who wants only what is still to come, or
 * only results, gets that without a second page.
 *
 * No framework hydration, two native mechanisms (Z1): each season and each
 * slice is a LINK carrying the rest of the query, and the search is a
 * single-field GET form carrying the current season and slice. There is no
 * submit button and no popover: Enter (or the keyboard's search key)
 * submits, and an `sr-only` submit keeps it reachable by assistive tech.
 *
 * `role="search"` since SP-P8 §4: the header shed its search, and a tier with
 * no search landmark anywhere is an a11y regression, so the landmark lives
 * here with the box — exactly one per page.
 */
import { filtersToParams, type Filters, type ShowFilter } from '../lib/phase';
import { SearchField } from './SearchField';
import { SegmentedNav } from './SegmentedNav';

const ACTION = '/e/#calendar';

/**
 * How many seasons the selector offers before it stops being a selector. A
 * public list can accumulate a decade of them; the recent ones are what a
 * reader picks, and "All seasons" reaches the rest.
 */
const MAX_SEASONS = 6;

const SHOW_LABELS: Readonly<Record<ShowFilter, string>> = Object.freeze({
  all: 'All',
  upcoming: 'Upcoming',
  live: 'Live',
  past: 'Past',
});

/** The current query with some fields swapped, as the URL the search form
 * would produce: empty values dropped, so a default page's links carry no
 * query at all. Every control resets the page: a filter change is a new
 * listing, and page 3 of the old one names nothing in it. */
function queryHref(filters: Filters, patch: Partial<Filters>): string {
  const query = filtersToParams({ ...filters, ...patch, page: 1 }).toString();
  return query === '' ? ACTION : `/e/?${query}#calendar`;
}

/** The fields the search form must carry so submitting it does not silently
 * drop the season or the slice the reader chose. */
function Hidden({ name, value }: { name: string; value: string | null }) {
  return value === null || value === '' ? null : (
    <input type="hidden" name={name} value={value} />
  );
}

export function SeasonControls({
  filters,
  season,
  years,
  counts,
  listedLine,
}: {
  filters: Filters;
  /** The season actually on screen — `null` when every season is listed. */
  season: number | null;
  /** Every season the published list contains, most recent first. */
  years: readonly number[];
  /** How many rows each slice holds for the season and search on screen.
   *  Absent → no slice control (a caller with no listing to slice). */
  counts?: Record<ShowFilter, number>;
  /** The one-line count for the listing on screen; absent renders none. */
  listedLine?: string | null;
}) {
  const show: ShowFilter = filters.show ?? 'all';
  // The resolved season leads the list even when it is older than the six
  // most recent: a shared `?year=2019` URL must show its own season selected,
  // not an unselected row of newer ones.
  const offered = [
    ...(season !== null && !years.slice(0, MAX_SEASONS).includes(season) ? [season] : []),
    ...years.slice(0, MAX_SEASONS),
  ];
  // A slice with nothing in it is not offered as a link to an empty page —
  // except the one on screen, which stays so the reader can see why the
  // list is empty. "All" is always offered.
  const slices = counts
    ? (['all', 'upcoming', 'live', 'past'] as const).filter(
        (slice) => slice === 'all' || counts[slice] > 0 || show === slice,
      )
    : [];

  return (
    // v3-consolidated work package 26b: `min-w-0` added. This is a CSS Grid
    // item with no explicit `grid-template-columns`, so its implicit track
    // sizes to `auto` — which, like a flex item, defaults to `min-width: auto`
    // (its content's min-content size) rather than shrinking to fit the
    // parent. `min-w-0` is the standard fix for an implicit grid/flex track
    // refusing to shrink below its content.
    <div className="grid min-w-0 gap-2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* The seasons: navigation, not a filter — which is why they carry no
            "clear". "All seasons" is the escape hatch for anything older than
            the offered ones, and for a reader who wants the whole list. */}
        <SegmentedNav
          label="Season"
          currentAttr="true"
          segments={[
            ...offered.map((year) => ({
              label: String(year),
              href: queryHref(filters, { year }),
              current: season === year,
            })),
            {
              label: 'All seasons',
              href: queryHref(filters, { year: 'all' }),
              current: season === null,
            },
          ]}
        />

        {/* v3-consolidated work package 26b: `basis-full` below `sm:`. With
            `flex-1`'s implicit `flex-basis: 0%` the wrap algorithm has nothing
            to measure, so this box is placed on the SAME line as the `nav`
            beside it regardless of room and only then shrinks. `basis-full`
            gives it a 100%-of-line hypothetical size, which drops it onto its
            own line where it has the full content width. `sm:basis-80` keeps
            the narrower, `sm:max-w-md`-capped box once there is room for it
            beside the seasons on one line. */}
        <form
          role="search"
          method="get"
          action={ACTION}
          className="flex min-w-0 max-w-full flex-1 basis-full items-stretch sm:max-w-md sm:basis-80"
        >
          {/* The RESOLVED season, not the raw query field: searching from a
              default visit must stay in the season the reader is looking at
              rather than silently widening to every season ever published.
              Widening is the "All seasons" link's job, and it keeps the
              search text when it does it. */}
          <Hidden name="year" value={season === null ? 'all' : String(season)} />
          <Hidden name="show" value={show === 'all' ? null : show} />
          <SearchField
            id="season-search"
            name="q"
            label="Search tournaments, organizers or venues"
            placeholder="Search tournaments"
            defaultValue={filters.q}
            className="w-full"
          />
        </form>
      </div>
      {slices.length > 0 || listedLine ? (
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
          {slices.length > 0 && counts ? (
            <SegmentedNav
              label="Show"
              currentAttr="true"
              segments={slices.map((slice) => ({
                label: SHOW_LABELS[slice],
                href: queryHref(filters, { show: slice }),
                current: show === slice,
                count: counts[slice],
              }))}
            />
          ) : null}
          {listedLine ? (
            <p className="text-sm tabular-nums text-muted-foreground">{listedLine}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/**
 * P5: the one control row above the calendar — a season selector and a search
 * box, and nothing else.
 *
 * The lifecycle segments ("Live & upcoming" / "Entries open · N" /
 * "Completed · N") and the date-facet popover are gone with the page shape
 * that needed them: one continuous season list has no lifecycle to switch
 * between, and the counts those segments carried were a count of a state the
 * reader no longer chooses. What remains is the two questions a season
 * calendar actually raises — WHICH season, and WHERE is the one I am looking
 * for — and both stay in the URL, so a season or a search is shareable.
 *
 * No framework hydration, two native mechanisms (Z1): each season is a LINK
 * carrying the current search, and the search is a single-field GET form
 * carrying the current season. There is no submit button and no popover:
 * Enter (or the keyboard's search key) submits, and an `sr-only` submit keeps
 * it reachable by assistive tech.
 *
 * `role="search"` since SP-P8 §4: the header shed its search, and a tier with
 * no search landmark anywhere is an a11y regression, so the landmark lives
 * here with the box — exactly one per page.
 */
import { filtersToParams, type Filters } from '../lib/phase';
import { SearchField } from './SearchField';
import { SegmentedNav } from './SegmentedNav';

const ACTION = '/e/#calendar';

/**
 * How many seasons the selector offers before it stops being a selector. A
 * public list can accumulate a decade of them; the recent ones are what a
 * reader picks, and "All seasons" reaches the rest.
 */
const MAX_SEASONS = 6;

/** The current query with some fields swapped, as the URL the search form
 * would produce: empty values dropped, so a default page's links carry no
 * query at all. */
function queryHref(filters: Filters, patch: Partial<Filters>): string {
  const query = filtersToParams({ ...filters, ...patch }).toString();
  return query === '' ? ACTION : `/e/?${query}#calendar`;
}

/** The fields the search form must carry so submitting it does not silently
 * drop the season the reader chose. */
function Hidden({ name, value }: { name: string; value: string | null }) {
  return value === null || value === '' ? null : (
    <input type="hidden" name={name} value={value} />
  );
}

export function SeasonControls({
  filters,
  season,
  years,
}: {
  filters: Filters;
  /** The season actually on screen — `null` when every season is listed. */
  season: number | null;
  /** Every season the published list contains, most recent first. */
  years: readonly number[];
}) {
  // The resolved season leads the list even when it is older than the six
  // most recent: a shared `?year=2019` URL must show its own season selected,
  // not an unselected row of newer ones.
  const offered = [
    ...(season !== null && !years.slice(0, MAX_SEASONS).includes(season) ? [season] : []),
    ...years.slice(0, MAX_SEASONS),
  ];

  return (
    // v3-consolidated work package 26b: `min-w-0` added. This is a CSS Grid
    // item with no explicit `grid-template-columns`, so its implicit track
    // sizes to `auto` — which, like a flex item, defaults to `min-width: auto`
    // (its content's min-content size) rather than shrinking to fit the
    // parent. `min-w-0` is the standard fix for an implicit grid/flex track
    // refusing to shrink below its content.
    <div className="grid min-w-0 gap-3">
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
    </div>
  );
}

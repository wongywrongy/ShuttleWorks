/**
 * `/e/` — the season calendar, the platform front door (SP-P8 §2).
 *
 * One signed-out state, by owner ruling (STOP-1): this tier structurally
 * cannot know who is reading a page, so there is no "My tournaments" strip
 * and no signed-in variant.
 *
 * **One read.** SP-P8 reversed the G1 decline: `GET /e/api/pages` now ships a
 * decided status, the segment counts and the NOW pick per listing, so the
 * fan-out of one projection call per slug — and the card reduction it fed — is
 * gone. Nothing here re-derives state from dates: "happening now" in
 * particular is a publication fact (`now` on the payload), never arithmetic.
 *
 * Selection and ordering stay server-side through the pure functions
 * (`parseFilters` → `rowMatches` → `viewRows`), rendered by three components
 * that decide nothing. The loader reads `request` for its URL and nothing
 * else; no CSRF mint (every form on this page is a GET).
 */
import { redirect } from 'react-router';
import { BRAND, brandedTitle } from '@scheduler/brand';

import { EmptyState } from '../components/EmptyState';
import { NowStrip } from '../components/NowStrip';
import { PlayShell } from '../components/PlayShell';
import { SeasonCalendar } from '../components/SeasonCalendar';
import { SeasonControls } from '../components/SeasonControls';
import { apiGet } from '../lib/apiFetch.server';
import {
  filtersToParams,
  parseFilters,
  paginateRows,
  rowMatches,
  viewRows,
  type Filters,
  type SeasonList,
  type SeasonRow,
} from '../lib/phase';
import type { Route } from './+types/discovery';

export interface DiscoveryLoaderData {
  filters: Filters;
  rows: SeasonRow[];
  /**
   * The segment counts (§2.3), over the rows the ACTIVE FILTERS match — the
   * list-pagination contract's "counts refer to the full filtered
   * collection". The VIEW is not one of those filters (`rowMatches` never
   * reads it), so the labels answer "how much of what I searched for is in
   * each segment" and do not move when the entrant switches segment; they do
   * move as the search text and date range change.
   */
  counts: { takingEntries: number; completed: number };
  listedCount: number;
  totalCount: number;
  page: number;
  pageSize: number;
  pageCount: number;
  nowStrip: { row: SeasonRow; moreCount: number } | null;
  /** SSR render instant, ms — the pure functions take `now` as a parameter
   * (no `Date.now()` below the loader). */
  nowMs: number;
}

/**
 * The same query with every empty field dropped, or `null` when it already
 * is (E5).
 *
 * A native GET form submits every named control, blank ones included, so
 * applying filters with nothing chosen produced `/e/?q=&preset=&from=&to=` —
 * the URL an entrant then copies out of the address bar and pastes into a club
 * mailing list. No markup can suppress a blank field without script (a radio
 * group needs its "All" option to be selectable, and a blank
 * `<input type="date">` still submits its name), so the canonicalisation
 * happens here, where a redirect costs one round trip on the way in and
 * nothing after.
 *
 * Only EMPTY values are dropped. An unknown value is left alone: it is
 * already ignored by `parseFilters`, and quietly rewriting a URL a human
 * typed is a different, larger behaviour than tidying one a form generated.
 */
function canonicalQuery(url: URL): string | null {
  const clean = new URLSearchParams();
  for (const [name, value] of url.searchParams) {
    if (value !== '') clean.append(name, value);
  }
  const query = clean.toString();
  return query === url.searchParams.toString() ? null : query;
}

export async function loader({ request }: { request: Request }) {
  const url = new URL(request.url);
  const canonical = canonicalQuery(url);
  if (canonical !== null) {
    // Root-relative and WITHOUT the basename: React Router prefixes
    // `config.basename` (`/e/`) onto a loader redirect itself, so passing
    // `url.pathname` here lands on `/e/e/`. Nothing about the host leaks
    // into the header either way, and the browser re-applies the `#calendar`
    // fragment the control row's forms carry, because the Location carries
    // none of its own.
    throw redirect(canonical === '' ? '/' : `/?${canonical}`);
  }

  const filters = parseFilters(url.searchParams);
  const season = await apiGet<SeasonList>('/e/api/pages');
  const now = new Date();
  const matching = season.tournaments.filter((r) => rowMatches(r, filters, now));
  const ordered = viewRows(matching, filters.view);
  const pageSize = filters.view === 'completed' ? 20 : 10;
  const requestedPage = Number.parseInt(url.searchParams.get('page') ?? '1', 10);
  const paged = paginateRows(ordered, requestedPage, pageSize);
  if (url.searchParams.has('page') && requestedPage !== paged.page) {
    // Loader redirects receive the router basename automatically; rendered
    // links need it explicitly. Passing /e/ here would redirect to /e/e/.
    throw redirect(pageHref(filters, paged.page, false));
  }
  // Counted over `matching`, not `season.tournaments`: the list-pagination
  // contract puts counts on the full FILTERED collection. `matching` is
  // pre-`viewRows`, so switching segment still does not move a label — only
  // the search text and the date range do. (`season.counts` is still on the
  // wire and still unfiltered; this page no longer labels with it.)
  const filteredCounts = {
    takingEntries: matching.filter((row) => row.status === 'entries_open').length,
    completed: matching.filter((row) => row.status === 'completed' || row.status === 'completed_winners').length,
  };
  const nowRow =
    season.now === null
      ? null
      : (season.tournaments.find((r) => r.slug === season.now!.slug) ?? null);
  const payload: DiscoveryLoaderData = {
    filters,
    rows: paged.rows,
    counts: filteredCounts,
    listedCount: ordered.length,
    totalCount: ordered.length,
    page: paged.page,
    pageSize,
    pageCount: paged.pageCount,
    nowStrip: nowRow === null ? null : { row: nowRow, moreCount: season.now!.moreCount },
    nowMs: now.getTime(),
  };
  return payload;
}

/**
 * A page link for the CURRENT filters. The query is `filtersToParams`' — the
 * single serialiser both this and `SeasonControls`' `queryHref` share, so a
 * page link cannot promote an implicit search scope (`?q=Open`) into an
 * explicit `view=all` the entrant never selected.
 */
function pageHref(filters: Filters, page: number, includeBasename = true): string {
  const params = filtersToParams(filters);
  if (page > 1) params.set('page', String(page));
  const query = params.toString();
  const base = includeBasename ? '/e/' : '/';
  return query === '' ? `${base}#calendar` : `${base}?${query}#calendar`;
}

function Pagination({ filters, page, pageCount, totalCount, pageSize }: {
  filters: Filters;
  page: number;
  pageCount: number;
  totalCount: number;
  pageSize: number;
}) {
  if (pageCount <= 1) return null;
  const first = (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, totalCount);
  const numbers = paginationPages(page, pageCount);
  return (
    <nav aria-label="Tournament pages" className="flex flex-wrap items-center justify-between gap-3 border-t border-rule-soft px-4 py-4 text-sm">
      <p className="tabular-nums text-muted-foreground">Showing {first}–{last} of {totalCount} tournaments</p>
      <div className="flex flex-wrap items-center gap-3">
        {page > 1 ? <a href={pageHref(filters, page - 1)} rel="prev" aria-label="Previous page" className="inline-flex min-h-9 items-center text-accent underline-offset-4 hover:underline">Previous</a> : <span className="inline-flex min-h-9 items-center text-muted-foreground" aria-disabled="true">Previous</span>}
        <ol className="flex flex-wrap items-center gap-2" aria-label="Choose page">
          {numbers.map((number, index) => (
            <li key={number === 'ellipsis' ? `ellipsis-${index}` : number}>
              {number === 'ellipsis' ? (
                <span aria-hidden="true" className="inline-flex min-h-9 min-w-9 items-center justify-center px-2 text-muted-foreground">…</span>
              ) : number === page ? (
                <span aria-current="page" aria-label={`Page ${number}`} className="inline-flex min-h-9 min-w-9 items-center justify-center rounded border border-accent px-2 font-semibold text-foreground">{number}</span>
              ) : (
                <a href={pageHref(filters, number)} aria-label={`Page ${number}`} className="inline-flex min-h-9 min-w-9 items-center justify-center rounded border border-rule-control px-2 text-accent hover:border-accent">{number}</a>
              )}
            </li>
          ))}
        </ol>
        {page < pageCount ? <a href={pageHref(filters, page + 1)} rel="next" aria-label="Next page" className="inline-flex min-h-9 items-center text-accent underline-offset-4 hover:underline">Next</a> : <span className="inline-flex min-h-9 items-center text-muted-foreground" aria-disabled="true">Next</span>}
      </div>
    </nav>
  );
}

function paginationPages(page: number, pageCount: number): Array<number | 'ellipsis'> {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, index) => index + 1);
  const pages = new Set([1, pageCount, page - 1, page, page + 1]);
  const ordered = [...pages].filter((value) => value >= 1 && value <= pageCount).sort((a, b) => a - b);
  const result: Array<number | 'ellipsis'> = [];
  ordered.forEach((value, index) => {
    if (index > 0 && value - ordered[index - 1] > 1) result.push('ellipsis');
    result.push(value);
  });
  return result;
}

export const meta: Route.MetaFunction = () => [
  { title: brandedTitle('Tournaments') },
  {
    name: 'description',
    content:
      `${BRAND.sportName} tournaments taking entries through ${BRAND.productName}. Every entry is confirmed by the organizer.`,
  },
  { property: 'og:title', content: brandedTitle('Tournaments') },
  { property: 'og:type', content: 'website' },
];

export default function Discovery({ loaderData }: Route.ComponentProps) {
  const { filters, rows, counts, listedCount, totalCount, page, pageSize, pageCount, nowStrip } = loaderData;

  return (
    <PlayShell>
      {/* Absence is the page not rendering the band — never an empty band
          with a placeholder in it (§2.1). */}
      {nowStrip === null || (filters.view !== 'season' && filters.view !== 'open') ? null : (
        <NowStrip row={nowStrip.row} moreCount={nowStrip.moreCount} />
      )}
      <main className="mx-auto w-full max-w-6xl px-4 py-6 md:py-10">
        <h1 className="type-display text-[1.75rem] tracking-[-0.02em] text-foreground">
          {filters.view === 'completed' ? 'Completed tournaments' : filters.view === 'all' ? 'All tournaments' : 'Live & upcoming'}
        </h1>
        <p className="mt-1 max-w-prose text-sm text-muted-foreground">
          {filters.view === 'completed'
            ? 'Browse completed badminton tournaments and their published results.'
            : filters.view === 'all'
              ? 'Search all published tournaments, including completed results.'
            : `Find ${BRAND.sportName.toLowerCase()} tournaments, schedules, and results.`}
        </p>

        {/* v3-consolidated work package 26b: `min-w-0`. An implicit CSS
            Grid track (no `grid-template-columns` here) sizes to the
            widest ITEM's min-content, and a grid item defaults to
            `min-width: auto` just like a flex item — so one long,
            barely-breakable calendar row (an organizer's venue/locality
            string with no good wrap point) was setting this whole
            column's width, and `SeasonControls` right above it inherited
            that same inflated width even though its own content had
            nothing to do with it. Verified against a real running page:
            this single class is what let a 320/390px document scroll
            horizontally (plan §6 "Responsive/signage") — every other fix
            attempted in this package for the same symptom (the search
            box's own internal layout, the "Filters" popover's closed-state
            display) was real but not sufficient on its own, because the
            grid track itself, not any one child, was the thing refusing
            to shrink. */}
        <div className="mt-6 grid min-w-0 gap-4">
          <SeasonControls filters={filters} counts={counts} />
          {/* The empty states render INSTEAD of the calendar, and the
              filtered arm is NOT gated on `anyFilterActive`: §2.4 says a
              conditional element disappears cleanly, so an empty bordered
              card is as much a violation as an empty band. A segment is
              itself a selection — `?view=completed` with nothing completed
              has zero rows and no filter set — and "Clear filters" honestly
              returns the reader to the full Season view. `SeasonCalendar`
              therefore never receives an empty `rows`. */}
          {seasonEmpty(listedCount, filters) ? (
            <EmptyState
              heading="No tournaments on the calendar yet"
              body="No live or upcoming tournament is published right now. Check completed results or try again soon."
              action={{ label: 'View completed tournaments', href: '/e/?view=completed#calendar' }}
            />
          ) : rows.length === 0 ? (
            <EmptyState
              heading="No tournaments match"
              body="Check spelling, change the date range, or clear filters."
              action={{ label: 'Clear filters', href: '/e/' }}
            />
          ) : (
            <>
              {totalCount > 0 && pageCount <= 1 ? <p className="text-sm tabular-nums text-muted-foreground">Showing 1–{totalCount} of {totalCount} tournaments</p> : null}
              <SeasonCalendar rows={rows} view={filters.view} />
              <Pagination filters={filters} page={page} pageCount={pageCount} totalCount={totalCount} pageSize={pageSize} />
              {filters.view === 'season' || filters.view === 'open' ? (
                <p className="text-sm text-muted-foreground">
                  Looking for past results?{' '}
                  <a href="/e/?view=completed#calendar" className="text-accent underline underline-offset-4 hover:no-underline">
                    View completed tournaments →
                  </a>
                </p>
              ) : null}
            </>
          )}
        </div>
      </main>
    </PlayShell>
  );
}

function seasonEmpty(listedCount: number, filters: Filters): boolean {
  return listedCount === 0 && filters.view === 'season' && filters.q.trim() === '' &&
    filters.year == null && filters.preset === null && filters.from === null && filters.to === null;
}

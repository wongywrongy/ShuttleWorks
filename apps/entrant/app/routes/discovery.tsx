/**
 * `/e/` — the season calendar, the platform front door (SP-P8 §2, P5).
 *
 * One signed-out state, by owner ruling (STOP-1): this tier structurally
 * cannot know who is reading a page, so there is no "My tournaments" strip
 * and no signed-in variant.
 *
 * **One read.** SP-P8 reversed the G1 decline: `GET /e/api/pages` ships a
 * decided status, the segment counts and the NOW pick per listing, so the
 * fan-out of one projection call per slug — and the card reduction it fed —
 * is gone. Nothing here re-derives state from dates: "happening now" in
 * particular is a publication fact (the row's own `status`), never
 * arithmetic.
 *
 * **One season is the content boundary** (P5). The page shows the selected
 * season — what is live, then what is to come, then "Earlier this season" —
 * and a reader moves through time by choosing a season. The 2026-09-12
 * public refinement adds two bounded controls over that one list: a
 * lifecycle SLICE (`?show=` — all, upcoming, live, past) and a PAGE
 * (`?page=`), both server-side, both in the URL, both applied AFTER the
 * season and the search so they always cover the complete dataset. The
 * separate "Live today" banner is retired: a live tournament is listed once,
 * at the top of the calendar, under a header that says so.
 *
 * Selection and ordering stay server-side through the pure functions
 * (`parseFilters` → `seasonModel`), rendered by components that decide
 * nothing. The loader reads `request` for its URL and nothing else; no CSRF
 * mint (the one form on this page is a GET).
 */
import { redirect } from 'react-router';
import { BRAND, brandedTitle } from '@scheduler/brand';

import { EmptyState } from '../components/EmptyState';
import { PlayShell } from '../components/PlayShell';
import { SeasonCalendar } from '../components/SeasonCalendar';
import { SeasonControls } from '../components/SeasonControls';
import { apiGet } from '../lib/apiFetch.server';
import { demoNow } from '../lib/demoClock.server';
import {
  SHOW_FILTERS,
  filtersToParams,
  parseFilters,
  seasonModel,
  type Filters,
  type SeasonList,
  type SeasonModel,
  type ShowFilter,
} from '../lib/phase';
import { ACTION_LINK } from '../lib/ui';
import type { Route } from './+types/discovery';

export interface DiscoveryLoaderData {
  filters: Filters;
  model: SeasonModel;
  /** SSR render instant, ms — the pure functions take `now` as a parameter
   * (no `Date.now()` below the loader). */
  nowMs: number;
}

/**
 * The canonical URL for this query, or `null` when the request already is it.
 *
 * Two jobs, both of which need a redirect rather than markup:
 *
 * 1. **Blanks.** A native GET form submits every named control, blank ones
 *    included, so searching with an empty box produced `/e/?q=&year=` — the
 *    URL an entrant then copies out of the address bar and pastes into a club
 *    mailing list. No markup can suppress a blank field without script.
 * 2. **The retired vocabulary.** `?view=`, `?preset=`, `?from=` and `?to=`
 *    named a page shape that no longer exists. They are dropped rather than
 *    404'd, because the URLs are already in posters and mailing lists and
 *    they still name a real place — and `?view=completed`, which named the
 *    archive, lands on the past section's anchor, so the reader who followed
 *    that link still arrives at the results it promised.
 *
 * Only the four live parameters survive, and only with a value `parseFilters`
 * accepts — a `?year=banana` or a `?show=soon` narrows nothing, so it must
 * not stay in a URL describing a filter the list is not under.
 */
function canonicalTarget(url: URL): string | null {
  const params = new URLSearchParams();
  const q = url.searchParams.get('q') ?? '';
  if (q.trim() !== '') params.set('q', q);
  const year = url.searchParams.get('year');
  if (year !== null && (year === 'all' || /^\d{4}$/.test(year))) params.set('year', year);
  const show = url.searchParams.get('show');
  if (show !== null && show !== 'all' && SHOW_FILTERS.includes(show as ShowFilter)) {
    params.set('show', show);
  }
  const page = url.searchParams.get('page');
  if (page !== null && /^[1-9]\d*$/.test(page) && page !== '1') params.set('page', page);
  const query = params.toString();
  // A fragment survives a redirect only when the Location carries one of its
  // own; otherwise the browser re-applies the fragment the request had.
  const fragment = url.searchParams.get('view') === 'completed' ? '#past' : '';
  if (fragment === '' && query === url.searchParams.toString()) return null;
  // Root-relative and WITHOUT the basename: React Router prefixes
  // `config.basename` (`/e/`) onto a loader redirect itself, so passing
  // `url.pathname` here lands on `/e/e/`. Nothing about the host leaks into
  // the header either way.
  return query === '' ? `/${fragment}` : `/?${query}${fragment}`;
}

export async function loader({ request }: { request: Request }) {
  const url = new URL(request.url);
  if (url.searchParams.has('status')) {
    throw new Response('Not found', { status: 404 });
  }
  const canonical = canonicalTarget(url);
  if (canonical !== null) throw redirect(canonical);

  const filters = parseFilters(url.searchParams);
  const season = await apiGet<SeasonList>('/e/api/pages');
  const now = demoNow();
  const model = seasonModel(season.tournaments, filters, now);
  const payload: DiscoveryLoaderData = {
    filters,
    model,
    nowMs: now.getTime(),
  };
  return payload;
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

/** The one-line count beside the slice controls. It names the boundary the
 * page is under, so a reader can see that "nothing in November" is a fact
 * about this season rather than about the platform. */
function listedLine(model: SeasonModel, q: string): string {
  const noun = model.listedCount === 1 ? 'tournament' : 'tournaments';
  const where = model.season === null ? 'every season' : `the ${model.season} season`;
  const paged = model.pageCount > 1 ? `, page ${model.page} of ${model.pageCount}` : '';
  if (q.trim() !== '') {
    return `${model.listedCount} ${noun} in ${where} match your search${paged}`;
  }
  return model.season === null
    ? `${model.listedCount} ${noun}${paged}`
    : `${model.listedCount} ${noun} in ${where}${paged}`;
}

/** The page links, when the listing spans more than one page. Plain links
 * carrying the whole query, so a page is shareable and needs no script. */
function Pagination({ filters, model }: { filters: Filters; model: SeasonModel }) {
  if (model.pageCount < 2) return null;
  const href = (page: number) => `/e/?${filtersToParams({ ...filters, page }).toString()}#calendar`;
  return (
    <nav aria-label="Calendar pages" className="flex items-center justify-between text-sm">
      <span>
        {model.page > 1 ? (
          <a href={href(model.page - 1)} className={ACTION_LINK}>
            Previous
          </a>
        ) : null}
      </span>
      <span className="tabular-nums text-muted-foreground">{`Page ${model.page} of ${model.pageCount}`}</span>
      <span>
        {model.page < model.pageCount ? (
          <a href={href(model.page + 1)} className={ACTION_LINK}>
            Next
          </a>
        ) : null}
      </span>
    </nav>
  );
}

export default function Discovery({ loaderData }: Route.ComponentProps) {
  const { filters, model } = loaderData;
  const searching = filters.q.trim() !== '';
  const listed = model.publishedCount > 0 && model.listedCount > 0;

  return (
    <PlayShell>
      <main className="mx-auto w-full max-w-6xl px-4 py-4 md:py-6">
        {/* The masthead is one line: the season as the heading, the tier's
            purpose as a short trailing subtitle. It used to be two stacked
            blocks above a third for the controls. */}
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <h1 className="type-display text-[1.75rem] tracking-[-0.02em] text-foreground">
            {model.season === null ? 'All tournaments' : `${model.season} season`}
          </h1>
          <p className="text-sm text-muted-foreground">
            {`${BRAND.sportName} tournaments, schedules and results.`}
          </p>
        </div>

        {/* v3-consolidated work package 26b: `min-w-0`. An implicit CSS Grid
            track sizes to the widest ITEM's min-content, and a grid item
            defaults to `min-width: auto` just like a flex item — so one long,
            barely-breakable calendar row was setting this whole column's
            width. Verified against a real running page: this single class is
            what let a 320/390px document scroll horizontally. */}
        <div className="mt-4 grid min-w-0 gap-3">
          <SeasonControls
            filters={filters}
            season={model.season}
            years={model.years}
            counts={model.counts}
            listedLine={listed ? listedLine(model, filters.q) : null}
          />
          {/* The empty states render INSTEAD of the calendar: §2.4 says a
              conditional element disappears cleanly, so an empty bordered card
              is as much a violation as an empty band. `SeasonCalendar`
              therefore never receives an empty model. */}
          {model.publishedCount === 0 ? (
            <EmptyState
              heading="No tournaments on the calendar yet"
              body="No organizer has published a tournament page here yet. Check back soon."
            />
          ) : model.listedCount === 0 ? (
            <EmptyState
              heading="No tournaments match"
              body={
                searching
                  ? 'Check the spelling, or widen the search to every published season.'
                  : filters.show !== 'all'
                    ? 'Nothing in this season is in that state. Choose another view above.'
                    : 'Nothing is published in this season. Choose another season above.'
              }
              action={
                searching && model.season !== null
                  ? {
                      label: 'Search all seasons',
                      href: `/e/?${filtersToParams({ ...filters, year: 'all', page: 1 }).toString()}#calendar`,
                    }
                  : filters.show !== 'all'
                    ? {
                        label: 'Show every tournament',
                        href: `/e/?${filtersToParams({ ...filters, show: 'all', page: 1 }).toString()}#calendar`,
                      }
                    : { label: 'Back to the calendar', href: '/e/' }
              }
            />
          ) : (
            <>
              <SeasonCalendar model={model} />
              <Pagination filters={filters} model={model} />
            </>
          )}
        </div>
      </main>
    </PlayShell>
  );
}

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
 * particular is a publication fact (`now` on the payload), never arithmetic.
 *
 * **One season is the content boundary** (P5). The lifecycle segments, the
 * date facet and the pagination are all retired: the page shows the selected
 * season, upcoming first and then "Earlier this season", and a reader moves
 * through time by choosing a season rather than by choosing a lifecycle. The
 * whole listing still arrives in one read (it is the platform's public index,
 * and it is small), but only one season is ever RENDERED — which is what the
 * page-weight gate measures.
 *
 * Selection and ordering stay server-side through the pure functions
 * (`parseFilters` → `seasonModel`), rendered by three components that decide
 * nothing. The loader reads `request` for its URL and nothing else; no CSRF
 * mint (the one form on this page is a GET).
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
  seasonModel,
  type Filters,
  type SeasonList,
  type SeasonModel,
  type SeasonRow,
} from '../lib/phase';
import type { Route } from './+types/discovery';

export interface DiscoveryLoaderData {
  filters: Filters;
  model: SeasonModel;
  nowStrip: { row: SeasonRow; moreCount: number } | null;
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
 * 2. **The retired vocabulary.** `?view=`, `?preset=`, `?from=`, `?to=` and
 *    `?page=` named a page shape that no longer exists. They are dropped
 *    rather than 404'd, because the URLs are already in posters and mailing
 *    lists and they still name a real place — and `?view=completed`, which
 *    named the archive, lands on the past section's anchor, so the reader who
 *    followed that link still arrives at the results it promised. The
 *    lifecycle segment it came from is not restored: the destination is a
 *    position on one continuous page.
 *
 * Only the two live parameters survive, and only with a value `parseFilters`
 * accepts — a `?year=banana` narrows nothing, so it must not stay in a URL
 * describing a filter the list is not under.
 */
function canonicalTarget(url: URL): string | null {
  const params = new URLSearchParams();
  const q = url.searchParams.get('q') ?? '';
  if (q.trim() !== '') params.set('q', q);
  const year = url.searchParams.get('year');
  if (year !== null && (year === 'all' || /^\d{4}$/.test(year))) params.set('year', year);
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
  const now = new Date();
  const model = seasonModel(season.tournaments, filters, now);
  const nowRow =
    season.now === null
      ? null
      : (season.tournaments.find((r) => r.slug === season.now!.slug) ?? null);
  const payload: DiscoveryLoaderData = {
    filters,
    model,
    // The strip is the SERVER's pick and it is about right now, so it does
    // not follow the season the reader is browsing. It steps aside for a
    // search, which is a deliberate question about something else.
    nowStrip:
      nowRow === null || filters.q.trim() !== ''
        ? null
        : { row: nowRow, moreCount: season.now!.moreCount },
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

/** The one-line count under the toolbar. It names the boundary the page is
 * under, so a reader can see that "nothing in November" is a fact about this
 * season rather than about the platform. */
function listedLine(model: SeasonModel, q: string): string {
  const noun = model.listedCount === 1 ? 'tournament' : 'tournaments';
  if (q.trim() !== '') {
    const where = model.season === null ? 'every season' : `the ${model.season} season`;
    return `${model.listedCount} ${noun} in ${where} match your search`;
  }
  return model.season === null
    ? `${model.listedCount} ${noun}`
    : `${model.listedCount} ${noun} in the ${model.season} season`;
}

export default function Discovery({ loaderData }: Route.ComponentProps) {
  const { filters, model, nowStrip } = loaderData;
  const searching = filters.q.trim() !== '';

  return (
    <PlayShell>
      {/* Absence is the page not rendering the band — never an empty band
          with a placeholder in it (§2.1). */}
      {nowStrip === null ? null : (
        <NowStrip row={nowStrip.row} moreCount={nowStrip.moreCount} />
      )}
      <main className="mx-auto w-full max-w-6xl px-4 py-6 md:py-10">
        <h1 className="type-display text-[1.75rem] tracking-[-0.02em] text-foreground">
          {model.season === null ? 'All tournaments' : `${model.season} season`}
        </h1>
        <p className="mt-1 max-w-prose text-sm text-muted-foreground">
          {`Find ${BRAND.sportName.toLowerCase()} tournaments, schedules, and results.`}
        </p>

        {/* v3-consolidated work package 26b: `min-w-0`. An implicit CSS Grid
            track sizes to the widest ITEM's min-content, and a grid item
            defaults to `min-width: auto` just like a flex item — so one long,
            barely-breakable calendar row was setting this whole column's
            width. Verified against a real running page: this single class is
            what let a 320/390px document scroll horizontally. */}
        <div className="mt-6 grid min-w-0 gap-4">
          <SeasonControls filters={filters} season={model.season} years={model.years} />
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
                  : 'Nothing is published in this season. Choose another season above.'
              }
              action={
                searching && model.season !== null
                  ? {
                      label: 'Search all seasons',
                      href: `/e/?${filtersToParams({ ...filters, year: 'all' }).toString()}#calendar`,
                    }
                  : { label: 'Back to the calendar', href: '/e/' }
              }
            />
          ) : (
            <>
              <p className="text-sm tabular-nums text-muted-foreground">{listedLine(model, filters.q)}</p>
              <SeasonCalendar model={model} />
            </>
          )}
        </div>
      </main>
    </PlayShell>
  );
}

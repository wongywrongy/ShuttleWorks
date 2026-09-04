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
  parseFilters,
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
  /** The server's UNFILTERED segment counts (§2.3) — the labels never move. */
  counts: { takingEntries: number; completed: number };
  listedCount: number;
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
  const nowRow =
    season.now === null
      ? null
      : (season.tournaments.find((r) => r.slug === season.now!.slug) ?? null);
  const payload: DiscoveryLoaderData = {
    filters,
    rows: viewRows(matching, filters.view),
    counts: season.counts,
    listedCount: season.tournaments.length,
    nowStrip: nowRow === null ? null : { row: nowRow, moreCount: season.now!.moreCount },
    nowMs: now.getTime(),
  };
  return payload;
}

export const meta: Route.MetaFunction = () => [
  { title: brandedTitle('Tournaments') },
  {
    name: 'description',
    content:
      `Badminton tournaments taking entries through ${BRAND.productName}. Every entry is confirmed by the organizer.`,
  },
  { property: 'og:title', content: brandedTitle('Tournaments') },
  { property: 'og:type', content: 'website' },
];

export default function Discovery({ loaderData }: Route.ComponentProps) {
  const { filters, rows, counts, listedCount, nowStrip } = loaderData;

  return (
    <PlayShell>
      {/* Absence is the page not rendering the band — never an empty band
          with a placeholder in it (§2.1). */}
      {nowStrip === null ? null : (
        <NowStrip row={nowStrip.row} moreCount={nowStrip.moreCount} />
      )}
      <main className="mx-auto w-full max-w-6xl px-4 py-6 md:py-10">
        <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
          Tournaments
        </h1>
        <p className="mt-1 max-w-prose text-sm text-muted-foreground">
          {`Badminton tournaments taking entries through ${BRAND.productName}. Every entry is confirmed by the organizer.`}
        </p>

        <div className="mt-6 grid gap-4">
          <SeasonControls filters={filters} counts={counts} />
          {/* The empty states render INSTEAD of the calendar, and the
              filtered arm is NOT gated on `anyFilterActive`: §2.4 says a
              conditional element disappears cleanly, so an empty bordered
              card is as much a violation as an empty band. A segment is
              itself a selection — `?view=completed` with nothing completed
              has zero rows and no filter set — and "Clear filters" honestly
              returns the reader to the full Season view. `SeasonCalendar`
              therefore never receives an empty `rows`. */}
          {listedCount === 0 ? (
            <EmptyState
              heading="No tournaments on the calendar yet"
              body="No tournament is taking entries right now. Check back soon, or open the entry link your organizer gave you."
            />
          ) : rows.length === 0 ? (
            <EmptyState
              heading="No tournaments match"
              body="Check spelling, change the date range, or clear filters."
              action={{ label: 'Clear filters', href: '/e/' }}
            />
          ) : (
            <SeasonCalendar rows={rows} view={filters.view} />
          )}
        </div>
      </main>
    </PlayShell>
  );
}

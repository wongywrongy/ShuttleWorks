/**
 * `/e/` — discovery, the platform front door (SP-P6-2 §1).
 *
 * One signed-out state, by owner ruling (STOP-1): this tier structurally
 * cannot know who is reading a page, so there is no "My tournaments" strip
 * and no signed-in variant — those arrive with E2's API.
 *
 * **The loader is the G1 decline path, and deliberately N+1.** The owner
 * declined extending `GET /e/api/pages` past `{slug}`, so discovery lists
 * the open pages and fans out one `GET /e/api/page/{slug}` per listed
 * tournament, reducing each projection to a card (`toDiscoveryCard`).
 * Correct at local scale; the ruling books a revisit if a real deployment's
 * listing grows past the point where that is cheap. A slug that 404s
 * between the list and the read (a page closed mid-flight) is dropped, not
 * an error — the uniform 404 is the backend saying "not public".
 *
 * Filtering and ordering are server-side through the pure functions
 * (`parseFilters` → `cardMatches` → `orderCards`), with the chosen controls
 * echoed back `checked` — one GET form, no client JS (Z1). The loader reads
 * `request` for its URL and nothing else; no CSRF mint (no form here posts
 * a secret — both forms are GETs).
 */
import { EmptyState } from '../components/EmptyState';
import { FilterStrip } from '../components/FilterStrip';
import { PlayShell } from '../components/PlayShell';
import { TournamentCard } from '../components/TournamentCard';
import { ApiError, apiGet } from '../lib/apiFetch.server';
import type { EntryPageDTO } from '../lib/entryPage.types';
import {
  anyFilterActive,
  cardMatches,
  orderCards,
  parseFilters,
  toDiscoveryCard,
  type DiscoveryCard,
  type Filters,
} from '../lib/phase';
import type { Route } from './+types/discovery';

export interface DiscoveryLoaderData {
  filters: Filters;
  cards: DiscoveryCard[];
  listedCount: number;
  /** SSR render instant, ms — the pure functions take `now` as a parameter
   * (no `Date.now()` below the loader), and the chip needs the same one. */
  nowMs: number;
}

export async function loader({ request }: { request: Request }) {
  const filters = parseFilters(new URL(request.url).searchParams);
  const listed = await apiGet<{ slug: string }[]>('/e/api/pages');
  const pages = await Promise.all(
    listed.map(async ({ slug }) => {
      try {
        return await apiGet<EntryPageDTO>(`/e/api/page/${encodeURIComponent(slug)}`);
      } catch (err) {
        // Closed between the list and the read — no longer public, so no card.
        if (err instanceof ApiError && err.status === 404) return null;
        throw err;
      }
    }),
  );
  const now = new Date();
  const all = pages.filter((page): page is EntryPageDTO => page !== null).map(toDiscoveryCard);
  const cards = orderCards(
    all.filter((card) => cardMatches(card, filters, now)),
    now,
  );
  const payload: DiscoveryLoaderData = {
    filters,
    cards,
    listedCount: all.length,
    nowMs: now.getTime(),
  };
  return payload;
}

export const meta: Route.MetaFunction = () => [
  { title: 'Find a tournament — ShuttleWorks' },
  {
    name: 'description',
    content:
      'Badminton tournaments taking entries through ShuttleWorks. Every listing says whether you can enter it right now.',
  },
  { property: 'og:title', content: 'Find a tournament — ShuttleWorks' },
  { property: 'og:type', content: 'website' },
];

export default function Discovery({ loaderData }: Route.ComponentProps) {
  const { filters, cards, listedCount, nowMs } = loaderData;
  const now = new Date(nowMs);
  const filtered = anyFilterActive(filters);

  return (
    <PlayShell q={filters.q}>
      <main className="mx-auto w-full max-w-6xl px-4 py-6 md:py-10">
        <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
          Find a tournament
        </h1>
        <p className="mt-1 max-w-prose text-sm text-muted-foreground">
          Badminton tournaments taking entries through ShuttleWorks. Every card says
          whether you can enter it right now.
        </p>

        <div className="mt-6 md:grid md:grid-cols-[15rem_minmax(0,1fr)] md:items-start md:gap-10">
          {/* Refinement 4: the always-visible strip — a compact panel at
              phone widths, the rail from md: up. No toggle, nothing hidden. */}
          <FilterStrip filters={filters} />

          <section id="results" tabIndex={-1} className="mt-6 outline-none md:mt-0">
            <h2 className="text-sm font-semibold text-muted-foreground">
              {filtered
                ? `${cards.length} of ${listedCount} tournaments`
                : `${listedCount} tournaments`}{' '}
              <span className="font-normal">· closing soonest first</span>
            </h2>
            {cards.length === 0 ? (
              filtered ? (
                <div className="mt-4">
                  <EmptyState
                    heading="Nothing matches those filters"
                    body="Try widening the dates, or clear the filters to see every listed tournament."
                    action={{ label: 'Clear filters', href: '/e/' }}
                  />
                </div>
              ) : (
                // An empty listing with no filters set is information, not a
                // failed query — there is nothing to clear and no action to
                // offer, so it is a sentence rather than an EmptyState.
                <p className="mt-4 text-sm text-muted-foreground">
                  No tournament is taking entries right now. Check back soon, or open
                  the entry link your organiser gave you.
                </p>
              )
            ) : (
              <ul className="mt-4 grid gap-3 lg:grid-cols-2">
                {cards.map((card) => (
                  <TournamentCard key={card.slug} card={card} now={now} />
                ))}
              </ul>
            )}
          </section>
        </div>
      </main>
    </PlayShell>
  );
}

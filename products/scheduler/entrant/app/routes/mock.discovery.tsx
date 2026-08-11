/**
 * SP-P6-2 Phase B — the DISCOVERY mockup (`/e/mock.discovery`).
 *
 * **Mockup route. Deleted at Phase C.** Static in the only sense that matters
 * — it renders the frozen fixture module and touches no endpoint — but the
 * filter mechanics are the real Z1 resolution running live: one GET form,
 * server-side filtering through the same pure functions Phase C will wire
 * (`parseFilters` → `cardMatches` → `orderCards`), checked-state echoed back
 * into the controls. The loader reads `request` for its URL and nothing else.
 *
 * Signed-out only, per the owner's STOP-1 ruling: there is no signed-in
 * discovery state on this tier, so there is exactly one state to mock.
 *
 * Z2 as designed: the rail is always visible from `md:` up; at phone widths
 * it sits behind a native checkbox-disclosure ("Filters" label + hidden
 * checkbox, `peer-checked` reveal) — keyboard-operable, zero JS, announced as
 * a checkbox (the stated ceiling; §9.3's compact strip is the offered cut).
 */
import { Button } from '@scheduler/design-system/components';

import {
  anyFilterActive,
  cardChipState,
  cardMatches,
  orderCards,
  parseFilters,
  parseMoment,
  type Filters,
} from '../lib/phase';
import { MOCK_DISCOVERY_CARDS, MOCK_NOW, MOCK_UNLISTED_SLUG, type MockDiscoveryCard } from './mock.data';
import { DateBadge, PlayShell, StatusChip } from './mock.ui';
import type { Route } from './+types/mock.discovery';

export function loader({ request }: { request: Request }) {
  const url = new URL(request.url);
  const filters = parseFilters(url.searchParams);
  const now = parseMoment(MOCK_NOW)!;
  // The unlisted tournament exists in the fixture set (Phase D shape) and is
  // structurally absent from every listing — that is what "unlisted" means.
  const listed = MOCK_DISCOVERY_CARDS.filter((card) => card.slug !== MOCK_UNLISTED_SLUG);
  const cards = orderCards(
    listed.filter((card) => cardMatches(card, filters, now)),
    now,
  ) as MockDiscoveryCard[];
  return { filters, cards, listedCount: listed.length };
}

export const meta: Route.MetaFunction = () => [
  { title: 'Find a tournament — ShuttleWorks' },
  // Phase-B scaffolding must not reach an index; the real discovery page
  // takes over this meta with its own description/OG set at Phase C.
  { name: 'robots', content: 'noindex' },
];

const SELF = '/e/mock.discovery';

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
    <label className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-sm text-foreground">
      <input type="radio" name={name} value={value} defaultChecked={checked} />
      {label}
    </label>
  );
}

function FilterRail({ filters }: { filters: Filters }) {
  return (
    <form method="get" action={`${SELF}#results`} className="grid gap-5">
      {/* Keep the header search's text when a facet is applied — two GET
          forms, one query-string vocabulary. */}
      {filters.q.trim() === '' ? null : <input type="hidden" name="q" value={filters.q} />}

      <fieldset className="grid gap-1.5">
        <legend className="mb-1.5 text-sm font-semibold text-foreground">Status</legend>
        <Radio name="status" value="" label="All tournaments" checked={filters.status === null} />
        <Radio name="status" value="open" label="Entries open" checked={filters.status === 'open'} />
        <Radio name="status" value="upcoming" label="Upcoming" checked={filters.status === 'upcoming'} />
        <Radio name="status" value="past" label="Past" checked={filters.status === 'past'} />
      </fieldset>

      <fieldset className="grid gap-1.5">
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
              className="h-9 rounded border border-rule-control bg-bg-elev px-2 text-sm text-foreground"
            />
          </label>
          <label className="grid gap-1 text-xs font-medium text-muted-foreground">
            To
            <input
              type="date"
              name="to"
              defaultValue={filters.to ?? ''}
              className="h-9 rounded border border-rule-control bg-bg-elev px-2 text-sm text-foreground"
            />
          </label>
        </div>
      </fieldset>

      <div className="flex items-center gap-3">
        <Button type="submit" size="sm">
          Apply filters
        </Button>
        {anyFilterActive(filters) ? (
          <a href={SELF} className="text-sm text-accent underline-offset-4 hover:underline">
            Clear
          </a>
        ) : null}
      </div>
    </form>
  );
}

function TournamentCard({ card }: { card: MockDiscoveryCard }) {
  const chip = cardChipState(card, parseMoment(MOCK_NOW)!);
  return (
    <li className="relative rounded-lg border border-rule-soft bg-surface-raised p-4 shadow-sm transition-shadow duration-fast hover:border-rule-control hover:shadow-md">
      <div className="flex items-start gap-3.5">
        <DateBadge date={card.tournamentDate} />
        <div className="min-w-0 flex-1">
          {/* The card's single link: stretched over the whole card, so one
              tap target and one tab stop per tournament. */}
          <a
            href={card.href}
            className="font-medium text-foreground after:absolute after:inset-0 after:rounded-lg"
          >
            {card.name}
          </a>
          {card.venueName ? (
            <p className="mt-0.5 text-sm text-muted-foreground">{card.venueName}</p>
          ) : null}
          <p className="mt-0.5 text-xs text-muted-foreground">
            {card.eventCount} {card.eventCount === 1 ? 'event' : 'events'}
          </p>
        </div>
      </div>
      <div className="mt-3">
        <StatusChip state={chip} />
      </div>
    </li>
  );
}

export default function MockDiscovery({ loaderData }: Route.ComponentProps) {
  const { filters, cards, listedCount } = loaderData;
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
          <div>
            {/* Z2: native checkbox-disclosure. The input is visually hidden
                but focusable; the label is the "Filters" button; `md:` shows
                the rail unconditionally and retires the toggle. */}
            <input type="checkbox" id="filters-toggle" className="peer sr-only" />
            <label
              htmlFor="filters-toggle"
              className="inline-flex h-9 cursor-pointer select-none items-center gap-2 rounded border border-rule-control bg-surface-raised px-3 text-sm font-medium text-foreground peer-checked:bg-muted/40 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus md:hidden"
            >
              Filters
              {filtered ? <span className="text-muted-foreground">· on</span> : null}
            </label>
            <div className="mt-4 hidden rounded-lg border border-rule-soft bg-surface-sunken p-4 peer-checked:block md:mt-0 md:block md:border-0 md:bg-transparent md:p-0">
              <FilterRail filters={filters} />
            </div>
          </div>

          <section id="results" tabIndex={-1} className="mt-6 outline-none md:mt-0">
            <h2 className="text-sm font-semibold text-muted-foreground">
              {filtered
                ? `${cards.length} of ${listedCount} tournaments`
                : `${listedCount} tournaments`}{' '}
              <span className="font-normal">· soonest first</span>
            </h2>
            {cards.length === 0 ? (
              <div className="mt-4 grid justify-items-start gap-3 rounded-lg border border-dashed border-rule-control p-8">
                <p className="text-base font-medium text-foreground">
                  Nothing matches those filters
                </p>
                <p className="text-sm text-muted-foreground">
                  Try widening the dates, or clear the filters to see every listed
                  tournament.
                </p>
                <Button asChild variant="outline" size="sm">
                  <a href={SELF}>Clear filters</a>
                </Button>
              </div>
            ) : (
              <ul className="mt-4 grid gap-3 lg:grid-cols-2">
                {cards.map((card) => (
                  <TournamentCard key={card.slug} card={card} />
                ))}
              </ul>
            )}
          </section>
        </div>
      </main>
    </PlayShell>
  );
}

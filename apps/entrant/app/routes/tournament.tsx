/**
 * `/e/{slug}` — the tournament page: hero band, phase-gated tab bar, one
 * server-rendered panel (SP-P6-2 §2).
 *
 * A poster URL, not a capability URL: the loader's one call is the public
 * projection and carries no credential (the structural guards in
 * `tests/enter.loader.test.ts` run over this file). There is no form on this
 * page — the entry flow lives at `/e/{slug}/enter` — so nothing is minted
 * and the document carries no secret.
 *
 * **Phase-gating is the pure functions', not this file's**: `visibleTabs`
 * decides which tabs exist (a tab renders only when its data does — rule 4:
 * no placeholders, no disabled tabs, no coming-soon under any state),
 * `activeTab` validates `?tab` (anything unknown or hidden renders
 * Overview), `chipState`/`ctaState` decide the hero. Tabs are links with
 * `aria-current`, deliberately not an ARIA tablist (Z6) — each switch is a
 * full, KB-scale document load.
 */
import { isRouteErrorResponse, useRouteError } from 'react-router';

import { EntrantsList } from '../components/EntrantsList';
import { EventRow } from '../components/EventRow';
import { HeroHeader } from '../components/HeroHeader';
import { MessagePage } from '../components/MessagePage';
import { PlayShell } from '../components/PlayShell';
import { SectionCard } from '../components/SectionCard';
import { TabBar } from '../components/TabBar';
import { TimelineCard } from '../components/TimelineCard';
import { ApiError, apiGet } from '../lib/apiFetch.server';
import type {
  DrawsIndexDTO,
  SeedsDTO,
  WinnersDTO,
} from '../lib/draws.types';
import { kindLabel } from '../lib/draws.types';
import type { EntryPageDTO } from '../lib/entryPage.types';
import { dateOfIso, formatDateLong } from '../lib/format';
import {
  activeTab,
  chipState,
  ctaState,
  timelineModel,
  visibleTabs,
  type Tab,
} from '../lib/phase';
import type { Route } from './+types/tournament';

export interface TournamentLoaderData {
  page: EntryPageDTO;
  tabs: Tab[];
  active: Tab;
  /** SSR render instant, ms — `now` is a parameter everywhere below. */
  nowMs: number;
  /** Present only when the matching tab is active — one extra public read
   * per document, never a fan-out (SP-P7 §3.4–3.6). */
  draws?: DrawsIndexDTO;
  seeds?: SeedsDTO;
  winners?: WinnersDTO;
}

/**
 * The uniform 404 — an unknown slug and a closed page answer identically.
 * Constructed fresh, never copied from upstream, so the two causes stay
 * byte-identical here as they already are in the backend
 * (`api/entries_public.py`).
 */
function notFound(): Response {
  return new Response('Not found', { status: 404 });
}

export async function loader({
  request,
  params,
}: {
  request: Request;
  params: { slug?: string };
}) {
  const slug = params.slug;
  if (!slug) throw notFound();

  let page: EntryPageDTO;
  try {
    page = await apiGet<EntryPageDTO>(`/e/api/page/${encodeURIComponent(slug)}`);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) throw notFound();
    throw err;
  }

  const tabs = visibleTabs(page.events, page.entrants, page.publication);
  const active = activeTab(new URL(request.url).searchParams.get('tab'), tabs);
  const payload: TournamentLoaderData = {
    page,
    tabs,
    active,
    nowMs: Date.now(),
  };
  const base = `/e/api/page/${encodeURIComponent(slug)}`;
  if (active === 'draws') {
    payload.draws = await apiGet<DrawsIndexDTO>(`${base}/draws`);
  } else if (active === 'seeds') {
    payload.seeds = await apiGet<SeedsDTO>(`${base}/seeds`);
  } else if (active === 'winners') {
    payload.winners = await apiGet<WinnersDTO>(`${base}/winners`);
  }
  return payload;
}

/**
 * Per-route meta/OG tags, derived from the loader's one call — carried over
 * from the SP-P6-1 entry page verbatim, minus its `/signed-in` branch (that
 * variant now belongs to the enter route).
 *
 * **`data.page.viewer` is never read here, on purpose (I6)** — a `<meta>`
 * tag is more public than the page body. Only the director-authored content
 * fields are used, and the allowlist guard in `tests/tournament.meta.test.ts`
 * pins `data.page` as the only read. `data` is `undefined` when the loader
 * threw `notFound()`, so this inherits the uniform 404 structurally.
 */
export const meta: Route.MetaFunction = ({ data }) => {
  if (!data) {
    return [{ title: 'Entry page not found' }];
  }

  const { tournament, org, venue, page } = data.page;
  const title = tournament.name ? `${tournament.name} · Enter now` : 'Enter now';
  const description = [tournament.date, venue?.name, page.introText]
    .filter((part): part is string => Boolean(part))
    .join(' · ');

  const tags: ReturnType<Route.MetaFunction> = [{ title }];
  if (description) {
    tags.push({ name: 'description', content: description });
    tags.push({ property: 'og:description', content: description });
  }
  tags.push({ property: 'og:title', content: title });
  tags.push({ property: 'og:type', content: 'website' });
  if (org?.name) {
    tags.push({ property: 'og:site_name', content: org.name });
  }
  return tags;
};

function tabHref(slug: string, tab: Tab): string {
  const base = `/e/${encodeURIComponent(slug)}`;
  return tab === 'overview' ? base : `${base}?tab=${tab}`;
}

// ---- Overview --------------------------------------------------------------

function OverviewPanel({ page, now }: { page: EntryPageDTO; now: Date }) {
  const slug = page.page.slug;
  const moments = timelineModel(page.events, page.tournament.date, now);
  const regulations = page.page.regulationsText;
  // SP-P7 §3.7: fees left the overview entirely — pricing lives on the entry
  // form and receipt only (Kyle's mockup-review ruling), and the payment
  // prose renders inside the entry flow (`receipt.tsx`), not here. What
  // remains is a pointer row saying where the quote happens.
  const updatedIso = page.page.regulationsUpdatedAt;

  return (
    <div className="grid gap-6">
      <h2 className="sr-only">Overview</h2>
      {page.page.introText ? (
        <p className="max-w-prose text-base text-foreground">{page.page.introText}</p>
      ) : null}

      <div className="grid items-start gap-6 md:grid-cols-2">
        {moments.length > 0 ? (
          <TimelineCard moments={moments} now={now} eventsHref={tabHref(slug, 'events')} />
        ) : null}

        <div className="grid gap-6">
          <SectionCard title="Fees & payment">
            <p className="text-muted-foreground">
              Pricing is quoted on the entry form before you submit.
            </p>
            {/* The link exists only while an event is open — a closed
                tournament must carry no path into the entry form anywhere
                on the page (the hero's own rule, held by its tests). */}
            {page.events.some((event) => event.isOpen) ? (
              <a
                href={`/e/${encodeURIComponent(slug)}/enter`}
                className="mt-2 inline-block text-sm font-medium text-accent underline-offset-4 hover:underline"
              >
                Go to the entry form
              </a>
            ) : null}
          </SectionCard>

          {/* The regulations DOCUMENT ROW (§3.7): the text itself moved to a
              routed, deep-linkable reader — multi-page rules do not belong
              inline on an overview. */}
          {regulations ? (
            <SectionCard title="Documents">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-foreground">Tournament regulations</p>
                  <p className="text-xs text-muted-foreground">
                    {`Version ${page.page.regulationsVersion}`}
                    {dateOfIso(updatedIso)
                      ? ` · updated ${formatDateLong(dateOfIso(updatedIso))}`
                      : ''}
                  </p>
                </div>
                <a
                  href={`/e/${encodeURIComponent(slug)}/regulations`}
                  className="shrink-0 text-sm font-medium text-accent underline-offset-4 hover:underline"
                >
                  View regulations
                </a>
              </div>
            </SectionCard>
          ) : null}
        </div>

        {page.venue?.name || page.venue?.address ? (
          <SectionCard title="Venue">
            {page.venue.name ? <p className="font-medium">{page.venue.name}</p> : null}
            {page.venue.address ? (
              <p className="text-muted-foreground">{page.venue.address}</p>
            ) : null}
          </SectionCard>
        ) : null}
      </div>
    </div>
  );
}

// ---- The page ---------------------------------------------------------------

// ---- The SP-P7 result panels (§3.4–3.6) ------------------------------------

function DrawsPanel({ slug, draws }: { slug: string; draws: DrawsIndexDTO }) {
  if (draws.draws.length === 0) {
    return <p className="text-muted-foreground">No draws yet.</p>;
  }
  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {draws.draws.map((card) => (
        <li key={card.drawKey}>
          <a
            href={`/e/${encodeURIComponent(slug)}/draws/${encodeURIComponent(card.drawKey)}`}
            className="block rounded-lg border border-rule-soft bg-surface-raised p-4 shadow-sm hover:border-rule-control"
          >
            <p className="font-display text-base font-bold tracking-tight text-foreground">
              {card.discipline}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {[
                card.eventCode,
                kindLabel(card.kind),
                `${card.size} ${card.size === 1 ? 'entry' : 'entries'}`,
                card.hasConsolation ? 'with consolation' : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
          </a>
        </li>
      ))}
    </ul>
  );
}

function SeedsPanel({ seeds }: { seeds: SeedsDTO }) {
  if (seeds.events.length === 0) {
    return <p className="text-muted-foreground">No seeded entries yet.</p>;
  }
  return (
    <div className="grid gap-6">
      {seeds.events.map((event) => (
        <section
          key={event.eventCode}
          className="rounded-lg border border-rule-soft bg-surface-raised p-6 shadow-sm"
        >
          <h3 className="text-base font-semibold text-foreground">
            {event.discipline}
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              {event.eventCode}
            </span>
          </h3>
          <ol className="mt-3 grid gap-2">
            {event.seeds.map((line) => (
              <li key={line.seed} className="flex items-baseline gap-3 text-sm">
                <span className="w-8 shrink-0 tabular-nums font-semibold text-foreground">
                  {`[${line.seed}]`}
                </span>
                <span className="min-w-0">
                  <span className="text-foreground">{line.names.join(' / ')}</span>
                  {line.club ? (
                    <span className="block text-xs text-muted-foreground">
                      {line.club}
                    </span>
                  ) : null}
                </span>
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}

function honorLine(label: string, honor: { names: string[]; club: string | null } | null) {
  if (honor === null) return null;
  return (
    <p key={label} className="text-sm text-foreground">
      <span className="inline-block w-28 text-muted-foreground">{label}</span>
      {honor.names.join(' / ')}
      {honor.club ? (
        <span className="ml-2 text-xs text-muted-foreground">{honor.club}</span>
      ) : null}
    </p>
  );
}

function WinnersPanel({ winners }: { winners: WinnersDTO }) {
  if (winners.events.length === 0) {
    return <p className="text-muted-foreground">No results yet.</p>;
  }
  const decided = winners.events.filter((event) => event.decided).length;
  return (
    <div className="grid gap-4">
      <p className="text-sm text-muted-foreground">
        {`${decided} of ${winners.events.length} events decided`}
      </p>
      {winners.events.map((event) => (
        <section
          key={event.eventCode}
          className="rounded-lg border border-rule-soft bg-surface-raised p-6 shadow-sm"
        >
          <h3 className="text-base font-semibold text-foreground">
            {event.discipline}
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              {event.eventCode}
            </span>
          </h3>
          <div className="mt-3 grid gap-1.5">
            {event.decided ? (
              <>
                {honorLine('Winner', event.winner)}
                {honorLine('Runner-up', event.runnerUp)}
                {event.semifinalists.map((semi, index) =>
                  honorLine(index === 0 ? 'Semifinalists' : '', semi),
                )}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Not decided yet.</p>
            )}
          </div>
        </section>
      ))}
    </div>
  );
}

export default function Tournament({ loaderData }: Route.ComponentProps) {
  const { page, tabs, active, nowMs } = loaderData;
  const now = new Date(nowMs);
  const slug = page.page.slug;
  const chip = chipState(page.events, now);
  const cta = ctaState(page.events, slug);
  const metaLine = [
    formatDateLong(page.tournament.date),
    [page.venue?.name, page.venue?.address].filter(Boolean).join(', '),
  ]
    .filter((part) => part !== '')
    .join(' · ');
  // The by-event anchors died with the by-event grouping (SP-P7 §3.2): the
  // list is alphabetical now, so an event's "N entered" links to the tab.
  const entrantsHref = tabs.includes('entrants')
    ? () => tabHref(slug, 'entrants')
    : null;

  return (
    <PlayShell>
      <HeroHeader
        orgName={page.org?.name ?? null}
        title={page.tournament.name ?? slug}
        metaLine={metaLine}
        chip={chip}
        cta={cta}
      >
        <TabBar tabs={tabs} active={active} hrefFor={(tab) => tabHref(slug, tab)} />
      </HeroHeader>

      <main className="mx-auto w-full max-w-6xl px-4 py-6 md:py-8">
        {active === 'overview' ? <OverviewPanel page={page} now={now} /> : null}
        {active === 'events' ? (
          <div className="grid gap-4">
            <h2 className="sr-only">Events</h2>
            <ul className="divide-y divide-rule-soft rounded-lg border border-rule-soft bg-surface-raised shadow-sm">
              {page.events.map((event) => (
                <EventRow
                  key={event.id}
                  event={event}
                  entrantsHref={entrantsHref === null ? null : entrantsHref()}
                />
              ))}
            </ul>
          </div>
        ) : null}
        {active === 'entrants' ? (
          <>
            <h2 className="sr-only">Entrants</h2>
            {page.entrants.length > 0 ? (
              <EntrantsList slug={slug} entrants={page.entrants} />
            ) : (
              // Published and empty is a real state, said plainly: the
              // desk has confirmed nobody yet.
              <p className="text-muted-foreground">No confirmed entries yet.</p>
            )}
          </>
        ) : null}
        {active === 'draws' && loaderData.draws ? (
          <>
            <h2 className="sr-only">Draws</h2>
            <DrawsPanel slug={slug} draws={loaderData.draws} />
          </>
        ) : null}
        {active === 'seeds' && loaderData.seeds ? (
          <>
            <h2 className="sr-only">Seeded entries</h2>
            <SeedsPanel seeds={loaderData.seeds} />
          </>
        ) : null}
        {active === 'winners' && loaderData.winners ? (
          <>
            <h2 className="sr-only">Winners</h2>
            <WinnersPanel winners={loaderData.winners} />
          </>
        ) : null}
      </main>
    </PlayShell>
  );
}

/** Reads the status and nothing else, so no upstream prose or topology can
 * reach a public page. The 404 copy is the SP-P6-1 posture, carried over;
 * what changed in E1 is the page around it — this is the document a mistyped
 * poster URL lands on, so it wears the shell like everything else. Both
 * branches hand `MessagePage` fixed copy, so the uniform 404 is unaffected. */
export function ErrorBoundary() {
  const error = useRouteError();

  if (isRouteErrorResponse(error) && error.status === 404) {
    return (
      <MessagePage
        heading="This entry page is not available"
        body="Check the link, or ask the organizer for the current one."
      />
    );
  }

  return (
    <MessagePage heading="Something went wrong" body="Please try again in a moment." />
  );
}

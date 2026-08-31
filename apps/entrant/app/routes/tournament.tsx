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

import { EventRow } from '../components/EventRow';
import { PersonRef } from '../components/PersonRef';
import { PersonGroup } from '../components/PersonGroup';
import { EmptyState } from '../components/EmptyState';
import { HeroHeader } from '../components/HeroHeader';
import { MessagePage } from '../components/MessagePage';
import { PlayShell } from '../components/PlayShell';
import { PlayersList } from '../components/PlayersList';
import { SectionCard } from '../components/SectionCard';
import { TabBar } from '../components/TabBar';
import { TimelineCard } from '../components/TimelineCard';
import { ApiError, apiGet } from '../lib/apiFetch.server';
import type {
  DrawsIndexDTO,
  HonorDTO,
  PlayersDTO,
  SeedsDTO,
  WinnersDTO,
} from '../lib/draws.types';
import {
  entryCountLabel,
  eventCodeLabel,
  eventDisciplineLabel,
  kindLabel,
} from '../lib/draws.types';
import type { EntryPageDTO, ReserveRowDTO } from '../lib/entryPage.types';
import { dateOfIso, formatDateLong } from '../lib/format';
import {
  activeTab,
  chipState,
  ctaState,
  timelineModel,
  tournamentPhase,
  visibleTabs,
  type Tab,
} from '../lib/phase';
import type { Route } from './+types/tournament';
import { CARD } from '../lib/ui';

export interface TournamentLoaderData {
  page: EntryPageDTO;
  tabs: Tab[];
  active: Tab;
  /** SSR render instant, ms — `now` is a parameter everywhere below. */
  nowMs: number;
  /** Present only when the matching tab is active — one extra public read
   * per document, never a fan-out (SP-P7 §3.4–3.6). */
  draws?: DrawsIndexDTO;
  players?: PlayersDTO;
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
  if (active === 'players') {
    // One server-side projection merges confirmed entrants and published draw
    // roster rows. This keeps the public directory complete before and after
    // draws are released without maintaining a second client-side roster.
    payload.players = await apiGet<PlayersDTO>(`${base}/players`);
  } else if (active === 'draws') {
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

  const { tournament, org, venue, page, events, publication } = data.page;
  const titleSuffix = events.some((event) => event.isOpen)
    ? 'Enter now'
    : publication.results
      ? 'Results'
      : 'Tournament';
  const title = tournament.name ? `${tournament.name} · ${titleSuffix}` : titleSuffix;
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
  const tournamentView = page.tournament as EntryPageDTO['tournament'] & { timeZone?: string | null };
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
      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_18rem]">
        {page.page.introText ? (
          <p className="max-w-prose text-base leading-7 text-foreground">{page.page.introText}</p>
        ) : <p className="max-w-prose text-base leading-7 text-muted-foreground">Tournament information, events, and published results from the organizer.</p>}
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-lg border border-rule-soft bg-surface-raised p-4 text-sm">
          <div><dt className="text-xs text-muted-foreground">Events</dt><dd className="mt-0.5 font-semibold tabular-nums">{page.events.length}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Players entered</dt><dd className="mt-0.5 font-semibold tabular-nums">{page.events.reduce((total, event) => total + event.entryCount, 0)}</dd></div>
          {tournamentView.timeZone ? <div className="col-span-2"><dt className="text-xs text-muted-foreground">Tournament time</dt><dd className="mt-0.5 font-medium">{tournamentView.timeZone}</dd></div> : null}
        </dl>
      </div>

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

function drawGlyph(kind: string): string {
  if (kind === 'rr' || kind === 'swiss') return '⊞';
  if (kind === 'monrad') return '≋';
  return '⌘';
}

function DrawsPanel({ slug, draws }: { slug: string; draws: DrawsIndexDTO }) {
  if (draws.draws.length === 0) {
    // F-DM-33: an empty draws list has two unrelated causes, and until the
    // API carried `divisions` this tier could not tell them apart. A meet is
    // not a bracket waiting to be drawn, so it does not get told to wait.
    if (draws.divisions?.length) {
      return <EmptyState heading="This tournament is played as a meet" body={`Played as a meet, not by draws. Results are organized by division: ${draws.divisions.join(', ')}.`} />;
    }
    return <EmptyState heading="Draws are not published yet" body="No draws yet. The organizer will publish the draw when entries and seeding are complete. Check the tournament overview for the publication date." />;
  }
  return (
    <ul className="grid gap-4 sm:grid-cols-2">
      {draws.draws.map((card) => (
        <li key={card.drawKey} id={`draw-${eventCodeLabel(card.eventCode)}`}>
          <article className="group relative rounded-lg border border-rule-soft bg-surface-raised p-5 shadow-sm transition-colors hover:border-action-primary focus-within:ring-2 focus-within:ring-accent">
            <a
              href={`/e/${encodeURIComponent(slug)}/draws/${encodeURIComponent(card.drawKey)}`}
              aria-label={`${eventDisciplineLabel(card.discipline)} draw`}
              className="absolute inset-0 z-0 rounded-lg focus-visible:outline-none"
            />
            <div className="pointer-events-none relative z-10">
            <p className="flex items-center gap-2 font-display text-base font-bold tracking-tight text-foreground">
              <span aria-hidden className="text-accent">{drawGlyph(card.kind)}</span>
              {eventDisciplineLabel(card.discipline)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {[
                eventCodeLabel(card.eventCode),
                kindLabel(card.kind),
                entryCountLabel(card.eventCode, card.size),
                `${card.roundCount} ${card.roundCount === 1 ? 'round' : 'rounds'}`,
                card.hasConsolation ? 'with consolation' : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
            <div className="mt-3 border-t border-rule-soft pt-3 text-sm">
              {card.champions.length ? (
                <><span className="me-2 text-xs text-muted-foreground">Champion</span><PersonGroup slug={slug} persons={card.champions} state="winner" className="pointer-events-auto" /></>
              ) : card.finalists.length ? (
                <span className="text-muted-foreground">
                  {card.finalists.map((finalist, index) => (
                    <span key={index}>
                      {index > 0 ? <span className="mx-2" aria-hidden>vs</span> : null}
                      <PersonGroup slug={slug} persons={finalist.persons} className="pointer-events-auto" />
                    </span>
                  ))}
                </span>
              ) : card.remainingMatchCount !== null ? (
                <span className="text-muted-foreground">
                  {card.remainingMatchCount} {card.remainingMatchCount === 1 ? 'match remains' : 'matches remain'}
                </span>
              ) : (
                <span className="text-muted-foreground">{draws.resultsPublished ? 'Final still to be decided' : 'Results not published'}</span>
              )}
            </div>
            </div>
          </article>
        </li>
      ))}
    </ul>
  );
}

function SeedsPanel({ seeds, slug }: { seeds: SeedsDTO; slug: string }) {
  if (seeds.events.length === 0) {
    return <EmptyState heading={seeds.published ? 'Seeds are not published' : 'Seeds are not available yet'} body={seeds.published ? 'The organizer has not published seeded entries for this tournament.' : 'Seeded entries appear here after the draw is published.'} />;
  }
  return (
    <div className="grid gap-6">
      {seeds.events.map((event) => (
        <section
          key={event.eventCode}
          className={CARD}
        >
          <h3 className="text-base font-semibold text-foreground">
            {eventDisciplineLabel(event.discipline)}
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              {eventCodeLabel(event.eventCode)}
            </span>
          </h3>
          <ol className="mt-3 grid gap-2">
            {event.seeds.map((line) => (
              <li key={line.seed} className="flex items-baseline gap-3 text-sm">
                <span className="w-8 shrink-0 tabular-nums font-semibold text-foreground">
                  {`[${line.seed}]`}
                </span>
                <span className="min-w-0">
                  <PersonGroup slug={slug} persons={line.persons} />
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

function quietHonor(slug: string, label: string, honor: HonorDTO | null, keySuffix = '') {
  if (!honor) return null;
  return (
    <div key={`${label}-${keySuffix}`}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-sm font-medium text-foreground">
        <PersonGroup slug={slug} persons={honor.persons} />
        {honor.club ? <span className="ms-2 text-xs font-normal text-muted-foreground">{honor.club}</span> : null}
      </dd>
    </div>
  );
}

function WinnersPanel({ winners, slug }: { winners: WinnersDTO; slug: string }) {
  if (winners.events.length === 0) {
    return <EmptyState heading={winners.published ? 'Results are not available' : 'Results are not published yet'} body={winners.published ? 'No event results have been recorded for this tournament.' : 'Winners appear here after the organizer publishes results.'} />;
  }
  return (
    <div className="grid gap-4">
      {winners.events.map((event) => (
        <section
          key={event.eventCode}
          className={CARD}
        >
          <h3 className="text-sm font-semibold text-foreground">
            {eventDisciplineLabel(event.discipline)}
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              {eventCodeLabel(event.eventCode)}
            </span>
          </h3>
          <div className="mt-5">
            {event.decided ? (
              <>
                <div className="pb-5">
                  <p className="text-xs text-muted-foreground">Champion</p>
                  <p className="mt-1 font-display text-3xl font-bold tracking-tight text-foreground">
                    {event.winner ? <PersonGroup slug={slug} persons={event.winner.persons} state="winner" /> : null}
                  </p>
                  {event.finalScore?.length ? (
                    <p className="mt-2 font-mono text-sm tabular-nums text-muted-foreground">
                      {event.finalScore.map((game) => game.join('–')).join('  ')}
                    </p>
                  ) : null}
                </div>
                <dl className="grid gap-4 border-t border-rule-soft pt-4 sm:grid-cols-2">
                  {quietHonor(slug, 'Runner-up', event.runnerUp)}
                  {event.semifinalists.map((semi, index) => quietHonor(slug, 'Semifinalist', semi, String(index)))}
                </dl>
              </>
            ) : (
              <div>
                <p className="text-sm text-muted-foreground">The final is still to be decided.</p>
                {event.finalists.length ? (
                  <p className="mt-3 text-sm font-medium text-foreground">
                    {event.finalists.map((finalist, index) => (
                      <span key={index}>
                        {index > 0 ? <span className="mx-2 text-muted-foreground" aria-hidden>vs</span> : null}
                        <PersonGroup slug={slug} persons={finalist.persons} />
                      </span>
                    ))}
                  </p>
                ) : null}
              </div>
            )}
          </div>
        </section>
      ))}
    </div>
  );
}

export default function Tournament({ loaderData }: Route.ComponentProps) {
  const { page, tabs, active, nowMs } = loaderData;
  const tournamentView = page.tournament as EntryPageDTO['tournament'] & { phase?: string | null; status?: string | null; timeZone?: string | null };
  const now = new Date(nowMs);
  const slug = page.page.slug;
  const chip = chipState(page.events, now);
  const cta = ctaState(page.events, slug);
  const phase = tournamentPhase({
    phase: tournamentView.phase,
    status: tournamentView.status,
    publication: page.publication,
    events: page.events,
  });
  const hasExplicitPhase = Boolean(tournamentView.phase || tournamentView.status);
  const phaseAction = phase === 'entries_open'
    ? { label: 'Enter this tournament', href: `/e/${encodeURIComponent(slug)}/enter` }
    : phase === 'live' && tabs.includes('draws')
      ? { label: 'Follow live matches', href: `/e/${encodeURIComponent(slug)}/schedule` }
      : phase === 'draws_published' && tabs.includes('draws')
        ? { label: 'View draws', href: tabHref(slug, 'draws') }
        : (phase === 'complete' || phase === 'archived') && tabs.includes('winners')
          ? { label: 'View results', href: tabHref(slug, 'winners') }
          : phase === 'entries_closed' && tabs.includes('players')
            ? { label: 'View entrants', href: tabHref(slug, 'players') }
            : phase === 'announced'
              ? { label: 'View tournament information', href: `/e/${encodeURIComponent(slug)}` }
              : null;
  const metaLine = [
    formatDateLong(page.tournament.date),
    [page.venue?.name, page.venue?.address].filter(Boolean).join(', '),
  ]
    .filter((part) => part !== '')
    .join(' · ');
  // The by-event anchors died with the by-event grouping (SP-P7 §3.2): the
  // list is alphabetical now, so an event's "N entered" links to the tab.
  const entrantsHref = tabs.includes('players')
    ? () => tabHref(slug, 'players')
    : null;

  return (
    <PlayShell>
      <HeroHeader
        orgName={page.org?.name ?? null}
        title={page.tournament.name ?? slug}
        metaLine={metaLine}
        chip={chip}
        cta={cta}
        phase={hasExplicitPhase ? phase : undefined}
        phaseAction={hasExplicitPhase ? phaseAction : null}
        freshness={page.page.regulationsUpdatedAt ? `Information updated ${formatDateLong(dateOfIso(page.page.regulationsUpdatedAt))}` : null}
      >
        <TabBar
          tabs={tabs}
          active={active}
          hrefFor={(tab) => tabHref(slug, tab)}
          scheduleHref={`/e/${encodeURIComponent(slug)}/schedule`}
        />
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
        {active === 'players' && loaderData.players ? (
          <>
            <PlayersList
              slug={slug}
              roster={loaderData.players}
              drawsPublished={page.publication.draws}
            />
            <ReserveList reserves={page.reserves ?? []} slug={page.page.slug} />
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
            <SeedsPanel slug={slug} seeds={loaderData.seeds} />
          </>
        ) : null}
        {active === 'winners' && loaderData.winners ? (
          <>
            <h2 className="sr-only">Winners</h2>
            <WinnersPanel slug={slug} winners={loaderData.winners} />
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

/**
 * The post-close reserve list, grouped by event (E4).
 *
 * **The number rendered is the server's `position`, never the index in this
 * array.** An entrant who opted out of publication still holds their place,
 * so a printed list can legitimately read 1, 3, 4 — and a component that
 * numbered its own rows would tell the person at 3 that they are second.
 * That is a subtler and worse error than a gap in the numbering, which at
 * least reads as what it is.
 *
 * Renders nothing at all when the list is empty. Before entries close the
 * server sends none, and "no reserves" is not a fact worth a heading: it is
 * the ordinary state of most events.
 */
function ReserveList({ reserves, slug }: { reserves: ReserveRowDTO[]; slug: string }) {
  if (reserves.length === 0) return null;

  const byEvent = new Map<string, ReserveRowDTO[]>();
  for (const row of reserves) {
    const list = byEvent.get(row.eventCode) ?? [];
    list.push(row);
    byEvent.set(row.eventCode, list);
  }

  return (
    <section className="mt-8 grid gap-4">
      <div className="grid gap-1">
        <h3 className="font-display text-base font-bold tracking-tight text-foreground">
          Reserves
        </h3>
        <p className="text-sm text-muted-foreground">
          Entries have closed. If a place opens, the organizer offers it in
          this order.
        </p>
      </div>
      {[...byEvent.entries()].map(([code, rows]) => (
        <div key={code} className="grid gap-1.5">
          <h4 className="text-xs font-bold uppercase tracking-[0.06em] text-muted-foreground">
            {eventCodeLabel(code)}
          </h4>
          <ol className="grid gap-1">
            {rows.map((row) => (
              <li
                key={`${code}-${row.position}-${row.person.identity?.id ?? row.position}`}
                className="flex items-baseline gap-2 text-sm text-foreground"
              >
                <span className="w-6 shrink-0 tabular-nums text-muted-foreground">
                  {row.position}
                </span>
                <PersonRef slug={slug} identity={row.person.identity} state={row.person.resolution} label={row.person.label} />
                {row.club ? (
                  <span className="text-xs text-muted-foreground">{row.club}</span>
                ) : null}
              </li>
            ))}
          </ol>
        </div>
      ))}
    </section>
  );
}

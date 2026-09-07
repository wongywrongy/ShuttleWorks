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
import { HeroHeader } from '../components/HeroHeader';
import { MessagePage } from '../components/MessagePage';
import { PlayShell } from '../components/PlayShell';
import { PlayersList } from '../components/PlayersList';
import { SectionCard, SectionRow } from '../components/SectionCard';
import { TabBar } from '../components/TabBar';
import { ApiError, apiGet } from '../lib/apiFetch.server';
import type { DrawCardDTO, DrawsIndexDTO, PlayersDTO } from '../lib/draws.types';
import { eventCodeLabel } from '../lib/draws.types';
import type { EntryPageDTO, ReserveRowDTO } from '../lib/entryPage.types';
import { capChipCountdown, dateOfIso, formatDateLong, formatMomentInZone } from '../lib/format';
import {
  activeTab,
  chipState,
  ctaState,
  nearestCloseAt,
  phaseLabel,
  timelineModel,
  tournamentPhase,
  visibleTabs,
  type Tab,
} from '../lib/phase';
import type { Route } from './+types/tournament';
import { LIST_CARD, LIST_CARD_ROW } from '../lib/ui';

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
  } else if (active === 'draws' && page.publication?.draws) {
    // The Draws panel is the event list from day one; the draw index joins
    // it only once the organizer has published draws (ADR 0028). Seeds ride
    // the draw page itself and champions ride the index, so the old `/seeds`
    // and `/winners` reads are gone.
    payload.draws = await apiGet<DrawsIndexDTO>(`${base}/draws`);
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
  if (org?.name && org.name !== 'Local Workspace') {
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
  const updated = dateOfIso(page.page.regulationsUpdatedAt);
  const entriesOpen = page.events.some((event) => event.isOpen);
  const drawsHref = tabHref(slug, 'draws');
  // V3-PE03.2: the internal registration aggregate answered no entry
  // question once entries closed — a 253-player tournament with five
  // 32-entry draws still read "Event registrations 0" here, because that
  // count and the published draw rosters are two different, unrelated
  // sources. Show it only while it IS an entry question ("how many have
  // entered so far"); omit the row entirely otherwise rather than print an
  // unexplained zero.
  const registeredSoFar = page.events.reduce(
    (total, event) => total + (event.registrationCount ?? event.entryCount),
    0,
  );

  return (
    // v3-consolidated work package 26b: `min-w-0` on this div and the two
    // below. Each is a CSS Grid container with NO `grid-template-columns`
    // below `md:` (it only gets one at `md:` — the intro/dates pair and
    // the key-dates/venue pair are both a single implicit column below
    // that breakpoint), and an implicit grid item defaults to
    // `min-width: auto`, sizing the shared column to its widest child's
    // min-content. A long organizer-authored intro paragraph, and a long
    // venue address line, both measurably forced this page past a
    // 320/390px viewport (plan §6 "Responsive/signage") the same way one
    // calendar row did on Discovery, fixed alongside this in the same
    // package (`SeasonCalendar.tsx`/`discovery.tsx`) — see those files'
    // comments for the full mechanism, verified against a real running
    // page rather than reasoned about.
    <div className="grid min-w-0 gap-4">
      <h2 className="sr-only">Overview</h2>
      <div className="grid min-w-0 gap-4 md:grid-cols-[minmax(0,1fr)_18rem] md:items-start">
        {page.page.introText ? (
          <p className="max-w-prose text-pretty text-base leading-7 text-foreground">{page.page.introText}</p>
        ) : <p className="max-w-prose text-pretty text-base leading-7 text-muted-foreground">Tournament information, events, and published results from the organizer.</p>}
        <dl className={`grid grid-cols-2 gap-x-4 gap-y-3 ${LIST_CARD} p-4 text-sm`}>
          <div><dt className="text-xs text-muted-foreground">Events</dt><dd className="mt-0.5 font-semibold tabular-nums">{page.events.length}</dd></div>
          {entriesOpen && registeredSoFar > 0 ? (
            <div><dt className="text-xs text-muted-foreground">Entered so far</dt><dd className="mt-0.5 font-semibold tabular-nums">{registeredSoFar}</dd></div>
          ) : null}
          {tournamentView.timeZone ? <div className="col-span-2"><dt className="text-xs text-muted-foreground">Tournament time</dt><dd className="mt-0.5 font-medium">{tournamentView.timeZone}</dd></div> : null}
        </dl>
      </div>

      <div className="grid min-w-0 items-start gap-4 md:grid-cols-2">
        {/* Key dates as plain rows (ADR 0028): the model arrives pre-computed
            (`timelineModel`) — absent moments are omitted, no "TBD"
            placeholders (rule 4) — and per-event disagreement renders as a
            variance line pointing at the Draws panel rather than a false
            single moment. */}
        {moments.length > 0 ? (
          <SectionCard title="Key dates" labelledBy="ov-dates">
            {moments.map((moment) => (
              <SectionRow key={moment.label} label={moment.label}>
                {moment.variance === 'per-event' ? (
                  <>
                    Varies by event ·{' '}
                    <a href={drawsHref} className="text-accent underline-offset-4 hover:underline">
                      see Draws
                    </a>
                  </>
                ) : moment.label === 'Tournament' ? (
                  formatDateLong(moment.at)
                ) : (
                  formatMomentInZone(moment.at!, tournamentView.timeZone)
                )}
              </SectionRow>
            ))}
          </SectionCard>
        ) : null}

        {page.venue?.name || page.venue?.address ? (
          <SectionCard title="Venue" labelledBy="ov-venue">
            {page.venue.name ? <SectionRow label="Hall">{page.venue.name}</SectionRow> : null}
            {page.venue.address ? <SectionRow label="Address">{page.venue.address}</SectionRow> : null}
          </SectionCard>
        ) : null}

        <SectionCard title="Fees & payment" labelledBy="ov-fees">
          <SectionRow label="Pricing">
            {entriesOpen
              ? 'Quoted on the entry form before you submit'
              : 'Fees are not published for this closed tournament'}
            {/* The link exists only while an event is open — a closed
                tournament must carry no path into the entry form anywhere
                on the page (the hero's own rule, held by its tests). */}
            {entriesOpen ? (
              <>
                {' · '}
                <a
                  href={`/e/${encodeURIComponent(slug)}/enter`}
                  className="text-accent underline-offset-4 hover:underline"
                >
                  Go to entry form
                </a>
              </>
            ) : null}
          </SectionRow>
        </SectionCard>

        {/* The regulations DOCUMENT ROW (§3.7): the text itself moved to a
            routed, deep-linkable reader — multi-page rules do not belong
            inline on an overview. */}
        {regulations ? (
          <SectionCard title="Documents" labelledBy="ov-docs">
            <div className={LIST_CARD_ROW}>
              <div className="min-w-0">
                <p className="font-medium text-foreground">Tournament regulations</p>
                <p className="text-xs text-muted-foreground">
                  {`Version ${page.page.regulationsVersion}`}
                  {updated ? ` · updated ${formatDateLong(updated)}` : ''}
                </p>
              </div>
              <a
                href={`/e/${encodeURIComponent(slug)}/regulations`}
                className="shrink-0 font-medium text-accent underline-offset-4 hover:underline"
              >
                View
              </a>
            </div>
          </SectionCard>
        ) : null}
      </div>
      {updated ? (
        <p className="text-xs text-muted-foreground">{`Information updated ${formatDateLong(updated)}`}</p>
      ) : null}
    </div>
  );
}

// ---- The Draws panel (ADR 0028) --------------------------------------------

/**
 * Every event as one row, joined to its published draw card by event code.
 * Before draws exist this is the entry state per event (Open · Closed · N
 * entered); afterwards each row gains the draw's format facts, a Draw button
 * and, once decided, the champion. One document, at most one extra read.
 */
function DrawsPanel({
  page,
  draws,
  entrantsHref,
}: {
  page: EntryPageDTO;
  draws: DrawsIndexDTO | undefined;
  entrantsHref: string | null;
}) {
  const slug = page.page.slug;
  const cards = new Map<string, DrawCardDTO>();
  for (const card of draws?.draws ?? []) cards.set(eventCodeLabel(card.eventCode), card);
  const columns = 'sm:grid-cols-[minmax(0,1fr)_7rem_6rem_auto]';
  return (
    <div className="grid gap-4">
      <h2 className="sr-only">Draws</h2>
      <div className={LIST_CARD}>
        <div aria-hidden className={`hidden gap-4 px-4 pb-2 pt-3 text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground sm:grid ${columns}`}>
          <span>Event</span>
          {/* V3-PE04.2: one column, one unit — "N players"/"N pairs" — not a
              combined "registrations / draw participants" header describing
              two sources at once. */}
          <span>Entered</span>
          <span>State</span>
          <span />
        </div>
        <ul className="divide-y divide-rule-soft border-t border-rule-soft">
          {page.events.map((event) => {
            const card = cards.get(eventCodeLabel(event.code)) ?? null;
            return (
              <EventRow
                key={event.id}
                event={event}
                entrantsHref={entrantsHref}
                draw={card}
                drawHref={card ? `/e/${encodeURIComponent(slug)}/draws/${encodeURIComponent(card.drawKey)}` : null}
                slug={slug}
              />
            );
          })}
        </ul>
      </div>
      {/* F-DM-33: an empty draws list has two unrelated causes. A meet is
          not a bracket waiting to be drawn, so it does not get told to wait. */}
      {draws && draws.draws.length === 0 ? (
        draws.divisions?.length ? (
          <p className="text-sm text-muted-foreground">{`Played as a meet, not by draws. Results are organized by division: ${draws.divisions.join(', ')}.`}</p>
        ) : (
          <p className="text-sm text-muted-foreground">No draws yet. The organizer will publish the draw when entries and seeding are complete.</p>
        )
      ) : null}
    </div>
  );
}

export default function Tournament({ loaderData }: Route.ComponentProps) {
  const { page, tabs, active, nowMs } = loaderData;
  const tournamentView = page.tournament as EntryPageDTO['tournament'] & { phase?: string | null; status?: string | null; timeZone?: string | null };
  const now = new Date(nowMs);
  const slug = page.page.slug;
  // V3-26-5: cap the relative countdown at an absolute date past the
  // threshold (the hero's status line).
  const chip = capChipCountdown(
    chipState(page.events, now),
    nearestCloseAt(page.events),
    tournamentView.timeZone ?? 'UTC',
  );
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
        : (phase === 'complete' || phase === 'archived') && tabs.includes('draws')
          ? { label: 'View results', href: tabHref(slug, 'draws') }
          : phase === 'entries_closed' && tabs.includes('players')
            ? { label: 'View entrants', href: tabHref(slug, 'players') }
            : phase === 'announced'
              ? { label: 'View tournament information', href: `/e/${encodeURIComponent(slug)}` }
              : null;
  // Date, timezone, and venue are each presented once in the overview cards.
  // Keeping them out of the hero prevents the same facts being repeated in
  // two competing reading sequences (PE03.3).
  const metaLine = '';
  // V3-PE03.3: once the server states an explicit phase, the subtitle leads
  // with it — "Live now", not "Entries closed" under a "Follow live
  // matches" button. Entry closure is still available; it moved to the Key
  // dates section (`timelineModel`'s "Entries close" row) rather than being
  // the first line a spectator reads.
  const statusOverride = hasExplicitPhase
    ? { label: phaseLabel(phase), live: phase === 'entries_open' || phase === 'live' }
    : null;
  // The by-event anchors died with the by-event grouping (SP-P7 §3.2): the
  // list is alphabetical now, so an event's "N entered" links to the tab.
  const entrantsHref = tabs.includes('players')
    ? () => tabHref(slug, 'players')
    : null;

  return (
    <PlayShell>
      <HeroHeader
        orgName={page.org?.name === 'Local Workspace' ? null : page.org?.name ?? null}
        title={page.tournament.name ?? slug}
        metaLine={metaLine}
        chip={chip}
        cta={cta}
        phaseAction={hasExplicitPhase ? phaseAction : null}
        statusOverride={statusOverride}
      >
        <TabBar
          tabs={tabs}
          active={active}
          hrefFor={(tab) => tabHref(slug, tab)}
          scheduleHref={`/e/${encodeURIComponent(slug)}/schedule`}
        />
      </HeroHeader>

      <main className="mx-auto w-full max-w-6xl px-4 py-8 md:py-8">
        {active === 'overview' ? <OverviewPanel page={page} now={now} /> : null}
        {active === 'draws' ? (
          <DrawsPanel page={page} draws={loaderData.draws} entrantsHref={entrantsHref === null ? null : entrantsHref()} />
        ) : null}
        {active === 'players' && loaderData.players ? (
          <>
            {/* v3-consolidated work package 26b: matches the sr-only `h2`
                the Overview/Draws panels already carry — `EntrantsList`'s
                A-Z group headers are `h3`, and with no `h2` here they
                skipped a level under the page's one `<h1>` (plan §6
                "Accessibility"). */}
            <h2 className="sr-only">Players</h2>
            <PlayersList
              slug={slug}
              roster={loaderData.players}
              drawsPublished={page.publication.draws}
            />
            <ReserveList reserves={page.reserves ?? []} slug={page.page.slug} />
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

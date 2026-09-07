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
 * `activeTab` validates `?tab` (anything unknown or hidden is an honest 404),
 * `chipState`/`ctaState` decide the hero. Tabs are links with
 * `aria-current`, deliberately not an ARIA tablist (Z6) — each switch is a
 * full, KB-scale document load.
 */
import { isRouteErrorResponse, redirect, useRouteError } from 'react-router';

import { EVENT_ROW_COLUMNS, EventRow } from '../components/EventRow';
import { PersonRef } from '../components/PersonRef';
import { MessagePage } from '../components/MessagePage';
import { PlayShell } from '../components/PlayShell';
import { PlayersList } from '../components/PlayersList';
import { SectionCard, SectionProse, SectionRow } from '../components/SectionCard';
import { TournamentFrame } from '../components/TournamentFrame';
import { ApiError, apiGet } from '../lib/apiFetch.server';
import type { DrawCardDTO, DrawsIndexDTO, PlayersDTO } from '../lib/draws.types';
import { eventCodeLabel } from '../lib/draws.types';
import type { EntryPageDTO, ReserveRowDTO } from '../lib/entryPage.types';
import { dateOfIso, formatDateLong, formatDayMonthTimeInZone } from '../lib/format';
import {
  activeTab,
  legacyDrawsTab,
  timelineModel,
  visibleTabs,
  type Tab,
} from '../lib/phase';
import type { Route } from './+types/tournament';
import { ACTION_LINK, LIST_CARD, LIST_CARD_ROW } from '../lib/ui';

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
  /** The Players directory's `?q=` — filtered on the server (P7), so the
   * search works with no script and the URL is shareable. */
  playerQuery?: string;
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
  const requested = new URL(request.url).searchParams.get('tab');
  // Retired section names (`events`, `seeds`, `winners`) are aliases of this
  // page's ONE Draws surface, not sections of their own: send the reader to
  // the canonical URL rather than 404ing a link that is still in circulation
  // (public-visual-fixes P6). A workspace with no Draws tab has nowhere
  // honest to send them, so it keeps the uniform 404 below.
  const alias = legacyDrawsTab(requested);
  if (alias !== null && tabs.includes(alias)) {
    // Root-relative and WITHOUT the basename: React Router prefixes
    // `config.basename` (`/e/`) onto a loader redirect itself, so passing
    // `/e/{slug}` here lands on `/e/e/{slug}` (`discovery.tsx` carries the
    // same note over the same trap).
    throw redirect(`/${encodeURIComponent(slug)}?tab=${alias}`, 302);
  }
  const active = activeTab(requested, tabs);
  if (active === null) throw notFound();
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
    payload.playerQuery = (new URL(request.url).searchParams.get('q') ?? '').trim();
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
  const slug = page.page.slug;
  // `?? 'UTC'`: a projection without a declared zone must still render a
  // real instant, and never in the SSR node's own local zone (P7).
  const timeZone = page.tournament.timeZone ?? 'UTC';
  const moments = timelineModel(page.events, page.tournament.date, now);
  const regulations = page.page.regulationsText;
  const updated = dateOfIso(page.page.regulationsUpdatedAt);
  const entriesOpen = page.events.some((event) => event.isOpen);
  const drawsHref = tabHref(slug, 'draws');

  return (
    // public-visual-fixes P6: two columns, and what is in each is now a
    // decision rather than a flow. The LEFT column is the organizer's own
    // words — an About card that spans it, because a description is the one
    // thing on this page nobody else can write. The RIGHT column is the
    // short facts: the dates that are still a question, where to play, and
    // (only while it is one) where the price is quoted.
    //
    // What LEFT the page: the small "Events / Entered so far" facts card —
    // the Draws tab lists the events and their entrant counts one click
    // away, in the units each event actually uses, so the aggregate here
    // was a second, coarser answer to a question already answered better.
    //
    // `min-w-0` on every grid container: an implicit grid item defaults to
    // `min-width: auto` and sizes its column to its widest child's
    // min-content, so one long address line or unbroken document version
    // measurably forced this page past a 320/390px viewport (v3 package
    // 26b; see `SeasonCalendar.tsx` for the full mechanism).
    <div className="grid min-w-0 items-start gap-4 md:grid-cols-[minmax(0,1fr)_20rem]">
      <h2 className="sr-only">Overview</h2>
      <div className="grid min-w-0 gap-4">
        <SectionCard title="About" labelledBy="ov-about">
          <SectionProse>
            {page.page.introText ??
              'Tournament information, events, and published results from the organizer.'}
          </SectionProse>
        </SectionCard>

        {/* The regulations DOCUMENT ROW (§3.7): the text itself moved to a
            routed, deep-linkable reader — multi-page rules do not belong
            inline on an overview. No document, no card: an empty Documents
            section states nothing (P6, "no negative filler rows"). */}
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
                className={`shrink-0 ${ACTION_LINK}`}
              >
                View
              </a>
            </div>
          </SectionCard>
        ) : null}
      </div>

      <div className="grid min-w-0 items-start gap-4">
        {/* Key dates as plain rows (ADR 0028): the model arrives pre-computed
            (`timelineModel`) — elapsed and absent moments are both omitted,
            no "TBD" placeholders (rule 4) — and per-event disagreement
            renders as a variance line pointing at the Draws panel rather
            than a false single moment. */}
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
                ) : moment.kind === 'play' ? (
                  formatDateLong(moment.at)
                ) : (
                  // Venue-local, converted (contract §7.1) — never a UTC
                  // instant with its zone spelling trimmed off, and never an
                  // offset in public prose: the hero already says all times
                  // are local to the venue.
                  //
                  // P7: a DEADLINE is stated to the minute ("Closes 1 Aug,
                  // 23:59"). It is the one row here a reader can be late
                  // for, and a day alone silently rounds it — usually
                  // forward, by the better part of a day.
                  [moment.status, formatDayMonthTimeInZone(moment.at!, timeZone)]
                    .filter(Boolean)
                    .join(' ')
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

        {/* SP-P7 §3.7: fees left the overview entirely — pricing is quoted on
            the entry form and restated on the receipt. What remains is a
            pointer, and only while there is somewhere to point: a closed
            tournament used to get a card whose whole content was "Fees are
            not published", which is filler, not a fee. */}
        {entriesOpen ? (
          <SectionCard title="Fees & payment" labelledBy="ov-fees">
            <SectionRow label="Pricing">
              Quoted on the entry form before you submit
              {' · '}
              <a
                href={`/e/${encodeURIComponent(slug)}/enter`}
                className="text-accent underline-offset-4 hover:underline"
              >
                Go to entry form
              </a>
            </SectionRow>
          </SectionCard>
        ) : null}

        {updated ? (
          <p className="text-xs text-muted-foreground">{`Information updated ${formatDateLong(updated)}`}</p>
        ) : null}
      </div>
    </div>
  );
}

// ---- The Draws panel (ADR 0028) --------------------------------------------

/**
 * Every event as one row, joined to its published draw card by event code.
 *
 * public-visual-fixes P6 reduced the row to four cells — event · entrants ·
 * progress · Open — and made the whole row one link into the draw. Two
 * consequences live HERE rather than in the row: the "STATE" column heading
 * is gone (a heading over a button column named nothing a reader could act
 * on), and `showFormat` is decided across the whole index, because a format
 * tag distinguishes rows only when the formats actually differ.
 */
function DrawsPanel({
  page,
  draws,
}: {
  page: EntryPageDTO;
  draws: DrawsIndexDTO | undefined;
}) {
  const slug = page.page.slug;
  const cards = new Map<string, DrawCardDTO>();
  for (const card of draws?.draws ?? []) cards.set(eventCodeLabel(card.eventCode), card);
  const showFormat = new Set((draws?.draws ?? []).map((card) => card.kind)).size > 1;
  return (
    <div className="grid gap-4">
      <h2 className="sr-only">Draws</h2>
      <div className={LIST_CARD}>
        <div aria-hidden className={`hidden gap-3 px-4 pb-2 pt-3 text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground sm:grid ${EVENT_ROW_COLUMNS}`}>
          <span>Event</span>
          {/* V3-PE04.2: one column, one unit — "N players"/"N pairs" — not a
              combined "registrations / draw participants" header describing
              two sources at once. */}
          <span>Entrants</span>
          <span>Progress</span>
          <span />
        </div>
        <ul className="divide-y divide-rule-soft border-t border-rule-soft">
          {page.events.map((event) => {
            const card = cards.get(eventCodeLabel(event.code)) ?? null;
            return (
              <EventRow
                key={event.id}
                event={event}
                draw={card}
                drawHref={card ? `/e/${encodeURIComponent(slug)}/draws/${encodeURIComponent(card.drawKey)}` : null}
                slug={slug}
                showFormat={showFormat}
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
  const { page, active, nowMs } = loaderData;
  const now = new Date(nowMs);
  const slug = page.page.slug;

  return (
    <PlayShell>
      {/* Contract §11: hero, tabs and breadcrumbs are the frame's, not this
          route's. Overview is the tournament itself, so its breadcrumb trail
          ends at the tournament name and the frame supplies no tail. */}
      <TournamentFrame page={page} nowMs={nowMs} active={active} />

      <main className="mx-auto w-full max-w-6xl px-4 py-6 md:py-8">
        {active === 'overview' ? <OverviewPanel page={page} now={now} /> : null}
        {active === 'draws' ? (
          <DrawsPanel page={page} draws={loaderData.draws} />
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
              query={loaderData.playerQuery ?? ''}
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

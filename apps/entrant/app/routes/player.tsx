/**
 * `/e/{slug}/players/{personKey}` — one person's profile (SP-P7 §3.3).
 *
 * Keyed by the opaque person id, never the name (R-P7c: two entrants who
 * share a name are two pages). The loader makes two public reads — the
 * page projection for the tournament's identity, then the player
 * projection — and inherits every gate from the API: unpublished entrants,
 * an unknown person, and a pending-only person all answer the same uniform
 * 404 upstream, so this file has one error path.
 *
 * **Profile v3 (public-ui-refinement P3, decision D3): the PLAYER is the
 * page's subject.** The full tournament hero used to sit above every
 * profile, so the biggest thing on a person's page was the tournament's
 * name (audit A03). It is replaced here by a compact context header
 * composed from the frame's own parts — the shared `Breadcrumbs`, the
 * tournament's name and date as a link back, and the frame's `TabBar` —
 * so navigation is unchanged and only the chrome shrinks. The frame
 * component itself is untouched; this route composes, it does not fork.
 *
 * The information order is D3's, top to bottom:
 *
 *   1. identity (name, club, tournament context)
 *   2. the match being played now, or the next one — event, partner,
 *      opponent, its own date and time, court
 *   3. participation in THIS tournament, each event linking into its own
 *      draw and into this person's path through it
 *   4. the remaining matches as ONE aligned list, each row naming ITS OWN
 *      day (audit A04 — they used to sit under the tournament's start
 *      date, so a card reading Wednesday hung under a Tuesday heading)
 *   5. the same human's OTHER published tournaments, bounded, with the
 *      long tail behind a native `<details>` disclosure
 *
 * **"Coming up" still renders above "Played"** (§3.3, binding).
 *
 * Two duplications are deliberately gone. The current tournament's round
 * steps are no longer listed as prose beside the match cards that state the
 * same results (A03); the cards ARE this tournament's record, and a round
 * step is rendered only where there are no cards — a history row for
 * another tournament — where it renders as a compact two-side result row
 * (the shared `MatchCard` node), each side's game scores beside that side
 * and doubles partners grouped, never an arrow-joined sentence. And the
 * current tournament is no longer repeated as a history row saying "Shown
 * above": the reader is standing on it.
 *
 * Cross-tournament rows are joined server-side (`_person_history`) on either
 * the verified entrant account that owns the row or, for an imported
 * draw-roster person, the import's declared identity — this file never
 * matches people by name and never mints a person key. Every link is built
 * by `personHref`, the one shared link-target resolver.
 */
import { isRouteErrorResponse, useRouteError } from 'react-router';

import { Breadcrumbs } from '../components/Breadcrumbs';
import { MatchCard } from '../components/MatchCard';
import { MatchRow } from '../components/MatchRow';
import { PersonRef } from '../components/PersonRef';
import { MessagePage } from '../components/MessagePage';
import { PlayShell } from '../components/PlayShell';
import { TabBar } from '../components/TabBar';
import { ApiError, apiGet } from '../lib/apiFetch.server';
import { demoNowMs } from '../lib/demoClock.server';
import type { EntryPageDTO } from '../lib/entryPage.types';
import { eventCodeLabel, roundShortLabel } from '../lib/draws.types';
import { formatCalendarDay, formatDateLong } from '../lib/format';
import type {
  PlayerDrawStepDTO,
  PlayerEventDTO,
  PlayerMatchDTO,
  PlayerPageDTO,
} from '../lib/player.types';
import type { PersonReferenceDTO } from '../lib/person.types';
import { ACTION_LINK, EYEBROW, LIST_CARD, PAGE_TITLE, TEXT_HELPER, TEXT_SECONDARY } from '../lib/ui';
import {
  frameTabs,
  sectionHref,
  sectionLabel,
  tournamentBase,
  type Crumb,
} from '../lib/tournamentFrame';
import { personHref, personRefModel } from '../../public/assets/person-ref.js';
import type { Route } from './+types/player';

export interface PlayerLoaderData {
  slug: string;
  tournamentName: string | null;
  tournamentDate: string | null;
  /** The full public projection: the compact context header is a pure
   * function of this, exactly as the full frame was. */
  page: EntryPageDTO;
  player: PlayerPageDTO;
  /** SSR render instant, ms. */
  nowMs: number;
}

/** How many other tournaments stand open before the disclosure (D3: a
 *  BOUNDED initial set, not a wall of rows). */
const HISTORY_VISIBLE = 3;

function notFound(): Response {
  return new Response('Not found', { status: 404 });
}

export async function loader({ params, request }: { params: { slug?: string; personKey?: string }; request?: Request }) {
  const rawOffset = request ? new URL(request.url).searchParams.get('history_offset') : null;
  const offset = /^\d{1,6}$/.test(rawOffset ?? '') ? Number(rawOffset) : 0;
  const { slug, personKey } = params;
  if (!slug || !personKey) throw notFound();

  try {
    const page = await apiGet<EntryPageDTO>(
      `/e/api/page/${encodeURIComponent(slug)}`,
    );
    const player = await apiGet<PlayerPageDTO>(
      `/e/api/page/${encodeURIComponent(slug)}/players/${encodeURIComponent(personKey)}?history_offset=${offset}`,
    );
    const payload: PlayerLoaderData = {
      slug: page.page.slug,
      tournamentName: page.tournament.name,
      tournamentDate: page.tournament.date,
      page,
      player,
      nowMs: demoNowMs(),
    };
    return payload;
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) throw notFound();
    throw err;
  }
}

export const meta: Route.MetaFunction = ({ data }) => {
  if (!data) return [{ title: 'Player not found' }];
  const playerName = personRefModel({
    slug: data.slug,
    identity: data.player.person.identity,
    state: data.player.person.resolution,
    label: data.player.person.label ?? 'Player',
  }).text;
  return [
    {
      title: data.tournamentName
        ? `${playerName} · ${data.tournamentName}`
        : playerName,
    },
  ];
};

/** The bare calendar day a match belongs to — the APPROVED slot day where
 * there is one, falling back to the source record's own date.
 *
 * A04: the profile grouped every card under the TOURNAMENT's start date, so
 * a card reading "Wednesday" sat under a "Tuesday" heading. A match is
 * grouped by its own day or by none at all. */
function matchDay(match: PlayerMatchDTO): string | null {
  const day = match.scheduledDate ?? match.playedOn ?? null;
  return day !== null && /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null;
}

/**
 * D12 (public-visual-fixes P3): the wire's `playedOn` is a bare calendar
 * date, and a raw `2026-07-29` in card prose is exactly the ISO leak the
 * contract forbids. One authority humanises it for both routes.
 *
 * P3: `grouped` cards drop the date entirely — the group heading above them
 * already states it, and a card repeating its own heading is the same fact
 * twice.
 */
function playerMatchCard(match: PlayerMatchDTO, grouped = false) {
  const day = matchDay(match);
  if (grouped) return { ...match, playedOn: null };
  return day ? { ...match, playedOn: formatCalendarDay(day) } : match;
}

/** Ordering key for unplayed matches: the approved day, then the approved
 * time. A match with neither sorts last rather than first — an unscheduled
 * match is not the next one. */
function slotKey(match: PlayerMatchDTO): string {
  return `${matchDay(match) ?? '9999-99-99'} ${match.scheduledTime ?? '99:99'}`;
}

/** §4.2: a court claim needs a court. */
function hasCourt(match: PlayerMatchDTO): boolean {
  return (match.court !== null && match.court !== undefined) || Boolean(match.courtLabel);
}

/**
 * A run of matches as ONE aligned list (public refinement 2026-09-12): each
 * match is a `MatchRow` whose first column names its own day and time, so
 * the played record reads down the columns — day · event and round · who ·
 * score — instead of as a stack of cards each restating the same facts in
 * prose. A match with no approved day says so in its own row (contract
 * §3.2: never guessed from the tournament's start).
 */
function MatchList({ slug, matches, personId }: { slug: string; matches: PlayerMatchDTO[]; personId: string | null }) {
  return (
    <ul className={`mt-2 min-w-0 ${LIST_CARD} [&>li:first-child]:border-t-0`}>
      {matches.map((match, index) => {
        const day = matchDay(match);
        return (
          <MatchRow
            key={index}
            match={playerMatchCard(match, true)}
            slug={slug}
            context="player"
            dayLabel={day ? formatCalendarDay(day) : 'Day to be confirmed'}
            highlightPersonId={personId}
          />
        );
      })}
    </ul>
  );
}

/** The draw this event's path belongs to, opened ON this person.
 *
 * `?player={id}` is resolved by STABLE IDENTITY in `draw.tsx` (never by a
 * name substring), and `view=path` is that route's no-JavaScript pinned-path
 * state. One href, so a profile and a draw agree on who is being followed.
 */
function eventDrawHref(slug: string, code: string, personId: string | null): string {
  const base = `/e/${encodeURIComponent(slug)}/draws/${encodeURIComponent(code)}`;
  if (!personId) return base;
  const params = new URLSearchParams({ view: 'path', player: personId });
  return `${base}?${params}`;
}

/**
 * Where this person has got to in ONE event, from the server-gated round
 * steps: the last decided step's round and outcome ("Won R16", "Lost QF"),
 * or the round they stand in while it is undecided ("In R16"). Per event
 * and only per event — a player out of the singles may still be in the
 * doubles, so no tournament-wide "eliminated" is ever derived here. Null
 * when the draw carries no steps, or results are withheld (every outcome
 * null), in which case nothing is claimed.
 */
export function eventProgress(steps: readonly PlayerDrawStepDTO[]): string | null {
  const decided = steps.filter((step) => step.outcome === 'won' || step.outcome === 'lost');
  const last = decided[decided.length - 1];
  const pending = steps.find((step) => !step.outcome);
  const short = (label: string) => roundShortLabel(label) ?? label;
  if (last && last.outcome === 'lost') return `Lost ${short(last.roundLabel)}`;
  if (pending) return `In ${short(pending.roundLabel)}`;
  if (last) return `Won ${short(last.roundLabel)}`;
  return null;
}

/** One round step as a real two-side match, so it renders through the
 * shared card anatomy instead of a hand-built sentence.
 *
 * The wire's `score` is `[mine, theirs]` — this person's side order — which
 * is exactly the positional convention `MatchCard` reads, given this
 * person's side first. `outcome` is server-gated; nothing here infers a
 * winner from the numbers. */
function stepAsMatch(
  event: PlayerEventDTO,
  step: PlayerDrawStepDTO,
  person: PersonReferenceDTO,
): PlayerMatchDTO {
  const mine = event.partner ? [person, event.partner] : [person];
  return {
    eventCode: event.code,
    roundLabel: step.roundLabel,
    reference: null,
    sides: [
      { persons: mine, placeholder: null, winner: step.outcome === 'won' },
      { persons: step.opponents, placeholder: null, winner: step.outcome === 'lost' },
    ],
    score: step.score ?? null,
    decided: Boolean(step.outcome),
    scheduledTime: null,
    court: null,
  };
}

/**
 * One event a person played.
 *
 * The row itself names the event, the discipline, the seed and the accepted
 * partner, and offers the two navigations D3 asks for: the draw, and this
 * person's path pinned inside it.
 *
 * `showPath` renders the round steps as compact two-side result rows. It is
 * ON for a foreign tournament, whose matches are not on this page in any
 * other form, and OFF for the current one, whose match cards below state the
 * same results (A03 — the profile said everything twice).
 */
function PlayerEventBlock({
  slug,
  event,
  personId,
  person,
  showPath = false,
}: {
  slug: string;
  event: PlayerEventDTO;
  personId: string | null;
  person: PersonReferenceDTO;
  showPath?: boolean;
}) {
  const steps = showPath ? event.drawPath : [];
  const progress = eventProgress(event.drawPath ?? []);
  return (
    <li className="py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className="min-w-0">
          <span className="font-medium">{eventCodeLabel(event.code)}</span>
          {/* D1: the fields are separated by SPACE, not by a middle dot. */}
          <span className={`ms-2 ${TEXT_HELPER}`}>{event.discipline}</span>
          {event.seed !== null && event.seed !== undefined ? (
            <span className={`ms-2 ${TEXT_HELPER}`}>{`Seed ${event.seed}`}</span>
          ) : null}
          {event.partner ? (
            <span className="ms-2">
              <span className={TEXT_HELPER}>{'with '}</span>
              <PersonRef
                slug={slug}
                identity={event.partner.identity}
                state={event.partner.resolution === 'dead' ? 'dead' : 'resolved'}
                label={event.partner.label}
              />
            </span>
          ) : null}
        </span>
        <span className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          {/* Progress in THIS event, from its own steps; the doubles and the
              singles each say their own. */}
          {progress ? <span className={TEXT_SECONDARY}>{progress}</span> : null}
          {/* ONE action (refinement 2026-09-12): the draw, opened on this
              person when the page knows who they are, so the tree lands
              with their path lit. The separate "View path" link said the
              same destination twice. */}
          <a href={eventDrawHref(slug, event.code, personId)} className={ACTION_LINK}>
            View draw
          </a>
        </span>
      </div>
      {steps.length > 0 ? (
        <ol className="mt-2 space-y-1.5">
          {steps.map((step, index) => (
            <li
              key={`${step.roundLabel}-${index}`}
              className="flex flex-wrap items-start gap-x-3 gap-y-1"
            >
              <span className={`min-w-[6.5em] pt-0.5 text-xs font-medium ${TEXT_SECONDARY}`}>
                {step.roundLabel}
              </span>
              <div className="min-w-0 flex-1">
                <MatchCard
                  match={stepAsMatch(event, step, person)}
                  variant="bracket-node"
                  slug={slug}
                />
              </div>
            </li>
          ))}
        </ol>
      ) : null}
    </li>
  );
}

export default function Player({ loaderData }: Route.ComponentProps) {
  const { slug, tournamentName, tournamentDate, page, player } = loaderData;
  const playerName = personRefModel({
    slug,
    identity: player.person.identity,
    state: player.person.resolution,
    label: player.person.label ?? 'Player',
  }).text;
  // The one identity value this page passes into a draw URL. Never the
  // visible name and never the raw key as display text — a query value and a
  // label are two different things (P6).
  const personId = player.person.identity?.id ?? null;

  // §2.1: a match on court is LIVE, not "coming up" — it is happening. It
  // leads the page whether or not its court is published; the card states
  // the court where there is one and claims nothing where there is not.
  const liveMatches = player.matches.filter((match) => match.status === 'live');
  const upcoming = [...player.matches]
    .filter((match) => !match.decided && match.status !== 'live')
    .sort((a, b) => slotKey(a).localeCompare(slotKey(b)));
  // D3 order item 2: the ONE match a reader came for, when nothing is on
  // court. The rest keep their own section below.
  const nextMatch = liveMatches.length === 0 ? (upcoming[0] ?? null) : null;
  const coming = nextMatch ? upcoming.slice(1) : upcoming;
  const played = player.matches.filter((match) => match.decided);
  const liveHeading = liveMatches.every(hasCourt) ? 'On court' : 'Live now';

  // Absent on a payload minted before profile v1 — an older API answers a
  // page with no history section rather than an empty one.
  const history = player.history ?? [];
  // The current tournament is the page the reader is standing on; it is not
  // repeated below as a row pointing back up at itself.
  const others = history.filter((row) => !row.current);
  const openRows = others.slice(0, HISTORY_VISIBLE);
  const foldedRows = others.slice(HISTORY_VISIBLE);

  const crumbs: Crumb[] = [
    { label: 'Tournaments', href: '/e/' },
    ...(tournamentName
      ? [{ label: tournamentName, href: tournamentBase(slug) }]
      : []),
    { label: sectionLabel('players'), href: sectionHref(slug, 'players') },
    { label: playerName, href: null },
  ];

  const historyRow = (row: (typeof others)[number]) => {
    const href = personHref(row.slug, { id: row.playerKey, name: playerName });
    const events = row.events ?? [];
    // The same human in THAT workspace: its own row, its own key. Never this
    // page's key wearing another tournament's slug.
    const rowPerson: PersonReferenceDTO = {
      identity: { id: row.playerKey, name: playerName },
      resolution: 'resolved',
      label: null,
    };
    return (
      <li key={`${row.slug}-${row.playerKey}`} className="py-3">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <span className="min-w-0">
            {href === null ? (
              <span className="font-medium text-foreground">
                {row.tournamentName ?? row.slug}
              </span>
            ) : (
              <a
                href={href}
                className="font-medium text-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                {row.tournamentName ?? row.slug}
              </a>
            )}
            {row.date ? (
              <span className={`block text-xs ${TEXT_HELPER}`}>{formatDateLong(row.date)}</span>
            ) : null}
          </span>
          {row.eventCodes.length > 0 ? (
            /* D1: the codes are a row of fields, spaced — not a
               middle-dot-joined string. */
            <span className={`flex flex-wrap gap-x-3 gap-y-0.5 text-xs ${TEXT_HELPER}`}>
              {row.eventCodes.map((code) => (
                <span key={code}>{eventCodeLabel(code)}</span>
              ))}
            </span>
          ) : null}
        </div>
        {events.length > 0 ? (
          <ul className="mt-1 divide-y divide-rule-soft border-t border-rule-soft text-sm">
            {events.map((event) => (
              <PlayerEventBlock
                key={`${row.slug}-${event.code}-${event.discipline}`}
                slug={row.slug}
                event={event}
                personId={row.playerKey}
                person={rowPerson}
                showPath
              />
            ))}
          </ul>
        ) : (
          // `expanded === false` means this row was not opened server-side,
          // NOT that the player has no record there. Saying "no matches"
          // here would be a claim the payload does not support.
          <p className={`mt-1 text-xs ${TEXT_HELPER}`}>
            {row.expanded
              ? 'No published matches at this tournament yet.'
              : 'Open this tournament to see the matches.'}
          </p>
        )}
      </li>
    );
  };

  return (
    <PlayShell>
      {/* D3: a compact CONTEXT header, not the tournament hero. The
          breadcrumb and the tab bar are the frame's own components, so
          every navigation a profile had it still has; what is gone is the
          large tournament title, chip and call to action that outranked the
          person the page is about (A03). */}
      <header className="border-b border-rule-soft bg-surface-raised">
        <div className="mx-auto w-full max-w-3xl px-4 py-5">
          <Breadcrumbs crumbs={crumbs} />
          <h1 className={`mt-2 ${PAGE_TITLE}`}>{playerName}</h1>
          <p className="mt-1 flex flex-wrap items-baseline gap-x-4 gap-y-0.5 text-sm">
            {/* Representation as the tournament published it. Nothing is
                invented here: no photo, no biography, no ranking, no
                computed record (D3). */}
            {player.club ? <span className="text-foreground">{player.club}</span> : null}
            {tournamentName ? (
              <a
                href={tournamentBase(slug)}
                className={`${TEXT_SECONDARY} underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent`}
              >
                {tournamentName}
              </a>
            ) : null}
            {tournamentDate ? (
              <span className={TEXT_HELPER}>{formatDateLong(tournamentDate)}</span>
            ) : null}
          </p>
          <div className="mt-4">
            <TabBar tabs={frameTabs(page)} active="players" />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl px-4 pb-12 pt-2">
        {liveMatches.length > 0 ? (
          <section className="mt-6 border-s-2 border-s-status-live ps-4">
            <h2 className={EYEBROW}>{liveHeading}</h2>
            <div className="mt-3 grid gap-3">
              {liveMatches.map((match, index) => (
                <MatchCard key={index} match={playerMatchCard(match)} slug={slug} />
              ))}
            </div>
          </section>
        ) : null}

        {nextMatch ? (
          <section className="mt-6">
            <h2 className={EYEBROW}>Next match</h2>
            <div className="mt-3">
              <MatchCard match={playerMatchCard(nextMatch)} slug={slug} />
            </div>
          </section>
        ) : null}

        {player.events.length > 0 ? (
          <section className="mt-6">
            <h2 className={EYEBROW}>In this tournament</h2>
            <ul className="mt-2 divide-y divide-rule-soft border-t border-rule-soft text-sm text-foreground">
              {player.events.map((event) => (
                <PlayerEventBlock
                  key={`${event.code}-${event.discipline}`}
                  slug={slug}
                  event={event}
                  personId={personId}
                  person={player.person}
                />
              ))}
            </ul>
          </section>
        ) : null}

        {player.representation ? <p className="text-sm text-muted-foreground">Representing {player.representation}</p> : null}

        {coming.length > 0 ? (
          <section className="mt-6">
            <h2 className={EYEBROW}>Coming up</h2>
            <MatchList slug={slug} matches={coming} personId={personId} />
          </section>
        ) : null}

        {played.length > 0 ? (
          <section className="mt-6">
            <h2 className={EYEBROW}>Played</h2>
            <MatchList slug={slug} matches={played} personId={personId} />
          </section>
        ) : null}

        {others.length > 0 ? (
          <section className="mt-8 border-t border-rule-soft pt-6">
            <h2 className={EYEBROW}>Other tournaments</h2>
            <ul className="mt-3 divide-y divide-rule-soft border-t border-rule-soft text-sm">
              {openRows.map(historyRow)}
            </ul>
            {foldedRows.length > 0 ? <ul className="divide-y divide-rule-soft text-sm">{foldedRows.map(historyRow)}</ul> : null}
            {player.historyNextOffset != null ? (
              <a className={ACTION_LINK} href={`?history_offset=${player.historyNextOffset}`}>More tournaments</a>
            ) : null}
          </section>
        ) : null}

        {player.matches.length === 0 ? (
          <p className="mt-6 text-sm text-muted-foreground">
            No matches to show yet. Draws and schedules appear here when the
            organizer publishes them.
          </p>
        ) : null}
      </main>
    </PlayShell>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();
  if (isRouteErrorResponse(error) && error.status === 404) {
    return (
      <MessagePage
        heading="This player page is not available"
        body="Check the link, or ask the organizer for the current one."
      />
    );
  }
  return (
    <MessagePage heading="Something went wrong" body="Please try again in a moment." />
  );
}

/**
 * `/e/{slug}/players/{personKey}` — one person's tournament (SP-P7 §3.3).
 *
 * Keyed by the opaque person id, never the name (R-P7c: two entrants who
 * share a name are two pages). The loader makes two public reads — the
 * page projection for the tournament's identity, then the player
 * projection — and inherits every gate from the API: unpublished entrants,
 * an unknown person, and a pending-only person all answer the same uniform
 * 404 upstream, so this file has one error path.
 *
 * **"Coming up" renders above "Played" — a deliberate product decision;
 * do not flip it** (§3.3, binding). Match-card scores and winner marks arrive
 * pre-gated by the published tournament projection.
 *
 * Profile v2 (P6, 2026-09-08) = **this tournament, then everywhere else**.
 * The page is two clearly separated halves: the current event's own events,
 * round steps and match cards, then an "Other tournaments" section of the
 * SAME human's other public tournaments, joined server-side
 * (`_person_history`) on either the verified entrant account that owns the
 * row or, for an imported draw-roster person, the import's declared
 * identity — this file never matches people by name and never mints a
 * person key. Each row's link is built by `personHref`, the one shared
 * link-target resolver the whole tier routes people through, so a
 * cross-tournament profile URL and an in-page name link are the same
 * decision made once. The current tournament is not repeated as a history
 * row: the reader is standing on it, and the matches above ARE it.
 *
 * A path through a draw renders as ROUND STEPS (`PlayerEventBlock`), never
 * as an arrow-joined "R32 → R16 → QF" sentence, and every event links into
 * its own draw pinned on this person.
 */
import { isRouteErrorResponse, useRouteError } from 'react-router';

import { MatchCard } from '../components/MatchCard';
import { PersonRef } from '../components/PersonRef';
import { MessagePage } from '../components/MessagePage';
import { PlayShell } from '../components/PlayShell';
import { TournamentFrame } from '../components/TournamentFrame';
import { ApiError, apiGet } from '../lib/apiFetch.server';
import { demoNowMs } from '../lib/demoClock.server';
import type { EntryPageDTO } from '../lib/entryPage.types';
import { eventCodeLabel } from '../lib/draws.types';
import { formatCalendarDay, formatDateLong } from '../lib/format';
import type { PlayerEventDTO, PlayerMatchDTO, PlayerPageDTO } from '../lib/player.types';
import { pairedScoreLine } from '../lib/score';
import { ACTION_LINK, SECTION_TITLE, TEXT_HELPER } from '../lib/ui';
import { sectionHref, sectionLabel } from '../lib/tournamentFrame';
import { personHref, personRefModel } from '../../public/assets/person-ref.js';
import type { Route } from './+types/player';

export interface PlayerLoaderData {
  slug: string;
  tournamentName: string | null;
  tournamentDate: string | null;
  /** The full public projection: a tournament-scoped player page wears the
   * SAME frame as every other tournament route (contract §11.1), and the
   * frame is a pure function of this. */
  page: EntryPageDTO;
  player: PlayerPageDTO;
  /** SSR render instant, ms. */
  nowMs: number;
}

function notFound(): Response {
  return new Response('Not found', { status: 404 });
}

export async function loader({ params }: { params: { slug?: string; personKey?: string } }) {
  const { slug, personKey } = params;
  if (!slug || !personKey) throw notFound();

  try {
    const page = await apiGet<EntryPageDTO>(
      `/e/api/page/${encodeURIComponent(slug)}`,
    );
    const player = await apiGet<PlayerPageDTO>(
      `/e/api/page/${encodeURIComponent(slug)}/players/${encodeURIComponent(personKey)}`,
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

/**
 * D12 (public-visual-fixes P3): the wire's `playedOn` is a bare calendar
 * date, and a raw `2026-07-29` in card prose is exactly the ISO leak the
 * contract forbids. `draw.tsx` already humanised it through the entrant time
 * authority; this route handed the DTO to `MatchCard` untouched, so the same
 * match read two ways on two pages. One authority, both routes.
 */
function playerMatchCard(match: PlayerMatchDTO) {
  // P7: prefer the APPROVED slot day over the source record's date — the same
  // rule `draw.tsx` applies, so a live match does not read as last Wednesday
  // on the profile while the schedule and the operator agree it is today.
  return match.playedOn
    ? { ...match, playedOn: formatCalendarDay(match.scheduledDate ?? match.playedOn) }
    : match;
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

/** One event a person played, with their path through it as ROUND STEPS.
 *
 * Replaces the arrow-joined "R32 → R16 → QF" run-on (P2 left it here
 * deliberately): each round is its own row naming the round, the opponents
 * and — where the tournament publishes results — the outcome and the score
 * from this person's side. `outcome` is server-gated; this file never infers
 * a winner from the numbers. */
function PlayerEventBlock({
  slug,
  event,
  personId,
}: {
  slug: string;
  event: PlayerEventDTO;
  personId: string | null;
}) {
  return (
    <li className="py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className="min-w-0">
          <span className="font-medium">{eventCodeLabel(event.code)}</span>
          <span className={TEXT_HELPER}>{` · ${event.discipline}`}</span>
          {event.seed !== null && event.seed !== undefined ? (
            <span className={TEXT_HELPER}> {`[${event.seed}]`}</span>
          ) : null}
          {event.partner ? (
            <>
              <span className={TEXT_HELPER}>{' with '}</span>
              <PersonRef
                slug={slug}
                identity={event.partner.identity}
                state={event.partner.resolution === 'dead' ? 'dead' : 'resolved'}
                label={event.partner.label}
              />
            </>
          ) : null}
        </span>
        <a href={eventDrawHref(slug, event.code, personId)} className={ACTION_LINK}>
          {`View ${eventCodeLabel(event.code)} draw`}
        </a>
      </div>
      {event.drawPath.length > 0 ? (
        <ol className="mt-2 space-y-1 text-xs">
          {event.drawPath.map((step, index) => {
            const score = pairedScoreLine(step.score);
            return (
              <li
                key={`${step.roundLabel}-${index}`}
                className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5"
              >
                <span className="min-w-[5.5em] font-medium text-foreground">{step.roundLabel}</span>
                <span className="min-w-0 text-foreground">
                  <span className={TEXT_HELPER}>{'v '}</span>
                  {step.opponents.map((opponent, opponentIndex) => (
                    <span key={`${opponent.identity?.id ?? opponent.label ?? opponentIndex}`}>
                      {opponentIndex > 0 ? <span className={TEXT_HELPER}>{' / '}</span> : null}
                      <PersonRef
                        slug={slug}
                        identity={opponent.identity}
                        state={opponent.resolution}
                        label={opponent.label}
                      />
                    </span>
                  ))}
                </span>
                {step.outcome ? (
                  <span className="font-semibold text-foreground">
                    {step.outcome === 'won' ? 'Won' : 'Lost'}
                  </span>
                ) : null}
                {score ? <span className={TEXT_HELPER}>{score}</span> : null}
              </li>
            );
          })}
        </ol>
      ) : null}
    </li>
  );
}

export default function Player({ loaderData }: Route.ComponentProps) {
  const { slug, tournamentDate, page, player, nowMs } = loaderData;
  const coming = player.matches.filter((match) => !match.decided);
  const played = player.matches.filter((match) => match.decided);
  // §4.2 (P3): "On court now" is a claim about a COURT. A live record with
  // no approved court cannot support it — the strip is omitted rather than
  // rendered with the court silently missing from its own sentence.
  const liveMatch = player.matches.find(
    (match) =>
      match.status === 'live' &&
      (match.courtLabel !== null && match.courtLabel !== undefined ? true : match.court !== null),
  );
  const playerName = personRefModel({
    slug,
    identity: player.person.identity,
    state: player.person.resolution,
    label: player.person.label ?? 'Player',
  }).text;
  // Absent on a payload minted before profile v1 — an older API answers a
  // page with no history section rather than an empty one.
  const history = player.history ?? [];
  const current = history.find((row) => row.current) ?? null;
  // The one identity value this page passes into a draw URL. Never the
  // visible name and never the raw key as display text — a query value and a
  // label are two different things (P6).
  const personId = player.person.identity?.id ?? null;

  return (
    <PlayShell>
      {/* Contract §11: the tournament-scoped player page is a tournament
          route, so it keeps the tournament hero, the tab bar with Players
          current, and a breadcrumb back through Players. The floating
          "← Tournament page" link it used to lead with is gone. */}
      <TournamentFrame
        page={page}
        nowMs={nowMs}
        active="players"
        trail={[
          { label: sectionLabel('players'), href: sectionHref(slug, 'players') },
          { label: playerName, href: null },
        ]}
      />
      <section className="border-b border-rule-soft bg-surface-raised">
        <div className="mx-auto w-full max-w-3xl px-4 py-5">
          <h2 className={SECTION_TITLE}>
            <PersonRef
              slug={slug}
              identity={player.person.identity}
              state={player.person.resolution}
              label={player.person.label}
              current
            />
          </h2>
          {player.club ? <p className="mt-1 text-sm text-muted-foreground">{player.club}</p> : null}
          {liveMatch ? (
            <div className="mt-4 border-s-2 border-s-status-live ps-4">
              <p className="text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">On court now</p>
              <p className="mt-1 text-sm text-foreground">
                {[eventCodeLabel(liveMatch.eventCode), liveMatch.roundLabel, liveMatch.courtLabel ?? (liveMatch.court !== null ? `Court ${liveMatch.court}` : null)].filter(Boolean).join(' · ')}
              </p>
            </div>
          ) : null}
          {player.events.length > 0 ? (
            <ul className="mt-4 divide-y divide-rule-soft border-t border-rule-soft text-sm text-foreground">
              {player.events.map((event) => (
                <PlayerEventBlock
                  key={`${event.code}-${event.discipline}`}
                  slug={slug}
                  event={event}
                  personId={personId}
                />
              ))}
            </ul>
          ) : null}
        </div>
      </section>

      <main className="mx-auto w-full max-w-3xl px-4 pb-12 pt-2">
        {coming.length > 0 ? (
          <section className="mt-6">
            <h2 className="text-xs font-bold uppercase tracking-[0.06em] text-muted-foreground">
              Coming up
            </h2>
            {tournamentDate ? (
              <p className="mt-0.5 text-xs text-muted-foreground">
                {formatDateLong(tournamentDate)}
              </p>
            ) : null}
            <div className="mt-3 grid gap-3">
              {coming.map((match, index) => (
                <MatchCard key={index} match={playerMatchCard(match)} slug={slug} />
              ))}
            </div>
          </section>
        ) : null}

        {played.length > 0 ? (
          <section className="mt-6">
            <h2 className="text-xs font-bold uppercase tracking-[0.06em] text-muted-foreground">
              Played
            </h2>
            <div className="mt-3 grid gap-3">
              {played.map((match, index) => (
                <MatchCard key={index} match={playerMatchCard(match)} slug={slug} />
              ))}
            </div>
          </section>
        ) : null}

        {history.length > 0 ? (
          <section className="mt-8 border-t border-rule-soft pt-6">
            <h2 className="text-xs font-bold uppercase tracking-[0.06em] text-muted-foreground">
              Tournament history
            </h2>
            <p className={`mt-1 text-xs ${TEXT_HELPER}`}>
              {current?.tournamentName
                ? `The matches above are ${current.tournamentName}. This is the same player across every published tournament.`
                : 'The same player across every published tournament.'}
            </p>
            <ul className="mt-3 divide-y divide-rule-soft border-t border-rule-soft text-sm">
              {history.map((row) => {
                const href = row.current
                  ? null
                  : personHref(row.slug, { id: row.playerKey, name: playerName });
                const events = row.events ?? [];
                return (
                  <li key={`${row.slug}-${row.playerKey}`} className="py-3">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                      <span className="min-w-0">
                        {/* The current tournament is the page the reader is
                            already on: named, marked, and deliberately not a
                            link back to itself — the same rule the breadcrumb
                            trail's last segment follows. */}
                        {href === null ? (
                          <span
                            className="font-medium text-foreground"
                            aria-current={row.current ? 'page' : undefined}
                          >
                            {row.tournamentName ?? row.slug}
                          </span>
                        ) : (
                          <a href={href} className="font-medium text-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
                            {row.tournamentName ?? row.slug}
                          </a>
                        )}
                        {row.date ? (
                          <span className={`block text-xs ${TEXT_HELPER}`}>{formatDateLong(row.date)}</span>
                        ) : null}
                      </span>
                      {row.eventCodes.length > 0 ? (
                        <span className={`text-xs ${TEXT_HELPER}`}>
                          {row.eventCodes.map(eventCodeLabel).join(' · ')}
                        </span>
                      ) : null}
                    </div>
                    {row.current ? (
                      <p className={`mt-1 text-xs ${TEXT_HELPER}`}>
                        Shown above.
                      </p>
                    ) : events.length > 0 ? (
                      <ul className="mt-1 divide-y divide-rule-soft border-t border-rule-soft">
                        {events.map((event) => (
                          <PlayerEventBlock
                            key={`${row.slug}-${event.code}-${event.discipline}`}
                            slug={row.slug}
                            event={event}
                            personId={row.playerKey}
                          />
                        ))}
                      </ul>
                    ) : (
                      // `expanded === false` means this row was not opened
                      // server-side, NOT that the player has no record there.
                      // Saying "no matches" here would be a claim the payload
                      // does not support.
                      <p className={`mt-1 text-xs ${TEXT_HELPER}`}>
                        {row.expanded
                          ? 'No published matches at this tournament yet.'
                          : 'Open this tournament to see the matches.'}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
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
